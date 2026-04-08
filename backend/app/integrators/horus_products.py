from typing import Dict, Any, List, Optional
from app.integrators.horus import HorusClient

class HorusProducts(HorusClient):
    
    async def busca_acervo_b2b(
        self, 
        id_doc: str, 
        id_guid: str, 
        term: Optional[str] = None, 
        search_option: Optional[str] = None, 
        offset: int = 0, 
        limit: int = 25, 
        isbns: Optional[List[Dict[str, Any]]] = None,
        is_showcase: bool = False,
        cod_tpo_caract_extra: Optional[int] = None,
        cod_caract_extra: Optional[int] = None,
        **kwargs
    ) -> Any:
        """
        Translates HsProducts.php methods (searchProduct & searchInList).
        Fetches products from Busca_AcervoB2B endpoint.
        """
        params: Dict[str, Any] = {
            "ID_DOC": id_doc,
            "ID_GUID": id_guid,
        }
        
        # Pagination
        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = offset
            params["LIMIT"] = limit if (limit is not None and limit > 0) else 10000
            
        # Company / Branch context from settings
        if getattr(self._settings, 'horus_hide_zero_balance', False):
            if self._settings.horus_company:
                params["AC_COD_EMPRESA"] = self._settings.horus_company
            if self._settings.horus_branch:
                params["AC_COD_FILIAL"] = self._settings.horus_branch
            if getattr(self._settings, 'horus_stock_local', None):
                params["AC_LOCAL_ESTOQUE"] = self._settings.horus_stock_local
        else:
            if self._settings.horus_company:
                params["SD_COD_EMPRESA"] = self._settings.horus_company
            if self._settings.horus_branch:
                params["SD_COD_FILIAL"] = self._settings.horus_branch
            if getattr(self._settings, 'horus_stock_local', None):
                params["SD_LOCAL_ESTOQUE"] = self._settings.horus_stock_local
            
        # Vitrines / Showcase filters
        if is_showcase and cod_tpo_caract_extra and cod_caract_extra:
            params["COD_TPO_CARACT_EXTRA"] = cod_tpo_caract_extra
            params["COD_CARACT_EXTRA"] = cod_caract_extra
        else:
            if term:
                if search_option:
                    params[search_option] = term
                else:
                    if term.isdigit():
                        params["BARRAS_ISBN"] = term
                    else:
                        params["NOM_ITEM"] = term
                        
        # Support for additional kwargs
        params.update(kwargs)

        if isbns:
            # When searching a specific list of ISBNs (equivalent to searchInList), it uses POST
            # To ensure the ERP applies the Company/Branch filter for each ISBN in the array,
            # we inject the company parameters directly into every object in the JSON body.
            for item in isbns:
                if self._settings.horus_company:
                    item["SD_COD_EMPRESA"] = self._settings.horus_company
                    item["AC_COD_EMPRESA"] = self._settings.horus_company
                if self._settings.horus_branch:
                    item["SD_COD_FILIAL"] = self._settings.horus_branch
                    item["AC_COD_FILIAL"] = self._settings.horus_branch
                if getattr(self._settings, 'horus_stock_local', None):
                    item["SD_LOCAL_ESTOQUE"] = self._settings.horus_stock_local
                    item["AC_LOCAL_ESTOQUE"] = self._settings.horus_stock_local
                    
            return await self.post("Busca_AcervoB2B", json_data=isbns, params=params)
        else:
            # Normal search (equivalent to searchProduct uses GET)
            return await self.get("Busca_AcervoB2B", params=params)

    async def busca_acervo_padrao(
        self, 
        id_doc: str, 
        term: Optional[str] = None, 
        search_option: Optional[str] = None, 
        offset: int = 0, 
        limit: int = 25, 
        isbns: Optional[List[Dict[str, Any]]] = None,
        **kwargs
    ) -> Any:
        """
        Fetches products from standard Busca_Acervo endpoint (no customer context).
        """
        params: Dict[str, Any] = {}
        
        # Pagination
        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = offset
            params["LIMIT"] = limit if (limit is not None and limit > 0) else 10000
            
        # Company / Branch context from settings
        # Busca_Acervo_Padrao typically only accepts SD_ parameters or no parameters.
        if getattr(self._settings, 'horus_hide_zero_balance', False):
            # Even if hiding zero balance, standard acervo might reject AC_ variables for older endpoints.
            # We'll stick to SD_ which has wider compatibility, or completely omit if necessary.
            if self._settings.horus_company:
                params["SD_COD_EMPRESA"] = self._settings.horus_company
            if self._settings.horus_branch:
                params["SD_COD_FILIAL"] = self._settings.horus_branch
            if getattr(self._settings, 'horus_stock_local', None):
                params["SD_LOCAL_ESTOQUE"] = self._settings.horus_stock_local
        else:
            if self._settings.horus_company:
                params["SD_COD_EMPRESA"] = self._settings.horus_company
            if self._settings.horus_branch:
                params["SD_COD_FILIAL"] = self._settings.horus_branch
            if getattr(self._settings, 'horus_stock_local', None):
                params["SD_LOCAL_ESTOQUE"] = self._settings.horus_stock_local
            
        if term:
            if search_option:
                if search_option == "NOM_ITEM":
                    params["NOME"] = term
                else:
                    params[search_option] = term
            else:
                if term.isdigit() and len(term) >= 10:
                    params["BARRAS_ISBN"] = term
                else:
                    params["NOME"] = term
                    
        # Support for additional kwargs
        params.update(kwargs)

        if isbns:
            return await self.post("Busca_Acervo", json_data=isbns, params=params)
        else:
            return await self.get("Busca_Acervo", params=params)

    async def arvore_generos(self, id_doc: str, **kwargs) -> Any:
        """
        Fetches the complete taxonomy/category tree from Horus ERP.
        """
        params: Dict[str, Any] = {"ID_DOC": id_doc}
        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = 0
            params["LIMIT"] = 10000
        params.update(kwargs)
        return await self.get("arvore_generos", params=params)

    async def busca_editoras(self, id_doc: str, **kwargs) -> Any:
        """
        Fetches the active publishers/brands from Horus ERP.
        """
        params: Dict[str, Any] = {"ID_DOC": id_doc}
        if not getattr(self._settings, 'horus_legacy_pagination', False):
            params["OFFSET"] = 0
            params["LIMIT"] = 10000
        params.update(kwargs)
        return await self.get("Busca_editoras", params=params)

