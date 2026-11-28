"""
backend/app/api/horus_purchases.py
----------------------------------
Módulo Horus Direct -> Compras & Reposição Multi-Filial (/horus-direct/compras).
Totalmente isolado do DBM exclusivo da EO Editora (Olhares).

Funcionalidades e Regras de Negócio:
1. Seleção de Filial (/logistics/branches) + Parametrização operacional e template de e-mail por filial.
2. Busca de Fornecedor na filial selecionada (FORNECEDORES_GERAL) + Dossiê 360° do Fornecedor:
   - Últimas Entradas de Compra (NF_ENTRADA CFOPs 1101/1102/2101/2102/3102/1401/2401/1403/2403)
   - Consignação Recebida & Saldo Consignado na Filial (CFOPs 1917/2917 + SALDO_CONSIGNADO_RECEBIDO)
   - Acertos de Consignação (CFOPs 1113/2113/1114/2114)
   - Devoluções ao Fornecedor (NF_MESTRE STA_CLI='F' CFOPs 5201/5202/6201/6202/5918/6918/5919/6919)
   - Últimos Pedidos de Compra no Horus (PEDIDOS_COMPRA)
3. Governança obrigatória no Cronuz (pur_horus_supplier_discount):
   - Tabela com CNPJ Fornecedor, Filial, Cód. Grupo/Fornecedor, Cód./Nome Editora (Selo) e Desconto (%).
   - Bloqueia geração de pedido se o fornecedor não tiver selos/editoras e descontos configurados na filial.
   - Permite vincular múltiplos selos/editoras de uma só vez ou importar base inicial de EDITORAS_FORNEC.
4. Conciliação Inteligente de Editora/Selo (Cronuz B2B <-> Horus SQL Server):
   - Permite atualizar a Editora (COD_EDITORA) de 1 ou múltiplos itens simultaneamente em ITENS_ESTOQUE_GERAL
     no Horus SQL e em prd_product no Cronuz B2B (usando apenas editoras oficiais já existentes em EDITORA no Horus,
     NUNCA cadastrando editoras/produtos novos no Horus pelo Cronuz).
5. Pesquisa de Itens por Filial + Importação de Planilha (.xlsx/.csv <= 10 MB ou colagem ISBN + Quantidade):
   - Traz Estoque Disponível, Físico, Consignado Recebido/Enviado, Estoque Mínimo, Vendas, Última Entrada e Desconto.
   - Alerta itens cuja editora não esteja configurada para o fornecedor naquela filial.
6. Geração Segura em PEDIDOS_COMPRA + ITENS_PEDIDO_COMPRA no Horus SQL:
   - Nasce como 'AP' (Aprovado, STA_APROVACAO='S') no Horus e 'APPROVED' no Cronuz.
   - Exportação Excel (ISBN, Título, Editora, Quantidade, Preço Capa, Desconto %, Preço Líquido) com opção de
     transicionar para 'AE' (Aguardando Entrega) no Horus e 'AWAITING_DELIVERY' no Cronuz, mantendo log completo
     de usuário e data/hora de todas as ações.
"""

import csv
import io
import logging
import re
import xml.etree.ElementTree as ET
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user
from app.core.horus_sql_crypto import decrypt_sql_credential
from app.core.utils import parse_host_port
from app.db.session import get_db
from app.integrators.horus_sql_client import HorusSQLClient, HorusSQLConfigError
from app.api.horus_analise_itens import (
    _build_sargable_cfop_in,
    _load_configured_branches,
    _resolve_seller_id,
)
from app.models.catalog_support import Brand
from app.models.company_settings import CompanySettings
from app.models.horus_purchase import (
    HorusPublisherReconciliationLog,
    HorusPurchaseBranchConfig,
    HorusPurchaseOrder,
    HorusPurchaseOrderItem,
    HorusPurchaseOrderLog,
    HorusPurchaseXmlAudit,
    HorusPurchaseXmlAuditItem,
    HorusSupplierPublisherDiscount,
)
from app.models.product import Product
from app.models.seller_branch import ProductBranchMinStock
from app.models.user import User

router = APIRouter(prefix="/horus-purchases", tags=["horus-purchases"])
log = logging.getLogger(__name__)

MAX_PURCHASE_SHEET_BYTES = 10 * 1024 * 1024  # 10 MB (Regra Mandatória AGENTS.md Seção 1)
MAX_PURCHASE_XML_BYTES = 10 * 1024 * 1024    # 10 MB para documentos fiscais XML (AGENTS.md Seção 1.3)
UPLOADS_ROOT = Path(__file__).resolve().parents[3] / "uploads"

# ── Conjuntos SARGables de CFOPs para Dossiê 360° do Fornecedor ───────────────
SARGABLE_CFOP_COMPRA = _build_sargable_cfop_in((
    "1101", "1102", "2101", "2102", "3101", "3102",
    "1401", "1403", "2401", "2403", "1120", "2120",
))
SARGABLE_CFOP_CONSIG_REC = _build_sargable_cfop_in(("1917", "2917"))
SARGABLE_CFOP_ACERTO_CONSIG = _build_sargable_cfop_in(("1113", "2113", "1114", "2114"))
SARGABLE_CFOP_DEVOL_FORNEC = _build_sargable_cfop_in((
    "5201", "5202", "6201", "6202", "5411", "6411",
    "5918", "6918", "5919", "6919",
))

HORUS_TO_CRONUZ_STATUS = {
    "AB": "OPEN",
    "AP": "APPROVED",
    "IP": "APPROVED",
    "AE": "AWAITING_DELIVERY",
    "AC": "IN_CONFERENCE",
    "PT": "IN_CONFERENCE",
    "EE": "COMPLETED",
    "FE": "COMPLETED",
    "CA": "CANCELLED",
}

HORUS_STATUS_LABELS = {
    "AB": "Em Digitação (AB)",
    "AP": "Aprovado (AP)",
    "IP": "Aprovado Parcial (IP)",
    "AE": "Aguardando Entrega (AE)",
    "AC": "Em Conferência (AC)",
    "PT": "Em Conferência (PT)",
    "EE": "Finalizado (EE)",
    "FE": "Finalizado (FE)",
    "CA": "Cancelado (CA)",
}

XML_DECISION_LABELS = {
    "NONE": "Sem XML",
    "PENDING_REVIEW": "Em Análise (Divergência)",
    "XML_OK": "XML OK",
    "ACCEPTED_WITH_DIVERGENCE": "XML Aceito c/ Divergência",
    "REJECTED": "XML Recusado",
}

XML_DECISION_TO_ORDER_STATUS = {
    "PENDING_REVIEW": "XML_DIVERGENT",
    "XML_OK": "XML_OK",
    "ACCEPTED_WITH_DIVERGENCE": "XML_ACCEPTED_DIV",
    "REJECTED": "XML_REJECTED",
}


# ── Helpers de Usuário, Formatação UPPERCASE e Conexão Transacional Horus ─────

def _user_meta(current_user: Any) -> Tuple[Optional[int], str, str]:
    """Retorna (user_id, display_name, horus_nom_usuario_upper_20chars)."""
    uid = None
    name = "SISTEMA"
    email = ""
    if isinstance(current_user, dict):
        uid = current_user.get("id")
        name = str(current_user.get("name") or current_user.get("email") or "USUARIO").strip()
        email = str(current_user.get("email") or "").strip()
    else:
        uid = getattr(current_user, "id", None)
        name = str(getattr(current_user, "name", None) or getattr(current_user, "email", None) or "USUARIO").strip()
        email = str(getattr(current_user, "email", None) or "").strip()

    raw_login = email.split("@")[0] if "@" in email else name
    clean_horus_user = re.sub(r"[^A-Z0-9_.\- ]", "", raw_login.upper()).strip() or "CRONUZ"
    return (int(uid) if uid else None, name[:150], clean_horus_user[:20])


def _clean_digits(val: Optional[str]) -> str:
    return re.sub(r"\D", "", str(val or ""))


def _clean_isbn(val: Optional[str]) -> str:
    return "".join(ch for ch in str(val or "").strip() if ch.isdigit() or ch.upper() == "X")


def _to_upper_horus(val: Optional[str], max_len: Optional[int] = None) -> str:
    """Regra 11 AGENTS.md: Todo dado textual enviado ao Horus em CAIXA ALTA."""
    s = str(val or "").strip().upper()
    return s[:max_len] if max_len else s


def _get_branch_or_404(db: Session, seller_id: int, branch_id: int) -> Dict[str, Any]:
    branches = _load_configured_branches(db, seller_id)
    for b in branches:
        if int(b["id"]) == int(branch_id):
            return b
    raise HTTPException(status_code=404, detail="Filial selecionada não encontrada ou inativa.")


def _open_horus_tx_connection(db: Session, seller_id: int):
    """
    Abre conexão transacional dedicada (autocommit=False) com o SQL Server do Horus
    para operações seguras de escrita (INSERT PEDIDOS_COMPRA / UPDATE COD_EDITORA).
    """
    import pytds

    settings = db.query(CompanySettings).filter(CompanySettings.company_id == seller_id).first()
    if not settings or not settings.horus_sql_enabled:
        raise HTTPException(status_code=400, detail="Horus SQL Direct não está habilitado para esta empresa.")
    if not all([settings.horus_sql_host, settings.horus_sql_database, settings.horus_sql_username, settings.horus_sql_password]):
        raise HTTPException(status_code=400, detail="Credenciais do Horus SQL Direct incompletas.")

    host, port = parse_host_port(settings.horus_sql_host.strip(), (settings.horus_sql_port or "1433").strip())
    database = settings.horus_sql_database.strip()
    username = settings.horus_sql_username.strip()
    password = decrypt_sql_credential(settings.horus_sql_password)
    if not password:
        raise HTTPException(status_code=400, detail="Falha ao descriptografar credencial do Horus SQL.")

    try:
        try:
            conn = pytds.connect(
                server=host,
                port=port,
                user=username,
                password=password,
                database=database,
                login_timeout=15,
                timeout=90,
                autocommit=False,
                as_dict=True,
            )
        except Exception as login_err:
            if username.lower() != "sa" and ("Falha de logon" in str(login_err) or "Login failed" in str(login_err)):
                conn = pytds.connect(
                    server=host,
                    port=port,
                    user="sa",
                    password=password,
                    database=database,
                    login_timeout=15,
                    timeout=90,
                    autocommit=False,
                    as_dict=True,
                )
            else:
                raise
        return conn
    finally:
        password = ""


def _fmt_dt(val: Any) -> Optional[str]:
    if val is None:
        return None
    if hasattr(val, "isoformat"):
        return val.isoformat()
    return str(val)


# ── Schemas Pydantic ──────────────────────────────────────────────────────────

class BranchPurchaseConfigPayload(BaseModel):
    company_id: Optional[int] = None
    cod_local_default: Optional[int] = None
    cod_departamento_default: Optional[int] = None
    cod_centro_custo_default: Optional[int] = None
    compra_consig_default: str = "N"
    gerar_pendencia_default: str = "S"
    email_enabled: bool = False
    sender_name: Optional[str] = None
    sender_email: Optional[str] = None
    reply_to_email: Optional[str] = None
    cc_emails: Optional[str] = None
    email_subject_template: Optional[str] = None
    email_body_template: Optional[str] = None


class SupplierPublisherEntry(BaseModel):
    cod_editora: int
    desconto_percentual: float = Field(..., ge=0, le=100)


class UpsertSupplierDiscountsPayload(BaseModel):
    company_id: Optional[int] = None
    branch_id: int
    cod_grp_fornecedor: int
    cod_fornecedor: int
    cnpj_fornecedor: Optional[str] = None
    nome_fornecedor: Optional[str] = None
    email_fornecedor: Optional[str] = None
    entries: List[SupplierPublisherEntry]


class ImportHorusSupplierDiscountsPayload(BaseModel):
    company_id: Optional[int] = None
    branch_id: int
    cod_grp_fornecedor: int
    cod_fornecedor: int
    cnpj_fornecedor: Optional[str] = None
    nome_fornecedor: Optional[str] = None
    default_discount_if_zero: float = Field(0.0, ge=0, le=100)


class ReconcilePublisherPayload(BaseModel):
    company_id: Optional[int] = None
    cod_items: List[int] = []
    product_ids: List[int] = []
    new_cod_editora: int
    origin_module: str = "COMPRAS"


class ItemLookupPayload(BaseModel):
    company_id: Optional[int] = None
    branch_id: int
    cod_grp_fornecedor: int
    cod_fornecedor: int
    query: str
    default_qty: int = 1
    limit: int = 30


class RefreshCartItemsPayload(BaseModel):
    company_id: Optional[int] = None
    branch_id: int
    cod_grp_fornecedor: int
    cod_fornecedor: int
    items: List[Dict[str, Any]]  # [{"cod_item": 123, "quantity": 5}]


class CreatePurchaseOrderItemInput(BaseModel):
    cod_item: int
    quantity: int = Field(..., gt=0)
    discount_pct: Optional[float] = Field(None, ge=0, le=100)


class CreatePurchaseOrderPayload(BaseModel):
    company_id: Optional[int] = None
    branch_id: int
    cod_grp_fornecedor: int
    cod_fornecedor: int
    compra_consig: str = "N"
    gerar_pendencia: Optional[str] = None
    initial_horus_status: str = "AP"
    cod_local: Optional[int] = None
    cod_departamento: Optional[int] = None
    cod_centro_custo: Optional[int] = None
    observations: Optional[str] = None
    items: List[CreatePurchaseOrderItemInput]


class AppendPurchaseOrderItemsPayload(BaseModel):
    company_id: Optional[int] = None
    observations: Optional[str] = None
    items: List[CreatePurchaseOrderItemInput]


class ChangePurchaseOrderStatusPayload(BaseModel):
    company_id: Optional[int] = None
    new_horus_status: str  # 'AB', 'AP', 'AE' ou 'CA'
    notes: Optional[str] = None
    reason: Optional[str] = None


class ChangePurchaseOrderPendenciaPayload(BaseModel):
    company_id: Optional[int] = None
    gerar_pendencia: str  # 'S' (SIM) ou 'N' (NÃO)


# ── 1. Filiais e Parametrização Individual por Filial (Opções + E-mail) ──────

