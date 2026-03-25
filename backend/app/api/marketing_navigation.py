from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.marketing_navigation import NavigationMenuItem, NavigationMenuType
from app.schemas.marketing_navigation import NavigationMenuItemCreate, NavigationMenuItemUpdate, NavigationMenuItemResponse
from app.models.company_settings import CompanySettings

router = APIRouter()

@router.get("/available")
async def get_available_navigation(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["SELLER", "MASTER", "MANAGER"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
        
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == current_user.company_id).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Configurações não encontradas")
        
    categories = []
    brands = []
    
    if settings.horus_enabled:
        try:
            from app.integrators.horus_products import HorusProducts
            client = HorusProducts(db=db, company_id=current_user.company_id)
            id_doc = "0"
            if settings.horus_company and settings.horus_branch:
                id_doc = f"{settings.horus_company}{settings.horus_branch}"
                
            horus_generos = await client.arvore_generos(id_doc=id_doc)
            horus_editoras = await client.busca_editoras(id_doc=id_doc)
            
            if isinstance(horus_generos, list) and len(horus_generos) > 0 and not horus_generos[0].get("Falha"):
                for gen in horus_generos:
                    cat_id = gen.get("COD_SECAO") or gen.get("COD_GENERO") or gen.get("ID_GENERO") or gen.get("ID")
                    cat_nome = gen.get("DESCRICAO") or gen.get("NOM_SECAO") or gen.get("NOM_GENERO") or gen.get("NOME")
                    if cat_id and cat_nome:
                        categories.append({"id": str(cat_id), "name": str(cat_nome).title()})
                        
            if isinstance(horus_editoras, list) and len(horus_editoras) > 0 and not horus_editoras[0].get("Falha"):
                for ed in horus_editoras:
                    ed_id = ed.get("COD_EDITORA") or ed.get("ID_EDITORA") or ed.get("ID")
                    ed_nome = ed.get("NOM_FANTASIA") or ed.get("NOM_EDITORA") or ed.get("NOME")
                    if ed_id and ed_nome:
                        brands.append({"id": str(ed_id), "name": str(ed_nome).title()})
        except Exception as e:
            pass

    if not categories and not brands:
        from app.models.catalog_support import Category, Brand
        local_cats = db.query(Category).filter(Category.company_id == current_user.company_id).all()
        categories = [{"id": str(c.id), "name": c.name} for c in local_cats]
        
        local_brands = db.query(Brand).filter(Brand.company_id == current_user.company_id).all()
        brands = [{"id": str(b.id), "name": b.name} for b in local_brands]
        
    return {
        "categories": categories,
        "brands": brands
    }

@router.get("", response_model=List[NavigationMenuItemResponse])
def get_navigation_menu(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all custom navigation menu items for the company."""
    if current_user.type not in ["SELLER", "MASTER", "MANAGER"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
        
    items = db.query(NavigationMenuItem).filter(
        NavigationMenuItem.company_id == current_user.company_id
    ).order_by(NavigationMenuItem.position.asc()).all()
    
    return items

@router.post("", response_model=NavigationMenuItemResponse, status_code=status.HTTP_201_CREATED)
def create_navigation_menu_item(
    item_in: NavigationMenuItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["SELLER", "MASTER", "MANAGER"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
        
    # Check if this external_id already exists to prevent duplicates
    existing = db.query(NavigationMenuItem).filter(
        NavigationMenuItem.company_id == current_user.company_id,
        NavigationMenuItem.external_id == item_in.external_id,
        NavigationMenuItem.item_type == item_in.item_type
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="Este item já está no menu.")
        
    new_item = NavigationMenuItem(
        company_id=current_user.company_id,
        item_type=item_in.item_type,
        label=item_in.label,
        external_id=item_in.external_id,
        position=item_in.position,
        is_active=item_in.is_active
    )
    
    db.add(new_item)
    db.commit()
    db.refresh(new_item)
    return new_item

@router.put("/{item_id}", response_model=NavigationMenuItemResponse)
def update_navigation_menu_item(
    item_id: int,
    item_in: NavigationMenuItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["SELLER", "MASTER", "MANAGER"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
        
    item = db.query(NavigationMenuItem).filter(
        NavigationMenuItem.id == item_id,
        NavigationMenuItem.company_id == current_user.company_id
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item de menu não encontrado")
        
    update_data = item_in.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(item, field, value)
        
    db.commit()
    db.refresh(item)
    return item

@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_navigation_menu_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.type not in ["SELLER", "MASTER", "MANAGER"]:
        raise HTTPException(status_code=403, detail="Acesso negado")
        
    item = db.query(NavigationMenuItem).filter(
        NavigationMenuItem.id == item_id,
        NavigationMenuItem.company_id == current_user.company_id
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="Item de menu não encontrado")
        
    db.delete(item)
    db.commit()
    return None
