import sys
import os
import uuid
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

import main
from app.db.session import SessionLocal
from app.models.user import User
from app.models.company import Company
from app.models.pos import POSSale, POSSaleItem, POSSession
from app.schemas.pos import POSSyncBatchRequest, POSSaleCreate, POSSaleItemSchema
from app.api.pos import sync_pos_sales

def test_sync_batch_resilience():
    print("Iniciando testes de Resiliência e Idempotência do Batch Sync...")
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.company_id == 4).first()
        company_id = 4

        # 1. Cria payload com 2 vendas únicas
        uuid_1 = f"test-sync-{uuid.uuid4()}"
        uuid_2 = f"test-sync-{uuid.uuid4()}"

        sale_1 = POSSaleCreate(
            client_sale_uuid=uuid_1,
            sale_number="PDV-TEST-001",
            customer_name="Cliente Offline 1",
            customer_document="12345678909",
            payment_method="PIX",
            subtotal=169.00,
            discount=0.00,
            total_amount=169.00,
            items_count=1,
            sold_at=datetime.utcnow(),
            origin="pdv_offline",
            items=[
                POSSaleItemSchema(
                    barcode="9788565985079",
                    sku="76",
                    title="Z_Psicologia das cores, A",
                    publisher="GG",
                    quantity=1.0,
                    unit_price=169.00,
                    total_price=169.00,
                    horus_item_code="76"
                )
            ]
        )

        sale_2 = POSSaleCreate(
            client_sale_uuid=uuid_2,
            sale_number="PDV-TEST-002",
            customer_name="Cliente Avulso",
            payment_method="DINHEIRO",
            payment_details='{"recebido": 100.0, "troco": 1.0}',
            subtotal=99.00,
            discount=0.00,
            total_amount=99.00,
            items_count=1,
            sold_at=datetime.utcnow(),
            origin="pdv_mobile_offline",
            items=[
                POSSaleItemSchema(
                    barcode="9788565985208",
                    sku="92",
                    title="Z_Psicologia para criativos",
                    publisher="GG",
                    quantity=1.0,
                    unit_price=99.00,
                    total_price=99.00
                )
            ]
        )

        batch = POSSyncBatchRequest(
            sales=[sale_1, sale_2],
            session_id=1
        )

        # 2. Primeira Execução do Batch
        print("Enviando primeiro lote com 2 vendas...")
        res_1 = sync_pos_sales(company_id=company_id, payload=batch, db=db, current_user=user)
        print(f"Resultado 1: total={res_1.total_received}, success={res_1.success_count}, already={res_1.already_synced_count}, failed={res_1.failed_count}")
        assert res_1.success_count == 2
        assert res_1.failed_count == 0
        assert len(res_1.synced_uuids) == 2
        print("✅ Primeiro lote sincronizado com sucesso!")

        # 3. Teste de Idempotência: re-envio do MESMO lote
        print("Enviando novamente o mesmo lote para testar Idempotência...")
        res_2 = sync_pos_sales(company_id=company_id, payload=batch, db=db, current_user=user)
        print(f"Resultado 2: total={res_2.total_received}, success={res_2.success_count}, already={res_2.already_synced_count}, failed={res_2.failed_count}")
        assert res_2.success_count == 0
        assert res_2.already_synced_count == 2
        assert res_2.failed_count == 0
        assert len(res_2.synced_uuids) == 2
        print("✅ Idempotência validada: Nenhuma venda duplicada!")

        # 4. Verifica integridade dos registros no banco
        db_sale_1 = db.query(POSSale).filter(POSSale.client_sale_uuid == uuid_1).first()
        assert db_sale_1 is not None
        assert db_sale_1.customer_id is not None
        assert len(db_sale_1.items) == 1
        assert float(db_sale_1.items[0].unit_price) == 169.00
        print("✅ Venda 1 persistida com integridade e itens associados!")

        db_sale_2 = db.query(POSSale).filter(POSSale.client_sale_uuid == uuid_2).first()
        assert db_sale_2 is not None
        assert db_sale_2.customer_name == "Cliente Avulso"
        assert len(db_sale_2.items) == 1
        print("✅ Venda 2 persistida com cliente gerencial e dados corretos!")

        print("\n🎉 TODOS OS TESTES DE RESILIÊNCIA E SYNC PASSARAM COM SUCESSO!")
    finally:
        db.close()

if __name__ == "__main__":
    test_sync_batch_resilience()
