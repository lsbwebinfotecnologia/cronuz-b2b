"""
client.py
---------
Cliente da API do Banco Cora — modalidade **Integração Direta** (mTLS + client_credentials).

Docs: https://developers.cora.com.br  (Instruções iniciais / Client Credentials / Boletos v2 / Endpoints)

SEGURANÇA (AGENTS §2):
  - Certificado e chave privada vêm do banco (fin_cora_account.cert_content / key_content).
  - A chave privada é armazenada criptografada (Fernet) e só é descriptografada em runtime.
  - Os arquivos exigidos pelo `requests` para mTLS são criados com `tempfile` (permissão 0600)
    e removidos no `__exit__` do context manager — stateless, nada fica em disco.

PERFORMANCE:
  - Token de acesso em cache por processo (chave: client_id + ambiente), renovado 60s antes de expirar.
  - Uma única `requests.Session` (keep-alive) por bloco `with`.

Uso:
    with CoraClient.from_account(account) as cora:
        cora.test_connection()
"""
import logging
import os
import tempfile
import threading
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple

import requests

logger = logging.getLogger(__name__)

CORA_BASE_URL_STAGE = "https://matls-clients.api.stage.cora.com.br"
CORA_BASE_URL_PROD = "https://matls-clients.api.cora.com.br"

_TOKEN_CACHE: Dict[Tuple[str, bool], Tuple[str, float]] = {}
_TOKEN_LOCK = threading.Lock()
_TOKEN_SAFETY_MARGIN = 60  # segundos


class CoraConfigError(Exception):
    """Credenciais Cora ausentes/inválidas na configuração do seller."""


