import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.core.utils import parse_horus_price
from app.jobs.bookinfo_purchase_job import _to_float


def test_bookinfo_purchase_price_parsing():
    # US/SQL decimal dot format (as returned by WMF Livraria's Horus API)
    assert _to_float("145.80") == 145.80
    assert _to_float("39.90") == 39.90
    assert _to_float("119.90") == 119.90
    assert _to_float("199.00") == 199.00
    assert _to_float("50.00") == 50.00
    assert _to_float("1,245.80") == 1245.80

    # PT-BR decimal comma format (as returned by PT-BR Horus servers)
    assert _to_float("145,80") == 145.80
    assert _to_float("39,90") == 39.90
    assert _to_float("50,00") == 50.00
    assert _to_float("1.245,80") == 1245.80

    # Native numeric and empty values
    assert _to_float(145.8) == 145.80
    assert _to_float(50) == 50.00
    assert _to_float(None) == 0.0
    assert _to_float("") == 0.0
    assert round(parse_horus_price("145.80"), 2) == 145.80

    print("ALL PRICE PARSING TESTS PASSED!")


if __name__ == "__main__":
    test_bookinfo_purchase_price_parsing()
