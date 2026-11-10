from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy import or_
from sqlalchemy.orm import Session
from typing import Optional, List
from pydantic import BaseModel
import logging
import httpx

from app.db.session import get_db
from app.models import company as company_models
from app.models import user as user_models
from app.models import company_settings as settings_models
from app.schemas import company as schemas
from app.schemas import company_settings as settings_schemas
from app.core import dependencies

logger = logging.getLogger("cronuz.companies")

router = APIRouter(tags=["companies"])

class StatusUpdate(BaseModel):
    active: bool

class ModuleUpdate(BaseModel):
    module_b2b_native: Optional[bool] = None
    module_horus_erp: Optional[bool] = None
    module_products: Optional[bool] = None
    module_orders: Optional[bool] = None
    module_customers: Optional[bool] = None
    module_marketing: Optional[bool] = None
    module_subscriptions: Optional[bool] = None
    module_pdv: Optional[bool] = None
    module_agents: Optional[bool] = None
    module_financial: Optional[bool] = None
    module_services: Optional[bool] = None
    module_commercial: Optional[bool] = None
    module_crm: Optional[bool] = None
    module_consignment: Optional[bool] = None
    module_proposals: Optional[bool] = None
    module_logistica_horus: Optional[bool] = None
    module_dropship: Optional[bool] = None
    module_notifications: Optional[bool] = None
    module_busca_preco: Optional[bool] = None
    module_horus_sql: Optional[bool] = None
    module_cora: Optional[bool] = None
    modulo_autores_ativo: Optional[bool] = None
    has_inventory_module: Optional[bool] = None
    module_editorial: Optional[bool] = None
    module_schools: Optional[bool] = None
    module_cafeteria: Optional[bool] = None
    module_encomendas: Optional[bool] = None
    module_order_intake: Optional[bool] = None
    module_b2c_storefront: Optional[bool] = None
    module_horus_api_bridge: Optional[bool] = None
    module_mercadolivre: Optional[bool] = None


class HorusTestRequest(BaseModel):
    url: str
    port: str
    username: str
    password: str


@router.post("/companies", response_model=schemas.Company)
def create_company(
    company: schemas.CompanyCreate, 
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.require_master_user)
):
    company_data = company.model_dump()
    lead_id = company_data.pop("lead_id", None)
    
    # Partner Masters can only create companies within their own tenant
    if current_user.type == user_models.UserRole.MASTER and current_user.tenant_id and current_user.tenant_id != "cronuz":
        company_data["tenant_id"] = current_user.tenant_id
        
    db_company = company_models.Company(**company_data)
    db.add(db_company)
    db.commit()
    db.refresh(db_company)
    
    if lead_id:
        from app.models.lead import Lead
        lead = db.query(Lead).filter(Lead.id == lead_id).first()
        if lead:
            lead.company_id = db_company.id
            db.commit()
            
    return db_company


@router.get("/companies", response_model=List[schemas.Company])
def read_companies(
    skip: int = 0, 
    limit: int = 500, 
    search: Optional[str] = None,
    order_by: Optional[str] = "recent",
    uses_bookinfo: bool = False,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    query = db.query(company_models.Company)
    
    if current_user.type == user_models.UserRole.MASTER and current_user.tenant_id and current_user.tenant_id != "cronuz":
        query = query.filter(company_models.Company.tenant_id == current_user.tenant_id)
    elif current_user.type != user_models.UserRole.MASTER:
        query = query.filter(company_models.Company.id == current_user.company_id)
        
    if uses_bookinfo:
        from app.models.integrator import Integrator
        query = query.join(Integrator, Integrator.company_id == company_models.Company.id).filter(
            Integrator.platform == "BOOKINFO",
            Integrator.active == True
        )
        
    if search and search.strip():
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                company_models.Company.name.ilike(term),
                company_models.Company.document.ilike(term),
                company_models.Company.domain.ilike(term),
                company_models.Company.custom_domain.ilike(term),
                company_models.Company.razao_social.ilike(term),
            )
        )

    if order_by in ["alphabetical", "name_asc", "az"]:
        query = query.order_by(company_models.Company.name.asc())
    elif order_by in ["name_desc", "za"]:
        query = query.order_by(company_models.Company.name.desc())
    elif order_by in ["oldest", "antiga"]:
        query = query.order_by(company_models.Company.created_at.asc(), company_models.Company.id.asc())
    else: # default "recent"
        query = query.order_by(company_models.Company.created_at.desc(), company_models.Company.id.desc())

    if limit > 0:
        query = query.offset(skip).limit(limit)

    companies = query.all()
    return companies


