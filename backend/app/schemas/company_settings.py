from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CompanySettingsBase(BaseModel):
    horus_enabled: Optional[bool] = False
    horus_url: Optional[str] = None
    horus_port: Optional[str] = None
    horus_username: Optional[str] = None
    horus_password: Optional[str] = None
    horus_company: Optional[str] = None
    horus_branch: Optional[str] = None
    bookinfo_api_key: Optional[str] = None
    metabooks_api_key: Optional[str] = None
    cover_image_base_url: Optional[str] = None
    allow_backorder: Optional[bool] = False
    max_backorder_qty: Optional[int] = 0

class CompanySettingsUpdate(CompanySettingsBase):
    pass

class CompanySettingsInDBBase(CompanySettingsBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class CompanySettings(CompanySettingsInDBBase):
    pass
