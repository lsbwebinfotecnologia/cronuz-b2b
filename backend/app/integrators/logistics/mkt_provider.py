import asyncio
import logging
import httpx
from typing import List, Optional
from app.integrators.logistics.base_provider import LogisticsProvider
from app.models.logistics_settings import LogisticsSettings
from app.core.horus_sql_crypto import decrypt_sql_credential

logger = logging.getLogger(__name__)

class MKTProvider(LogisticsProvider):
    def _get_auth(self):
        password = decrypt_sql_credential(self.settings.password) if self.settings.password else ""
        return (self.settings.login or "", password)

    def _get_client(self):
        base_url = (self.settings.api_url or "").rstrip("/")
        limits = httpx.Limits(max_keepalive_connections=5, max_connections=10, keepalive_expiry=30.0)
        return httpx.AsyncClient(
            base_url=base_url,
            auth=self._get_auth(),
            timeout=25.0,
            limits=limits,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
        )

    async def test_connection(self) -> dict:
        """Testa a conexão com a API MKT usando os parâmetros corretos."""
        if not self.settings.api_url:
            return {"success": False, "message": "URL da API não configurada."}
        if not self.settings.login:
            return {"success": False, "message": "Usuário (login) não configurado."}
        if not self.settings.password:
            return {"success": False, "message": "Senha não configurada. Salve as credenciais com uma senha válida."}

        try:
            async with self._get_client() as client:
                # Parâmetros corretos conforme doc MKT: data_inicial/data_final + armazem_id + cliente_id
                params = {
                    "armazem_id": self.settings.warehouse_id or "",
                    "cliente_id": self.settings.client_id or "",
                    "data_inicial": "2000-01-01",
                    "data_final": "2000-01-01",
                    "situacao": "aguardando_nfe",
                }
                response = await client.get("/movimento/saida.json", params=params)

                if response.status_code == 403:
                    return {
                        "success": False,
                        "status_code": 403,
                        "message": "Credenciais inválidas ou sem permissão (403 Forbidden). Verifique usuário, senha, armazém e cliente ID.",
                    }
                if response.status_code == 401:
                    return {
                        "success": False,
                        "status_code": 401,
                        "message": "Não autorizado (401). Usuário ou senha incorretos.",
                    }

                response.raise_for_status()
                return {
                    "success": True,
                    "status_code": response.status_code,
                    "message": f"Conexão OK! API MKT respondeu com {response.status_code}.",
                }
        except httpx.ConnectError:
            return {"success": False, "message": f"Não foi possível conectar à URL: {self.settings.api_url}. Verifique a URL da API."}
        except httpx.TimeoutException:
            return {"success": False, "message": "Timeout ao tentar conectar. A API demorou mais que 25 segundos."}
        except Exception as e:
            return {"success": False, "message": str(e)}

    async def get_order_by_ref(self, cod_ped: int) -> Optional[dict]:
        """
        Busca pontualmente uma remessa no WMS pelo código de referência.
        Evita a varredura pesada de páginas de movimentos no WMS (1 requisição leve).
        """
        try:
            async with self._get_client() as client:
                params = {
                    "armazem_id": self.settings.warehouse_id or "",
                    "cliente_id": self.settings.client_id or "",
                    "codigo_referencia": str(cod_ped).strip(),
                    "limit": 1
                }
                r = await client.get("/movimento/saida.json", params=params)
                if r.status_code == 200:
                    data = r.json()
                    res_list = data.get("data", {}).get("resultados", []) if isinstance(data.get("data"), dict) else data.get("resultados", [])
                    if isinstance(res_list, list) and len(res_list) > 0:
                        return res_list[0]
        except Exception as e:
            logger.debug(f"[MKTProvider.get_order_by_ref] Erro ao buscar ref {cod_ped}: {e}")
        return None

    async def send_order(self, payload: dict) -> dict:
        async with self._get_client() as client:
            response = await client.post("/remessa_pedido/novo.json", json=payload)
            try:
                data = response.json()
            except Exception:
                data = {"raw": response.text}

            # Se a resposta contiver legado_pedido_id (mesmo com avisos), é sucesso!
            from app.api.logistics import _extract_legado_id
            legado_id = _extract_legado_id(data)
            if legado_id:
                return data

            # Se indicar que já foi integrado antes, retorna os dados para conciliação
            err_list = data.get("errors") if isinstance(data, dict) else []
            is_already_integrated = any("integrado antes" in str(e).lower() for e in err_list)
            if is_already_integrated:
                return data

            if response.status_code == 429:
                raise Exception("RATE_LIMIT: Limite de requisições por minuto atingido na API do WMS MKT. Aguardando próximo ciclo.")

            if response.status_code >= 400:
                msg = None
                if isinstance(data, dict):
                    errs = data.get("errors")
                    if isinstance(errs, list) and errs:
                        msg = "; ".join(str(x) for x in errs)
                    else:
                        msg = data.get("mensagem") or data.get("error") or data.get("detail") or data.get("motivo") or data.get("msg") or str(data)
                elif isinstance(data, list):
                    msg = "; ".join(str(x) for x in data)
                raise Exception(f"Crítica do WMS MKT ({response.status_code}): {msg or response.text[:200]}")

            if isinstance(data, dict) and data.get("errors"):
                errs = data.get("errors")
                if isinstance(errs, list) and len(errs) > 0:
                    msg = "; ".join(str(x) for x in errs)
                    raise Exception(f"Crítica do WMS MKT: {msg}")

            return data

    async def get_movements(
        self,
        start_date: str,
        end_date: str,
        situacao: Optional[str] = None,
        codigo_referencia: Optional[str] = None,
        max_pages: int = 1
    ) -> List[dict]:
        """
        Busca movimentos/remessas no MKT por período com segurança anti-bloqueio.
        Por padrão, faz apenas 1 requisição direta para evitar sobrecarregar o WMS.
        Se max_pages > 1, percorre as páginas aplicando delay entre chamadas.
        """
        all_results = []
        page = 1
        limit = 50

        async with self._get_client() as client:
            while page <= max_pages:
                params = {
                    "armazem_id": self.settings.warehouse_id or "",
                    "cliente_id": self.settings.client_id or "",
                    "data_inicial": start_date,
                    "data_final": end_date,
                    "page": page,
                    "limit": limit,
                }
                if situacao:
                    params["situacao"] = situacao
                if codigo_referencia:
                    params["codigo_referencia"] = str(codigo_referencia).strip()

                data = None
                for attempt in range(2):
                    try:
                        response = await client.get("/movimento/saida.json", params=params)
                        if response.status_code == 429:
                            logger.warning(f"[MKTProvider.get_movements] 429 Too Many Requests (página {page}). Aguardando 10s...")
                            await asyncio.sleep(10.0)
                            continue
                        response.raise_for_status()
                        data = response.json()
                        break
                    except Exception as e:
                        logger.warning(f"[MKTProvider.get_movements] Erro na tentativa {attempt+1} (página {page}): {e}")
                        if attempt == 0:
                            await asyncio.sleep(3.0)

                if not data:
                    break

                if isinstance(data, dict):
                    inner_data = data.get("data")
                    resultados = []
                    if isinstance(inner_data, dict):
                        resultados = inner_data.get("resultados") or []
                    elif isinstance(data.get("resultados"), list):
                        resultados = data.get("resultados") or []
                    elif isinstance(inner_data, list):
                        resultados = inner_data

                    if resultados:
                        all_results.extend(resultados)
                        if codigo_referencia:
                            break

                    paginacao = data.get("paginacao") or {}
                    page_count = paginacao.get("pageCount") or 1
                    if page >= page_count or not resultados or page >= max_pages:
                        break
                    page += 1
                    await asyncio.sleep(2.0)  # Delay preventivo entre páginas
                elif isinstance(data, list):
                    all_results.extend(data)
                    break
                else:
                    break

        return all_results

    async def invoice_order(self, id_sys_log: str, payload: dict) -> dict:
        async with self._get_client() as client:
            for attempt in range(4):
                response = await client.put("/remessa_pedido/faturar.json", json=payload)
                if response.status_code == 429:
                    wait_time = (attempt + 1) * 30.0
                    logger.warning(f"[MKTProvider.invoice_order] 429 Too Many Requests (tentativa {attempt+1}). Aguardando {wait_time}s para liberar janela do WMS...")
                    await asyncio.sleep(wait_time)
                    continue
                response.raise_for_status()
                return response.json()
            raise Exception("WMS MKT retornou 429 (Too Many Requests) após 4 tentativas de backoff.")
