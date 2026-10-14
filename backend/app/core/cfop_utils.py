import re
from typing import List, Optional, Set

DEFAULT_SALES_CFOPS = [
    "5101", "5102", "6101", "6102", 
    "5114", "6114", "5115", "6115", 
    "5403", "6403", "5405", "6405"
]

DEFAULT_CONSIGN_CFOPS = [
    "5917", "6917"
]

DEFAULT_DEV_SALES_CFOPS = [
    "1201", "1202", "2201", "2202", "1411", "2411"
]

DEFAULT_DEV_CONSIGN_CFOPS = [
    "1918", "2918"
]


def sanitize_cfop(val: any) -> str:
    """
    Remove pontos, vírgulas, espaços e qualquer caractere não numérico.
    Exemplos:
      '5.102' -> '5102'
      '5,102' -> '5102'
      ' 6102 ' -> '6102'
      5102 -> '5102'
    """
    if val is None:
        return ""
    clean = re.sub(r"\D", "", str(val).strip())
    return clean


def parse_cfop_list(cfop_str: Optional[str]) -> Set[str]:
    """
    Recebe uma string com CFOPs e retorna um conjunto de CFOPs higienizados com 4 dígitos.
    Trata tanto CFOPs formatados com vírgula ou ponto (ex: '5,102, 6.102; 5101')
    quanto listas separadas por vírgula, ponto-e-vírgula ou espaço.
    """
    if not cfop_str:
        return set()
    
    # Primeiro junta dígitos com ponto/vírgula no meio: '5,102' -> '5102', '6.102' -> '6102'
    normalized = re.sub(r"(\d)[.,](\d{3})", r"\1\2", str(cfop_str))
    
    parts = re.split(r"[,;\s\n\r]+", normalized)
    result = set()
    for p in parts:
        cleaned = sanitize_cfop(p)
        if cleaned:
            result.add(cleaned)
    return result


def classify_cfop_movement(
    cfop: any,
    sales_cfops: Optional[str] = None,
    consign_cfops: Optional[str] = None,
    dev_sales_cfops: Optional[str] = None,
    dev_consign_cfops: Optional[str] = None
) -> str:
    """
    Classifica a movimentação fiscal a partir do CFOP:
    - 'SALE': Venda faturada efetiva
    - 'CONSIGNMENT_SHIPMENT': Remessa em consignação
    - 'SALE_RETURN': Devolução de venda
    - 'CONSIGNMENT_RETURN': Devolução de consignação
    - 'OTHER': Doações, brindes, outras saídas operacionais
    """
    clean = sanitize_cfop(cfop)
    if not clean:
        return "OTHER"
    
    sales_set = parse_cfop_list(sales_cfops) if sales_cfops else set(DEFAULT_SALES_CFOPS)
    consign_set = parse_cfop_list(consign_cfops) if consign_cfops else set(DEFAULT_CONSIGN_CFOPS)
    dev_sales_set = parse_cfop_list(dev_sales_cfops) if dev_sales_cfops else set(DEFAULT_DEV_SALES_CFOPS)
    dev_consign_set = parse_cfop_list(dev_consign_cfops) if dev_consign_cfops else set(DEFAULT_DEV_CONSIGN_CFOPS)

    if clean in sales_set:
        return "SALE"
    if clean in consign_set:
        return "CONSIGNMENT_SHIPMENT"
    if clean in dev_sales_set:
        return "SALE_RETURN"
    if clean in dev_consign_set:
        return "CONSIGNMENT_RETURN"
    
    return "OTHER"
