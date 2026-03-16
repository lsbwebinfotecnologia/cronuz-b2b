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
        if limit is not None:
            params["OFFSET"] = offset
            params["LIMIT"] = limit
            
        # Company / Branch context from settings
        if self._settings.horus_company:
            params["SD_COD_EMPRESA"] = self._settings.horus_company
        if self._settings.horus_branch:
            params["SD_COD_FILIAL"] = self._settings.horus_branch
            
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
            # Format according to HsProducts: sending the array of ISBN objects as JSON body
            # The 'isbns' list should be format [{"BARRAS_ISBN": "123"}, ...]
            return await self.post("Busca_AcervoB2B", json_data=isbns, params=params)
        else:
            # Normal search (equivalent to searchProduct uses GET)
            return await self.get("Busca_AcervoB2B", params=params)
