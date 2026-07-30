import re
from typing import Dict, Any, List, Optional, Union
from app.integrators.horus import HorusClient

class HorusLogisticsClient(HorusClient):
    
    async def search_orders(
        self, 
        cod_empresa: str, 
        cod_filial: str, 
        cod_cli: str, 
        cod_pedido_origem: str,
        cod_metodo: Optional[Union[int, str]] = None
    ) -> Any:
        """
        Calls Busca_PedidosVenda to find the sales order.
        Dynamically resolves cod_metodo from seller's DropshipConfig or CompanySettings if not specified.
        Tries searching by COD_PEDIDO_ORIGEM + COD_METODO, COD_PEDIDO_ORIGEM, and COD_PED_VENDA.
        """
        # Resolve cod_metodo dynamically if default or not provided
        if cod_metodo is None or str(cod_metodo) == "27":
            try:
                from app.models.dropship import DropshipConfig
                cfg = self._db.query(DropshipConfig).filter(DropshipConfig.company_id == self._company_id).first()
                if cfg and cfg.horus_cod_metodo:
                    cod_metodo = cfg.horus_cod_metodo
            except Exception:
                pass

        if cod_metodo is None or str(cod_metodo) == "27":
            try:
                from app.models.company_settings import CompanySettings
                stg = self._db.query(CompanySettings).filter(CompanySettings.company_id == self._company_id).first()
                if stg and getattr(stg, 'horus_cod_metodo', None):
                    cod_metodo = stg.horus_cod_metodo
            except Exception:
                pass

        # Determine company/branch pairs to attempt (primary branch vs company settings fallback)
        emp_fil_pairs = [(str(cod_empresa), str(cod_filial))]
        setting_emp = str(getattr(self._settings, 'horus_company', '') or '').strip()
        setting_fil = str(getattr(self._settings, 'horus_branch', '') or '').strip()
        if setting_emp and setting_fil:
            pair_fallback = (setting_emp, setting_fil)
            if pair_fallback not in emp_fil_pairs:
                emp_fil_pairs.append(pair_fallback)

        res = None

        for current_emp, current_fil in emp_fil_pairs:
            # Strategy 1: By COD_PEDIDO_ORIGEM with COD_METODO
            if cod_metodo:
                params_origem = {
                    "COD_EMPRESA": current_emp,
                    "COD_FILIAL": current_fil,
                    "COD_CLI": cod_cli,
                    "COD_PEDIDO_ORIGEM": cod_pedido_origem,
                    "COD_METODO": cod_metodo,
                    "OFFSET": 0,
                    "LIMIT": 10
                }
                if getattr(self._settings, 'horus_legacy_pagination', False):
                    params_origem.pop("OFFSET", None)
                    params_origem.pop("LIMIT", None)

                try:
                    res = await self.get("Busca_PedidosVenda", params=params_origem)
                    if res and not (isinstance(res, list) and len(res) == 0):
                        first = res[0] if isinstance(res, list) else res
                        if isinstance(first, dict) and not (first.get("Falha") or first.get("FALHA") == "S" or first.get("status") == "FALHA"):
                            return res
                except Exception:
                    pass

            # Strategy 2: By COD_PEDIDO_ORIGEM without COD_METODO
            params_origem_no_met = {
                "COD_EMPRESA": current_emp,
                "COD_FILIAL": current_fil,
                "COD_CLI": cod_cli,
                "COD_PEDIDO_ORIGEM": cod_pedido_origem,
                "OFFSET": 0,
                "LIMIT": 10
            }
            if getattr(self._settings, 'horus_legacy_pagination', False):
                params_origem_no_met.pop("OFFSET", None)
                params_origem_no_met.pop("LIMIT", None)

            try:
                res = await self.get("Busca_PedidosVenda", params=params_origem_no_met)
                if res and not (isinstance(res, list) and len(res) == 0):
                    first = res[0] if isinstance(res, list) else res
                    if isinstance(first, dict) and not (first.get("Falha") or first.get("FALHA") == "S" or first.get("status") == "FALHA"):
                        return res
            except Exception:
                pass

            # Strategy 3: Try alternative origin variation (e.g. RM-149 <-> RM-#149)
            alt_origem = None
            if "#" in cod_pedido_origem:
                alt_origem = cod_pedido_origem.replace("#", "")
            elif "RM-" in cod_pedido_origem:
                alt_origem = cod_pedido_origem.replace("RM-", "RM-#")

            if alt_origem:
                params_alt = {
                    "COD_EMPRESA": current_emp,
                    "COD_FILIAL": current_fil,
                    "COD_CLI": cod_cli,
                    "COD_PEDIDO_ORIGEM": alt_origem,
                    "OFFSET": 0,
                    "LIMIT": 10
                }
                if cod_metodo:
                    params_alt["COD_METODO"] = cod_metodo
                if getattr(self._settings, 'horus_legacy_pagination', False):
                    params_alt.pop("OFFSET", None)
                    params_alt.pop("LIMIT", None)

                try:
                    res = await self.get("Busca_PedidosVenda", params=params_alt)
                    if res and not (isinstance(res, list) and len(res) == 0):
                        first = res[0] if isinstance(res, list) else res
                        if isinstance(first, dict) and not (first.get("Falha") or first.get("FALHA") == "S" or first.get("status") == "FALHA"):
                            return res
                except Exception:
                    pass

            # Strategy 4: ONLY use COD_PED_VENDA if cod_pedido_origem is strictly numeric (integer)
            if str(cod_pedido_origem).strip().isdigit():
                params_venda = {
                    "COD_EMPRESA": current_emp,
                    "COD_FILIAL": current_fil,
                    "COD_CLI": cod_cli,
                    "COD_PED_VENDA": int(cod_pedido_origem),
                    "OFFSET": 0,
                    "LIMIT": 10
                }
                if getattr(self._settings, 'horus_legacy_pagination', False):
                    params_venda.pop("OFFSET", None)
                    params_venda.pop("LIMIT", None)

                try:
                    res = await self.get("Busca_PedidosVenda", params=params_venda)
                    if res and not (isinstance(res, list) and len(res) == 0):
                        first = res[0] if isinstance(res, list) else res
                        if isinstance(first, dict) and not (first.get("Falha") or first.get("FALHA") == "S" or first.get("status") == "FALHA"):
                            return res
                except Exception:
                    pass

        return res if res is not None else []


    async def get_order_items(
        self, 
        cod_ped_venda: Union[str, int], 
        cod_empresa: str, 
        cod_filial: str
    ) -> Any:
        """
        Calls Busca_ItensPedidosVenda to retrieve the items for the sales order.
        """
        params = {
            "COD_PED_VENDA": cod_ped_venda,
            "COD_EMPRESA": cod_empresa,
            "COD_FILIAL": cod_filial,
            "OFFSET": 0,
            "LIMIT": 10000
        }
        
        if getattr(self._settings, 'horus_legacy_pagination', False):
            params.pop("OFFSET", None)
            params.pop("LIMIT", None)
            
        return await self.get("Busca_ItensPedidosVenda", params=params)

    async def confere_item_pedido(
        self,
        cod_empresa: str,
        cod_filial: str,
        cod_cli: str,
        cod_ped_venda: str,
        cod_item: str,
        cod_local: str,
        qtd_atendida: int
    ) -> Any:
        """
        Calls ConfereItem_Pedido on Horus ERP to confirm item checking.
        """
        params = {
            "COD_EMPRESA": cod_empresa,
            "COD_FILIAL": cod_filial,
            "COD_CLI": cod_cli,
            "COD_PED_VENDA": cod_ped_venda,
            "COD_ITEM": cod_item,
            "COD_LOCAL": cod_local,
            "QTD_ATENDIDA": qtd_atendida
        }
        
        return await self.get("ConfereItem_Pedido", params=params)

    async def ins_volume_pedido(
        self,
        cod_empresa: str,
        cod_filial: str,
        cod_cli: str,
        cod_ped_venda: str,
        cod_volume: int,
        pes_volume: float
    ) -> Any:
        """
        Calls InsVolume_Pedido on Horus ERP to insert volume details.
        """
        params = {
            "COD_EMPRESA": cod_empresa,
            "COD_FILIAL": cod_filial,
            "COD_CLI": cod_cli,
            "COD_PED_VENDA": cod_ped_venda,
            "COD_VOLUME": cod_volume,
            "PES_VOLUME": pes_volume
        }
        
        return await self.get("InsVolume_Pedido", params=params)

