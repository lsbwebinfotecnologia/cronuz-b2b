import httpx
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models.company_settings import CompanySettings

class HorusConfigurationError(Exception):
    """Raised when Horus ERP is not properly configured or disabled for the company."""
    pass

class HorusClient:
    def __init__(self, db: Session, company_id: int):
        self.db = db
        self.company_id = company_id
        self._settings = self._load_settings()
        self._client = self._build_client()

    def _load_settings(self) -> CompanySettings:
        settings = self.db.query(CompanySettings).filter(CompanySettings.company_id == self.company_id).first()
        if not settings:
            raise HorusConfigurationError(f"No settings found for company ID {self.company_id}.")
        if not settings.horus_enabled:
            raise HorusConfigurationError(f"Horus API is disabled for company ID {self.company_id}.")
        if not all([settings.horus_url, settings.horus_username, settings.horus_password]):
            raise HorusConfigurationError(f"Horus API configuration is incomplete for company ID {self.company_id}.")
        return settings

    def _build_client(self) -> httpx.AsyncClient:
        base_url = self._settings.horus_url.strip()
        
        # Robustly inject port into the URL if provided
        if self._settings.horus_port:
            from urllib.parse import urlparse, urlunparse
            parsed = urlparse(base_url)
            # if no scheme, assume http://
            if not parsed.scheme:
                parsed = urlparse(f"http://{base_url}")
                
            netloc = parsed.hostname
            # Only append port if port isn't already in the string
            if parsed.port != int(self._settings.horus_port):
                netloc = f"{netloc}:{self._settings.horus_port}"
                
            base_url = urlunparse((
                parsed.scheme,
                netloc,
                parsed.path if parsed.path else "/",
                parsed.params,
                parsed.query,
                parsed.fragment
            ))
            
        if not base_url.endswith("/"):
             base_url += "/"
             
        if "/Horus/api/TServerB2B" not in base_url:
             base_url += "Horus/api/TServerB2B/"
             
        auth = (self._settings.horus_username, self._settings.horus_password)
        
        headers = {
            "Accept": "application/json",
            "Content-Type": "application/json"
        }
        
        return httpx.AsyncClient(
            base_url=base_url,
            auth=auth,
            headers=headers,
            timeout=30.0,
            follow_redirects=True
        )
    
    async def get(self, endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
        try:
            response = await self._client.get(endpoint, params=params)
            response.raise_for_status()
            text = response.text.strip()
            # Handle BOM and trailing/leading non-json chars cleanly
            if text.startswith("\ufeff"):
                text = text[1:]
            
            # Simple fallback to trying to parse JSON
            import json
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                # If Horus returned a pure string instead of JSON, we can return it as an error format
                return [{"Falha": True, "Mensagem": f"Resposta inválida da API: {text[:100]}"}]
                
        except httpx.HTTPStatusError as e:
            # Handle API errors gracefully and extract exact Horus message
            err_msg = e.response.text
            try:
                json_err = e.response.json()
                if isinstance(json_err, dict) and json_err.get("Mensagem"):
                    err_msg = json_err.get("Mensagem")
                elif isinstance(json_err, list) and len(json_err) > 0 and json_err[0].get("Mensagem"):
                    err_msg = json_err[0].get("Mensagem")
            except Exception:
                pass
            raise Exception(f"Erro Horus ({e.response.status_code}): {err_msg}")
    
    async def post(self, endpoint: str, json_data: Any, params: Optional[Dict[str, Any]] = None) -> Any:
        try:
            response = await self._client.post(endpoint, json=json_data, params=params)
            response.raise_for_status()
            text = response.text.strip()
            if text.startswith("\ufeff"):
                text = text[1:]
                
            import json
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return [{"Falha": True, "Mensagem": f"Resposta inválida da API: {text[:100]}"}]
        except httpx.HTTPStatusError as e:
            err_msg = e.response.text
            try:
                json_err = e.response.json()
                if isinstance(json_err, dict) and json_err.get("Mensagem"):
                    err_msg = json_err.get("Mensagem")
                elif isinstance(json_err, list) and len(json_err) > 0 and json_err[0].get("Mensagem"):
                    err_msg = json_err[0].get("Mensagem")
            except Exception:
                pass
            raise Exception(f"Erro Horus ({e.response.status_code}): {err_msg}")
            
    async def test_api(self) -> Dict[str, Any]:
        """
        Tests if the Horus API is active and responding correctly using the 'Teste1' endpoint.
        Returns a dict with status and message.
        """
        try:
            # Utilizing a lightweight endpoint to test connectivity
            response = await self._client.get("Teste1")
            response.raise_for_status()
            
            data = response.json()
            if isinstance(data, list) and len(data) > 0:
                first_item = data[0]
                if first_item.get("Falha"):
                     return {
                        "status": "error",
                        "message": f"API respondeu com falha: {first_item.get('Mensagem')}"
                     }
                elif first_item.get("ATIVA") == "S":
                     return {
                        "status": "connected",
                        "message": "Integração Horus operando normalmente."
                     }
                  
            if isinstance(data, dict):
                if data.get("Falha"):
                     return {
                         "status": "error",
                         "message": f"API respondeu com falha: {data.get('Mensagem')}"
                     }
                elif data.get("ATIVA") == "S":
                     return {
                        "status": "connected",
                        "message": "Integração Horus operando normalmente."
                     }

            return {
                "status": "connected",
                "message": "Conectado. Resposta recebida da API."
            }
        except httpx.HTTPStatusError as e:
            return {
                "status": "error",
                "message": f"Erro de Autorização ou Configuração na API Horus (HTTP {e.response.status_code})."
            }
        except httpx.RequestError as e:
            return {
                "status": "error",
                "message": f"Falha de conexão física com o link da API Horus: {str(e)}"
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Erro inesperado ao testar API Horus: {str(e)}"
            }
            
    async def close(self):
        await self._client.aclose()