@router.get("/branches")
def list_purchase_branches(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    seller_id = _resolve_seller_id(current_user, company_id)
    branches = _load_configured_branches(db, seller_id)

    configs = (
        db.query(HorusPurchaseBranchConfig)
        .filter(HorusPurchaseBranchConfig.company_id == seller_id)
        .all()
    )
    cfg_by_bid = {int(c.branch_id): c for c in configs}

    sup_counts = (
        db.query(
            HorusSupplierPublisherDiscount.branch_id,
            func.count(func.distinct(HorusSupplierPublisherDiscount.cod_fornecedor)).label("suppliers_cnt"),
            func.count(HorusSupplierPublisherDiscount.id).label("publishers_cnt"),
        )
        .filter(
            HorusSupplierPublisherDiscount.company_id == seller_id,
            HorusSupplierPublisherDiscount.active == True,
        )
        .group_by(HorusSupplierPublisherDiscount.branch_id)
        .all()
    )
    cnt_map = {int(r.branch_id): {"suppliers": int(r.suppliers_cnt), "publishers": int(r.publishers_cnt)} for r in sup_counts}

    enriched = []
    for b in branches:
        bid = int(b["id"])
        cfg = cfg_by_bid.get(bid)
        cm = cnt_map.get(bid, {"suppliers": 0, "publishers": 0})
        enriched.append({
            **b,
            "configured_suppliers_count": cm["suppliers"],
            "configured_publishers_count": cm["publishers"],
            "config": {
                "cod_local_default": cfg.cod_local_default if cfg and cfg.cod_local_default is not None else b.get("cod_local"),
                "cod_departamento_default": cfg.cod_departamento_default if cfg else None,
                "cod_centro_custo_default": cfg.cod_centro_custo_default if cfg else None,
                "compra_consig_default": cfg.compra_consig_default if cfg else "N",
                "gerar_pendencia_default": (
                    cfg.gerar_pendencia_default
                    if cfg and getattr(cfg, "gerar_pendencia_default", None) in ("S", "N")
                    else "S"
                ),
                "email_enabled": bool(cfg.email_enabled) if cfg else False,
                "sender_name": cfg.sender_name if cfg else b["nome"],
                "sender_email": cfg.sender_email if cfg else "",
                "reply_to_email": cfg.reply_to_email if cfg else "",
                "cc_emails": cfg.cc_emails if cfg else "",
                "email_subject_template": (
                    cfg.email_subject_template
                    if cfg and cfg.email_subject_template
                    else "Pedido de Compra #{cod_pedido} - {filial_nome}"
                ),
                "email_body_template": (
                    cfg.email_body_template
                    if cfg and cfg.email_body_template
                    else (
                        "Olá, equipe {fornecedor_nome}!\n\n"
                        "Segue anexo o Pedido de Compra nº #{cod_pedido} referente à unidade {filial_nome} (CNPJ {filial_cnpj}).\n"
                        "Quantidade total: {qtd_exemplares} exemplares ({qtd_skus} títulos) • Valor líquido: {valor_liquido}.\n\n"
                        "Atenciosamente,\nSetor de Compras - {filial_nome}"
                    )
                ),
            },
        })

    return {"branches": enriched}


@router.get("/branches/{branch_id}/config")
def get_branch_purchase_config(
    branch_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    seller_id = _resolve_seller_id(current_user, company_id)
    branch = _get_branch_or_404(db, seller_id, branch_id)
    cfg = (
        db.query(HorusPurchaseBranchConfig)
        .filter(
            HorusPurchaseBranchConfig.company_id == seller_id,
            HorusPurchaseBranchConfig.branch_id == branch_id,
        )
        .first()
    )

    horus_departments: List[Dict[str, Any]] = []
    try:
        sql_client = HorusSQLClient(db, seller_id)
        d_rows = sql_client.query(
            """
            SELECT COD_DEPARTAMENTO AS cod_departamento, RTRIM(LTRIM(ISNULL(NOM_DEPARTAMENTO, ''))) AS nom_departamento
            FROM DEPARTAMENTOS_GERAL WITH (NOLOCK)
            WHERE COD_EMPRESA = %s AND COD_FILIAL = %s AND ISNULL(STA_ATIVO, 'S') <> 'N'
            ORDER BY NOM_DEPARTAMENTO ASC
            """,
            (int(branch["cod_empresa"]), int(branch["cod_filial"])),
            max_rows=100,
        )
        horus_departments = [
            {"cod_departamento": int(r["cod_departamento"]), "nom_departamento": str(r["nom_departamento"])}
            for r in (d_rows or [])
        ]
    except Exception as e:
        log.debug(f"[HorusPurchases] Falha ao listar DEPARTAMENTOS_GERAL: {e}")

    return {
        "branch": branch,
        "horus_departments": horus_departments,
        "config": {
            "cod_local_default": cfg.cod_local_default if cfg and cfg.cod_local_default is not None else branch.get("cod_local"),
            "cod_departamento_default": cfg.cod_departamento_default if cfg else None,
            "cod_centro_custo_default": cfg.cod_centro_custo_default if cfg else None,
            "compra_consig_default": cfg.compra_consig_default if cfg else "N",
            "gerar_pendencia_default": (
                cfg.gerar_pendencia_default
                if cfg and getattr(cfg, "gerar_pendencia_default", None) in ("S", "N")
                else "S"
            ),
            "email_enabled": bool(cfg.email_enabled) if cfg else False,
            "sender_name": cfg.sender_name if cfg else branch["nome"],
            "sender_email": cfg.sender_email if cfg else "",
            "reply_to_email": cfg.reply_to_email if cfg else "",
            "cc_emails": cfg.cc_emails if cfg else "",
            "email_subject_template": cfg.email_subject_template if cfg else "Pedido de Compra #{cod_pedido} - {filial_nome}",
            "email_body_template": cfg.email_body_template if cfg else "",
        },
    }


@router.put("/branches/{branch_id}/config")
def save_branch_purchase_config(
    branch_id: int,
    payload: BranchPurchaseConfigPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    branch = _get_branch_or_404(db, seller_id, branch_id)
    uid, _, _ = _user_meta(current_user)

    cfg = (
        db.query(HorusPurchaseBranchConfig)
        .filter(
            HorusPurchaseBranchConfig.company_id == seller_id,
            HorusPurchaseBranchConfig.branch_id == branch_id,
        )
        .first()
    )
    if not cfg:
        cfg = HorusPurchaseBranchConfig(
            company_id=seller_id,
            branch_id=branch_id,
            cod_empresa=int(branch["cod_empresa"]),
            cod_filial=int(branch["cod_filial"]),
        )
        db.add(cfg)

    cfg.cod_empresa = int(branch["cod_empresa"])
    cfg.cod_filial = int(branch["cod_filial"])
    cfg.cod_local_default = payload.cod_local_default
    cfg.cod_departamento_default = payload.cod_departamento_default
    cfg.cod_centro_custo_default = payload.cod_centro_custo_default
    cfg.compra_consig_default = "S" if str(payload.compra_consig_default or "N").upper() == "S" else "N"
    cfg.gerar_pendencia_default = "N" if str(payload.gerar_pendencia_default or "S").upper() == "N" else "S"
    cfg.email_enabled = bool(payload.email_enabled)
    cfg.sender_name = (payload.sender_name or "").strip() or None
    cfg.sender_email = (payload.sender_email or "").strip() or None
    cfg.reply_to_email = (payload.reply_to_email or "").strip() or None
    cfg.cc_emails = (payload.cc_emails or "").strip() or None
    cfg.email_subject_template = (payload.email_subject_template or "").strip() or None
    cfg.email_body_template = (payload.email_body_template or "").strip() or None
    cfg.updated_by_user_id = uid

    db.commit()
    return {"success": True, "message": f"Parametrização da filial '{branch['nome']}' salva com sucesso."}


# ── 2. Busca de Fornecedores na Filial & Dossiê 360° (Entradas/Consig/Acertos/Devoluções) ─

@router.get("/suppliers/search")
def search_branch_suppliers(
    branch_id: int = Query(...),
    q: Optional[str] = Query(None),
    only_configured: bool = Query(False),
    limit: int = Query(40, ge=1, le=200),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    seller_id = _resolve_seller_id(current_user, company_id)
    branch = _get_branch_or_404(db, seller_id, branch_id)
    emp = int(branch["cod_empresa"])
    fil = int(branch["cod_filial"])

    disc_rows = (
        db.query(HorusSupplierPublisherDiscount)
        .filter(
            HorusSupplierPublisherDiscount.company_id == seller_id,
            HorusSupplierPublisherDiscount.branch_id == branch_id,
            HorusSupplierPublisherDiscount.active == True,
        )
        .all()
    )
    disc_by_sup: Dict[Tuple[int, int], List[HorusSupplierPublisherDiscount]] = {}
    for dr in disc_rows:
        disc_by_sup.setdefault((int(dr.cod_grp_fornecedor), int(dr.cod_fornecedor)), []).append(dr)

    term = (q or "").strip()

    # Caminho instantâneo (~2ms no PostgreSQL local) para fornecedores já salvos na filial, sem abrir conexão remota SQL Server!
    if only_configured:
        if not disc_by_sup:
            return {"suppliers": [], "branch": branch}
        term_up = term.upper()
        term_digits = _clean_digits(term)
        fast_out = []
        for (grp, forn), cfg_list in disc_by_sup.items():
            first = cfg_list[0]
            nom = str(first.nome_fornecedor or f"FORNECEDOR #{forn}")
            cnpj_val = _clean_digits(first.cnpj_fornecedor)
            if term:
                match_name = term_up in nom.upper()
                match_cnpj = bool(term_digits and term_digits in cnpj_val)
                match_cod = term.isdigit() and int(term) == forn
                if not (match_name or match_cnpj or match_cod):
                    continue
            fast_out.append({
                "cod_empresa": emp,
                "cod_filial": fil,
                "cod_grp_fornecedor": grp,
                "cod_fornecedor": forn,
                "nom_fornecedor": nom,
                "nom_fantasia": nom,
                "cnpj": cnpj_val,
                "email": str(first.email_fornecedor or ""),
                "prazo_pagamentos": "",
                "prazo_entrega": 0,
                "fat_minimo": 0.0,
                "nom_grupo": "",
                "grp_cod_departamento": None,
                "is_configured": True,
                "configured_publishers_count": len(cfg_list),
                "configured_publishers": [
                    {
                        "id": c.id,
                        "cod_editora": c.cod_editora,
                        "nome_editora": c.nome_editora,
                        "desconto_percentual": float(c.desconto_percentual or 0.0),
                    }
                    for c in cfg_list
                ],
            })
        fast_out.sort(key=lambda s: s["nom_fornecedor"])
        return {"suppliers": fast_out[:limit], "branch": branch}

    try:
        sql_client = HorusSQLClient(db, seller_id)
    except HorusSQLConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))

    where_parts = [
        "FG.COD_EMPRESA = %s",
        "FG.COD_FILIAL = %s",
        "ISNULL(FG.STA_ATIVO, 'S') <> 'N'",
    ]
    params: List[Any] = [emp, fil]

    if term:
        digits = _clean_digits(term)
        if term.isdigit() and len(term) <= 8:
            where_parts.append(
                "(FG.COD_FORNECEDOR = %s OR FG.NOM_FORNECEDOR LIKE %s OR FG.NOM_FANTASIA LIKE %s)"
            )
            params.extend([int(term), f"%{term}%", f"%{term}%"])
        elif digits and len(digits) >= 6:
            where_parts.append(
                "(FG.CNPF_CNPJ LIKE %s OR FG.NOM_FORNECEDOR LIKE %s OR FG.NOM_FANTASIA LIKE %s)"
            )
            params.extend([f"%{digits}%", f"%{term}%", f"%{term}%"])
        else:
            where_parts.append("(FG.NOM_FORNECEDOR LIKE %s OR FG.NOM_FANTASIA LIKE %s)")
            params.extend([f"%{term}%", f"%{term}%"])

    sql = f"""
        SELECT TOP ({int(limit)})
            FG.COD_EMPRESA AS cod_empresa,
            FG.COD_FILIAL AS cod_filial,
            FG.COD_GRP_FORNECEDOR AS cod_grp_fornecedor,
            FG.COD_FORNECEDOR AS cod_fornecedor,
            RTRIM(LTRIM(ISNULL(FG.NOM_FORNECEDOR, ''))) AS nom_fornecedor,
            RTRIM(LTRIM(ISNULL(FG.NOM_FANTASIA, ''))) AS nom_fantasia,
            RTRIM(LTRIM(ISNULL(FG.CNPF_CNPJ, ISNULL(FG.CPF, '')))) AS cnpj,
            RTRIM(LTRIM(ISNULL(FG.END_EMAIL_PED_COMPRAS, ISNULL(FG.END_EMAIL, '')))) AS email,
            RTRIM(LTRIM(ISNULL(FG.PRAZO_PAGAMENTOS, ''))) AS prazo_pagamentos,
            ISNULL(FG.PRAZO_ENTREGA, 0) AS prazo_entrega,
            ISNULL(FG.FAT_MINIMO, 0) AS fat_minimo,
            RTRIM(LTRIM(ISNULL(GF.NOM_GRP_FORNECEDOR, ''))) AS nom_grupo,
            GF.COD_DEPARTAMENTO AS grp_cod_departamento
        FROM FORNECEDORES_GERAL FG WITH (NOLOCK)
        LEFT JOIN GRUPO_FORNECEDORES GF WITH (NOLOCK)
            ON GF.COD_EMPRESA = FG.COD_EMPRESA
            AND GF.COD_FILIAL = FG.COD_FILIAL
            AND GF.COD_GRP_FORNECEDOR = FG.COD_GRP_FORNECEDOR
        WHERE {' AND '.join(where_parts)}
        ORDER BY FG.NOM_FORNECEDOR ASC
    """
    rows = sql_client.query(sql, tuple(params), max_rows=limit)

    suppliers_out = []
    for r in (rows or []):
        grp = int(r["cod_grp_fornecedor"])
        forn = int(r["cod_fornecedor"])
        cfg_list = disc_by_sup.get((grp, forn), [])
        suppliers_out.append({
            "cod_empresa": int(r["cod_empresa"]),
            "cod_filial": int(r["cod_filial"]),
            "cod_grp_fornecedor": grp,
            "cod_fornecedor": forn,
            "nom_fornecedor": str(r.get("nom_fornecedor") or ""),
            "nom_fantasia": str(r.get("nom_fantasia") or ""),
            "cnpj": _clean_digits(r.get("cnpj")),
            "email": str(r.get("email") or ""),
            "prazo_pagamentos": str(r.get("prazo_pagamentos") or ""),
            "prazo_entrega": int(r.get("prazo_entrega") or 0),
            "fat_minimo": float(r.get("fat_minimo") or 0.0),
            "nom_grupo": str(r.get("nom_grupo") or ""),
            "grp_cod_departamento": int(r["grp_cod_departamento"]) if r.get("grp_cod_departamento") is not None else None,
            "is_configured": len(cfg_list) > 0,
            "configured_publishers_count": len(cfg_list),
            "configured_publishers": [
                {
                    "id": c.id,
                    "cod_editora": c.cod_editora,
                    "nome_editora": c.nome_editora,
                    "desconto_percentual": float(c.desconto_percentual or 0.0),
                }
                for c in cfg_list
            ],
        })

    if not term:
        suppliers_out.sort(key=lambda s: (0 if s["is_configured"] else 1, s["nom_fornecedor"]))

    return {"suppliers": suppliers_out, "branch": branch}


@router.get("/suppliers/overview")
def get_supplier_branch_overview(
    branch_id: int = Query(...),
    cod_grp_fornecedor: int = Query(...),
    cod_fornecedor: int = Query(...),
    days: int = Query(365, ge=30, le=1825),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Dossiê 360° do Fornecedor na Filial em ALTA PERFORMANCE:
      - Reutiliza UMA ÚNICA conexão TCP/TDS com o SQL Server (elimina 8 handshakes remotos)
      - Consolida NF_ENTRADA em uma única CTE SARGable (agrega itens só nas Top 30 notas)
    """
    seller_id = _resolve_seller_id(current_user, company_id)
    branch = _get_branch_or_404(db, seller_id, branch_id)
    emp = int(branch["cod_empresa"])
    fil = int(branch["cod_filial"])

    configured_discounts = (
        db.query(HorusSupplierPublisherDiscount)
        .filter(
            HorusSupplierPublisherDiscount.company_id == seller_id,
            HorusSupplierPublisherDiscount.branch_id == branch_id,
            HorusSupplierPublisherDiscount.cod_grp_fornecedor == cod_grp_fornecedor,
            HorusSupplierPublisherDiscount.cod_fornecedor == cod_fornecedor,
            HorusSupplierPublisherDiscount.active == True,
        )
        .order_by(HorusSupplierPublisherDiscount.nome_editora.asc())
        .all()
    )
    configured_ed_ids = {int(d.cod_editora) for d in configured_discounts}

    all_ent_cfops_in = _build_sargable_cfop_in((
        "1101", "1102", "2101", "2102", "3101", "3102",
        "1401", "1403", "2401", "2403", "1120", "2120",
        "1917", "2917",
        "1113", "2113", "1114", "2114",
    ))

    horus_suggested_publishers: List[Dict[str, Any]] = []
    seen_sug: set[int] = set()
    ultimas_entradas_compra: List[Dict[str, Any]] = []
    ultimas_consignacoes: List[Dict[str, Any]] = []
    ultimos_acertos: List[Dict[str, Any]] = []
    ultimas_devolucoes: List[Dict[str, Any]] = []
    horus_recent_orders: List[Dict[str, Any]] = []
    consigned_balance_summary = {"total_skus": 0, "total_units": 0}

    conn = _open_horus_tx_connection(db, seller_id)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT TOP 1
                    FG.COD_EMPRESA AS cod_empresa,
                    FG.COD_FILIAL AS cod_filial,
                    FG.COD_GRP_FORNECEDOR AS cod_grp_fornecedor,
                    FG.COD_FORNECEDOR AS cod_fornecedor,
                    RTRIM(LTRIM(ISNULL(FG.NOM_FORNECEDOR, ''))) AS nom_fornecedor,
                    RTRIM(LTRIM(ISNULL(FG.NOM_FANTASIA, ''))) AS nom_fantasia,
                    RTRIM(LTRIM(ISNULL(FG.CNPF_CNPJ, ISNULL(FG.CPF, '')))) AS cnpj,
                    RTRIM(LTRIM(ISNULL(FG.END_EMAIL_PED_COMPRAS, ISNULL(FG.END_EMAIL, '')))) AS email,
                    RTRIM(LTRIM(ISNULL(FG.PRAZO_PAGAMENTOS, ''))) AS prazo_pagamentos,
                    ISNULL(FG.PRAZO_ENTREGA, 0) AS prazo_entrega,
                    ISNULL(FG.FAT_MINIMO, 0) AS fat_minimo,
                    RTRIM(LTRIM(ISNULL(GF.NOM_GRP_FORNECEDOR, ''))) AS nom_grupo,
                    GF.COD_DEPARTAMENTO AS grp_cod_departamento
                FROM FORNECEDORES_GERAL FG WITH (NOLOCK)
                LEFT JOIN GRUPO_FORNECEDORES GF WITH (NOLOCK)
                    ON GF.COD_EMPRESA = FG.COD_EMPRESA
                    AND GF.COD_FILIAL = FG.COD_FILIAL
                    AND GF.COD_GRP_FORNECEDOR = FG.COD_GRP_FORNECEDOR
                WHERE FG.COD_EMPRESA = %s AND FG.COD_FILIAL = %s
                  AND FG.COD_GRP_FORNECEDOR = %s AND FG.COD_FORNECEDOR = %s
                """,
                (emp, fil, cod_grp_fornecedor, cod_fornecedor),
            )
            sup_raw = cur.fetchone()
            if not sup_raw:
                raise HTTPException(status_code=404, detail="Fornecedor não encontrado nesta filial do Horus.")

            try:
                cur.execute(
                    """
                    SELECT TOP 100
                           EF.COD_EDITORA AS cod_editora,
                           RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, '')))) AS nome_editora,
                           ISNULL(EF.VLR_DESCONTO, 0) AS vlr_desconto
                    FROM EDITORAS_FORNEC EF WITH (NOLOCK)
                    INNER JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = EF.COD_EDITORA
                    WHERE EF.COD_EMPRESA = %s AND EF.COD_FILIAL = %s
                      AND EF.COD_GRP_FORNECEDOR = %s AND EF.COD_FORNECEDOR = %s
                    ORDER BY ED.NOM_EDITORA ASC
                    """,
                    (emp, fil, cod_grp_fornecedor, cod_fornecedor),
                )
                for r in (cur.fetchall() or []):
                    ce = int(r["cod_editora"])
                    seen_sug.add(ce)
                    horus_suggested_publishers.append({
                        "cod_editora": ce,
                        "nome_editora": str(r.get("nome_editora") or f"EDITORA #{ce}"),
                        "horus_discount": float(r.get("vlr_desconto") or 0.0),
                        "source": "EDITORAS_FORNEC",
                        "already_configured": ce in configured_ed_ids,
                    })
            except Exception:
                pass

            top_nf_ids: List[int] = []
            try:
                cur.execute(
                    f"""
                    ;WITH TopNE AS (
                        SELECT TOP 30
                            NE.COD_NF_ENTRADA,
                            RTRIM(LTRIM(ISNULL(NE.NRO_NOTA_FISCAL, CAST(NE.COD_NF_ENTRADA AS VARCHAR)))) AS nro_nf,
                            RTRIM(LTRIM(ISNULL(NE.COD_NATUREZA, ''))) AS cfop,
                            ISNULL(NE.DAT_RECEPCAO_NF, NE.DAT_EMISSAO_NF) AS data_nf,
                            NE.DAT_EMISSAO_NF AS data_emissao,
                            ISNULL(NE.VLR_BRUTO_NF, 0) AS vlr_bruto,
                            ISNULL(NE.VLR_LIQUIDO_NF, 0) AS vlr_liquido,
                            ISNULL(NE.VLR_DESCONTO_NF, 0) AS vlr_desconto,
                            NE.COD_PEDIDO AS cod_pedido,
                            RTRIM(LTRIM(ISNULL(NE.SIT_NF, ''))) AS sit_nf
                        FROM NF_ENTRADA NE WITH (NOLOCK)
                        WHERE NE.COD_EMPRESA = %s
                          AND NE.COD_FILIAL = %s
                          AND NE.COD_FORNECEDOR = %s
                          AND ISNULL(NE.SIT_NF, '') NOT IN ('C', 'CAN')
                          AND NE.DAT_EMISSAO_NF >= DATEADD(day, -%s, GETDATE())
                          AND NE.COD_NATUREZA IN ({all_ent_cfops_in})
                        ORDER BY ISNULL(NE.DAT_RECEPCAO_NF, NE.DAT_EMISSAO_NF) DESC, NE.COD_NF_ENTRADA DESC
                    )
                    SELECT
                        T.*,
                        ISNULL(A.qtd_skus, 0) AS qtd_skus,
                        ISNULL(A.qtd_exemplares, 0) AS qtd_exemplares
                    FROM TopNE T
                    LEFT JOIN (
                        SELECT INF.COD_NF_ENTRADA,
                               COUNT(*) AS qtd_skus,
                               SUM(ISNULL(INF.QTD_ITENS, 0)) AS qtd_exemplares
                        FROM ITENS_NOTAS_FISCAIS INF WITH (NOLOCK)
                        WHERE INF.COD_EMPRESA = %s AND INF.COD_FILIAL = %s
                          AND INF.COD_NF_ENTRADA IN (SELECT COD_NF_ENTRADA FROM TopNE)
                        GROUP BY INF.COD_NF_ENTRADA
                    ) A ON A.COD_NF_ENTRADA = T.COD_NF_ENTRADA
                    ORDER BY T.data_nf DESC, T.COD_NF_ENTRADA DESC
                    """,
                    (emp, fil, cod_fornecedor, int(days), emp, fil),
                )
                for x in (cur.fetchall() or []):
                    cnf = int(x["COD_NF_ENTRADA"])
                    top_nf_ids.append(cnf)
                    cf_clean = _clean_digits(x.get("cfop"))
                    item_obj = {
                        "cod_nf": cnf,
                        "nro_nf": str(x.get("nro_nf") or ""),
                        "cfop": str(x.get("cfop") or ""),
                        "data_nf": _fmt_dt(x.get("data_nf")),
                        "data_emissao": _fmt_dt(x.get("data_emissao")),
                        "vlr_bruto": float(x.get("vlr_bruto") or 0.0),
                        "vlr_liquido": float(x.get("vlr_liquido") or 0.0),
                        "vlr_desconto": float(x.get("vlr_desconto") or 0.0),
                        "cod_pedido": int(x["cod_pedido"]) if x.get("cod_pedido") else None,
                        "sit_nf": str(x.get("sit_nf") or ""),
                        "qtd_skus": int(x.get("qtd_skus") or 0),
                        "qtd_exemplares": int(float(x.get("qtd_exemplares") or 0)),
                    }
                    if cf_clean in ("1917", "2917"):
                        if len(ultimas_consignacoes) < 10:
                            ultimas_consignacoes.append(item_obj)
                    elif cf_clean in ("1113", "2113", "1114", "2114"):
                        if len(ultimos_acertos) < 10:
                            ultimos_acertos.append(item_obj)
                    else:
                        if len(ultimas_entradas_compra) < 10:
                            ultimas_entradas_compra.append(item_obj)
            except Exception as ex:
                log.debug(f"[HorusPurchases] Aviso em TopNE NF_ENTRADA: {ex}")

            if top_nf_ids and len(horus_suggested_publishers) < 20:
                try:
                    nf_in = ", ".join(str(i) for i in top_nf_ids[:15])
                    cur.execute(
                        f"""
                        SELECT TOP 20
                            IE.COD_EDITORA AS cod_editora,
                            RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, '')))) AS nome_editora,
                            COUNT(DISTINCT INF.COD_ITEM) AS qtd_skus
                        FROM ITENS_NOTAS_FISCAIS INF WITH (NOLOCK)
                        INNER JOIN ITENS_ESTOQUE_GERAL IE WITH (NOLOCK) ON IE.COD_ITEM = INF.COD_ITEM
                        INNER JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = IE.COD_EDITORA
                        WHERE INF.COD_EMPRESA = %s AND INF.COD_FILIAL = %s
                          AND INF.COD_NF_ENTRADA IN ({nf_in})
                        GROUP BY IE.COD_EDITORA, RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, ''))))
                        ORDER BY COUNT(DISTINCT INF.COD_ITEM) DESC
                        """,
                        (emp, fil),
                    )
                    for r in (cur.fetchall() or []):
                        if r.get("cod_editora") is None:
                            continue
                        ce = int(r["cod_editora"])
                        if ce not in seen_sug:
                            seen_sug.add(ce)
                            horus_suggested_publishers.append({
                                "cod_editora": ce,
                                "nome_editora": str(r.get("nome_editora") or f"EDITORA #{ce}"),
                                "horus_discount": 0.0,
                                "qtd_skus_historico": int(r.get("qtd_skus") or 0),
                                "source": "HISTORICO_NF_ENTRADA",
                                "already_configured": ce in configured_ed_ids,
                            })
                except Exception:
                    pass

            try:
                cur.execute(
                    f"""
                    ;WITH TopDev AS (
                        SELECT TOP 10
                            NM.COD_NF,
                            NM.COD_CLI,
                            RTRIM(LTRIM(ISNULL(NM.NRO_NOTA_FISCAL, CAST(NM.COD_NF AS VARCHAR)))) AS nro_nf,
                            RTRIM(LTRIM(ISNULL(NM.COD_NATUREZA, ''))) AS cfop,
                            NM.DAT_EMISSAO_NF AS data_nf,
                            ISNULL(NM.VLR_BRUTO_NF, 0) AS vlr_bruto,
                            ISNULL(NM.VLR_LIQUIDO_NF, 0) AS vlr_liquido,
                            RTRIM(LTRIM(ISNULL(NM.SIT_NF, ''))) AS sit_nf
                        FROM NF_MESTRE NM WITH (NOLOCK)
                        WHERE NM.COD_EMPRESA = %s
                          AND NM.COD_FILIAL = %s
                          AND NM.STA_CLI = 'F'
                          AND NM.COD_CLI = %s
                          AND ISNULL(NM.SIT_NF, '') NOT IN ('C', 'CAN')
                          AND NM.DAT_EMISSAO_NF >= DATEADD(day, -%s, GETDATE())
                          AND NM.COD_NATUREZA IN ({SARGABLE_CFOP_DEVOL_FORNEC})
                        ORDER BY NM.DAT_EMISSAO_NF DESC, NM.COD_NF DESC
                    )
                    SELECT
                        D.*,
                        ISNULL(A.qtd_skus, 0) AS qtd_skus,
                        ISNULL(A.qtd_exemplares, 0) AS qtd_exemplares
                    FROM TopDev D
                    LEFT JOIN (
                        SELECT NFI.COD_NF,
                               COUNT(*) AS qtd_skus,
                               SUM(ISNULL(NFI.QTD_ITENS, 0)) AS qtd_exemplares
                        FROM NF_ITENS NFI WITH (NOLOCK)
                        WHERE NFI.COD_EMPRESA = %s AND NFI.COD_FILIAL = %s
                          AND NFI.COD_NF IN (SELECT COD_NF FROM TopDev)
                        GROUP BY NFI.COD_NF
                    ) A ON A.COD_NF = D.COD_NF
                    ORDER BY D.data_nf DESC, D.COD_NF DESC
                    """,
                    (emp, fil, cod_fornecedor, int(days), emp, fil),
                )
                for r in (cur.fetchall() or []):
                    cfop_digits = _clean_digits(r.get("cfop"))
                    dev_tipo = "DEVOL. CONSIG." if cfop_digits in ("5918", "6918", "5919", "6919") else "DEVOL. COMPRA"
                    ultimas_devolucoes.append({
                        "cod_nf": int(r["COD_NF"]),
                        "nro_nf": str(r.get("nro_nf") or ""),
                        "cfop": str(r.get("cfop") or ""),
                        "tipo": dev_tipo,
                        "data_nf": _fmt_dt(r.get("data_nf")),
                        "vlr_bruto": float(r.get("vlr_bruto") or 0.0),
                        "vlr_liquido": float(r.get("vlr_liquido") or 0.0),
                        "sit_nf": str(r.get("sit_nf") or ""),
                        "qtd_skus": int(r.get("qtd_skus") or 0),
                        "qtd_exemplares": int(float(r.get("qtd_exemplares") or 0)),
                    })
            except Exception:
                pass

            all_rel_eds = list(configured_ed_ids | seen_sug)
            if all_rel_eds:
                try:
                    eds_in = ", ".join(str(x) for x in all_rel_eds[:100])
                    cur.execute(
                        f"""
                        SELECT
                            COUNT(DISTINCT TS.COD_ITEM) AS skus,
                            SUM(ISNULL(TS.SALDO_CONSIGNADO_RECEBIDO, 0)) AS units
                        FROM TABELA_SALDO_ITENS_GERAL TS WITH (NOLOCK)
                        INNER JOIN ITENS_ESTOQUE_GERAL IE WITH (NOLOCK) ON IE.COD_ITEM = TS.COD_ITEM
                        WHERE TS.COD_EMPRESA = %s AND TS.COD_FILIAL = %s
                          AND TS.SALDO_CONSIGNADO_RECEBIDO > 0
                          AND IE.COD_EDITORA IN ({eds_in})
                        """,
                        (emp, fil),
                    )
                    cb_row = cur.fetchone()
                    if cb_row:
                        consigned_balance_summary = {
                            "total_skus": int(cb_row.get("skus") or 0),
                            "total_units": int(float(cb_row.get("units") or 0)),
                        }
                except Exception:
                    pass

            try:
                cur.execute(
                    """
                    SELECT TOP 10
                        PC.COD_PEDIDO AS cod_pedido,
                        PC.DAT_PEDIDO AS dat_pedido,
                        RTRIM(LTRIM(ISNULL(PC.STATUS_PEDIDO_COMPRA, ''))) AS status_horus,
                        RTRIM(LTRIM(ISNULL(PC.COMPRA_CONSIG, 'N'))) AS compra_consig,
                        ISNULL(PC.QTD_ITENS, 0) AS qtd_itens,
                        ISNULL(PC.VLR_TOTAL_PEDIDO, 0) AS vlr_bruto,
                        ISNULL(PC.VLR_TOTAL_DESCONTO, 0) AS vlr_desconto,
                        ISNULL(PC.PER_TOTAL_DESCONTO, 0) AS per_desconto,
                        RTRIM(LTRIM(ISNULL(PC.NOM_USUARIO, ''))) AS nom_usuario
                    FROM PEDIDOS_COMPRA PC WITH (NOLOCK)
                    WHERE PC.COD_EMPRESA = %s AND PC.COD_FILIAL = %s
                      AND PC.COD_GRP_FORNECEDOR = %s AND PC.COD_FORNECEDOR = %s
                    ORDER BY PC.DAT_PEDIDO DESC, PC.COD_PEDIDO DESC
                    """,
                    (emp, fil, cod_grp_fornecedor, cod_fornecedor),
                )
                for r in (cur.fetchall() or []):
                    vb = float(r.get("vlr_bruto") or 0.0)
                    vd = float(r.get("vlr_desconto") or 0.0)
                    st_h = str(r.get("status_horus") or "")
                    horus_recent_orders.append({
                        "cod_pedido": int(r["cod_pedido"]),
                        "dat_pedido": _fmt_dt(r.get("dat_pedido")),
                        "status_horus": st_h,
                        "status_label": HORUS_STATUS_LABELS.get(st_h, st_h),
                        "compra_consig": str(r.get("compra_consig") or "N"),
                        "qtd_itens": int(float(r.get("qtd_itens") or 0)),
                        "vlr_bruto": vb,
                        "vlr_desconto": vd,
                        "vlr_liquido": round(max(0.0, vb - vd), 2),
                        "per_desconto": round(float(r.get("per_desconto") or 0.0), 2),
                        "nom_usuario": str(r.get("nom_usuario") or ""),
                    })
            except Exception:
                pass
    finally:
        try:
            conn.close()
        except Exception:
            pass

    supplier_info = {
        "cod_empresa": emp,
        "cod_filial": fil,
        "cod_grp_fornecedor": int(sup_raw["cod_grp_fornecedor"]),
        "cod_fornecedor": int(sup_raw["cod_fornecedor"]),
        "nom_fornecedor": str(sup_raw.get("nom_fornecedor") or ""),
        "nom_fantasia": str(sup_raw.get("nom_fantasia") or ""),
        "cnpj": _clean_digits(sup_raw.get("cnpj")),
        "email": str(sup_raw.get("email") or ""),
        "prazo_pagamentos": str(sup_raw.get("prazo_pagamentos") or ""),
        "prazo_entrega": int(sup_raw.get("prazo_entrega") or 0),
        "fat_minimo": float(sup_raw.get("fat_minimo") or 0.0),
        "nom_grupo": str(sup_raw.get("nom_grupo") or ""),
        "grp_cod_departamento": int(sup_raw["grp_cod_departamento"]) if sup_raw.get("grp_cod_departamento") is not None else None,
    }

    configured_list = [
        {
            "id": d.id,
            "cod_editora": d.cod_editora,
            "nome_editora": d.nome_editora,
            "desconto_percentual": float(d.desconto_percentual or 0.0),
            "cnpj_fornecedor": d.cnpj_fornecedor or supplier_info["cnpj"],
            "email_fornecedor": d.email_fornecedor or supplier_info["email"],
            "updated_by_name": d.updated_by_name,
            "updated_at": _fmt_dt(d.updated_at),
        }
        for d in configured_discounts
    ]

    return {
        "branch": branch,
        "supplier": supplier_info,
        "is_ready_for_purchase": len(configured_list) > 0,
        "configured_discounts": configured_list,
        "horus_suggested_publishers": horus_suggested_publishers,
        "history": {
            "entradas_compra": ultimas_entradas_compra,
            "consignacoes_recebidas": ultimas_consignacoes,
            "acertos_consignacao": ultimos_acertos,
            "devolucoes": ultimas_devolucoes,
            "pedidos_compra_horus": horus_recent_orders,
            "consigned_balance_summary": consigned_balance_summary,
        },
    }


# ── 3. Gestão da Tabela Cronuz: CNPJ Fornecedor + Filial + Cód. Fornecedor + Editora + Desconto (%) ─

@router.post("/suppliers/discounts")
def upsert_supplier_publisher_discounts(
    payload: UpsertSupplierDiscountsPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    branch = _get_branch_or_404(db, seller_id, payload.branch_id)
    if not payload.entries:
        raise HTTPException(status_code=400, detail="Informe ao menos uma editora/selo e seu percentual de desconto.")

    try:
        sql_client = HorusSQLClient(db, seller_id)
    except HorusSQLConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Valida que todas as editoras informadas existem na tabela EDITORA do Horus (sem criar cadastros no Horus)
    req_ed_ids = list({int(e.cod_editora) for e in payload.entries})
    eds_in = ", ".join(str(x) for x in req_ed_ids)
    ed_rows = sql_client.query(
        f"""
        SELECT COD_EDITORA AS cod_editora,
               RTRIM(LTRIM(ISNULL(NOM_FANTASIA, ISNULL(NOM_EDITORA, '')))) AS nome_editora
        FROM EDITORA WITH (NOLOCK)
        WHERE COD_EDITORA IN ({eds_in})
        """,
        max_rows=len(req_ed_ids) + 5,
    )
    valid_eds = {int(r["cod_editora"]): str(r.get("nome_editora") or f"EDITORA #{r['cod_editora']}") for r in (ed_rows or [])}
    missing_eds = [eid for eid in req_ed_ids if eid not in valid_eds]
    if missing_eds:
        raise HTTPException(
            status_code=400,
            detail=f"Editora(s) código {missing_eds} não encontrada(s) na tabela EDITORA do Horus.",
        )

    # Busca dados do fornecedor caso CNPJ/Nome não tenham vindo preenchidos
    clean_cnpj = _clean_digits(payload.cnpj_fornecedor)
    sup_name = (payload.nome_fornecedor or "").strip()
    sup_email = (payload.email_fornecedor or "").strip()
    if not clean_cnpj or not sup_name:
        s_rows = sql_client.query(
            """
            SELECT TOP 1 RTRIM(LTRIM(ISNULL(NOM_FORNECEDOR, ''))) AS nom,
                         RTRIM(LTRIM(ISNULL(CNPF_CNPJ, ISNULL(CPF, '')))) AS doc,
                         RTRIM(LTRIM(ISNULL(END_EMAIL_PED_COMPRAS, ISNULL(END_EMAIL, '')))) AS email
            FROM FORNECEDORES_GERAL WITH (NOLOCK)
            WHERE COD_EMPRESA = %s AND COD_FILIAL = %s
              AND COD_GRP_FORNECEDOR = %s AND COD_FORNECEDOR = %s
            """,
            (int(branch["cod_empresa"]), int(branch["cod_filial"]), payload.cod_grp_fornecedor, payload.cod_fornecedor),
            max_rows=1,
        )
        if not s_rows:
            raise HTTPException(status_code=404, detail="Fornecedor não encontrado no Horus para esta filial.")
        clean_cnpj = clean_cnpj or _clean_digits(s_rows[0].get("doc"))
        sup_name = sup_name or str(s_rows[0].get("nom") or "")
        sup_email = sup_email or str(s_rows[0].get("email") or "")

    uid, uname, _ = _user_meta(current_user)
    saved_count = 0

    for entry in payload.entries:
        ce = int(entry.cod_editora)
        disc_val = Decimal(str(entry.desconto_percentual)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        existing = (
            db.query(HorusSupplierPublisherDiscount)
            .filter(
                HorusSupplierPublisherDiscount.company_id == seller_id,
                HorusSupplierPublisherDiscount.branch_id == payload.branch_id,
                HorusSupplierPublisherDiscount.cod_grp_fornecedor == payload.cod_grp_fornecedor,
                HorusSupplierPublisherDiscount.cod_fornecedor == payload.cod_fornecedor,
                HorusSupplierPublisherDiscount.cod_editora == ce,
            )
            .first()
        )
        if existing:
            existing.cnpj_fornecedor = clean_cnpj or existing.cnpj_fornecedor
            existing.nome_fornecedor = sup_name[:150] or existing.nome_fornecedor
            existing.email_fornecedor = sup_email[:255] or existing.email_fornecedor
            existing.nome_editora = valid_eds[ce][:150]
            existing.desconto_percentual = disc_val
            existing.active = True
            existing.updated_by_user_id = uid
            existing.updated_by_name = uname
        else:
            db.add(HorusSupplierPublisherDiscount(
                company_id=seller_id,
                branch_id=payload.branch_id,
                cod_empresa=int(branch["cod_empresa"]),
                cod_filial=int(branch["cod_filial"]),
                cod_grp_fornecedor=payload.cod_grp_fornecedor,
                cod_fornecedor=payload.cod_fornecedor,
                cnpj_fornecedor=clean_cnpj or None,
                nome_fornecedor=sup_name[:150] if sup_name else None,
                email_fornecedor=sup_email[:255] if sup_email else None,
                cod_editora=ce,
                nome_editora=valid_eds[ce][:150],
                desconto_percentual=disc_val,
                active=True,
                updated_by_user_id=uid,
                updated_by_name=uname,
            ))
        saved_count += 1

    db.commit()
    return {
        "success": True,
        "saved_count": saved_count,
        "message": f"{saved_count} editora(s)/selo(s) vinculada(s) com sucesso ao fornecedor nesta filial.",
    }


@router.post("/suppliers/discounts/import-from-horus")
def import_supplier_discounts_from_horus(
    payload: ImportHorusSupplierDiscountsPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Importa rapidamente os vínculos já cadastrados em EDITORAS_FORNEC no Horus para a tabela Cronuz."""
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    branch = _get_branch_or_404(db, seller_id, payload.branch_id)
    emp = int(branch["cod_empresa"])
    fil = int(branch["cod_filial"])

    sql_client = HorusSQLClient(db, seller_id)
    ef_rows = sql_client.query(
        """
        SELECT EF.COD_EDITORA AS cod_editora,
               RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, '')))) AS nome_editora,
               ISNULL(EF.VLR_DESCONTO, 0) AS vlr_desconto
        FROM EDITORAS_FORNEC EF WITH (NOLOCK)
        INNER JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = EF.COD_EDITORA
        WHERE EF.COD_EMPRESA = %s AND EF.COD_FILIAL = %s
          AND EF.COD_GRP_FORNECEDOR = %s AND EF.COD_FORNECEDOR = %s
        """,
        (emp, fil, payload.cod_grp_fornecedor, payload.cod_fornecedor),
        max_rows=500,
    )
    if not ef_rows:
        raise HTTPException(
            status_code=404,
            detail="Nenhum vínculo encontrado em EDITORAS_FORNEC no Horus para este fornecedor nesta filial.",
        )

    entries = []
    for r in ef_rows:
        raw_d = float(r.get("vlr_desconto") or 0.0)
        eff_d = raw_d if raw_d > 0 else float(payload.default_discount_if_zero or 0.0)
        entries.append(SupplierPublisherEntry(cod_editora=int(r["cod_editora"]), desconto_percentual=min(100.0, max(0.0, eff_d))))

    return upsert_supplier_publisher_discounts(
        UpsertSupplierDiscountsPayload(
            company_id=seller_id,
            branch_id=payload.branch_id,
            cod_grp_fornecedor=payload.cod_grp_fornecedor,
            cod_fornecedor=payload.cod_fornecedor,
            cnpj_fornecedor=payload.cnpj_fornecedor,
            nome_fornecedor=payload.nome_fornecedor,
            entries=entries,
        ),
        db=db,
        current_user=current_user,
    )


@router.delete("/suppliers/discounts/{discount_id}")
def delete_supplier_publisher_discount(
    discount_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    seller_id = _resolve_seller_id(current_user, company_id)
    row = (
        db.query(HorusSupplierPublisherDiscount)
        .filter(
            HorusSupplierPublisherDiscount.id == discount_id,
            HorusSupplierPublisherDiscount.company_id == seller_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Vínculo de desconto/editora não encontrado.")
    db.delete(row)
    db.commit()
    return {"success": True, "message": "Vínculo de editora removido do fornecedor."}


# ── 4. Busca Oficial de Editoras/Selos no Horus & Conciliação Bidirecional (Horus + Cronuz) ─

@router.get("/publishers/search")
def search_horus_publishers(
    q: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=300),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Pesquisa diretamente a tabela oficial EDITORA no Horus SQL Server.
    Garante que qualquer vinculação ou correção de selo/editora utilize apenas códigos existentes no Horus.
    """
    seller_id = _resolve_seller_id(current_user, company_id)
    try:
        sql_client = HorusSQLClient(db, seller_id)
    except HorusSQLConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))

    where_sql = "1=1"
    params: List[Any] = []
    term = (q or "").strip()
    if term:
        if term.isdigit():
            where_sql = "(ED.COD_EDITORA = %s OR ED.NOM_EDITORA LIKE %s OR ED.NOM_FANTASIA LIKE %s)"
            params.extend([int(term), f"%{term}%", f"%{term}%"])
        else:
            where_sql = "(ED.NOM_EDITORA LIKE %s OR ED.NOM_FANTASIA LIKE %s)"
            params.extend([f"%{term}%", f"%{term}%"])

    rows = sql_client.query(
        f"""
        SELECT TOP ({int(limit)})
            ED.COD_EDITORA AS cod_editora,
            RTRIM(LTRIM(ISNULL(ED.NOM_EDITORA, ''))) AS nom_editora,
            RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ''))) AS nom_fantasia,
            RTRIM(LTRIM(ISNULL(ED.CPF_CNPJ, ''))) AS cnpj,
            (SELECT COUNT(*) FROM ITENS_ESTOQUE_GERAL IE WITH (NOLOCK) WHERE IE.COD_EDITORA = ED.COD_EDITORA) AS qtd_itens
        FROM EDITORA ED WITH (NOLOCK)
        WHERE {where_sql}
        ORDER BY CASE WHEN ED.NOM_FANTASIA IS NOT NULL AND LTRIM(RTRIM(ED.NOM_FANTASIA)) <> '' THEN ED.NOM_FANTASIA ELSE ED.NOM_EDITORA END ASC
        """,
        tuple(params) if params else None,
        max_rows=limit,
    )

    out = []
    for r in (rows or []):
        ce = int(r["cod_editora"])
        fant = str(r.get("nom_fantasia") or "").strip()
        raz = str(r.get("nom_editora") or "").strip()
        display = fant or raz or f"EDITORA #{ce}"
        out.append({
            "cod_editora": ce,
            "nome_editora": display,
            "razao_editora": raz,
            "fantasia_editora": fant,
            "cnpj": _clean_digits(r.get("cnpj")),
            "qtd_itens": int(r.get("qtd_itens") or 0),
        })
    return {"publishers": out}


