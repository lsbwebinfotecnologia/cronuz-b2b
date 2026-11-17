import os
import re
import logging
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Dict, Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.db.session import get_db, SessionLocal
from app.core import dependencies
from app.models.user import User, UserRole
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.product import Product
from app.models.catalog_support import Category, Brand
from app.models.customer import Customer, Address
from app.models.order import Order, OrderItem
from app.models.estantevirtual import (
    MarketplaceSyncQueue,
    EvListing,
    EvOrder,
    EvSyncLog,
)

logger = logging.getLogger("cronuz.estantevirtual")

router = APIRouter(prefix="/estantevirtual", tags=["estantevirtual"])

EV_API_BASE_PROD = "https://api-marketplace.estantevirtual.com.br"
EV_API_BASE_SANDBOX = os.getenv("EV_API_BASE_SANDBOX", "https://api-marketplace.estantevirtual.com.br")

# ─── Tabela Oficial das 74 Estantes/Categorias da Estante Virtual (README.md) ─
EV_OFFICIAL_CATEGORIES: List[Dict[str, Any]] = [
    {"id": 1, "name": "Administração"},
    {"id": 2, "name": "Antropologia"},
    {"id": 3, "name": "Arqueologia"},
    {"id": 4, "name": "Arquitetura"},
    {"id": 5, "name": "Astronomia"},
    {"id": 6, "name": "Biologia"},
    {"id": 7, "name": "Ciência Política"},
    {"id": 8, "name": "Ciências Exatas"},
    {"id": 9, "name": "Comunicação"},
    {"id": 10, "name": "Contabilidade"},
    {"id": 11, "name": "Direito"},
    {"id": 12, "name": "Ecologia"},
    {"id": 13, "name": "Economia"},
    {"id": 14, "name": "Filosofia"},
    {"id": 15, "name": "História do Brasil"},
    {"id": 16, "name": "História Geral"},
    {"id": 17, "name": "Geografia"},
    {"id": 18, "name": "Informática"},
    {"id": 19, "name": "Engenharia"},
    {"id": 20, "name": "Linguística"},
    {"id": 22, "name": "Medicina"},
    {"id": 23, "name": "Música"},
    {"id": 24, "name": "Pedagogia"},
    {"id": 25, "name": "Psicologia"},
    {"id": 26, "name": "Sociologia"},
    {"id": 27, "name": "Artes"},
    {"id": 28, "name": "Brasil"},
    {"id": 29, "name": "Auto Ajuda"},
    {"id": 30, "name": "Biografias"},
    {"id": 31, "name": "Cinema"},
    {"id": 32, "name": "Culinária"},
    {"id": 33, "name": "Decoração"},
    {"id": 34, "name": "Didáticos"},
    {"id": 35, "name": "Botânica"},
    {"id": 36, "name": "Hobbies"},
    {"id": 37, "name": "Moda"},
    {"id": 38, "name": "Jogos"},
    {"id": 39, "name": "Comportamento"},
    {"id": 40, "name": "Ensino de Idiomas"},
    {"id": 41, "name": "Esoterismo"},
    {"id": 42, "name": "Folclore"},
    {"id": 43, "name": "Guerra"},
    {"id": 44, "name": "Esportes"},
    {"id": 45, "name": "Ficção Científica"},
    {"id": 46, "name": "Genealogia"},
    {"id": 47, "name": "Infanto Juvenis"},
    {"id": 48, "name": "Literatura Brasileira"},
    {"id": 49, "name": "Literatura Estrangeira"},
    {"id": 50, "name": "Crítica Literária"},
    {"id": 51, "name": "Poesia"},
    {"id": 52, "name": "Contos"},
    {"id": 54, "name": "Saúde"},
    {"id": 55, "name": "Sexualidade"},
    {"id": 56, "name": "Teatro"},
    {"id": 57, "name": "Fotografia"},
    {"id": 58, "name": "Pintura"},
    {"id": 59, "name": "Turismo"},
    {"id": 60, "name": "Humor"},
    {"id": 61, "name": "Religião"},
    {"id": 62, "name": "Artesanato"},
    {"id": 63, "name": "Pecuária"},
    {"id": 64, "name": "Agricultura"},
    {"id": 65, "name": "Outros Assuntos"},
    {"id": 66, "name": "Revistas"},
    {"id": 67, "name": "Jornais"},
    {"id": 68, "name": "Coleções"},
    {"id": 69, "name": "Dicionários"},
    {"id": 70, "name": "Enciclopédias"},
    {"id": 71, "name": "Gibis"},
    {"id": 72, "name": "Livros Raros"},
    {"id": 73, "name": "Documentos"},
    {"id": 74, "name": "Manuscritos"},
]

EV_CATEGORY_MAP_BY_ID: Dict[int, str] = {c["id"]: c["name"] for c in EV_OFFICIAL_CATEGORIES}

EV_ACCEPTED_LANGUAGES: Dict[str, str] = {
    "Pt": "Português",
    "En": "Inglês",
    "Es": "Espanhol",
    "Fr": "Francês",
    "De": "Alemão",
    "It": "Italiano",
    "Jp": "Japonês",
    "Ch": "Chinês",
    "Co": "Coreano",
    "Da": "Dinamarquês",
    "El": "Grego",
    "He": "Hebraico",
    "Ho": "Holandês",
    "Hu": "Húngaro",
    "La": "Latim",
    "Pl": "Polonês",
    "Ru": "Russo",
}

EV_VALID_CANCEL_REASONS = ("sem_estoque", "erro_processamento", "cliente_devolveu")

# Transições de status permitidas segundo a documentação oficial da EV:
EV_ALLOWED_STATUS_TRANSITIONS = {
    ("PROCESSING", "STANDBY"),
    ("STANDBY", "SENT"),
    ("STANDBY", "CANCELED"),
    ("SENT", "CANCELED"),
    ("CANCELED", "STANDBY"),
    ("SENT", "STANDBY"),
}

DEFAULT_EV_PRESET: Dict[str, Any] = {
    "default_category_id": 65,
    "default_category_name": "Outros Assuntos",
    "default_condition": "NOVO",  # NOVO | USADO (imutável após criação na EV)
    "price_rule_type": "PERCENTAGE",  # PERCENTAGE | FIXED
    "price_rule_value": 0.0,
    "min_price_floor": 6.00,  # Regra oficial EV: mínimo R$ 6,00
    "min_stock_buffer": 0,
    "default_handling_days": 2,  # prazo_postagem (1 a 20 dias)
    "default_language": "Pt",
    "default_weight_grams": 300,
    "default_release_year": 2024,
    "default_publisher_fallback": "Editora",
    "default_author_fallback": "Vários Autores",
    "auto_sync_stock": True,
    "auto_import_orders": True,
    "auto_send_horus_order": False,
    "horus_default_customer_doc": "",
    "horus_default_customer_guid": "",
    "category_mapping": {},
}


# ─── Helpers de Contexto, Sanitização, Preço, Categoria e Token JWT 24h ──────

def _resolve_company_id(current_user: User, company_id_param: Optional[int] = None) -> int:
    if current_user.type == UserRole.MASTER and company_id_param:
        return company_id_param
    if current_user.company_id:
        return current_user.company_id
    raise HTTPException(status_code=400, detail="Empresa não identificada para esta operação.")