@router.get("/companies/{company_id}", response_model=schemas.Company)
def read_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    company = db.query(company_models.Company).filter(company_models.Company.id == company_id).first()
    if company is None:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    return company


@router.put("/companies/{company_id}", response_model=schemas.Company)
def update_company(
    company_id: int,
    company_update: schemas.CompanyUpdate,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    company = db.query(company_models.Company).filter(company_models.Company.id == company_id).first()
    if company is None:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
        
    if current_user.type != user_models.UserRole.MASTER and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Não autorizado")
        
    update_data = company_update.model_dump(exclude_unset=True)
    
    # Handle empty strings to avoid Postgres UNIQUE constraint errors
    for field in ["custom_domain", "b2c_custom_domain", "login_background_url", "logo", "zip_code", "street", "number", "complement", "neighborhood", "city", "state"]:
        if field in update_data and isinstance(update_data[field], str):
            val = update_data[field].strip()
            if field in ("custom_domain", "b2c_custom_domain") and val:
                val = val.lower().replace("https://", "").replace("http://", "").split("/")[0].strip()
            update_data[field] = val if val != "" else None
            
    for key, value in update_data.items():
        setattr(company, key, value)
        
    # Validations Phase 3
    if getattr(company, "nfse_enabled", False):
        if not getattr(company, "codigo_municipio_ibge", None):
            raise HTTPException(
                status_code=400, 
                detail="A emissão de NFS-e não pode ser ativada sem o preenchimento do 'Código IBGE do Município'. Por favor, verifique as Configurações Fiscais."
            )
            
    db.commit()
    db.refresh(company)

    # Se salvou um domínio próprio B2C ou B2B, dispara provisionamento automático de vhost + SSL em background
    for dom_field in ("b2c_custom_domain", "custom_domain"):
        dom_val = getattr(company, dom_field, None)
        if dom_val:
            try:
                import threading
                from app.core.ssl_authors import ensure_custom_b2c_domain_ssl
                threading.Thread(target=ensure_custom_b2c_domain_ssl, args=(dom_val,), daemon=True).start()
            except Exception:
                pass

    return company


@router.patch("/companies/{company_id}/status", response_model=schemas.Company)
def update_company_status(
    company_id: int,
    status_update: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.require_master_user)
):
    company = db.query(company_models.Company).filter(company_models.Company.id == company_id).first()
    if company is None:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    company.active = status_update.active
    db.commit()
    db.refresh(company)
    return company


