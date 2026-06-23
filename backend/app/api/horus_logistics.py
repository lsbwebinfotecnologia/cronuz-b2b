from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
import uuid

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.customer import Customer
from app.models.seller_branch import SellerBranch
from app.models.order_conference import OrderConference, OrderConferenceVolume, OrderConferenceVolumeItem
from app.schemas.seller_branch import SellerBranchCreate, SellerBranchUpdate, SellerBranchResponse
from app.schemas.order_conference import (
    OrderConferenceResponse, 
    OrderConferenceStartRequest, 
    OrderConferenceItemSubmitRequest,
    OrderConferenceVolumeResponse
)
from app.integrators.horus_logistics import HorusLogisticsClient

router = APIRouter()

# ==============================================================================
# SELLER BRANCH CRUD ENDPOINTS
# ==============================================================================

@router.get("/branches", response_model=List[SellerBranchResponse])
def get_branches(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all active branches for the seller's company.
    """
    return db.query(SellerBranch).filter(
        SellerBranch.company_id == current_user.company_id,
        SellerBranch.active == True
    ).all()

@router.post("/branches", response_model=SellerBranchResponse)
def create_branch(
    branch_in: SellerBranchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new seller branch.
    """
    new_branch = SellerBranch(
        company_id=current_user.company_id,
        nome=branch_in.nome,
        cnpj=branch_in.cnpj,
        cod_empresa=branch_in.cod_empresa,
        cod_filial=branch_in.cod_filial,
        active=branch_in.active
    )
    db.add(new_branch)
    db.commit()
    db.refresh(new_branch)
    return new_branch

@router.put("/branches/{branch_id}", response_model=SellerBranchResponse)
def update_branch(
    branch_id: int,
    branch_in: SellerBranchUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update seller branch details.
    """
    branch = db.query(SellerBranch).filter(
        SellerBranch.id == branch_id,
        SellerBranch.company_id == current_user.company_id
    ).first()
    
    if not branch:
        raise HTTPException(status_code=404, detail="Filial não encontrada")
        
    update_data = branch_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(branch, field, value)
        
    db.commit()
    db.refresh(branch)
    return branch

@router.delete("/branches/{branch_id}")
def delete_branch(
    branch_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Soft-delete a seller branch.
    """
    branch = db.query(SellerBranch).filter(
        SellerBranch.id == branch_id,
        SellerBranch.company_id == current_user.company_id
    ).first()
    
    if not branch:
        raise HTTPException(status_code=404, detail="Filial não encontrada")
        
    branch.active = False
    db.commit()
    return {"status": "success", "message": "Filial desativada com sucesso."}


# ==============================================================================
# ORDER CONFERENCE ENDPOINTS
# ==============================================================================

@router.get("/orders/search")
async def search_order_for_conference(
    branch_id: int,
    cod_cli: str,
    cod_pedido_origem: str,
    conference_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Search for a sales order in Horus ERP and check local conference state.
    """
    # 1. Validate Company Module
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    if not company or not company.module_logistica_horus:
        raise HTTPException(status_code=400, detail="Módulo Logística Horus não está ativo nesta empresa.")
        
    # 2. Validate Branch
    branch = db.query(SellerBranch).filter(
        SellerBranch.id == branch_id,
        SellerBranch.company_id == current_user.company_id,
        SellerBranch.active == True
    ).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Filial selecionada é inválida ou inativa.")
        
    # 3. Check for existing local conference
    local_conf = None
    if conference_id:
        local_conf = db.query(OrderConference).filter(
            OrderConference.id == conference_id,
            OrderConference.company_id == current_user.company_id
        ).first()
        
    if not local_conf:
        # Flexible match (trim leading zeros)
        clean_cod_cli = cod_cli.lstrip('0')
        clean_order = cod_pedido_origem.lstrip('0')
        
        # Try exact match first
        local_conf = db.query(OrderConference).filter(
            OrderConference.company_id == current_user.company_id,
            OrderConference.branch_id == branch_id,
            OrderConference.cod_cli == cod_cli,
            OrderConference.cod_pedido_origem == cod_pedido_origem
        ).first()
        
        # Fallback to flexible match
        if not local_conf:
            local_conf = db.query(OrderConference).filter(
                OrderConference.company_id == current_user.company_id,
                OrderConference.branch_id == branch_id,
                func.ltrim(OrderConference.cod_pedido_origem, '0') == clean_order,
                func.ltrim(OrderConference.cod_cli, '0') == clean_cod_cli
            ).first()
    
    # 4. Query Horus ERP for the order details
    order_data = None
    horus_items = []
    cod_ped_venda = local_conf.cod_ped_venda if local_conf else None

    try:
        horus_client = HorusLogisticsClient(db, current_user.company_id)
        try:
            # Search sales order
            order_res = await horus_client.search_orders(
                cod_empresa=branch.cod_empresa,
                cod_filial=branch.cod_filial,
                cod_cli=cod_cli,
                cod_pedido_origem=cod_pedido_origem
            )
            
            if not order_res or (isinstance(order_res, list) and len(order_res) == 0):
                if not local_conf:
                    await horus_client.close()
                    raise HTTPException(status_code=404, detail="Pedido não localizado no Horus ERP.")
            else:
                order_data = order_res[0] if isinstance(order_res, list) else order_res
                if order_data.get("Falha") or order_data.get("FALHA") == "S":
                    if not local_conf:
                        await horus_client.close()
                        raise HTTPException(status_code=400, detail=order_data.get("Mensagem", "Erro ao buscar pedido no Horus."))
                    else:
                        order_data = None
                
                if order_data:
                    # 5. Check order status (must be LEX) - ONLY when opening new conference
                    status_pedido = order_data.get("STATUS_PEDIDO_VENDA", "").strip()
                    if status_pedido != "LEX" and not local_conf:
                        await horus_client.close()
                        raise HTTPException(
                            status_code=400, 
                            detail=f"Pedido não está com status de expedição (LEX). Status atual: {status_pedido}."
                        )
                        
                    # 6. Fetch items from Horus
                    cod_ped_venda_api = order_data.get("COD_PED_VENDA")
                    if not cod_ped_venda_api and not local_conf:
                        await horus_client.close()
                        raise HTTPException(status_code=400, detail="Código do pedido de venda (COD_PED_VENDA) ausente no Horus.")
                    
                    if cod_ped_venda_api:
                        cod_ped_venda = str(cod_ped_venda_api)
                        items_res = await horus_client.get_order_items(
                            cod_ped_venda=cod_ped_venda,
                            cod_empresa=branch.cod_empresa,
                            cod_filial=branch.cod_filial
                        )
                        
                        horus_items = items_res if isinstance(items_res, list) else []
                        if isinstance(items_res, dict) and "itens" in items_res:
                            horus_items = items_res["itens"]
                            
                        # Normalize items list (filter out failures)
                        horus_items = [i for i in horus_items if not i.get("Falha") and not i.get("FALHA")]
            
            await horus_client.close()
        except HTTPException:
            if not local_conf:
                raise
        except Exception as e:
            if not local_conf:
                raise HTTPException(status_code=500, detail=f"Erro de comunicação com o Horus: {str(e)}")
            else:
                print(f"Bypassed Horus communication error for existing conference: {e}")
    except Exception as e:
        if not local_conf:
            raise HTTPException(status_code=400, detail=f"Erro de configuração do Horus: {str(e)}")
        else:
            print(f"Bypassed Horus client creation error for existing conference: {e}")

    # 7. Create/Retrieve local session automatically
    if not local_conf:
        local_conf = OrderConference(
            company_id=current_user.company_id,
            branch_id=branch_id,
            cod_cli=cod_cli,
            cod_pedido_origem=cod_pedido_origem,
            cod_ped_venda=str(cod_ped_venda) if cod_ped_venda else None,
            status="IN_PROGRESS"
        )
        db.add(local_conf)
        db.commit()
        db.refresh(local_conf)
    else:
        # Atualiza cod_ped_venda se estava vazio (sessão criada antes deste fix)
        if not local_conf.cod_ped_venda and cod_ped_venda:
            local_conf.cod_ped_venda = str(cod_ped_venda)
            db.commit()
            db.refresh(local_conf)
        
    return {
        "session": OrderConferenceResponse.model_validate(local_conf),
        "horus_order": order_data,
        "horus_items": horus_items
    }

@router.post("/orders/session/volume/open", response_model=OrderConferenceVolumeResponse)
def open_volume(
    payload: OrderConferenceStartRequest, # Reusing StartRequest containing branch/client/order context
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Open a new box/volume in the active conference session.
    """
    # 1. Find session
    session = db.query(OrderConference).filter(
        OrderConference.company_id == current_user.company_id,
        OrderConference.branch_id == payload.branch_id,
        OrderConference.cod_cli == payload.cod_cli,
        OrderConference.cod_pedido_origem == payload.cod_pedido_origem,
        OrderConference.status == "IN_PROGRESS"
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de conferência em andamento não localizada.")
        
    # Calculate next volume number
    existing_volumes_count = db.query(OrderConferenceVolume).filter(
        OrderConferenceVolume.conference_id == session.id
    ).count()
    next_vol = existing_volumes_count + 1
    
    # Generate unique barcode (e.g. V + session ID + vol number + random chars)
    random_str = uuid.uuid4().hex[:4].upper()
    barcode = f"V{session.id:04d}{next_vol:02d}{random_str}"
    
    new_vol = OrderConferenceVolume(
        conference_id=session.id,
        volume_number=next_vol,
        barcode=barcode
    )
    db.add(new_vol)
    db.commit()
    db.refresh(new_vol)
    return new_vol

@router.post("/orders/session/volume/item")
async def submit_item_conference(
    volume_id: int,
    item_in: OrderConferenceItemSubmitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Submit checked item to Horus ERP and store locally in the volume.
    """
    # 1. Retrieve Volume and Session
    volume = db.query(OrderConferenceVolume).filter(
        OrderConferenceVolume.id == volume_id
    ).first()
    
    if not volume:
        raise HTTPException(status_code=404, detail="Volume/Caixa não localizado.")
        
    session = db.query(OrderConference).filter(
        OrderConference.id == volume.conference_id,
        OrderConference.company_id == current_user.company_id,
        OrderConference.status == "IN_PROGRESS"
    ).first()
    
    if not session:
        raise HTTPException(status_code=400, detail="Sessão de conferência associada não está em andamento.")
        
    branch = db.query(SellerBranch).filter(SellerBranch.id == session.branch_id).first()
    company = db.query(Company).filter(Company.id == current_user.company_id).first()
    
    # 2. Get stock location from settings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == current_user.company_id).first()
    cod_local = settings.horus_stock_local if (settings and settings.horus_stock_local) else "1"

    # 3. Calculate cumulative quantity checked so far for this item across all volumes of the current session
    prev_qty = db.query(func.sum(OrderConferenceVolumeItem.quantity)).\
        join(OrderConferenceVolume, OrderConferenceVolume.id == OrderConferenceVolumeItem.volume_id).\
        filter(
            OrderConferenceVolume.conference_id == session.id,
            OrderConferenceVolume.status != "CANCELLED",
            OrderConferenceVolumeItem.isbn == item_in.isbn
        ).scalar() or 0
    
    qtd_total_atendida = prev_qty + item_in.quantity

    # 4. Call Horus ERP ConfereItem_Pedido API
    try:
        horus_client = HorusLogisticsClient(db, current_user.company_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro de configuração do Horus: {str(e)}")
        
    try:
        res = await horus_client.confere_item_pedido(
            cod_empresa=branch.cod_empresa,
            cod_filial=branch.cod_filial,
            cod_cli=session.cod_cli,
            cod_ped_venda=item_in.cod_ped_venda,
            cod_item=item_in.cod_item,
            cod_local=cod_local,
            qtd_atendida=qtd_total_atendida
        )
        await horus_client.close()
        
        # Check for Horus response failures
        if res and isinstance(res, list) and len(res) > 0:
            first = res[0]
            if first.get("Falha") or first.get("FALHA") == "S":
                raise HTTPException(status_code=400, detail=first.get("Mensagem", "Erro na conferência do item no Horus."))
        elif isinstance(res, dict) and (res.get("Falha") or res.get("FALHA") == "S"):
            raise HTTPException(status_code=400, detail=res.get("Mensagem", "Erro na conferência do item no Horus."))
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Falha de comunicação com o Horus: {str(e)}")
        
    # 4. Save item locally in the volume
    local_item = db.query(OrderConferenceVolumeItem).filter(
        OrderConferenceVolumeItem.volume_id == volume_id,
        OrderConferenceVolumeItem.isbn == item_in.isbn
    ).first()
    
    if local_item:
        local_item.quantity += item_in.quantity
    else:
        local_item = OrderConferenceVolumeItem(
            volume_id=volume_id,
            isbn=item_in.isbn,
            name=item_in.name,
            quantity=item_in.quantity
        )
        db.add(local_item)
        
    session.updated_at = datetime.utcnow()
    db.commit()
    
    # Reload and return updated session
    db.refresh(session)
    
    print(f"RETORNO HORUS CONFERE_ITEM: {res}")
    
    return {
        "session": OrderConferenceResponse.model_validate(session),
        "horus_response": res
    }

@router.post("/orders/session/volume/close")
def close_volume(
    volume_id: int,
    weight: float,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Marks a volume as finalized/closed with a weight in KG.
    """
    if weight <= 0:
        raise HTTPException(status_code=400, detail="O peso do volume deve ser maior que zero.")
        
    # Verify company rights
    volume = db.query(OrderConferenceVolume).filter(OrderConferenceVolume.id == volume_id).first()
    if not volume:
        raise HTTPException(status_code=404, detail="Volume não localizado.")
        
    session = db.query(OrderConference).filter(
        OrderConference.id == volume.conference_id,
        OrderConference.company_id == current_user.company_id
    ).first()
    if not session:
        raise HTTPException(status_code=403, detail="Acesso negado para este volume.")
        
    volume.weight = weight
    db.commit()
    return {"status": "success", "message": f"Volume {volume.volume_number} finalizado com peso {weight} KG."}

@router.post("/orders/session/finalize")
async def finalize_conference_session(
    conference_id: int,
    cod_ped_venda: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Finalize the order checking session. Calls Horus API InsVolume_Pedido for all volumes
    and marks session status as COMPLETED.
    """
    session = db.query(OrderConference).filter(
        OrderConference.id == conference_id,
        OrderConference.company_id == current_user.company_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de conferência não localizada.")
        
    branch = db.query(SellerBranch).filter(SellerBranch.id == session.branch_id).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Filial associada à conferência não localizada.")

    volumes = db.query(OrderConferenceVolume).filter(
        OrderConferenceVolume.conference_id == session.id,
        OrderConferenceVolume.status != "CANCELLED"
    ).all()
    
    if not volumes:
        raise HTTPException(status_code=400, detail="Não é possível finalizar uma conferência sem caixas/volumes.")

    # Validate all volumes have weight
    for vol in volumes:
        if vol.weight is None or vol.weight <= 0:
            raise HTTPException(
                status_code=400, 
                detail=f"O volume {vol.volume_number} não possui peso válido cadastrado. Favor fechar a caixa informando o peso."
            )
            
    # Connect to Horus client
    try:
        horus_client = HorusLogisticsClient(db, current_user.company_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro de configuração do Horus: {str(e)}")

    try:
        # Loop through volumes and call InsVolume_Pedido
        for vol in volumes:
            res = await horus_client.ins_volume_pedido(
                cod_empresa=branch.cod_empresa,
                cod_filial=branch.cod_filial,
                cod_cli=session.cod_cli,
                cod_ped_venda=cod_ped_venda,
                cod_volume=vol.volume_number,
                pes_volume=vol.weight
            )
            
            # Check for Horus response failures
            if res and isinstance(res, list) and len(res) > 0:
                first = res[0]
                if first.get("Falha") or first.get("FALHA") == "S":
                    raise HTTPException(
                        status_code=400, 
                        detail=f"Erro ao enviar Volume {vol.volume_number} ao Horus: {first.get('Mensagem', 'Erro desconhecido.')}"
                    )
            elif isinstance(res, dict) and (res.get("Falha") or res.get("FALHA") == "S"):
                raise HTTPException(
                    status_code=400, 
                    detail=f"Erro ao enviar Volume {vol.volume_number} ao Horus: {res.get('Mensagem', 'Erro desconhecido.')}"
                )
                
        # Send 0 for all items in the order that have not been checked
        items_res = await horus_client.get_order_items(
            cod_ped_venda=cod_ped_venda,
            cod_empresa=branch.cod_empresa,
            cod_filial=branch.cod_filial
        )
        horus_items = items_res if isinstance(items_res, list) else []
        if isinstance(items_res, dict) and "itens" in items_res:
            horus_items = items_res["itens"]
            
        settings = db.query(CompanySettings).filter(CompanySettings.company_id == current_user.company_id).first()
        cod_local = settings.horus_stock_local if (settings and settings.horus_stock_local) else "1"
        
        # Normalize items list (filter out failures)
        horus_items = [i for i in horus_items if not i.get("Falha") and not i.get("FALHA")]
        
        for item in horus_items:
            isbn = item.get("ISBN") or item.get("BARRAS_ISBN") or item.get("COD_BARRA_ITEM")
            if not isbn:
                continue
                
            total_checked = db.query(func.sum(OrderConferenceVolumeItem.quantity)).\
                join(OrderConferenceVolume, OrderConferenceVolume.id == OrderConferenceVolumeItem.volume_id).\
                filter(
                    OrderConferenceVolume.conference_id == session.id,
                    OrderConferenceVolume.status != "CANCELLED",
                    OrderConferenceVolumeItem.isbn == isbn
                ).scalar() or 0
                
            if total_checked == 0:
                await horus_client.confere_item_pedido(
                    cod_empresa=branch.cod_empresa,
                    cod_filial=branch.cod_filial,
                    cod_cli=session.cod_cli,
                    cod_ped_venda=cod_ped_venda,
                    cod_item=item.get("COD_ITEM"),
                    cod_local=cod_local,
                    qtd_atendida=0
                )
                
    except HTTPException:
        await horus_client.close()
        raise
    except Exception as e:
        await horus_client.close()
        raise HTTPException(status_code=500, detail=f"Falha de comunicação ao enviar volumes para o Horus: {str(e)}")
        
    await horus_client.close()
    
    session.status = "COMPLETED"
    session.updated_at = datetime.utcnow()
    db.commit()
    
    return {"status": "success", "message": "Conferência de pedido encerrada e volumes enviados ao Horus com sucesso."}

@router.get("/orders/conferences")
def get_conferences(
    status: Optional[str] = None,
    branch_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    List all conference sessions for the user's company.
    """
    query = db.query(OrderConference).filter(
        OrderConference.company_id == current_user.company_id
    )
    
    if status:
        query = query.filter(OrderConference.status == status)
    if branch_id:
        query = query.filter(OrderConference.branch_id == branch_id)
        
    conferences = query.order_by(OrderConference.updated_at.desc()).all()
    
    res = []
    for conf in conferences:
        # Join branch info
        branch_name = conf.branch.nome if conf.branch else "Filial Excluída"
        
        # Calculate total volumes and items
        total_vols = len(conf.volumes)
        total_items = 0
        for vol in conf.volumes:
            total_items += sum(item.quantity for item in vol.items)
            
        res.append({
            "id": conf.id,
            "branch_id": conf.branch_id,
            "branch_name": branch_name,
            "cod_cli": conf.cod_cli,
            "cod_pedido_origem": conf.cod_pedido_origem,
            "status": conf.status,
            "total_volumes": total_vols,
            "total_items": total_items,
            "created_at": conf.created_at,
            "updated_at": conf.updated_at
        })
        
    return res

@router.get("/orders/conferences/{conference_id}")
async def get_conference_by_id(
    conference_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve details for a specific conference session and query Horus for order items.
    """
    session = db.query(OrderConference).filter(
        OrderConference.id == conference_id,
        OrderConference.company_id == current_user.company_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de conferência não localizada.")
        
    branch = db.query(SellerBranch).filter(
        SellerBranch.id == session.branch_id,
        SellerBranch.active == True
    ).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Filial da conferência não é válida ou está inativa.")
        
    # Query Horus ERP for order details (header and items)
    try:
        horus_client = HorusLogisticsClient(db, current_user.company_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Erro de configuração do Horus: {str(e)}")
        
    try:
        order_res = await horus_client.search_orders(
            cod_empresa=branch.cod_empresa,
            cod_filial=branch.cod_filial,
            cod_cli=session.cod_cli,
            cod_pedido_origem=session.cod_pedido_origem
        )
        
        if not order_res or (isinstance(order_res, list) and len(order_res) == 0):
            await horus_client.close()
            raise HTTPException(status_code=404, detail="Pedido não localizado no Horus ERP.")
            
        order_data = order_res[0] if isinstance(order_res, list) else order_res
        if order_data.get("Falha") or order_data.get("FALHA") == "S":
            await horus_client.close()
            raise HTTPException(status_code=400, detail=order_data.get("Mensagem", "Erro ao buscar pedido no Horus."))
            
        cod_ped_venda = order_data.get("COD_PED_VENDA")
        if not cod_ped_venda:
            await horus_client.close()
            raise HTTPException(status_code=400, detail="Código do pedido de venda (COD_PED_VENDA) ausente no Horus.")
            
        items_res = await horus_client.get_order_items(
            cod_ped_venda=cod_ped_venda,
            cod_empresa=branch.cod_empresa,
            cod_filial=branch.cod_filial
        )
        
        await horus_client.close()
        
        horus_items = items_res if isinstance(items_res, list) else []
        if isinstance(items_res, dict) and "itens" in items_res:
            horus_items = items_res["itens"]
            
        horus_items = [i for i in horus_items if not i.get("Falha") and not i.get("FALHA")]
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro de comunicação com o Horus: {str(e)}")
        
    return {
        "session": OrderConferenceResponse.model_validate(session),
        "horus_order": order_data,
        "horus_items": horus_items
    }

@router.delete("/orders/conferences/{conference_id}")
def delete_conference(
    conference_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Delete a conference session. Only allowed if status is not COMPLETED.
    """
    session = db.query(OrderConference).filter(
        OrderConference.id == conference_id,
        OrderConference.company_id == current_user.company_id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Sessão de conferência não localizada.")
        
    if session.status == "COMPLETED":
        raise HTTPException(status_code=400, detail="Não é permitido excluir uma conferência já encerrada.")
        
    db.delete(session)
    db.commit()
    
    return {"status": "success", "message": "Conferência excluída com sucesso."}

@router.post("/orders/session/volume/{volume_id}/cancel")
async def cancel_volume(
    volume_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Cancels a completed volume, subtracts its items from Horus checked totals, and updates DB.
    """
    volume = db.query(OrderConferenceVolume).filter(OrderConferenceVolume.id == volume_id).first()
    if not volume:
        raise HTTPException(status_code=404, detail="Volume não localizado.")
        
    session = db.query(OrderConference).filter(
        OrderConference.id == volume.conference_id,
        OrderConference.company_id == current_user.company_id,
        OrderConference.status == "IN_PROGRESS"
    ).first()
    
    if not session:
        raise HTTPException(status_code=400, detail="Conferência associada não está em andamento.")
        
    if volume.status == "CANCELLED":
        return {"status": "success", "message": "Volume já está cancelado.", "session": OrderConferenceResponse.model_validate(session)}
        
    branch = db.query(SellerBranch).filter(SellerBranch.id == session.branch_id).first()
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == current_user.company_id).first()
    cod_local = settings.horus_stock_local if (settings and settings.horus_stock_local) else "1"
    
    old_status = volume.status
    volume.status = "CANCELLED"
    db.commit()
    
    try:
        horus_client = HorusLogisticsClient(db, current_user.company_id)
        # Search the order to find cod_ped_venda
        order_res = await horus_client.search_orders(
            cod_empresa=branch.cod_empresa,
            cod_filial=branch.cod_filial,
            cod_cli=session.cod_cli,
            cod_pedido_origem=session.cod_pedido_origem
        )
        order_data = order_res[0] if isinstance(order_res, list) else order_res
        cod_ped_venda = order_data.get("COD_PED_VENDA")
        
        # Get items for the order to map ISBN to cod_item
        items_res = await horus_client.get_order_items(
            cod_ped_venda=cod_ped_venda,
            cod_empresa=branch.cod_empresa,
            cod_filial=branch.cod_filial
        )
        horus_items = items_res if isinstance(items_res, list) else []
        if isinstance(items_res, dict) and "itens" in items_res:
            horus_items = items_res["itens"]
            
        isbn_to_cod_item = {}
        for i in horus_items:
            for key in ["ISBN", "BARRAS_ISBN", "COD_BARRA_ITEM"]:
                val = i.get(key)
                if val:
                    isbn_to_cod_item[str(val).strip()] = i.get("COD_ITEM")
                    
        for item in volume.items:
            cod_item = isbn_to_cod_item.get(str(item.isbn).strip())
            if not cod_item:
                continue
                
            new_qty = db.query(func.sum(OrderConferenceVolumeItem.quantity)).\
                join(OrderConferenceVolume, OrderConferenceVolume.id == OrderConferenceVolumeItem.volume_id).\
                filter(
                    OrderConferenceVolume.conference_id == session.id,
                    OrderConferenceVolume.status != "CANCELLED",
                    OrderConferenceVolumeItem.isbn == item.isbn
                ).scalar() or 0
                
            # 1. Reset checked quantity to 0 in Horus ERP first
            await horus_client.confere_item_pedido(
                cod_empresa=branch.cod_empresa,
                cod_filial=branch.cod_filial,
                cod_cli=session.cod_cli,
                cod_ped_venda=cod_ped_venda,
                cod_item=cod_item,
                cod_local=cod_local,
                qtd_atendida=0
            )
            
            # 2. Then, if there is a remaining checked quantity from other active volumes, send it
            if new_qty > 0:
                await horus_client.confere_item_pedido(
                    cod_empresa=branch.cod_empresa,
                    cod_filial=branch.cod_filial,
                    cod_cli=session.cod_cli,
                    cod_ped_venda=cod_ped_venda,
                    cod_item=cod_item,
                    cod_local=cod_local,
                    qtd_atendida=new_qty
                )
            
        await horus_client.close()
    except Exception as e:
        volume.status = old_status
        db.commit()
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar quantidades no Horus: {str(e)}")
        
    session.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return {"status": "success", "message": f"Volume {volume.volume_number} cancelado com sucesso.", "session": OrderConferenceResponse.model_validate(session)}

@router.post("/orders/session/volume/{volume_id}/restore")
async def restore_volume(
    volume_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Restores a cancelled volume, adds back its items to Horus checked totals, and updates DB.
    """
    volume = db.query(OrderConferenceVolume).filter(OrderConferenceVolume.id == volume_id).first()
    if not volume:
        raise HTTPException(status_code=404, detail="Volume não localizado.")
        
    session = db.query(OrderConference).filter(
        OrderConference.id == volume.conference_id,
        OrderConference.company_id == current_user.company_id,
        OrderConference.status == "IN_PROGRESS"
    ).first()
    
    if not session:
        raise HTTPException(status_code=400, detail="Conferência associada não está em andamento.")
        
    if volume.status == "COMPLETED":
        return {"status": "success", "message": "Volume já está ativo.", "session": OrderConferenceResponse.model_validate(session)}
        
    branch = db.query(SellerBranch).filter(SellerBranch.id == session.branch_id).first()
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == current_user.company_id).first()
    cod_local = settings.horus_stock_local if (settings and settings.horus_stock_local) else "1"
    
    old_status = volume.status
    volume.status = "COMPLETED"
    db.commit()
    
    try:
        horus_client = HorusLogisticsClient(db, current_user.company_id)
        # Search the order to find cod_ped_venda
        order_res = await horus_client.search_orders(
            cod_empresa=branch.cod_empresa,
            cod_filial=branch.cod_filial,
            cod_cli=session.cod_cli,
            cod_pedido_origem=session.cod_pedido_origem
        )
        order_data = order_res[0] if isinstance(order_res, list) else order_res
        cod_ped_venda = order_data.get("COD_PED_VENDA")
        
        # Get items for the order to map ISBN to cod_item
        items_res = await horus_client.get_order_items(
            cod_ped_venda=cod_ped_venda,
            cod_empresa=branch.cod_empresa,
            cod_filial=branch.cod_filial
        )
        horus_items = items_res if isinstance(items_res, list) else []
        if isinstance(items_res, dict) and "itens" in items_res:
            horus_items = items_res["itens"]
            
        isbn_to_cod_item = {}
        for i in horus_items:
            for key in ["ISBN", "BARRAS_ISBN", "COD_BARRA_ITEM"]:
                val = i.get(key)
                if val:
                    isbn_to_cod_item[str(val).strip()] = i.get("COD_ITEM")
                    
        for item in volume.items:
            cod_item = isbn_to_cod_item.get(str(item.isbn).strip())
            if not cod_item:
                continue
                
            new_qty = db.query(func.sum(OrderConferenceVolumeItem.quantity)).\
                join(OrderConferenceVolume, OrderConferenceVolume.id == OrderConferenceVolumeItem.volume_id).\
                filter(
                    OrderConferenceVolume.conference_id == session.id,
                    OrderConferenceVolume.status != "CANCELLED",
                    OrderConferenceVolumeItem.isbn == item.isbn
                ).scalar() or 0
                
            await horus_client.confere_item_pedido(
                cod_empresa=branch.cod_empresa,
                cod_filial=branch.cod_filial,
                cod_cli=session.cod_cli,
                cod_ped_venda=cod_ped_venda,
                cod_item=cod_item,
                cod_local=cod_local,
                qtd_atendida=new_qty
            )
            
        await horus_client.close()
    except Exception as e:
        volume.status = old_status
        db.commit()
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar quantidades no Horus: {str(e)}")
        
    session.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return {"status": "success", "message": f"Volume {volume.volume_number} reativado com sucesso.", "session": OrderConferenceResponse.model_validate(session)}

