import sys
sys.path.append('backend')
from app.models.company_settings import CompanySettings
from app.models.order import OrderItem
from app.schemas.company_settings import CompanySettingsBase
from app.schemas.order import OrderItemResponse

def test_bookinfo_models_and_schemas():
    # 1. Valida schemas de CompanySettings
    st = CompanySettingsBase(
        bookinfo_analysis_timing='AFTER_CONFERENCE',
        bookinfo_min_stock_buffer=3,
        bookinfo_block_consign_low_stock=True,
        bookinfo_consign_low_stock_threshold=5,
        bookinfo_allow_partial_fulfill=True
    )
    assert st.bookinfo_analysis_timing == 'AFTER_CONFERENCE'
    assert st.bookinfo_min_stock_buffer == 3
    assert st.bookinfo_block_consign_low_stock is True
    assert st.bookinfo_consign_low_stock_threshold == 5

    # 2. Valida schema de OrderItemResponse com has_erp_registration
    oi = OrderItemResponse(
        id=1,
        order_id=10,
        total_price=59.90,
        has_erp_registration=False,
        partner_situation='sem_cadastro_erp',
        situation_detail='Item não localizado no catálogo do ERP Hórus'
    )
    assert oi.has_erp_registration is False
    assert oi.partner_situation == 'sem_cadastro_erp'

    print('ALL TESTS PASSED: Bookinfo commercial rules & timing models verified!')

if __name__ == '__main__':
    test_bookinfo_models_and_schemas()
