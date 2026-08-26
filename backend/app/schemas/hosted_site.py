from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


class HostedSiteBase(BaseModel):
    title: str = Field(..., max_length=255)
    slug: str = Field(..., max_length=100)
    description: Optional[str] = None
    custom_domain: Optional[str] = None


class HostedSiteCreate(HostedSiteBase):
    pass


class HostedSiteUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    slug: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = None
    custom_domain: Optional[str] = None


class HostedSiteFileNode(BaseModel):
    name: str
    path: str
    is_dir: bool
    size: Optional[int] = None
    children: Optional[List['HostedSiteFileNode']] = None


class HostedSiteResponse(HostedSiteBase):
    id: int
    status: str
    zip_filename: Optional[str] = None
    zip_size_bytes: Optional[int] = None
    has_index: bool = False
    files_count: int = 0
    storage_path: Optional[str] = None
    public_url: str
    preview_url: str
    last_deployed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class HostedSiteDetailResponse(HostedSiteResponse):
    files: Optional[List[HostedSiteFileNode]] = None
