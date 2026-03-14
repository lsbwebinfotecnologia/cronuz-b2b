from fastapi import APIRouter

router = APIRouter()

@router.get("/inventory/horus/status")
def get_horus_status():
    """
    Simula a verificação de status da integração com o sistema Horus.
    No futuro, isso fará chamadas reais para a API do Horus (ex: via httpx).
    """
    return {
        "status": "connected",
        "last_sync": "2024-03-20T10:00:00Z",
        "items_synced": 8432,
        "message": "Integração Horus operando normalmente."
    }

@router.get("/inventory/horus/products")
def get_horus_products(limit: int = 10):
    """
    Simula a busca de produtos no Horus.
    """
    return [
        {"id": "H-101", "name": "O Senhor dos Anéis", "stock": 45},
        {"id": "H-102", "name": "Clean Code", "stock": 12},
    ]
