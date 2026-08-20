import sys
import os

# Add backend directory to sys.path
backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_path not in sys.path:
    sys.path.insert(0, backend_path)

from app.schemas.seller_branch import SellerBranchResponse
from datetime import datetime

# Sample data representing the database states that previously failed
data_paisagem = {
    "id": 1,
    "company_id": 1,
    "nome": "PAISAGEM DISTRIBUIDORA DE LIVROS LTDA",
    "cnpj": "2751282100013", # 13 digits
    "cod_empresa": "1",
    "cod_filial": "1",
    "active": True,
    "sefaz_environment": None,
    "uf": None,
    "created_at": datetime.now(),
    "updated_at": datetime.now()
}

data_base_teste = {
    "id": 2,
    "company_id": 1,
    "nome": "Base Teste",
    "cnpj": "17026001000108", # 14 digits
    "cod_empresa": "1",
    "cod_filial": "2",
    "active": True,
    "sefaz_environment": None,
    "uf": None,
    "created_at": datetime.now(),
    "updated_at": datetime.now()
}

try:
    print("Validating data_paisagem...")
    branch_1 = SellerBranchResponse.model_validate(data_paisagem)
    print("Successfully validated branch_1:")
    print(f"  CNPJ: {branch_1.cnpj}")
    print(f"  Environment: {branch_1.sefaz_environment}")
    print(f"  UF: {branch_1.uf}")
    
    print("\nValidating data_base_teste...")
    branch_2 = SellerBranchResponse.model_validate(data_base_teste)
    print("Successfully validated branch_2:")
    print(f"  CNPJ: {branch_2.cnpj}")
    print(f"  Environment: {branch_2.sefaz_environment}")
    print(f"  UF: {branch_2.uf}")
    
    print("\nALL SCHEMA VALIDATIONS PASSED SUCCESSFULY!")
except Exception as e:
    print("\nVALIDATION FAILED:", e)
    sys.exit(1)
