from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import re
from datetime import datetime, timedelta
from pydantic import BaseModel

from app.integrators.horus import HorusClient, HorusConfigurationError

from app.db.session import get_db
from app.models.user import User
from app.core.dependencies import get_current_user
from app.models.bookinfo_supplier import BookinfoSupplier
from app.schemas.bookinfo_supplier import SupplierCreate, SupplierUpdate, SupplierResponse
from app.models.bookinfo_transmission import BookinfoTransmission, BookinfoTransmissionItem
from app.api.bookinfo_hub import get_bookinfo_client
from app.integrators.horus_orders import HorusOrders

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

    # Check for duplicate combination of CNPJ Destino + CNPJ Emissor within same company/seller
    if doc_dest_clean and doc_origin_clean:
        existing = db.query(BookinfoSupplier).filter(
            BookinfoSupplier.company_id == current_user.company_id,
            BookinfoSupplier.document_destination == doc_dest_clean,
            BookinfoSupplier.document_origin == doc_origin_clean
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="O CNPJ de Destino com este Emissor já está cadastrado para este seller."
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
    new_doc_origin = supplier.document_origin
    if supplier_in.document_origin is not None:
        new_doc_origin = re.sub(r"\D", "", supplier_in.document_origin) if supplier_in.document_origin else None

    new_doc_dest = supplier.document_destination
    if supplier_in.document_destination is not None:
        new_doc_dest = re.sub(r"\D", "", supplier_in.document_destination) if supplier_in.document_destination else None

    # Check for duplicate combination of CNPJ Destino + CNPJ Emissor within same company/seller
    if new_doc_dest and new_doc_origin:
        existing = db.query(BookinfoSupplier).filter(
            BookinfoSupplier.company_id == current_user.company_id,
            BookinfoSupplier.document_destination == new_doc_dest,
            BookinfoSupplier.document_origin == new_doc_origin,
            BookinfoSupplier.id != supplier_id
        ).first()
        if existing:
            raise HTTPException(
                status_code=400,
                detail="O CNPJ de Destino com este Emissor já está cadastrado para este seller."
            )

    supplier.document_origin = new_doc_origin
    supplier.document_destination = new_doc_dest
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
    transmitido: Optional[str] = "N",
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
    if transmitido in ["S", "N"]:
        params["TRANSMITIDO"] = transmitido

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


class SendTransmissionRequest(BaseModel):
    cod_pedido: int
    order_data: Dict[str, Any]


@router.get("/{supplier_id}/transmissions")
def list_transmissions(
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")

    transmissions = db.query(BookinfoTransmission).filter(
        BookinfoTransmission.supplier_id == supplier_id,
        BookinfoTransmission.company_id == current_user.company_id
    ).order_by(BookinfoTransmission.created_at.desc()).all()

    result = []
    for t in transmissions:
        items = db.query(BookinfoTransmissionItem).filter(BookinfoTransmissionItem.transmission_id == t.id).all()
        result.append({
            "id": t.id,
            "cod_pedido": t.cod_pedido,
            "bookinfo_pedido_id": t.bookinfo_pedido_id,
            "status": t.status,
            "sent_at": t.sent_at.isoformat() if t.sent_at else None,
            "last_sync_at": t.last_sync_at.isoformat() if t.last_sync_at else None,
            "error_message": t.error_message,
            "items": [
                {
                    "id": item.id,
                    "cod_item": item.cod_item,
                    "cod_barra": item.cod_barra,
                    "nom_item": item.nom_item,
                    "qt_pedida": item.qt_pedida,
                    "situacao_retorno": item.situacao_retorno,
                    "obs_item": item.obs_item
                }
                for item in items
            ]
        })
    return result


@router.post("/{supplier_id}/transmissions/send")
async def send_transmission(
    supplier_id: int,
    req_body: SendTransmissionRequest,
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

    cod_pedido = req_body.cod_pedido
    order_data = req_body.order_data

    # Validate COMPRA_CONSIG to only allow 'N' or 'S'
    compra_consig_val = str(order_data.get("COMPRA_CONSIG") or "").strip().upper()
    if compra_consig_val not in ["N", "S"]:
        raise HTTPException(
            status_code=400,
            detail=f"O pedido não é uma compra normal (N) nem uma consignação (S) no Horus (COMPRA_CONSIG={compra_consig_val or 'vazio'})."
        )

    # Check duplicate SENT transmissions to prevent duplicate posting
    existing = db.query(BookinfoTransmission).filter(
        BookinfoTransmission.company_id == current_user.company_id,
        BookinfoTransmission.supplier_id == supplier_id,
        BookinfoTransmission.cod_pedido == cod_pedido,
        BookinfoTransmission.status == "SENT"
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Este pedido já foi enviado para a Bookinfo.")

    dest_list = order_data.get("DADOS_CADASTRAIS_DESTINO", [])
    if not dest_list:
        raise HTTPException(status_code=400, detail="DADOS_CADASTRAIS_DESTINO ausente no pedido.")
    dest = dest_list[0]

    cnpj_cliente = re.sub(r"\D", "", order_data.get("CNPJ_ORIGEM", ""))
    cnpj_empresa = re.sub(r"\D", "", order_data.get("CNPJ_DESTINO", ""))

    if not cnpj_cliente or not cnpj_empresa:
        raise HTTPException(status_code=400, detail="CNPJ do cliente ou da empresa ausente.")

    def to_float(val: Any) -> float:
        if not val:
            return 0.0
        if isinstance(val, (int, float)):
            return float(val)
        val_str = str(val).replace(".", "").replace(",", ".")
        try:
            return float(val_str)
        except ValueError:
            return 0.0

    itens_payload = []
    for item in order_data.get("ITENS", []):
        isbn = item.get("COD_BARRA_ITEM") or item.get("COD_BARRA_ITEM_ALT") or ""
        qtd = int(item.get("QT_PEDIDA") or 0)
        desc = to_float(item.get("PERC_DESCONTO", 0.0))
        preco = to_float(item.get("VLR_PRECO", 0.0))
        
        itens_payload.append({
            "qtd": qtd,
            "isbn13": isbn,
            "desconto_negociado": desc,
            "preco_capa": preco
        })

    compra_consig = "S" if compra_consig_val == "S" else "C"

    bookinfo_payload = {
        "formatoEncomenda": "MODELO_1",
        "payload": {
            "cnpj_cliente": cnpj_cliente,
            "cnpj_empresa": cnpj_empresa,
            "obs_pedido": order_data.get("OBS", ""),
            "obs_nota_fiscal": "",
            "pedido_cliente": str(cod_pedido),
            "metodo_pagamento": "DEPOSITO_A_VISTA",
            "condicao_pagamento_id": None,
            "compra_consignacao": compra_consig,
            "tipo_frete": "CIF",
            "atender_parcial": True,
            "itens": itens_payload
        }
    }

    # Post to Bookinfo API
    async with get_bookinfo_client(current_user.company_id, db) as client:
        try:
            response = await client.post("/pedido", json=bookinfo_payload, timeout=25.0)
            if response.status_code not in [200, 201]:
                raise Exception(f"Erro Bookinfo ({response.status_code}): {response.text}")
            
            bookinfo_res = response.json()
            bookinfo_pedido_id = bookinfo_res.get("id")
        except Exception as e:
            # Persist failed transmission as ERROR status
            transmission = BookinfoTransmission(
                company_id=current_user.company_id,
                supplier_id=supplier_id,
                cod_pedido=cod_pedido,
                status="ERROR",
                horus_cod_empresa=int(dest.get("COD_EMPRESA", 1)),
                horus_cod_filial=int(dest.get("COD_FILIAL", 1)),
                horus_cod_fornecedor=int(dest.get("COD_FORNECEDOR", 1)),
                horus_cod_grp_fornecedor=int(dest.get("COD_GRP_FORNECEDOR", 1)),
                error_message=str(e),
                created_at=datetime.utcnow()
            )
            db.add(transmission)
            db.commit()
            raise HTTPException(status_code=502, detail=f"Erro ao enviar pedido para Bookinfo: {str(e)}")

    # Succeeded - persist SENT transmission
    transmission = BookinfoTransmission(
        company_id=current_user.company_id,
        supplier_id=supplier_id,
        cod_pedido=cod_pedido,
        bookinfo_pedido_id=bookinfo_pedido_id,
        status="SENT",
        horus_cod_empresa=int(dest.get("COD_EMPRESA", 1)),
        horus_cod_filial=int(dest.get("COD_FILIAL", 1)),
        horus_cod_fornecedor=int(dest.get("COD_FORNECEDOR", 1)),
        horus_cod_grp_fornecedor=int(dest.get("COD_GRP_FORNECEDOR", 1)),
        sent_at=datetime.utcnow(),
        created_at=datetime.utcnow()
    )
    db.add(transmission)
    db.commit()
    db.refresh(transmission)

    # Persist items
    for item in order_data.get("ITENS", []):
        isbn = item.get("COD_BARRA_ITEM") or item.get("COD_BARRA_ITEM_ALT") or ""
        qtd = int(item.get("QT_PEDIDA") or 0)
        t_item = BookinfoTransmissionItem(
            transmission_id=transmission.id,
            cod_item=int(item.get("COD_ITEM")),
            cod_barra=isbn,
            nom_item=item.get("NOM_ITEM", "Livro Genérico"),
            qt_pedida=qtd,
            situacao_envio="PENDING"
        )
        db.add(t_item)
    db.commit()

    # Mark TRANSMITIDO = 'S' on Horus
    try:
        horus_client = HorusOrders(db, current_user.company_id)
        await horus_client.sta_transmitido_pedido_compra(
            cod_empresa=transmission.horus_cod_empresa,
            cod_filial=transmission.horus_cod_filial,
            cod_fornecedor=transmission.horus_cod_fornecedor,
            cod_grp_fornecedor=transmission.horus_cod_grp_fornecedor,
            cod_pedido=transmission.cod_pedido,
            transmitido="S"
        )
        await horus_client.close()
    except Exception as he:
        return {
            "status": "partial",
            "message": f"Pedido enviado para Bookinfo ({bookinfo_pedido_id}), mas falhou ao marcar TRANSMITIDO=S no Horus: {str(he)}",
            "transmission_id": transmission.id
        }

    return {
        "status": "success",
        "message": "Pedido enviado para Bookinfo com sucesso e marcado como transmitido no Horus.",
        "transmission_id": transmission.id,
        "bookinfo_pedido_id": bookinfo_pedido_id
    }


@router.post("/{supplier_id}/transmissions/{transmission_id}/sync")
async def sync_transmission(
    supplier_id: int,
    transmission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["MASTER", "SELLER"]:
        raise HTTPException(status_code=403, detail="Acesso não autorizado")

    transmission = db.query(BookinfoTransmission).filter(
        BookinfoTransmission.id == transmission_id,
        BookinfoTransmission.company_id == current_user.company_id,
        BookinfoTransmission.supplier_id == supplier_id
    ).first()

    if not transmission:
        raise HTTPException(status_code=404, detail="Transmissão não encontrada.")

    if not transmission.bookinfo_pedido_id:
        raise HTTPException(status_code=400, detail="Esta transmissão não possui ID Bookinfo válido para sincronizar.")

    async with get_bookinfo_client(current_user.company_id, db) as client:
        try:
            response = await client.get(f"/pedido/{transmission.bookinfo_pedido_id}", timeout=25.0)
            if response.status_code != 200:
                raise Exception(f"Erro Bookinfo ao buscar detalhes ({response.status_code}): {response.text}")
            
            bookinfo_data = response.json()
        except Exception as e:
            transmission.status = "ERROR"
            transmission.error_message = f"Erro de sincronização: {str(e)}"
            db.commit()
            raise HTTPException(status_code=502, detail=f"Erro ao consultar Bookinfo: {str(e)}")

    # Update items
    bookinfo_items = bookinfo_data.get("itens", [])
    items_map = {}
    for bi_item in bookinfo_items:
        isbn = bi_item.get("isbn13")
        if isbn:
            items_map[isbn] = bi_item

    local_items = db.query(BookinfoTransmissionItem).filter(
        BookinfoTransmissionItem.transmission_id == transmission.id
    ).all()

    horus_errors = []
    horus_client = None

    try:
        horus_client = HorusOrders(db, current_user.company_id)
    except Exception as he:
        horus_errors.append(f"Erro ao instanciar Horus client: {str(he)}")

    for t_item in local_items:
        bi_item = items_map.get(t_item.cod_barra)
        if bi_item:
            status_item = bi_item.get("status")
            t_item.situacao_retorno = status_item
            t_item.obs_item = f"Bookinfo: {status_item}" if status_item else "Sem status"
            t_item.synced_at = datetime.utcnow()
            
            if horus_client and status_item:
                try:
                    await horus_client.obs_item_pedido_compra(
                        cod_empresa=transmission.horus_cod_empresa,
                        cod_filial=transmission.horus_cod_filial,
                        cod_fornecedor=transmission.horus_cod_fornecedor,
                        cod_grp_fornecedor=transmission.horus_cod_grp_fornecedor,
                        cod_pedido=transmission.cod_pedido,
                        cod_item=t_item.cod_item,
                        obs_item=t_item.obs_item
                    )
                except Exception as e:
                    horus_errors.append(f"Item {t_item.cod_barra}: {str(e)}")

    if horus_client:
        await horus_client.close()

    transmission.last_sync_at = datetime.utcnow()
    transmission.status = "SYNCED"
    transmission.error_message = None
    db.commit()

    if horus_errors:
        return {
            "status": "partial",
            "message": "Sincronizado com a Bookinfo, mas falhou ao atualizar observações do Horus para alguns itens.",
            "errors": horus_errors
        }

    return {
        "status": "success",
        "message": "Transmissão sincronizada com a Bookinfo e observações gravadas no Horus com sucesso."
    }

