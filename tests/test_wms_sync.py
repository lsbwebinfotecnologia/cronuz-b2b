import sys, os
sys.path.insert(0, os.path.abspath('backend'))
from app.api.logistics import _extract_legado_id

def test_extract_legado_id():
    # Case 1: MKT format standard {"data": [{"legado_pedido_id": 750409, "pedido_numero": "19614"}]}
    res1 = {"data": [{"legado_pedido_id": 750409, "pedido_numero": "19614"}]}
    assert _extract_legado_id(res1) == "750409", f"Failed: {_extract_legado_id(res1)}"

    # Case 2: Dict directly in data {"data": {"id": 12345}}
    res2 = {"data": {"id": 12345}}
    assert _extract_legado_id(res2) == "12345", f"Failed: {_extract_legado_id(res2)}"

    # Case 3: Root id {"id": "999"}
    res3 = {"id": "999"}
    assert _extract_legado_id(res3) == "999", f"Failed: {_extract_legado_id(res3)}"

    # Case 4: legado_pedido_id directly in root
    res4 = {"legado_pedido_id": 8888}
    assert _extract_legado_id(res4) == "8888", f"Failed: {_extract_legado_id(res4)}"

    # Case 5: Empty / None
    assert _extract_legado_id({}) is None
    assert _extract_legado_id(None) is None

if __name__ == '__main__':
    test_extract_legado_id()
    print("ALL EXTRACT LEGADO ID TESTS PASSED!")
