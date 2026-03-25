from typing import Optional, List
from pydantic import BaseModel, ConfigDict
from datetime import datetime
from app.models.marketing_navigation import NavigationMenuType

class NavigationMenuItemBase(BaseModel):
    item_type: NavigationMenuType
    label: str
    external_id: str
    position: Optional[int] = 1
    is_active: Optional[bool] = True

class NavigationMenuItemCreate(NavigationMenuItemBase):
    pass

class NavigationMenuItemUpdate(BaseModel):
    label: Optional[str] = None
    position: Optional[int] = None
    is_active: Optional[bool] = None

class NavigationMenuItemResponse(NavigationMenuItemBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
