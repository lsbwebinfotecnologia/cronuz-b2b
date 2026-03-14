from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

app = FastAPI(title="Cronuz B2B API", version="0.1.0")

# Placeholder for Company Model
class CompanyBase(BaseModel):
    name: str
    cnpj: str
    active: bool = True

class Company(CompanyBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

@app.get("/")
def read_root():
    return {"message": "Cronuz B2B API is running. Multi-tenant ready."}

@app.get("/companies", response_model=List[Company])
def get_companies():
    # Placeholder returning fake data
    return [
        {
            "id": 1,
            "name": "Cronuz IA Main",
            "cnpj": "12.345.678/0001-90",
            "active": True,
            "created_at": datetime.now()
        }
    ]