class CoraAPIError(Exception):
    """Erro retornado pela API do Cora."""

    def __init__(self, message: str, status_code: Optional[int] = None, payload: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload


def _extract_error_message(resp: requests.Response) -> str:
    try:
        data = resp.json()
    except ValueError:
        return (resp.text or "").strip()[:500] or f"HTTP {resp.status_code}"
    if isinstance(data, dict):
        msg = data.get("message") or data.get("error_description") or data.get("error") or ""
        errors = data.get("errors")
        if isinstance(errors, list) and errors:
            details = "; ".join(
                f"{e.get('code', '')}: {e.get('message', '')}".strip(": ")
                for e in errors if isinstance(e, dict)
            )
            msg = f"{msg} ({details})" if msg else details
        return msg or str(data)[:500]
    return str(data)[:500]


class CoraClient:
    def __init__(self, client_id: str, cert_pem: str, key_pem: str, sandbox: bool = True, timeout: int = 25):
        if not client_id or not cert_pem or not key_pem:
            raise CoraConfigError("Credenciais do Banco Cora incompletas (Client ID, certificado e chave privada).")
        self.client_id = client_id.strip()
        self._cert_pem = cert_pem
        self._key_pem = key_pem
        self.sandbox = bool(sandbox)
        self.timeout = timeout
        self.base_url = CORA_BASE_URL_STAGE if self.sandbox else CORA_BASE_URL_PROD
        self._tmp_files: List[str] = []
        self._session: Optional[requests.Session] = None

    # ── Factory ──────────────────────────────────────────────────────────────
    @classmethod
    def from_account(cls, account) -> "CoraClient":
        """Cria o cliente a partir de um registro `fin_cora_account` (um por ambiente)."""
        from app.core.horus_sql_crypto import decrypt_sql_credential

        if account is None:
            raise CoraConfigError("Credenciais do Banco Cora não cadastradas para este ambiente.")
        key_plain = decrypt_sql_credential(account.key_content) if account.key_content else ""
        if account.key_content and not key_plain:
            raise CoraConfigError("Falha ao descriptografar a chave privada do Cora. Reimporte o certificado.")
        return cls(
            client_id=account.client_id or "",
            cert_pem=account.cert_content or "",
            key_pem=key_plain,
            sandbox=(account.environment != "PRODUCTION"),
        )

    # ── Context manager (arquivos temporários mTLS) ──────────────────────────
    def __enter__(self) -> "CoraClient":
        cert_path = self._write_temp(self._cert_pem, ".pem")
        key_path = self._write_temp(self._key_pem, ".key")
        self._key_pem = ""  # não manter a chave em memória além do necessário
        self._session = requests.Session()
        self._session.cert = (cert_path, key_path)
        return self

    def __exit__(self, exc_type, exc, tb):
        self.close()

    def close(self):
        if self._session is not None:
            try:
                self._session.close()
            except Exception:
                pass
            self._session = None
        for path in self._tmp_files:
            try:
                os.remove(path)
            except OSError:
                pass
        self._tmp_files = []

    def __del__(self):
        self.close()

    def _write_temp(self, content: str, suffix: str) -> str:
        fd, path = tempfile.mkstemp(prefix="cora_", suffix=suffix)
        try:
            os.chmod(path, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                fh.write(content.strip() + "\n")
        except Exception:
            try:
                os.remove(path)
            except OSError:
                pass
            raise
        self._tmp_files.append(path)
        return path

    def _require_session(self) -> requests.Session:
        if self._session is None:
            raise RuntimeError("CoraClient deve ser usado dentro de um bloco `with`.")
        return self._session

    # ── Autenticação ─────────────────────────────────────────────────────────
    def _cache_key(self) -> Tuple[str, bool]:
        return (self.client_id, self.sandbox)

    def get_token(self, force: bool = False) -> str:
        key = self._cache_key()
        now = time.time()
        if not force:
            with _TOKEN_LOCK:
                cached = _TOKEN_CACHE.get(key)
                if cached and cached[1] - _TOKEN_SAFETY_MARGIN > now:
                    return cached[0]

        session = self._require_session()
        try:
            resp = session.post(
                f"{self.base_url}/token",
                data={"grant_type": "client_credentials", "client_id": self.client_id},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=self.timeout,
            )
        except requests.exceptions.SSLError as e:
            raise CoraAPIError(f"Falha mTLS com o Cora (certificado/chave inválidos ou de outro ambiente): {e}")
        except requests.RequestException as e:
            raise CoraAPIError(f"Falha de comunicação com o Cora ao obter token: {e}")

        if resp.status_code != 200:
            raise CoraAPIError(
                f"Cora recusou a autenticação: {_extract_error_message(resp)}",
                status_code=resp.status_code,
            )
        data = resp.json()
        token = data.get("access_token")
        if not token:
            raise CoraAPIError("Resposta de token do Cora sem access_token.", payload=data)
        expires_in = int(data.get("expires_in") or 3600)
        with _TOKEN_LOCK:
            _TOKEN_CACHE[key] = (token, now + expires_in)
        return token

    def invalidate_token(self):
        with _TOKEN_LOCK:
            _TOKEN_CACHE.pop(self._cache_key(), None)

    # ── Requisição genérica ──────────────────────────────────────────────────
    def _request(
        self,
        method: str,
        path: str,
        json_body: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
        params: Optional[Dict[str, Any]] = None,
        _retry: bool = True,
    ) -> Any:
        session = self._require_session()
        headers = {"Authorization": f"Bearer {self.get_token()}", "Accept": "application/json"}
        if json_body is not None:
            headers["Content-Type"] = "application/json"
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        try:
            resp = session.request(
                method, f"{self.base_url}{path}", json=json_body, params=params,
                headers=headers, timeout=self.timeout,
            )
        except requests.RequestException as e:
            raise CoraAPIError(f"Falha de comunicação com o Cora ({method} {path}): {e}")

        if resp.status_code == 401 and _retry:
            # Token expirado/revogado: renova uma única vez
            self.invalidate_token()
            return self._request(method, path, json_body, idempotency_key, params, _retry=False)

        if resp.status_code >= 400:
            raise CoraAPIError(
                _extract_error_message(resp),
                status_code=resp.status_code,
                payload=(resp.text or "")[:2000],
            )
        if resp.status_code == 204 or not resp.content:
            return {}
        try:
            return resp.json()
        except ValueError:
            return {"raw": resp.text}

    # ── Boletos v2 ───────────────────────────────────────────────────────────
    def create_invoice(self, payload: Dict[str, Any], idempotency_key: Optional[str] = None) -> Dict[str, Any]:
        """POST /v2/invoices — emite boleto registrado (+ QR Code Pix quando payment_forms inclui PIX)."""
        return self._request("POST", "/v2/invoices", json_body=payload, idempotency_key=idempotency_key or str(uuid.uuid4()))

    def get_invoice(self, invoice_id: str) -> Dict[str, Any]:
        """GET /v2/invoices/{id} — detalhes e status atual (fonte da verdade para webhook/job)."""
        return self._request("GET", f"/v2/invoices/{invoice_id}")

    def cancel_invoice(self, invoice_id: str) -> Dict[str, Any]:
        """DELETE /v2/invoices/{id} — cancela boleto ainda não pago."""
        return self._request("DELETE", f"/v2/invoices/{invoice_id}")

    # ── Webhooks (endpoints) ─────────────────────────────────────────────────
    def list_endpoints(self) -> Any:
        return self._request("GET", "/endpoints/")

    def create_endpoint(self, url: str, resource: str = "invoice", trigger: str = "*") -> Dict[str, Any]:
        return self._request(
            "POST", "/endpoints/",
            json_body={"url": url, "resource": resource, "trigger": trigger},
            idempotency_key=str(uuid.uuid4()),
        )

    def delete_endpoint(self, endpoint_id: str) -> Any:
        return self._request("DELETE", f"/endpoints/{endpoint_id}")

    # ── Diagnóstico ──────────────────────────────────────────────────────────
    def test_connection(self) -> Dict[str, Any]:
        self.get_token(force=True)
        return {
            "status": "connected",
            "environment": "STAGE" if self.sandbox else "PRODUCAO",
            "message": "Autenticação mTLS com o Banco Cora realizada com sucesso.",
        }
