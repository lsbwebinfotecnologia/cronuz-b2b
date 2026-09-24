import sys
import os

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

def test_pos_imports():
    print("Testando imports do módulo POS...")
    from app.models.pos import POSSession, POSSale, POSSaleItem, POSSessionStatus, POSCatalogSource, POSPaymentMethod
    print("✅ Modelos carregados com sucesso!")

    from app.schemas.pos import POSSessionCreate, POSSaleCreate, POSSyncBatchRequest, POSSyncBatchResponse
    print("✅ Schemas Pydantic carregados com sucesso!")

    from app.api.pos import router
    print(f"✅ Router carregado com {len(router.routes)} rotas!")

    from main import app
    print("✅ FastAPI app inicializado com sucesso!")
    print("TUDO OK!")

if __name__ == "__main__":
    test_pos_imports()
