import main
import app.models.print_point
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

from app.integrators.horus_orders import HorusOrders
from app.api.orders import send_order_to_horus
from app.models.order import Order, OrderItem
from app.models.customer import Customer
from app.models.company import Company
from app.models.company_settings import CompanySettings


async def test_send_order_item_params():
    mock_db = MagicMock()
    settings = MagicMock(spec=CompanySettings)
    settings.horus_url = 'http://api.horus.com'
    settings.horus_token = 'token'
    settings.horus_port = None
    settings.horus_legacy_pagination = False
    mock_db.query.return_value.filter.return_value.first.return_value = settings

    client = HorusOrders(mock_db, company_id=1)
    
    # Mock do método get para interceptar os params
    client.get = AsyncMock(return_value=[{'Falha': False}])
    
    # 1. Teste com price=None (Bookinfo)
    await client.send_order_item(
        id_doc='12345678901',
        id_guid='GUID-123',
        cnpj_destino='98765432000199',
        cod_pedido_origem='REF-BOOKINFO-001',
        isbn='9788535902778',
        qty=5,
        price=None
    )
    
    called_params_none = client.get.call_args[1]['params']
    assert 'VLR_LIQUIDO' not in called_params_none, 'VLR_LIQUIDO não deve estar presente quando price=None'
    assert called_params_none['BARRAS_ISBN'] == '9788535902778'
    assert called_params_none['QTD_PEDIDA'] == 5
    assert called_params_none['COD_PEDIDO_ORIGEM'] == 'REF-BOOKINFO-001'
    
    # 2. Teste com price preenchido
    await client.send_order_item(
        id_doc='12345678901',
        id_guid='GUID-123',
        cnpj_destino='98765432000199',
        cod_pedido_origem='PDV-123',
        isbn='9788535902778',
        qty=2,
        price=45.50
    )
    called_params_price = client.get.call_args[1]['params']
    assert 'VLR_LIQUIDO' in called_params_price
    assert called_params_price['VLR_LIQUIDO'] == 45.50
    print('✓ test_send_order_item_params passou com sucesso!')


async def test_send_order_to_horus_bookinfo_omits_price():
    mock_db = MagicMock()

    settings = MagicMock(spec=CompanySettings)
    settings.company_id = 1
    settings.horus_enabled = True
    settings.horus_api_mode = 'B2B'

    customer = MagicMock(spec=Customer)
    customer.id = 10
    customer.document = '12345678000199'
    customer.id_guid = 'GUID-CUST-10'

    company = MagicMock(spec=Company)
    company.id = 1
    company.document = '98765432000188'

    order = MagicMock(spec=Order)
    order.id = 999
    order.company_id = 1
    order.customer_id = 10
    order.origin = 'bookinfo'
    order.customer_order_ref = 'REF-BK-555'
    order.partner_reference = None
    order.type_order = 'V'
    order.horus_pedido_venda = None

    item = MagicMock(spec=OrderItem)
    item.quantity = 3
    item.partner_situation = 'reservado_total'
    item.ean_isbn = '9788535902778'
    item.sku = None
    item.product_id = None
    item.unit_price = 39.90
    item.price_gross = 39.90
    item.partner_discount = 20.0

    mock_db.query.return_value.filter.return_value.first.side_effect = [
        settings,
        customer,
        company,
    ]
    mock_db.query.return_value.filter.return_value.all.return_value = [item]

    with patch('app.integrators.horus_orders.HorusOrders') as MockHorusOrders:
        instance = MockHorusOrders.return_value
        instance.send_order = AsyncMock(return_value={'error': False, 'COD_PED_VENDA': '12345'})
        instance.close = AsyncMock()
        instance.alt_status_pedido = AsyncMock()
        instance.send_order_item = AsyncMock(return_value={'Falha': False})

        res = await send_order_to_horus(order, mock_db)
        assert res['success'] is True

        instance.send_order_item.assert_called_once()
        args, kwargs = instance.send_order_item.call_args
        assert kwargs['price'] is None, 'Para pedidos da Bookinfo, o price passado deve ser None'
        assert kwargs['isbn'] == '9788535902778'
        assert kwargs['qty'] == 3
        print('✓ test_send_order_to_horus_bookinfo_omits_price passou com sucesso!')

if __name__ == '__main__':
    asyncio.run(test_send_order_item_params())
    asyncio.run(test_send_order_to_horus_bookinfo_omits_price())
    print('TODOS OS TESTES PASSARAM COM SUCESSO!')
