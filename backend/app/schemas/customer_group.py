from pydantic import BaseModel
from typing import Optional, List

class CustomerGroupBase(BaseModel):
    name: str
    color: Optional[str] = None

class CustomerGroupCreate(CustomerGroupBase):
    pass

class CustomerGroupUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None

class CustomerGroup(CustomerGroupBase):
    id: int
    company_id: int

    class Config:
        from_attributes = True

# Schema para associar os grupos de um cliente
class CustomerGroupsUpdate(BaseModel):
    default_group_id: Optional[int] = None
    additional_group_ids: List[int] = []
