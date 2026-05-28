from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
import re
from datetime import datetime, timedelta

from app.integrators.horus import HorusClient, HorusConfigurationError

from app.db.session import get_db
from app.models.user import User
from app.core.dependencies import get_current_user
from app.models.bookinfo_supplier import BookinfoSupplier
from app.schemas.bookinfo_supplier import SupplierCreate, SupplierUpdate, SupplierResponse

router = APIRouter(prefix="/bookinfo-purchases/suppliers", tags=["bookinfo_purchases"])

@router.get("", response_model=List[SupplierResponse])
def get_suppliers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")
    
    suppliers = db.query(BookinfoSupplier).filter(BookinfoSupplier.company_id == current_user.company_id).all()
    return suppliers

@router.post("", response_model=SupplierResponse)
def create_supplier(
    supplier_in: SupplierCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")

    doc_origin_clean = re.sub(r"\D", "", supplier_in.document_origin) if supplier_in.document_origin else None
    doc_dest_clean = re.sub(r"\D", "", supplier_in.document_destination) if supplier_in.document_destination else None

    # Check for duplicate CNPJ Destino within same company/seller
    if doc_dest_clean:
        existing = db.query(BookinfoSupplier).filter(
            BookinfoSupplier.company_id == current_user.company_id,
            BookinfoSupplier.document_destination == doc_dest_clean
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="O CNPJ de Destino já está cadastrado para este seller."
            )

    new_supplier = BookinfoSupplier(
        company_id=current_user.company_id,
        supplier_name=supplier_in.supplier_name,
        document_origin=doc_origin_clean,
        document_destination=doc_dest_clean,
        start_date=supplier_in.start_date,
        status_pedido_compra=supplier_in.status_pedido_compra,
        integrador_compra=supplier_in.integrador_compra
    )
    db.add(new_supplier)
    db.commit()
    db.refresh(new_supplier)
    return new_supplier

@router.put("/{supplier_id}", response_model=SupplierResponse)
def update_supplier(
    supplier_id: int,
    supplier_in: SupplierUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")

    supplier = db.query(BookinfoSupplier).filter(
        BookinfoSupplier.id == supplier_id,
        BookinfoSupplier.company_id == current_user.company_id
    ).first()

    if not supplier:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")

    if supplier_in.supplier_name is not None:
        supplier.supplier_name = supplier_in.supplier_name
    if supplier_in.document_origin is not None:
        supplier.document_origin = re.sub(r"\D", "", supplier_in.document_origin) if supplier_in.document_origin else None
    if supplier_in.document_destination is not None:
        doc_dest_clean = re.sub(r"\D", "", supplier_in.document_destination) if supplier_in.document_destination else None
        
        # Check duplicate CNPJ Destino within same company/seller
        if doc_dest_clean:
            existing = db.query(BookinfoSupplier).filter(
                BookinfoSupplier.company_id == current_user.company_id,
                BookinfoSupplier.document_destination == doc_dest_clean,
                BookinfoSupplier.id != supplier_id
            ).first()
            if existing:
                raise HTTPException(
                    status_code=400,
                    detail="O CNPJ de Destino já está cadastrado para este seller."
                )
        supplier.document_destination = doc_dest_clean
    if supplier_in.start_date is not None:
        supplier.start_date = supplier_in.start_date
    if supplier_in.status_pedido_compra is not None:
        supplier.status_pedido_compra = supplier_in.status_pedido_compra
    if supplier_in.integrador_compra is not None:
        supplier.integrador_compra = supplier_in.integrador_compra

    db.commit()
    db.refresh(supplier)
    return supplier

@router.delete("/{supplier_id}", response_model=dict)
def delete_supplier(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")

    supplier = db.query(BookinfoSupplier).filter(
        BookinfoSupplier.id == supplier_id,
        BookinfoSupplier.company_id == current_user.company_id
    ).first()

    if not supplier:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")

    db.delete(supplier)
    db.commit()
    return {"status": "success", "message": "Fornecedor deletado."}

@router.post("/{supplier_id}/search-horus")
async def search_horus_orders(
    supplier_id: int,
    data_ini: Optional[str] = None,
    data_fim: Optional[str] = None,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")

    supplier = db.query(BookinfoSupplier).filter(
        BookinfoSupplier.id == supplier_id,
        BookinfoSupplier.company_id == current_user.company_id
    ).first()

    if not supplier:
        raise HTTPException(status_code=404, detail="Fornecedor não encontrado.")

    if not supplier.document_origin or not supplier.document_destination:
        raise HTTPException(
            status_code=400,
            detail="O fornecedor precisa ter o CNPJ Emissor (Fabricante) e o CNPJ Destino (Vínculo) cadastrados para buscar no Horus."
        )

    now = datetime.now()
    
    def parse_input_date(date_str: str) -> datetime:
        for fmt in ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
            try:
                return datetime.strptime(date_str, fmt)
            except ValueError:
                continue
        try:
            return datetime.strptime(date_str, "%d/%m/%Y %H:%M:%S")
        except ValueError:
            pass
        raise ValueError(f"Formato de data inválido: {date_str}")

    try:
        if data_fim:
            dt_fim = parse_input_date(data_fim)
        else:
            dt_fim = now

        if data_ini:
            dt_ini = parse_input_date(data_ini)
        else:
            if supplier.last_sync_at:
                dt_ini = supplier.last_sync_at
            elif supplier.start_date:
                dt_ini = supplier.start_date
            else:
                dt_ini = now - timedelta(days=30)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    horus_data_ini = dt_ini.strftime("%d/%m/%Y %H:%M:%S")
    horus_data_fim = dt_fim.strftime("%d/%m/%Y %H:%M:%S")

    cnpj_origem = re.sub(r"\D", "", supplier.document_destination)
    cnpj_destino_clean = re.sub(r"\D", "", supplier.document_origin)
    
    # Format CNPJ_DESTINO with mask (since the example shows it masked)
    cnpj_destino_masked = cnpj_destino_clean
    if len(cnpj_destino_clean) == 14:
        cnpj_destino_masked = f"{cnpj_destino_clean[:2]}.{cnpj_destino_clean[2:5]}.{cnpj_destino_clean[5:8]}/{cnpj_destino_clean[8:12]}-{cnpj_destino_clean[12:]}"

    integrador = supplier.integrador_compra or "HORUS"
    status_filtro = status or supplier.status_pedido_compra or "AE"

    params = {
        "INTEGRADOR_COMPRA": integrador,
        "STATUS_PEDIDO_COMPRA": status_filtro,
        "DATA_INI": horus_data_ini,
        "DATA_FIM": horus_data_fim,
        "CNPJ_ORIGEM": cnpj_origem,
        "CNPJ_DESTINO": cnpj_destino_masked
    }

    try:
        client = HorusClient(db, current_user.company_id)
    except HorusConfigurationError as e:
        raise HTTPException(status_code=400, detail=f"Erro de Configuração do Horus: {str(e)}")

    if not getattr(client._settings, 'horus_legacy_pagination', False):
        params["OFFSET"] = 0
        params["LIMIT"] = 10000

    try:
        result = await client.get("Busca_PedidosCompra", params=params)
        
        if result and isinstance(result, list) and len(result) > 0:
            first_item = result[0]
            if isinstance(first_item, dict) and first_item.get("Falha"):
                raise Exception(first_item.get("Mensagem", "Falha desconhecida na API Horus"))
        elif isinstance(result, dict) and result.get("Falha"):
            raise Exception(result.get("Mensagem", "Falha desconhecida na API Horus"))
            
        supplier.last_sync_at = dt_fim
        db.commit()
        
        return {
            "status": "success",
            "data_ini_usada": horus_data_ini,
            "data_fim_usada": horus_data_fim,
            "pedidos": result or []
        }
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Erro ao consultar Horus: {str(e)}"
        )
    finally:
        await client.close()
