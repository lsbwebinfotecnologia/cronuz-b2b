from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CompanySettingsBase(BaseModel):
    horus_api_key: Optional[str] = None
    horus_endpoint: Optional[str] = None
    bookinfo_api_key: Optional[str] = None
    metabooks_api_key: Optional[str] = None

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