@router.post("/items/reconcile-publisher")
def reconcile_items_publisher_horus_and_cronuz(
    payload: ReconcilePublisherPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Atualiza de forma segura e transacional a Editora/Selo (COD_EDITORA) de 1 ou múltiplos itens:
      1. Valida que new_cod_editora já existe na tabela EDITORA do Horus (NUNCA cadastra editora nova no Horus).
      2. Atualiza ITENS_ESTOQUE_GERAL.COD_EDITORA no Horus SQL Server (apenas UPDATE em itens já existentes).
      3. Concilia imediatamente a base local prd_product (brand_id / brand) no PostgreSQL do Cronuz B2B.
      4. Grava auditoria detalhada em pur_horus_publisher_reconcile_log (usuário, data/hora, editora anterior -> nova).
    """
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    uid, uname, horus_user_upper = _user_meta(current_user)

    target_cod_items: set[int] = {int(c) for c in (payload.cod_items or []) if int(c) > 0}

    # Resolve product_ids locais (ex: vindos da tela Análise de Itens) para horus_cod_item
    local_prods_by_id: List[Product] = []
    if payload.product_ids:
        local_prods_by_id = (
            db.query(Product)
            .filter(Product.company_id == seller_id, Product.id.in_([int(pid) for pid in payload.product_ids]))
            .all()
        )
        missing_eans: List[str] = []
        for lp in local_prods_by_id:
            if lp.horus_cod_item and int(lp.horus_cod_item) > 0:
                target_cod_items.add(int(lp.horus_cod_item))
            elif lp.sku and str(lp.sku).replace("H-", "").isdigit():
                target_cod_items.add(int(str(lp.sku).replace("H-", "")))
            elif lp.ean_gtin:
                missing_eans.append(str(lp.ean_gtin).strip())

        if missing_eans:
            sql_ro = HorusSQLClient(db, seller_id)
            ph = ", ".join(["%s"] * len(missing_eans))
            resolved_rows = sql_ro.query(
                f"""
                SELECT COD_ITEM AS cod_item, RTRIM(LTRIM(ISNULL(COD_BARRA_ITEM, ''))) AS barra, RTRIM(LTRIM(ISNULL(COD_ISBN_ITEM, ''))) AS isbn
                FROM ITENS_ESTOQUE_GERAL WITH (NOLOCK)
                WHERE COD_BARRA_ITEM IN ({ph}) OR COD_ISBN_ITEM IN ({ph})
                """,
                tuple(missing_eans + missing_eans),
                max_rows=len(missing_eans) * 2,
            )
            for rr in (resolved_rows or []):
                target_cod_items.add(int(rr["cod_item"]))

    if not target_cod_items:
        raise HTTPException(status_code=400, detail="Nenhum item válido do Horus identificado para atualização de editora.")
    if len(target_cod_items) > 500:
        raise HTTPException(status_code=400, detail="Selecione no máximo 500 itens por lote de atualização.")

    conn = _open_horus_tx_connection(db, seller_id)
    try:
        with conn.cursor() as cur:
            # 1. Verifica existência da nova editora em EDITORA no Horus
            cur.execute(
                """
                SELECT TOP 1 COD_EDITORA,
                             RTRIM(LTRIM(ISNULL(NOM_FANTASIA, ISNULL(NOM_EDITORA, '')))) AS nome_editora
                FROM EDITORA WITH (NOLOCK)
                WHERE COD_EDITORA = %s
                """,
                (int(payload.new_cod_editora),),
            )
            ed_row = cur.fetchone()
            if not ed_row:
                conn.rollback()
                raise HTTPException(
                    status_code=404,
                    detail=f"A editora código {payload.new_cod_editora} não existe na tabela EDITORA do Horus.",
                )
            new_cod_ed = int(ed_row["COD_EDITORA"])
            new_nom_ed = str(ed_row["nome_editora"] or f"EDITORA #{new_cod_ed}").strip()

            # 2. Captura estado anterior dos itens em ITENS_ESTOQUE_GERAL
            cods_sorted = sorted(target_cod_items)
            cods_sql = ", ".join(str(c) for c in cods_sorted)
            cur.execute(
                f"""
                SELECT IE.COD_ITEM AS cod_item,
                       RTRIM(LTRIM(ISNULL(IE.COD_BARRA_ITEM, ISNULL(IE.COD_ISBN_ITEM, '')))) AS isbn,
                       RTRIM(LTRIM(ISNULL(IE.NOM_ITEM, ''))) AS nom_item,
                       IE.COD_EDITORA AS old_cod_editora,
                       RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, '')))) AS old_nome_editora
                FROM ITENS_ESTOQUE_GERAL IE
                LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = IE.COD_EDITORA
                WHERE IE.COD_ITEM IN ({cods_sql})
                """
            )
            before_items = cur.fetchall()
            if not before_items:
                conn.rollback()
                raise HTTPException(status_code=404, detail="Os itens informados não foram encontrados em ITENS_ESTOQUE_GERAL no Horus.")

            # 3. Atualiza ITENS_ESTOQUE_GERAL no Horus SQL Server (apenas UPDATE de COD_EDITORA)
            cur.execute(
                f"""
                UPDATE ITENS_ESTOQUE_GERAL
                SET COD_EDITORA = %s,
                    DAT_ULT_ATL = GETDATE(),
                    NOM_USUARIO = %s
                WHERE COD_ITEM IN ({cods_sql})
                """,
                (new_cod_ed, horus_user_upper),
            )
            horus_updated_count = cur.rowcount
            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        log.error(f"[HorusPurchases] Erro ao atualizar COD_EDITORA no Horus SQL: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Falha ao atualizar editora no Horus SQL: {e}")
    finally:
        try:
            conn.close()
        except Exception:
            pass

    # 4. Concilia base PostgreSQL local do Cronuz (Brand + Product + Log de Auditoria)
    brand = (
        db.query(Brand)
        .filter(Brand.company_id == seller_id, func.upper(Brand.name) == new_nom_ed.upper())
        .first()
    )
    if not brand:
        brand = Brand(company_id=seller_id, name=new_nom_ed[:100])
        db.add(brand)
        db.flush()

    found_cods = [int(b["cod_item"]) for b in before_items]
    found_isbns = [str(b.get("isbn") or "").strip() for b in before_items if b.get("isbn")]

    local_matches = (
        db.query(Product)
        .filter(
            Product.company_id == seller_id,
            (
                Product.horus_cod_item.in_(found_cods)
                | (Product.ean_gtin.in_(found_isbns) if found_isbns else False)
                | Product.id.in_([int(pid) for pid in (payload.product_ids or [])] if payload.product_ids else [-1])
            ),
        )
        .all()
    )
    cronuz_updated_count = 0
    for prod in local_matches:
        prod.brand_id = brand.id
        prod.brand = new_nom_ed[:100]
        cronuz_updated_count += 1

    origin_clean = "ANALISE_ITENS" if str(payload.origin_module or "").upper() == "ANALISE_ITENS" else "COMPRAS"
    for bi in before_items:
        db.add(HorusPublisherReconciliationLog(
            company_id=seller_id,
            cod_item=int(bi["cod_item"]),
            isbn=str(bi.get("isbn") or "")[:30] or None,
            nome_item=str(bi.get("nom_item") or "")[:255] or None,
            old_cod_editora=int(bi["old_cod_editora"]) if bi.get("old_cod_editora") is not None else None,
            old_nome_editora=str(bi.get("old_nome_editora") or "")[:150] or None,
            new_cod_editora=new_cod_ed,
            new_nome_editora=new_nom_ed[:150],
            origin_module=origin_clean,
            user_id=uid,
            user_name=uname,
        ))

    db.commit()

    return {
        "success": True,
        "horus_updated_count": horus_updated_count,
        "cronuz_updated_count": cronuz_updated_count,
        "new_cod_editora": new_cod_ed,
        "new_nome_editora": new_nom_ed,
        "updated_cod_items": found_cods,
        "message": (
            f"Editora/Selo atualizada para '{new_nom_ed}' (Cód. {new_cod_ed}) em {len(found_cods)} item(ns) "
            f"no Horus SQL e conciliada no Cronuz B2B!"
        ),
    }


# ── 5. Motor de Enriquecimento de Itens na Filial + Validação de Desconto do Fornecedor ─

def _enrich_purchase_items_for_branch_and_supplier(
    db: Session,
    sql_client: HorusSQLClient,
    seller_id: int,
    branch: Dict[str, Any],
    cod_grp_fornecedor: int,
    cod_fornecedor: int,
    cod_items_qty: Dict[int, int],
) -> List[Dict[str, Any]]:
    """
    Dado um mapa {cod_item: quantity}, consulta no Horus SQL os dados completos do item
    na filial selecionada (estoque disponível respeitando local, consignado recebido/enviado,
    vendas 90d/365d, última entrada, preço de capa e editora) e cruza com pur_horus_supplier_discount.
    """
    if not cod_items_qty:
        return []

    emp = int(branch["cod_empresa"])
    fil = int(branch["cod_filial"])
    bid = int(branch["id"])
    locais = branch.get("locais") or []

    # Mapa de descontos configurados para o fornecedor na filial
    disc_rows = (
        db.query(HorusSupplierPublisherDiscount)
        .filter(
            HorusSupplierPublisherDiscount.company_id == seller_id,
            HorusSupplierPublisherDiscount.branch_id == bid,
            HorusSupplierPublisherDiscount.cod_grp_fornecedor == cod_grp_fornecedor,
            HorusSupplierPublisherDiscount.cod_fornecedor == cod_fornecedor,
            HorusSupplierPublisherDiscount.active == True,
        )
        .all()
    )
    disc_by_editora = {int(d.cod_editora): float(d.desconto_percentual or 0.0) for d in disc_rows}

    cod_list = sorted(cod_items_qty.keys())
    items_map: Dict[int, Dict[str, Any]] = {}

    cfop_vendas_in = _build_sargable_cfop_in((
        "5101", "5102", "5103", "5104", "5107", "5108", "5113", "5114", "5115", "5118", "5119", "5120", "5401", "5403", "5405",
        "6101", "6102", "6103", "6104", "6107", "6108", "6113", "6114", "6115", "6118", "6119", "6120", "6401", "6403", "6405",
        "7101", "7102",
    ))
    cfop_ent_in = _build_sargable_cfop_in((
        "1101", "1102", "2101", "2102", "3101", "3102", "1917", "2917", "1113", "2113", "1114", "2114",
    ))

    for idx in range(0, len(cod_list), 200):
        chunk = cod_list[idx:idx + 200]
        cods_in = ", ".join(str(c) for c in chunk)

        base_rows = sql_client.query(
            f"""
            SELECT
                IE.COD_ITEM AS cod_item,
                RTRIM(LTRIM(ISNULL(IE.COD_BARRA_ITEM, ISNULL(IE.COD_ISBN_ITEM, '')))) AS isbn,
                RTRIM(LTRIM(ISNULL(IE.NOM_ITEM, ''))) AS nome_item,
                IE.COD_EDITORA AS cod_editora,
                RTRIM(LTRIM(ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, '')))) AS nome_editora,
                ISNULL(PA.VLR_CAPA, ISNULL(IE.VLR_CAPA, 0)) AS vlr_capa,
                ISNULL(IE.QTD_ITENS_CAIXA, 0) AS qtd_caixa,
                RTRIM(LTRIM(ISNULL(IE.SITUACAO_ITEM, ''))) AS situacao_item,
                ISNULL(TS.SALDO_VENDAVEL, 0) - ISNULL(TS.SALDO_RESERVADO_VENDA, 0) AS saldo_disp,
                ISNULL(TS.SALDO_ESTOQUE, 0) AS saldo_fisico,
                ISNULL(TS.SALDO_CONSIGNADO_ENVIADO, 0) AS consig_enviado,
                ISNULL(TS.SALDO_CONSIGNADO_RECEBIDO, 0) AS consig_recebido,
                ISNULL(TS.SALDO_PREV_AGUARD_ENT, 0) AS aguardando_entrega,
                ISNULL(TS.CUSTO_MEDIO_ESTOQUE, 0) AS custo_medio
            FROM ITENS_ESTOQUE_GERAL IE WITH (NOLOCK)
            LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = IE.COD_EDITORA
            LEFT JOIN (
                SELECT COD_ITEM, MAX(VLR_CAPA) AS VLR_CAPA
                FROM ITENS_ESTPRECO_ATUAL WITH (NOLOCK)
                WHERE COD_ITEM IN ({cods_in})
                GROUP BY COD_ITEM
            ) PA ON PA.COD_ITEM = IE.COD_ITEM
            LEFT JOIN TABELA_SALDO_ITENS_GERAL TS WITH (NOLOCK)
                ON TS.COD_ITEM = IE.COD_ITEM AND TS.COD_EMPRESA = %s AND TS.COD_FILIAL = %s
            WHERE IE.COD_ITEM IN ({cods_in})
            """,
            (emp, fil),
            max_rows=len(chunk) + 5,
        )

        for r in (base_rows or []):
            ci = int(r["cod_item"])
            ce = int(r["cod_editora"]) if r.get("cod_editora") is not None else None
            ne = str(r.get("nome_editora") or (f"EDITORA #{ce}" if ce else "SEM EDITORA")).strip()
            capa = round(float(r.get("vlr_capa") or 0.0), 2)
            qty = max(1, int(cod_items_qty.get(ci, 1)))

            is_pub_cfg = ce is not None and ce in disc_by_editora
            disc_pct = disc_by_editora[ce] if is_pub_cfg else 0.0
            unit_net = round(capa * (1.0 - disc_pct / 100.0), 4)
            sub_gross = round(capa * qty, 2)
            sub_net = round(unit_net * qty, 2)

            warning_msg = None
            if ce is None:
                warning_msg = "Item sem editora cadastrada no Horus. Concilie a editora para liberar o pedido."
            elif not is_pub_cfg:
                warning_msg = f"A editora '{ne}' (Cód. {ce}) não está configurada para este fornecedor nesta filial."
            elif capa <= 0:
                warning_msg = "Item com Preço de Capa R$ 0,00 no Horus."

            items_map[ci] = {
                "cod_item": ci,
                "isbn": str(r.get("isbn") or ""),
                "nome_item": str(r.get("nome_item") or f"ITEM #{ci}"),
                "cod_editora": ce,
                "nome_editora": ne,
                "vlr_capa": capa,
                "qtd_caixa": int(r.get("qtd_caixa") or 0),
                "situacao_item": str(r.get("situacao_item") or ""),
                "stock_available": int(float(r.get("saldo_disp") or 0)),
                "stock_physical": int(float(r.get("saldo_fisico") or 0)),
                "consigned_sent": int(float(r.get("consig_enviado") or 0)),
                "consigned_received": int(float(r.get("consig_recebido") or 0)),
                "awaiting_delivery": int(float(r.get("aguardando_entrega") or 0)),
                "cost_price": round(float(r.get("custo_medio") or 0.0), 2),
                "min_stock": 0,
                "sales_90": 0,
                "sales_365": 0,
                "last_entry_date": None,
                "last_entry_qty": 0,
                "last_entry_type": None,
                "quantity": qty,
                "publisher_configured": is_pub_cfg,
                "discount_pct": disc_pct,
                "unit_net_price": unit_net,
                "subtotal_gross": sub_gross,
                "subtotal_net": sub_net,
                "validation_warning": warning_msg,
            }

        # Respeita COD_LOCAL configurado na filial se houver
        if locais:
            loc_in = ", ".join(str(int(l)) for l in locais)
            try:
                loc_rows = sql_client.query(
                    f"""
                    SELECT COD_ITEM AS cod_item, SUM(ISNULL(SALDO_TOTAL, 0)) AS saldo_loc
                    FROM TABELA_SALDO_ITENS WITH (NOLOCK)
                    WHERE COD_EMPRESA = %s AND COD_FILIAL = %s
                      AND COD_LOCAL IN ({loc_in})
                      AND COD_ITEM IN ({cods_in})
                    GROUP BY COD_ITEM
                    """,
                    (emp, fil),
                    max_rows=len(chunk) + 5,
                )
                loc_map = {int(lr["cod_item"]): int(float(lr.get("saldo_loc") or 0)) for lr in (loc_rows or [])}
                for c_k in chunk:
                    if c_k in items_map:
                        items_map[c_k]["stock_available"] = loc_map.get(c_k, 0)
            except Exception:
                pass

        # Vendas 90d / 365d na filial
        try:
            v_rows = sql_client.query(
                f"""
                SELECT
                    NFI.COD_ITEM AS cod_item,
                    SUM(CASE WHEN NF.DAT_EMISSAO_NF >= DATEADD(day, -90, GETDATE()) THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) AS v90,
                    SUM(CASE WHEN NF.DAT_EMISSAO_NF >= DATEADD(day, -365, GETDATE()) THEN ISNULL(NFI.QTD_ITENS, 0) ELSE 0 END) AS v365
                FROM NF_ITENS NFI WITH (NOLOCK)
                INNER JOIN NF_MESTRE NF WITH (NOLOCK)
                    ON NF.COD_EMPRESA = NFI.COD_EMPRESA AND NF.COD_FILIAL = NFI.COD_FILIAL AND NF.COD_NF = NFI.COD_NF
                WHERE NFI.COD_EMPRESA = %s AND NFI.COD_FILIAL = %s
                  AND NFI.COD_ITEM IN ({cods_in})
                  AND NF.DAT_EMISSAO_NF >= DATEADD(day, -365, GETDATE())
                  AND ISNULL(NF.SIT_NF, '') NOT IN ('C', 'CAN')
                  AND NFI.COD_NATUREZA IN ({cfop_vendas_in})
                GROUP BY NFI.COD_ITEM
                """,
                (emp, fil),
                max_rows=len(chunk) + 5,
            )
            for vr in (v_rows or []):
                ci = int(vr["cod_item"])
                if ci in items_map:
                    items_map[ci]["sales_90"] = max(0, int(float(vr.get("v90") or 0)))
                    items_map[ci]["sales_365"] = max(0, int(float(vr.get("v365") or 0)))
        except Exception:
            pass

        # Última entrada na filial
        try:
            le_rows = sql_client.query(
                f"""
                WITH Ranked AS (
                    SELECT
                        INF.COD_ITEM AS cod_item,
                        ISNULL(NE.DAT_RECEPCAO_NF, NE.DAT_EMISSAO_NF) AS dt,
                        ISNULL(INF.QTD_ITENS, 0) AS qtd,
                        RTRIM(LTRIM(ISNULL(INF.COD_NATUREZA, NE.COD_NATUREZA))) AS cfop,
                        ROW_NUMBER() OVER (PARTITION BY INF.COD_ITEM ORDER BY ISNULL(NE.DAT_RECEPCAO_NF, NE.DAT_EMISSAO_NF) DESC, NE.COD_NF_ENTRADA DESC) AS rn
                    FROM ITENS_NOTAS_FISCAIS INF WITH (NOLOCK)
                    INNER JOIN NF_ENTRADA NE WITH (NOLOCK)
                        ON NE.COD_EMPRESA = INF.COD_EMPRESA AND NE.COD_FILIAL = INF.COD_FILIAL AND NE.COD_NF_ENTRADA = INF.COD_NF_ENTRADA
                    WHERE INF.COD_EMPRESA = %s AND INF.COD_FILIAL = %s
                      AND INF.COD_ITEM IN ({cods_in})
                      AND ISNULL(NE.SIT_NF, '') NOT IN ('C', 'CAN')
                      AND INF.COD_NATUREZA IN ({cfop_ent_in})
                )
                SELECT cod_item, dt, qtd, cfop FROM Ranked WHERE rn = 1
                """,
                (emp, fil),
                max_rows=len(chunk) + 5,
            )
            for lr in (le_rows or []):
                ci = int(lr["cod_item"])
                if ci in items_map:
                    cf_d = _clean_digits(lr.get("cfop"))
                    items_map[ci]["last_entry_date"] = _fmt_dt(lr.get("dt"))[:10] if lr.get("dt") else None
                    items_map[ci]["last_entry_qty"] = int(float(lr.get("qtd") or 0))
                    items_map[ci]["last_entry_type"] = (
                        "CONSIG." if cf_d in ("1917", "2917") else ("ACERTO" if cf_d in ("1113", "2113", "1114", "2114") else "COMPRA")
                    )
        except Exception:
            pass

    # Cruza Estoque Mínimo da filial (prd_branch_min_stock)
    isbns_present = [x["isbn"] for x in items_map.values() if x.get("isbn")]
    if isbns_present:
        ms_rows = (
            db.query(ProductBranchMinStock)
            .filter(
                ProductBranchMinStock.company_id == seller_id,
                ProductBranchMinStock.branch_id == bid,
                ProductBranchMinStock.isbn.in_(isbns_present),
            )
            .all()
        )
        ms_by_isbn = {str(m.isbn).strip(): int(m.min_stock or 0) for m in ms_rows}
        for it in items_map.values():
            if it.get("isbn") in ms_by_isbn:
                it["min_stock"] = ms_by_isbn[it["isbn"]]

    # Mantém a ordem solicitada
    return [items_map[c] for c in cod_items_qty.keys() if c in items_map]


@router.post("/items/lookup")
def lookup_purchase_items(
    payload: ItemLookupPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    branch = _get_branch_or_404(db, seller_id, payload.branch_id)
    term = (payload.query or "").strip()
    if not term:
        return {"items": []}

    sql_client = HorusSQLClient(db, seller_id)
    lim = min(max(1, int(payload.limit or 30)), 100)
    clean_code = _clean_isbn(term)

    if clean_code and len(clean_code) >= 8 and clean_code.isdigit():
        found_rows = sql_client.query(
            f"""
            SELECT TOP ({lim}) COD_ITEM AS cod_item
            FROM ITENS_ESTOQUE_GERAL WITH (NOLOCK)
            WHERE COD_BARRA_ITEM = %s OR COD_ISBN_ITEM = %s OR CAST(COD_ITEM AS VARCHAR) = %s
            ORDER BY COD_ITEM ASC
            """,
            (clean_code, clean_code, clean_code),
            max_rows=lim,
        )
    elif term.isdigit():
        found_rows = sql_client.query(
            f"""
            SELECT TOP ({lim}) COD_ITEM AS cod_item
            FROM ITENS_ESTOQUE_GERAL WITH (NOLOCK)
            WHERE COD_ITEM = %s OR COD_BARRA_ITEM LIKE %s OR NOM_ITEM LIKE %s
            ORDER BY CASE WHEN COD_ITEM = %s THEN 0 ELSE 1 END, NOM_ITEM ASC
            """,
            (int(term), f"%{term}%", f"%{term}%", int(term)),
            max_rows=lim,
        )
    else:
        found_rows = sql_client.query(
            f"""
            SELECT TOP ({lim}) IE.COD_ITEM AS cod_item
            FROM ITENS_ESTOQUE_GERAL IE WITH (NOLOCK)
            LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = IE.COD_EDITORA
            WHERE IE.NOM_ITEM LIKE %s OR IE.COD_BARRA_ITEM LIKE %s OR ED.NOM_FANTASIA LIKE %s OR ED.NOM_EDITORA LIKE %s
            ORDER BY IE.NOM_ITEM ASC
            """,
            (f"%{term}%", f"%{term}%", f"%{term}%", f"%{term}%"),
            max_rows=lim,
        )

    cod_qty = {int(r["cod_item"]): max(1, int(payload.default_qty or 1)) for r in (found_rows or [])}
    enriched = _enrich_purchase_items_for_branch_and_supplier(
        db=db,
        sql_client=sql_client,
        seller_id=seller_id,
        branch=branch,
        cod_grp_fornecedor=payload.cod_grp_fornecedor,
        cod_fornecedor=payload.cod_fornecedor,
        cod_items_qty=cod_qty,
    )
    return {"items": enriched}


@router.post("/items/refresh-cart")
def refresh_purchase_cart_items(
    payload: RefreshCartItemsPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revalida todos os itens do carrinho (após conciliar editora ou cadastrar novo desconto no fornecedor)."""
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    branch = _get_branch_or_404(db, seller_id, payload.branch_id)
    sql_client = HorusSQLClient(db, seller_id)

    cod_qty: Dict[int, int] = {}
    for row in (payload.items or []):
        try:
            ci = int(row.get("cod_item") or 0)
            qt = max(1, int(row.get("quantity") or 1))
            if ci > 0:
                cod_qty[ci] = qt
        except Exception:
            continue

    enriched = _enrich_purchase_items_for_branch_and_supplier(
        db=db,
        sql_client=sql_client,
        seller_id=seller_id,
        branch=branch,
        cod_grp_fornecedor=payload.cod_grp_fornecedor,
        cod_fornecedor=payload.cod_fornecedor,
        cod_items_qty=cod_qty,
    )
    return {"items": enriched}


