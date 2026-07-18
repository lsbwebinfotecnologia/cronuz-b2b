"""
sefaz_download.py
==================
Router FastAPI para:
  - CRUD de Empresas/Filiais SEFAZ (SellerBranch com campos SEFAZ)
  - Upload de certificado .pfx por filial
  - Download de XMLs NF-e / NFC-e da SEFAZ-SP por período → retorna .zip
"""

import base64
import io
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.seller_branch import SellerBranch
from app.schemas.seller_branch import (
    SellerBranchCreate,
    SellerBranchResponse,
    SellerBranchUpdate,
)
from app.integrators.sefaz_sp_service import download_xmls_sefaz, SefazConsumoIndevidoError
from app.integrators.sefaz_chave_service import (
    download_xmls_por_chave,
    parse_chave_acesso,
)

router = APIRouter(prefix="/sefaz", tags=["SEFAZ SP"])


# ─────────────────────────────────────────────────────────────────────────────
# CRUD — Empresas / Filiais SEFAZ
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/branches", response_model=List[SellerBranchResponse])
def list_branches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista todas as empresas/filiais SEFAZ configuradas para o seller."""
    branches = (
        db.query(SellerBranch)
        .filter(SellerBranch.company_id == current_user.company_id)
        .order_by(SellerBranch.nome)
        .all()
    )
    # Mapeia has_sefaz_cert sem expor o conteúdo
    result = []
    for b in branches:
        r = SellerBranchResponse.model_validate(b)
        r.has_sefaz_cert = bool(b.sefaz_cert_content)
        result.append(r)
    return result


@router.post("/branches", response_model=SellerBranchResponse, status_code=201)
def create_branch(
    payload: SellerBranchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cria uma nova empresa/filial SEFAZ para o seller."""
    branch = SellerBranch(
        company_id=current_user.company_id,
        nome=payload.nome,
        cnpj=payload.cnpj,
        cod_empresa=payload.cod_empresa,
        cod_filial=payload.cod_filial,
        active=payload.active,
        sefaz_environment=payload.sefaz_environment,
        uf=payload.uf,
        sefaz_cert_password=payload.sefaz_cert_password,
        cod_local_estoque=payload.cod_local_estoque or [],
    )
    db.add(branch)
    db.commit()
    db.refresh(branch)

    r = SellerBranchResponse.model_validate(branch)
    r.has_sefaz_cert = bool(branch.sefaz_cert_content)
    return r


