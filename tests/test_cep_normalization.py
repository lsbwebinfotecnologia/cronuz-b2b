import sys, os
sys.path.insert(0, os.path.abspath('backend'))
from app.api.logistics import _normalize_cep, _mask_cep

def test_cep_normalization_and_mask():
    cases = [
        ('8710020', '08710020', '08710-020'),
        ('5513970', '05513970', '05513-970'),
        ('1304001', '01304001', '01304-001'),
        ('1223010', '01223010', '01223-010'),
        ('08710020', '08710020', '08710-020'),
        ('08710-020', '08710020', '08710-020'),
        (8710020, '08710020', '08710-020'),
        ('', '', ''),
        (None, '', ''),
    ]
    for val, exp_norm, exp_mask in cases:
        assert _normalize_cep(val) == exp_norm, f'Expected {exp_norm}, got {_normalize_cep(val)}'
        assert _mask_cep(val) == exp_mask, f'Expected {exp_mask}, got {_mask_cep(val)}'

if __name__ == '__main__':
    test_cep_normalization_and_mask()
    print('ALL CEP NORMALIZATION TESTS PASSED!')
