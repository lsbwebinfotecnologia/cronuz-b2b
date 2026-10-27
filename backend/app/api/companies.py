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
    for field in ["custom_domain", "login_background_url", "logo", "zip_code", "street", "number", "complement", "neighborhood", "city", "state"]:
        if field in update_data and update_data[field] == "":
            update_data[field] = None
            
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
            "module_cora",
            "modulo_autores_ativo",
            "has_inventory_module",
        ]
        for mod in MASTER_ONLY_MODULES:
            update_data.pop(mod, None)

    for key, value in update_data.items():
        setattr(company, key, value)
    
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
    update_data = settings_update.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)
        
    db.commit()
    db.refresh(settings)
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