@router.get("/branches/{branch_id}", response_model=SellerBranchResponse)
def get_branch(
    branch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    branch = _get_branch_or_404(db, branch_id, current_user.company_id)
    r = SellerBranchResponse.model_validate(branch)
    r.has_sefaz_cert = bool(branch.sefaz_cert_content)
    return r


@router.put("/branches/{branch_id}", response_model=SellerBranchResponse)
def update_branch(
    branch_id: int,
    payload: SellerBranchUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    branch = _get_branch_or_404(db, branch_id, current_user.company_id)
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(branch, key, value)
    db.commit()
    db.refresh(branch)

    r = SellerBranchResponse.model_validate(branch)
    r.has_sefaz_cert = bool(branch.sefaz_cert_content)
    return r


@router.delete("/branches/{branch_id}", status_code=204)
def delete_branch(
    branch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    branch = _get_branch_or_404(db, branch_id, current_user.company_id)
    db.delete(branch)
    db.commit()


# ─────────────────────────────────────────────────────────────────────────────
# Upload do Certificado .pfx por Filial
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/branches/{branch_id}/upload-cert", response_model=SellerBranchResponse)
async def upload_cert(
    branch_id: int,
    file: UploadFile = File(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Faz upload do certificado .pfx para a filial.
    O conteúdo é convertido para base64 e armazenado no banco de dados.
    Nenhum arquivo físico é persistido.
    """
    branch = _get_branch_or_404(db, branch_id, current_user.company_id)

    if not file.filename or not file.filename.lower().endswith(".pfx"):
        raise HTTPException(status_code=400, detail="Apenas arquivos .pfx são aceitos.")

    # Valida que o certificado pode ser lido com a senha informada
    pfx_bytes = await file.read()
    try:
        from cryptography.hazmat.primitives.serialization import pkcs12
        pkcs12.load_key_and_certificates(pfx_bytes, password.encode())
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Certificado inválido ou senha incorreta: {str(e)}"
        )

    # Armazena em base64 no banco (nunca em arquivo físico)
    branch.sefaz_cert_content = base64.b64encode(pfx_bytes).decode("utf-8")
    branch.sefaz_cert_password = password
    db.commit()
    db.refresh(branch)

    r = SellerBranchResponse.model_validate(branch)
    r.has_sefaz_cert = True
    return r


@router.delete("/branches/{branch_id}/cert", response_model=SellerBranchResponse)
def remove_cert(
    branch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove o certificado digital da filial."""
    branch = _get_branch_or_404(db, branch_id, current_user.company_id)
    branch.sefaz_cert_content = None
    branch.sefaz_cert_password = None
    db.commit()
    db.refresh(branch)

    r = SellerBranchResponse.model_validate(branch)
    r.has_sefaz_cert = False
    return r


# ─────────────────────────────────────────────────────────────────────────────
# Reset NSU — Zera o ponteiro de paginação para nova varredura completa
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/branches/{branch_id}/reset-nsu", response_model=SellerBranchResponse)
def reset_nsu(
    branch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Reseta o último NSU da filial para '0', forçando a próxima consulta
    à SEFAZ a varrer todos os documentos desde o início.

    ⚠️  Use com cuidado: uma nova consulta a partir do zero pode retornar
    um volume muito grande de documentos e está sujeita ao bloqueio cStat=656
    se feita repetidamente em menos de 1 hora.
    """
    branch = _get_branch_or_404(db, branch_id, current_user.company_id)
    branch.sefaz_ultimo_nsu = "0"
    db.commit()
    db.refresh(branch)

    r = SellerBranchResponse.model_validate(branch)
    r.has_sefaz_cert = bool(branch.sefaz_cert_content)
    return r


# ─────────────────────────────────────────────────────────────────────────────
# Download de XMLs — Endpoint Principal
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/download-xml")
def download_xml(
    branch_id: int = Query(..., description="ID da filial SEFAZ configurada"),
    data_inicio: date = Query(..., description="Data de início do período (YYYY-MM-DD)"),
    data_fim: date = Query(..., description="Data de fim do período (YYYY-MM-DD)"),
    modelos: List[str] = Query(
        default=["55", "65"],
        description="Modelos de documento: 55=NF-e, 65=NFC-e"
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Baixa os XMLs de NF-e e/ou NFC-e da SEFAZ-SP para a filial informada,
    no período especificado. Retorna um arquivo .zip com os XMLs.

    - Inclui documentos AUTORIZADOS e CANCELADOS (eventos de cancelamento)
    - Paginação automática via NSU
    - Período máximo: 100 dias retroativos (limitação SEFAZ)
    """
    # Validações de período
    if data_inicio > data_fim:
        raise HTTPException(status_code=400, detail="Data de início deve ser anterior à data de fim.")

    delta = (data_fim - data_inicio).days
    if delta > 100:
        raise HTTPException(
            status_code=400,
            detail="O período máximo permitido pela SEFAZ é de 100 dias."
        )

    modelos_validos = {"55", "65"}
    for m in modelos:
        if m not in modelos_validos:
            raise HTTPException(status_code=400, detail=f"Modelo inválido: {m}. Use '55' (NF-e) ou '65' (NFC-e).")

    branch = _get_branch_or_404(db, branch_id, current_user.company_id)

    if not branch.sefaz_cert_content:
        raise HTTPException(
            status_code=422,
            detail="Certificado digital não configurado para esta filial. "
                   "Faça o upload do certificado .pfx nas configurações."
        )

    if not branch.cnpj:
        raise HTTPException(
            status_code=422,
            detail="CNPJ não informado na filial. Configure o CNPJ antes de consultar."
        )

    cnpj_limpo = "".join(filter(str.isdigit, branch.cnpj))
    if len(cnpj_limpo) != 14:
        raise HTTPException(status_code=422, detail="CNPJ da filial inválido.")

    try:
        zip_bytes, total, nsu_final = download_xmls_sefaz(
            cnpj=cnpj_limpo,
            pfx_base64=branch.sefaz_cert_content,
            cert_password=branch.sefaz_cert_password or "",
            ambiente=branch.sefaz_environment,
            data_inicio=data_inicio,
            data_fim=data_fim,
            modelos=modelos,
            uf=branch.uf or "SP",
            ultimo_nsu_inicial=branch.sefaz_ultimo_nsu or "0",
        )
        # Persiste o NSU final para a próxima consulta
        branch.sefaz_ultimo_nsu = nsu_final
        db.commit()

    except SefazConsumoIndevidoError as e:
        # Só persiste o NSU retornado se for maior que zero (SEFAZ pode retornar 0 no 656)
        nsu_656 = e.ultimo_nsu.lstrip('0') or '0'
        if nsu_656 != '0':
            branch.sefaz_ultimo_nsu = e.ultimo_nsu
            db.commit()
        raise HTTPException(
            status_code=429,
            detail=(
                "⏳ A SEFAZ bloqueou temporariamente por excesso de consultas (cStat=656). "
                "Aguarde 1 hora e tente novamente. "
                "O sistema retomará automaticamente de onde parou na próxima consulta."
            )
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=f"Erro ao consultar SEFAZ: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro interno ao processar XMLs: {str(e)}")

    # Nomeia o arquivo ZIP com CNPJ + período
    nome_zip = (
        f"xmls_{cnpj_limpo}_{data_inicio.strftime('%Y%m%d')}"
        f"_a_{data_fim.strftime('%Y%m%d')}.zip"
    )

    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{nome_zip}"',
            "X-Total-XMLs": str(total),
        },
    )


# ─────────────────────────────────────────────────────────────────────────────
# Helper
# ─────────────────────────────────────────────────────────────────────────────

def _get_branch_or_404(db: Session, branch_id: int, company_id: int) -> SellerBranch:
    branch = (
        db.query(SellerBranch)
        .filter(SellerBranch.id == branch_id, SellerBranch.company_id == company_id)
        .first()
    )
    if not branch:
        raise HTTPException(status_code=404, detail="Filial não encontrada.")
    return branch


# ─────────────────────────────────────────────────────────────────────────────
# Consulta por Chave de Acesso (NFeConsultaProtocolo4)
# ─────────────────────────────────────────────────────────────────────────────

class ConsultaChaveRequest(object):
    pass

from pydantic import BaseModel

class ConsultaChaveBody(BaseModel):
    branch_id: int
    chaves: List[str]  # lista de chaves de acesso (44 dígitos, com ou sem formatação)


@router.post("/consulta-chave")
def consulta_por_chave(
    body: ConsultaChaveBody,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Consulta NF-e / NFC-e pela chave de acesso (44 dígitos) via NFeConsultaProtocolo4.
    Aceita uma lista de chaves — retorna .zip com os XMLs encontrados.

    Funciona para QUALQUER estado: o endpoint é determinado pelo cUF embutido na chave.
    Ideal para baixar NFC-e emitidas (que não passam pelo serviço de distribuição nacional).
    """
    if not body.chaves:
        raise HTTPException(status_code=400, detail="Informe ao menos uma chave de acesso.")

    if len(body.chaves) > 50:
        raise HTTPException(status_code=400, detail="Máximo de 50 chaves por consulta.")

    branch = _get_branch_or_404(db, body.branch_id, current_user.company_id)

    if not branch.sefaz_cert_content:
        raise HTTPException(
            status_code=422,
            detail="Certificado digital não configurado para esta filial."
        )

    # Valida todas as chaves antes de chamar SEFAZ
    chaves_validas = []
    erros_formato = []
    for raw in body.chaves:
        try:
            info = parse_chave_acesso(raw)
            chaves_validas.append(info["chave"])
        except ValueError as e:
            erros_formato.append({"chave": raw, "motivo": str(e)})

    if not chaves_validas:
        raise HTTPException(
            status_code=422,
            detail=f"Nenhuma chave válida. Erros: {erros_formato}"
        )

    try:
        zip_bytes, total, erros = download_xmls_por_chave(
            chaves=chaves_validas,
            pfx_base64=branch.sefaz_cert_content,
            cert_password=branch.sefaz_cert_password or "",
            ambiente=branch.sefaz_environment,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erro ao consultar SEFAZ: {str(e)}")

    return StreamingResponse(
        io.BytesIO(zip_bytes),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="xmls_chave.zip"',
            "X-Total-XMLs": str(total),
            "X-Erros": str(len(erros_formato) + len(erros)),
            "X-Erros-Formato": str(len(erros_formato)),
        },
    )
