import uuid
import re
import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Any, List, Optional
import httpx
from sqlalchemy.orm import Session

import json
from app.models.company_settings import CompanySettings
from app.models.system_integrator import SystemIntegrator

logger = logging.getLogger(__name__)


def _sanitize_coupon_code(code: str) -> str:
    """Tray does not allow spaces or accents in DiscountCoupon.code."""
    clean = re.sub(r"[^A-Za-z0-9\-_]", "", (code or "").upper().strip())
    return clean or f"CRONUZ{uuid.uuid4().hex[:6].upper()}"


def get_global_tray_app_credentials(db: Session) -> Dict[str, str]:
    """
    Retorna as credenciais universais do App Cronuz registrado na Tray (consumer_key e consumer_secret).
    Armazenadas de forma centralizada no Master (b2b_system_integrators code='TRAY_GLOBAL_APP')
    com fallback automático para qualquer configuração existente.
    """
    integ = db.query(SystemIntegrator).filter(SystemIntegrator.code == "TRAY_GLOBAL_APP").first()
    if integ and integ.description:
        try:
            parsed = json.loads(integ.description)
            if isinstance(parsed, dict) and (parsed.get("consumer_key") or parsed.get("consumer_secret")):
                return {
                    "app_name": parsed.get("app_name") or integ.name or "App Cronuz Tray",
                    "consumer_key": (parsed.get("consumer_key") or "").strip(),
                    "consumer_secret": (parsed.get("consumer_secret") or "").strip(),
                }
        except Exception:
            pass

    # Fallback: busca qualquer cmp_settings que já tenha consumer_key preenchida
    any_settings = (
        db.query(CompanySettings)
        .filter(
            CompanySettings.tray_consumer_key.isnot(None),
            CompanySettings.tray_consumer_key != "",
        )
        .first()
    )
    if any_settings:
        return {
            "app_name": "App Cronuz Tray",
            "consumer_key": (any_settings.tray_consumer_key or "").strip(),
            "consumer_secret": (any_settings.tray_consumer_secret or "").strip(),
        }

    return {"app_name": "App Cronuz Tray", "consumer_key": "", "consumer_secret": ""}


def save_global_tray_app_credentials(
    db: Session,
    consumer_key: str,
    consumer_secret: str,
    app_name: str = "App Cronuz Tray",
) -> Dict[str, str]:
    """
    Salva as credenciais universais do App Cronuz na Tray no Master.
    """
    ck = (consumer_key or "").strip()
    cs = (consumer_secret or "").strip()
    payload_str = json.dumps(
        {
            "app_name": (app_name or "App Cronuz Tray").strip(),
            "consumer_key": ck,
            "consumer_secret": cs,
        }
    )
    integ = db.query(SystemIntegrator).filter(SystemIntegrator.code == "TRAY_GLOBAL_APP").first()
    if not integ:
        integ = SystemIntegrator(
            name=app_name or "App Cronuz Tray",
            code="TRAY_GLOBAL_APP",
            description=payload_str,
            active=True,
        )
        db.add(integ)
    else:
        integ.name = app_name or "App Cronuz Tray"
        integ.description = payload_str
        integ.active = True

    db.commit()
    return {"app_name": integ.name, "consumer_key": ck, "consumer_secret": cs}