@router.patch("/companies/{company_id}/modules", response_model=schemas.Company)
def update_company_modules(
    company_id: int,
    module_update: ModuleUpdate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    if current_user.type != user_models.UserRole.MASTER and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Sem permissão para alterar os módulos desta empresa")
        
    company = db.query(company_models.Company).filter(company_models.Company.id == company_id).first()
    if company is None:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")
    
    update_data = module_update.model_dump(exclude_unset=True)

    # Módulos contratados são de gestão exclusiva do MASTER
    if current_user.type != user_models.UserRole.MASTER:
        MASTER_ONLY_MODULES = [
            "module_encomendas",
            "module_order_intake",
            "module_busca_preco",
            "module_consignment",
            "module_logistica_horus",
            "module_dropship",
            "module_horus_sql",
            "module_horus_api_bridge",
            "module_cora",
            "modulo_autores_ativo",
            "has_inventory_module",
        ]
        for mod in MASTER_ONLY_MODULES:
            update_data.pop(mod, None)

    for key, value in update_data.items():
        setattr(company, key, value)

    # Sincroniza novos módulos ativados pelo Master com usuários Seller que possuem lista restrita de allowed_modules
    MODULE_TO_USER_PERMISSIONS = {
        "module_b2c_storefront": ["b2c"],
        "module_pdv": ["pdv", "pdv_horus_sync"],
        "module_busca_preco": ["busca_preco"],
        "module_encomendas": ["encomendas"],
        "module_orders": ["orders"],
        "module_order_intake": ["order_intake"],
        "module_proposals": ["proposals"],
        "module_subscriptions": ["subscriptions"],
        "module_logistica_horus": ["logistics"],
        "has_inventory_module": ["inventory"],
        "module_consignment": ["consignment"],
        "module_dropship": ["dropship"],
        "module_horus_sql": ["horus_sql", "dbm"],
        "module_products": ["products"],
        "module_customers": ["customers"],
        "module_agents": ["agents"],
        "module_commercial": ["commercial"],
        "module_marketing": ["promotions"],
        "module_notifications": ["notifications"],
        "module_cafeteria": ["cafeteria"],
        "module_schools": ["schools"],
        "module_editorial": ["editorial"],
        "modulo_autores_ativo": ["authors", "portal_autor"],
        "module_financial": ["financial"],
        "module_cora": ["financial"],
        "module_services": ["services"],
        "module_mercadolivre": ["mercadolivre"],
    }
    newly_enabled_perms: List[str] = []
    for mod_key, mod_val in update_data.items():
        if mod_val is True and mod_key in MODULE_TO_USER_PERMISSIONS:
            for perm_id in MODULE_TO_USER_PERMISSIONS[mod_key]:
                if perm_id not in newly_enabled_perms:
                    newly_enabled_perms.append(perm_id)

    if newly_enabled_perms:
        from sqlalchemy.orm.attributes import flag_modified
        seller_users = db.query(user_models.User).filter(
            user_models.User.company_id == company_id,
            user_models.User.type == user_models.UserRole.SELLER,
        ).all()
        for su in seller_users:
            if isinstance(su.allowed_modules, list) and len(su.allowed_modules) > 0:
                updated_list = list(su.allowed_modules)
                changed_su = False
                for perm_id in newly_enabled_perms:
                    if perm_id not in updated_list:
                        updated_list.append(perm_id)
                        changed_su = True
                if changed_su:
                    su.allowed_modules = updated_list
                    flag_modified(su, "allowed_modules")
    
    db.commit()
    db.refresh(company)

    if update_data.get("modulo_autores_ativo") is True:
        try:
            from app.core.ssl_authors import ensure_author_portal_ssl
            raw = company.domain or company.custom_domain or f"seller{company.id}"
            slug = raw.split(".")[0].strip().lower()
            background_tasks.add_task(ensure_author_portal_ssl, slug)
        except Exception as e:
            logger.warning("[SSL_AUTHORS] Falha ao agendar provisionamento SSL: %s", e)

    return company


@router.get("/companies/{company_id}/settings", response_model=settings_schemas.CompanySettings)
def read_company_settings(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    if current_user.type != user_models.UserRole.MASTER and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Sem permissão para ler as configurações desta empresa")
        
    settings = db.query(settings_models.CompanySettings).filter(settings_models.CompanySettings.company_id == company_id).first()
    if not settings:
        # Auto-create if not exists
        settings = settings_models.CompanySettings(company_id=company_id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


@router.put("/companies/{company_id}/settings", response_model=settings_schemas.CompanySettings)
def update_company_settings(
    company_id: int,
    settings_update: settings_schemas.CompanySettingsUpdate,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    if current_user.type != user_models.UserRole.MASTER and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Sem permissão para alterar as configurações desta empresa")

    settings = db.query(settings_models.CompanySettings).filter(settings_models.CompanySettings.company_id == company_id).first()
    if not settings:
         settings = settings_models.CompanySettings(company_id=company_id)
         db.add(settings)
    
    # Update fields
    from sqlalchemy.orm.attributes import flag_modified
    existing_b2c_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
    update_data = settings_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key == "b2c_showcases_config" and isinstance(value, dict):
            merged_cfg = {**existing_b2c_cfg, **value}
            # Sincroniza payment_channel_modes.B2C_STOREFRONT com vindi_config.integration_mode e b2c_checkout_mode
            v_cfg = merged_cfg.get("vindi_config") if isinstance(merged_cfg.get("vindi_config"), dict) else {}
            ch_modes = dict(merged_cfg.get("payment_channel_modes") or {}) if isinstance(merged_cfg.get("payment_channel_modes"), dict) else {}
            b2c_ch = dict(ch_modes.get("B2C_STOREFRONT") or {})
            effective_checkout_mode = update_data.get("b2c_checkout_mode") or getattr(settings, "b2c_checkout_mode", "NATIVE_GATEWAY")
            if effective_checkout_mode == "TRAY_REDIRECT" and getattr(settings, "tray_enabled", False):
                b2c_ch["mode"] = "TRAY_REDIRECT"
            elif str(v_cfg.get("integration_mode") or "").upper() == "PAYMENT_LINK" or b2c_ch.get("mode") == "PAYMENT_LINK":
                b2c_ch["mode"] = "PAYMENT_LINK"
                b2c_ch["link_provider"] = b2c_ch.get("link_provider") or "VINDI"
                if "express_cpf_only" in v_cfg:
                    b2c_ch["express_cpf_only"] = bool(v_cfg.get("express_cpf_only", True))
                settings.payment_gateway_active = str(b2c_ch.get("link_provider") or "VINDI").upper()
            elif "payment_channel_modes" not in value and b2c_ch.get("mode") == "PAYMENT_LINK" and str(v_cfg.get("integration_mode") or "").upper() == "TRANSPARENT":
                b2c_ch["mode"] = "PER_METHOD"
            if b2c_ch:
                ch_modes["B2C_STOREFRONT"] = b2c_ch
                merged_cfg["payment_channel_modes"] = ch_modes
            settings.b2c_showcases_config = merged_cfg
            flag_modified(settings, "b2c_showcases_config")
        else:
            setattr(settings, key, value)

    # Garante que payment_gateway_active fique sincronizado com PAYMENT_LINK se o modo do canal B2C_STOREFRONT for PAYMENT_LINK
    if isinstance(settings.b2c_showcases_config, dict):
        final_ch_modes = settings.b2c_showcases_config.get("payment_channel_modes") or {}
        final_b2c_ch = final_ch_modes.get("B2C_STOREFRONT") if isinstance(final_ch_modes, dict) else {}
        final_v_cfg = settings.b2c_showcases_config.get("vindi_config") or {}
        if (isinstance(final_b2c_ch, dict) and final_b2c_ch.get("mode") == "PAYMENT_LINK") or (
            isinstance(final_v_cfg, dict) and str(final_v_cfg.get("integration_mode") or "").upper() == "PAYMENT_LINK"
        ):
            settings.payment_gateway_active = str(
                (final_b2c_ch.get("link_provider") if isinstance(final_b2c_ch, dict) else None) or "VINDI"
            ).upper()

    # Sincroniza bookinfo_api_key com Integrator(platform='BOOKINFO') para unificar Seller e Master
    if "bookinfo_api_key" in update_data:
        try:
            import json
            from app.models.integrator import Integrator
            bi_token = (update_data.get("bookinfo_api_key") or "").strip()
            bi_integ = db.query(Integrator).filter(
                Integrator.company_id == company_id,
                Integrator.platform == "BOOKINFO"
            ).first()
            if bi_integ:
                try:
                    existing_creds = json.loads(bi_integ.credentials) if isinstance(bi_integ.credentials, str) else (bi_integ.credentials or {})
                except Exception:
                    existing_creds = {}
                env_val = existing_creds.get("Ambiente") or "PROD"
                bi_integ.credentials = json.dumps({"Ambiente": env_val, "Token": bi_token})
                if bi_token:
                    bi_integ.active = True
            elif bi_token:
                bi_integ = Integrator(
                    company_id=company_id,
                    platform="BOOKINFO",
                    active=True,
                    credentials=json.dumps({"Ambiente": "PROD", "Token": bi_token}),
                )
                db.add(bi_integ)
        except Exception as e:
            logger.warning("[BOOKINFO_SYNC_SETTINGS] Falha ao sincronizar Integrator BOOKINFO: %s", e)
        
    db.commit()
    db.refresh(settings)
    # Loja B2C usa cache de "store_info" (gateway / modo de checkout): invalida para refletir na hora
    try:
        from app.api.b2c_storefront import _b2c_cache_clear
        _b2c_cache_clear(company_id)
    except Exception:
        pass
    return settings


@router.post("/companies/{company_id}/settings/test-horus")
async def test_horus_connection(
    company_id: int,
    payload: HorusTestRequest,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user)
):
    if current_user.type != user_models.UserRole.MASTER and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Sem permissão para testar configurações desta empresa")
        
    url = str(payload.url).strip().rstrip("/")
    port = str(payload.port).strip()
    
    if not url:
        raise HTTPException(status_code=400, detail="A URL é obrigatória para o teste.")
        
    base_url = f"{url}:{port}" if port and port != '80' and port != '443' else url
    endpoint = f"{base_url}/Teste1"
    
    try:
        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
            auth_tuple = (payload.username, payload.password) if payload.username else None
            
            response = await client.get(endpoint, auth=auth_tuple)
            response.raise_for_status()
            
            return {
                "success": True, 
                "status_code": response.status_code,
                "message": "Conexão bem-sucedida! O servidor Horus respondeu perfeitamente.",
                "body": response.text[:200]
            }
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail=f"Timeout: O servidor {base_url} não respondeu a tempo. Verifique port forwarding e firewalls do cliente.")
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail=f"Erro de Conexão: Não foi possível alcançar {base_url}. Verifique IP, Porta e se o serviço Tomcat/Rest está online.")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=e.response.status_code, detail=f"Servidor acessível, mas retornou erro HTTP {e.response.status_code}. Caminho ou permissão incorreta.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha de comunicação: {str(e)}")


