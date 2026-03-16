from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class CategoryBase(BaseModel):
    name: str
    parent_id: Optional[int] = None

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[int] = None

class CategoryResponse(CategoryBase):
    id: int
    company_id: int
    created_at: Optional[datetime]
    updated_at: Optional[datetime]

    class Config:
        from_attributes = True

class BrandBase(BaseModel):
    name: str

class BrandCreate(BrandBase):
    pass

class BrandUpdate(BaseModel):
    name: Optional[str] = None

class BrandResponse(BrandBase):
    id: int
    company_id: int
    created_at: Optional[datetime]

    class Config:
        from_attributes = True

class CharacteristicBase(BaseModel):
    name: str
    options: Optional[str] = None
    category_id: Optional[int] = None

class CharacteristicCreate(CharacteristicBase):
    pass

class CharacteristicUpdate(BaseModel):
    name: Optional[str] = None
    options: Optional[str] = None
    category_id: Optional[int] = None

class CharacteristicResponse(CharacteristicBase):
    id: int
    company_id: int
    created_at: Optional[datetime]

    class Config:
        from_attributes = True
