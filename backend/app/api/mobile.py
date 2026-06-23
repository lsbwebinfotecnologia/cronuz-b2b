from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.db.session import get_db
from app.models.company import Company
from app.models.user import User
from app.core.dependencies import get_current_user

router = APIRouter()

DEFAULT_MODULES = {
    "app_enabled": False,
    "pdv": False,
    "conferencia": False,
    "vendas": False,
    "pedidos": False,
    "catalogo": False,
    "clientes": False
}


class MobileModulesUpdate(BaseModel):
    app_enabled: Optional[bool] = None
    pdv: Optional[bool] = None
    conferencia: Optional[bool] = None
    vendas: Optional[bool] = None
    pedidos: Optional[bool] = None
    catalogo: Optional[bool] = None
    clientes: Optional[bool] = None


@router.get("/mobile/modules/{company_id}")
def get_seller_mobile_modules(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retorna os módulos mobile ativos de um seller.
    Acesso: MASTER ou o próprio SELLER.
    """
    if current_user.type == "SELLER" and current_user.company_id != company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado.")

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    modules = dict(company.mobile_modules or {})
    # Garante que app_enabled existe no retorno
    for key, default in DEFAULT_MODULES.items():
        modules.setdefault(key, default)

    return {"company_id": company_id, "modules": modules}


@router.put("/mobile/modules/{company_id}")
def update_seller_mobile_modules(
    company_id: int,
    payload: MobileModulesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Atualiza os módulos mobile de um seller.
    Acesso: apenas MASTER.

    Regra: se app_enabled=False, desativa todos os módulos automaticamente.
    """
    if current_user.type != "MASTER":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas o Master pode alterar módulos."
        )

    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não encontrada.")

    current_modules = dict(company.mobile_modules or DEFAULT_MODULES)
    # Garante que todos os campos existem
    for key, default in DEFAULT_MODULES.items():
        current_modules.setdefault(key, default)

    updates = payload.model_dump(exclude_none=True)

    # Regra de negócio: desativar app_enabled desativa todos os módulos
    if updates.get("app_enabled") is False:
        current_modules = {k: False for k in DEFAULT_MODULES}
    else:
        current_modules.update(updates)

    company.mobile_modules = current_modules
    db.commit()
    db.refresh(company)

    return {
        "message": "Módulos atualizados com sucesso.",
        "company_id": company_id,
        "modules": company.mobile_modules
    }
