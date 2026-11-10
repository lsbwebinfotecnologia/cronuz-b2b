from fastapi import FastAPI, Depends, HTTPException, Request, BackgroundTasks
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, HTMLResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import Optional
from app.db.session import engine, get_db, SessionLocal
from app.models import company as company_models
from app.models import user as user_models
from app.models import customer as customer_models
from app.models import customer_group as customer_group_models
from app.models import company_settings as settings_models
from app.models import product as product_models
from app.models import catalog_support as catalog_models
from app.models import marketing_showcase as marketing_models
from app.models import marketing_navigation as marketing_nav_models
from app.models import subscription as subscription_models
from app.models import lead as lead_models
from app.models import system_integrator as system_integrator_models
from app.models import order as order_models
from app.models import commercial_policy as commercial_models
from app.models import print_point as print_point_models
from app.models import consignment_draft as consignment_draft_models
from app.models import email_template as email_template_models
from app.models import bookinfo_purchase_log as purchase_log_models
from app.models import proposal as proposal_models
from app.models import seller_branch as seller_branch_models
from app.models import dropship as dropship_models
from app.models import dropship_price_table as dropship_price_table_models
from app.models import dropship_erdos_credential as dropship_erdos_credential_models
from app.models import dropship_stock_sync_log as dropship_stock_sync_log_models
from app.models import dropship_manifest as dropship_manifest_models
from app.models import order_conference as order_conference_models
from app.models import alert as alert_models
from app.models import hosted_site as hosted_site_models
from app.models import author as author_models
from app.models import inventory as inventory_models
from app.models import pos as pos_models
from app.models import product_search_log as product_search_log_models
from app.models import cafeteria as cafeteria_models
from app.schemas import company as schemas
from app.schemas import user as user_schemas
from app.schemas import company_settings as settings_schemas
from app.api import horus
from app.api import horus_logistics
from app.api import auth
from app.api import companies
from app.api import users
from app.api import customers
from app.api import products
from app.api import catalog_support
from app.api import promotions
from app.api import marketing_showcases
from app.api import dynamic_showcases
from app.api import marketing_navigation
from app.models import dynamic_showcase as dynamic_showcase_models
from app.api import storefront
from app.api import upload
from app.api import dashboard
from app.api import commercial_policies
from app.api import financial
from app.api import orders
from app.api import subscriptions
from app.api import leads
from app.api import company_notes
from app.api import integrators
from app.api import customer_auth
from app.api import customer_portal
from app.api import system_integrators
from app.api import bookinfo_hub
from app.api import bookinfo_purchases
from app.api import bookinfo_purchase_logs
from app.api import services
from app.api import proposals
from app.api import print_points
from app.api import bank_slips
from app.api import email_templates
from app.api import mobile
from app.api import mobile_pdv
from app.api import brand
from app.api import dropship
from app.api import sefaz_download
from app.api import alerts as alerts_api
from app.api import product_search
from app.api import distributors as distributors_api
from app.models import distributor as distributor_models
from app.api import hosted_sites as hosted_sites_api
from app.api import horus_sql as horus_sql_api
from app.api import horus_financial
from app.api import horus_orders
from app.api import cora as cora_api
from app.api import payments_hub as payments_hub_api
from app.api import payments as payments_api
from app.api import authors_admin
from app.api import author_portal
from app.api import inventory as inventory_api
from app.api import logistics as logistics_api
from app.api import pos as pos_api
from app.api import editorial as editorial_api
from app.models import editorial as editorial_models
from app.api import schools as schools_api
from app.api import events as events_api
from app.api import school_storefront as school_storefront_api
from app.models import school as school_models
from app.api import master_sessions
from app.api import dbm as dbm_api
from app.api import cafeteria as cafeteria_api
from app.api import bookinfo_metadata
from app.api import backorders as backorders_api
from app.api import encomendas as encomendas_api
from app.api import addressing as addressing_api
from app.api import horus_bi as horus_bi_api
from app.api import order_intake as order_intake_api
from app.api import ebook_pearson as ebook_pearson_api
from app.api import b2c_storefront as b2c_storefront_api
from app.api import horus_api_bridge as horus_api_bridge_api
from app.api import mercadolivre as mercadolivre_api
from app.models import backorder as backorder_models
from app.models import encomenda as encomenda_models
from app.models import product_address as product_address_models
from app.models import horus_bi_sale as horus_bi_sale_models
from app.models import global_setting as global_setting_models
from app.models import b2c_storefront as b2c_storefront_models
from app.models import dbm_proposal as dbm_proposal_models
from app.models import mercadolivre as mercadolivre_models
from app.models import horus_reconciliation_closing as horus_rec_closing_models
from app.core import security
from app.core import dependencies
from pydantic import BaseModel
from fastapi.staticfiles import StaticFiles
import os
import traceback as _traceback
import logging

