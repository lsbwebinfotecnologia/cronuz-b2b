"""
Integrador Horus — Módulo Busca Preço (General)

Utiliza os endpoints PADRÃO da API Horus (sem contexto B2B):
  - Busca_Acervo  → consulta produto por ISBN, Nome ou Código
  - Estoque       → consulta saldo disponível por filial/local

NÃO interfere com os integradores B2B existentes (HorusProducts,
HorusClients, HorusLogisticsClient etc.).
"""
import asyncio
import logging
from typing import Any, Dict, List, Optional
import httpx
from app.integrators.horus import HorusClient

logger = logging.getLogger(__name__)


def _format_horus_error(e: Exception) -> str:
    """Traduz exceções técnicas em mensagens claras em português."""
    if isinstance(e, (httpx.TimeoutException, asyncio.TimeoutError)):
        return "Tempo limite esgotado ao consultar o saldo nesta filial (Timeout Horus)."
    if isinstance(e, httpx.ConnectError):
        return "Não foi possível conectar ao servidor do ERP Horus (Servidor offline ou inacessível)."
    if isinstance(e, httpx.HTTPStatusError):
        code = e.response.status_code if e.response else "?"
        if code in (401, 403):
            return "Falha de autenticação no Horus (usuário ou senha incorretos)."
        if code in (500, 502, 503, 504):
            return f"Serviço do Horus temporariamente indisponível (HTTP {code})."
        return f"Falha de resposta da API Horus (HTTP {code})."
    
    err_str = str(e).strip()
    if "ReadTimeout" in err_str or "ConnectTimeout" in err_str:
        return "Tempo limite esgotado ao consultar o saldo nesta filial."
    if "Connection refused" in err_str or "ConnectError" in err_str:
        return "Conexão recusada pelo servidor do Horus."
    return err_str or "Erro desconhecido ao consultar filial no Horus."


class HorusProductSearch(HorusClient):
    """
    Cliente Horus para o módulo Busca Preço.
    Reutiliza a configuração de conexão (URL, porta, usuário, senha)
    já armazenada em CompanySettings para o seller.
    """

    # ──────────────────────────────────────────────
    # 1. Busca de Produto via Busca_Acervo (standard)
    # ──────────────────────────────────────────────
    async def busca_acervo(
        self,
        term: str,
        search_option: str = "BARRAS_ISBN",   # BARRAS_ISBN | NOME | COD_ITEM
        offset: int = 0,
        limit: int = 10,
        **kwargs,
    ) -> Any:
        """
        Pesquisa produto no Horus via endpoint `Busca_Acervo` (sem B2B).

        Args:
            term:          Valor da busca (ISBN, nome ou código do item).
            search_option: Parâmetro Horus que receberá o term.
                           Valores aceitos: BARRAS_ISBN, NOME, COD_ITEM.
            offset/limit:  Paginação. Omitidos se horus_legacy_pagination=True.
        Returns:
            Lista de produtos retornados pelo Horus.
        """
        params: Dict[str, Any] = {
            search_option: term,
        }

        # Respeita flag de paginação legada
        legacy = getattr(self._settings, "horus_legacy_pagination", False)
        if not legacy:
            params["OFFSET"] = offset
            params["LIMIT"] = limit

        params.update(kwargs)
        return await self.get("Busca_Acervo", params=params)

    # ──────────────────────────────────────────────
    # 2. Saldo por Filial via Estoque
    # ──────────────────────────────────────────────
    async def busca_estoque_filial(
        self,
        cod_item: int,
        cod_empresa: str,
        cod_filial: str,
    ) -> Any:
        """
        Consulta o saldo de UM produto em UMA filial (empresa + filial) via `Estoque`.

        NÃO filtra por COD_LOCAL_ESTOQUE — retorna todos os locais da filial.
        NÃO envia TIPO_SALDO — deixa o Horus retornar com o padrão.

        Parâmetros enviados:
            COD_ITEM_INI, COD_ITEM_FIM, COD_EMPRESA, COD_FILIAL
            [OFFSET=0 & LIMIT=500] se não for legacy_pagination

        Resposta: campo de saldo é SALDO_DISPONIVEL (não SALDO).
        """
        params: Dict[str, Any] = {
            "COD_ITEM_INI": cod_item,
            "COD_ITEM_FIM": cod_item,
            "COD_EMPRESA": cod_empresa,
            "COD_FILIAL": cod_filial,
        }

        # Respeita flag de paginação legada do seller
        legacy = getattr(self._settings, "horus_legacy_pagination", False)
        if not legacy:
            params["OFFSET"] = 0
            params["LIMIT"] = 500

        return await self.get("Estoque", params=params)

    async def busca_estoque_por_filiais(
        self,
        cod_item: int,
        branches: List[Dict[str, Any]],
        max_concurrent: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Consulta o saldo de UM produto em TODAS as filiais de forma CONCORRENTE.

        Utiliza asyncio.gather com Semaphore para garantir alta performance sem
        sobrecarregar o servidor do Horus.
        Cada filial possui timeout de 8 segundos para evitar travamentos.

        Returns:
            [
              {
                "filial_nome": str,
                "cod_empresa": str,
                "cod_filial": str,
                "saldo": int,
                "situacao_item": str | None,
                "registros_retornados": int,
                "erro": str | None,
              }, ...
            ]
        """
        semaphore = asyncio.Semaphore(max_concurrent)

        async def _query_single_branch(branch: Dict[str, Any]) -> Dict[str, Any]:
            nome = branch.get("nome", "—")
            cod_empresa = str(branch.get("cod_empresa", "")).strip()
            cod_filial = str(branch.get("cod_filial", "")).strip()

            if not cod_empresa or not cod_filial:
                return {
                    "filial_nome": nome,
                    "cod_empresa": cod_empresa,
                    "cod_filial": cod_filial,
                    "saldo": 0,
                    "situacao_item": None,
                    "registros_retornados": 0,
                    "erro": "Filial sem Código de Empresa ou Filial configurado.",
                }

            async with semaphore:
                try:
                    # Timeout individual de 8 segundos por filial
                    raw = await asyncio.wait_for(
                        self.busca_estoque_filial(
                            cod_item=cod_item,
                            cod_empresa=cod_empresa,
                            cod_filial=cod_filial,
                        ),
                        timeout=8.0,
                    )

                    saldo_total = 0
                    situacao = None

                    if isinstance(raw, list) and len(raw) > 0:
                        first = raw[0]
                        if isinstance(first, dict) and (
                            first.get("Falha") or first.get("FALHA") == "S"
                        ):
                            msg = first.get("Mensagem") or "Produto sem registro de estoque nesta filial."
                            return {
                                "filial_nome": nome,
                                "cod_empresa": cod_empresa,
                                "cod_filial": cod_filial,
                                "saldo": 0,
                                "situacao_item": None,
                                "registros_retornados": 0,
                                "erro": msg,
                            }

                        for record in raw:
                            if isinstance(record, dict):
                                saldo_total += int(record.get("SALDO_DISPONIVEL", 0) or 0)
                                if situacao is None:
                                    situacao = record.get("SITUACAO_ITEM")

                    return {
                        "filial_nome": nome,
                        "cod_empresa": cod_empresa,
                        "cod_filial": cod_filial,
                        "saldo": saldo_total,
                        "situacao_item": situacao,
                        "registros_retornados": len(raw) if isinstance(raw, list) else 0,
                        "erro": None,
                    }

                except Exception as e:
                    err_msg = _format_horus_error(e)
                    logger.warning(f"[HorusProductSearch] Erro filial {nome} (Emp {cod_empresa} Fil {cod_filial}): {err_msg}")
                    return {
                        "filial_nome": nome,
                        "cod_empresa": cod_empresa,
                        "cod_filial": cod_filial,
                        "saldo": 0,
                        "situacao_item": None,
                        "registros_retornados": 0,
                        "erro": err_msg,
                    }

        tasks = [_query_single_branch(b) for b in branches]
        results = await asyncio.gather(*tasks)
        return list(results)