def _get_or_create_settings(db: Session, company_id: int) -> CompanySettings:
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        settings = CompanySettings(company_id=company_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def get_merged_ev_preset(settings: CompanySettings) -> Dict[str, Any]:
    raw = settings.ev_preset_config if isinstance(settings.ev_preset_config, dict) else {}
    merged = {**DEFAULT_EV_PRESET, **raw}
    if not isinstance(merged.get("category_mapping"), dict):
        merged["category_mapping"] = {}
    return merged


def get_ev_base_url(settings: CompanySettings) -> str:
    env = (settings.ev_environment or "PRODUCAO").upper()
    if env == "SANDBOX":
        return EV_API_BASE_SANDBOX.rstrip("/")
    return EV_API_BASE_PROD.rstrip("/")


def sanitize_ev_text(text: Optional[str], max_len: int = 130) -> str:
    """
    Sanitiza texto para a API da Estante Virtual conforme faq.md:
    - Remove tags HTML (somente texto plano permitido);
    - Remove emojis e caracteres ideográficos (chinês, etc.);
    - Trunca no limite máximo de caracteres (130 no título, 65535 na sinopse).
    """
    if not text:
        return ""
    cleaned = re.sub(r"<[^>]+>", " ", str(text))
    # Mantém caracteres latinos, acentuação em português, números e pontuação padrão
    cleaned = re.sub(r"[^\x20-\x7E\xA0-\xFF\u2010-\u2027\n\r\t]", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:max_len]


def normalize_ev_language(lang_raw: Optional[str], fallback: str = "Pt") -> str:
    if not lang_raw:
        return fallback
    val = str(lang_raw).strip()
    if val in EV_ACCEPTED_LANGUAGES:
        return val
    low = val.lower()
    if low.startswith("port") or low == "pt" or low == "pt-br":
        return "Pt"
    if low.startswith("ing") or low.startswith("eng") or low == "en":
        return "En"
    if low.startswith("esp") or low.startswith("spa") or low == "es":
        return "Es"
    if low.startswith("fran") or low == "fr":
        return "Fr"
    if low.startswith("alem") or low.startswith("ger") or low == "de":
        return "De"
    if low.startswith("ital") or low == "it":
        return "It"
    if low.startswith("jap") or low == "jp":
        return "Jp"
    return fallback if fallback in EV_ACCEPTED_LANGUAGES else "Pt"


def resolve_ev_category(
    subject_or_category: Optional[str],
    local_category_id: Optional[int],
    preset: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Resolve a Estante oficial (1..74) da Estante Virtual:
    1. Pelo De/Para explícito configurado no Preset (category_mapping);
    2. Por correspondência textual inteligente com as 74 categorias da EV;
    3. Pelo fallback padrão do Seller (default_category_id).
    """
    cat_map = preset.get("category_mapping") or {}
    if local_category_id is not None and str(local_category_id) in cat_map:
        mapped = cat_map[str(local_category_id)]
        if isinstance(mapped, dict) and mapped.get("id"):
            cid = int(mapped["id"])
            return {"id": cid, "name": EV_CATEGORY_MAP_BY_ID.get(cid, mapped.get("name") or "Outros Assuntos")}

    if subject_or_category:
        subj_low = str(subject_or_category).strip().lower()
        for c in EV_OFFICIAL_CATEGORIES:
            if c["name"].lower() in subj_low or subj_low in c["name"].lower():
                return {"id": c["id"], "name": c["name"]}
        # Palavras-chave frequentes no Horus ERP
        keyword_rules = [
            ("infantil", 47), ("juvenil", 47), ("direito", 11), ("jurídic", 11),
            ("religi", 61), ("teolog", 61), ("bíbli", 61), ("evang", 61),
            ("administra", 1), ("negócio", 1), ("gestão", 1), ("economi", 13),
            ("psicolog", 25), ("psicanál", 25), ("autoajuda", 29), ("auto-ajuda", 29),
            ("didátic", 34), ("escolar", 34), ("pedagog", 24), ("educaç", 24),
            ("medicin", 22), ("saúde", 54), ("enfermag", 54), ("filosof", 14),
            ("história do brasil", 15), ("história", 16), ("poesia", 51), ("poema", 51),
            ("conto", 52), ("crônica", 48), ("romance", 48), ("ficção", 45),
            ("informátic", 18), ("computa", 18), ("programaç", 18),
            ("hq", 71), ("quadrinho", 71), ("mangá", 71), ("gibi", 71),
        ]
        for kw, cid in keyword_rules:
            if kw in subj_low:
                return {"id": cid, "name": EV_CATEGORY_MAP_BY_ID[cid]}

    def_id = int(preset.get("default_category_id") or 65)
    if def_id not in EV_CATEGORY_MAP_BY_ID:
        def_id = 65
    return {"id": def_id, "name": EV_CATEGORY_MAP_BY_ID[def_id]}


def calculate_ev_prices(base_price: float, preset: Dict[str, Any]) -> Dict[str, float]:
    """
    Calcula 'valor_de' e 'valor_por' respeitando as regras da Estante Virtual:
    - Piso mínimo obrigatório de R$ 6,00 (faq.md);
    - Teto máximo decimal(7,2) = R$ 99.999,99;
    - Se houver desconto (rule_val < 0), valor_de = preço base e valor_por = preço com desconto;
    - Se houver acréscimo ou preço cheio, valor_de = valor_por.
    """
    raw_base = float(base_price or 0.0)
    floor_val = max(6.0, float(preset.get("min_price_floor") or 6.0))
    if raw_base <= 0:
        return {"valor_de": floor_val, "valor_por": floor_val}

    rule_type = str(preset.get("price_rule_type") or "PERCENTAGE").upper()
    rule_val = float(preset.get("price_rule_value") or 0.0)
    if rule_type == "PERCENTAGE":
        calculated = raw_base * (1.0 + (rule_val / 100.0))
    else:
        calculated = raw_base + rule_val

    valor_por = round(min(99999.99, max(floor_val, calculated)), 2)
    valor_de = round(min(99999.99, max(valor_por, raw_base)), 2)
    return {"valor_de": valor_de, "valor_por": valor_por}


def calculate_ev_effective_stock(raw_stock: int, preset: Dict[str, Any]) -> int:
    stock = max(0, int(raw_stock or 0))
    buffer_val = max(0, int(preset.get("min_stock_buffer") or 0))
    if stock <= buffer_val:
        return 0
    return stock


async def ensure_valid_ev_token(db: Session, settings: CompanySettings, force_login: bool = False) -> str:
    """
    Garante um Bearer Token válido (24h) da API Marketplace da Estante Virtual.
    Se ausente, expirado (ou próximo de expirar) ou com force_login=True,
    executa POST /auth/login com email e password e armazena em cmp_settings.
    """
    token = (settings.ev_auth_token or "").strip()
    email = (settings.ev_email or "").strip()
    password = (settings.ev_password or "").strip()
    now = datetime.now(timezone.utc)

    needs_refresh = force_login or not token
    if not needs_refresh and settings.ev_token_expires_at:
        exp = settings.ev_token_expires_at
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp <= now + timedelta(minutes=30):
            needs_refresh = True
    elif not settings.ev_token_expires_at:
        needs_refresh = True

    if needs_refresh:
        if not email or not password:
            raise HTTPException(
                status_code=400,
                detail="Credenciais da Estante Virtual incompletas: preencha o E-mail e a Senha da API nas Pré-Configurações (Etapa 1)."
            )
        base_url = get_ev_base_url(settings)
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.post(
                    f"{base_url}/auth/login",
                    data={"email": email, "password": password},
                    headers={"Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json"},
                )
                if resp.status_code in (200, 201):
                    data = resp.json() if resp.content else {}
                    new_token = str(data.get("auth_token") or data.get("token") or "").strip()
                    if not new_token:
                        raise HTTPException(
                            status_code=400,
                            detail=f"A API da Estante Virtual respondeu HTTP {resp.status_code}, mas não retornou 'auth_token'."
                        )
                    settings.ev_auth_token = new_token
                    settings.ev_token_expires_at = datetime.now(timezone.utc) + timedelta(hours=23)
                    db.commit()
                    return new_token
                else:
                    err_txt = (resp.text or "")[:300]
                    raise HTTPException(
                        status_code=400,
                        detail=f"Falha ao autenticar em {base_url}/auth/login (HTTP {resp.status_code}): {err_txt or 'Verifique e-mail e senha da Estante Virtual.'}"
                    )
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=502,
                detail=f"Não foi possível conectar ao servidor da Estante Virtual ({base_url}/auth/login): {str(e)}"
            )

    return token


def build_ev_product_payload(listing: EvListing, seller_id_int: int, is_update: bool = False) -> Dict[str, Any]:
    """
    Constrói o payload oficial de POST /produtos ou PUT /produtos da Estante Virtual.
    REGRA CRÍTICA (README.md):
    - Array 'produtos' contém sempre 1 único produto e 1 único SKU.
    - No PUT (atualização), NUNCA alterar/enviar o atributo 'tipo' (NOVO / USADO) para evitar duplicação de registro na EV.
    """
    attrs = listing.attributes_json if isinstance(listing.attributes_json, dict) else {}
    description = sanitize_ev_text(
        attrs.get("description") or f"Livro {listing.title} - Editora {listing.publisher} - ISBN {listing.isbn}",
        max_len=65535,
    )
    authors_list = attrs.get("authors") if isinstance(attrs.get("authors"), list) else [listing.author or "Vários Autores"]
    authors_clean = [sanitize_ev_text(a, max_len=100) for a in authors_list if str(a).strip()] or ["Vários Autores"]

    images_list = []
    if listing.thumbnail and str(listing.thumbnail).startswith("http"):
        images_list = [str(listing.thumbnail).strip()]  # FAQ: Somente 1 foto por produto

    sku_dict: Dict[str, Any] = {
        "nome": sanitize_ev_text(listing.title, max_len=130),
        "codigo": str(listing.sku).strip(),
        "marca": sanitize_ev_text(listing.publisher, max_len=100) or "Editora",
        "descricao": description,
        "isbn": re.sub(r"\D", "", str(listing.isbn)),
        "altura": str(attrs.get("height_cm") or "21.00"),
        "comprimento": str(attrs.get("length_cm") or "14.00"),
        "largura": str(attrs.get("width_cm") or "2.00"),
        "peso": str(max(50, int(listing.weight_grams or 300))),
        "idioma": normalize_ev_language(listing.language),
        "imagens": images_list,
        "status": "Ativo" if listing.current_stock > 0 and listing.status == "active" else "Inativo",
        "estoque": str(max(0, int(listing.current_stock or 0))),
        "valor_de": str(round(float(listing.base_price or listing.ev_price or 6.0), 2)),
        "valor_por": str(round(float(listing.ev_price or 6.0), 2)),
        "prazo_postagem": str(min(20, max(1, int(listing.handling_days or 2)))),
        "ano": int(listing.release_year or 2024),
    }

    if not is_update:
        sku_dict["tipo"] = "USADO" if str(listing.condition).upper() == "USADO" else "NOVO"

    return {
        "produtos": [
            {
                "categoria": str(listing.ev_category_name or "Outros Assuntos").lower(),
                "categoria_id": int(listing.ev_category_id or 65),
                "autores": authors_clean,
                "codigo": str(listing.sku).strip(),
                "id_vendedor": int(seller_id_int),
                "marca": sanitize_ev_text(listing.publisher, max_len=100) or "Editora",
                "nome": sanitize_ev_text(listing.title, max_len=130),
                "skus": [sku_dict],
            }
        ]
    }


# ─── Motor Unificado de Fila Assíncrona (mkt_sync_queue) ─────────────────────

def enqueue_marketplace_task(
    db: Session,
    company_id: int,
    channel: str,
    operation: str,
    sku: str,
    isbn_ean: Optional[str] = None,
    title: Optional[str] = None,
    listing_id: Optional[int] = None,
    product_id: Optional[int] = None,
    priority: int = 20,
    payload: Optional[Dict[str, Any]] = None,
) -> MarketplaceSyncQueue:
    """
    Insere ou atualiza (Upsert / Deduplicação) uma tarefa na fila mkt_sync_queue.
    Evita duplicar linhas pendentes para o mesmo (company_id, channel, sku, operation).
    """
    existing = db.query(MarketplaceSyncQueue).filter(
        MarketplaceSyncQueue.company_id == company_id,
        MarketplaceSyncQueue.channel == channel,
        MarketplaceSyncQueue.sku == str(sku).strip(),
        MarketplaceSyncQueue.operation == operation,
        MarketplaceSyncQueue.status.in_(["PENDING", "RETRY"]),
    ).first()

    if existing:
        existing.priority = min(existing.priority, priority)
        existing.payload_json = payload
        existing.title = title or existing.title
        existing.isbn_ean = isbn_ean or existing.isbn_ean
        existing.listing_id = listing_id or existing.listing_id
        existing.next_run_at = datetime.now(timezone.utc)
        return existing

    task = MarketplaceSyncQueue(
        company_id=company_id,
        channel=channel,
        operation=operation,
        priority=priority,
        listing_id=listing_id,
        product_id=product_id,
        sku=str(sku).strip(),
        isbn_ean=isbn_ean,
        title=(title or "")[:255] if title else None,
        payload_json=payload,
        status="PENDING",
        attempts=0,
        max_attempts=3,
        next_run_at=datetime.now(timezone.utc),
    )
    db.add(task)
    return task


async def drain_ev_sync_queue(db: Session, company_id: int, max_items: int = 50) -> Dict[str, Any]:
    """
    Consome a fila mkt_sync_queue da Estante Virtual para o Seller:
    1. Agrupa operações SYNC_STOCK em um único lote PUT /estoques;
    2. Agrupa operações SYNC_PRICE em um único lote PUT /precos;
    3. Executa operações PUBLISH_PRODUCT / UPDATE_PRODUCT 1 a 1 em POST/PUT /produtos;
    4. ELIMINA (DELETE) os itens concluídos com sucesso da fila mkt_sync_queue,
       mantendo apenas o estado vivo em ev_listings!
    """
    settings = _get_or_create_settings(db, company_id)
    seller_raw = re.sub(r"\D", "", str(settings.ev_seller_id or ""))
    if not seller_raw:
        raise HTTPException(
            status_code=400,
            detail="O campo 'id_vendedor' da Estante Virtual não está configurado nas Pré-Configurações (Etapa 1)."
        )
    seller_id_int = int(seller_raw)
    token = await ensure_valid_ev_token(db, settings)
    base_url = get_ev_base_url(settings)
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Accept": "application/json"}

    pending_tasks = (
        db.query(MarketplaceSyncQueue)
        .filter(
            MarketplaceSyncQueue.company_id == company_id,
            MarketplaceSyncQueue.channel == "estantevirtual",
            MarketplaceSyncQueue.status.in_(["PENDING", "RETRY"]),
        )
        .order_by(MarketplaceSyncQueue.priority.asc(), MarketplaceSyncQueue.id.asc())
        .limit(max_items)
        .all()
    )

    if not pending_tasks:
        return {"processed": 0, "succeeded": 0, "failed": 0, "drained": 0, "message": "Nenhum item pendente na fila."}

    processed = 0
    succeeded = 0
    failed = 0
    drained = 0

    stock_tasks: List[MarketplaceSyncQueue] = []
    price_tasks: List[MarketplaceSyncQueue] = []
    product_tasks: List[MarketplaceSyncQueue] = []

    for t in pending_tasks:
        if t.operation in ("SYNC_STOCK", "REMOVE_PRODUCT"):
            stock_tasks.append(t)
        elif t.operation == "SYNC_PRICE":
            price_tasks.append(t)
        else:
            product_tasks.append(t)

    now_utc = datetime.now(timezone.utc)

    async with httpx.AsyncClient(timeout=25.0) as client:
        # 1. Processa Lote de Estoque (PUT /estoques)
        if stock_tasks:
            estoques_payload = []
            task_by_sku: Dict[str, MarketplaceSyncQueue] = {}
            for st in stock_tasks:
                pl = st.payload_json or {}
                qty = 0 if st.operation == "REMOVE_PRODUCT" else max(0, int(pl.get("estoque", 0)))
                estoques_payload.append({
                    "codigo": st.sku,
                    "estoque": qty,
                    "id_vendedor": seller_id_int,
                })
                task_by_sku[st.sku] = st

            processed += len(stock_tasks)
            try:
                resp = await client.put(f"{base_url}/estoques", json={"estoques": estoques_payload}, headers=headers)
                if resp.status_code in (200, 201):
                    for st in stock_tasks:
                        pl = st.payload_json or {}
                        qty = 0 if st.operation == "REMOVE_PRODUCT" else max(0, int(pl.get("estoque", 0)))
                        lst = db.query(EvListing).filter(EvListing.company_id == company_id, EvListing.sku == st.sku).first()
                        if lst:
                            lst.current_stock = qty
                            lst.last_synced_stock = qty
                            lst.last_synced_at = now_utc
                            lst.sync_error = None
                            if qty == 0 and st.operation == "REMOVE_PRODUCT":
                                lst.status = "paused"
                        # Elimina da fila após sucesso!
                        db.delete(st)
                        succeeded += 1
                        drained += 1
                else:
                    err_msg = f"HTTP {resp.status_code} em PUT /estoques: {(resp.text or '')[:200]}"
                    for st in stock_tasks:
                        st.attempts += 1
                        st.error_message = err_msg
                        st.status = "FAILED" if st.attempts >= st.max_attempts else "RETRY"
                        failed += 1
            except Exception as e:
                for st in stock_tasks:
                    st.attempts += 1
                    st.error_message = f"Erro de rede em PUT /estoques: {str(e)}"
                    st.status = "FAILED" if st.attempts >= st.max_attempts else "RETRY"
                    failed += 1

        # 2. Processa Lote de Preços (PUT /precos)
        if price_tasks:
            precos_payload = []
            for pt in price_tasks:
                pl = pt.payload_json or {}
                v_de = round(max(6.0, float(pl.get("valor_de") or pl.get("valor_por") or 6.0)), 2)
                v_por = round(max(6.0, float(pl.get("valor_por") or 6.0)), 2)
                precos_payload.append({
                    "codigo": pt.sku,
                    "valor_de": v_de,
                    "valor_por": v_por,
                    "id_vendedor": seller_id_int,
                })

            processed += len(price_tasks)
            try:
                resp = await client.put(f"{base_url}/precos", json={"precos": precos_payload}, headers=headers)
                if resp.status_code in (200, 201):
                    for pt in price_tasks:
                        pl = pt.payload_json or {}
                        v_de = round(max(6.0, float(pl.get("valor_de") or pl.get("valor_por") or 6.0)), 2)
                        v_por = round(max(6.0, float(pl.get("valor_por") or 6.0)), 2)
                        lst = db.query(EvListing).filter(EvListing.company_id == company_id, EvListing.sku == pt.sku).first()
                        if lst:
                            lst.base_price = v_de
                            lst.ev_price = v_por
                            lst.last_synced_price = v_por
                            lst.last_synced_at = now_utc
                            lst.sync_error = None
                        # Elimina da fila após sucesso!
                        db.delete(pt)
                        succeeded += 1
                        drained += 1
                else:
                    err_msg = f"HTTP {resp.status_code} em PUT /precos: {(resp.text or '')[:200]}"
                    for pt in price_tasks:
                        pt.attempts += 1
                        pt.error_message = err_msg
                        pt.status = "FAILED" if pt.attempts >= pt.max_attempts else "RETRY"
                        failed += 1
            except Exception as e:
                for pt in price_tasks:
                    pt.attempts += 1
                    pt.error_message = f"Erro de rede em PUT /precos: {str(e)}"
                    pt.status = "FAILED" if pt.attempts >= pt.max_attempts else "RETRY"
                    failed += 1

        # 3. Processa Criação/Atualização de Produtos 1 a 1 (POST / PUT /produtos)
        for pr_task in product_tasks:
            processed += 1
            lst = db.query(EvListing).filter(EvListing.company_id == company_id, EvListing.sku == pr_task.sku).first()
            if not lst:
                db.delete(pr_task)
                drained += 1
                continue

            is_upd = bool(lst.is_published_on_ev or pr_task.operation == "UPDATE_PRODUCT")
            body = build_ev_product_payload(lst, seller_id_int, is_update=is_upd)
            try:
                if is_upd:
                    resp = await client.put(f"{base_url}/produtos", json=body, headers=headers)
                    # Regra oficial EV: se PUT retornar 422 dizendo que ainda não existe na base, enviar POST!
                    if resp.status_code == 422:
                        body_post = build_ev_product_payload(lst, seller_id_int, is_update=False)
                        resp = await client.post(f"{base_url}/produtos", json=body_post, headers=headers)
                else:
                    resp = await client.post(f"{base_url}/produtos", json=body, headers=headers)

                if resp.status_code in (200, 201):
                    lst.is_published_on_ev = True
                    lst.status = "active" if lst.current_stock > 0 else "paused"
                    lst.last_synced_stock = lst.current_stock
                    lst.last_synced_price = lst.ev_price
                    lst.last_synced_at = now_utc
                    lst.sync_error = None
                    # Elimina da fila após sucesso!
                    db.delete(pr_task)
                    succeeded += 1
                    drained += 1
                else:
                    err_txt = (resp.text or "")[:280]
                    lst.sync_error = f"HTTP {resp.status_code}: {err_txt}"
                    lst.status = "error"
                    pr_task.attempts += 1
                    pr_task.error_message = lst.sync_error
                    pr_task.status = "FAILED" if pr_task.attempts >= pr_task.max_attempts else "RETRY"
                    failed += 1
            except Exception as e:
                err_str = f"Falha de comunicação com {base_url}/produtos: {str(e)}"
                lst.sync_error = err_str
                lst.status = "error"
                pr_task.attempts += 1
                pr_task.error_message = err_str
                pr_task.status = "FAILED" if pr_task.attempts >= pr_task.max_attempts else "RETRY"
                failed += 1

    log_status = "SUCCESS" if failed == 0 else ("PARTIAL" if succeeded > 0 else "ERROR")
    db.add(EvSyncLog(
        company_id=company_id,
        sync_type="QUEUE_DRAIN",
        status=log_status,
        items_processed=processed,
        items_updated=succeeded,
        items_failed=failed,
        message=f"Fila Estante Virtual processada: {succeeded} concluído(s) e eliminado(s) da fila, {failed} com falha.",
    ))
    db.commit()

    return {
        "processed": processed,
        "succeeded": succeeded,
        "failed": failed,
        "drained": drained,
        "message": f"Fila processada: {succeeded} item(ns) sincronizado(s) e limpo(s) da fila ({failed} falha(s)).",
    }


# ─── Schemas Pydantic ────────────────────────────────────────────────────────

class EvSettingsUpdatePayload(BaseModel):
    ev_enabled: Optional[bool] = None
    ev_environment: Optional[str] = None
    ev_seller_id: Optional[str] = None
    ev_email: Optional[str] = None
    ev_password: Optional[str] = None
    ev_webhook_secret: Optional[str] = None
    ev_preset_config: Optional[Dict[str, Any]] = None


class EvPublishItemCandidate(BaseModel):
    product_id: Optional[int] = None
    sku: str
    isbn: str
    horus_cod_item: Optional[int] = None
    title: str
    author: Optional[str] = None
    publisher: Optional[str] = None
    subject: Optional[str] = None
    local_category_id: Optional[int] = None
    ev_category_id: Optional[int] = None
    condition: Optional[str] = None  # NOVO | USADO
    base_price: float
    ev_price: Optional[float] = None
    stock: int
    weight_grams: Optional[int] = 300
    release_year: Optional[int] = 2024
    language: Optional[str] = "Pt"
    handling_days: Optional[int] = 2
    thumbnail: Optional[str] = None
    description: Optional[str] = None


class EvPublishBatchPayload(BaseModel):
    items: List[EvPublishItemCandidate]
    process_immediately: Optional[bool] = True


class EvListingUpdatePayload(BaseModel):
    base_price: Optional[float] = None
    ev_price: Optional[float] = None
    current_stock: Optional[int] = None
    status: Optional[str] = None
    ev_category_id: Optional[int] = None
    handling_days: Optional[int] = None


class EvOrderStatusUpdatePayload(BaseModel):
    status_codigo: str  # STANDBY | SENT | CANCELED
    rastreio: Optional[str] = None       # Código Correios (mutuamente exclusivo com url_rastreio)
    url_rastreio: Optional[str] = None   # URL Transportadora (mutuamente exclusivo com rastreio)
    razao_cancelamento: Optional[str] = None  # sem_estoque | erro_processamento | cliente_devolveu


# ─── 1. Rotas de Pré-Configurações, Categorias e Autenticação (Etapa 1) ──────

@router.get("/settings")
def get_ev_settings(
    request: Request,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    settings = _get_or_create_settings(db, cid)
    preset = get_merged_ev_preset(settings)

    local_cats = (
        db.query(Category)
        .filter(Category.company_id == cid)
        .order_by(Category.name.asc())
        .all()
    )
    base_host = str(request.base_url).rstrip("/")
    webhook_url = f"{base_host}/estantevirtual/webhook/pedido"

    queue_pending = db.query(MarketplaceSyncQueue).filter(
        MarketplaceSyncQueue.company_id == cid,
        MarketplaceSyncQueue.channel == "estantevirtual",
        MarketplaceSyncQueue.status.in_(["PENDING", "RETRY"]),
    ).count()

    return {
        "company_id": cid,
        "ev_enabled": bool(settings.ev_enabled),
        "ev_environment": settings.ev_environment or "PRODUCAO",
        "ev_seller_id": settings.ev_seller_id or "",
        "ev_email": settings.ev_email or "",
        "password_configured": bool((settings.ev_password or "").strip()),
        "has_auth_token": bool((settings.ev_auth_token or "").strip()),
        "ev_token_expires_at": settings.ev_token_expires_at.isoformat() if settings.ev_token_expires_at else None,
        "ev_webhook_secret": settings.ev_webhook_secret or "",
        "webhook_url": webhook_url,
        "ev_preset_config": preset,
        "ev_official_categories": EV_OFFICIAL_CATEGORIES,
        "ev_accepted_languages": EV_ACCEPTED_LANGUAGES,
        "local_categories": [{"id": c.id, "name": c.name} for c in local_cats],
        "horus_context": {
            "horus_enabled": bool(settings.horus_enabled),
            "horus_company": settings.horus_company or "01",
            "horus_branch": settings.horus_branch or "001",
            "horus_stock_local": settings.horus_stock_local or "001",
            "horus_legacy_pagination": bool(getattr(settings, "horus_legacy_pagination", False)),
        },
        "queue_pending_count": queue_pending,
    }


@router.put("/settings")
def update_ev_settings(
    payload: EvSettingsUpdatePayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    settings = _get_or_create_settings(db, cid)

    if payload.ev_enabled is not None:
        settings.ev_enabled = payload.ev_enabled
    if payload.ev_environment is not None:
        settings.ev_environment = payload.ev_environment.strip().upper()
    if payload.ev_seller_id is not None:
        settings.ev_seller_id = re.sub(r"\D", "", payload.ev_seller_id.strip())
    if payload.ev_email is not None:
        settings.ev_email = payload.ev_email.strip()
    if payload.ev_password is not None and payload.ev_password.strip() and not payload.ev_password.startswith("••"):
        settings.ev_password = payload.ev_password.strip()
    if payload.ev_webhook_secret is not None:
        settings.ev_webhook_secret = payload.ev_webhook_secret.strip()

    if payload.ev_preset_config is not None:
        current = get_merged_ev_preset(settings)
        updated = {**current, **payload.ev_preset_config}
        # Garante categoria oficial válida
        cat_id = int(updated.get("default_category_id") or 65)
        updated["default_category_id"] = cat_id if cat_id in EV_CATEGORY_MAP_BY_ID else 65
        updated["default_category_name"] = EV_CATEGORY_MAP_BY_ID[updated["default_category_id"]]
        updated["min_price_floor"] = max(6.0, float(updated.get("min_price_floor") or 6.0))
        settings.ev_preset_config = updated
        flag_modified(settings, "ev_preset_config")

    db.commit()
    return {"message": "Configurações da Estante Virtual salvas com sucesso!"}


@router.post("/test-connection")
async def test_ev_connection(
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    settings = _get_or_create_settings(db, cid)
    if not (settings.ev_seller_id or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Informe o 'id_vendedor' fornecido pela Estante Virtual antes de testar a conexão."
        )
    token = await ensure_valid_ev_token(db, settings, force_login=True)
    return {
        "status": "CONNECTED",
        "ev_seller_id": settings.ev_seller_id,
        "ev_email": settings.ev_email,
        "ev_environment": settings.ev_environment or "PRODUCAO",
        "token_preview": f"{token[:16]}...{token[-8:]}" if len(token) > 28 else "JWT Ativo",
        "expires_at": settings.ev_token_expires_at.isoformat() if settings.ev_token_expires_at else None,
        "message": f"Autenticação JWT (24h) homologada com sucesso na Estante Virtual (Vendedor #{settings.ev_seller_id})!",
    }


@router.get("/categories")
def list_ev_categories():
    return {"items": EV_OFFICIAL_CATEGORIES, "languages": EV_ACCEPTED_LANGUAGES}


# ─── 2. Candidatos do Catálogo / Horus ERP & Envio para Fila (Etapa 2) ───────

@router.get("/catalog-candidates")
async def list_ev_catalog_candidates(
    search: Optional[str] = Query(None),
    source: str = Query("AUTO"),  # AUTO | LOCAL | HORUS
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    """
    Lista livros do Catálogo Local (prd_product) ou diretamente do Horus ERP (respeitando SD_* e OFFSET/LIMIT),
    seguindo a Regra de Origem Dual (Seção 15 do AGENTS.md):
    - Se o Seller usa Horus ERP (module_horus_erp / horus_enabled), busca direto do Horus ERP;
    - Se o Seller usa somente o Cronuz Nativo, busca direto da tabela prd_product.
    """
    cid = _resolve_company_id(current_user, company_id)
    company = db.query(Company).filter(Company.id == cid).first()
    settings = _get_or_create_settings(db, cid)
    preset = get_merged_ev_preset(settings)

    uses_horus = bool((getattr(company, "module_horus_erp", False) if company else False) or settings.horus_enabled)
    effective_source = (
        source.upper()
        if source and source.upper() in ("LOCAL", "HORUS")
        else ("HORUS" if uses_horus and not getattr(company, "module_products", True) else ("HORUS" if uses_horus else "LOCAL"))
    )

    existing_listings = db.query(EvListing).filter(EvListing.company_id == cid).all()
    by_sku = {str(x.sku).strip(): x for x in existing_listings if x.sku}
    by_isbn = {re.sub(r"\D", "", str(x.isbn)): x for x in existing_listings if x.isbn}

    queued_rows = db.query(MarketplaceSyncQueue).filter(
        MarketplaceSyncQueue.company_id == cid,
        MarketplaceSyncQueue.channel == "estantevirtual",
        MarketplaceSyncQueue.status.in_(["PENDING", "RETRY", "PROCESSING"]),
    ).all()
    queued_skus = {str(q.sku).strip(): q.operation for q in queued_rows}

    candidates: List[Dict[str, Any]] = []

    if effective_source == "HORUS" and settings.horus_enabled:
        from app.integrators.horus_products import HorusProducts
        id_doc = re.sub(r"\D", "", str(company.document or "")) if company else ""
        id_guid = (settings.horus_default_b2b_guid or "").strip()
        horus_client = HorusProducts(db, cid)
        try:
            term = (search or "").strip() or None
            raw_items = await horus_client.busca_acervo_b2b(
                id_doc=id_doc,
                id_guid=id_guid,
                term=term,
                offset=offset,
                limit=limit,
            )

            if isinstance(raw_items, list):
                for row in raw_items:
                    if not isinstance(row, dict) or row.get("Falha") or row.get("FALHA") == "S":
                        continue
                    isbn_raw = str(row.get("BARRAS_ISBN") or row.get("COD_BARRA_ITEM") or "").strip()
                    isbn_digits = re.sub(r"\D", "", isbn_raw)
                    cod_item = row.get("COD_ITEM")
                    sku_val = str(cod_item or isbn_digits or "").strip()
                    if not sku_val:
                        continue

                    raw_price = float(str(row.get("VLR_CAPA") or row.get("PRECO_CAPA") or row.get("VLR_LIQ_CLI") or row.get("PRECO") or 0).replace(",", "."))
                    raw_stock = int(float(str(row.get("SALDO_DISPONIVEL") or 0).replace(",", ".")))
                    prices = calculate_ev_prices(raw_price, preset)
                    eff_stock = calculate_ev_effective_stock(raw_stock, preset)

                    genre_str = str(row.get("DESC_GENERO") or row.get("GENERO") or "").strip()
                    ev_cat = resolve_ev_category(genre_str, None, preset)

                    cover_url = None
                    if settings.cover_image_base_url and isbn_digits:
                        cover_url = f"{settings.cover_image_base_url.rstrip('/')}/{isbn_digits}.jpg"

                    linked = by_sku.get(sku_val) or (by_isbn.get(isbn_digits) if isbn_digits else None)
                    candidates.append({
                        "source": "HORUS",
                        "product_id": None,
                        "horus_cod_item": int(cod_item) if str(cod_item or "").isdigit() else None,
                        "sku": sku_val,
                        "isbn": isbn_digits,
                        "isbn_valid": len(isbn_digits) in (10, 13),
                        "title": sanitize_ev_text(row.get("NOM_ITEM") or row.get("DESC_ITEM") or "Livro Sem Título", max_len=130),
                        "author": sanitize_ev_text(row.get("NOM_AUTOR") or row.get("AUTOR") or preset.get("default_author_fallback") or "Vários Autores", max_len=100),
                        "publisher": sanitize_ev_text(row.get("NOM_EDITORA") or row.get("EDITORA") or preset.get("default_publisher_fallback") or "Editora", max_len=100),
                        "subject": genre_str,
                        "ev_category_id": linked.ev_category_id if linked else ev_cat["id"],
                        "ev_category_name": linked.ev_category_name if linked else ev_cat["name"],
                        "condition": linked.condition if linked else (preset.get("default_condition") or "NOVO"),
                        "base_price": prices["valor_de"],
                        "ev_price": linked.ev_price if linked else prices["valor_por"],
                        "raw_stock": raw_stock,
                        "effective_stock": eff_stock,
                        "weight_grams": int(float(str(row.get("PESO_ITEM") or preset.get("default_weight_grams") or 300).replace(",", "."))) or 300,
                        "release_year": int(preset.get("default_release_year") or 2024),
                        "language": normalize_ev_language(row.get("IDIOMA"), preset.get("default_language") or "Pt"),
                        "handling_days": int(preset.get("default_handling_days") or 2),
                        "thumbnail": cover_url,
                        "description": sanitize_ev_text(row.get("SINOPSE") or row.get("INFO_COMP_ITEM") or "", max_len=2000),
                        "already_published": bool(linked and linked.is_published_on_ev),
                        "ev_listing_id": linked.id if linked else None,
                        "ev_status": linked.status if linked else None,
                        "queue_operation": queued_skus.get(sku_val),
                    })
        except Exception as e:
            logger.warning("[EV_CANDIDATES] Fallback para catálogo local após erro no Horus: %s", e)
        finally:
            await horus_client.close()

    if not candidates:
        q = db.query(Product).filter(Product.company_id == cid)
        if search and search.strip():
            s = f"%{search.strip()}%"
            q = q.filter(or_(Product.name.ilike(s), Product.sku.ilike(s), Product.ean_gtin.ilike(s)))
        prods = q.order_by(Product.id.desc()).offset(offset).limit(limit).all()

        cat_lookup = {c.id: c.name for c in db.query(Category).filter(Category.company_id == cid).all()}
        brand_lookup = {b.id: b.name for b in db.query(Brand).filter(Brand.company_id == cid).all()}

        for p in prods:
            isbn_digits = re.sub(r"\D", "", str(p.ean_gtin or p.sku or ""))
            sku_val = str(p.sku or isbn_digits or p.id).strip()
            raw_price = float(p.promotional_price or p.base_price or 0.0)
            raw_stock = int(p.stock_quantity or 0)
            prices = calculate_ev_prices(raw_price, preset)
            eff_stock = calculate_ev_effective_stock(raw_stock, preset)

            cat_name = cat_lookup.get(p.category_id, "")
            ev_cat = resolve_ev_category(cat_name, p.category_id, preset)
            linked = by_sku.get(sku_val) or (by_isbn.get(isbn_digits) if isbn_digits else None)

            candidates.append({
                "source": "LOCAL",
                "product_id": p.id,
                "horus_cod_item": None,
                "sku": sku_val,
                "isbn": isbn_digits,
                "isbn_valid": len(isbn_digits) in (10, 13),
                "title": sanitize_ev_text(p.name, max_len=130),
                "author": sanitize_ev_text(preset.get("default_author_fallback") or "Vários Autores", max_len=100),
                "publisher": sanitize_ev_text(brand_lookup.get(p.brand_id) or preset.get("default_publisher_fallback") or "Editora", max_len=100),
                "subject": cat_name,
                "ev_category_id": linked.ev_category_id if linked else ev_cat["id"],
                "ev_category_name": linked.ev_category_name if linked else ev_cat["name"],
                "condition": linked.condition if linked else (preset.get("default_condition") or "NOVO"),
                "base_price": round(float(p.base_price or prices["valor_de"]), 2),
                "ev_price": linked.ev_price if linked else prices["valor_por"],
                "raw_stock": raw_stock,
                "effective_stock": eff_stock,
                "weight_grams": int(float(p.weight_kg or 0.3) * 1000) if getattr(p, "weight_kg", None) else int(preset.get("default_weight_grams") or 300),
                "release_year": int(preset.get("default_release_year") or 2024),
                "language": preset.get("default_language") or "Pt",
                "handling_days": int(preset.get("default_handling_days") or 2),
                "thumbnail": getattr(p, "cover_url", None) or getattr(p, "image_url", None),
                "description": sanitize_ev_text(p.description or p.short_description or "", max_len=2000),
                "already_published": bool(linked and linked.is_published_on_ev),
                "ev_listing_id": linked.id if linked else None,
                "ev_status": linked.status if linked else None,
                "queue_operation": queued_skus.get(sku_val),
            })

    return {"items": candidates, "total": len(candidates)}


@router.post("/listings/publish")
async def enqueue_and_publish_ev_listings(
    payload: EvPublishBatchPayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    """
    Salva/atualiza o estado vivo em ev_listings e enfileira os itens em mkt_sync_queue.
    Se process_immediately=True, já drena o lote imediatamente e elimina os concluídos da fila.
    """
    cid = _resolve_company_id(current_user, company_id)
    settings = _get_or_create_settings(db, cid)
    preset = get_merged_ev_preset(settings)

    if not payload.items:
        raise HTTPException(status_code=400, detail="Selecione ao menos 1 livro para enviar à fila de publicação da Estante Virtual.")

    enqueued_count = 0
    skipped_invalid_isbn = 0

    for item in payload.items:
        isbn_clean = re.sub(r"\D", "", str(item.isbn or ""))
        if len(isbn_clean) not in (10, 13):
            skipped_invalid_isbn += 1
            continue

        sku_clean = str(item.sku or isbn_clean).strip()
        cat_info = (
            {"id": item.ev_category_id, "name": EV_CATEGORY_MAP_BY_ID.get(item.ev_category_id, "Outros Assuntos")}
            if item.ev_category_id and item.ev_category_id in EV_CATEGORY_MAP_BY_ID
            else resolve_ev_category(item.subject, item.local_category_id, preset)
        )

        prices = calculate_ev_prices(item.base_price, preset)
        v_por = round(max(6.0, float(item.ev_price if item.ev_price is not None else prices["valor_por"])), 2)
        v_de = round(max(v_por, float(item.base_price or prices["valor_de"])), 2)
        stock_val = max(0, int(item.stock or 0))

        lst = db.query(EvListing).filter(EvListing.company_id == cid, EvListing.sku == sku_clean).first()
        if not lst:
            cond_val = "USADO" if str(item.condition or preset.get("default_condition") or "NOVO").upper() == "USADO" else "NOVO"
            lst = EvListing(
                company_id=cid,
                product_id=item.product_id,
                sku=sku_clean,
                isbn=isbn_clean,
                horus_cod_item=item.horus_cod_item,
                title=sanitize_ev_text(item.title, max_len=130) or f"Livro {isbn_clean}",
                author=sanitize_ev_text(item.author or preset.get("default_author_fallback") or "Vários Autores", max_len=100),
                publisher=sanitize_ev_text(item.publisher or preset.get("default_publisher_fallback") or "Editora", max_len=100),
                ev_category_id=cat_info["id"],
                ev_category_name=cat_info["name"],
                condition=cond_val,  # Travado após criação conforme regra da EV
                status="queued",
                is_published_on_ev=False,
                base_price=v_de,
                ev_price=v_por,
                current_stock=stock_val,
                handling_days=min(20, max(1, int(item.handling_days or preset.get("default_handling_days") or 2))),
                weight_grams=max(50, int(item.weight_grams or preset.get("default_weight_grams") or 300)),
                release_year=int(item.release_year or preset.get("default_release_year") or 2024),
                language=normalize_ev_language(item.language, preset.get("default_language") or "Pt"),
                thumbnail=item.thumbnail,
                attributes_json={"description": item.description or ""},
            )
            db.add(lst)
            db.flush()
            op_type = "PUBLISH_PRODUCT"
        else:
            # Regra EV: NUNCA alterar lst.condition (NOVO/USADO) se já criado!
            lst.title = sanitize_ev_text(item.title, max_len=130) or lst.title
            lst.author = sanitize_ev_text(item.author or lst.author, max_len=100)
            lst.publisher = sanitize_ev_text(item.publisher or lst.publisher, max_len=100)
            lst.ev_category_id = cat_info["id"]
            lst.ev_category_name = cat_info["name"]
            lst.base_price = v_de
            lst.ev_price = v_por
            lst.current_stock = stock_val
            lst.status = "queued"
            op_type = "UPDATE_PRODUCT" if lst.is_published_on_ev else "PUBLISH_PRODUCT"

        enqueue_marketplace_task(
            db=db,
            company_id=cid,
            channel="estantevirtual",
            operation=op_type,
            sku=sku_clean,
            isbn_ean=isbn_clean,
            title=lst.title,
            listing_id=lst.id,
            product_id=lst.product_id,
            priority=30,
            payload={"sku": sku_clean, "isbn": isbn_clean, "valor_de": v_de, "valor_por": v_por, "estoque": stock_val},
        )
        enqueued_count += 1

    db.commit()

    drain_result = None
    if payload.process_immediately and enqueued_count > 0 and (settings.ev_seller_id or "").strip() and (settings.ev_email or "").strip():
        try:
            drain_result = await drain_ev_sync_queue(db, cid, max_items=min(30, enqueued_count))
        except HTTPException as he:
            return {
                "enqueued": enqueued_count,
                "skipped_invalid_isbn": skipped_invalid_isbn,
                "drain_warning": he.detail,
                "message": f"{enqueued_count} livro(s) adicionado(s) à Fila de Processamento! Configure/valide o login da Estante Virtual na Etapa 1 para disparar o envio.",
            }

    return {
        "enqueued": enqueued_count,
        "skipped_invalid_isbn": skipped_invalid_isbn,
        "drain_result": drain_result,
        "message": (
            drain_result["message"]
            if drain_result
            else f"{enqueued_count} livro(s) enfileirado(s) com sucesso na Fila de Processamento!"
        ),
    }


# ─── 3. Gestão de Anúncios, Fila Assíncrona, Lote Estoque/Preços (Etapa 3) ───

@router.get("/listings")
def list_ev_listings(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    q = db.query(EvListing).filter(EvListing.company_id == cid)

    all_rows = q.all()
    kpis = {
        "total": len(all_rows),
        "active": sum(1 for r in all_rows if r.status == "active" and (r.current_stock or 0) > 0),
        "paused": sum(1 for r in all_rows if r.status in ("paused", "queued")),
        "zero_stock": sum(1 for r in all_rows if (r.current_stock or 0) <= 0),
        "error": sum(1 for r in all_rows if r.status == "error" or r.sync_error),
    }

    if search and search.strip():
        s = f"%{search.strip()}%"
        q = q.filter(or_(EvListing.title.ilike(s), EvListing.sku.ilike(s), EvListing.isbn.ilike(s), EvListing.author.ilike(s)))
    if status and status.upper() != "ALL":
        if status == "zero_stock":
            q = q.filter(EvListing.current_stock <= 0)
        else:
            q = q.filter(EvListing.status == status)

    rows = q.order_by(EvListing.updated_at.desc().nullslast(), EvListing.id.desc()).limit(300).all()

    queue_rows = (
        db.query(MarketplaceSyncQueue)
        .filter(
            MarketplaceSyncQueue.company_id == cid,
            MarketplaceSyncQueue.channel == "estantevirtual",
        )
        .order_by(MarketplaceSyncQueue.priority.asc(), MarketplaceSyncQueue.id.asc())
        .limit(100)
        .all()
    )

    return {
        "kpis": kpis,
        "queue_count": len(queue_rows),
        "queue_items": [
            {
                "id": qr.id,
                "sku": qr.sku,
                "isbn_ean": qr.isbn_ean,
                "title": qr.title,
                "operation": qr.operation,
                "priority": qr.priority,
                "status": qr.status,
                "attempts": qr.attempts,
                "error_message": qr.error_message,
                "created_at": qr.created_at.isoformat() if qr.created_at else None,
            }
            for qr in queue_rows
        ],
        "items": [
            {
                "id": r.id,
                "product_id": r.product_id,
                "sku": r.sku,
                "isbn": r.isbn,
                "horus_cod_item": r.horus_cod_item,
                "title": r.title,
                "author": r.author,
                "publisher": r.publisher,
                "ev_category_id": r.ev_category_id,
                "ev_category_name": r.ev_category_name,
                "condition": r.condition,
                "status": r.status,
                "is_published_on_ev": r.is_published_on_ev,
                "base_price": r.base_price,
                "ev_price": r.ev_price,
                "current_stock": r.current_stock,
                "last_synced_stock": r.last_synced_stock,
                "last_synced_price": r.last_synced_price,
                "handling_days": r.handling_days,
                "weight_grams": r.weight_grams,
                "release_year": r.release_year,
                "language": r.language,
                "thumbnail": r.thumbnail,
                "sync_error": r.sync_error,
                "last_synced_at": r.last_synced_at.isoformat() if r.last_synced_at else None,
            }
            for r in rows
        ],
    }


@router.put("/listings/{listing_id}")
async def update_ev_listing_quick(
    listing_id: int,
    payload: EvListingUpdatePayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    """
    Atualiza preço (valor_de / valor_por), estoque ou categoria de um anúncio na Estante Virtual,
    enfileira SYNC_PRICE e/ou SYNC_STOCK em mkt_sync_queue e já drena para a API da EV se conectada.
    """
    cid = _resolve_company_id(current_user, company_id)
    settings = _get_or_create_settings(db, cid)
    lst = db.query(EvListing).filter(EvListing.id == listing_id, EvListing.company_id == cid).first()
    if not lst:
        raise HTTPException(status_code=404, detail="Anúncio da Estante Virtual não encontrado.")

    price_changed = False
    stock_changed = False

    if payload.ev_price is not None:
        if payload.ev_price < 6.0:
            raise HTTPException(status_code=400, detail="O preço na Estante Virtual não pode ser inferior a R$ 6,00 (regra oficial da plataforma).")
        lst.ev_price = round(float(payload.ev_price), 2)
        price_changed = True

    if payload.base_price is not None:
        lst.base_price = round(max(lst.ev_price, float(payload.base_price)), 2)
        price_changed = True

    if payload.current_stock is not None:
        lst.current_stock = max(0, int(payload.current_stock))
        stock_changed = True

    if payload.status is not None:
        lst.status = payload.status
        if payload.status == "paused":
            lst.current_stock = 0
            stock_changed = True

    if payload.ev_category_id is not None and payload.ev_category_id in EV_CATEGORY_MAP_BY_ID:
        lst.ev_category_id = payload.ev_category_id
        lst.ev_category_name = EV_CATEGORY_MAP_BY_ID[payload.ev_category_id]

    if payload.handling_days is not None:
        lst.handling_days = min(20, max(1, int(payload.handling_days)))

    if price_changed:
        enqueue_marketplace_task(
            db=db,
            company_id=cid,
            channel="estantevirtual",
            operation="SYNC_PRICE",
            sku=lst.sku,
            isbn_ean=lst.isbn,
            title=lst.title,
            listing_id=lst.id,
            priority=20,
            payload={"valor_de": lst.base_price, "valor_por": lst.ev_price},
        )

    if stock_changed:
        enqueue_marketplace_task(
            db=db,
            company_id=cid,
            channel="estantevirtual",
            operation="SYNC_STOCK",
            sku=lst.sku,
            isbn_ean=lst.isbn,
            title=lst.title,
            listing_id=lst.id,
            priority=10,
            payload={"estoque": lst.current_stock},
        )

    db.commit()

    if (settings.ev_seller_id or "").strip() and (settings.ev_email or "").strip():
        try:
            await drain_ev_sync_queue(db, cid, max_items=10)
        except Exception as e:
            logger.warning("[EV_QUICK_EDIT] Alteração mantida na fila mkt_sync_queue para reenvio: %s", e)

    return {"message": "Anúncio atualizado e sincronizado com a fila da Estante Virtual!"}


@router.delete("/listings/{listing_id}")
async def remove_ev_listing(
    listing_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    """
    Conforme README.md da Estante Virtual ("Caso deseje excluir um produto da nossa base"):
    Envia estoque = 0 para PUT /estoques antes de remover/pausar o anúncio local.
    """
    cid = _resolve_company_id(current_user, company_id)
    settings = _get_or_create_settings(db, cid)
    lst = db.query(EvListing).filter(EvListing.id == listing_id, EvListing.company_id == cid).first()
    if not lst:
        raise HTTPException(status_code=404, detail="Anúncio não encontrado.")

    sku_removed = lst.sku
    if lst.is_published_on_ev and (settings.ev_seller_id or "").strip() and (settings.ev_email or "").strip():
        try:
            token = await ensure_valid_ev_token(db, settings)
            base_url = get_ev_base_url(settings)
            seller_int = int(re.sub(r"\D", "", settings.ev_seller_id))
            async with httpx.AsyncClient(timeout=15.0) as client:
                await client.put(
                    f"{base_url}/estoques",
                    json={"estoques": [{"codigo": sku_removed, "estoque": 0, "id_vendedor": seller_int}]},
                    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                )
        except Exception as e:
            logger.warning("[EV_DELETE] Falha ao zerar estoque na EV antes de excluir: %s", e)

    db.query(MarketplaceSyncQueue).filter(
        MarketplaceSyncQueue.company_id == cid,
        MarketplaceSyncQueue.channel == "estantevirtual",
        MarketplaceSyncQueue.sku == sku_removed,
    ).delete()
    db.delete(lst)
    db.commit()
    return {"message": f"Livro {sku_removed} zerado na Estante Virtual e removido da listagem."}


@router.post("/queue/process")
async def process_ev_queue_endpoint(
    max_items: int = Query(50, ge=1, le=200),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    return await drain_ev_sync_queue(db, cid, max_items=max_items)


@router.delete("/queue/{queue_id}")
def delete_ev_queue_item(
    queue_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    item = db.query(MarketplaceSyncQueue).filter(
        MarketplaceSyncQueue.id == queue_id,
        MarketplaceSyncQueue.company_id == cid,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada na fila.")
    db.delete(item)
    db.commit()
    return {"message": "Item removido da fila de processamento."}


@router.post("/sync/stock")
async def trigger_ev_stock_and_price_delta_sync(
    force_all: bool = Query(False),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    return await execute_ev_company_delta_sync(db, cid, force_all=force_all)


async def execute_ev_company_delta_sync(db: Session, company_id: int, force_all: bool = False) -> Dict[str, Any]:
    """
    Motor Unificado de Sincronização Delta de Estoque e Preço (Seção 15 do AGENTS.md):
    Suporta transparentemente os 2 perfis de Seller:
    1. Perfil HORUS_ERP (module_horus_erp / horus_enabled):
       - Coleta as últimas movimentações no Horus na janela DATA_INI -> DATA_FIM (horário de Brasília)
         via endpoint 'Estoque' e/ou em lote de 50 ISBNs via 'Busca_AcervoB2B' (respeitando SD_* e OFFSET/LIMIT);
       - Alimenta mkt_sync_queue e dispara em lote PUT /estoques e PUT /precos na Estante Virtual.
    2. Perfil CRONUZ_LOCAL (somente prd_product):
       - Coleta em uma única query da tabela prd_product do Cronuz e sincroniza as diferenças com a Estante Virtual.
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    settings = _get_or_create_settings(db, company_id)
    preset = get_merged_ev_preset(settings)
    listings = db.query(EvListing).filter(EvListing.company_id == company_id).all()
    if not listings:
        return {"message": "Nenhum anúncio cadastrado na Estante Virtual para sincronizar.", "enqueued": 0}

    uses_horus = bool((getattr(company, "module_horus_erp", False) if company else False) or settings.horus_enabled)
    brt_tz = timezone(timedelta(hours=-3))
    now_utc = datetime.now(timezone.utc)
    now_brt = now_utc.astimezone(brt_tz)

    horus_stock_by_cod: Dict[int, int] = {}
    horus_stock_by_isbn: Dict[str, int] = {}
    horus_price_by_isbn: Dict[str, float] = {}

    if uses_horus and settings.horus_enabled:
        from app.integrators.horus_products import HorusProducts
        id_doc = re.sub(r"\D", "", str(company.document or "")) if company else ""
        id_guid = (settings.horus_default_b2b_guid or "").strip()
        use_pagination = not getattr(settings, "horus_legacy_pagination", False)
        horus_client = HorusProducts(db, company_id)

        try:
            # Etapa A: Coleta incremental das últimas movimentações de estoque no Horus (DATA_INI -> DATA_FIM)
            last_sync_iso = str(preset.get("last_horus_movement_sync_at") or "").strip()
            dt_ini_br = now_brt - timedelta(hours=24)
            if last_sync_iso and not force_all:
                try:
                    parsed_dt = datetime.fromisoformat(last_sync_iso.replace("Z", "+00:00"))
                    if parsed_dt.tzinfo is None:
                        parsed_dt = parsed_dt.replace(tzinfo=timezone.utc)
                    dt_ini_br = (parsed_dt - timedelta(minutes=10)).astimezone(brt_tz)
                except Exception:
                    pass

            data_ini_str = dt_ini_br.strftime("%d/%m/%Y %H:%M:%S")
            data_fim_str = now_brt.strftime("%d/%m/%Y %H:%M:%S")

            offset = 0
            limit = 500
            max_pages = 10 if use_pagination else 1
            for _ in range(max_pages):
                p_est: Dict[str, Any] = {
                    "COD_EMPRESA": settings.horus_company or "01",
                    "COD_FILIAL": settings.horus_branch or "001",
                    "DATA_INI": data_ini_str,
                    "DATA_FIM": data_fim_str,
                }
                if getattr(settings, "horus_stock_local", None):
                    p_est["COD_LOCAL_ESTOQUE"] = settings.horus_stock_local
                if use_pagination:
                    p_est["OFFSET"] = offset
                    p_est["LIMIT"] = limit

                res_est = await horus_client.get("Estoque", params=p_est)
                batch_est = (
                    [r for r in res_est if isinstance(r, dict) and not r.get("Falha") and r.get("COD_ITEM")]
                    if isinstance(res_est, list)
                    else ([res_est] if isinstance(res_est, dict) and not res_est.get("Falha") and res_est.get("COD_ITEM") else [])
                )
                if not batch_est:
                    break
                for row in batch_est:
                    try:
                        ci = int(str(row.get("COD_ITEM")).strip())
                        raw_s = row.get("SALDO_DISPONIVEL") if row.get("SALDO_DISPONIVEL") is not None else (row.get("SALDO") or 0)
                        horus_stock_by_cod[ci] = max(0, int(float(str(raw_s).replace(",", "."))))
                    except Exception:
                        pass
                if not use_pagination or len(batch_est) < limit:
                    break
                offset += limit

            # Etapa B: Consulta em lote de ISBNs via Busca_AcervoB2B (quando force_all=True ou itens sem COD_ITEM mapeado)
            isbn_list_to_query = []
            for lst in listings:
                clean_isbn = re.sub(r"\D", "", str(lst.isbn or ""))
                if clean_isbn and (force_all or not lst.horus_cod_item or lst.horus_cod_item not in horus_stock_by_cod):
                    isbn_list_to_query.append({"BARRAS_ISBN": clean_isbn})

            chunk_size = 50
            for idx in range(0, len(isbn_list_to_query), chunk_size):
                chunk = isbn_list_to_query[idx:idx + chunk_size]
                res_b2b = await horus_client.busca_acervo_b2b(
                    id_doc=id_doc,
                    id_guid=id_guid,
                    isbns=chunk,
                    limit=len(chunk),
                )
                if isinstance(res_b2b, list):
                    for item in res_b2b:
                        if not isinstance(item, dict) or item.get("Falha"):
                            continue
                        code_ret = re.sub(r"\D", "", str(item.get("BARRAS_ISBN") or item.get("COD_BARRA_ITEM") or ""))
                        raw_saldo = item.get("SALDO_DISPONIVEL") or 0
                        saldo_int = max(0, int(float(str(raw_saldo).replace(",", "."))))
                        if code_ret:
                            horus_stock_by_isbn[code_ret] = saldo_int
                        raw_capa = float(str(item.get("VLR_CAPA") or item.get("PRECO_CAPA") or item.get("PRECO") or 0).replace(",", "."))
                        if code_ret and raw_capa > 0:
                            horus_price_by_isbn[code_ret] = raw_capa
                        if item.get("COD_ITEM") and str(item.get("COD_ITEM")).isdigit():
                            horus_stock_by_cod[int(item["COD_ITEM"])] = saldo_int

            preset["last_horus_movement_sync_at"] = now_utc.isoformat()
            settings.ev_preset_config = preset
            flag_modified(settings, "ev_preset_config")
        except Exception as e:
            logger.warning("[EV_DELTA_HORUS] Erro ao coletar movimentações no Horus para empresa %s: %s", company_id, e)
        finally:
            await horus_client.close()

    # Mapa em memória da tabela prd_product para Sellers CRONUZ_LOCAL (ou híbridos)
    local_prod_by_id: Dict[int, Product] = {}
    local_prod_by_sku: Dict[str, Product] = {}
    local_prod_by_ean: Dict[str, Product] = {}
    if not uses_horus or any(l.product_id for l in listings):
        all_local_prods = db.query(Product).filter(Product.company_id == company_id).all()
        for p in all_local_prods:
            local_prod_by_id[p.id] = p
            if p.sku:
                local_prod_by_sku[p.sku.strip()] = p
            if p.ean_gtin:
                local_prod_by_ean[re.sub(r"\D", "", p.ean_gtin)] = p

    enqueued = 0
    for lst in listings:
        new_raw_stock = lst.current_stock
        new_raw_price = lst.base_price
        clean_isbn = re.sub(r"\D", "", str(lst.isbn or ""))

        if uses_horus and settings.horus_enabled:
            if lst.horus_cod_item and int(lst.horus_cod_item) in horus_stock_by_cod:
                new_raw_stock = horus_stock_by_cod[int(lst.horus_cod_item)]
            elif lst.sku and lst.sku.isdigit() and int(lst.sku) in horus_stock_by_cod:
                new_raw_stock = horus_stock_by_cod[int(lst.sku)]
            elif clean_isbn in horus_stock_by_isbn:
                new_raw_stock = horus_stock_by_isbn[clean_isbn]
            if clean_isbn in horus_price_by_isbn:
                new_raw_price = horus_price_by_isbn[clean_isbn]
        else:
            # Perfil CRONUZ_LOCAL: pega direto da tabela prd_product do Cronuz
            prod = (
                (local_prod_by_id.get(lst.product_id) if lst.product_id else None)
                or local_prod_by_sku.get(str(lst.sku).strip())
                or (local_prod_by_ean.get(clean_isbn) if clean_isbn else None)
            )
            if prod:
                new_raw_stock = int(prod.stock_quantity or 0)
                if float(prod.base_price or 0) > 0:
                    new_raw_price = float(prod.promotional_price or prod.base_price)

        eff_stock = calculate_ev_effective_stock(new_raw_stock, preset)
        prices = calculate_ev_prices(new_raw_price, preset)

        if force_all or lst.last_synced_stock != eff_stock:
            lst.current_stock = eff_stock
            enqueue_marketplace_task(
                db=db,
                company_id=company_id,
                channel="estantevirtual",
                operation="SYNC_STOCK",
                sku=lst.sku,
                isbn_ean=lst.isbn,
                title=lst.title,
                listing_id=lst.id,
                priority=10,
                payload={"estoque": eff_stock},
            )
            enqueued += 1

        if force_all or (lst.last_synced_price is not None and abs(float(lst.last_synced_price) - prices["valor_por"]) >= 0.01):
            lst.base_price = prices["valor_de"]
            lst.ev_price = prices["valor_por"]
            enqueue_marketplace_task(
                db=db,
                company_id=company_id,
                channel="estantevirtual",
                operation="SYNC_PRICE",
                sku=lst.sku,
                isbn_ean=lst.isbn,
                title=lst.title,
                listing_id=lst.id,
                priority=20,
                payload={"valor_de": prices["valor_de"], "valor_por": prices["valor_por"]},
            )
            enqueued += 1

    db.commit()

    source_label = "Horus ERP (Movimentações)" if uses_horus else "Catálogo Cronuz Local"
    if enqueued > 0 and (settings.ev_seller_id or "").strip() and (settings.ev_email or "").strip():
        drain_res = await drain_ev_sync_queue(db, company_id, max_items=200)
        return {
            "source": "HORUS" if uses_horus else "LOCAL",
            "enqueued": enqueued,
            "drain_result": drain_res,
            "message": f"Delta Sync Estante Virtual ({source_label}) concluído: {drain_res['succeeded']} atualização(ões) enviada(s) em lote e limpa(s) da fila!",
        }

    return {
        "source": "HORUS" if uses_horus else "LOCAL",
        "enqueued": enqueued,
        "message": f"Verificação Delta ({source_label}) concluída: {enqueued} item(ns) alterado(s) enfileirado(s).",
    }


# ─── 4. Webhooks de Pedidos (POST/PUT /pedido), Etiquetas MLE e Horus (Etapa 4)

def _resolve_company_by_ev_seller_id(db: Session, id_vendedor: Any, company_id_param: Optional[int] = None) -> int:
    if company_id_param:
        return company_id_param
    seller_clean = re.sub(r"\D", "", str(id_vendedor or ""))
    if seller_clean:
        st = db.query(CompanySettings).filter(CompanySettings.ev_seller_id == seller_clean).first()
        if st:
            return st.company_id
    st_any = db.query(CompanySettings).filter(CompanySettings.ev_enabled == True).first()
    if st_any:
        return st_any.company_id
    raise HTTPException(status_code=404, detail=f"Nenhum Seller encontrado para id_vendedor={id_vendedor}.")


@router.post("/webhook/pedido")
async def ev_webhook_create_order(
    request: Request,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Endpoint oficial chamado pela Estante Virtual a cada 10 minutos (POST /pedido EV -> Vendedor).
    Regras implementadas conforme README.md:
    - Idempotência: ignora POST repetido de um pedido já recebido;
    - Salva dados_nota_fiscal (cnpj_instituicao_financeira, codigo_autorizacao, bandeira, e2e_id_pix);
    - Cria Cliente, Endereço e Pedido em ord_order (origin='ev');
    - Abate estoque local imediatamente e enfileira SYNC_STOCK prioritário para os demais canais;
    - Retorna {"success": 201, "id_pedido": <id>}.
    """
    raw_body = await request.json()
    id_vendedor = raw_body.get("id_vendedor")
    cid = _resolve_company_by_ev_seller_id(db, id_vendedor, company_id)

    pedidos_list = raw_body.get("pedidos") or []
    if not isinstance(pedidos_list, list) or len(pedidos_list) == 0:
        raise HTTPException(status_code=400, detail="Payload sem lista 'pedidos'.")

    last_internal_id = 0
    for ped in pedidos_list:
        if not isinstance(ped, dict):
            continue
        ev_order_id = str(ped.get("marketplace_id_pedido") or "").strip()
        if not ev_order_id:
            continue

        # Regra 1 da EV: Identificar e ignorar um POST repetido de um pedido já recebido
        existing = db.query(EvOrder).filter(
            EvOrder.company_id == cid,
            EvOrder.ev_order_id == ev_order_id,
        ).first()
        if existing:
            last_internal_id = existing.cronuz_order_id or existing.id
            continue

        cli = ped.get("cliente") or {}
        end = ped.get("endereco") or {}
        prods = ped.get("produtos") or []
        nf_data = ped.get("dados_nota_fiscal") or {}

        doc_clean = re.sub(r"\D", "", str(cli.get("cpf_cnpj") or ""))
        if not doc_clean:
            doc_clean = f"EV{cli.get('id_cliente') or ev_order_id}"[:20]
        doc_type = str(cli.get("tipo") or ("PJ" if len(doc_clean) == 14 else "PF")).upper()
        buyer_name = str(cli.get("razao_social") or end.get("nome_destinatario") or "CLIENTE ESTANTE VIRTUAL").strip()

        total_val = float(str(ped.get("valor_total_pedido") or 0).replace(",", "."))
        freight_val = float(str(ped.get("valor_total_frete") or 0).replace(",", "."))
        disc_val = float(str(ped.get("valor_total_desconto") or 0).replace(",", "."))
        status_cod = str(ped.get("status_codigo") or "PROCESSING").strip().upper()

        parsed_items = []
        for p_item in prods:
            if not isinstance(p_item, dict):
                continue
            qty = int(p_item.get("quantidade") or 1)
            u_val = float(str(p_item.get("valor") or 0).replace(",", "."))
            d_val = float(str(p_item.get("desconto") or 0).replace(",", "."))
            sku_code = str(p_item.get("codigo") or "").strip()
            linked_lst = db.query(EvListing).filter(EvListing.company_id == cid, EvListing.sku == sku_code).first()
            parsed_items.append({
                "sku": sku_code,
                "isbn": linked_lst.isbn if linked_lst else sku_code,
                "title": linked_lst.title if linked_lst else f"Livro EV #{sku_code}",
                "quantity": qty,
                "unit_price": u_val,
                "discount": d_val,
                "total_price": round((qty * u_val) - d_val, 2),
            })

        addr_dict = {
            "receiver_name": str(end.get("nome_destinatario") or buyer_name),
            "street": str(end.get("logradouro") or ""),
            "number": str(end.get("numero") or "S/N"),
            "complement": str(end.get("complemento") or ""),
            "neighborhood": str(end.get("bairro") or "CENTRO"),
            "city": str(end.get("cidade") or ""),
            "state": str(end.get("estado") or "")[:2].upper(),
            "zip_code": re.sub(r"\D", "", str(end.get("cep") or "")),
        }

        ev_ord = EvOrder(
            company_id=cid,
            ev_order_id=ev_order_id,
            ev_store_order_id=str(ped.get("marketplace_id_pedido_loja") or "") or None,
            payment_id=str(ped.get("id_pagamento") or "") or None,
            status_codigo=status_cod,
            shipping_method=str(ped.get("transportadora") or "normal"),
            buyer_id=str(ped.get("id_cliente") or ""),
            buyer_name=buyer_name,
            buyer_email=str(cli.get("email") or ""),
            buyer_doc_type=doc_type,
            buyer_doc_number=doc_clean,
            buyer_phone=str(cli.get("telefone1") or ""),
            total_amount=total_val,
            shipping_cost=freight_val,
            discount_amount=disc_val,
            payment_method=str(ped.get("forma_pagamento") or ""),
            installments=int(ped.get("parcelas") or 1),
            items_json=parsed_items,
            shipping_address_json=addr_dict,
            invoice_data_json=nf_data,
            raw_payload=ped,
            estimated_delivery_date=str(ped.get("data_estimada_entrega") or ""),
            ev_created_at=str(ped.get("marketplace_data_pedido") or ""),
        )
        db.add(ev_ord)
        db.flush()

        # Cria/vincula Customer e Order no Cronuz
        customer = db.query(Customer).filter(Customer.company_id == cid, Customer.document == doc_clean).first()
        if not customer:
            customer = Customer(
                company_id=cid,
                name=buyer_name[:255],
                corporate_name=buyer_name[:255],
                document=doc_clean,
                email=str(cli.get("email") or f"pedido.{ev_order_id}@estantevirtual.com.br"),
                phone=str(cli.get("telefone1") or "")[:30],
                customer_type="PJ" if doc_type == "PJ" else "PF",
                city=addr_dict["city"][:100] if addr_dict["city"] else None,
                state=addr_dict["state"][:2] if addr_dict["state"] else None,
            )
            db.add(customer)
            db.flush()
            if addr_dict["street"] and addr_dict["city"]:
                db.add(Address(
                    customer_id=customer.id,
                    street=addr_dict["street"][:255],
                    number=addr_dict["number"][:50] or "S/N",
                    complement=addr_dict["complement"][:100],
                    neighborhood=addr_dict["neighborhood"][:100] or "CENTRO",
                    city=addr_dict["city"][:100],
                    state=addr_dict["state"][:2] or "SP",
                    zip_code=addr_dict["zip_code"][:20] or "00000000",
                    type="MAIN",
                ))

        ext_ref = f"EV-{ev_order_id}"
        new_ord = Order(
            company_id=cid,
            customer_id=customer.id,
            status="PROCESSING" if status_cod in ("STANDBY", "PROCESSING") else "NEW",
            type_order="V",
            origin="ev",
            customer_order_ref=ev_order_id,
            external_id=ext_ref,
            partner_reference=ev_ord.ev_store_order_id or ev_order_id,
            subtotal=max(0.0, total_val - freight_val),
            discount=disc_val,
            total=total_val,
            payment_condition=str(ped.get("forma_pagamento") or "ESTANTE_VIRTUAL")[:50].upper(),
            confirmed_at=datetime.utcnow(),
        )
        db.add(new_ord)
        db.flush()

        for pi in parsed_items:
            linked_lst = db.query(EvListing).filter(EvListing.company_id == cid, EvListing.sku == pi["sku"]).first()
            prod_id = linked_lst.product_id if linked_lst else None
            db.add(OrderItem(
                order_id=new_ord.id,
                product_id=prod_id,
                ean_isbn=pi["isbn"],
                sku=pi["sku"],
                name=pi["title"][:255],
                quantity=pi["quantity"],
                quantity_requested=pi["quantity"],
                quantity_fulfilled=pi["quantity"],
                unit_price=pi["unit_price"],
                total_price=pi["total_price"],
            ))
            if linked_lst:
                linked_lst.current_stock = max(0, int(linked_lst.current_stock or 0) - int(pi["quantity"]))
            if prod_id:
                prod = db.query(Product).filter(Product.id == prod_id).first()
                if prod and prod.stock_quantity is not None:
                    prod.stock_quantity = max(0, int(prod.stock_quantity) - int(pi["quantity"]))

        ev_ord.cronuz_order_id = new_ord.id
        last_internal_id = new_ord.id

        db.add(EvSyncLog(
            company_id=cid,
            sync_type="ORDER_WEBHOOK",
            status="SUCCESS",
            items_processed=1,
            items_updated=1,
            items_failed=0,
            message=f"Novo pedido Estante Virtual #{ev_order_id} ({status_cod}) recebido via Webhook.",
        ))

    db.commit()
    return {"success": 201, "id_pedido": last_internal_id}


@router.put("/webhook/pedido")
async def ev_webhook_update_order(
    request: Request,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    """
    Endpoint oficial chamado pela Estante Virtual para atualizar status de pedido (PUT /pedido EV -> Vendedor).
    Regras implementadas conforme README.md:
    - Não aceita PUT de pedido que ainda não teve POST criado;
    - Ignora PUT repetido com o mesmo status;
    - Valida as transições de status permitidas na documentação da EV.
    """
    raw_body = await request.json()
    id_vendedor = raw_body.get("id_vendedor")
    cid = _resolve_company_by_ev_seller_id(db, id_vendedor, company_id)

    pedidos_list = raw_body.get("pedidos") or []
    if not isinstance(pedidos_list, list) or len(pedidos_list) == 0:
        raise HTTPException(status_code=400, detail="Payload sem lista 'pedidos'.")

    for ped in pedidos_list:
        ev_order_id = str(ped.get("marketplace_id_pedido") or "").strip()
        new_status = str(ped.get("status_codigo") or "").strip().upper()
        ev_ord = db.query(EvOrder).filter(
            EvOrder.company_id == cid,
            EvOrder.ev_order_id == ev_order_id,
        ).first()

        # Regra 2 da EV: Não aceitar um PUT de um pedido que não existe um POST criado
        if not ev_ord:
            return Response(
                content='{"error": 404, "message": "Pedido inexistente. Envie o POST de criacao primeiro."}',
                status_code=404,
                media_type="application/json",
            )

        current_status = (ev_ord.status_codigo or "").upper()
        # Regra 1 da EV: Ignorar PUT igual/repetido
        if current_status == new_status:
            continue

        # Regra 3 da EV: Validar transições permitidas
        if (current_status, new_status) not in EV_ALLOWED_STATUS_TRANSITIONS:
            return Response(
                content=f'{{"error": 400, "message": "Transicao de status invalida: {current_status} -> {new_status}."}}',
                status_code=400,
                media_type="application/json",
            )

        ev_ord.status_codigo = new_status
        if ped.get("data_estimada_entrega"):
            ev_ord.estimated_delivery_date = str(ped.get("data_estimada_entrega"))

        if ev_ord.cronuz_order_id:
            ord_obj = db.query(Order).filter(Order.id == ev_ord.cronuz_order_id).first()
            if ord_obj:
                if new_status == "CANCELED":
                    ord_obj.status = "CANCELED"
                elif new_status == "SENT":
                    ord_obj.status = "INVOICED"
                elif new_status == "STANDBY":
                    ord_obj.status = "PROCESSING"

    db.commit()
    return {"success": 200}


@router.get("/orders")
def list_ev_orders(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    q = db.query(EvOrder).filter(EvOrder.company_id == cid)

    if search and search.strip():
        s = f"%{search.strip()}%"
        q = q.filter(or_(
            EvOrder.ev_order_id.ilike(s),
            EvOrder.buyer_name.ilike(s),
            EvOrder.buyer_doc_number.ilike(s),
        ))
    if status and status.upper() != "ALL":
        q = q.filter(EvOrder.status_codigo == status.upper())

    rows = q.order_by(EvOrder.id.desc()).limit(200).all()
    return {
        "items": [
            {
                "id": r.id,
                "ev_order_id": r.ev_order_id,
                "ev_store_order_id": r.ev_store_order_id,
                "payment_id": r.payment_id,
                "status_codigo": r.status_codigo,
                "shipping_method": r.shipping_method,
                "tracking_code": r.tracking_code,
                "tracking_url": r.tracking_url,
                "cancel_reason": r.cancel_reason,
                "buyer_name": r.buyer_name,
                "buyer_email": r.buyer_email,
                "buyer_doc_type": r.buyer_doc_type,
                "buyer_doc_number": r.buyer_doc_number,
                "buyer_phone": r.buyer_phone,
                "total_amount": r.total_amount,
                "shipping_cost": r.shipping_cost,
                "discount_amount": r.discount_amount,
                "payment_method": r.payment_method,
                "installments": r.installments,
                "cronuz_order_id": r.cronuz_order_id,
                "horus_pedido_venda": r.horus_pedido_venda,
                "items_json": r.items_json or [],
                "shipping_address_json": r.shipping_address_json or {},
                "invoice_data_json": r.invoice_data_json or {},
                "sync_error": r.sync_error,
                "estimated_delivery_date": r.estimated_delivery_date,
                "ev_created_at": r.ev_created_at,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }


@router.put("/orders/{ev_order_db_id}/status")
async def update_ev_order_status_to_marketplace(
    ev_order_db_id: int,
    payload: EvOrderStatusUpdatePayload,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    """
    Envia atualização de pedido do Vendedor para a Estante Virtual (PUT /pedido).
    Regras estritas da documentação oficial (README.md):
    1. Para status SENT: é obrigatório preencher 'rastreio' (Correios) OU 'url_rastreio' (Transportadora),
       mas NUNCA os dois ao mesmo tempo (evita erro 500 Blank Code na EV!).
    2. Para status CANCELED: 'razao_cancelamento' deve ser um de ['sem_estoque', 'erro_processamento', 'cliente_devolveu'].
    """
    cid = _resolve_company_id(current_user, company_id)
    settings = _get_or_create_settings(db, cid)
    ev_ord = db.query(EvOrder).filter(EvOrder.id == ev_order_db_id, EvOrder.company_id == cid).first()
    if not ev_ord:
        raise HTTPException(status_code=404, detail="Pedido da Estante Virtual não encontrado.")

    target_status = payload.status_codigo.strip().upper()
    if target_status not in ("NEW", "STANDBY", "SENT", "CANCELED"):
        raise HTTPException(status_code=400, detail="Status inválido. Use STANDBY, SENT ou CANCELED.")

    rastreio_clean = (payload.rastreio or "").strip()
    url_clean = (payload.url_rastreio or "").strip()
    cancel_clean = (payload.razao_cancelamento or "").strip()

    if target_status == "SENT":
        if rastreio_clean and url_clean:
            raise HTTPException(
                status_code=400,
                detail="Regra da Estante Virtual: Não é permitido preencher Código Correios ('rastreio') e URL de Transportadora ('url_rastreio') ao mesmo tempo. Informe apenas um dos dois."
            )
        if not rastreio_clean and not url_clean:
            raise HTTPException(
                status_code=400,
                detail="Para marcar o pedido como SENT (Enviado), informe o código de rastreio dos Correios OU a URL de rastreio da transportadora."
            )

    if target_status == "CANCELED":
        if cancel_clean not in EV_VALID_CANCEL_REASONS:
            raise HTTPException(
                status_code=400,
                detail=f"Para cancelar na Estante Virtual, escolha um motivo oficial: {', '.join(EV_VALID_CANCEL_REASONS)}."
            )

    seller_raw = re.sub(r"\D", "", str(settings.ev_seller_id or ""))
    if seller_raw and (settings.ev_email or "").strip():
        token = await ensure_valid_ev_token(db, settings)
        base_url = get_ev_base_url(settings)
        ev_body: Dict[str, Any] = {
            "pedido": {
                "id_vendedor": int(seller_raw),
                "marketplace_id_pedido": int(ev_ord.ev_order_id) if ev_ord.ev_order_id.isdigit() else ev_ord.ev_order_id,
                "status_codigo": target_status,
                "razao_cancelamento": cancel_clean if target_status == "CANCELED" else "",
                "rastreio": rastreio_clean if (target_status == "SENT" and rastreio_clean) else "",
                "url_rastreio": url_clean if (target_status == "SENT" and url_clean) else "",
            }
        }
        # Remove chaves vazias de rastreio para garantir que apenas 1 seja avaliada pela EV
        if target_status == "SENT":
            if rastreio_clean:
                ev_body["pedido"].pop("url_rastreio", None)
            elif url_clean:
                ev_body["pedido"].pop("rastreio", None)

        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.put(
                f"{base_url}/pedido",
                json=ev_body,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
            if resp.status_code not in (200, 201):
                err_txt = (resp.text or "")[:250]
                raise HTTPException(
                    status_code=400,
                    detail=f"A Estante Virtual recusou a atualização do pedido #{ev_ord.ev_order_id} (HTTP {resp.status_code}): {err_txt}"
                )

    ev_ord.status_codigo = target_status
    if rastreio_clean:
        ev_ord.tracking_code = rastreio_clean
        ev_ord.tracking_url = None
    if url_clean:
        ev_ord.tracking_url = url_clean
        ev_ord.tracking_code = None
    if cancel_clean:
        ev_ord.cancel_reason = cancel_clean

    db.commit()
    return {"message": f"Status do pedido #{ev_ord.ev_order_id} atualizado para {target_status} com sucesso!"}


@router.get("/orders/shipping-labels")
async def download_ev_mle_shipping_labels(
    ids: str = Query(..., description="IDs dos pedidos na EV separados por vírgula (máx 25)"),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    """
    Gera etiquetas PDF para pedidos Magalu Entregas (MLE) na Estante Virtual (GET /etiquetas?ids=...).
    Suporta até 25 pedidos por lote e trata tanto o retorno PDF binário (HTTP 200)
    quanto o XML Multi-Status (HTTP 207).
    """
    cid = _resolve_company_id(current_user, company_id)
    settings = _get_or_create_settings(db, cid)
    id_list = [x.strip() for x in ids.split(",") if x.strip()]
    if not id_list:
        raise HTTPException(status_code=400, detail="Informe pelo menos 1 ID de pedido para gerar etiquetas.")
    if len(id_list) > 25:
        raise HTTPException(status_code=400, detail="A Estante Virtual permite gerar no máximo 25 etiquetas Magalu Entregas (MLE) por lote.")

    token = await ensure_valid_ev_token(db, settings)
    base_url = get_ev_base_url(settings)

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{base_url}/etiquetas",
            params={"ids": ",".join(id_list)},
            headers={"Authorization": f"Bearer {token}"},
        )

        if resp.status_code == 200 and resp.content.startswith(b"%PDF"):
            return Response(
                content=resp.content,
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="etiquetas-ev-mle-{id_list[0]}.pdf"'},
            )

        if resp.status_code == 207:
            # Faz parse do XML Multi-Status da EV para informar exatamente o status de cada etiqueta
            details = []
            try:
                root = ET.fromstring(resp.text)
                for elem in root.findall(".//{DAV:}response"):
                    href = elem.findtext("{DAV:}href") or ""
                    st = elem.findtext("{DAV:}status") or ""
                    details.append(f"{href.split('ids=')[-1]}: {st}")
            except Exception:
                details = [resp.text[:300]]
            raise HTTPException(
                status_code=422,
                detail=f"Alguns pedidos do lote não possuem etiqueta Magalu Entregas disponível (Status 207): {' | '.join(details)}"
            )

        raise HTTPException(
            status_code=400,
            detail=f"Não foi possível gerar etiquetas MLE na Estante Virtual (HTTP {resp.status_code}): {(resp.text or '')[:250]}"
        )


@router.post("/orders/{ev_order_db_id}/send-to-horus")
async def send_ev_order_to_horus(
    ev_order_db_id: int,
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    """
    Envia um pedido da Estante Virtual para o Horus ERP (InsPedidoVenda + InsItensPedidoVenda).
    REGRA MANDATÓRIA 11: Todos os campos textuais são enviados em CAIXA ALTA (.strip().upper()).
    """
    cid = _resolve_company_id(current_user, company_id)
    company = db.query(Company).filter(Company.id == cid).first()
    settings = _get_or_create_settings(db, cid)
    preset = get_merged_ev_preset(settings)

    ev_ord = db.query(EvOrder).filter(EvOrder.id == ev_order_db_id, EvOrder.company_id == cid).first()
    if not ev_ord:
        raise HTTPException(status_code=404, detail="Pedido da Estante Virtual não encontrado.")

    if not settings.horus_enabled:
        raise HTTPException(status_code=400, detail="A integração Horus ERP não está ativa para esta empresa.")

    from app.integrators.horus_orders import HorusOrders

    id_doc = re.sub(r"\D", "", str(preset.get("horus_default_customer_doc") or ev_ord.buyer_doc_number or ""))
    id_guid = str(preset.get("horus_default_customer_guid") or settings.horus_default_b2b_guid or "").strip().upper()
    cnpj_destino = re.sub(r"\D", "", str(company.document or "")) if company else ""
    cod_origem = f"EV{ev_ord.ev_order_id}".strip().upper()
    obs_pedido = f"PEDIDO ESTANTE VIRTUAL #{ev_ord.ev_order_id} - COMPRADOR: {(ev_ord.buyer_name or '').strip()}".upper()

    horus_orders = HorusOrders(db, cid)
    res_header = await horus_orders.send_order(
        id_doc=id_doc,
        id_guid=id_guid,
        cnpj_destino=cnpj_destino,
        cod_pedido_origem=cod_origem,
        type_order="V",
        obs=obs_pedido,
    )
    if res_header.get("error"):
        ev_ord.sync_error = str(res_header.get("msg") or "Falha ao criar capa do pedido no Horus ERP")
        db.commit()
        raise HTTPException(status_code=400, detail=ev_ord.sync_error)

    cod_ped_venda = str(res_header.get("COD_PED_VENDA") or "").strip()
    for it in (ev_ord.items_json or []):
        isbn_val = str(it.get("isbn") or it.get("sku") or "").strip().upper()
        qty_val = int(it.get("quantity") or 1)
        price_val = float(it.get("unit_price") or 0.0)
        await horus_orders.send_order_item(
            id_doc=id_doc,
            id_guid=id_guid,
            cnpj_destino=cnpj_destino,
            cod_pedido_origem=cod_origem,
            isbn=isbn_val,
            qty=qty_val,
            price=price_val,
        )

    ev_ord.horus_pedido_venda = cod_ped_venda
    ev_ord.sync_error = None
    if ev_ord.cronuz_order_id:
        ord_obj = db.query(Order).filter(Order.id == ev_ord.cronuz_order_id).first()
        if ord_obj:
            ord_obj.horus_pedido_venda = cod_ped_venda
            ord_obj.status = "SENT_TO_HORUS"
    db.commit()

    return {
        "message": f"Pedido #{ev_ord.ev_order_id} enviado ao Horus ERP com sucesso (Pedido Horus: {cod_ped_venda})!",
        "horus_pedido_venda": cod_ped_venda,
    }


@router.get("/logs")
def list_ev_sync_logs(
    limit: int = Query(15, ge=1, le=100),
    company_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dependencies.get_current_user),
):
    cid = _resolve_company_id(current_user, company_id)
    rows = (
        db.query(EvSyncLog)
        .filter(EvSyncLog.company_id == cid)
        .order_by(EvSyncLog.id.desc())
        .limit(limit)
        .all()
    )
    return {
        "items": [
            {
                "id": r.id,
                "sync_type": r.sync_type,
                "status": r.status,
                "items_processed": r.items_processed,
                "items_updated": r.items_updated,
                "items_failed": r.items_failed,
                "message": r.message,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }


def run_estantevirtual_stock_sync_job():
    """
    Job de background do APScheduler (a cada 15 minutos) para drenar a fila mkt_sync_queue
    e executar o Delta Sync dos sellers com module_estantevirtual e ev_enabled ativos.
    """
    import asyncio
    db = SessionLocal()
    try:
        active_settings = (
            db.query(CompanySettings)
            .join(Company, Company.id == CompanySettings.company_id)
            .filter(
                Company.active == True,
                Company.module_estantevirtual == True,
                CompanySettings.ev_enabled == True,
            )
            .all()
        )
        for st in active_settings:
            try:
                asyncio.run(execute_ev_company_delta_sync(db, st.company_id, force_all=False))
            except Exception as e:
                logger.warning("[EV_CRON] Erro no Delta Sync da empresa %s: %s", st.company_id, e)
    finally:
        db.close()
