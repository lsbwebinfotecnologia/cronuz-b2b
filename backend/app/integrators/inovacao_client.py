"""
Integrador Inovação Distribuidora (SimpleSet API)
------------------------------------------------
Base URL padrão: https://simpleset.inovacaodistribuidora.com.br

Autenticação:
  Headers por requisição:
    X-SimpleSet-Username: <login do usuário no SimpleSet>
    X-SimpleSet-API-Key:  md5(username + data(Y-m-d) + md5(password))
  Calculado deterministicamente com base na data do dia (Fuso Brasília/UTC-3).

Consulta de estoque por ISBN-13 / EAN:
  GET /api/estoques?isbn13=<isbn>
  Retorno 200:
    {"code": 200, "message": "OK", "estoques": {"<cnpj>": {"<isbn>": <saldo>}}}
  Retorno 404:
    {"code": 404, "message": "Produto não encontrado"}

Inclusão de pedidos:
  POST /api/pedidos
  Body: {"CodCliente": "...", "PedidoCliente": "...", "itens": [{"isbn13": "...", "qtd": 1}]}
"""

from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta
import hashlib
import httpx
import logging

logger = logging.getLogger(__name__)

INOVACAO_DEFAULT_BASE_URL = "https://simpleset.inovacaodistribuidora.com.br"
# Timezone oficial de Brasília (UTC-3)
TZ_BRASILIA = timezone(timedelta(hours=-3))


