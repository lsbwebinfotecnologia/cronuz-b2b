from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.company_settings import CompanySettings
from app.models.horus_bi_sale import HorusBISale
from app.integrators.horus_bi_client import HorusBIClient
from app.core.cfop_utils import sanitize_cfop

router = APIRouter(prefix="/horus/bi", tags=["horus-bi"])


class HorusBISettingsUpdate(BaseModel):
    sales_cfops: Optional[str] = None
    consign_cfops: Optional[str] = None
    dev_sales_cfops: Optional[str] = None
    dev_consign_cfops: Optional[str] = None
    horus_bi_sync_enabled: Optional[bool] = None


@router.get("/status")
async def get_bi_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retorna o status da sincronização de BI, contagem local e parâmetros do Horus.
    """
    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == current_user.company_id
    ).first()

    if not settings:
        raise HTTPException(status_code=404, detail="Configurações não encontradas.")

    # Total de registros locais
    local_count = db.query(func.count(HorusBISale.id)).filter(
        HorusBISale.company_id == current_user.company_id
    ).scalar() or 0

    last_synced = db.query(func.max(HorusBISale.synced_at)).filter(
        HorusBISale.company_id == current_user.company_id
    ).scalar()

    # Tenta consultar totalizadores remotos se habilitado
    remote_params = {}
    if settings.horus_enabled and settings.horus_url:
        try:
            client = HorusBIClient(db, current_user.company_id)
            remote_params = await client.get_parameters()
        except Exception as e:
            remote_params = {"error": str(e)}

    return {
        "company_id": current_user.company_id,
        "horus_bi_sync_enabled": getattr(settings, "horus_bi_sync_enabled", False),
        "local_records_count": local_count,
        "last_synced_at": last_synced,
        "cfop_rules": {
            "sales_cfops": settings.sales_cfops,
            "consign_cfops": settings.consign_cfops,
            "dev_sales_cfops": settings.dev_sales_cfops,
            "dev_consign_cfops": settings.dev_consign_cfops,
        },
        "remote_horus_parameters": remote_params
    }


@router.put("/settings")
def update_bi_settings(
    payload: HorusBISettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Atualiza as configurações de CFOPs e a ativação do job de sincronização de BI por seller.
    """
    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == current_user.company_id
    ).first()

    if not settings:
        raise HTTPException(status_code=404, detail="Configurações não encontradas.")

    if payload.sales_cfops is not None:
        settings.sales_cfops = payload.sales_cfops
    if payload.consign_cfops is not None:
        settings.consign_cfops = payload.consign_cfops
    if payload.dev_sales_cfops is not None:
        settings.dev_sales_cfops = payload.dev_sales_cfops
    if payload.dev_consign_cfops is not None:
        settings.dev_consign_cfops = payload.dev_consign_cfops
    if payload.horus_bi_sync_enabled is not None:
        settings.horus_bi_sync_enabled = payload.horus_bi_sync_enabled

    db.commit()
    db.refresh(settings)

    return {
        "success": True,
        "message": "Configurações de regras fiscais e BI atualizadas com sucesso.",
        "horus_bi_sync_enabled": settings.horus_bi_sync_enabled,
        "sales_cfops": settings.sales_cfops,
        "consign_cfops": settings.consign_cfops
    }


@router.post("/sync")
async def trigger_bi_sync(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Dispara a sincronização de vendas do BI em background para a empresa autenticada.
    """
    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == current_user.company_id
    ).first()

    if not settings or not settings.horus_enabled:
        raise HTTPException(status_code=400, detail="Integração Horus ERP não está habilitada.")

    if not getattr(settings, "horus_bi_sync_enabled", False):
        raise HTTPException(
            status_code=403, 
            detail="A rotina de sincronização de BI está desativada para este seller nas configurações."
        )

    client = HorusBIClient(db, current_user.company_id)
    # Executa a primeira leva de forma síncrona/imediata para dar feedback ao usuário
    res = await client.sync_sales_incremental(max_pages=5)

    return {
        "success": True,
        "message": "Sincronização iniciada com sucesso.",
        "result": res
    }
