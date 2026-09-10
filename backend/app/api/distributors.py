"""
Router: /distributors
Gerenciamento de credenciais de distribuidores por seller (acesso MASTER).
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime

from app.db.session import get_db
from app.models.distributor import DistributorCredential
from app.models.company import Company
from app.core.dependencies import get_current_user
from app.models.user import User

router = APIRouter()

# ──────────────────────────────────────────────────────────────────────────────
# SCHEMAS
# ──────────────────────────────────────────────────────────────────────────────

class DistributorOut(BaseModel):
    id: int
    company_id: int
    slug: str
    name: str
    enabled: bool
    base_url: Optional[str] = None
    username: Optional[str] = None
    # Nunca expõe password/api_key em texto plano — apenas informa se está configurado
    has_password: bool = False
    has_api_key: bool  = False
    token_configured: bool = False
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class DistributorUpsert(BaseModel):
    slug: str
    name: str
    enabled: bool = False
    base_url: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None    # None = não altera
    api_key:  Optional[str] = None    # None = não altera
    extra_config: Optional[dict] = None


class DistributorToggle(BaseModel):
    enabled: bool


# ──────────────────────────────────────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────────────────────────────────────

def _require_master(current_user: User):
    """Restringe endpoint apenas a usuários MASTER."""
    if current_user.type != "MASTER":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso restrito ao Master.")


def _to_out(d: DistributorCredential) -> DistributorOut:
    return DistributorOut(
        id=d.id,
        company_id=d.company_id,
        slug=d.slug,
        name=d.name,
        enabled=d.enabled,
        base_url=d.base_url,
        username=d.username,
        has_password=bool(d.password),
        has_api_key=bool(d.api_key),
        token_configured=bool(d.token),
        created_at=d.created_at,
        updated_at=d.updated_at,
    )


# ──────────────────────────────────────────────────────────────────────────────
# ENDPOINTS
# ──────────────────────────────────────────────────────────────────────────────

@router.get("/companies/{company_id}/distributors", response_model=List[DistributorOut])
def list_distributors(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista todos os distribuidores configurados para um seller (MASTER only)."""
    _require_master(current_user)

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    rows = (
        db.query(DistributorCredential)
        .filter(DistributorCredential.company_id == company_id)
        .order_by(DistributorCredential.slug)
        .all()
    )
    return [_to_out(r) for r in rows]


@router.put("/companies/{company_id}/distributors/{slug}", response_model=DistributorOut)
def upsert_distributor(
    company_id: int,
    slug: str,
    payload: DistributorUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Cria ou atualiza as credenciais de um distribuidor para um seller.
    Campos `password` e `api_key` com valor None são ignorados (não apagam o valor existente).
    """
    _require_master(current_user)

    if payload.slug != slug:
        raise HTTPException(status_code=400, detail="slug no body deve coincidir com o da URL.")

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    row = (
        db.query(DistributorCredential)
        .filter(
            DistributorCredential.company_id == company_id,
            DistributorCredential.slug == slug,
        )
        .first()
    )

    if not row:
        row = DistributorCredential(company_id=company_id, slug=slug)
        db.add(row)

    row.name         = payload.name
    row.enabled      = payload.enabled
    row.base_url     = payload.base_url or row.base_url
    row.username     = payload.username if payload.username is not None else row.username
    row.extra_config = payload.extra_config if payload.extra_config is not None else row.extra_config

    # Só atualiza credenciais sensíveis se forem enviadas (não None)
    if payload.password is not None:
        row.password = payload.password
        row.token    = None          # Invalida token cacheado ao trocar senha
        row.token_expires = None

    if payload.api_key is not None:
        row.api_key = payload.api_key

    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.patch("/companies/{company_id}/distributors/{slug}/toggle", response_model=DistributorOut)
def toggle_distributor(
    company_id: int,
    slug: str,
    payload: DistributorToggle,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Habilita ou desabilita um distribuidor sem alterar credenciais."""
    _require_master(current_user)

    row = (
        db.query(DistributorCredential)
        .filter(
            DistributorCredential.company_id == company_id,
            DistributorCredential.slug == slug,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Distribuidor não configurado.")

    row.enabled = payload.enabled
    db.commit()
    db.refresh(row)
    return _to_out(row)


@router.delete("/companies/{company_id}/distributors/{slug}", status_code=204)
def delete_distributor(
    company_id: int,
    slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Remove as credenciais de um distribuidor para um seller (MASTER only)."""
    _require_master(current_user)

    row = (
        db.query(DistributorCredential)
        .filter(
            DistributorCredential.company_id == company_id,
            DistributorCredential.slug == slug,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Distribuidor não encontrado.")

    db.delete(row)
    db.commit()


@router.post("/companies/{company_id}/distributors/{slug}/test", status_code=200)
async def test_distributor_connection(
    company_id: int,
    slug: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Testa a conexão com o distribuidor (autenticação apenas para Catavento).
    Para Disal, faz um GET de teste com EAN genérico para validar o token.
    """
    _require_master(current_user)

    row = (
        db.query(DistributorCredential)
        .filter(
            DistributorCredential.company_id == company_id,
            DistributorCredential.slug == slug,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Distribuidor não configurado.")

    if slug == "catavento":
        from app.integrators.catavento_client import CataventoClient
        client = CataventoClient(
            base_url=row.base_url or "",
            username=row.username or "",
            password=row.password or "",
            token=row.token,
            token_expires=row.token_expires,
        )
        ok = await client.authenticate()
        if ok and client.token_renewed:
            row.token        = client.new_token
            row.token_expires = client.token_expires
            db.commit()
        return {"ok": ok, "message": "Autenticado com sucesso!" if ok else "Falha na autenticação. Verifique usuário e senha."}

    elif slug == "disal":
        from app.integrators.disal_client import DisalClient
        if not row.api_key:
            return {"ok": False, "message": "API Key não configurada."}
        client = DisalClient(base_url=row.base_url or "", api_key=row.api_key)
        # Testa com ISBN genérico (13 dígitos zeros — retornará not found mas valida o token)
        result = await client.get_stock_by_isbn("0000000000000")
        if result.get("error") and "401" in (result.get("error") or ""):
            return {"ok": False, "message": "Token inválido (401 Unauthorized)."}
        return {"ok": True, "message": "Conexão com a Disal estabelecida com sucesso."}

    else:
        return {"ok": False, "message": f"Distribuidor '{slug}' sem teste de conexão implementado."}