class InovacaoClient:
    """
    Cliente assíncrono para a API da Inovação Distribuidora (SimpleSet).
    """

    def __init__(
        self,
        base_url: str,
        username: str,
        password: str,
        timeout_seconds: float = 12.0,
    ):
        raw_url = (base_url or INOVACAO_DEFAULT_BASE_URL).strip().rstrip("/")
        if not raw_url.startswith("http://") and not raw_url.startswith("https://"):
            raw_url = f"https://{raw_url}"
        self.base_url = raw_url
        self.username = (username or "").strip()
        self.password = (password or "").strip()
        self.timeout = httpx.Timeout(timeout_seconds, connect=4.0, read=timeout_seconds)

    def generate_api_key(self, ref_date: Optional[datetime] = None) -> str:
        """
        Calcula a X-SimpleSet-API-Key com base na fórmula oficial da documentação:
        md5(username + Y-m-d + md5(password))
        """
        now = ref_date or datetime.now(TZ_BRASILIA)
        today_str = now.strftime("%Y-%m-%d")

        pwd_md5 = hashlib.md5(self.password.encode("utf-8")).hexdigest()
        raw_token = f"{self.username}{today_str}{pwd_md5}"
        return hashlib.md5(raw_token.encode("utf-8")).hexdigest()

    def get_headers(self) -> Dict[str, str]:
        """
        Retorna os headers de autenticação requeridos pelo SimpleSet.
        """
        return {
            "X-SimpleSet-Username": self.username,
            "X-SimpleSet-API-Key": self.generate_api_key(),
            "Accept": "application/json",
            "User-Agent": "CronuzB2B/1.0",
        }

    async def get_stock_by_isbn(self, isbn: str) -> Dict[str, Any]:
        """
        Consulta o estoque de um produto pelo EAN/ISBN na Inovação.

        GET /api/estoques?isbn13=<isbn>

        Returns:
            {
              "found": bool,
              "saldo": int,
              "preco": float | None,
              "titulo": str | None,
              "raw": dict,
              "error": str | None,
            }
        """
        clean_isbn = "".join(c for c in (isbn or "") if c.isalnum()).strip()
        if not clean_isbn:
            return {
                "found": False,
                "saldo": 0,
                "preco": None,
                "titulo": None,
                "raw": {},
                "error": "ISBN não informado para consulta na Inovação.",
            }

        if not self.username or not self.password:
            return {
                "found": False,
                "saldo": 0,
                "preco": None,
                "titulo": None,
                "raw": {},
                "error": "Credenciais da Inovação Distribuidora não configuradas.",
            }

        url = f"{self.base_url}/api/estoques"
        headers = self.get_headers()

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, params={"isbn13": clean_isbn}, headers=headers)

            if resp.status_code == 404:
                # Produto não encontrado no catálogo da distribuidora
                return {
                    "found": False,
                    "saldo": 0,
                    "preco": None,
                    "titulo": None,
                    "raw": {},
                    "error": None,
                }

            if resp.status_code in (401, 403):
                return {
                    "found": False,
                    "saldo": 0,
                    "preco": None,
                    "titulo": None,
                    "raw": {},
                    "error": "Credenciais da Inovação inválidas ou acesso não autorizado (401/403).",
                }

            data: Dict[str, Any] = {}
            try:
                data = resp.json()
            except Exception:
                data = {"raw_text": resp.text[:500]}

            if resp.status_code != 200:
                msg = data.get("message") if isinstance(data, dict) else str(data)
                # SimpleSet pode retornar 400 com "Produto não encontrado"
                if msg and "não encontrado" in msg.lower():
                    return {
                        "found": False,
                        "saldo": 0,
                        "preco": None,
                        "titulo": None,
                        "raw": data,
                        "error": None,
                    }
                return {
                    "found": False,
                    "saldo": 0,
                    "preco": None,
                    "titulo": None,
                    "raw": data,
                    "error": f"Inovação Distribuidora ({resp.status_code}): {msg or 'Erro na consulta de estoque.'}",
                }

            # HTTP 200 OK — Parse do objeto estoques (formato real validado em 19/10/2026):
            # {"code":200,"estoques":{"<cnpj>":{"<isbn>":{"produto":"...","qtd":"10.0",
            #   "disponivel":10,"reservado":0,"preco":"89.9","situacao":"Disponível",
            #   "editora":"...","desconto":"40.0", ...}}}}
            # Mantém compatibilidade com formato legado onde o valor é um número simples.
            estoques = data.get("estoques")
            total_saldo = 0
            item_found = False
            preco: Optional[float] = None
            titulo: Optional[str] = None
            situacao: Optional[str] = None
            desconto: Optional[float] = None

            def _to_float(v: Any) -> Optional[float]:
                try:
                    return float(v) if v is not None and v != "" else None
                except (ValueError, TypeError):
                    return None

            if isinstance(estoques, dict):
                for _cnpj, items in estoques.items():
                    if not isinstance(items, dict):
                        continue
                    for k, info in items.items():
                        clean_k = str(k).strip()
                        if not (clean_k == clean_isbn or clean_k.endswith(clean_isbn) or clean_isbn.endswith(clean_k)):
                            continue
                        item_found = True
                        if isinstance(info, dict):
                            disp = info.get("disponivel")
                            if disp is None:
                                disp = (_to_float(info.get("qtd")) or 0) - (_to_float(info.get("reserva")) or 0)
                            total_saldo += int(_to_float(disp) or 0)
                            preco = preco if preco is not None else _to_float(info.get("preco"))
                            titulo = titulo or (info.get("produto") or "").strip() or None
                            situacao = situacao or info.get("situacao")
                            desconto = desconto if desconto is not None else _to_float(info.get("desconto"))
                        else:
                            total_saldo += int(_to_float(info) or 0)

            # Preço simbólico (ex.: 0.01) indica cadastro sem preço real
            if preco is not None and preco <= 0.01:
                preco = None

            return {
                "found": item_found,
                "saldo": max(0, total_saldo),
                "preco": round(preco, 2) if preco is not None else None,
                "titulo": titulo,
                "situacao": situacao,
                "desconto": desconto,
                "raw": data,
                "error": None,
            }

        except (httpx.ConnectTimeout, httpx.ConnectError):
            logger.warning("Sem conexão TCP com a Inovação (possível bloqueio de IP) para ISBN %s", clean_isbn)
            return {
                "found": False,
                "saldo": 0,
                "preco": None,
                "titulo": None,
                "raw": {},
                "error": "Servidor da Inovação não aceitou a conexão (IP do nosso servidor possivelmente não liberado no firewall deles).",
            }
        except httpx.TimeoutException:
            logger.warning("Timeout ao consultar estoque na Inovação Distribuidora para ISBN %s", clean_isbn)
            return {
                "found": False,
                "saldo": 0,
                "preco": None,
                "titulo": None,
                "raw": {},
                "error": "Tempo limite esgotado ao consultar a Inovação Distribuidora (Timeout).",
            }
        except Exception as e:
            logger.error("Erro ao consultar Inovação Distribuidora: %s", e)
            return {
                "found": False,
                "saldo": 0,
                "preco": None,
                "titulo": None,
                "raw": {},
                "error": f"Falha de comunicação com a Inovação Distribuidora: {e}",
            }

    async def test_connection(self) -> Dict[str, Any]:
        """
        Valida as credenciais testando uma requisição à API de estoques.
        Se retornar 200 ou 404 (produto não encontrado), a autenticação foi aceita com sucesso.
        """
        if not self.username or not self.password:
            return {
                "ok": False,
                "message": "Usuário e senha da Inovação são obrigatórios para teste.",
            }

        url = f"{self.base_url}/api/estoques"
        headers = self.get_headers()
        # Teste com ISBN de referência da própria documentação (ou genérico)
        test_isbn = "9788565358668"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, params={"isbn13": test_isbn}, headers=headers)

            if resp.status_code in (200, 404):
                return {
                    "ok": True,
                    "message": "Conexão com a Inovação Distribuidora validada com sucesso!",
                }

            if resp.status_code in (401, 403):
                return {
                    "ok": False,
                    "message": "Credenciais rejeitadas pela Inovação (401/403). Verifique usuário e senha.",
                }

            try:
                body = resp.json()
                msg = body.get("message", resp.text[:200])
            except Exception:
                msg = resp.text[:200]

            if "autentica" in msg.lower() or "credencial" in msg.lower() or "acesso negado" in msg.lower():
                return {
                    "ok": False,
                    "message": f"Erro de autenticação na Inovação: {msg}",
                }

            # Qualquer outro código de erro com autenticação válida (ex: 400 produto inválido) ainda indica conexão estabelecida
            if resp.status_code == 400 and "isbn13" in msg.lower():
                return {
                    "ok": True,
                    "message": "Conexão com a Inovação Distribuidora validada com sucesso!",
                }

            return {
                "ok": False,
                "message": f"Resposta inesperada da Inovação ({resp.status_code}): {msg}",
            }

        except (httpx.ConnectTimeout, httpx.ConnectError):
            return {
                "ok": False,
                "message": "O servidor da Inovação não aceitou a conexão. Solicite à Inovação a liberação do IP 64.23.182.183 no firewall.",
            }
        except httpx.TimeoutException:
            return {
                "ok": False,
                "message": "Tempo limite esgotado ao conectar no servidor da Inovação (Timeout).",
            }
        except Exception as e:
            return {
                "ok": False,
                "message": f"Falha de conexão com a Inovação: {e}",
            }

    async def create_order(
        self,
        cod_cliente: str,
        pedido_cliente: str,
        itens: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Envia pedido de compra para a Inovação Distribuidora.
        POST /api/pedidos
        Body:
          {
            "CodCliente": "...",
            "PedidoCliente": "...",
            "itens": [{"isbn13": "...", "qtd": 1}]
          }
        """
        url = f"{self.base_url}/api/pedidos"
        headers = self.get_headers()
        payload = {
            "CodCliente": cod_cliente,
            "PedidoCliente": pedido_cliente,
            "itens": itens,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.post(url, json=payload, headers=headers)

            data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            if resp.status_code == 200 and (data.get("code") == 200 or "PEDIDO" in data):
                return {
                    "success": True,
                    "order_id": str(data.get("PEDIDO", "")),
                    "message": "Pedido criado com sucesso na Inovação.",
                    "raw": data,
                }

            return {
                "success": False,
                "order_id": None,
                "message": data.get("message") or f"Erro ao criar pedido na Inovação ({resp.status_code}).",
                "raw": data,
            }
        except Exception as e:
            return {
                "success": False,
                "order_id": None,
                "message": f"Falha de comunicação ao criar pedido na Inovação: {e}",
                "raw": {},
            }
