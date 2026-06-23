from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()

# Configurações de brand por tenant_id
# Em produção isso pode vir do banco de dados
BRAND_CONFIGS = {
    "horus": {
        "tenant_id": "horus",
        "app_name": "Horus B2B",
        "app_subtitle": "Acesse sua conta",
        "primary_color": "#a4a1ff",      # Roxo/lavanda Horus
        "secondary_color": "#908df7",
        "logo_url": None,
        "logo_asset": "horus",
        "icon_asset": "horus",
    },
    "cronuz": {
        "tenant_id": "cronuz",
        "app_name": "Cronuz B2B",
        "app_subtitle": "Acesse sua conta",
        "primary_color": "#01A9AF",      # Teal/ciano Cronuz
        "secondary_color": "#018b90",
        "logo_url": None,
        "logo_asset": "cronuz",
        "icon_asset": "cronuz",
    },
}

DEFAULT_BRAND = BRAND_CONFIGS["horus"]


class BrandConfig(BaseModel):
    tenant_id: str
    app_name: str
    app_subtitle: str
    primary_color: str
    secondary_color: str
    logo_url: Optional[str]
    logo_asset: str
    icon_asset: str


@router.get("/app/brand", response_model=BrandConfig, tags=["App Mobile"])
def get_app_brand(tenant_id: str = "horus"):
    """
    Retorna configuração de branding para o app mobile.
    Endpoint público — não requer autenticação.
    """
    config = BRAND_CONFIGS.get(tenant_id.lower(), DEFAULT_BRAND)
    return config
