from typing import Any

def parse_horus_price(val: Any) -> float:
    """
    Safely parses price strings from Horus API that could come in multiple formats,
    such as '29,19', '1.200,50', '29.19', or even numeric float/int natively.
    """
    if val is None:
        return 0.0
    if isinstance(val, (int, float)):
        return float(val)
    
    s = str(val).strip()
    if not s:
        return 0.0
        
    s = s.replace("R$", "").strip()
    
    # Contains both dot and comma (e.g. 1.200,50 or 1,200.50)
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            # Brazilian format: 1.200,50 -> 1200.50
            s = s.replace(".", "").replace(",", ".")
        else:
            # US format: 1,200.50 -> 1200.50
            s = s.replace(",", "")
    # Contains only comma (e.g. 29,50)
    elif "," in s:
        s = s.replace(",", ".")
    # Contains only dot (e.g. 29.50)
    # Does nothing special, natively parsed below
    
    try:
        return float(s)
    except ValueError:
        return 0.0
