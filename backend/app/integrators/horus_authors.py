from typing import Dict, Any, List, Optional
import logging
from app.integrators.horus import HorusClient

logger = logging.getLogger(__name__)

class HorusAuthors(HorusClient):
    """
    Integração de Autores e Royalties com a API do Horus ERP.
    Implementa:
      1. Busca_AutoresB2B
      2. Busca_Autores_FornecedoresB2B
      3. Busca_Itens_AutoresB2B
      4. Busca_Vendas_AutoreB2B
    """

    async def busca_autores_b2b(
        self,
        data_ini: Optional[str] = "01/01/1899",
        data_fim: Optional[str] = "31/12/2026",
        nom_fornecedor: Optional[str] = None,
        nome: Optional[str] = None,
        cpf: Optional[str] = None,
        cnpj: Optional[str] = None,
        cod_fornecedor: Optional[int] = None,
        cod_empresa: Optional[int] = None,
        cod_filial: Optional[int] = None,
        offset: int = 0,
        limit: int = 50,
        **kwargs
    ) -> List[Dict[str, Any]]:
        """
        Busca relação de autores/fornecedores disponíveis no Horus ERP.
        Endpoint: /Horus/api/TServerB2B/Busca_AutoresB2B
        
        Regras do Horus:
        1. O parâmetro de busca por nome é 'NOME' (e não NOM_FORNECEDOR).
        2. Quando NOME, CPF ou CNPJ for preenchido, os filtros de DATA não podem ser enviados
           (pois o Horus trata como busca única e rejeita se datas forem passadas juntas).
        3. COD_EMPRESA e COD_FILIAL são obrigatórios quando informado COD_FORNECEDOR.
        4. OFFSET e LIMIT devem respeitar horus_legacy_pagination do seller.
        """
        params: Dict[str, Any] = {}

        empresa = cod_empresa or getattr(self._settings, 'horus_company', None)
        filial = cod_filial or getattr(self._settings, 'horus_branch', None)

        search_term = (nome or nom_fornecedor or "").strip()
        doc_cpf = cpf.replace(".", "").replace("-", "").strip() if cpf else None
        doc_cnpj = cnpj.replace(".", "").replace("-", "").replace("/", "").strip() if cnpj else None

        if search_term:
            params["NOME"] = search_term
        elif doc_cpf:
            params["CPF"] = doc_cpf
        elif doc_cnpj:
            params["CNPJ"] = doc_cnpj
        elif cod_fornecedor:
            params["COD_FORNECEDOR"] = cod_fornecedor
            if empresa:
                params["COD_EMPRESA"] = empresa
            if filial:
                params["COD_FILIAL"] = filial
        else:
            # Busca geral por período
            params["DATA_INI"] = data_ini or "01/01/1899"
            params["DATA_FIM"] = data_fim or "31/12/2026"
            if empresa:
                params["COD_EMPRESA"] = empresa
            if filial:
                params["COD_FILIAL"] = filial

        # Respeita a regra global de OFFSET/LIMIT do seller no master
        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = offset
            params["LIMIT"] = limit if limit and limit > 0 else 50

        try:
            res = await self.get("Busca_AutoresB2B", params=params)
            if isinstance(res, list):
                if len(res) > 0 and isinstance(res[0], dict) and res[0].get("Falha"):
                    logger.warning(f"[busca_autores_b2b] Falha informada pelo Horus: {res[0].get('Mensagem')}")
                    return []
                return res
            return []
        except Exception as e:
            logger.error(f"[busca_autores_b2b] Erro ao buscar autores no Horus: {e}")
            raise

    async def busca_autores_fornecedores_b2b(
        self,
        id_guid: str,
        id_doc: str,
        offset: int = 0,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Lista autores vinculados a um fornecedor controlador / representante.
        Endpoint: /Horus/api/TserverB2B/Busca_Autores_FornecedoresB2B
        """
        params: Dict[str, Any] = {
            "ID_GUID": id_guid,
            "ID_DOC": id_doc.replace(".", "").replace("-", "").replace("/", "").strip()
        }

        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = offset
            params["LIMIT"] = limit if limit and limit > 0 else 100

        try:
            res = await self.get("Busca_Autores_FornecedoresB2B", params=params)
            if isinstance(res, list):
                if len(res) > 0 and isinstance(res[0], dict) and res[0].get("Falha"):
                    logger.warning(f"[busca_autores_fornecedores_b2b] Falha no Horus: {res[0].get('Mensagem')}")
                    return []
                return res
            return []
        except Exception as e:
            logger.error(f"[busca_autores_fornecedores_b2b] Erro no Horus: {e}")
            raise

    async def busca_itens_autores_b2b(
        self,
        id_guid: str,
        id_doc: str,
        offset: int = 0,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Lista itens/livros pertencentes ao autor para seleção.
        Endpoint: /Horus/api/TserverB2B/Busca_Itens_AutoresB2B
        """
        params: Dict[str, Any] = {
            "ID_GUID": id_guid,
            "ID_DOC": id_doc.replace(".", "").replace("-", "").replace("/", "").strip()
        }

        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = offset
            params["LIMIT"] = limit if limit and limit > 0 else 100

        try:
            res = await self.get("Busca_Itens_AutoresB2B", params=params)
            if isinstance(res, list):
                if len(res) > 0 and isinstance(res[0], dict) and res[0].get("Falha"):
                    logger.warning(f"[busca_itens_autores_b2b] Falha no Horus: {res[0].get('Mensagem')}")
                    return []
                return res
            return []
        except Exception as e:
            logger.error(f"[busca_itens_autores_b2b] Erro no Horus: {e}")
            raise

    async def busca_vendas_autores_b2b(
        self,
        id_guid: str,
        id_doc: str,
        cod_autor: Optional[int],
        cod_item: Optional[int],
        data_ini: str,
        data_fim: str
    ) -> List[Dict[str, Any]]:
        """
        Busca vendas realizadas no período para o autor e livro selecionados.
        Endpoint: /Horus/api/TserverB2B/Busca_Vendas_AutoreB2B
        """
        params: Dict[str, Any] = {
            "ID_GUID": id_guid,
            "ID_DOC": id_doc.replace(".", "").replace("-", "").replace("/", "").strip(),
            "DATA_INI": data_ini,
            "DATA_FIM": data_fim
        }

        if cod_autor is not None:
            params["COD_AUTOR"] = cod_autor
        if cod_item is not None:
            params["COD_ITEM"] = cod_item

        try:
            res = await self.get("Busca_Vendas_AutoreB2B", params=params)
            if isinstance(res, list):
                if len(res) > 0 and isinstance(res[0], dict) and res[0].get("Falha"):
                    logger.warning(f"[busca_vendas_autores_b2b] Falha no Horus: {res[0].get('Mensagem')}")
                    return []
                return res
            return []
        except Exception as e:
            logger.error(f"[busca_vendas_autores_b2b] Erro no Horus: {e}")
            raise