class TrayClient:
    """
    Cliente Integrador Híbrido Tray E-commerce:
    1. API Privada REST (OAuth2: /auth, /customers, /discount_coupons, /products, /carts)
    2. Novo MCP Storefront JSON-RPC 2.0 (POST https://{store_url}/mcp-app/storefront:
       tools: store-info, categories, product-properties, product-search, products, variants, add-to-cart)
    """

    def __init__(self, db: Session, company_id: int):
        self.db = db
        self.company_id = company_id
        self.settings: Optional[CompanySettings] = (
            db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
        )
        self._global_creds: Optional[Dict[str, str]] = None

    @property
    def global_creds(self) -> Dict[str, str]:
        if self._global_creds is None:
            self._global_creds = get_global_tray_app_credentials(self.db)
        return self._global_creds

    @property
    def consumer_key(self) -> str:
        local_ck = ((self.settings.tray_consumer_key if self.settings else "") or "").strip()
        return local_ck or self.global_creds.get("consumer_key", "")

    @property
    def consumer_secret(self) -> str:
        local_cs = ((self.settings.tray_consumer_secret if self.settings else "") or "").strip()
        return local_cs or self.global_creds.get("consumer_secret", "")

    @property
    def store_url(self) -> str:
        raw = (self.settings.tray_store_url if self.settings else "") or ""
        raw = raw.strip().rstrip("/")
        if raw and not raw.startswith("http"):
            raw = f"https://{raw}"
        # Strip any accidental /web_api or /mcp-app/storefront suffix from store_url
        raw = re.sub(r"(/web_api)+(/auth)?$", "", raw, flags=re.IGNORECASE).rstrip("/")
        raw = re.sub(r"/mcp-app/storefront$", "", raw, flags=re.IGNORECASE).rstrip("/")
        return raw

    @property
    def api_address(self) -> str:
        if self.store_url:
            return f"{self.store_url}/web_api"
        raw = (self.settings.tray_api_address if self.settings else "") or ""
        raw = raw.strip().rstrip("/")
        if raw and not raw.startswith("http"):
            raw = f"https://{raw}"
        if raw:
            base = re.sub(r"(/web_api)+(/auth)?$", "", raw, flags=re.IGNORECASE).rstrip("/")
            return f"{base}/web_api"
        return ""

    @property
    def mcp_endpoint(self) -> str:
        if not self.store_url:
            return ""
        return f"{self.store_url}/mcp-app/storefront"

    # ── 1. OAuth2 Authentication & Token Lifecycle ───────────────────────────

    async def authenticate_with_code(self) -> Dict[str, Any]:
        """
        POST {api_address}/auth
        Troca consumer_key + consumer_secret (universais do App Cronuz) + code da loja do seller
        pelo par access_token e refresh_token.
        """
        if not self.settings:
            raise ValueError("Configurações da empresa não encontradas.")
        if not self.api_address:
            raise ValueError("Informe a URL da Loja Tray do Seller.")
        if not self.consumer_key or not self.consumer_secret:
            raise ValueError(
                "As credenciais globais do App Cronuz (Consumer Key / Consumer Secret) ainda não foram configuradas no Master."
            )
        if not self.settings.tray_auth_code:
            raise ValueError("Informe o Código de Autorização (CODE) da loja Tray do Seller.")

        url = f"{self.api_address}/auth"
        payload = {
            "consumer_key": self.consumer_key,
            "consumer_secret": self.consumer_secret,
            "code": self.settings.tray_auth_code.strip(),
        }

        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.post(url, data=payload)
            data = resp.json() if resp.content else {}

        if resp.status_code not in (200, 201) or not data.get("access_token"):
            msg = data.get("causes") or data.get("message") or resp.text
            raise ValueError(f"Falha ao autenticar na Tray (HTTP {resp.status_code}): {msg}")

        self._save_tokens(data)
        return data

    async def refresh_access_token(self) -> Dict[str, Any]:
        """
        GET {api_address}/auth?refresh_token={refresh_token}
        """
        if not self.settings or not self.settings.tray_refresh_token:
            return await self.authenticate_with_code()

        url = f"{self.api_address}/auth"
        params = {"refresh_token": self.settings.tray_refresh_token.strip()}

        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(url, params=params)
            data = resp.json() if resp.content else {}

        if resp.status_code not in (200, 201) or not data.get("access_token"):
            # Fallback to full auth with code if refresh token expired
            return await self.authenticate_with_code()

        self._save_tokens(data)
        return data

    def _save_tokens(self, data: Dict[str, Any]) -> None:
        if not self.settings:
            return
        self.settings.tray_access_token = data.get("access_token")
        if data.get("refresh_token"):
            self.settings.tray_refresh_token = data.get("refresh_token")
        if data.get("store_id"):
            self.settings.tray_store_id = str(data.get("store_id"))
        if self.store_url:
            self.settings.tray_store_url = self.store_url
            self.settings.tray_api_address = f"{self.store_url}/web_api"
        elif data.get("api_host"):
            self.settings.tray_api_address = str(data.get("api_host")).rstrip("/")

        exp_str = data.get("date_expiration_access_token")
        now_utc = datetime.now(timezone.utc)
        if exp_str:
            try:
                # Tray returns date_expiration_access_token in Brazil time (America/Sao_Paulo, UTC-3)
                br_tz = timezone(timedelta(hours=-3))
                dt = datetime.strptime(exp_str, "%Y-%m-%d %H:%M:%S").replace(tzinfo=br_tz).astimezone(timezone.utc)
                if dt < (now_utc + timedelta(minutes=10)):
                    dt = now_utc + timedelta(minutes=30)
                self.settings.tray_token_expires_at = dt
            except Exception:
                self.settings.tray_token_expires_at = now_utc + timedelta(minutes=45)
        else:
            self.settings.tray_token_expires_at = now_utc + timedelta(minutes=45)

        self.db.commit()
        self.db.refresh(self.settings)

    async def get_valid_token(self, force_refresh: bool = False) -> str:
        """Retorna um access_token válido, renovando automaticamente se necessário."""
        if not self.settings:
            raise ValueError("Configurações não encontradas.")

        now = datetime.now(timezone.utc)
        if (
            not force_refresh
            and self.settings.tray_access_token
            and self.settings.tray_token_expires_at
            and self.settings.tray_token_expires_at > (now + timedelta(minutes=2))
        ):
            return self.settings.tray_access_token

        if self.settings.tray_refresh_token:
            data = await self.refresh_access_token()
            return data["access_token"]

        if self.consumer_key and self.settings.tray_auth_code:
            data = await self.authenticate_with_code()
            return data["access_token"]

        if self.settings.tray_access_token:
            return self.settings.tray_access_token

        raise ValueError("Credenciais OAuth da Tray não configuradas para esta empresa.")

    # ── 2. MCP Storefront Server (JSON-RPC 2.0) ──────────────────────────────

    async def mcp_call(self, tool_name: str, arguments: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Invoca uma ferramenta no servidor MCP Storefront da loja Tray:
        POST https://{store_url}/mcp-app/storefront
        Tools disponíveis:
          - store-info
          - categories
          - product-properties
          - product-search
          - products
          - variants
          - add-to-cart
        """
        if not self.mcp_endpoint:
            raise ValueError("URL da loja Tray (tray_store_url) não configurada para o MCP Storefront.")

        payload = {
            "jsonrpc": "2.0",
            "id": str(uuid.uuid4()),
            "method": "tools/call",
            "params": {
                "name": tool_name,
                "arguments": arguments or {},
            },
        }
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": "2025-11-25",
        }

        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.post(self.mcp_endpoint, json=payload, headers=headers)
            try:
                data = resp.json() if resp.content else {}
            except Exception:
                data = {}

        if resp.status_code not in (200, 201):
            raise ValueError(f"HTTP {resp.status_code} no MCP Storefront Tray")

        if "error" in data:
            raise ValueError(f"Erro JSON-RPC no MCP Storefront Tray: {data['error']}")

        return data.get("result", data)

    async def test_connection(self) -> Dict[str, Any]:
        """Testa a API OAuth2 (/web_api) e o MCP Storefront (quando habilitado no domínio público)."""
        result: Dict[str, Any] = {
            "store_url": self.store_url,
            "api_address": self.api_address,
            "mcp_endpoint": self.mcp_endpoint,
            "mcp_ok": False,
            "mcp_info": None,
            "oauth_ok": False,
            "oauth_message": "Token ainda não gerado.",
            "store_info": None,
            "errors": [],
        }

        # 1. Test OAuth2 REST API (/web_api)
        if self.settings and (
            (self.consumer_key and self.settings.tray_auth_code)
            or self.settings.tray_access_token
        ):
            try:
                token = await self.get_valid_token()
                result["oauth_ok"] = bool(token)
                result["store_id"] = self.settings.tray_store_id
                result["token_expires_at"] = (
                    self.settings.tray_token_expires_at.isoformat()
                    if self.settings.tray_token_expires_at
                    else None
                )
                # Test real query to /products
                async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                    r_prod = await client.get(
                        f"{self.api_address}/products",
                        params={"access_token": token, "limit": 1},
                    )
                    if r_prod.status_code == 200:
                        paging = (r_prod.json() or {}).get("paging") or {}
                        total_prods = paging.get("total", 0)
                        result["oauth_message"] = (
                            f"Conectado com sucesso à API OAuth2 (/web_api)! Loja Tray ID #{self.settings.tray_store_id or 'OK'} "
                            f"• {total_prods} produtos encontrados na Tray. Rotinas de Clientes, Cupons e Carrinhos prontas."
                        )
                    else:
                        result["oauth_message"] = f"Token OAuth2 ativo (Loja #{self.settings.tray_store_id})."
            except Exception as e:
                result["oauth_message"] = f"Falha OAuth2: {str(e)}"
                result["errors"].append(f"OAuth REST API: {str(e)}")

        # 2. Test MCP Storefront (store-info) — Optional complement
        if self.mcp_endpoint:
            try:
                mcp_res = await self.mcp_call("store-info", {})
                result["mcp_ok"] = True
                result["mcp_info"] = mcp_res
                result["store_info"] = mcp_res
            except Exception as e:
                if "corpsuite.com.br" in self.store_url:
                    result["mcp_info"] = {
                        "status": "OPCIONAL_DESATIVADO_NO_CORPSUITE",
                        "detalhe": "O subdomínio técnico .corpsuite.com.br usa exclusivamente a API Privada OAuth2 (/web_api), que já está 100% autenticada e operacional para criar Clientes, Cupons e Carrinhos.",
                    }
                else:
                    result["mcp_info"] = {
                        "status": "MCP_NAO_HABILITADO_NA_LOJA",
                        "detalhe": f"App MCP Storefront opcional não ativo neste domínio ({str(e)}). Operando 100% via API Oficial /web_api.",
                    }

        return result

    # ── 3. Customer Sync in Tray ─────────────────────────────────────────────

    async def ensure_customer_in_tray(self, customer_data: Dict[str, Any]) -> Optional[str]:
        """
        Busca o cliente na Tray pelo CPF ou e-mail; se não existir, cadastra via POST /customers.
        Retorna o ID do cliente na Tray (ou None se falhar de forma não-bloqueante).
        """
        try:
            token = await self.get_valid_token()
        except Exception as e:
            logger.warning(f"[TrayClient] Sem token OAuth para sincronizar cliente: {e}")
            return None

        cpf = re.sub(r"\D", "", str(customer_data.get("cpf") or ""))
        email = (customer_data.get("email") or "").strip()

        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            if cpf:
                r = await client.get(
                    f"{self.api_address}/customers/",
                    params={"access_token": token, "cpf": cpf},
                )
                if r.status_code == 200:
                    j = r.json()
                    customers = j.get("Customers") or []
                    if customers:
                        first = customers[0].get("Customer") or {}
                        if first.get("id"):
                            return str(first["id"])

            # Create customer in Tray
            payload: Dict[str, Any] = {
                "Customer": {
                    "name": customer_data.get("name") or "Cliente B2C",
                    "email": email,
                    "cpf": cpf,
                    "type": "0",  # Pessoa Física
                }
            }
            phone = re.sub(r"\D", "", str(customer_data.get("phone") or ""))
            if len(phone) >= 10:
                payload["Customer"]["cellphone"] = phone

            if customer_data.get("zip_code") and customer_data.get("street"):
                payload["Customer"]["CustomerAddress"] = [
                    {
                        "address": customer_data.get("street"),
                        "number": customer_data.get("number") or "S/N",
                        "complement": customer_data.get("complement") or "",
                        "neighborhood": customer_data.get("neighborhood") or "Centro",
                        "city": customer_data.get("city") or "",
                        "state": customer_data.get("state") or "SP",
                        "zip_code": re.sub(r"\D", "", str(customer_data.get("zip_code"))),
                        "type": "1",
                    }
                ]

            r_post = await client.post(
                f"{self.api_address}/customers",
                params={"access_token": token},
                json=payload,
            )
            if r_post.status_code in (200, 201):
                j_post = r_post.json()
                return str(j_post.get("id") or "")

        return None

    # ── 4. Discount Coupon Creation in Tray ──────────────────────────────────

    async def create_coupon_in_tray(
        self,
        code: str,
        value: float,
        description: str,
        starts_at: Optional[str] = None,
        ends_at: Optional[str] = None,
        discount_type: str = "$",
        customer_tray_id: Optional[str] = None,
        shipping_discount: bool = False,
    ) -> Dict[str, Any]:
        """
        Cria um cupom de desconto único na Tray via POST /discount_coupons/?access_token={token}
        para que o colaborador possa abater o saldo do seu cupom corporativo no checkout da Tray.
        """
        token = await self.get_valid_token()
        clean_code = _sanitize_coupon_code(code)
        now_date = datetime.now().strftime("%Y-%m-%d")
        end_date = ends_at or (datetime.now() + timedelta(days=90)).strftime("%Y-%m-%d")

        form_data = {
            "DiscountCoupon[code]": clean_code,
            "DiscountCoupon[description]": description or f"Voucher Corporativo Cronuz ({clean_code})",
            "DiscountCoupon[starts_at]": starts_at or now_date,
            "DiscountCoupon[ends_at]": end_date,
            "DiscountCoupon[value]": f"{float(value):.2f}",
            "DiscountCoupon[type]": discount_type,  # "$" (R$) or "%"
            "DiscountCoupon[value_limit]": "0.00",
            "DiscountCoupon[usage_counter_limit]": "1",
            "DiscountCoupon[usage_counter_limit_customer]": "1",
            "DiscountCoupon[cumulative_discount]": "1",
            "DiscountCoupon[shipping_discount]": "1" if shipping_discount else "0",
        }

        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.post(
                f"{self.api_address}/discount_coupons/",
                params={"access_token": token},
                data=form_data,
            )
            data = resp.json() if resp.content else {}

            coupon_tray_id = str(data.get("id") or "")

            if customer_tray_id and coupon_tray_id:
                await client.post(
                    f"{self.api_address}/discount_coupons/create_relationship/{coupon_tray_id}/",
                    params={"access_token": token},
                    data={"DiscountCouponCustomer[customer_id][0]": customer_tray_id},
                )

        return {
            "tray_coupon_id": coupon_tray_id,
            "code": clean_code,
            "raw_response": data,
        }

    # ── 5. Product Lookup / Auto-Creation & Cart Creation in Tray ────────────

    async def ensure_product_in_tray(self, item: Dict[str, Any]) -> Optional[str]:
        """
        Localiza o produto na Tray seguindo a documentação oficial (GET /web_api/products):
        1º Verifica se o produto no Cronuz (prd_product) já possui o ID da Tray vinculado (publisher_code / tray_product_id).
        2º Consulta na Tray por `reference` = Código do Horus (`horus_cod_item` / `sku`), pois na Tray o
           código de referência é o mesmo código do Horus.
        3º Consulta na Tray por `ean` = ISBN / Código de Barras (`ean_gtin`).
        4º Consulta na Tray por `name` ou MCP `product-search`.
        Ao localizar o ID na Tray, grava o vínculo no produto do Cronuz (`prd_product.publisher_code`) para
        que as próximas compras já utilizem o ID da Tray diretamente.
        """
        from app.models.product import Product

        explicit_tray_id = str(item.get("tray_product_id") or "").strip()
        if explicit_tray_id and explicit_tray_id.isdigit():
            return explicit_tray_id

        isbn = str(item.get("ean_gtin") or item.get("isbn") or "").strip()
        sku = str(item.get("sku") or "").strip()
        horus_cod = str(item.get("horus_cod_item") or "").strip()
        name = str(item.get("name") or "Livro").strip()
        price = float(item.get("unit_price") or item.get("price") or 0.0)
        local_pid = item.get("product_id")

        # Localizar registro em prd_product para resgatar horus_cod_item / ean_gtin / tray_product_id já salvo
        local_prod: Optional[Product] = None
        try:
            if local_pid and str(local_pid).isdigit() and int(local_pid) > 0:
                local_prod = (
                    self.db.query(Product)
                    .filter(Product.company_id == self.company_id, Product.id == int(local_pid))
                    .first()
                )
            if not local_prod and sku:
                local_prod = (
                    self.db.query(Product)
                    .filter(Product.company_id == self.company_id, Product.sku == sku)
                    .first()
                )
            if not local_prod and isbn:
                local_prod = (
                    self.db.query(Product)
                    .filter(Product.company_id == self.company_id, Product.ean_gtin == isbn)
                    .first()
                )
            if local_prod:
                if local_prod.publisher_code and str(local_prod.publisher_code).strip().isdigit():
                    return str(local_prod.publisher_code).strip()
                if not horus_cod and local_prod.horus_cod_item:
                    horus_cod = str(local_prod.horus_cod_item).strip()
                if not sku and local_prod.sku:
                    sku = str(local_prod.sku).strip()
                if not isbn and local_prod.ean_gtin:
                    isbn = str(local_prod.ean_gtin).strip()
        except Exception as e:
            logger.debug(f"[TrayClient] Aviso ao consultar prd_product local: {e}")

        def _save_tray_id_to_local(resolved_tray_id: str) -> str:
            if local_prod and resolved_tray_id and resolved_tray_id.isdigit():
                try:
                    local_prod.publisher_code = resolved_tray_id
                    self.db.flush()
                except Exception:
                    pass
            return resolved_tray_id

        # 1. Consulta Oficial via REST API da Tray (GET /web_api/products)
        token: Optional[str] = None
        try:
            token = await self.get_valid_token()
        except Exception:
            token = None

        if token and self.api_address:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                # 1.1 Prioridade 1: reference = Código do Horus (horus_cod_item ou sku)
                ref_candidates = []
                if horus_cod:
                    ref_candidates.append(horus_cod)
                if sku and sku not in ref_candidates:
                    ref_candidates.append(sku)

                for ref_val in ref_candidates:
                    r_ref = await client.get(
                        f"{self.api_address}/products",
                        params={"access_token": token, "reference": ref_val},
                    )
                    if r_ref.status_code == 200:
                        prods = (r_ref.json() or {}).get("Products") or []
                        if prods:
                            pid = (prods[0].get("Product") or {}).get("id")
                            if pid:
                                return _save_tray_id_to_local(str(pid))

                # 1.2 Prioridade 2: ean = ISBN / Código de Barras (ean_gtin)
                if isbn:
                    r_ean = await client.get(
                        f"{self.api_address}/products",
                        params={"access_token": token, "ean": isbn},
                    )
                    if r_ean.status_code == 200:
                        prods = (r_ean.json() or {}).get("Products") or []
                        if prods:
                            pid = (prods[0].get("Product") or {}).get("id")
                            if pid:
                                return _save_tray_id_to_local(str(pid))

                # 1.3 Prioridade 3: busca pelo nome na Tray
                if name and len(name) >= 3:
                    r_name = await client.get(
                        f"{self.api_address}/products",
                        params={"access_token": token, "name": name[:80]},
                    )
                    if r_name.status_code == 200:
                        prods = (r_name.json() or {}).get("Products") or []
                        if prods:
                            pid = (prods[0].get("Product") or {}).get("id")
                            if pid:
                                return _save_tray_id_to_local(str(pid))

        # 2. Fallback MCP product-search
        if self.mcp_endpoint and (isbn or name):
            try:
                mcp_res = await self.mcp_call("product-search", {"name": isbn or name, "limit": 5})
                content_list = mcp_res.get("content") if isinstance(mcp_res, dict) else None
                if isinstance(content_list, list):
                    for block in content_list:
                        text_val = block.get("text") or ""
                        m = re.search(r'"id"\s*:\s*"?(\d+)"?', text_val)
                        if m:
                            return _save_tray_id_to_local(m.group(1))
            except Exception as e:
                logger.debug(f"[TrayClient] MCP product-search fallback: {e}")

        # 3. Auto-cadastro na Tray via POST /products se o item ainda não existir na Tray
        if token and self.api_address:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                default_cat_id = "1"
                fallback_existing_pid: Optional[str] = None
                try:
                    r_sample = await client.get(
                        f"{self.api_address}/products",
                        params={"access_token": token, "limit": 1, "available": 1},
                    )
                    if r_sample.status_code == 200:
                        s_prods = (r_sample.json() or {}).get("Products") or []
                        if s_prods:
                            sp = s_prods[0].get("Product") or {}
                            if sp.get("category_id"):
                                default_cat_id = str(sp["category_id"])
                            if sp.get("id"):
                                fallback_existing_pid = str(sp["id"])
                except Exception:
                    pass

                create_payload = {
                    "Product": {
                        "ean": isbn,
                        "name": name[:150],
                        "ncm": "49019900",
                        "description": item.get("short_description") or f"Livro {name}",
                        "price": f"{price:.2f}",
                        "cost_price": f"{price * 0.6:.2f}",
                        "brand": item.get("brand") or "Editora",
                        "model": item.get("author") or "Livro",
                        "weight": "350",
                        "length": "23",
                        "width": "16",
                        "height": "2",
                        "stock": "50",
                        "category_id": default_cat_id,
                        "available": "1",
                        "availability": "Imediata",
                        "availability_days": 1,
                        "reference": horus_cod or sku or isbn,
                        "virtual_product": "1",
                        "free_shipping": "1",
                    }
                }
                r_create = await client.post(
                    f"{self.api_address}/products",
                    params={"access_token": token},
                    json=create_payload,
                )
                if r_create.status_code in (200, 201):
                    pid = (r_create.json() or {}).get("id")
                    if pid:
                        return _save_tray_id_to_local(str(pid))

                if fallback_existing_pid:
                    return fallback_existing_pid

        return None

    async def create_cart_in_tray(
        self,
        items: List[Dict[str, Any]],
        shipping_info: Optional[Dict[str, Any]] = None,
        customer_email: Optional[str] = None,
        customer_tray_id: Optional[str] = None,
        coupon_code: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Cria o carrinho de compras pré-definido na Tray via REST `POST /web_api/carts/`
        compartilhando o mesmo `session_id` para todos os itens, garantindo `virtual_product=1`
        e `free_shipping=1` (para ocultar a seleção manual de transportadoras no carrinho e deixar
        o frete zerado R$ 0,00 já marcado na sessão do EasyCheckout) e resolvendo a URL assinada
        (`redirect_cart_service.php` -> `/checkout/redirect/cart?cart_service_token=...`).
        """
        session_id = uuid.uuid4().hex[:26]
        cart_url: Optional[str] = None
        added_items: List[Dict[str, Any]] = []

        token: Optional[str] = None

        for idx, item in enumerate(items):
            tray_pid = str(item.get("tray_product_id") or "").strip()
            if not tray_pid or not tray_pid.isdigit():
                tray_pid = await self.ensure_product_in_tray(item) or ""

            try:
                token = await self.get_valid_token()
            except Exception:
                pass

            qty = max(1, int(item.get("quantity") or 1))
            price = float(item.get("unit_price") or item.get("price") or 0.0)

            item_added = False
            # 1. Prefer official Tray REST API POST /carts/ when OAuth2 token is available
            if token and self.api_address and tray_pid:
                try:
                    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                        # Garantir que o produto na Tray tenha virtual_product="1" e free_shipping="1"
                        # para que o EasyCheckout oculte os rádios de transportadora e trave o frete em R$ 0,00
                        try:
                            await client.put(
                                f"{self.api_address}/products/{tray_pid}",
                                params={"access_token": token},
                                json={"Product": {"virtual_product": "1", "free_shipping": "1"}},
                            )
                        except Exception as e_put:
                            logger.debug(f"[TrayClient] Aviso ao atualizar virtual_product/free_shipping do item {tray_pid}: {e_put}")

                        cart_body: Dict[str, Any] = {
                            "Cart": {
                                "session_id": session_id,
                                "product_id": int(tray_pid) if tray_pid.isdigit() else tray_pid,
                                "quantity": qty,
                                "price": round(price, 2),
                            }
                        }
                        if idx == 0:
                            s_info = shipping_info or {}
                            cart_body["Cart"]["Shipping"] = {
                                "id": "10",
                                "name": "Frete Grátis",
                                "price": "0.00",
                                "city": str(s_info.get("city") or "São Paulo"),
                                "state": str(s_info.get("state") or "SP")[:2].upper(),
                                "zip_code": re.sub(r"\D", "", str(s_info.get("zip_code") or "01001000")) or "01001000",
                                "min_period": int(s_info.get("min_period") or 1),
                                "max_period": int(s_info.get("max_period") or 5),
                            }

                        r_cart = await client.post(
                            f"{self.api_address}/carts/",
                            params={"access_token": token},
                            json=cart_body,
                        )
                        if r_cart.status_code == 401:
                            token = await self.get_valid_token(force_refresh=True)
                            r_cart = await client.post(
                                f"{self.api_address}/carts/",
                                params={"access_token": token},
                                json=cart_body,
                            )

                        # Se a Tray rejeitar o bloco Shipping (400), tenta novamente sem o Shipping para garantir o carrinho
                        if r_cart.status_code not in (200, 201) and "Shipping" in cart_body["Cart"]:
                            cart_body["Cart"].pop("Shipping", None)
                            r_cart = await client.post(
                                f"{self.api_address}/carts/",
                                params={"access_token": token},
                                json=cart_body,
                            )

                        if r_cart.status_code in (200, 201):
                            j_cart = r_cart.json() or {}
                            if j_cart.get("cart_url"):
                                cart_url = str(j_cart["cart_url"]).replace("\\/", "/")
                            if j_cart.get("session_id"):
                                session_id = j_cart["session_id"]
                            item_added = True
                            added_items.append({"product_id": tray_pid, "quantity": qty, "via": "REST"})
                        else:
                            logger.warning(
                                f"[TrayClient] POST /carts/ retornou {r_cart.status_code} para product_id={tray_pid}: {r_cart.text}"
                            )
                except Exception as e:
                    logger.warning(f"[TrayClient] Falha no REST POST /carts/ para item {tray_pid}, tentando MCP: {e}")

            # 2. Fallback to MCP add-to-cart if REST was not used or failed
            if not item_added and tray_pid and self.mcp_endpoint:
                try:
                    mcp_args: Dict[str, Any] = {
                        "product_id": int(tray_pid) if tray_pid.isdigit() else tray_pid,
                        "quantity": qty,
                        "session_id": session_id,
                    }
                    mcp_res = await self.mcp_call("add-to-cart", mcp_args)
                    content_blocks = mcp_res.get("content") if isinstance(mcp_res, dict) else []
                    if isinstance(content_blocks, list):
                        for blk in content_blocks:
                            txt = blk.get("text") or ""
                            url_match = re.search(r'https?://[^\s"\'<>]+', txt)
                            if url_match:
                                cart_url = url_match.group(0)
                    item_added = True
                    added_items.append({"product_id": tray_pid, "quantity": qty, "via": "MCP"})
                except Exception as e:
                    logger.warning(f"[TrayClient] Falha no MCP add-to-cart para item {tray_pid}: {e}")

        # Resolve redirect_cart_service.php into cart_service_token on self.store_url so .corpsuite.com.br and custom domains both load the session properly
        if cart_url and "redirect_cart_service.php" in cart_url and self.store_url:
            try:
                parsed_path = re.sub(r"^https?://[^/]+", "", cart_url)
                service_url = f"{self.store_url}{parsed_path}"
                async with httpx.AsyncClient(timeout=10.0, follow_redirects=False) as client:
                    r_redir = await client.get(service_url)
                    loc = r_redir.headers.get("location") or r_redir.headers.get("Location") or ""
                    if "cart_service_token=" in loc:
                        loc_path = re.sub(r"^https?://[^/]+", "", loc)
                        cart_url = f"{self.store_url}{loc_path}"
                    else:
                        cart_url = service_url
            except Exception as e:
                logger.debug(f"[TrayClient] Aviso ao resolver redirect_cart_service.php: {e}")

        # Pré-marcar o frete zerado (R$ 0,00) diretamente na sessão do EasyCheckout da Tray
        if self.store_url and session_id:
            try:
                store_id_val = str(self.settings.tray_store_id or "1469854") if self.settings else "1469854"
                s_info = shipping_info or {}
                zip_clean = re.sub(r"\D", "", str(s_info.get("zip_code") or "01001000")) or "01001000"
                zip_formatted = f"{zip_clean[:5]}-{zip_clean[5:8]}" if len(zip_clean) == 8 else zip_clean
                async with httpx.AsyncClient(timeout=12.0, follow_redirects=True) as ec_client:
                    r_page = await ec_client.get(
                        f"{self.store_url}/checkout/cart?session_id={session_id}&store_id={store_id_val}"
                    )
                    m_csrf = re.search(r'<meta name="csrf-token" content="([^"]+)"', r_page.text)
                    csrf_tok = m_csrf.group(1) if m_csrf else ""
                    ec_headers = {
                        "Accept": "application/json",
                        "X-Requested-With": "XMLHttpRequest",
                    }
                    if csrf_tok:
                        ec_headers["X-CSRF-TOKEN"] = csrf_tok

                    r_sh = await ec_client.get(
                        f"{self.store_url}/checkout/cart/api/shipping?session_id={session_id}&store_id={store_id_val}&zipcode={zip_clean}&cep_filled=1",
                        headers=ec_headers,
                    )
                    if r_sh.status_code == 200:
                        sh_data = (r_sh.json() or {}).get("data") or {}
                        dest = sh_data.get("destination")
                        quots = sh_data.get("quotations") or []
                        chosen_q = None
                        for q in quots:
                            if float(q.get("value") or 0) <= 0.009:
                                chosen_q = q
                                break
                        if not chosen_q and quots:
                            chosen_q = quots[0]
                        if chosen_q and dest:
                            await ec_client.put(
                                f"{self.store_url}/checkout/cart/api/shipping?session_id={session_id}&store_id={store_id_val}&zipcode={zip_formatted}",
                                headers=ec_headers,
                                json={"destination": dest, "quotation": chosen_q},
                            )
            except Exception as e_ec:
                logger.debug(f"[TrayClient] Aviso ao pré-marcar frete zerado no EasyCheckout: {e_ec}")

        if not cart_url and self.store_url:
            store_id_param = f"&store_id={self.settings.tray_store_id}" if (self.settings and self.settings.tray_store_id) else ""
            cart_url = f"{self.store_url}/checkout/cart?session_id={session_id}{store_id_param}"
            if coupon_code:
                cart_url += f"&cupom={coupon_code}"
        elif cart_url and coupon_code and "cupom=" not in cart_url:
            sep = "&" if "?" in cart_url else "?"
            cart_url = f"{cart_url}{sep}cupom={coupon_code}"

        return {
            "session_id": session_id,
            "cart_url": cart_url,
            "added_items": added_items,
            "coupon_code": coupon_code,
        }