@router.post("/items/import-sheet")
async def import_purchase_sheet_items(
    branch_id: int = Form(...),
    cod_grp_fornecedor: int = Form(...),
    cod_fornecedor: int = Form(...),
    company_id: Optional[int] = Form(None),
    pasted_text: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Importa planilha (.xlsx / .csv) ou lista colada com ISBN e Quantidade.
    Aplica trava estrita de 10 MB (Regra Mandatória AGENTS.md Seção 1).
    """
    seller_id = _resolve_seller_id(current_user, company_id)
    branch = _get_branch_or_404(db, seller_id, branch_id)

    parsed_pairs: List[Tuple[str, int]] = []

    if file and file.filename:
        raw_bytes = await file.read(MAX_PURCHASE_SHEET_BYTES + 1)
        if len(raw_bytes) > MAX_PURCHASE_SHEET_BYTES:
            raise HTTPException(
                status_code=413,
                detail="O arquivo excede o limite máximo permitido de 10 MB para este tipo de envio.",
            )
        fname = file.filename.lower()
        rows_matrix: List[List[Any]] = []
        if fname.endswith(".xlsx"):
            wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), read_only=True, data_only=True)
            ws = wb.active
            for r in ws.iter_rows(values_only=True):
                rows_matrix.append(list(r))
            wb.close()
        elif fname.endswith(".csv") or fname.endswith(".txt"):
            text_data = raw_bytes.decode("utf-8-sig", errors="replace")
            sample = text_data[:2048]
            delim = ";" if sample.count(";") >= sample.count(",") else ("," if sample.count(",") >= sample.count("\t") else "\t")
            reader = csv.reader(io.StringIO(text_data), delimiter=delim)
            for r in reader:
                rows_matrix.append(r)
        else:
            raise HTTPException(status_code=400, detail="Formato inválido. Envie uma planilha .xlsx ou .csv (máx. 10 MB).")

        isbn_col_idx = 0
        qty_col_idx = 1
        start_row = 0
        if rows_matrix:
            first_row = [str(c or "").strip().upper() for c in rows_matrix[0]]
            has_header = any(
                any(k in cell for k in ("ISBN", "EAN", "BARRA", "COD", "QTD", "QUANT"))
                for cell in first_row
            )
            if has_header:
                start_row = 1
                for idx_c, h in enumerate(first_row):
                    if any(k in h for k in ("ISBN", "EAN", "BARRA", "GTIN")):
                        isbn_col_idx = idx_c
                        break
                for idx_c, h in enumerate(first_row):
                    if idx_c != isbn_col_idx and any(k in h for k in ("QTD", "QUANT", "PEDID", "UNID", "EXEMP")):
                        qty_col_idx = idx_c
                        break

        for r in rows_matrix[start_row:]:
            if not r or len(r) <= isbn_col_idx:
                continue
            raw_code = r[isbn_col_idx]
            if isinstance(raw_code, float) and raw_code.is_integer():
                code_str = str(int(raw_code))
            else:
                code_str = _clean_isbn(str(raw_code or ""))
            if not code_str:
                continue
            raw_q = r[qty_col_idx] if len(r) > qty_col_idx and r[qty_col_idx] is not None else 1
            try:
                qty_val = max(1, int(float(str(raw_q).replace(",", ".").strip())))
            except Exception:
                qty_val = 1
            parsed_pairs.append((code_str, qty_val))

    if pasted_text and pasted_text.strip():
        for line in pasted_text.strip().splitlines():
            ln = line.strip()
            if not ln:
                continue
            parts = re.split(r"[;\t,|\s]+", ln)
            code_str = _clean_isbn(parts[0])
            if not code_str or code_str.upper() in ("ISBN", "EAN", "CODIGO"):
                continue
            qty_val = 1
            if len(parts) > 1:
                try:
                    qty_val = max(1, int(float(parts[-1].replace(",", "."))))
                except Exception:
                    qty_val = 1
            parsed_pairs.append((code_str, qty_val))

    if not parsed_pairs:
        raise HTTPException(status_code=400, detail="Nenhum ISBN/Código válido foi identificado na planilha ou texto.")

    # Soma quantidades de ISBNs repetidos na mesma planilha
    aggregated_by_code: Dict[str, int] = {}
    for code_s, q_v in parsed_pairs:
        aggregated_by_code[code_s] = aggregated_by_code.get(code_s, 0) + q_v

    sql_client = HorusSQLClient(db, seller_id)
    codes_list = list(aggregated_by_code.keys())
    code_to_cod_item: Dict[str, int] = {}

    for i in range(0, len(codes_list), 200):
        chunk_codes = codes_list[i:i + 200]
        ph = ", ".join(["%s"] * len(chunk_codes))
        m_rows = sql_client.query(
            f"""
            SELECT COD_ITEM AS cod_item,
                   RTRIM(LTRIM(ISNULL(COD_BARRA_ITEM, ''))) AS barra,
                   RTRIM(LTRIM(ISNULL(COD_ISBN_ITEM, ''))) AS isbn
            FROM ITENS_ESTOQUE_GERAL WITH (NOLOCK)
            WHERE COD_BARRA_ITEM IN ({ph}) OR COD_ISBN_ITEM IN ({ph}) OR CAST(COD_ITEM AS VARCHAR) IN ({ph})
            """,
            tuple(chunk_codes + chunk_codes + chunk_codes),
            max_rows=len(chunk_codes) * 3,
        )
        for mr in (m_rows or []):
            ci = int(mr["cod_item"])
            for cand in (mr.get("barra"), mr.get("isbn"), str(ci)):
                c_clean = _clean_isbn(cand)
                if c_clean and c_clean in aggregated_by_code and c_clean not in code_to_cod_item:
                    code_to_cod_item[c_clean] = ci

    not_found_codes = [c for c in codes_list if c not in code_to_cod_item]
    cod_items_qty: Dict[int, int] = {}
    for c_str, q_val in aggregated_by_code.items():
        if c_str in code_to_cod_item:
            ci = code_to_cod_item[c_str]
            cod_items_qty[ci] = cod_items_qty.get(ci, 0) + q_val

    enriched = _enrich_purchase_items_for_branch_and_supplier(
        db=db,
        sql_client=sql_client,
        seller_id=seller_id,
        branch=branch,
        cod_grp_fornecedor=cod_grp_fornecedor,
        cod_fornecedor=cod_fornecedor,
        cod_items_qty=cod_items_qty,
    )
    unconfigured_count = sum(1 for x in enriched if not x["publisher_configured"])

    return {
        "items": enriched,
        "total_imported": len(enriched),
        "unconfigured_publishers_count": unconfigured_count,
        "not_found_isbns": not_found_codes,
        "message": f"{len(enriched)} item(ns) processado(s) para a filial '{branch['nome']}'.",
    }


@router.get("/template-sheet")
def download_purchase_sheet_template():
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Modelo_Pedido_Compra"
    ws.append(["ISBN", "Quantidade"])
    ws.append(["9788535914849", 5])
    ws.append(["9786559210886", 10])
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    ws.column_dimensions["A"].width = 24
    ws.column_dimensions["B"].width = 16
    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=Modelo_Importacao_Pedido_Compra_Horus.xlsx"},
    )


# ── 6. Geração de Pedido de Compra no Horus ('AP' Aprovado) + Cronuz & Transição 'AE' ─

@router.post("/orders")
def create_horus_purchase_order(
    payload: CreatePurchaseOrderPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Gera o Pedido de Compra de forma atômica e validada em PEDIDOS_COMPRA + ITENS_PEDIDO_COMPRA no Horus SQL
    com status inicial 'AP' (Aprovado, STA_APROVACAO='S'), espelhando em pur_horus_order no Cronuz B2B.
    """
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    branch = _get_branch_or_404(db, seller_id, payload.branch_id)
    emp = int(branch["cod_empresa"])
    fil = int(branch["cod_filial"])
    bid = int(branch["id"])
    uid, uname, horus_user_upper = _user_meta(current_user)

    if not payload.items:
        raise HTTPException(status_code=400, detail="Adicione ao menos 1 item para gerar o pedido de compra.")

    # Trava de Segurança 1: Fornecedor DEVE ter selos/editoras e descontos configurados na filial
    disc_rows = (
        db.query(HorusSupplierPublisherDiscount)
        .filter(
            HorusSupplierPublisherDiscount.company_id == seller_id,
            HorusSupplierPublisherDiscount.branch_id == bid,
            HorusSupplierPublisherDiscount.cod_grp_fornecedor == payload.cod_grp_fornecedor,
            HorusSupplierPublisherDiscount.cod_fornecedor == payload.cod_fornecedor,
            HorusSupplierPublisherDiscount.active == True,
        )
        .all()
    )
    if not disc_rows:
        raise HTTPException(
            status_code=400,
            detail=(
                "Operação bloqueada: este fornecedor ainda não possui selos (editoras) e descontos "
                "configurados para esta filial no Cronuz. Configure os descontos antes de gerar o pedido."
            ),
        )
    disc_by_ed = {int(d.cod_editora): Decimal(str(d.desconto_percentual or 0)) for d in disc_rows}

    # Consolida quantidades e eventuais descontos customizados por cod_item
    req_qty_by_item: Dict[int, int] = {}
    req_disc_override_by_item: Dict[int, Decimal] = {}
    for it in payload.items:
        ci = int(it.cod_item)
        qt = int(it.quantity)
        if ci <= 0 or qt <= 0:
            raise HTTPException(status_code=400, detail="Todos os itens devem ter código válido e quantidade maior que zero.")
        req_qty_by_item[ci] = req_qty_by_item.get(ci, 0) + qt
        if it.discount_pct is not None:
            req_disc_override_by_item[ci] = Decimal(str(it.discount_pct)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    sql_ro = HorusSQLClient(db, seller_id)
    enriched_items = _enrich_purchase_items_for_branch_and_supplier(
        db=db,
        sql_client=sql_ro,
        seller_id=seller_id,
        branch=branch,
        cod_grp_fornecedor=payload.cod_grp_fornecedor,
        cod_fornecedor=payload.cod_fornecedor,
        cod_items_qty=req_qty_by_item,
    )
    if len(enriched_items) != len(req_qty_by_item):
        found_set = {x["cod_item"] for x in enriched_items}
        missing_c = [c for c in req_qty_by_item.keys() if c not in found_set]
        raise HTTPException(status_code=400, detail=f"Itens não encontrados em ITENS_ESTOQUE_GERAL no Horus: {missing_c}")

    # Trava de Segurança 2: NENHUM item pode estar sem editora configurada para este fornecedor na filial ou com preço zero
    invalid_pub_items = [x for x in enriched_items if not x["publisher_configured"]]
    if invalid_pub_items:
        sample_names = ", ".join(
            f"{x['isbn'] or x['cod_item']} ({x['nome_editora']})" for x in invalid_pub_items[:5]
        )
        raise HTTPException(
            status_code=400,
            detail=(
                f"Existem {len(invalid_pub_items)} item(ns) com editora não vinculada a este fornecedor nesta filial: "
                f"{sample_names}. Ajuste a editora do item (Horus+Cronuz) ou cadastre o desconto da editora no fornecedor."
            ),
        )

    zero_price_items = [x for x in enriched_items if float(x["vlr_capa"] or 0) <= 0]
    if zero_price_items:
        sample_zp = ", ".join(str(x["isbn"] or x["cod_item"]) for x in zero_price_items[:5])
        raise HTTPException(
            status_code=400,
            detail=f"Existem itens com Preço de Capa zerado no Horus ({sample_zp}). Regularize antes de gerar o pedido.",
        )

    # Resolve configuração da filial (incluindo Gerar Pendência = SIM por padrão)
    branch_cfg = (
        db.query(HorusPurchaseBranchConfig)
        .filter(HorusPurchaseBranchConfig.company_id == seller_id, HorusPurchaseBranchConfig.branch_id == bid)
        .first()
    )
    eff_local = (
        payload.cod_local
        if payload.cod_local is not None
        else (branch_cfg.cod_local_default if branch_cfg and branch_cfg.cod_local_default is not None else branch.get("cod_local"))
    )
    eff_compra_consig = "S" if str(payload.compra_consig or "N").upper() == "S" else "N"
    if payload.gerar_pendencia is not None and str(payload.gerar_pendencia).strip().upper() in ("S", "N"):
        eff_gerar_pend = str(payload.gerar_pendencia).strip().upper()
    elif branch_cfg and getattr(branch_cfg, "gerar_pendencia_default", None) in ("S", "N"):
        eff_gerar_pend = branch_cfg.gerar_pendencia_default
    else:
        eff_gerar_pend = "S"

    init_hs = "AB" if str(payload.initial_horus_status or "AP").strip().upper() == "AB" else "AP"
    init_sta_aprov = "N" if init_hs == "AB" else "S"
    init_cronuz_status = HORUS_TO_CRONUZ_STATUS.get(init_hs, "APPROVED")

    # Cálculos financeiros exatos em Decimal (padrão Horus PEDIDOS_COMPRA + ITENS_PEDIDO_COMPRA)
    prepared_lines = []
    total_qty = 0
    total_gross = Decimal("0.00")
    total_net = Decimal("0.00")

    for x in enriched_items:
        ci = int(x["cod_item"])
        qty = int(x["quantity"])
        ce = int(x["cod_editora"])
        disc_pct = req_disc_override_by_item.get(
            ci,
            disc_by_ed[ce].quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        )
        cover_dec = Decimal(str(x["vlr_capa"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        unit_net_dec = (cover_dec * (Decimal("100") - disc_pct) / Decimal("100")).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
        line_gross = (cover_dec * Decimal(qty)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        line_net = (unit_net_dec * Decimal(qty)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        total_qty += qty
        total_gross += line_gross
        total_net += line_net

        prepared_lines.append({
            "cod_item": ci,
            "isbn": x["isbn"],
            "nome_item": x["nome_item"],
            "cod_editora": ce,
            "nome_editora": x["nome_editora"],
            "quantity": qty,
            "cover_dec": cover_dec,
            "disc_pct": disc_pct,
            "unit_net_dec": unit_net_dec,
            "line_gross": line_gross,
            "line_net": line_net,
            "stock_available": int(x.get("stock_available") or 0),
            "consigned_received": int(x.get("consigned_received") or 0),
        })

    total_discount = (total_gross - total_net).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    avg_disc_pct = (
        ((total_discount / total_gross) * Decimal("100")).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        if total_gross > 0
        else Decimal("0.0000")
    )

    # Transação Atômica no SQL Server do Horus
    conn = _open_horus_tx_connection(db, seller_id)
    horus_cod_pedido: Optional[int] = None
    sup_nom = ""
    sup_cnpj = ""
    sup_email = ""
    eff_dept: Optional[int] = None
    eff_ccusto: Optional[int] = None

    try:
        with conn.cursor() as cur:
            # Valida existência do fornecedor em FORNECEDORES_GERAL (FK_PEDIDOS_COMPRA_FORNECEDORES)
            cur.execute(
                """
                SELECT TOP 1
                    RTRIM(LTRIM(ISNULL(FG.NOM_FORNECEDOR, ''))) AS nom_fornecedor,
                    RTRIM(LTRIM(ISNULL(FG.CNPF_CNPJ, ISNULL(FG.CPF, '')))) AS cnpj,
                    RTRIM(LTRIM(ISNULL(FG.END_EMAIL_PED_COMPRAS, ISNULL(FG.END_EMAIL, '')))) AS email,
                    GF.COD_DEPARTAMENTO AS grp_dept
                FROM FORNECEDORES_GERAL FG WITH (NOLOCK)
                LEFT JOIN GRUPO_FORNECEDORES GF WITH (NOLOCK)
                    ON GF.COD_EMPRESA = FG.COD_EMPRESA AND GF.COD_FILIAL = FG.COD_FILIAL
                    AND GF.COD_GRP_FORNECEDOR = FG.COD_GRP_FORNECEDOR
                WHERE FG.COD_EMPRESA = %s AND FG.COD_FILIAL = %s
                  AND FG.COD_GRP_FORNECEDOR = %s AND FG.COD_FORNECEDOR = %s
                """,
                (emp, fil, payload.cod_grp_fornecedor, payload.cod_fornecedor),
            )
            sup_db = cur.fetchone()
            if not sup_db:
                conn.rollback()
                raise HTTPException(
                    status_code=400,
                    detail="Fornecedor não encontrado em FORNECEDORES_GERAL para esta Empresa/Filial no Horus.",
                )
            sup_nom = str(sup_db.get("nom_fornecedor") or "")
            sup_cnpj = _clean_digits(sup_db.get("cnpj"))
            sup_email = str(sup_db.get("email") or "")

            # Resolve COD_DEPARTAMENTO garantindo integridade da FK_PEDIDOS_COMPRA_DEPARTAMENTOS
            cand_dept = (
                payload.cod_departamento
                or (branch_cfg.cod_departamento_default if branch_cfg else None)
                or sup_db.get("grp_dept")
            )
            if cand_dept is not None:
                cur.execute(
                    "SELECT TOP 1 COD_DEPARTAMENTO FROM DEPARTAMENTOS_GERAL WITH (NOLOCK) WHERE COD_EMPRESA = %s AND COD_FILIAL = %s AND COD_DEPARTAMENTO = %s",
                    (emp, fil, int(cand_dept)),
                )
                if cur.fetchone():
                    eff_dept = int(cand_dept)
            if eff_dept is None:
                cur.execute(
                    """
                    SELECT TOP 1 COD_DEPARTAMENTO, COD_CENTRO_CUSTO
                    FROM PEDIDOS_COMPRA WITH (NOLOCK)
                    WHERE COD_EMPRESA = %s AND COD_FILIAL = %s AND COD_DEPARTAMENTO IS NOT NULL
                    ORDER BY DAT_PEDIDO DESC
                    """,
                    (emp, fil),
                )
                last_pc = cur.fetchone()
                if last_pc and last_pc.get("COD_DEPARTAMENTO") is not None:
                    cur.execute(
                        "SELECT TOP 1 COD_DEPARTAMENTO FROM DEPARTAMENTOS_GERAL WITH (NOLOCK) WHERE COD_EMPRESA = %s AND COD_FILIAL = %s AND COD_DEPARTAMENTO = %s",
                        (emp, fil, int(last_pc["COD_DEPARTAMENTO"])),
                    )
                    if cur.fetchone():
                        eff_dept = int(last_pc["COD_DEPARTAMENTO"])
                    if last_pc.get("COD_CENTRO_CUSTO") is not None:
                        eff_ccusto = int(last_pc["COD_CENTRO_CUSTO"])

            if payload.cod_centro_custo is not None:
                eff_ccusto = int(payload.cod_centro_custo)
            elif branch_cfg and branch_cfg.cod_centro_custo_default is not None:
                eff_ccusto = int(branch_cfg.cod_centro_custo_default)

            # Reserva próximo COD_PEDIDO na Empresa/Filial com UPDLOCK + HOLDLOCK (evita colisão concorrente)
            cur.execute(
                """
                SELECT ISNULL(MAX(COD_PEDIDO), 0) + 1 AS next_ped
                FROM PEDIDOS_COMPRA WITH (UPDLOCK, HOLDLOCK)
                WHERE COD_EMPRESA = %s AND COD_FILIAL = %s
                """,
                (emp, fil),
            )
            next_row = cur.fetchone()
            horus_cod_pedido = int(next_row["next_ped"]) if next_row else 1

            # Insere cabeçalho em PEDIDOS_COMPRA respeitando GERAR_PEND e status inicial (AP ou AB)
            cur.execute(
                """
                INSERT INTO PEDIDOS_COMPRA (
                    COD_GRP_FORNECEDOR,
                    COD_FORNECEDOR,
                    COD_PEDIDO,
                    COD_EMPRESA,
                    COD_FILIAL,
                    TIP_SITUACAO,
                    COD_SITUACAO,
                    COD_DEPARTAMENTO,
                    COD_CENTRO_CUSTO,
                    DAT_PEDIDO,
                    QTD_ITENS,
                    VLR_TOTAL_PEDIDO,
                    VLR_TOTAL_DESCONTO,
                    PER_TOTAL_DESCONTO,
                    QTD_ITENS_ATENDIDOS,
                    STA_APROVACAO,
                    DAT_STATUS,
                    STATUS_PEDIDO_COMPRA,
                    DAT_ULT_ATL,
                    NOM_USUARIO,
                    COMPRA_CONSIG,
                    GERAR_PEND,
                    USU_APROVACAO,
                    COD_LOCAL,
                    STA_IMPORTADOS,
                    VLR_FRETE
                ) VALUES (
                    %s, %s, %s, %s, %s,
                    'C', 1, %s, %s, GETDATE(),
                    %s, %s, %s, %s, 0,
                    %s, GETDATE(), %s, GETDATE(), %s,
                    %s, %s, %s, %s, 'N', 0
                )
                """,
                (
                    int(payload.cod_grp_fornecedor),
                    int(payload.cod_fornecedor),
                    horus_cod_pedido,
                    emp,
                    fil,
                    eff_dept,
                    eff_ccusto,
                    total_qty,
                    total_gross,
                    total_discount,
                    avg_disc_pct,
                    init_sta_aprov,
                    init_hs,
                    horus_user_upper,
                    eff_compra_consig,
                    eff_gerar_pend,
                    horus_user_upper if init_hs == "AP" else None,
                    int(eff_local) if eff_local is not None else None,
                ),
            )

            # Insere todos os itens em ITENS_PEDIDO_COMPRA (VLR_DESCONTO = % conforme padrão nativo Horus)
            for ln in prepared_lines:
                cur.execute(
                    """
                    INSERT INTO ITENS_PEDIDO_COMPRA (
                        TIP_SITUACAO,
                        COD_SITUACAO,
                        COD_EMPRESA,
                        COD_FILIAL,
                        COD_GRP_FORNECEDOR,
                        COD_FORNECEDOR,
                        COD_PEDIDO,
                        COD_ITEM,
                        QT_PEDIDA,
                        QTD_ATENDIDA,
                        VLR_PRECO,
                        VLR_DESCONTO,
                        DAT_STATUS_ITEM,
                        STATUS_ITEM_PEDIDO,
                        DAT_ULT_ATL,
                        NOM_USUARIO,
                        VLR_LIQUIDO
                    ) VALUES (
                        'C', 1, %s, %s, %s, %s, %s, %s,
                        %s, 0, %s, %s, GETDATE(), 'AB', GETDATE(), %s, %s
                    )
                    """,
                    (
                        emp,
                        fil,
                        int(payload.cod_grp_fornecedor),
                        int(payload.cod_fornecedor),
                        horus_cod_pedido,
                        ln["cod_item"],
                        ln["quantity"],
                        ln["cover_dec"],
                        ln["disc_pct"],
                        horus_user_upper,
                        ln["unit_net_dec"],
                    ),
                )

            # Insere observação em OBS_PEDIDO_COMPRA (em CAIXA ALTA) caso preenchida
            obs_upper = _to_upper_horus(payload.observations, 250)
            if obs_upper:
                cur.execute(
                    """
                    INSERT INTO OBS_PEDIDO_COMPRA (
                        DAT_OBS, COD_EMPRESA, COD_FILIAL, COD_GRP_FORNECEDOR,
                        COD_FORNECEDOR, COD_PEDIDO, TIP_SITUACAO, COD_SITUACAO, OBS
                    ) VALUES (
                        GETDATE(), %s, %s, %s, %s, %s, 'C', 1, %s
                    )
                    """,
                    (
                        emp,
                        fil,
                        int(payload.cod_grp_fornecedor),
                        int(payload.cod_fornecedor),
                        horus_cod_pedido,
                        obs_upper,
                    ),
                )

            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        log.error(f"[HorusPurchases] Falha ao gravar PEDIDOS_COMPRA no Horus SQL: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro ao gravar Pedido de Compra no Horus SQL: {e}")
    finally:
        try:
            conn.close()
        except Exception:
            pass

    # Persiste espelho + itens + log inicial no PostgreSQL do Cronuz
    new_order = HorusPurchaseOrder(
        company_id=seller_id,
        branch_id=bid,
        branch_name=branch["nome"],
        branch_cnpj=branch.get("cnpj") or None,
        cod_empresa=emp,
        cod_filial=fil,
        cod_local=int(eff_local) if eff_local is not None else None,
        cod_departamento=eff_dept,
        cod_centro_custo=eff_ccusto,
        cod_grp_fornecedor=int(payload.cod_grp_fornecedor),
        cod_fornecedor=int(payload.cod_fornecedor),
        cnpj_fornecedor=sup_cnpj or None,
        nome_fornecedor=sup_nom[:150] or f"FORNECEDOR #{payload.cod_fornecedor}",
        email_fornecedor=sup_email[:255] or None,
        horus_cod_pedido=horus_cod_pedido,
        compra_consig=eff_compra_consig,
        gerar_pendencia=eff_gerar_pend,
        status=init_cronuz_status,
        horus_status=init_hs,
        total_skus=len(prepared_lines),
        total_quantity=total_qty,
        total_gross=total_gross,
        total_discount=total_discount,
        total_net=total_net,
        avg_discount_pct=avg_disc_pct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        observations=(payload.observations or "").strip() or None,
        created_by_user_id=uid,
        created_by_name=uname,
        updated_by_user_id=uid,
        updated_by_name=uname,
    )
    db.add(new_order)
    db.flush()

    for ln in prepared_lines:
        db.add(HorusPurchaseOrderItem(
            order_id=new_order.id,
            cod_item=ln["cod_item"],
            isbn=ln["isbn"][:30] if ln["isbn"] else None,
            nome_item=ln["nome_item"][:255],
            cod_editora=ln["cod_editora"],
            nome_editora=ln["nome_editora"][:150] if ln["nome_editora"] else None,
            quantity=ln["quantity"],
            unit_cover_price=ln["cover_dec"],
            discount_pct=ln["disc_pct"],
            unit_net_price=ln["unit_net_dec"],
            subtotal_gross=ln["line_gross"],
            subtotal_net=ln["line_net"],
            stock_at_order=ln["stock_available"],
            consigned_at_order=ln["consigned_received"],
        ))

    pend_lbl = "SIM" if eff_gerar_pend == "S" else "NÃO"
    db.add(HorusPurchaseOrderLog(
        order_id=new_order.id,
        action=f"CREATED_{init_hs}",
        old_status=None,
        new_status=init_cronuz_status,
        old_horus_status=None,
        new_horus_status=init_hs,
        details=(
            f"Pedido #{horus_cod_pedido} gerado no Horus SQL com status {init_hs} ({HORUS_STATUS_LABELS.get(init_hs, init_hs)}) "
            f"e Gerar Pendência={pend_lbl} na filial '{branch['nome']}' ({len(prepared_lines)} títulos, {total_qty} exemplares, líquido R$ {total_net})."
        ),
        user_id=uid,
        user_name=uname,
    ))
    db.commit()
    db.refresh(new_order)

    return {
        "success": True,
        "order_id": new_order.id,
        "horus_cod_pedido": horus_cod_pedido,
        "status": new_order.status,
        "horus_status": new_order.horus_status,
        "gerar_pendencia": new_order.gerar_pendencia,
        "total_skus": new_order.total_skus,
        "total_quantity": new_order.total_quantity,
        "total_gross": float(new_order.total_gross),
        "total_net": float(new_order.total_net),
        "message": f"Pedido de Compra #{horus_cod_pedido} gerado com sucesso no Horus com status {init_hs} ({HORUS_STATUS_LABELS.get(init_hs, init_hs)})!",
    }


_HORUS_ORDER_SAFETY_SQL = """
    SELECT TOP 1
        RTRIM(LTRIM(ISNULL(PC.STATUS_PEDIDO_COMPRA, ''))) AS live_status,
        RTRIM(LTRIM(ISNULL(PC.GERAR_PEND, 'S'))) AS gerar_pend,
        PC.DAT_ENCERRAMENTO AS dat_encerramento,
        ISNULL(PC.QTD_ITENS_ATENDIDOS, 0) AS hdr_atendidos,
        (
            SELECT ISNULL(SUM(ISNULL(IPC.QTD_ATENDIDA, 0)), 0)
            FROM ITENS_PEDIDO_COMPRA IPC WITH (NOLOCK)
            WHERE IPC.COD_EMPRESA = PC.COD_EMPRESA
              AND IPC.COD_FILIAL = PC.COD_FILIAL
              AND IPC.COD_PEDIDO = PC.COD_PEDIDO
        ) AS itens_atendidos_sum,
        (
            SELECT COUNT(1)
            FROM DIVERGENCIAS_PEDIDO_COMPRA DPC WITH (NOLOCK)
            WHERE DPC.COD_EMPRESA = PC.COD_EMPRESA
              AND DPC.COD_FILIAL = PC.COD_FILIAL
              AND DPC.COD_PEDIDO = PC.COD_PEDIDO
        ) AS divergencias_cnt,
        (
            SELECT COUNT(1)
            FROM NF_ENTRADA NE WITH (NOLOCK)
            WHERE NE.COD_EMPRESA = PC.COD_EMPRESA
              AND NE.COD_FILIAL = PC.COD_FILIAL
              AND NE.COD_PEDIDO = PC.COD_PEDIDO
              AND ISNULL(NE.SIT_NF, '') NOT IN ('C', 'CAN')
        ) AS nf_entrada_cnt,
        (
            SELECT COUNT(1)
            FROM VINC_NF_EMIT_PED_COMP VN WITH (NOLOCK)
            WHERE VN.COD_EMPRESA_PED = PC.COD_EMPRESA
              AND VN.COD_FILIAL_PED = PC.COD_FILIAL
              AND VN.COD_PEDIDO = PC.COD_PEDIDO
        ) AS vinc_nf_cnt
    FROM PEDIDOS_COMPRA PC
    WHERE PC.COD_EMPRESA = %s AND PC.COD_FILIAL = %s AND PC.COD_PEDIDO = %s
"""


def _evaluate_horus_safety_row(row: Optional[Dict[str, Any]], fallback_status: str = "AP") -> Dict[str, Any]:
    if not row:
        return {
            "exists_in_horus": False,
            "live_horus_status": fallback_status,
            "gerar_pendencia": "S",
            "is_finalized": fallback_status in ("EE", "FE"),
            "conferred_qty": 0,
            "divergences_count": 0,
            "has_conferred_items": False,
            "linked_nf_count": 0,
            "has_linked_nf": False,
            "has_blocking_movement": fallback_status in ("EE", "FE"),
            "can_modify": fallback_status in ("AB", "AP", "AE"),
            "can_cancel": fallback_status in ("AB", "AP", "AE"),
            "can_reopen": fallback_status == "CA",
            "can_append_items": fallback_status in ("AB", "AP", "AE", "AC", "IP"),
            "block_reason": (
                "Pedido finalizado/encerrado (EE) não permite alterações."
                if fallback_status in ("EE", "FE")
                else None
            ),
        }

    live_st = str(row.get("live_status") or fallback_status).strip().upper()
    gp = "N" if str(row.get("gerar_pend") or "S").strip().upper() == "N" else "S"
    is_fin = live_st in ("EE", "FE") or (row.get("dat_encerramento") is not None)
    conf_qty = max(
        int(float(row.get("hdr_atendidos") or 0)),
        int(float(row.get("itens_atendidos_sum") or 0)),
    )
    div_cnt = int(row.get("divergencias_cnt") or 0)
    has_conf = conf_qty > 0 or div_cnt > 0
    nf_cnt = int(row.get("nf_entrada_cnt") or 0) + int(row.get("vinc_nf_cnt") or 0)
    has_nf = nf_cnt > 0
    blocked_mov = is_fin or has_conf or has_nf

    reason: Optional[str] = None
    if is_fin:
        reason = "Operação bloqueada: este pedido já está Finalizado/Encerrado (EE) no Horus com movimentação gerada."
    elif has_nf:
        reason = (
            f"Operação bloqueada por segurança: este pedido já possui {nf_cnt} Nota(s) Fiscal(is) de Entrada vinculada(s) no Horus."
        )
    elif has_conf:
        reason = (
            f"Operação bloqueada por segurança: este pedido já possui itens conferidos/atendidos no Horus "
            f"({conf_qty} exemplar(es) conferido(s))."
        )
    elif live_st not in ("AB", "AP", "AE", "CA"):
        reason = (
            f"Pedido com status '{live_st}' ({HORUS_STATUS_LABELS.get(live_st, live_st)}) no Horus não permite edição direta de status."
        )

    return {
        "exists_in_horus": True,
        "live_horus_status": live_st,
        "gerar_pendencia": gp,
        "is_finalized": is_fin,
        "conferred_qty": conf_qty,
        "divergences_count": div_cnt,
        "has_conferred_items": has_conf,
        "linked_nf_count": nf_cnt,
        "has_linked_nf": has_nf,
        "has_blocking_movement": blocked_mov,
        "can_modify": (not blocked_mov) and (live_st in ("AB", "AP", "AE")),
        "can_cancel": (not blocked_mov) and (live_st in ("AB", "AP", "AE")),
        "can_reopen": (not blocked_mov) and (live_st == "CA"),
        "can_append_items": (not blocked_mov) and (live_st in ("AB", "AP", "AE", "AC", "IP")),
        "block_reason": reason,
    }


def _inspect_order_horus_safety_ro(db: Session, seller_id: int, order: HorusPurchaseOrder) -> Dict[str, Any]:
    if not order.horus_cod_pedido:
        return _evaluate_horus_safety_row(None, order.horus_status or "AP")
    try:
        sql_client = HorusSQLClient(db, seller_id)
        rows = sql_client.query(
            _HORUS_ORDER_SAFETY_SQL,
            (int(order.cod_empresa), int(order.cod_filial), int(order.horus_cod_pedido)),
            max_rows=1,
        )
        return _evaluate_horus_safety_row(rows[0] if rows else None, order.horus_status or "AP")
    except Exception as e:
        log.debug(f"[HorusPurchases] Aviso ao inspecionar segurança do pedido #{order.horus_cod_pedido}: {e}")
        return _evaluate_horus_safety_row(None, order.horus_status or "AP")


def _transition_order_status_in_horus_and_cronuz(
    db: Session,
    seller_id: int,
    order: HorusPurchaseOrder,
    new_horus_status: str,
    current_user: Any,
    notes: Optional[str] = None,
) -> None:
    target_hs = _to_upper_horus(new_horus_status, 2)
    if target_hs not in ("AB", "AP", "AE", "CA"):
        raise HTTPException(
            status_code=400,
            detail=f"Status de destino '{target_hs}' inválido. Permitidos pelo Cronuz: AB (Digitação), AP (Aprovado), AE (Aguardando Entrega) ou CA (Cancelado).",
        )

    uid, uname, horus_user_upper = _user_meta(current_user)
    old_hs = order.horus_status
    old_st = order.status
    new_st = HORUS_TO_CRONUZ_STATUS.get(target_hs, "APPROVED")

    conn = _open_horus_tx_connection(db, seller_id)
    try:
        with conn.cursor() as cur:
            cur.execute(
                _HORUS_ORDER_SAFETY_SQL,
                (order.cod_empresa, order.cod_filial, order.horus_cod_pedido),
            )
            cur_row = cur.fetchone()
            if not cur_row:
                conn.rollback()
                raise HTTPException(
                    status_code=404,
                    detail=f"Pedido #{order.horus_cod_pedido} não encontrado em PEDIDOS_COMPRA no Horus.",
                )

            safety = _evaluate_horus_safety_row(cur_row, old_hs)
            live_st = safety["live_horus_status"]

            if safety["has_blocking_movement"]:
                conn.rollback()
                raise HTTPException(status_code=400, detail=safety["block_reason"])

            if target_hs == "CA":
                if live_st not in ("AB", "AP", "AE"):
                    conn.rollback()
                    raise HTTPException(
                        status_code=400,
                        detail=f"Somente pedidos com status AB, AP ou AE podem ser cancelados (status atual no Horus: {live_st}).",
                    )
            else:
                if live_st == "CA":
                    if target_hs not in ("AB", "AP"):
                        conn.rollback()
                        raise HTTPException(
                            status_code=400,
                            detail="Pedidos cancelados (CA) devem ser reativados primeiro para Digitação (AB) ou Aprovado (AP).",
                        )
                elif live_st not in ("AB", "AP", "AE"):
                    conn.rollback()
                    raise HTTPException(
                        status_code=400,
                        detail=f"Somente pedidos em AB, AP ou AE podem ter o status alterado pelo Cronuz (status atual no Horus: {live_st}).",
                    )

            if target_hs == "AB":
                cur.execute(
                    """
                    UPDATE PEDIDOS_COMPRA
                    SET STATUS_PEDIDO_COMPRA = 'AB',
                        STA_APROVACAO = 'N',
                        DAT_CANCELAMENTO = NULL,
                        DAT_AE = NULL,
                        DAT_STATUS = GETDATE(),
                        DAT_ULT_ATL = GETDATE(),
                        NOM_USUARIO = %s
                    WHERE COD_EMPRESA = %s AND COD_FILIAL = %s AND COD_PEDIDO = %s
                    """,
                    (horus_user_upper, order.cod_empresa, order.cod_filial, order.horus_cod_pedido),
                )
            elif target_hs == "AE":
                cur.execute(
                    """
                    UPDATE PEDIDOS_COMPRA
                    SET STATUS_PEDIDO_COMPRA = 'AE',
                        STA_APROVACAO = 'S',
                        DAT_CANCELAMENTO = NULL,
                        DAT_AE = GETDATE(),
                        DAT_STATUS = GETDATE(),
                        DAT_ULT_ATL = GETDATE(),
                        NOM_USUARIO = %s
                    WHERE COD_EMPRESA = %s AND COD_FILIAL = %s AND COD_PEDIDO = %s
                    """,
                    (horus_user_upper, order.cod_empresa, order.cod_filial, order.horus_cod_pedido),
                )
            elif target_hs == "CA":
                cur.execute(
                    """
                    UPDATE PEDIDOS_COMPRA
                    SET STATUS_PEDIDO_COMPRA = 'CA',
                        DAT_CANCELAMENTO = GETDATE(),
                        DAT_STATUS = GETDATE(),
                        DAT_ULT_ATL = GETDATE(),
                        NOM_USUARIO = %s
                    WHERE COD_EMPRESA = %s AND COD_FILIAL = %s AND COD_PEDIDO = %s
                    """,
                    (horus_user_upper, order.cod_empresa, order.cod_filial, order.horus_cod_pedido),
                )
            else:
                cur.execute(
                    """
                    UPDATE PEDIDOS_COMPRA
                    SET STATUS_PEDIDO_COMPRA = 'AP',
                        STA_APROVACAO = 'S',
                        USU_APROVACAO = %s,
                        DAT_CANCELAMENTO = NULL,
                        DAT_AE = NULL,
                        DAT_STATUS = GETDATE(),
                        DAT_ULT_ATL = GETDATE(),
                        NOM_USUARIO = %s
                    WHERE COD_EMPRESA = %s AND COD_FILIAL = %s AND COD_PEDIDO = %s
                    """,
                    (horus_user_upper, horus_user_upper, order.cod_empresa, order.cod_filial, order.horus_cod_pedido),
                )
            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Falha ao atualizar status em PEDIDOS_COMPRA no Horus: {e}")
    finally:
        try:
            conn.close()
        except Exception:
            pass

    order.horus_status = target_hs
    order.status = new_st
    order.updated_by_user_id = uid
    order.updated_by_name = uname

    action_code = (
        "REOPENED_FROM_CA"
        if old_hs == "CA" and target_hs in ("AB", "AP")
        else ("ORDER_CANCELLED_CA" if target_hs == "CA" else f"STATUS_CHANGED_{target_hs}")
    )
    db.add(HorusPurchaseOrderLog(
        order_id=order.id,
        action=action_code,
        old_status=old_st,
        new_status=new_st,
        old_horus_status=old_hs,
        new_horus_status=target_hs,
        details=notes or f"Status alterado de {old_hs} para {target_hs} ({HORUS_STATUS_LABELS.get(target_hs, target_hs)}) por {uname}.",
        user_id=uid,
        user_name=uname,
    ))


# ── 7. Listagem, Sincronização de Status, Detalhes e Exportação Excel do Pedido ─

class UpdatePurchaseOrderPayload(BaseModel):
    company_id: Optional[int] = None
    cod_grp_fornecedor: Optional[int] = None
    cod_fornecedor: Optional[int] = None
    compra_consig: Optional[str] = None
    gerar_pendencia: Optional[str] = None
    target_horus_status: Optional[str] = None
    observations: Optional[str] = None
    items: List[CreatePurchaseOrderItemInput]


@router.get("/orders")
def list_horus_purchase_orders(
    branch_id: Optional[int] = Query(None),
    status: Optional[str] = Query("ACTIVE"),
    search: Optional[str] = Query(None),
    sync_horus_status: bool = Query(True),
    limit: int = Query(80, ge=1, le=200),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    seller_id = _resolve_seller_id(current_user, company_id)

    # 1. Sincroniza primeiro pedidos em andamento com PEDIDOS_COMPRA no Horus para que pedidos já
    #    encerrados/finalizados (EE) no Horus mudem imediatamente para Finalizado e saiam da fila ativa!
    if sync_horus_status:
        open_orders = (
            db.query(HorusPurchaseOrder)
            .filter(
                HorusPurchaseOrder.company_id == seller_id,
                HorusPurchaseOrder.horus_status.notin_(["EE", "FE"]),
                *(
                    [HorusPurchaseOrder.branch_id == int(branch_id)]
                    if branch_id is not None
                    else []
                ),
            )
            .order_by(HorusPurchaseOrder.created_at.desc())
            .limit(120)
            .all()
        )
        if open_orders:
            try:
                sql_client = HorusSQLClient(db, seller_id)
                by_pair: Dict[Tuple[int, int], List[HorusPurchaseOrder]] = {}
                for o in open_orders:
                    if o.horus_cod_pedido:
                        by_pair.setdefault((int(o.cod_empresa), int(o.cod_filial)), []).append(o)

                changed_any = False
                for (emp, fil), o_list in by_pair.items():
                    peds_in = ", ".join(str(int(o.horus_cod_pedido)) for o in o_list)
                    st_rows = sql_client.query(
                        f"""
                        SELECT
                            COD_PEDIDO AS cod_pedido,
                            RTRIM(LTRIM(ISNULL(STATUS_PEDIDO_COMPRA, ''))) AS st,
                            RTRIM(LTRIM(ISNULL(GERAR_PEND, 'S'))) AS gp
                        FROM PEDIDOS_COMPRA WITH (NOLOCK)
                        WHERE COD_EMPRESA = %s AND COD_FILIAL = %s AND COD_PEDIDO IN ({peds_in})
                        """,
                        (emp, fil),
                        max_rows=len(o_list) + 5,
                    )
                    live_map = {int(r["cod_pedido"]): r for r in (st_rows or [])}
                    for o in o_list:
                        lr = live_map.get(int(o.horus_cod_pedido or 0))
                        if not lr:
                            continue
                        live_hs = str(lr.get("st") or "").strip().upper()
                        live_gp = "N" if str(lr.get("gp") or "S").strip().upper() == "N" else "S"
                        if getattr(o, "gerar_pendencia", None) != live_gp:
                            o.gerar_pendencia = live_gp
                            changed_any = True
                        if live_hs and live_hs != o.horus_status:
                            old_hs = o.horus_status
                            old_st = o.status
                            if live_hs not in ("EE", "FE", "CA") and o.status in (
                                "XML_OK",
                                "XML_DIVERGENT",
                                "XML_ACCEPTED_DIV",
                                "XML_REJECTED",
                            ):
                                new_st = o.status
                            else:
                                new_st = HORUS_TO_CRONUZ_STATUS.get(live_hs, o.status)
                            o.horus_status = live_hs
                            o.status = new_st
                            db.add(HorusPurchaseOrderLog(
                                order_id=o.id,
                                action="STATUS_SYNCED_FROM_HORUS",
                                old_status=old_st,
                                new_status=new_st,
                                old_horus_status=old_hs,
                                new_horus_status=live_hs,
                                details=f"Status sincronizado automaticamente do Horus SQL ({old_hs} -> {live_hs}).",
                                user_name="Horus Sync",
                            ))
                            changed_any = True
                if changed_any:
                    db.commit()
            except Exception as e:
                log.debug(f"[HorusPurchases] Aviso ao sincronizar status de pedidos com Horus: {e}")

    q_db = db.query(HorusPurchaseOrder).filter(HorusPurchaseOrder.company_id == seller_id)
    if branch_id is not None:
        q_db = q_db.filter(HorusPurchaseOrder.branch_id == int(branch_id))

    st_up = (status or "ACTIVE").strip().upper()
    if st_up == "ACTIVE":
        # Por padrão exibe apenas pedidos ativos (oculta Finalizados EE/FE e Cancelados CA)
        q_db = q_db.filter(HorusPurchaseOrder.horus_status.notin_(["EE", "FE", "CA"]))
    elif st_up in ("FINALIZED", "EE"):
        q_db = q_db.filter(HorusPurchaseOrder.horus_status.in_(["EE", "FE"]))
    elif st_up in ("CANCELLED", "CA"):
        q_db = q_db.filter(HorusPurchaseOrder.horus_status == "CA")
    elif st_up != "ALL":
        q_db = q_db.filter(
            (HorusPurchaseOrder.status == st_up)
            | (HorusPurchaseOrder.horus_status == st_up)
            | (HorusPurchaseOrder.xml_status == st_up)
        )

    if search and search.strip():
        term = f"%{search.strip()}%"
        if search.strip().isdigit():
            q_db = q_db.filter(
                (HorusPurchaseOrder.horus_cod_pedido == int(search.strip()))
                | (HorusPurchaseOrder.nome_fornecedor.ilike(term))
                | (HorusPurchaseOrder.cnpj_fornecedor.ilike(term))
                | (HorusPurchaseOrder.last_nfe_number.ilike(term))
            )
        else:
            q_db = q_db.filter(
                (HorusPurchaseOrder.nome_fornecedor.ilike(term))
                | (HorusPurchaseOrder.last_nfe_key.ilike(term))
            )

    orders = q_db.order_by(HorusPurchaseOrder.created_at.desc()).limit(limit).all()

    return {
        "orders": [
            {
                "id": o.id,
                "branch_id": o.branch_id,
                "branch_name": o.branch_name,
                "cod_empresa": o.cod_empresa,
                "cod_filial": o.cod_filial,
                "cod_grp_fornecedor": o.cod_grp_fornecedor,
                "cod_fornecedor": o.cod_fornecedor,
                "cnpj_fornecedor": o.cnpj_fornecedor,
                "nome_fornecedor": o.nome_fornecedor,
                "email_fornecedor": o.email_fornecedor,
                "horus_cod_pedido": o.horus_cod_pedido,
                "compra_consig": o.compra_consig,
                "gerar_pendencia": getattr(o, "gerar_pendencia", "S") or "S",
                "status": o.status,
                "horus_status": o.horus_status,
                "status_label": HORUS_STATUS_LABELS.get(o.horus_status, o.status),
                "xml_status": o.xml_status or "NONE",
                "xml_status_label": XML_DECISION_LABELS.get(o.xml_status or "NONE", o.xml_status or "Sem XML"),
                "last_xml_audit_id": o.last_xml_audit_id,
                "last_nfe_number": o.last_nfe_number,
                "last_nfe_series": o.last_nfe_series,
                "last_nfe_key": o.last_nfe_key,
                "xml_checked_at": _fmt_dt(o.xml_checked_at),
                "xml_checked_by_name": o.xml_checked_by_name,
                "total_skus": o.total_skus,
                "total_quantity": o.total_quantity,
                "total_gross": float(o.total_gross or 0.0),
                "total_discount": float(o.total_discount or 0.0),
                "total_net": float(o.total_net or 0.0),
                "avg_discount_pct": float(o.avg_discount_pct or 0.0),
                "observations": o.observations,
                "excel_exported_count": o.excel_exported_count,
                "last_excel_exported_at": _fmt_dt(o.last_excel_exported_at),
                "created_by_name": o.created_by_name,
                "updated_by_name": o.updated_by_name,
                "created_at": _fmt_dt(o.created_at),
                "updated_at": _fmt_dt(o.updated_at),
            }
            for o in orders
        ]
    }


@router.get("/orders/open-candidates")
def list_open_mergeable_orders_for_supplier(
    branch_id: int = Query(...),
    cod_grp_fornecedor: int = Query(...),
    cod_fornecedor: int = Query(...),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Detecta pedidos em aberto (AB), aprovados (AP), aguardando entrega (AE) ou em conferência (AC)
    do mesmo Fornecedor + Filial que NÃO possuam itens conferidos nem NF vinculada no Horus,
    permitindo ao comprador escolher acrescentar os novos itens a um pedido existente ou criar novo pedido.
    """
    seller_id = _resolve_seller_id(current_user, company_id)
    rows = (
        db.query(HorusPurchaseOrder)
        .filter(
            HorusPurchaseOrder.company_id == seller_id,
            HorusPurchaseOrder.branch_id == int(branch_id),
            HorusPurchaseOrder.cod_grp_fornecedor == int(cod_grp_fornecedor),
            HorusPurchaseOrder.cod_fornecedor == int(cod_fornecedor),
            HorusPurchaseOrder.horus_status.notin_(["EE", "FE", "CA"]),
        )
        .order_by(HorusPurchaseOrder.created_at.desc())
        .limit(20)
        .all()
    )

    candidates: List[Dict[str, Any]] = []
    for o in rows:
        safety = _inspect_order_horus_safety_ro(db, seller_id, o)
        live_hs = safety["live_horus_status"]
        if live_hs and live_hs != o.horus_status:
            o.horus_status = live_hs
            o.status = HORUS_TO_CRONUZ_STATUS.get(live_hs, o.status)
        if not safety["can_append_items"]:
            continue
        candidates.append({
            "id": o.id,
            "horus_cod_pedido": o.horus_cod_pedido,
            "horus_status": live_hs,
            "status_label": HORUS_STATUS_LABELS.get(live_hs, live_hs),
            "compra_consig": o.compra_consig,
            "gerar_pendencia": getattr(o, "gerar_pendencia", "S") or "S",
            "total_skus": o.total_skus,
            "total_quantity": o.total_quantity,
            "total_net": float(o.total_net or 0.0),
            "created_at": _fmt_dt(o.created_at),
            "created_by_name": o.created_by_name,
        })
    db.commit()
    return {"candidates": candidates}


@router.post("/orders/{order_id}/append-items")
def append_items_to_existing_purchase_order(
    order_id: int,
    payload: AppendPurchaseOrderItemsPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Acrescenta novos itens (somando quantidades caso o item já exista) a um pedido de compra
    existente (AB, AP, AE ou AC) que ainda não possua itens conferidos nem NF vinculada no Horus.
    """
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    uid, uname, horus_user_upper = _user_meta(current_user)

    order = (
        db.query(HorusPurchaseOrder)
        .filter(HorusPurchaseOrder.id == int(order_id), HorusPurchaseOrder.company_id == seller_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido de compra destino não encontrado.")
    if not payload.items:
        raise HTTPException(status_code=400, detail="Informe ao menos 1 item para acrescentar ao pedido.")

    safety_pre = _inspect_order_horus_safety_ro(db, seller_id, order)
    if not safety_pre["can_append_items"]:
        raise HTTPException(
            status_code=400,
            detail=safety_pre["block_reason"] or "Este pedido não pode receber novos itens no momento.",
        )

    # Monta mapa mesclado: itens já existentes no pedido + novos itens enviados
    merged_qty: Dict[int, int] = {}
    disc_override_map: Dict[int, Decimal] = {}
    for ex_it in order.items:
        ci = int(ex_it.cod_item)
        merged_qty[ci] = merged_qty.get(ci, 0) + int(ex_it.quantity or 0)
        if ex_it.discount_pct is not None:
            disc_override_map[ci] = Decimal(str(ex_it.discount_pct)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    added_skus_count = 0
    added_units_count = 0
    for inp in payload.items:
        ci = int(inp.cod_item)
        qt = int(inp.quantity)
        if ci not in merged_qty:
            added_skus_count += 1
        added_units_count += qt
        merged_qty[ci] = merged_qty.get(ci, 0) + qt
        if inp.discount_pct is not None:
            disc_override_map[ci] = Decimal(str(inp.discount_pct)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    merged_inputs = [
        CreatePurchaseOrderItemInput(
            cod_item=ci,
            quantity=qt,
            discount_pct=float(disc_override_map[ci]) if ci in disc_override_map else None,
        )
        for ci, qt in merged_qty.items()
    ]

    combined_obs = order.observations
    if payload.observations and payload.observations.strip():
        combined_obs = (
            f"{order.observations} | {payload.observations.strip()}"
            if order.observations
            else payload.observations.strip()
        )

    res = _execute_purchase_order_full_update(
        db=db,
        seller_id=seller_id,
        order=order,
        current_user=current_user,
        items_input=merged_inputs,
        new_cod_grp_fornecedor=None,
        new_cod_fornecedor=None,
        new_compra_consig=None,
        new_gerar_pendencia=None,
        new_target_horus_status=None,
        new_observations=combined_obs,
        allow_ac_append=True,
        custom_log_action="ITEMS_APPENDED",
        custom_log_details=(
            f"Acrescentados +{added_units_count} exemplar(es) ({added_skus_count} título(s) novo(s)) ao pedido "
            f"#{order.horus_cod_pedido or order.id} por {uname}."
        ),
    )
    res["order_id"] = order.id
    res["horus_cod_pedido"] = order.horus_cod_pedido
    res["message"] = (
        f"Itens acrescentados com sucesso ao Pedido #{order.horus_cod_pedido or order.id} "
        f"(Total agora: {order.total_skus} títulos / {order.total_quantity} exemplares)!"
    )
    return res


def _execute_purchase_order_full_update(
    db: Session,
    seller_id: int,
    order: HorusPurchaseOrder,
    current_user: Any,
    items_input: List[CreatePurchaseOrderItemInput],
    new_cod_grp_fornecedor: Optional[int],
    new_cod_fornecedor: Optional[int],
    new_compra_consig: Optional[str],
    new_gerar_pendencia: Optional[str],
    new_target_horus_status: Optional[str],
    new_observations: Optional[str],
    allow_ac_append: bool = False,
    custom_log_action: Optional[str] = None,
    custom_log_details: Optional[str] = None,
) -> Dict[str, Any]:
    uid, uname, horus_user_upper = _user_meta(current_user)
    if not items_input:
        raise HTTPException(status_code=400, detail="O pedido deve possuir ao menos 1 item.")

    target_grp = int(new_cod_grp_fornecedor) if new_cod_grp_fornecedor is not None else int(order.cod_grp_fornecedor)
    target_forn = int(new_cod_fornecedor) if new_cod_fornecedor is not None else int(order.cod_fornecedor)
    supplier_changed = (target_grp != int(order.cod_grp_fornecedor)) or (target_forn != int(order.cod_fornecedor))

    branch = _get_branch_or_404(db, seller_id, int(order.branch_id))
    disc_rows = (
        db.query(HorusSupplierPublisherDiscount)
        .filter(
            HorusSupplierPublisherDiscount.company_id == seller_id,
            HorusSupplierPublisherDiscount.branch_id == int(order.branch_id),
            HorusSupplierPublisherDiscount.cod_grp_fornecedor == target_grp,
            HorusSupplierPublisherDiscount.cod_fornecedor == target_forn,
            HorusSupplierPublisherDiscount.active == True,
        )
        .all()
    )
    if not disc_rows:
        raise HTTPException(
            status_code=400,
            detail="O fornecedor selecionado não possui descontos por selo/editora configurados nesta filial.",
        )
    disc_by_ed = {int(d.cod_editora): Decimal(str(d.desconto_percentual or 0)) for d in disc_rows}

    merged_qty: Dict[int, int] = {}
    disc_override_by_item: Dict[int, Decimal] = {}
    for inp in items_input:
        ci = int(inp.cod_item)
        merged_qty[ci] = merged_qty.get(ci, 0) + int(inp.quantity)
        if inp.discount_pct is not None and not supplier_changed:
            disc_override_by_item[ci] = Decimal(str(inp.discount_pct)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        elif inp.discount_pct is not None and supplier_changed:
            # Se trocou de fornecedor e o usuário informou explicitamente um desconto, aceita; senão aplica o desconto do novo fornecedor
            disc_override_by_item[ci] = Decimal(str(inp.discount_pct)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    sql_ro = HorusSQLClient(db, seller_id)
    enriched_items = _enrich_purchase_items_for_branch_and_supplier(
        db=db,
        sql_client=sql_ro,
        seller_id=seller_id,
        branch=branch,
        cod_grp_fornecedor=target_grp,
        cod_fornecedor=target_forn,
        cod_items_qty=merged_qty,
    )
    if len(enriched_items) != len(merged_qty):
        raise HTTPException(status_code=400, detail="Um ou mais itens não foram encontrados no acervo do Horus.")

    invalid_pub = [x for x in enriched_items if not x["publisher_configured"]]
    if invalid_pub:
        sample = ", ".join(f"{x['isbn'] or x['cod_item']} ({x['nome_editora']})" for x in invalid_pub[:4])
        raise HTTPException(
            status_code=400,
            detail=f"Editora(s) sem desconto configurado para este fornecedor nesta filial: {sample}.",
        )

    zero_price = [x for x in enriched_items if float(x["vlr_capa"] or 0) <= 0]
    if zero_price:
        raise HTTPException(status_code=400, detail="Existem itens com Preço de Capa R$ 0,00 no Horus.")

    prepared_lines = []
    total_qty = 0
    total_gross = Decimal("0.00")
    total_net = Decimal("0.00")

    for x in enriched_items:
        ci = int(x["cod_item"])
        qty = int(x["quantity"])
        ce = int(x["cod_editora"])
        disc_pct = disc_override_by_item.get(
            ci,
            disc_by_ed[ce].quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        )
        cover_dec = Decimal(str(x["vlr_capa"])).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        unit_net_dec = (cover_dec * (Decimal("100") - disc_pct) / Decimal("100")).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
        line_gross = (cover_dec * Decimal(qty)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        line_net = (unit_net_dec * Decimal(qty)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        total_qty += qty
        total_gross += line_gross
        total_net += line_net
        prepared_lines.append({
            "cod_item": ci,
            "isbn": x["isbn"],
            "nome_item": x["nome_item"],
            "cod_editora": ce,
            "nome_editora": x["nome_editora"],
            "quantity": qty,
            "cover_dec": cover_dec,
            "disc_pct": disc_pct,
            "unit_net_dec": unit_net_dec,
            "line_gross": line_gross,
            "line_net": line_net,
            "stock_available": int(x.get("stock_available") or 0),
            "consigned_received": int(x.get("consigned_received") or 0),
        })

    total_discount = (total_gross - total_net).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    avg_disc_pct = (
        ((total_discount / total_gross) * Decimal("100")).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        if total_gross > 0
        else Decimal("0.0000")
    )
    eff_consig = (
        ("S" if str(new_compra_consig).upper() == "S" else "N")
        if new_compra_consig is not None
        else order.compra_consig
    )
    cur_gp = getattr(order, "gerar_pendencia", "S") or "S"
    eff_gerar_pend = (
        ("N" if str(new_gerar_pendencia).strip().upper() == "N" else "S")
        if new_gerar_pendencia is not None
        else cur_gp
    )

    old_sup_name = order.nome_fornecedor
    new_sup_nom = order.nome_fornecedor
    new_sup_cnpj = order.cnpj_fornecedor
    new_sup_email = order.email_fornecedor
    old_hs = order.horus_status
    final_hs = order.horus_status

    if new_target_horus_status and str(new_target_horus_status).strip().upper() in ("AB", "AP", "AE"):
        final_hs = str(new_target_horus_status).strip().upper()

    if order.horus_cod_pedido:
        conn = _open_horus_tx_connection(db, seller_id)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    _HORUS_ORDER_SAFETY_SQL,
                    (order.cod_empresa, order.cod_filial, order.horus_cod_pedido),
                )
                safety_row = cur.fetchone()
                if not safety_row:
                    conn.rollback()
                    raise HTTPException(
                        status_code=404,
                        detail=f"Pedido #{order.horus_cod_pedido} não encontrado em PEDIDOS_COMPRA no Horus.",
                    )
                safety = _evaluate_horus_safety_row(safety_row, order.horus_status)
                if safety["has_blocking_movement"]:
                    conn.rollback()
                    raise HTTPException(status_code=400, detail=safety["block_reason"])

                allowed_live = ("AB", "AP", "AE", "AC", "IP") if allow_ac_append else ("AB", "AP", "AE")
                if safety["live_horus_status"] not in allowed_live:
                    conn.rollback()
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"O pedido #{order.horus_cod_pedido} está com status '{safety['live_horus_status']}' no Horus "
                            "e não pode ser alterado."
                        ),
                    )
                if not new_target_horus_status:
                    final_hs = safety["live_horus_status"]

                if supplier_changed:
                    cur.execute(
                        """
                        SELECT TOP 1
                            RTRIM(LTRIM(ISNULL(FG.NOM_FORNECEDOR, ''))) AS nom_fornecedor,
                            RTRIM(LTRIM(ISNULL(FG.CNPF_CNPJ, ISNULL(FG.CPF, '')))) AS cnpj,
                            RTRIM(LTRIM(ISNULL(FG.END_EMAIL_PED_COMPRAS, ISNULL(FG.END_EMAIL, '')))) AS email
                        FROM FORNECEDORES_GERAL FG WITH (NOLOCK)
                        WHERE FG.COD_EMPRESA = %s AND FG.COD_FILIAL = %s
                          AND FG.COD_GRP_FORNECEDOR = %s AND FG.COD_FORNECEDOR = %s
                        """,
                        (order.cod_empresa, order.cod_filial, target_grp, target_forn),
                    )
                    sup_db = cur.fetchone()
                    if not sup_db:
                        conn.rollback()
                        raise HTTPException(
                            status_code=400,
                            detail="Novo fornecedor não encontrado em FORNECEDORES_GERAL para esta Empresa/Filial no Horus.",
                        )
                    new_sup_nom = str(sup_db.get("nom_fornecedor") or "")[:150] or f"FORNECEDOR #{target_forn}"
                    new_sup_cnpj = _clean_digits(sup_db.get("cnpj")) or None
                    new_sup_email = str(sup_db.get("email") or "")[:255] or None

                # Remove itens e observações anteriores pelo PK do pedido na filial (seguro mesmo trocando fornecedor)
                cur.execute(
                    """
                    DELETE FROM ITENS_PEDIDO_COMPRA
                    WHERE COD_EMPRESA = %s AND COD_FILIAL = %s AND COD_PEDIDO = %s
                    """,
                    (order.cod_empresa, order.cod_filial, order.horus_cod_pedido),
                )

                if new_observations is not None or supplier_changed:
                    cur.execute(
                        """
                        DELETE FROM OBS_PEDIDO_COMPRA
                        WHERE COD_EMPRESA = %s AND COD_FILIAL = %s AND COD_PEDIDO = %s
                        """,
                        (order.cod_empresa, order.cod_filial, order.horus_cod_pedido),
                    )

                sta_aprov_sql = "N" if final_hs == "AB" else "S"
                cur.execute(
                    """
                    UPDATE PEDIDOS_COMPRA
                    SET COD_GRP_FORNECEDOR = %s,
                        COD_FORNECEDOR = %s,
                        QTD_ITENS = %s,
                        VLR_TOTAL_PEDIDO = %s,
                        VLR_TOTAL_DESCONTO = %s,
                        PER_TOTAL_DESCONTO = %s,
                        COMPRA_CONSIG = %s,
                        GERAR_PEND = %s,
                        STATUS_PEDIDO_COMPRA = %s,
                        STA_APROVACAO = %s,
                        DAT_ULT_ATL = GETDATE(),
                        NOM_USUARIO = %s
                    WHERE COD_EMPRESA = %s AND COD_FILIAL = %s AND COD_PEDIDO = %s
                    """,
                    (
                        target_grp,
                        target_forn,
                        total_qty,
                        total_gross,
                        total_discount,
                        avg_disc_pct,
                        eff_consig,
                        eff_gerar_pend,
                        final_hs,
                        sta_aprov_sql,
                        horus_user_upper,
                        order.cod_empresa,
                        order.cod_filial,
                        order.horus_cod_pedido,
                    ),
                )

                for ln in prepared_lines:
                    cur.execute(
                        """
                        INSERT INTO ITENS_PEDIDO_COMPRA (
                            TIP_SITUACAO, COD_SITUACAO, COD_EMPRESA, COD_FILIAL,
                            COD_GRP_FORNECEDOR, COD_FORNECEDOR, COD_PEDIDO, COD_ITEM,
                            QT_PEDIDA, QTD_ATENDIDA, VLR_PRECO, VLR_DESCONTO,
                            DAT_STATUS_ITEM, STATUS_ITEM_PEDIDO, DAT_ULT_ATL, NOM_USUARIO, VLR_LIQUIDO
                        ) VALUES (
                            'C', 1, %s, %s, %s, %s, %s, %s,
                            %s, 0, %s, %s, GETDATE(), 'AB', GETDATE(), %s, %s
                        )
                        """,
                        (
                            order.cod_empresa,
                            order.cod_filial,
                            target_grp,
                            target_forn,
                            order.horus_cod_pedido,
                            ln["cod_item"],
                            ln["quantity"],
                            ln["cover_dec"],
                            ln["disc_pct"],
                            horus_user_upper,
                            ln["unit_net_dec"],
                        ),
                    )

                eff_obs_str = new_observations if new_observations is not None else order.observations
                obs_upper = _to_upper_horus(eff_obs_str, 250)
                if (new_observations is not None or supplier_changed) and obs_upper:
                    cur.execute(
                        """
                        INSERT INTO OBS_PEDIDO_COMPRA (
                            DAT_OBS, COD_EMPRESA, COD_FILIAL, COD_GRP_FORNECEDOR,
                            COD_FORNECEDOR, COD_PEDIDO, TIP_SITUACAO, COD_SITUACAO, OBS
                        ) VALUES (
                            GETDATE(), %s, %s, %s, %s, %s, 'C', 1, %s
                        )
                        """,
                        (
                            order.cod_empresa,
                            order.cod_filial,
                            target_grp,
                            target_forn,
                            order.horus_cod_pedido,
                            obs_upper,
                        ),
                    )

                conn.commit()
        except HTTPException:
            raise
        except Exception as e:
            try:
                conn.rollback()
            except Exception:
                pass
            raise HTTPException(status_code=500, detail=f"Falha ao atualizar pedido no Horus SQL: {e}")
        finally:
            try:
                conn.close()
            except Exception:
                pass

    db.query(HorusPurchaseOrderItem).filter(HorusPurchaseOrderItem.order_id == order.id).delete()
    for ln in prepared_lines:
        db.add(HorusPurchaseOrderItem(
            order_id=order.id,
            cod_item=ln["cod_item"],
            isbn=ln["isbn"][:30] if ln["isbn"] else None,
            nome_item=ln["nome_item"][:255],
            cod_editora=ln["cod_editora"],
            nome_editora=ln["nome_editora"][:150] if ln["nome_editora"] else None,
            quantity=ln["quantity"],
            unit_cover_price=ln["cover_dec"],
            discount_pct=ln["disc_pct"],
            unit_net_price=ln["unit_net_dec"],
            subtotal_gross=ln["line_gross"],
            subtotal_net=ln["line_net"],
            stock_at_order=ln["stock_available"],
            consigned_at_order=ln["consigned_received"],
        ))

    if supplier_changed:
        order.cod_grp_fornecedor = target_grp
        order.cod_fornecedor = target_forn
        order.nome_fornecedor = new_sup_nom
        order.cnpj_fornecedor = new_sup_cnpj
        order.email_fornecedor = new_sup_email

    old_st = order.status
    order.horus_status = final_hs
    order.status = HORUS_TO_CRONUZ_STATUS.get(final_hs, order.status)
    order.compra_consig = eff_consig
    order.gerar_pendencia = eff_gerar_pend
    if new_observations is not None:
        order.observations = new_observations.strip() or None
    order.total_skus = len(prepared_lines)
    order.total_quantity = total_qty
    order.total_gross = total_gross
    order.total_discount = total_discount
    order.total_net = total_net
    order.avg_discount_pct = avg_disc_pct.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    order.updated_by_user_id = uid
    order.updated_by_name = uname

    sup_msg = f" Fornecedor alterado de '{old_sup_name}' para '{new_sup_nom}'." if supplier_changed else ""
    pend_lbl = "SIM" if eff_gerar_pend == "S" else "NÃO"
    db.add(HorusPurchaseOrderLog(
        order_id=order.id,
        action=custom_log_action or ("SUPPLIER_AND_ORDER_EDITED" if supplier_changed else "ORDER_EDITED"),
        old_status=old_st,
        new_status=order.status,
        old_horus_status=old_hs,
        new_horus_status=final_hs,
        details=custom_log_details or (
            f"Pedido editado por {uname}:{sup_msg} {len(prepared_lines)} título(s), {total_qty} exemplar(es), "
            f"líquido R$ {total_net}, Pendência={pend_lbl}, Status={final_hs}."
        ),
        user_id=uid,
        user_name=uname,
    ))
    db.commit()
    return {
        "success": True,
        "message": f"Pedido #{order.horus_cod_pedido or order.id} atualizado com sucesso no Horus e no Cronuz!",
    }


@router.put("/orders/{order_id}")
def update_horus_purchase_order_items(
    order_id: int,
    payload: UpdatePurchaseOrderPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Edita itens/quantidades/descontos, troca fornecedor, ajusta Gerar Pendência (SIM/NÃO),
    modalidade e status (AB/AP/AE) de um Pedido de Compra, bloqueando com segurança total caso
    já esteja finalizado, possua itens conferidos ou notas fiscais vinculadas no Horus.
    """
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    order = (
        db.query(HorusPurchaseOrder)
        .filter(HorusPurchaseOrder.id == int(order_id), HorusPurchaseOrder.company_id == seller_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido de compra não encontrado.")

    return _execute_purchase_order_full_update(
        db=db,
        seller_id=seller_id,
        order=order,
        current_user=current_user,
        items_input=payload.items,
        new_cod_grp_fornecedor=payload.cod_grp_fornecedor,
        new_cod_fornecedor=payload.cod_fornecedor,
        new_compra_consig=payload.compra_consig,
        new_gerar_pendencia=payload.gerar_pendencia,
        new_target_horus_status=payload.target_horus_status,
        new_observations=payload.observations,
        allow_ac_append=False,
    )


@router.get("/orders/{order_id}")
def get_horus_purchase_order_detail(
    order_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    seller_id = _resolve_seller_id(current_user, company_id)
    order = (
        db.query(HorusPurchaseOrder)
        .filter(HorusPurchaseOrder.id == order_id, HorusPurchaseOrder.company_id == seller_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido de compra não encontrado.")

    safety = _inspect_order_horus_safety_ro(db, seller_id, order)
    live_hs = safety.get("live_horus_status")
    live_gp = safety.get("gerar_pendencia")
    dirty = False
    if live_gp in ("S", "N") and getattr(order, "gerar_pendencia", None) != live_gp:
        order.gerar_pendencia = live_gp
        dirty = True
    if live_hs and live_hs != order.horus_status:
        old_hs = order.horus_status
        old_st = order.status
        order.horus_status = live_hs
        if live_hs in ("EE", "FE", "CA") or order.status not in (
            "XML_OK",
            "XML_DIVERGENT",
            "XML_ACCEPTED_DIV",
            "XML_REJECTED",
        ):
            order.status = HORUS_TO_CRONUZ_STATUS.get(live_hs, order.status)
        db.add(HorusPurchaseOrderLog(
            order_id=order.id,
            action="STATUS_SYNCED_FROM_HORUS",
            old_status=old_st,
            new_status=order.status,
            old_horus_status=old_hs,
            new_horus_status=live_hs,
            details=f"Status sincronizado automaticamente do Horus SQL ({old_hs} -> {live_hs}).",
            user_name="Horus Sync",
        ))
        dirty = True
    if dirty:
        db.commit()
        db.refresh(order)

    return {
        "order": {
            "id": order.id,
            "branch_id": order.branch_id,
            "branch_name": order.branch_name,
            "branch_cnpj": order.branch_cnpj,
            "cod_empresa": order.cod_empresa,
            "cod_filial": order.cod_filial,
            "cod_local": order.cod_local,
            "cod_grp_fornecedor": order.cod_grp_fornecedor,
            "cod_fornecedor": order.cod_fornecedor,
            "cnpj_fornecedor": order.cnpj_fornecedor,
            "nome_fornecedor": order.nome_fornecedor,
            "email_fornecedor": order.email_fornecedor,
            "horus_cod_pedido": order.horus_cod_pedido,
            "compra_consig": order.compra_consig,
            "gerar_pendencia": getattr(order, "gerar_pendencia", "S") or "S",
            "status": order.status,
            "horus_status": order.horus_status,
            "status_label": HORUS_STATUS_LABELS.get(order.horus_status, order.status),
            "xml_status": order.xml_status or "NONE",
            "xml_status_label": XML_DECISION_LABELS.get(order.xml_status or "NONE", order.xml_status or "Sem XML"),
            "last_xml_audit_id": order.last_xml_audit_id,
            "last_nfe_number": order.last_nfe_number,
            "last_nfe_series": order.last_nfe_series,
            "last_nfe_key": order.last_nfe_key,
            "xml_checked_at": _fmt_dt(order.xml_checked_at),
            "xml_checked_by_name": order.xml_checked_by_name,
            "total_skus": order.total_skus,
            "total_quantity": order.total_quantity,
            "total_gross": float(order.total_gross or 0.0),
            "total_discount": float(order.total_discount or 0.0),
            "total_net": float(order.total_net or 0.0),
            "avg_discount_pct": float(order.avg_discount_pct or 0.0),
            "observations": order.observations,
            "excel_exported_count": order.excel_exported_count,
            "last_excel_exported_at": _fmt_dt(order.last_excel_exported_at),
            "created_by_name": order.created_by_name,
            "updated_by_name": order.updated_by_name,
            "created_at": _fmt_dt(order.created_at),
            "updated_at": _fmt_dt(order.updated_at),
            "safety": safety,
        },
        "items": [
            {
                "id": it.id,
                "cod_item": it.cod_item,
                "isbn": it.isbn,
                "nome_item": it.nome_item,
                "cod_editora": it.cod_editora,
                "nome_editora": it.nome_editora,
                "quantity": it.quantity,
                "unit_cover_price": float(it.unit_cover_price or 0.0),
                "discount_pct": float(it.discount_pct or 0.0),
                "unit_net_price": float(it.unit_net_price or 0.0),
                "subtotal_gross": float(it.subtotal_gross or 0.0),
                "subtotal_net": float(it.subtotal_net or 0.0),
                "stock_at_order": it.stock_at_order,
                "consigned_at_order": it.consigned_at_order,
            }
            for it in order.items
        ],
        "logs": [
            {
                "id": lg.id,
                "action": lg.action,
                "old_status": lg.old_status,
                "new_status": lg.new_status,
                "old_horus_status": lg.old_horus_status,
                "new_horus_status": lg.new_horus_status,
                "details": lg.details,
                "user_name": lg.user_name,
                "created_at": _fmt_dt(lg.created_at),
            }
            for lg in order.logs
        ],
    }


@router.patch("/orders/{order_id}/status")
def change_horus_purchase_order_status(
    order_id: int,
    payload: ChangePurchaseOrderStatusPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    order = (
        db.query(HorusPurchaseOrder)
        .filter(HorusPurchaseOrder.id == order_id, HorusPurchaseOrder.company_id == seller_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido de compra não encontrado.")

    _transition_order_status_in_horus_and_cronuz(
        db=db,
        seller_id=seller_id,
        order=order,
        new_horus_status=payload.new_horus_status,
        current_user=current_user,
        notes=payload.notes or payload.reason,
    )
    db.commit()
    db.refresh(order)

    return {
        "success": True,
        "status": order.status,
        "horus_status": order.horus_status,
        "status_label": HORUS_STATUS_LABELS.get(order.horus_status, order.status),
        "message": f"Status do pedido #{order.horus_cod_pedido} atualizado para {order.horus_status} ({HORUS_STATUS_LABELS.get(order.horus_status, order.status)})!",
    }


@router.patch("/orders/{order_id}/gerar-pendencia")
def change_horus_purchase_order_pendencia(
    order_id: int,
    payload: ChangePurchaseOrderPendenciaPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Atualiza diretamente o campo GERAR_PEND ('S' = SIM / 'N' = NÃO) em PEDIDOS_COMPRA no Horus
    e no Cronuz, respeitando todas as travas de segurança (bloqueia se finalizado, itens conferidos ou NF vinculada).
    """
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    order = (
        db.query(HorusPurchaseOrder)
        .filter(HorusPurchaseOrder.id == int(order_id), HorusPurchaseOrder.company_id == seller_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido de compra não encontrado.")

    target_gp = "N" if str(payload.gerar_pendencia or "S").strip().upper() == "N" else "S"
    old_gp = getattr(order, "gerar_pendencia", "S") or "S"
    uid, uname, horus_user_upper = _user_meta(current_user)

    if order.horus_cod_pedido:
        conn = _open_horus_tx_connection(db, seller_id)
        try:
            with conn.cursor() as cur:
                cur.execute(
                    _HORUS_ORDER_SAFETY_SQL,
                    (order.cod_empresa, order.cod_filial, order.horus_cod_pedido),
                )
                safety_row = cur.fetchone()
                if not safety_row:
                    conn.rollback()
                    raise HTTPException(
                        status_code=404,
                        detail=f"Pedido #{order.horus_cod_pedido} não encontrado em PEDIDOS_COMPRA no Horus.",
                    )
                safety = _evaluate_horus_safety_row(safety_row, order.horus_status)
                if safety["has_blocking_movement"]:
                    conn.rollback()
                    raise HTTPException(status_code=400, detail=safety["block_reason"])
                if safety["live_horus_status"] not in ("AB", "AP", "AE"):
                    conn.rollback()
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Somente pedidos em AB, AP ou AE podem ter o campo Gerar Pendência alterado "
                            f"(status atual no Horus: {safety['live_horus_status']})."
                        ),
                    )
                old_gp = safety.get("gerar_pendencia") or old_gp
                cur.execute(
                    """
                    UPDATE PEDIDOS_COMPRA
                    SET GERAR_PEND = %s,
                        DAT_ULT_ATL = GETDATE(),
                        NOM_USUARIO = %s
                    WHERE COD_EMPRESA = %s AND COD_FILIAL = %s AND COD_PEDIDO = %s
                    """,
                    (
                        target_gp,
                        horus_user_upper,
                        order.cod_empresa,
                        order.cod_filial,
                        order.horus_cod_pedido,
                    ),
                )
                conn.commit()
        except HTTPException:
            raise
        except Exception as e:
            try:
                conn.rollback()
            except Exception:
                pass
            raise HTTPException(
                status_code=500,
                detail=f"Falha ao atualizar GERAR_PEND em PEDIDOS_COMPRA no Horus: {e}",
            )
        finally:
            try:
                conn.close()
            except Exception:
                pass

    order.gerar_pendencia = target_gp
    order.updated_by_id = uid
    order.updated_by_name = uname
    old_lbl = "SIM" if old_gp == "S" else "NÃO"
    new_lbl = "SIM" if target_gp == "S" else "NÃO"
    db.add(
        HorusPurchaseOrderLog(
            order_id=order.id,
            action="PENDENCIA_CHANGED",
            old_status=order.status,
            new_status=order.status,
            old_horus_status=order.horus_status,
            new_horus_status=order.horus_status,
            details=f"Campo Gerar Pendência alterado de {old_lbl} ({old_gp}) para {new_lbl} ({target_gp}) por {uname}.",
            user_id=uid,
            user_name=uname,
        )
    )
    db.commit()
    db.refresh(order)

    return {
        "success": True,
        "gerar_pendencia": target_gp,
        "message": f"Gerar Pendência do pedido #{order.horus_cod_pedido or order.id} alterado para {new_lbl} no Horus!",
    }


@router.post("/orders/{order_id}/export-excel")
def export_horus_purchase_order_excel(
    order_id: int,
    change_to_ae: bool = Query(False),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Gera o arquivo Excel (.xlsx) do Pedido de Compra contendo ISBN, Título, Editora, Quantidade,
    Preço Capa, Desconto (%) e Preço/Total Líquido.
    Se change_to_ae=True e o pedido estiver em 'AP', altera atomicamente para 'AE' no Horus
    e 'AWAITING_DELIVERY' (Aguardando Entrega) no Cronuz, registrando histórico completo de usuário e data.
    """
    seller_id = _resolve_seller_id(current_user, company_id)
    uid, uname, _ = _user_meta(current_user)
    order = (
        db.query(HorusPurchaseOrder)
        .filter(HorusPurchaseOrder.id == order_id, HorusPurchaseOrder.company_id == seller_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Pedido de compra não encontrado.")

    status_changed_now = False
    if change_to_ae and order.horus_status == "AP":
        _transition_order_status_in_horus_and_cronuz(
            db=db,
            seller_id=seller_id,
            order=order,
            new_horus_status="AE",
            current_user=current_user,
            notes=f"Status alterado de AP para AE (Aguardando Entrega) na exportação do Excel por {uname}.",
        )
        status_changed_now = True

    order.excel_exported_count = int(order.excel_exported_count or 0) + 1
    order.last_excel_exported_at = datetime.utcnow()
    order.updated_by_user_id = uid
    order.updated_by_name = uname

    db.add(HorusPurchaseOrderLog(
        order_id=order.id,
        action="EXCEL_EXPORTED",
        old_status=order.status,
        new_status=order.status,
        old_horus_status=order.horus_status,
        new_horus_status=order.horus_status,
        details=(
            f"Planilha Excel exportada (#{order.excel_exported_count})"
            + (" com transição automática para AE (Aguardando Entrega)." if status_changed_now else f" mantendo status {order.horus_status}.")
        ),
        user_id=uid,
        user_name=uname,
    ))
    db.commit()

    # Monta o Excel (.xlsx) executivo para envio ao Fornecedor
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"Pedido_{order.horus_cod_pedido or order.id}"

    thin_side = Side(style="thin", color="CBD5E1")
    border_all = Border(left=thin_side, right=thin_side, top=thin_side, bottom=thin_side)

    ws.merge_cells("A1:I1")
    ws["A1"] = f"PEDIDO DE COMPRA #{order.horus_cod_pedido or order.id} — {order.branch_name or ''}"
    ws["A1"].font = Font(size=13, bold=True, color="FFFFFF")
    ws["A1"].fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    ws["A1"].alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 26

    ws.append([
        "Filial:", order.branch_name or f"Emp {order.cod_empresa} / Fil {order.cod_filial}",
        "CNPJ Filial:", order.branch_cnpj or "-",
        "Data Emissão:", order.created_at.strftime("%d/%m/%Y %H:%M") if order.created_at else "-",
        "Status Horus:", f"{order.horus_status} ({HORUS_STATUS_LABELS.get(order.horus_status, order.status)})",
        "",
    ])
    ws.append([
        "Fornecedor:", f"{order.nome_fornecedor} (Cód. {order.cod_fornecedor})",
        "CNPJ Fornec.:", order.cnpj_fornecedor or "-",
        "Modalidade:", "Consignação" if order.compra_consig == "S" else "Compra Firme",
        "Comprador:", order.created_by_name or uname,
        "",
    ])
    if order.observations:
        ws.append(["Observações:", order.observations, "", "", "", "", "", "", ""])
    ws.append([])

    headers = [
        "ISBN",
        "Cód. Horus",
        "Título",
        "Editora / Selo",
        "Quantidade",
        "Preço Capa (R$)",
        "Desconto (%)",
        "Preço Líquido (R$)",
        "Total Líquido (R$)",
    ]
    ws.append(headers)
    header_row_idx = ws.max_row
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=header_row_idx, column=col_idx)
        cell.font = Font(bold=True, color="FFFFFF", size=10)
        cell.fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
        cell.alignment = Alignment(horizontal="center" if col_idx not in (3, 4) else "left", vertical="center")
        cell.border = border_all
    ws.row_dimensions[header_row_idx].height = 22

    for it in order.items:
        ws.append([
            it.isbn or "",
            it.cod_item,
            it.nome_item,
            it.nome_editora or "",
            int(it.quantity or 0),
            float(it.unit_cover_price or 0.0),
            float(it.discount_pct or 0.0),
            float(it.unit_net_price or 0.0),
            float(it.subtotal_net or 0.0),
        ])
        r_idx = ws.max_row
        for c_i in range(1, 10):
            c_obj = ws.cell(row=r_idx, column=c_i)
            c_obj.border = border_all
        ws.cell(row=r_idx, column=5).alignment = Alignment(horizontal="right")
        ws.cell(row=r_idx, column=6).number_format = "R$ #,##0.00"
        ws.cell(row=r_idx, column=7).number_format = "0.00\"%\""
        ws.cell(row=r_idx, column=8).number_format = "R$ #,##0.0000"
        ws.cell(row=r_idx, column=9).number_format = "R$ #,##0.00"

    ws.append([
        "TOTAIS DO PEDIDO",
        "",
        f"{order.total_skus} título(s)",
        "",
        int(order.total_quantity or 0),
        float(order.total_gross or 0.0),
        float(order.avg_discount_pct or 0.0),
        "",
        float(order.total_net or 0.0),
    ])
    tot_row_idx = ws.max_row
    for c_i in range(1, 10):
        c_obj = ws.cell(row=tot_row_idx, column=c_i)
        c_obj.font = Font(bold=True, color="0F172A")
        c_obj.fill = PatternFill(start_color="E2E8F0", end_color="E2E8F0", fill_type="solid")
        c_obj.border = border_all
    ws.cell(row=tot_row_idx, column=6).number_format = "R$ #,##0.00"
    ws.cell(row=tot_row_idx, column=7).number_format = "0.00\"%\""
    ws.cell(row=tot_row_idx, column=9).number_format = "R$ #,##0.00"

    col_widths = [18, 13, 48, 26, 13, 16, 14, 18, 18]
    for idx_w, w_val in enumerate(col_widths, start=1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(idx_w)].width = w_val

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    safe_sup = re.sub(r"[^A-Za-z0-9_-]", "_", (order.nome_fornecedor or "Fornecedor")[:25]).strip("_")
    filename = f"Pedido_Compra_{order.horus_cod_pedido or order.id}_{safe_sup}_{order.horus_status}.xlsx"

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Order-Horus-Status": order.horus_status,
            "X-Order-Cronuz-Status": order.status,
        },
    )


# ── 8. Auditoria Preventiva de XML da NF-e vs Pedido de Compra & Decisão Posterior ─

class XmlAuditDecisionPayload(BaseModel):
    company_id: Optional[int] = None
    decision_status: str  # XML_OK, ACCEPTED_WITH_DIVERGENCE, REJECTED, PENDING_REVIEW
    decision_notes: Optional[str] = None
    item_notes: Optional[Dict[str, str]] = None  # {str(audit_item_id): "pontuação no item"}
    advance_horus_to_ae: bool = False


def _xml_local_name(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _xml_child_text(parent: Optional[ET.Element], child_local_name: str) -> str:
    if parent is None:
        return ""
    for ch in parent:
        if _xml_local_name(ch.tag) == child_local_name:
            return (ch.text or "").strip()
    return ""


def _xml_find_first(root: ET.Element, local_name: str) -> Optional[ET.Element]:
    for el in root.iter():
        if _xml_local_name(el.tag) == local_name:
            return el
    return None


def _safe_dec(val: Any, default: str = "0") -> Decimal:
    if val is None:
        return Decimal(default)
    s = str(val).strip().replace(",", ".")
    if not s:
        return Decimal(default)
    try:
        return Decimal(s)
    except Exception:
        return Decimal(default)


def _normalize_gtin_isbn(raw: Optional[str]) -> str:
    if not raw:
        return ""
    up = str(raw).strip().upper()
    if up in ("SEM GTIN", "SEMGTIN", "ISENTO", "N/A", "0", "0000000000000"):
        return ""
    cleaned = "".join(ch for ch in up if ch.isdigit() or ch == "X")
    if len(cleaned) >= 10 and cleaned.strip("0"):
        return cleaned
    return ""


def _isbn_core9(isbn_str: str) -> str:
    """Extrai o miolo de 9 dígitos para conciliar ISBN-13 (978XXXXXXXXX-D) com ISBN-10 (XXXXXXXXX-D)."""
    c = _normalize_gtin_isbn(isbn_str)
    if len(c) == 13 and c.startswith("978"):
        return c[3:12]
    if len(c) == 10:
        return c[:9]
    return ""


def _parse_supplier_nfe_xml(raw_bytes: bytes) -> Dict[str, Any]:
    """
    Faz o parse seguro do XML de NF-e (modelo 55 — <nfeProc> ou <NFe>) enviado pelo fornecedor.
    Extrai cabeçalho fiscal, totais e itens detalhados (incluindo detecção inteligente de
    Preço de Capa e Desconto em <vDesc>, rateio de desconto do cabeçalho ou <infAdProd>).
    """
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="O arquivo XML enviado está vazio.")
    if len(raw_bytes) > MAX_PURCHASE_XML_BYTES:
        raise HTTPException(
            status_code=413,
            detail="O arquivo XML excede o limite máximo permitido de 10 MB para este tipo de envio.",
        )

    head_probe = raw_bytes[:4096].upper()
    if b"<!ENTITY" in head_probe or b"<!DOCTYPE" in head_probe:
        raise HTTPException(status_code=400, detail="Estrutura XML bloqueada por segurança (DOCTYPE/ENTITY não permitido).")

    xml_text: Optional[str] = None
    for enc in ("utf-8-sig", "utf-8", "iso-8859-1", "cp1252"):
        try:
            xml_text = raw_bytes.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    if xml_text is None:
        xml_text = raw_bytes.decode("utf-8", errors="replace")

    try:
        root = ET.fromstring(xml_text.strip())
    except ET.ParseError as e:
        raise HTTPException(status_code=400, detail=f"Arquivo XML inválido ou malformado: {e}")

    inf_nfe = _xml_find_first(root, "infNFe")
    if inf_nfe is None:
        raise HTTPException(
            status_code=400,
            detail="O arquivo enviado não é um XML de NF-e válido (bloco <infNFe> não encontrado).",
        )

    # Chave de acesso (44 dígitos)
    chave = ""
    inf_prot = _xml_find_first(root, "infProt")
    if inf_prot is not None:
        chave = _clean_digits(_xml_child_text(inf_prot, "chNFe"))
    if not chave:
        raw_id = inf_nfe.attrib.get("Id") or inf_nfe.attrib.get("id") or ""
        chave = _clean_digits(raw_id)

    ide_el = None
    emit_el = None
    dest_el = None
    total_el = None
    compra_el = None
    det_elements: List[ET.Element] = []

    for child in inf_nfe:
        ln = _xml_local_name(child.tag)
        if ln == "ide":
            ide_el = child
        elif ln == "emit":
            emit_el = child
        elif ln == "dest":
            dest_el = child
        elif ln == "total":
            total_el = child
        elif ln == "compra":
            compra_el = child
        elif ln == "det":
            det_elements.append(child)

    if not det_elements:
        raise HTTPException(status_code=400, detail="O XML da NF-e não possui itens (<det>) para conferência.")

    numero_nf = _xml_child_text(ide_el, "nNF") or "S/N"
    serie_nf = _xml_child_text(ide_el, "serie") or "1"
    data_emissao = _xml_child_text(ide_el, "dhEmi") or _xml_child_text(ide_el, "dEmi") or ""
    nat_op = _xml_child_text(ide_el, "natOp") or ""

    emit_cnpj = _clean_digits(_xml_child_text(emit_el, "CNPJ") or _xml_child_text(emit_el, "CPF"))
    emit_nome = _xml_child_text(emit_el, "xNome") or _xml_child_text(emit_el, "xFant") or ""
    dest_cnpj = _clean_digits(_xml_child_text(dest_el, "CNPJ") or _xml_child_text(dest_el, "CPF"))
    dest_nome = _xml_child_text(dest_el, "xNome") or ""

    icms_tot = _xml_find_first(total_el, "ICMSTot") if total_el is not None else None
    tot_vprod = _safe_dec(_xml_child_text(icms_tot, "vProd"))
    tot_vdesc = _safe_dec(_xml_child_text(icms_tot, "vDesc"))
    tot_vfrete = _safe_dec(_xml_child_text(icms_tot, "vFrete"))
    tot_vipi = _safe_dec(_xml_child_text(icms_tot, "vIPI"))
    tot_vst = _safe_dec(_xml_child_text(icms_tot, "vST"))
    tot_voutro = _safe_dec(_xml_child_text(icms_tot, "vOutro"))
    tot_vnf = _safe_dec(_xml_child_text(icms_tot, "vNF"))

    header_xped = _xml_child_text(compra_el, "xPed") if compra_el is not None else ""

    raw_items: List[Dict[str, Any]] = []
    sum_item_vdesc = Decimal("0")
    sum_item_vprod = Decimal("0")
    first_item_xped = ""

    for idx_det, det in enumerate(det_elements, start=1):
        n_item_raw = det.attrib.get("nItem") or str(idx_det)
        n_item = int(n_item_raw) if str(n_item_raw).isdigit() else idx_det
        prod_el = None
        inf_ad_prod = ""
        for ch in det:
            cln = _xml_local_name(ch.tag)
            if cln == "prod":
                prod_el = ch
            elif cln == "infAdProd":
                inf_ad_prod = (ch.text or "").strip()

        if prod_el is None:
            continue

        c_prod = _xml_child_text(prod_el, "cProd")
        c_ean = _normalize_gtin_isbn(_xml_child_text(prod_el, "cEAN"))
        c_ean_trib = _normalize_gtin_isbn(_xml_child_text(prod_el, "cEANTrib"))
        x_prod = _xml_child_text(prod_el, "xProd")
        cfop = _clean_digits(_xml_child_text(prod_el, "CFOP"))
        x_ped_item = _xml_child_text(prod_el, "xPed")
        if x_ped_item and not first_item_xped:
            first_item_xped = x_ped_item

        q_com_dec = _safe_dec(_xml_child_text(prod_el, "qCom"), "0")
        v_un_com_dec = _safe_dec(_xml_child_text(prod_el, "vUnCom"), "0")
        v_prod_dec = _safe_dec(_xml_child_text(prod_el, "vProd"), "0")
        v_desc_dec = _safe_dec(_xml_child_text(prod_el, "vDesc"), "0")

        # Resolve melhor ISBN/GTIN disponível no item do XML
        resolved_ean = c_ean or c_ean_trib
        if not resolved_ean:
            cand_cprod = _normalize_gtin_isbn(c_prod)
            if len(cand_cprod) == 13 and cand_cprod.startswith(("978", "979")):
                resolved_ean = cand_cprod
        if not resolved_ean and inf_ad_prod:
            m_isbn = re.search(r"\b(97[89][\d\-]{10,14})\b", inf_ad_prod)
            if m_isbn:
                resolved_ean = _normalize_gtin_isbn(m_isbn.group(1))
        if not resolved_ean and x_prod:
            m_isbn2 = re.search(r"\b(97[89]\d{10})\b", x_prod)
            if m_isbn2:
                resolved_ean = m_isbn2.group(1)

        sum_item_vdesc += v_desc_dec
        sum_item_vprod += v_prod_dec

        raw_items.append({
            "n_item": n_item,
            "c_prod": c_prod,
            "ean": resolved_ean,
            "x_prod": x_prod or f"ITEM XML #{n_item}",
            "cfop": cfop,
            "q_com": q_com_dec,
            "v_un_com": v_un_com_dec,
            "v_prod": v_prod_dec,
            "v_desc": v_desc_dec,
            "inf_ad_prod": inf_ad_prod,
            "x_ped": x_ped_item,
        })

    # Caso o fornecedor tenha destacado desconto apenas no totalizador <ICMSTot><vDesc> sem ratear nos itens
    if tot_vdesc > Decimal("0") and sum_item_vdesc == Decimal("0") and sum_item_vprod > Decimal("0"):
        for it in raw_items:
            it["v_desc"] = (tot_vdesc * (it["v_prod"] / sum_item_vprod)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

    # Calcula Preço de Capa, Desconto (%) e Preço Líquido Unitário de cada linha do XML
    for it in raw_items:
        q = it["q_com"]
        v_un = it["v_un_com"]
        v_pr = it["v_prod"]
        v_ds = it["v_desc"]
        sub_net = (v_pr - v_ds).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        unit_net = (sub_net / q).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP) if q > 0 else Decimal("0")

        cover_from_inf_ad: Optional[Decimal] = None
        disc_from_inf_ad: Optional[Decimal] = None
        if v_ds == Decimal("0") and it["inf_ad_prod"]:
            m_capa = re.search(
                r"(?:CAPA|PRE[CÇ]O\s*(?:DE\s*)?CAPA|VLR\.?\s*CAPA|P\.?\s*CAPA)\s*[:=]?\s*(?:R\$\s*)?(\d+[.,]\d{2})",
                it["inf_ad_prod"],
                flags=re.IGNORECASE,
            )
            if m_capa:
                cand_c = _safe_dec(m_capa.group(1))
                if cand_c > Decimal("0") and cand_c >= unit_net:
                    cover_from_inf_ad = cand_c
            m_dsc = re.search(
                r"(?:DESC(?:ONTO)?)\s*[:=]?\s*(\d+(?:[.,]\d{1,2})?)\s*%",
                it["inf_ad_prod"],
                flags=re.IGNORECASE,
            )
            if m_dsc:
                disc_from_inf_ad = _safe_dec(m_dsc.group(1))

        if v_ds > Decimal("0") and v_pr > Decimal("0"):
            xml_cover = v_un.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            xml_disc_pct = ((v_ds / v_pr) * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            billed_net_without_vdesc = False
        elif cover_from_inf_ad is not None and cover_from_inf_ad > Decimal("0"):
            xml_cover = cover_from_inf_ad.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            if disc_from_inf_ad is not None:
                xml_disc_pct = disc_from_inf_ad.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            else:
                xml_disc_pct = (((xml_cover - unit_net) / xml_cover) * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            billed_net_without_vdesc = True
        else:
            xml_cover = v_un.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            xml_disc_pct = Decimal("0.00")
            billed_net_without_vdesc = True

        it["xml_qty_int"] = int(q.quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        it["xml_cover"] = xml_cover
        it["xml_disc_pct"] = xml_disc_pct
        it["xml_unit_net"] = unit_net
        it["xml_subtotal_net"] = sub_net
        it["billed_net_without_vdesc"] = billed_net_without_vdesc

    return {
        "chave_acesso": chave[:60] if chave else None,
        "numero_nf": numero_nf[:30],
        "serie_nf": serie_nf[:10],
        "data_emissao": data_emissao[:40],
        "nat_op": nat_op[:150],
        "emit_cnpj": emit_cnpj[:20],
        "emit_nome": emit_nome[:200],
        "dest_cnpj": dest_cnpj[:20],
        "dest_nome": dest_nome[:200],
        "xml_xped": (header_xped or first_item_xped)[:60] or None,
        "xml_text": xml_text,
        "tot_vprod": tot_vprod if tot_vprod > 0 else sum_item_vprod,
        "tot_vdesc": tot_vdesc if tot_vdesc > 0 else sum_item_vdesc,
        "tot_vfrete": tot_vfrete,
        "tot_ipi_st_outros": (tot_vipi + tot_vst + tot_voutro).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "tot_vnf": tot_vnf,
        "items": raw_items,
    }


def _compare_xml_with_purchase_order(
    order: HorusPurchaseOrder,
    parsed_xml: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Cruza linha a linha o XML da NF-e com os itens do Pedido de Compra (pur_horus_order_item).
    Avalia e identifica individualmente:
      1. Preço de Capa (tolerância R$ 0,02)
      2. Desconto Comercial % (tolerância 0,05 p.p.)
      3. Quantidade (unidades exatas, agrupando múltiplos <det> do mesmo ISBN caso a editora quebre lotes)
      4. Itens Extras no XML (não pedidos) e Itens Faltantes (pedidos e não faturados)
      5. Alertas fiscais de cabeçalho (CNPJ Destinatário vs Filial e CNPJ Emitente vs Fornecedor)
    """
    header_warnings: List[str] = []
    order_branch_cnpj = _clean_digits(order.branch_cnpj)
    xml_dest_cnpj = _clean_digits(parsed_xml.get("dest_cnpj"))
    if order_branch_cnpj and xml_dest_cnpj and order_branch_cnpj != xml_dest_cnpj:
        header_warnings.append(
            f"CNPJ Destinatário da NF-e ({xml_dest_cnpj}) difere do CNPJ da Filial do Pedido ({order_branch_cnpj})."
        )

    order_sup_cnpj = _clean_digits(order.cnpj_fornecedor)
    xml_emit_cnpj = _clean_digits(parsed_xml.get("emit_cnpj"))
    if order_sup_cnpj and xml_emit_cnpj and order_sup_cnpj != xml_emit_cnpj:
        if order_sup_cnpj[:8] == xml_emit_cnpj[:8]:
            header_warnings.append(
                f"NF-e emitida por outra filial/CD do mesmo grupo fornecedor (CNPJ NF: {xml_emit_cnpj} | Pedido: {order_sup_cnpj})."
            )
        else:
            header_warnings.append(
                f"CNPJ Emitente da NF-e ({xml_emit_cnpj} - {parsed_xml.get('emit_nome')}) difere do Fornecedor do Pedido ({order_sup_cnpj} - {order.nome_fornecedor})."
            )

    # Indexa itens do pedido por ISBN normalizado, miolo ISBN-9, cod_item e título exato
    by_isbn: Dict[str, HorusPurchaseOrderItem] = {}
    by_core9: Dict[str, HorusPurchaseOrderItem] = {}
    by_cod: Dict[str, HorusPurchaseOrderItem] = {}
    by_title: Dict[str, HorusPurchaseOrderItem] = {}

    for oit in order.items:
        norm_i = _normalize_gtin_isbn(oit.isbn)
        if norm_i:
            by_isbn[norm_i] = oit
            c9 = _isbn_core9(norm_i)
            if c9:
                by_core9[c9] = oit
        if oit.cod_item:
            by_cod[str(oit.cod_item)] = oit
        if oit.nome_item:
            by_title[re.sub(r"\s+", " ", oit.nome_item.strip().upper())] = oit

    # Agrupa linhas do XML que casem com o mesmo item do pedido (evita falso erro quando editora divide lotes)
    matched_xml_groups: Dict[int, List[Dict[str, Any]]] = {}
    unmatched_xml_rows: List[Dict[str, Any]] = []

    for xit in parsed_xml["items"]:
        matched_oit: Optional[HorusPurchaseOrderItem] = None
        xean = _normalize_gtin_isbn(xit.get("ean"))
        if xean and xean in by_isbn:
            matched_oit = by_isbn[xean]
        elif xean and _isbn_core9(xean) and _isbn_core9(xean) in by_core9:
            matched_oit = by_core9[_isbn_core9(xean)]
        else:
            cprod_clean = str(xit.get("c_prod") or "").strip()
            if cprod_clean in by_cod and not xean:
                matched_oit = by_cod[cprod_clean]
            elif not xean and xit.get("x_prod"):
                norm_t = re.sub(r"\s+", " ", str(xit["x_prod"]).strip().upper())
                if norm_t in by_title:
                    matched_oit = by_title[norm_t]

        if matched_oit is not None:
            matched_xml_groups.setdefault(matched_oit.id, []).append(xit)
        else:
            unmatched_xml_rows.append(xit)

    audit_lines: List[Dict[str, Any]] = []
    matched_ok_count = 0
    divergent_items_count = 0
    diff_cover_count = 0
    diff_discount_count = 0
    diff_qty_count = 0
    extra_in_xml_count = 0
    missing_in_xml_count = 0

    xml_total_qty_all = 0
    xml_total_products_net_all = Decimal("0.00")

    # 1. Processa todos os itens do Pedido (casados ou faltantes no XML)
    for oit in order.items:
        ord_qty = int(oit.quantity or 0)
        ord_cover = Decimal(str(oit.unit_cover_price or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        ord_disc = Decimal(str(oit.discount_pct or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        ord_unit_net = Decimal(str(oit.unit_net_price or 0)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
        ord_sub_net = Decimal(str(oit.subtotal_net or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

        x_group = matched_xml_groups.get(oit.id)
        if not x_group:
            # Item pedido NÃO veio no XML da NF-e
            missing_in_xml_count += 1
            divergent_items_count += 1
            diff_qty_count += 1
            audit_lines.append({
                "order_item_id": oit.id,
                "xml_n_item": None,
                "cod_item": oit.cod_item,
                "isbn": oit.isbn,
                "xml_ean": None,
                "xml_cprod": None,
                "title": oit.nome_item,
                "nome_editora": oit.nome_editora,
                "cfop": None,
                "order_qty": ord_qty,
                "order_cover_price": ord_cover,
                "order_discount_pct": ord_disc,
                "order_unit_net": ord_unit_net,
                "order_subtotal_net": ord_sub_net,
                "xml_qty": 0,
                "xml_cover_price": Decimal("0.00"),
                "xml_discount_pct": Decimal("0.00"),
                "xml_effective_discount_pct": Decimal("0.00"),
                "xml_unit_net": Decimal("0.0000"),
                "xml_subtotal_net": Decimal("0.00"),
                "line_status": "DIVERGENT",
                "has_qty_diff": True,
                "has_cover_diff": False,
                "has_discount_diff": False,
                "is_extra_in_xml": False,
                "is_missing_in_xml": True,
                "divergence_tags": ["ITEM_FALTANTE_XML"],
                "divergence_summary": f"Item pedido ({ord_qty} un.) não faturado neste XML.",
            })
            continue

        # Agrega se houver mais de um <det> para o mesmo item
        first_x = x_group[0]
        sum_q_dec = sum((x["q_com"] for x in x_group), Decimal("0"))
        xml_qty = sum(int(x["xml_qty_int"]) for x in x_group)
        sum_vprod = sum((x["v_prod"] for x in x_group), Decimal("0"))
        sum_vdesc = sum((x["v_desc"] for x in x_group), Decimal("0"))
        sum_sub_net = sum((x["xml_subtotal_net"] for x in x_group), Decimal("0.00"))

        xml_total_qty_all += xml_qty
        xml_total_products_net_all += sum_sub_net

        if len(x_group) == 1:
            xml_cover = first_x["xml_cover"]
            xml_disc = first_x["xml_disc_pct"]
            xml_unit_net = first_x["xml_unit_net"]
            billed_net_no_vdesc = bool(first_x.get("billed_net_without_vdesc"))
        else:
            xml_unit_net = (sum_sub_net / sum_q_dec).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP) if sum_q_dec > 0 else Decimal("0")
            if sum_vdesc > Decimal("0") and sum_vprod > Decimal("0"):
                xml_cover = (sum_vprod / sum_q_dec).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if sum_q_dec > 0 else Decimal("0")
                xml_disc = ((sum_vdesc / sum_vprod) * Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                billed_net_no_vdesc = False
            else:
                xml_cover = (sum_vprod / sum_q_dec).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP) if sum_q_dec > 0 else Decimal("0")
                xml_disc = Decimal("0.00")
                billed_net_no_vdesc = True

        # Desconto efetivo sobre o Preço de Capa do Pedido (útil quando editora fatura direto pelo líquido)
        if ord_cover > Decimal("0"):
            eff_disc_vs_order_cover = (((ord_cover - xml_unit_net) / ord_cover) * Decimal("100")).quantize(
                Decimal("0.01"), rounding=ROUND_HALF_UP
            )
        else:
            eff_disc_vs_order_cover = xml_disc

        tags: List[str] = []
        reasons: List[str] = []

        has_qty_diff = xml_qty != ord_qty
        if has_qty_diff:
            diff_qty_count += 1
            if xml_qty > ord_qty:
                tags.append("QTD_MAIOR")
                reasons.append(f"Qtd XML maior ({xml_qty} vs {ord_qty} no pedido)")
            else:
                tags.append("QTD_MENOR")
                reasons.append(f"Qtd XML menor ({xml_qty} vs {ord_qty} no pedido)")

        has_cover_diff = abs(xml_cover - ord_cover) > Decimal("0.02")
        has_discount_diff = abs(xml_disc - ord_disc) > Decimal("0.05")

        # Caso especial do mercado livreiro: fornecedor faturou líquido em vUnCom sem destacar vDesc
        if billed_net_no_vdesc and ord_disc > Decimal("0") and abs(xml_unit_net - ord_unit_net) <= Decimal("0.02"):
            # O líquido unitário bateu cravado com o pedido, mas a NF não destacou Capa + vDesc!
            has_cover_diff = True
            has_discount_diff = False
            diff_cover_count += 1
            tags.append("FATURADO_LIQUIDO_SEM_VDESC")
            reasons.append(
                f"NF emitida pelo líquido (R$ {xml_unit_net:.2f}) sem destacar Capa (R$ {ord_cover:.2f}) e Desc. ({ord_disc:.2f}%)"
            )
        else:
            if has_cover_diff:
                diff_cover_count += 1
                if xml_cover > ord_cover:
                    tags.append("CAPA_MAIOR")
                    reasons.append(f"Capa XML maior (R$ {xml_cover:.2f} vs R$ {ord_cover:.2f})")
                else:
                    tags.append("CAPA_MENOR")
                    reasons.append(f"Capa XML menor (R$ {xml_cover:.2f} vs R$ {ord_cover:.2f})")

            if has_discount_diff:
                diff_discount_count += 1
                if xml_disc < ord_disc:
                    tags.append("DESCONTO_MENOR")
                    reasons.append(f"Desconto XML menor ({xml_disc:.2f}% vs {ord_disc:.2f}% no pedido)")
                else:
                    tags.append("DESCONTO_MAIOR")
                    reasons.append(f"Desconto XML maior ({xml_disc:.2f}% vs {ord_disc:.2f}% no pedido)")

        is_div = bool(has_qty_diff or has_cover_diff or has_discount_diff)
        if is_div:
            divergent_items_count += 1
        else:
            matched_ok_count += 1

        audit_lines.append({
            "order_item_id": oit.id,
            "xml_n_item": first_x["n_item"],
            "cod_item": oit.cod_item,
            "isbn": oit.isbn,
            "xml_ean": first_x.get("ean") or None,
            "xml_cprod": first_x.get("c_prod") or None,
            "title": oit.nome_item,
            "nome_editora": oit.nome_editora,
            "cfop": first_x.get("cfop") or None,
            "order_qty": ord_qty,
            "order_cover_price": ord_cover,
            "order_discount_pct": ord_disc,
            "order_unit_net": ord_unit_net,
            "order_subtotal_net": ord_sub_net,
            "xml_qty": xml_qty,
            "xml_cover_price": xml_cover,
            "xml_discount_pct": xml_disc,
            "xml_effective_discount_pct": eff_disc_vs_order_cover,
            "xml_unit_net": xml_unit_net,
            "xml_subtotal_net": sum_sub_net,
            "line_status": "DIVERGENT" if is_div else "OK",
            "has_qty_diff": has_qty_diff,
            "has_cover_diff": has_cover_diff,
            "has_discount_diff": has_discount_diff,
            "is_extra_in_xml": False,
            "is_missing_in_xml": False,
            "divergence_tags": tags if tags else ["OK"],
            "divergence_summary": " • ".join(reasons) if reasons else "Quantidade, Preço de Capa e Desconto 100% conferidos.",
        })

    # 2. Processa itens extras que vieram na NF-e mas NÃO constam no Pedido de Compra
    for ux in unmatched_xml_rows:
        extra_in_xml_count += 1
        divergent_items_count += 1
        x_q = int(ux["xml_qty_int"])
        xml_total_qty_all += x_q
        xml_total_products_net_all += ux["xml_subtotal_net"]

        audit_lines.append({
            "order_item_id": None,
            "xml_n_item": ux["n_item"],
            "cod_item": None,
            "isbn": ux.get("ean") or None,
            "xml_ean": ux.get("ean") or None,
            "xml_cprod": ux.get("c_prod") or None,
            "title": str(ux.get("x_prod") or f"ITEM XML #{ux['n_item']}")[:255],
            "nome_editora": None,
            "cfop": ux.get("cfop") or None,
            "order_qty": 0,
            "order_cover_price": Decimal("0.00"),
            "order_discount_pct": Decimal("0.00"),
            "order_unit_net": Decimal("0.0000"),
            "order_subtotal_net": Decimal("0.00"),
            "xml_qty": x_q,
            "xml_cover_price": ux["xml_cover"],
            "xml_discount_pct": ux["xml_disc_pct"],
            "xml_effective_discount_pct": ux["xml_disc_pct"],
            "xml_unit_net": ux["xml_unit_net"],
            "xml_subtotal_net": ux["xml_subtotal_net"],
            "line_status": "DIVERGENT",
            "has_qty_diff": True,
            "has_cover_diff": False,
            "has_discount_diff": False,
            "is_extra_in_xml": True,
            "is_missing_in_xml": False,
            "divergence_tags": ["ITEM_NAO_PEDIDO"],
            "divergence_summary": f"Item presente na NF-e ({x_q} un.) mas não solicitado neste Pedido de Compra.",
        })

    has_dest_mismatch = bool(order_branch_cnpj and xml_dest_cnpj and order_branch_cnpj != xml_dest_cnpj)
    diagnostic_status = (
        "MATCH_100"
        if (divergent_items_count == 0 and not has_dest_mismatch)
        else "HAS_DIVERGENCE"
    )

    return {
        "diagnostic_status": diagnostic_status,
        "matched_ok_count": matched_ok_count,
        "divergent_items_count": divergent_items_count,
        "diff_cover_count": diff_cover_count,
        "diff_discount_count": diff_discount_count,
        "diff_qty_count": diff_qty_count,
        "extra_in_xml_count": extra_in_xml_count,
        "missing_in_xml_count": missing_in_xml_count,
        "header_warnings": header_warnings,
        "xml_total_qty": xml_total_qty_all,
        "xml_total_products_net": xml_total_products_net_all.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        "lines": audit_lines,
    }


def _serialize_xml_audit_summary(a: HorusPurchaseXmlAudit, order_obj: Optional[HorusPurchaseOrder] = None) -> Dict[str, Any]:
    ord_ref = order_obj or a.order
    return {
        "id": a.id,
        "order_id": a.order_id,
        "branch_id": a.branch_id,
        "branch_name": a.branch_name or (ord_ref.branch_name if ord_ref else None),
        "horus_cod_pedido": a.horus_cod_pedido or (ord_ref.horus_cod_pedido if ord_ref else None),
        "order_horus_status": ord_ref.horus_status if ord_ref else None,
        "order_status": ord_ref.status if ord_ref else None,
        "nome_fornecedor": ord_ref.nome_fornecedor if ord_ref else a.emit_nome,
        "cnpj_fornecedor": ord_ref.cnpj_fornecedor if ord_ref else a.emit_cnpj,
        "chave_acesso": a.chave_acesso,
        "numero_nf": a.numero_nf,
        "serie_nf": a.serie_nf,
        "data_emissao": a.data_emissao,
        "nat_op": a.nat_op,
        "emit_cnpj": a.emit_cnpj,
        "emit_nome": a.emit_nome,
        "dest_cnpj": a.dest_cnpj,
        "dest_nome": a.dest_nome,
        "xml_xped": a.xml_xped,
        "order_total_qty": a.order_total_qty,
        "xml_total_qty": a.xml_total_qty,
        "order_total_gross": float(a.order_total_gross or 0.0),
        "xml_total_gross": float(a.xml_total_gross or 0.0),
        "order_total_discount": float(a.order_total_discount or 0.0),
        "xml_total_discount": float(a.xml_total_discount or 0.0),
        "order_total_net": float(a.order_total_net or 0.0),
        "xml_total_products_net": float(a.xml_total_products_net or 0.0),
        "xml_total_nf": float(a.xml_total_nf or 0.0),
        "xml_frete": float(a.xml_frete or 0.0),
        "xml_ipi_st_outros": float(a.xml_ipi_st_outros or 0.0),
        "diagnostic_status": a.diagnostic_status,
        "matched_ok_count": a.matched_ok_count,
        "divergent_items_count": a.divergent_items_count,
        "diff_cover_count": a.diff_cover_count,
        "diff_discount_count": a.diff_discount_count,
        "diff_qty_count": a.diff_qty_count,
        "extra_in_xml_count": a.extra_in_xml_count,
        "missing_in_xml_count": a.missing_in_xml_count,
        "header_warnings": a.header_warnings or [],
        "decision_status": a.decision_status,
        "decision_label": XML_DECISION_LABELS.get(a.decision_status, a.decision_status),
        "decision_notes": a.decision_notes,
        "uploaded_by_name": a.uploaded_by_name,
        "decided_by_name": a.decided_by_name,
        "decided_at": _fmt_dt(a.decided_at),
        "created_at": _fmt_dt(a.created_at),
        "updated_at": _fmt_dt(a.updated_at),
    }


def _auto_locate_order_for_xml(
    db: Session,
    seller_id: int,
    parsed_xml: Dict[str, Any],
    branch_id: Optional[int] = None,
) -> Optional[HorusPurchaseOrder]:
    """
    Quando o comprador sobe o XML sem selecionar o pedido manualmente, tenta localizar com segurança:
      1º Pelo número do pedido em <xPed> no XML cruzando com horus_cod_pedido.
      2º Pelos pedidos ativos (AP / AE / AC) do fornecedor (CNPJ raiz) na filial destinatária,
         escolhendo o pedido com maior interseção de ISBNs.
    """
    q_base = db.query(HorusPurchaseOrder).filter(
        HorusPurchaseOrder.company_id == seller_id,
        HorusPurchaseOrder.horus_status.in_(["AP", "AE", "AC"]),
    )
    if branch_id is not None:
        q_base = q_base.filter(HorusPurchaseOrder.branch_id == int(branch_id))

    xped_digits = _clean_digits(parsed_xml.get("xml_xped"))
    if xped_digits and len(xped_digits) <= 9:
        cand = q_base.filter(HorusPurchaseOrder.horus_cod_pedido == int(xped_digits)).first()
        if cand:
            return cand

    emit_cnpj = _clean_digits(parsed_xml.get("emit_cnpj"))
    dest_cnpj = _clean_digits(parsed_xml.get("dest_cnpj"))
    candidates = q_base.order_by(HorusPurchaseOrder.created_at.desc()).limit(60).all()
    if not candidates:
        return None

    xml_eans = {_normalize_gtin_isbn(it.get("ean")) for it in parsed_xml["items"] if _normalize_gtin_isbn(it.get("ean"))}
    best_order: Optional[HorusPurchaseOrder] = None
    best_score = 0

    for ord_c in candidates:
        score = 0
        ord_sup_cnpj = _clean_digits(ord_c.cnpj_fornecedor)
        ord_br_cnpj = _clean_digits(ord_c.branch_cnpj)
        if dest_cnpj and ord_br_cnpj and dest_cnpj != ord_br_cnpj:
            continue
        if emit_cnpj and ord_sup_cnpj:
            if emit_cnpj == ord_sup_cnpj:
                score += 20
            elif emit_cnpj[:8] == ord_sup_cnpj[:8]:
                score += 10
            else:
                continue

        ord_isbns = {_normalize_gtin_isbn(i.isbn) for i in ord_c.items if _normalize_gtin_isbn(i.isbn)}
        overlap = len(xml_eans.intersection(ord_isbns))
        if overlap > 0:
            score += overlap * 5
        if score > best_score and overlap > 0:
            best_score = score
            best_order = ord_c

    return best_order


@router.post("/xml-audits/analyze")
async def analyze_supplier_xml_against_order(
    file: UploadFile = File(...),
    order_id: Optional[int] = Form(None),
    branch_id: Optional[int] = Form(None),
    auto_accept_if_ok: bool = Form(True),
    advance_horus_to_ae: bool = Form(False),
    company_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Recebe o arquivo XML da NF-e do fornecedor (máx. 10 MB), cruza com o Pedido de Compra:
      - Se 100% batendo (Preço de Capa, Desconto %, Quantidade, sem itens extras/faltantes) e auto_accept_if_ok=True:
        aceita automaticamente o XML e muda o status do pedido para 'XML_OK' ('XML OK').
      - Caso haja qualquer divergência (ou auto_accept_if_ok=False):
        registra cada divergência identificada na Central de Análise de XML como 'PENDING_REVIEW'
        ('Em Análise') para decisão posterior (Aceitar OK, Aceitar com Divergência ou Recusar XML).
    """
    seller_id = _resolve_seller_id(current_user, company_id)
    uid, uname, _ = _user_meta(current_user)

    fname = (file.filename or "").lower()
    if not fname.endswith(".xml"):
        raise HTTPException(status_code=400, detail="Envie um arquivo com extensão .xml (NF-e modelo 55).")

    raw_bytes = await file.read(MAX_PURCHASE_XML_BYTES + 1)
    if len(raw_bytes) > MAX_PURCHASE_XML_BYTES:
        raise HTTPException(
            status_code=413,
            detail="O arquivo XML excede o limite máximo permitido de 10 MB para este tipo de envio.",
        )

    parsed_xml = _parse_supplier_nfe_xml(raw_bytes)

    order: Optional[HorusPurchaseOrder] = None
    if order_id is not None and int(order_id) > 0:
        order = (
            db.query(HorusPurchaseOrder)
            .filter(HorusPurchaseOrder.id == int(order_id), HorusPurchaseOrder.company_id == seller_id)
            .first()
        )
        if not order:
            raise HTTPException(status_code=404, detail="Pedido de compra selecionado não foi encontrado.")
    else:
        order = _auto_locate_order_for_xml(db, seller_id, parsed_xml, branch_id)
        if not order:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Não foi possível vincular automaticamente a NF-e nº {parsed_xml['numero_nf']} "
                    f"({parsed_xml['emit_nome'] or parsed_xml['emit_cnpj']}) a um pedido aberto. "
                    "Selecione o Pedido de Compra correspondente antes de analisar o XML."
                ),
            )

    comp = _compare_xml_with_purchase_order(order, parsed_xml)

    # Salva cópia física isolada por seller em uploads/<company_id>/purchase_xmls/ (Regra 1 AGENTS.md)
    xml_rel_path: Optional[str] = None
    try:
        seller_xml_dir = UPLOADS_ROOT / str(seller_id) / "purchase_xmls"
        seller_xml_dir.mkdir(parents=True, exist_ok=True)
        safe_key = re.sub(r"[^A-Za-z0-9_-]", "", parsed_xml.get("chave_acesso") or f"NF{parsed_xml['numero_nf']}")[:50]
        target_name = f"ped_{order.horus_cod_pedido or order.id}_{safe_key}.xml"
        full_file = seller_xml_dir / target_name
        full_file.write_bytes(raw_bytes)
        xml_rel_path = f"uploads/{seller_id}/purchase_xmls/{target_name}"
    except Exception as io_err:
        log.warning(f"[HorusPurchases] Aviso ao persistir XML em uploads/{seller_id}/purchase_xmls: {io_err}")

    is_100_ok = comp["diagnostic_status"] == "MATCH_100"
    now_utc = datetime.utcnow()

    if is_100_ok and auto_accept_if_ok:
        initial_decision = "XML_OK"
        decided_uid = uid
        decided_uname = uname
        decided_dt = now_utc
        auto_note = (
            f"XML da NF-e nº {parsed_xml['numero_nf']} conferido 100% sem divergências "
            "(Preço de Capa, Desconto % e Quantidade idênticos ao Pedido). Aceito automaticamente como XML OK."
        )
    else:
        initial_decision = "PENDING_REVIEW"
        decided_uid = None
        decided_uname = None
        decided_dt = None
        auto_note = None

    audit = HorusPurchaseXmlAudit(
        company_id=seller_id,
        order_id=order.id,
        branch_id=order.branch_id,
        branch_name=order.branch_name,
        horus_cod_pedido=order.horus_cod_pedido,
        chave_acesso=parsed_xml["chave_acesso"],
        numero_nf=parsed_xml["numero_nf"],
        serie_nf=parsed_xml["serie_nf"],
        data_emissao=parsed_xml["data_emissao"],
        nat_op=parsed_xml["nat_op"],
        emit_cnpj=parsed_xml["emit_cnpj"],
        emit_nome=parsed_xml["emit_nome"],
        dest_cnpj=parsed_xml["dest_cnpj"],
        dest_nome=parsed_xml["dest_nome"],
        xml_xped=parsed_xml["xml_xped"],
        xml_file_path=xml_rel_path,
        xml_content=parsed_xml["xml_text"],
        order_total_qty=int(order.total_quantity or 0),
        xml_total_qty=comp["xml_total_qty"],
        order_total_gross=order.total_gross or Decimal("0.00"),
        xml_total_gross=parsed_xml["tot_vprod"],
        order_total_discount=order.total_discount or Decimal("0.00"),
        xml_total_discount=parsed_xml["tot_vdesc"],
        order_total_net=order.total_net or Decimal("0.00"),
        xml_total_products_net=comp["xml_total_products_net"],
        xml_total_nf=parsed_xml["tot_vnf"],
        xml_frete=parsed_xml["tot_vfrete"],
        xml_ipi_st_outros=parsed_xml["tot_ipi_st_outros"],
        diagnostic_status=comp["diagnostic_status"],
        matched_ok_count=comp["matched_ok_count"],
        divergent_items_count=comp["divergent_items_count"],
        diff_cover_count=comp["diff_cover_count"],
        diff_discount_count=comp["diff_discount_count"],
        diff_qty_count=comp["diff_qty_count"],
        extra_in_xml_count=comp["extra_in_xml_count"],
        missing_in_xml_count=comp["missing_in_xml_count"],
        header_warnings=comp["header_warnings"],
        decision_status=initial_decision,
        decision_notes=auto_note,
        uploaded_by_user_id=uid,
        uploaded_by_name=uname,
        decided_by_user_id=decided_uid,
        decided_by_name=decided_uname,
        decided_at=decided_dt,
    )
    db.add(audit)
    db.flush()

    for ln in comp["lines"]:
        db.add(HorusPurchaseXmlAuditItem(
            audit_id=audit.id,
            order_item_id=ln["order_item_id"],
            xml_n_item=ln["xml_n_item"],
            cod_item=ln["cod_item"],
            isbn=ln["isbn"][:30] if ln["isbn"] else None,
            xml_ean=ln["xml_ean"][:30] if ln["xml_ean"] else None,
            xml_cprod=ln["xml_cprod"][:60] if ln["xml_cprod"] else None,
            title=ln["title"][:255],
            nome_editora=ln["nome_editora"][:150] if ln["nome_editora"] else None,
            cfop=ln["cfop"][:10] if ln["cfop"] else None,
            order_qty=ln["order_qty"],
            order_cover_price=ln["order_cover_price"],
            order_discount_pct=ln["order_discount_pct"],
            order_unit_net=ln["order_unit_net"],
            order_subtotal_net=ln["order_subtotal_net"],
            xml_qty=ln["xml_qty"],
            xml_cover_price=ln["xml_cover_price"],
            xml_discount_pct=ln["xml_discount_pct"],
            xml_effective_discount_pct=ln["xml_effective_discount_pct"],
            xml_unit_net=ln["xml_unit_net"],
            xml_subtotal_net=ln["xml_subtotal_net"],
            line_status=ln["line_status"],
            has_qty_diff=ln["has_qty_diff"],
            has_cover_diff=ln["has_cover_diff"],
            has_discount_diff=ln["has_discount_diff"],
            is_extra_in_xml=ln["is_extra_in_xml"],
            is_missing_in_xml=ln["is_missing_in_xml"],
            divergence_tags=ln["divergence_tags"],
            divergence_summary=ln["divergence_summary"][:500] if ln["divergence_summary"] else None,
        ))

    # Se solicitado e XML aprovado (XML_OK), avança também no Horus de AP para AE caso ainda esteja AP
    if initial_decision == "XML_OK" and advance_horus_to_ae and order.horus_status == "AP":
        _transition_order_status_in_horus_and_cronuz(
            db=db,
            seller_id=seller_id,
            order=order,
            new_horus_status="AE",
            current_user=current_user,
            notes=f"Pedido avançado de AP para AE no Horus após conferência 100% da NF-e nº {parsed_xml['numero_nf']}.",
        )

    old_order_status = order.status
    new_order_status = XML_DECISION_TO_ORDER_STATUS[initial_decision]
    order.status = new_order_status
    order.xml_status = initial_decision
    order.last_xml_audit_id = audit.id
    order.last_nfe_number = parsed_xml["numero_nf"]
    order.last_nfe_series = parsed_xml["serie_nf"]
    order.last_nfe_key = parsed_xml["chave_acesso"]
    order.xml_checked_at = now_utc
    order.xml_checked_by_name = uname
    order.updated_by_user_id = uid
    order.updated_by_name = uname

    db.add(HorusPurchaseOrderLog(
        order_id=order.id,
        action="XML_ACCEPTED_OK" if initial_decision == "XML_OK" else "XML_UPLOADED_DIVERGENT",
        old_status=old_order_status,
        new_status=new_order_status,
        old_horus_status=order.horus_status,
        new_horus_status=order.horus_status,
        details=(
            f"NF-e nº {parsed_xml['numero_nf']} analisada contra Pedido #{order.horus_cod_pedido}: "
            + (
                "100% compatível -> Status alterado para XML OK."
                if initial_decision == "XML_OK"
                else (
                    f"{comp['divergent_items_count']} item(ns) com divergência "
                    f"(Capa: {comp['diff_cover_count']}, Desconto: {comp['diff_discount_count']}, "
                    f"Qtd: {comp['diff_qty_count']}, Extras: {comp['extra_in_xml_count']}, "
                    f"Faltantes: {comp['missing_in_xml_count']}) -> Enviada para Análise Posterior."
                )
            )
        ),
        extra_meta={"audit_id": audit.id, "chave_acesso": parsed_xml["chave_acesso"]},
        user_id=uid,
        user_name=uname,
    ))

    db.commit()
    db.refresh(audit)

    return {
        "success": True,
        "audit": _serialize_xml_audit_summary(audit, order),
        "message": (
            f"XML da NF-e nº {parsed_xml['numero_nf']} 100% compatível com o Pedido #{order.horus_cod_pedido}! Status atualizado para XML OK."
            if initial_decision == "XML_OK"
            else (
                f"NF-e nº {parsed_xml['numero_nf']} analisada com {comp['divergent_items_count']} divergência(s) pontuada(s). "
                "Verifique os itens na tela de Análise para Aceitar c/ Divergência, Recusar ou Validar."
            )
        ),
    }


@router.get("/xml-audits")
def list_horus_purchase_xml_audits(
    branch_id: Optional[int] = Query(None),
    decision_status: Optional[str] = Query(None),
    diagnostic_status: Optional[str] = Query(None),
    divergence_type: Optional[str] = Query(None),  # ALL, COVER, DISCOUNT, QTY, EXTRA, MISSING
    search: Optional[str] = Query(None),
    limit: int = Query(100, ge=1, le=300),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    seller_id = _resolve_seller_id(current_user, company_id)

    base_q = db.query(HorusPurchaseXmlAudit).filter(HorusPurchaseXmlAudit.company_id == seller_id)
    if branch_id is not None:
        base_q = base_q.filter(HorusPurchaseXmlAudit.branch_id == int(branch_id))

    # Contadores executivos da filial selecionada (para cabeçalho e abas de filtro rápido)
    all_for_kpi = base_q.all()
    kpis = {
        "total": len(all_for_kpi),
        "pending_review": sum(1 for x in all_for_kpi if x.decision_status == "PENDING_REVIEW"),
        "xml_ok": sum(1 for x in all_for_kpi if x.decision_status == "XML_OK"),
        "accepted_with_divergence": sum(1 for x in all_for_kpi if x.decision_status == "ACCEPTED_WITH_DIVERGENCE"),
        "rejected": sum(1 for x in all_for_kpi if x.decision_status == "REJECTED"),
        "has_divergence": sum(1 for x in all_for_kpi if x.diagnostic_status == "HAS_DIVERGENCE"),
    }

    q = base_q
    if decision_status and decision_status.upper() != "ALL":
        q = q.filter(HorusPurchaseXmlAudit.decision_status == decision_status.upper())
    if diagnostic_status and diagnostic_status.upper() != "ALL":
        q = q.filter(HorusPurchaseXmlAudit.diagnostic_status == diagnostic_status.upper())
    if divergence_type and divergence_type.upper() != "ALL":
        dt_up = divergence_type.upper()
        if dt_up == "COVER":
            q = q.filter(HorusPurchaseXmlAudit.diff_cover_count > 0)
        elif dt_up == "DISCOUNT":
            q = q.filter(HorusPurchaseXmlAudit.diff_discount_count > 0)
        elif dt_up == "QTY":
            q = q.filter(HorusPurchaseXmlAudit.diff_qty_count > 0)
        elif dt_up == "EXTRA":
            q = q.filter(HorusPurchaseXmlAudit.extra_in_xml_count > 0)
        elif dt_up == "MISSING":
            q = q.filter(HorusPurchaseXmlAudit.missing_in_xml_count > 0)

    if search and search.strip():
        s_clean = search.strip()
        term = f"%{s_clean}%"
        if s_clean.isdigit() and len(s_clean) <= 9:
            q = q.filter(
                (HorusPurchaseXmlAudit.numero_nf.ilike(term))
                | (HorusPurchaseXmlAudit.horus_cod_pedido == int(s_clean))
                | (HorusPurchaseXmlAudit.emit_cnpj.ilike(term))
            )
        else:
            q = q.filter(
                (HorusPurchaseXmlAudit.numero_nf.ilike(term))
                | (HorusPurchaseXmlAudit.chave_acesso.ilike(term))
                | (HorusPurchaseXmlAudit.emit_nome.ilike(term))
                | (HorusPurchaseXmlAudit.emit_cnpj.ilike(term))
            )

    audits = q.order_by(HorusPurchaseXmlAudit.created_at.desc()).limit(limit).all()
    return {
        "kpis": kpis,
        "audits": [_serialize_xml_audit_summary(a) for a in audits],
    }


@router.get("/xml-audits/{audit_id}")
def get_horus_purchase_xml_audit_detail(
    audit_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    seller_id = _resolve_seller_id(current_user, company_id)
    audit = (
        db.query(HorusPurchaseXmlAudit)
        .filter(HorusPurchaseXmlAudit.id == int(audit_id), HorusPurchaseXmlAudit.company_id == seller_id)
        .first()
    )
    if not audit:
        raise HTTPException(status_code=404, detail="Registro de auditoria de XML não encontrado.")

    return {
        "audit": _serialize_xml_audit_summary(audit),
        "items": [
            {
                "id": it.id,
                "order_item_id": it.order_item_id,
                "xml_n_item": it.xml_n_item,
                "cod_item": it.cod_item,
                "isbn": it.isbn,
                "xml_ean": it.xml_ean,
                "xml_cprod": it.xml_cprod,
                "title": it.title,
                "nome_editora": it.nome_editora,
                "cfop": it.cfop,
                "order_qty": it.order_qty,
                "order_cover_price": float(it.order_cover_price or 0.0),
                "order_discount_pct": float(it.order_discount_pct or 0.0),
                "order_unit_net": float(it.order_unit_net or 0.0),
                "order_subtotal_net": float(it.order_subtotal_net or 0.0),
                "xml_qty": it.xml_qty,
                "xml_cover_price": float(it.xml_cover_price or 0.0),
                "xml_discount_pct": float(it.xml_discount_pct or 0.0),
                "xml_effective_discount_pct": float(it.xml_effective_discount_pct or 0.0),
                "xml_unit_net": float(it.xml_unit_net or 0.0),
                "xml_subtotal_net": float(it.xml_subtotal_net or 0.0),
                "line_status": it.line_status,
                "has_qty_diff": it.has_qty_diff,
                "has_cover_diff": it.has_cover_diff,
                "has_discount_diff": it.has_discount_diff,
                "is_extra_in_xml": it.is_extra_in_xml,
                "is_missing_in_xml": it.is_missing_in_xml,
                "divergence_tags": it.divergence_tags or [],
                "divergence_summary": it.divergence_summary,
                "item_note": it.item_note,
            }
            for it in audit.audit_items
        ],
        "order_logs": [
            {
                "id": lg.id,
                "action": lg.action,
                "old_status": lg.old_status,
                "new_status": lg.new_status,
                "old_horus_status": lg.old_horus_status,
                "new_horus_status": lg.new_horus_status,
                "details": lg.details,
                "user_name": lg.user_name,
                "created_at": _fmt_dt(lg.created_at),
            }
            for lg in (audit.order.logs if audit.order else [])
        ],
    }


@router.patch("/xml-audits/{audit_id}/decision")
def decide_horus_purchase_xml_audit(
    audit_id: int,
    payload: XmlAuditDecisionPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Executa a Análise Posterior / Decisão Formal sobre o XML da NF-e:
      - XML_OK: Aceitar OK (muda pedido para XML OK)
      - ACCEPTED_WITH_DIVERGENCE: Aceitar com Divergência (exige justificativa/pontuação obrigatória)
      - REJECTED: Recusar XML (exige motivo da recusa obrigatório)
      - PENDING_REVIEW: Reabrir para análise
    Salva também pontuações específicas por item (item_notes) e registra histórico completo de auditoria.
    """
    seller_id = _resolve_seller_id(current_user, payload.company_id)
    uid, uname, _ = _user_meta(current_user)

    target_dec = (payload.decision_status or "").strip().upper()
    if target_dec not in ("XML_OK", "ACCEPTED_WITH_DIVERGENCE", "REJECTED", "PENDING_REVIEW"):
        raise HTTPException(status_code=400, detail="Status de decisão de XML inválido.")

    audit = (
        db.query(HorusPurchaseXmlAudit)
        .filter(HorusPurchaseXmlAudit.id == int(audit_id), HorusPurchaseXmlAudit.company_id == seller_id)
        .first()
    )
    if not audit:
        raise HTTPException(status_code=404, detail="Auditoria de XML não encontrada.")

    notes_clean = (payload.decision_notes or "").strip()
    if target_dec in ("ACCEPTED_WITH_DIVERGENCE", "REJECTED") and len(notes_clean) < 5:
        raise HTTPException(
            status_code=400,
            detail=(
                "Informe a observação/pontuação obrigatória justificando o "
                + ("Aceite com Divergência." if target_dec == "ACCEPTED_WITH_DIVERGENCE" else "Motivo da Recusa do XML.")
            ),
        )
    if target_dec == "XML_OK" and audit.diagnostic_status == "HAS_DIVERGENCE" and len(notes_clean) < 5:
        raise HTTPException(
            status_code=400,
            detail="Esta NF-e possui divergências apontadas. Use 'Aceitar com Divergência' ou pontue a justificativa para marcar como XML OK.",
        )

    if payload.item_notes:
        notes_by_item_id = {int(k): str(v or "").strip()[:500] for k, v in payload.item_notes.items() if str(k).isdigit()}
        for ait in audit.audit_items:
            if ait.id in notes_by_item_id:
                ait.item_note = notes_by_item_id[ait.id] or None

    now_utc = datetime.utcnow()
    audit.decision_status = target_dec
    audit.decision_notes = notes_clean or audit.decision_notes
    audit.decided_by_user_id = uid
    audit.decided_by_name = uname
    audit.decided_at = now_utc

    order = audit.order
    if order:
        if payload.advance_horus_to_ae and target_dec in ("XML_OK", "ACCEPTED_WITH_DIVERGENCE") and order.horus_status == "AP":
            _transition_order_status_in_horus_and_cronuz(
                db=db,
                seller_id=seller_id,
                order=order,
                new_horus_status="AE",
                current_user=current_user,
                notes=f"Pedido avançado de AP para AE no Horus na aprovação do XML da NF-e nº {audit.numero_nf}.",
            )

        old_st = order.status
        new_st = XML_DECISION_TO_ORDER_STATUS[target_dec]
        order.xml_status = target_dec
        order.last_xml_audit_id = audit.id
        order.last_nfe_number = audit.numero_nf
        order.last_nfe_series = audit.serie_nf
        order.last_nfe_key = audit.chave_acesso
        order.xml_checked_at = now_utc
        order.xml_checked_by_name = uname
        if order.horus_status not in ("EE", "FE", "CA"):
            order.status = new_st
        order.updated_by_user_id = uid
        order.updated_by_name = uname

        db.add(HorusPurchaseOrderLog(
            order_id=order.id,
            action=f"XML_DECISION_{target_dec}",
            old_status=old_st,
            new_status=order.status,
            old_horus_status=order.horus_status,
            new_horus_status=order.horus_status,
            details=(
                f"Decisão sobre NF-e nº {audit.numero_nf}: {XML_DECISION_LABELS.get(target_dec, target_dec)}"
                + (f" — Pontuação: {notes_clean}" if notes_clean else "")
            ),
            extra_meta={"audit_id": audit.id, "decision_status": target_dec},
            user_id=uid,
            user_name=uname,
        ))

    db.commit()
    db.refresh(audit)

    return {
        "success": True,
        "audit": _serialize_xml_audit_summary(audit, order),
        "message": f"Decisão '{XML_DECISION_LABELS.get(target_dec, target_dec)}' registrada com sucesso para a NF-e nº {audit.numero_nf}!",
    }


@router.get("/xml-audits/{audit_id}/export-excel")
def export_horus_purchase_xml_audit_excel(
    audit_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Exporta planilha executiva (.xlsx) da Auditoria do XML vs Pedido de Compra com todas as divergências
    (Preço de Capa, Desconto %, Quantidade, Extras e Faltantes) e pontuações destacadas por cor.
    """
    seller_id = _resolve_seller_id(current_user, company_id)
    audit = (
        db.query(HorusPurchaseXmlAudit)
        .filter(HorusPurchaseXmlAudit.id == int(audit_id), HorusPurchaseXmlAudit.company_id == seller_id)
        .first()
    )
    if not audit:
        raise HTTPException(status_code=404, detail="Auditoria de XML não encontrada.")

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"Auditoria_NF_{audit.numero_nf}"[:31]

    thin = Side(style="thin", color="CBD5E1")
    border_all = Border(left=thin, right=thin, top=thin, bottom=thin)

    ws.merge_cells("A1:N1")
    ws["A1"] = (
        f"AUDITORIA DE XML NF-e Nº {audit.numero_nf} vs PEDIDO HORUS #{audit.horus_cod_pedido or audit.order_id} "
        f"— {XML_DECISION_LABELS.get(audit.decision_status, audit.decision_status).upper()}"
    )
    ws["A1"].font = Font(size=12, bold=True, color="FFFFFF")
    ws["A1"].fill = PatternFill(start_color="0F172A", end_color="0F172A", fill_type="solid")
    ws["A1"].alignment = Alignment(horizontal="left", vertical="center")
    ws.row_dimensions[1].height = 26

    ws.append([
        "Filial:", audit.branch_name or "-",
        "Fornecedor NF:", f"{audit.emit_nome or '-'} ({audit.emit_cnpj or '-'})",
        "Chave NF-e:", audit.chave_acesso or "-",
        "Emissão NF:", (audit.data_emissao or "-")[:19],
    ])
    ws.append([
        "Qtd Pedido / XML:", f"{audit.order_total_qty} / {audit.xml_total_qty}",
        "Líquido Pedido / XML:", f"R$ {float(audit.order_total_net or 0):.2f} / R$ {float(audit.xml_total_products_net or 0):.2f}",
        "Divergências:", (
            f"Itens Div: {audit.divergent_items_count} (Capa: {audit.diff_cover_count} | "
            f"Desc: {audit.diff_discount_count} | Qtd: {audit.diff_qty_count} | "
            f"Extras: {audit.extra_in_xml_count} | Faltas: {audit.missing_in_xml_count})"
        ),
        "Decidido por:", f"{audit.decided_by_name or 'Pendente'} ({_fmt_dt(audit.decided_at) or '-'})",
    ])
    if audit.decision_notes:
        ws.append(["Pontuação / Parecer:", audit.decision_notes])
    ws.append([])

    headers = [
        "Situação",
        "ISBN / EAN",
        "Cód. Horus",
        "Título",
        "Editora",
        "Qtd Pedido",
        "Qtd XML",
        "Capa Pedido (R$)",
        "Capa XML (R$)",
        "Desc. Pedido (%)",
        "Desc. XML (%)",
        "Líq. Unit. Pedido",
        "Líq. Unit. XML",
        "Divergências Identificadas / Pontuação",
    ]
    ws.append(headers)
    h_row = ws.max_row
    for c_i in range(1, len(headers) + 1):
        cell = ws.cell(row=h_row, column=c_i)
        cell.font = Font(bold=True, color="FFFFFF", size=10)
        cell.fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
        cell.border = border_all
    ws.row_dimensions[h_row].height = 22

    ok_fill = PatternFill(start_color="ECFDF5", end_color="ECFDF5", fill_type="solid")
    div_fill = PatternFill(start_color="FEF3C7", end_color="FEF3C7", fill_type="solid")

    for it in audit.audit_items:
        note_suffix = f" | Nota Comprador: {it.item_note}" if it.item_note else ""
        ws.append([
            "OK" if it.line_status == "OK" else "DIVERGENTE",
            it.isbn or it.xml_ean or "",
            it.cod_item or "-",
            it.title,
            it.nome_editora or "-",
            int(it.order_qty or 0),
            int(it.xml_qty or 0),
            float(it.order_cover_price or 0.0),
            float(it.xml_cover_price or 0.0),
            float(it.order_discount_pct or 0.0),
            float(it.xml_discount_pct or 0.0),
            float(it.order_unit_net or 0.0),
            float(it.xml_unit_net or 0.0),
            (it.divergence_summary or "") + note_suffix,
        ])
        r_i = ws.max_row
        row_fill = ok_fill if it.line_status == "OK" else div_fill
        for c_i in range(1, len(headers) + 1):
            c_obj = ws.cell(row=r_i, column=c_i)
            c_obj.border = border_all
            if c_i in (1, 14) or it.line_status != "OK":
                c_obj.fill = row_fill
        for money_col in (8, 9, 12, 13):
            ws.cell(row=r_i, column=money_col).number_format = "R$ #,##0.00"
        for pct_col in (10, 11):
            ws.cell(row=r_i, column=pct_col).number_format = "0.00\"%\""

    widths = [14, 17, 12, 42, 22, 12, 12, 16, 16, 15, 15, 16, 16, 56]
    for idx_w, w_val in enumerate(widths, start=1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(idx_w)].width = w_val

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    fname = f"Auditoria_XML_NF{audit.numero_nf}_Pedido_{audit.horus_cod_pedido or audit.order_id}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )

