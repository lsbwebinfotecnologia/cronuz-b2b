"""
Integrador Horus — Módulo Busca Preço (General)

Utiliza os endpoints PADRÃO da API Horus (sem contexto B2B):
  - Busca_Acervo  → consulta produto por ISBN, Nome ou Código
  - Estoque       → consulta saldo disponível por filial/local

NÃO interfere com os integradores B2B existentes (HorusProducts,
HorusClients, HorusLogisticsClient etc.).
"""
from typing import Any, Dict, List, Optional
from app.integrators.horus import HorusClient


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
    ) -> List[Dict[str, Any]]:
        """
        Consulta o saldo de UM produto em TODAS as filiais fornecidas.

        Para cada filial, faz uma chamada a `Estoque` filtrando por
        cod_empresa + cod_filial SEM filtro de local (deixa o Horus somar
        todos os locais da filial automaticamente quando TIPO_SALDO=V).

        O saldo final é a SOMA de todos os registros retornados por filial.

        Returns:
            [
              {
                "filial_nome": str,
                "cod_empresa": str,
                "cod_filial": str,
                "saldo": int,
                "situacao_item": str | None,
                "registros_retornados": int,
              }, ...
            ]
        """
        results = []

        for branch in branches:
            nome = branch.get("nome", "—")
            cod_empresa = str(branch.get("cod_empresa", "")).strip()
            cod_filial = str(branch.get("cod_filial", "")).strip()

            if not cod_empresa or not cod_filial:
                results.append({
                    "filial_nome": nome,
                    "cod_empresa": cod_empresa,
                    "cod_filial": cod_filial,
                    "saldo": 0,
                    "situacao_item": None,
                    "erro": "Filial sem cod_empresa ou cod_filial configurado.",
                })
                continue

            try:
                raw = await self.busca_estoque_filial(
                    cod_item=cod_item,
                    cod_empresa=cod_empresa,
                    cod_filial=cod_filial,
                )

                saldo_total = 0
                situacao = None

                if isinstance(raw, list) and len(raw) > 0:
                    # Verifica se é mensagem de falha do Horus
                    first = raw[0]
                    if isinstance(first, dict) and (
                        first.get("Falha") or first.get("FALHA") == "S"
                    ):
                        results.append({
                            "filial_nome": nome,
                            "cod_empresa": cod_empresa,
                            "cod_filial": cod_filial,
                            "saldo": 0,
                            "situacao_item": None,
                            "erro": first.get("Mensagem", "Erro na API Horus"),
                        })
                        continue

                    # Soma todos os registros retornados (múltiplos locais de estoque)
                    # O campo correto é SALDO_DISPONIVEL (confirmado via Postman)
                    for record in raw:
                        if isinstance(record, dict):
                            saldo_total += int(record.get("SALDO_DISPONIVEL", 0) or 0)
                            if situacao is None:
                                situacao = record.get("SITUACAO_ITEM")

                results.append({
                    "filial_nome": nome,
                    "cod_empresa": cod_empresa,
                    "cod_filial": cod_filial,
                    "saldo": saldo_total,
                    "situacao_item": situacao,
                    "registros_retornados": len(raw) if isinstance(raw, list) else 0,
                })

            except Exception as e:
                results.append({
                    "filial_nome": nome,
                    "cod_empresa": cod_empresa,
                    "cod_filial": cod_filial,
                    "saldo": 0,
                    "situacao_item": None,
                    "erro": str(e),
                })

        return results