_main_logger = logging.getLogger("cronuz.main")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)

# Create tables for both company and user
company_models.Base.metadata.create_all(bind=engine)
user_models.Base.metadata.create_all(bind=engine)
customer_models.Base.metadata.create_all(bind=engine)
customer_group_models.Base.metadata.create_all(bind=engine)
settings_models.Base.metadata.create_all(bind=engine)
product_models.Base.metadata.create_all(bind=engine)
catalog_models.Base.metadata.create_all(bind=engine)
marketing_models.Base.metadata.create_all(bind=engine)
subscription_models.Base.metadata.create_all(bind=engine)
lead_models.Base.metadata.create_all(bind=engine)
print_point_models.Base.metadata.create_all(bind=engine)
system_integrator_models.Base.metadata.create_all(bind=engine)
marketing_nav_models.Base.metadata.create_all(bind=engine)
order_models.Base.metadata.create_all(bind=engine)
consignment_draft_models.Base.metadata.create_all(bind=engine)
email_template_models.Base.metadata.create_all(bind=engine)
purchase_log_models.Base.metadata.create_all(bind=engine)
proposal_models.Base.metadata.create_all(bind=engine)
seller_branch_models.Base.metadata.create_all(bind=engine)
order_conference_models.Base.metadata.create_all(bind=engine)
dropship_models.Base.metadata.create_all(bind=engine)
alert_models.Base.metadata.create_all(bind=engine)
hosted_site_models.Base.metadata.create_all(bind=engine)
author_models.Base.metadata.create_all(bind=engine)
inventory_models.Base.metadata.create_all(bind=engine)
pos_models.Base.metadata.create_all(bind=engine)
product_search_log_models.Base.metadata.create_all(bind=engine)
editorial_models.Base.metadata.create_all(bind=engine)
school_models.Base.metadata.create_all(bind=engine)
dynamic_showcase_models.Base.metadata.create_all(bind=engine)
cafeteria_models.Base.metadata.create_all(bind=engine)
backorder_models.Base.metadata.create_all(bind=engine)
global_setting_models.Base.metadata.create_all(bind=engine)
encomenda_models.Base.metadata.create_all(bind=engine)
product_address_models.Base.metadata.create_all(bind=engine)
horus_bi_sale_models.Base.metadata.create_all(bind=engine)
b2c_storefront_models.Base.metadata.create_all(bind=engine)
dbm_proposal_models.Base.metadata.create_all(bind=engine)
mercadolivre_models.Base.metadata.create_all(bind=engine)
horus_rec_closing_models.Base.metadata.create_all(bind=engine)
try:
    from sqlalchemy import text as _sql_text
    with engine.begin() as _conn:
        _conn.execute(_sql_text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS b2c_showcases_config JSON"))
        _conn.execute(_sql_text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cover_image_secondary_base_url VARCHAR(500)"))
        _conn.execute(_sql_text("ALTER TABLE crm_customer ADD COLUMN IF NOT EXISTS min_order_total DOUBLE PRECISION NOT NULL DEFAULT 0"))
        _conn.execute(_sql_text("ALTER TABLE prd_product ADD COLUMN IF NOT EXISTS is_ebook BOOLEAN NOT NULL DEFAULT FALSE"))
        _conn.execute(_sql_text("ALTER TABLE cmp_company ADD COLUMN IF NOT EXISTS module_mercadolivre BOOLEAN NOT NULL DEFAULT FALSE"))
        _conn.execute(_sql_text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS meli_enabled BOOLEAN NOT NULL DEFAULT FALSE"))
        _conn.execute(_sql_text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS meli_app_id VARCHAR(100)"))
        _conn.execute(_sql_text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS meli_client_secret VARCHAR(255)"))
        _conn.execute(_sql_text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS meli_redirect_uri VARCHAR(500)"))
        _conn.execute(_sql_text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS meli_user_id VARCHAR(100)"))
        _conn.execute(_sql_text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS meli_nickname VARCHAR(150)"))
        _conn.execute(_sql_text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS meli_access_token VARCHAR(1000)"))
        _conn.execute(_sql_text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS meli_refresh_token VARCHAR(1000)"))
        _conn.execute(_sql_text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS meli_token_expires_at TIMESTAMPTZ"))
        _conn.execute(_sql_text("ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS meli_preset_config JSON"))
except Exception as _ddl_err:
    _main_logger.warning("Auto-DDL warning: %s", _ddl_err)

app = FastAPI(title="Cronuz B2B API", version="0.1.0")

@app.exception_handler(StarletteHTTPException)
async def custom_http_exception_handler(request: Request, exc: StarletteHTTPException):
    origin = request.headers.get("origin") or "*"
    detail_msg = exc.detail
    if exc.status_code == 405 or detail_msg == "Method Not Allowed":
        accept_hdr = (request.headers.get("accept") or "").lower()
        if "text/html" in accept_hdr:
            return HTMLResponse(
                status_code=200,
                content=(
                    '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8" />'
                    '<meta name="viewport" content="width=device-width, initial-scale=1" />'
                    '<meta http-equiv="refresh" content="2;url=https://app.horusb2b.com.br" />'
                    '<title>Redirecionando...</title>'
                    '<style>body{font-family:sans-serif;background:#f8fafc;color:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:16px}'
                    '.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;max-width:420px;text-align:center;box-shadow:0 10px 25px -5px rgba(0,0,0,0.05)}'
                    'a{display:inline-block;margin-top:16px;background:#059669;color:#fff;text-decoration:none;font-weight:700;padding:10px 20px;border-radius:10px}</style></head>'
                    '<body><div class="card"><h3>Operação Concluída</h3>'
                    '<p style="color:#475569;font-size:14px;">Estamos redirecionando você de volta para a página inicial...</p>'
                    '<a href="https://app.horusb2b.com.br">Voltar para a Página Inicial</a></div></body></html>'
                ),
            )
        detail_msg = "Esta ação não está disponível diretamente por este endereço. Volte à página inicial e tente novamente."
    elif exc.status_code == 404 and detail_msg == "Not Found":
        detail_msg = "O endereço ou recurso solicitado não foi encontrado."
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": detail_msg},
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "*",
        },
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    body = await request.body()
    try:
        body_text = body.decode()
    except Exception:
        body_text = "<body não decodificável>"
    raw_errors = exc.errors()
    _main_logger.warning("[422] Validation error | path=%s | body=%s | errors=%s", request.url.path, body_text[:200], raw_errors)
    origin = request.headers.get("origin") or "*"

    field_messages = []
    for err in raw_errors[:6]:
        loc_parts = [str(p) for p in (err.get("loc") or []) if str(p) not in ("body", "query", "path")]
        field_name = ".".join(loc_parts) if loc_parts else "parâmetro"
        msg = str(err.get("msg") or "valor inválido")
        if msg == "Field required":
            msg = "campo obrigatório ausente"
        elif "valid integer" in msg.lower():
            msg = "deve ser um número inteiro válido"
        elif "valid number" in msg.lower():
            msg = "deve ser um valor numérico válido"
        elif "valid date" in msg.lower():
            msg = "data inválida"
        field_messages.append(f"{field_name} ({msg})")

    detail_str = (
        f"Erro de validação nos dados enviados: {', '.join(field_messages)}."
        if field_messages
        else "Alguns campos obrigatórios não foram preenchidos corretamente. Verifique os dados informados e tente novamente."
    )

    return JSONResponse(
        status_code=422,
        content={
            "detail": detail_str,
            "errors": raw_errors,
        },
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "*",
        }
    )

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    _main_logger.error("[500] path=%s | %s", request.url.path, _traceback.format_exc())
    origin = request.headers.get("origin") or "*"
    err_reason = str(exc).strip() or type(exc).__name__
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"Erro ao processar solicitação em {request.url.path}: {err_reason[:300]}",
            "error_type": type(exc).__name__,
        },
        headers={
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Allow-Methods": "*",
        }
    )


# [SEC] Security Headers Middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


# [SEC] CORS — permite localhost/127.0.0.1 em desenvolvimento e apenas HTTPS em produção
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^(https?://(localhost|127\.0\.0\.1)(:[0-9]+)?|https://.+)$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_SERVER_ROLE = os.environ.get("SERVER_ROLE", "all").strip().lower()

# Gateway da API Horus Complementar & Agente Bridge (.EXE) sempre disponível
app.include_router(horus_api_bridge_api.router)

if _SERVER_ROLE != "horus_api_only":
    app.include_router(auth.router, tags=["authentication"])
    app.include_router(companies.router)
    app.include_router(users.router)
    app.include_router(horus.router, tags=["inventory"])
    app.include_router(horus_logistics.router, prefix="/logistics", tags=["logistics"])
    app.include_router(customers.router, tags=["customers"])
    app.include_router(products.router, tags=["products"])
    app.include_router(catalog_support.router, tags=["catalog-metadata"])
    app.include_router(promotions.router, tags=["promotions"])
    app.include_router(marketing_showcases.router, tags=["marketing"])
    app.include_router(dynamic_showcases.router, tags=["dynamic-showcases"])
    app.include_router(marketing_navigation.router, prefix="/marketing-navigation", tags=["marketing-navigation"])
    app.include_router(storefront.router, tags=["storefront"])
    app.include_router(upload.router, tags=["upload"])
    app.include_router(dashboard.router, tags=["dashboard"])
    app.include_router(orders.router, tags=["orders"])
    app.include_router(subscriptions.router, tags=["subscriptions"])
    app.include_router(leads.router, tags=["leads"])
    app.include_router(company_notes.router, prefix="/company-notes", tags=["company-notes"])
    app.include_router(integrators.router, prefix="/integrators", tags=["integrators"])
    app.include_router(system_integrators.router, prefix="/system-integrators", tags=["system-integrators"])
    app.include_router(bookinfo_hub.router, tags=["bookinfo"])
    app.include_router(bookinfo_purchases.router, tags=["bookinfo_purchases"])
    app.include_router(bookinfo_purchase_logs.router, tags=["bookinfo_purchase_logs"])
    app.include_router(services.router, tags=["services"])
    app.include_router(proposals.router, tags=["proposals"])
    app.include_router(print_points.router, prefix="/print-points", tags=["print-points"])
    app.include_router(bank_slips.router, tags=["financial"])
    app.include_router(commercial_policies.router, tags=["commercial-policies"])
    app.include_router(financial.router, tags=["financial"])
    app.include_router(email_templates.router, prefix="/settings/email-templates", tags=["settings"])
    app.include_router(customer_portal.router)
    app.include_router(customer_auth.router)
    app.include_router(mobile.router, prefix="/seller", tags=["mobile"])
    app.include_router(mobile_pdv.router, tags=["mobile-pdv"])

    app.include_router(brand.router, tags=["app-brand"])
    app.include_router(dropship.router, prefix="/dropship", tags=["dropship"])
    app.include_router(sefaz_download.router)
    app.include_router(alerts_api.router)
    app.include_router(product_search.router, prefix="/product-search", tags=["product-search"])
    app.include_router(distributors_api.router, tags=["distributors"])
    app.include_router(hosted_sites_api.router)
    app.include_router(horus_sql_api.router, tags=["horus-sql"])
    app.include_router(horus_financial.router, tags=["horus-financial"])
    app.include_router(cora_api.router, tags=["banco-cora"])
    app.include_router(payments_hub_api.router, tags=["payments-hub"])
    app.include_router(payments_api.router, tags=["payments"])
    app.include_router(horus_orders.router, tags=["horus-orders"])
    app.include_router(authors_admin.router)
    app.include_router(author_portal.router)
    app.include_router(inventory_api.router)
    app.include_router(inventory_api.public_router)
    app.include_router(logistics_api.router, tags=["logistics-wms"])
    app.include_router(pos_api.router, tags=["pos-omnichannel"])
    app.include_router(editorial_api.router)
    app.include_router(schools_api.router)
    app.include_router(events_api.router)
    app.include_router(school_storefront_api.router)
    app.include_router(master_sessions.router)
    app.include_router(dbm_api.router)
    app.include_router(cafeteria_api.router)
    app.include_router(cafeteria_api.public_router)
    app.include_router(bookinfo_metadata.router)
    app.include_router(backorders_api.router)
    app.include_router(encomendas_api.router)
    app.include_router(addressing_api.router)
    app.include_router(horus_bi_api.router)
    app.include_router(order_intake_api.router)
    app.include_router(ebook_pearson_api.router)
    app.include_router(b2c_storefront_api.router)
    app.include_router(mercadolivre_api.router)

# Mount static files directory using absolute path relative to backend/main.py
from pathlib import Path as _MainPath
_BACKEND_DIR = _MainPath(__file__).resolve().parent

(_BACKEND_DIR / "static").mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=str(_BACKEND_DIR / "static")), name="static")

(_BACKEND_DIR / "uploads").mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_BACKEND_DIR / "uploads")), name="uploads")

(_BACKEND_DIR / "storage").mkdir(parents=True, exist_ok=True)
app.mount("/storage", StaticFiles(directory=str(_BACKEND_DIR / "storage")), name="storage")

@app.on_event("startup")
def seed_master_user():
    if _SERVER_ROLE == "horus_api_only":
        _main_logger.info("[Startup] Modo Droplet Dedicado (SERVER_ROLE=horus_api_only) ativo — APScheduler desabilitado.")
        return

    db = SessionLocal()
    try:
        master_email = "system@cronuz.com.br"
        existing_master = db.query(user_models.User).filter(user_models.User.email == master_email).first()
        if not existing_master:
            master_user = user_models.User(
                name="Cronuz Master System",
                email=master_email,
                type=user_models.UserRole.MASTER,
                password_hash=security.get_password_hash(
                    os.environ.get("MASTER_SEED_PASSWORD", "C1r2o34@9182")  # [SEC] sobrescrever via .env em producao
                ),
                company_id=None
            )
            db.add(master_user)
            print("INFO:     Master user seeded successfully")
    finally:
        db.close()
        
    # Start Background Jobs — apenas 1 worker inicia o scheduler.
    # Estratégia: usa arquivo de lock atômico com O_EXCL para garantir
    # que somente o PRIMEIRO worker que conseguir criar o arquivo sobe o scheduler.
    # O arquivo é apagado quando o processo dono morrer (via systemd restart).
    SCHEDULER_LOCK_FILE = "/tmp/cronuz_scheduler_{ppid}.lock".format(ppid=os.getppid())
    try:
        # O_CREAT | O_EXCL garante criacao atomica — falha se ja existir
        fd = os.open(SCHEDULER_LOCK_FILE, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, str(os.getpid()).encode())
        os.close(fd)
        # Este worker foi o primeiro: inicia o scheduler
        from app.core.scheduler import start_scheduler
        start_scheduler()

        # Rotina dinâmica para sincronizar SSL dos Portais de Autores ativos na inicialização
        try:
            import threading
            from app.core.ssl_authors import sync_all_active_author_portals
            threading.Thread(target=sync_all_active_author_portals, daemon=True, name="AuthorSSLSync").start()
        except Exception as _e_ssl:
            _main_logger.warning("[SSL_AUTHORS] Erro ao iniciar thread de sync SSL: %s", _e_ssl)
    except FileExistsError:
        # Outro worker ja criou o arquivo — scheduler ja esta rodando
        _main_logger.info(
            "[Scheduler] Worker PID %s ignorou start_scheduler (lock %s ja existe).",
            os.getpid(), SCHEDULER_LOCK_FILE
        )

@app.get("/")
def read_root():
    return {"message": "Cronuz B2B API is running.", "server_role": _SERVER_ROLE}

@app.get("/health")
def health_check():
    return {"status": "ok", "server_role": _SERVER_ROLE}