class B2CDnsVerifyRequest(BaseModel):
    domain: Optional[str] = None
    auto_save: bool = True


@router.post("/companies/{company_id}/b2c-verify-dns-ssl")
def verify_and_provision_b2c_domain(
    company_id: int,
    payload: B2CDnsVerifyRequest,
    db: Session = Depends(get_db),
    current_user: user_models.User = Depends(dependencies.get_current_user),
):
    if current_user.type != user_models.UserRole.MASTER and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Sem permissão para gerenciar o domínio B2C desta empresa")

    company = db.query(company_models.Company).filter(company_models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada")

    raw_domain = (payload.domain or getattr(company, "b2c_custom_domain", "") or "").strip().lower()
    clean_host = raw_domain.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0].strip()
    if not clean_host:
        raise HTTPException(status_code=400, detail="Informe o domínio próprio B2C para verificar (ex: parceiro.movimentoliterario.com.br).")

    if payload.auto_save and getattr(company, "b2c_custom_domain", None) != clean_host:
        company.b2c_custom_domain = clean_host
        db.commit()
        db.refresh(company)

    import socket
    import os
    from app.core.ssl_authors import ensure_custom_b2c_domain_ssl, is_production_ssl_available

    expected_ip = "64.23.182.183"
    resolved_ips = []
    cname_target = None
    try:
        hostname_alias, aliaslist, ipaddrlist = socket.gethostbyname_ex(clean_host)
        resolved_ips = list(set(ipaddrlist or []))
        if hostname_alias and hostname_alias.lower() != clean_host:
            cname_target = hostname_alias.lower()
    except Exception:
        resolved_ips = []

    dns_propagated = expected_ip in resolved_ips
    ssl_active = False
    ssl_message = ""

    if dns_propagated:
        if is_production_ssl_available():
            ssl_ok = ensure_custom_b2c_domain_ssl(clean_host)
            cert_file = f"/etc/letsencrypt/live/{clean_host}/fullchain.pem"
            ssl_active = bool(ssl_ok or os.path.exists(cert_file))
            ssl_message = (
                f"DNS propagado para {expected_ip} e certificado HTTPS Let's Encrypt ativo!"
                if ssl_active
                else f"DNS propagado para {expected_ip}. Certificado SSL em ativação."
            )
        else:
            ssl_active = True
            ssl_message = f"DNS propagado para {expected_ip}! (Em produção o SSL Let's Encrypt é ativado automaticamente)."
    else:
        if resolved_ips:
            ssl_message = (
                f"O domínio {clean_host} está apontando para {', '.join(resolved_ips)}, "
                f"mas deve apontar para {expected_ip}."
            )
        else:
            ssl_message = (
                f"Ainda não propagado (NXDOMAIN). Verifique se o nome do subdomínio está idêntico no Registro.br "
                f"e aguarde de 15 a 30 minutos após salvar a zona."
            )

    return {
        "domain": clean_host,
        "dns_propagated": dns_propagated,
        "resolved_ips": resolved_ips,
        "cname_target": cname_target,
        "expected_ip": expected_ip,
        "ssl_active": ssl_active,
        "https_url": f"https://{clean_host}",
        "message": ssl_message,
    }
