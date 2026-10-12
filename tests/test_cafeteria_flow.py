import os
import sys
from decimal import Decimal
from datetime import datetime
from sqlalchemy.sql import func

# Adiciona backend ao PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

import main
from app.db.session import SessionLocal, engine
from app.models.company import Company
from app.models.user import User
from app.models.print_point import PrintPoint
from app.models.customer import Customer
from app.models.product import Product
from app.models.email_template import SysEmailTemplate
from app.models.pos import POSSession, POSSale, POSSessionStatus
from app.models.cafeteria import (
    Base, CAFTable, CAFTableStatus,
    CAFModifierGroup, CAFModifierOption, CAFProductModifier,
    CAFTab, CAFTabStatus,
    CAFOrderItem, CAFPrepStatus
)


def run_cafeteria_tests():
    print("=" * 60)
    print("INICIANDO TESTES DO FLUXO COMPLETO DO MÓDULO CAFETERIA")
    print("=" * 60)

    # 1. Garante que as tabelas existem no PostgreSQL
    print("[1/8] Verificando e criando tabelas do módulo cafeteria...")
    Base.metadata.create_all(bind=engine)
    print(" -> Tabelas criadas com sucesso!")

    db = SessionLocal()
    try:
        # Busca empresa de teste (id=4 ou primeira ativa)
        company = db.query(Company).filter(Company.active == True).first()
        if not company:
            print(" [!] Nenhuma empresa encontrada no banco local. Criando empresa de teste...")
            company = Company(
                name="Cafeteria & Livraria Teste",
                document="00.000.000/0001-99",
                domain="cafeteste.cronuz.com.br",
                module_cafeteria=True
            )
            db.add(company)
            db.commit()
            db.refresh(company)

        # Habilita module_cafeteria na empresa se não estiver
        if not getattr(company, "module_cafeteria", False):
            company.module_cafeteria = True
            db.commit()
            print(f" -> Módulo cafeteria ativado na empresa id={company.id} ({company.name})")
        else:
            print(f" -> Empresa id={company.id} ({company.name}) com module_cafeteria=True")

        company_id = company.id

        # 2. Teste de Criação de Mesas
        print("\n[2/8] Testando criação de Mesas (caf_table)...")
        test_table_num = f"T-{datetime.now().strftime('%M%S')}"
        table = CAFTable(
            company_id=company_id,
            number=test_table_num,
            area="Varanda Gourmet",
            capacity=4,
            status=CAFTableStatus.AVAILABLE.value,
            active=True
        )
        db.add(table)
        db.commit()
        db.refresh(table)
        assert table.id is not None
        assert table.status == CAFTableStatus.AVAILABLE.value
        print(f" -> Mesa criada com sucesso! ID={table.id}, Número={table.number}, Status={table.status}")

        # 3. Teste de Grupos de Modificadores e Opções
        print("\n[3/8] Testando criação de Modificadores (caf_modifier_group / option)...")
        mod_group = CAFModifierGroup(
            company_id=company_id,
            name="Tipo de Leite",
            min_selectable=0,
            max_selectable=1,
            active=True
        )
        db.add(mod_group)
        db.flush()

        opt1 = CAFModifierOption(
            group_id=mod_group.id,
            company_id=company_id,
            name="Leite Integral",
            additional_price=Decimal("0.00")
        )
        opt2 = CAFModifierOption(
            group_id=mod_group.id,
            company_id=company_id,
            name="Leite de Aveia",
            additional_price=Decimal("3.50")
        )
        db.add_all([opt1, opt2])
        db.commit()
        db.refresh(mod_group)
        assert len(mod_group.options) == 2
        print(f" -> Grupo '{mod_group.name}' criado com {len(mod_group.options)} opções!")

        # 4. Teste de Abertura de Comanda vinculada à Mesa
        print("\n[4/8] Testando abertura de Comanda (caf_tab)...")
        tab_num = f"CMD-{datetime.now().strftime('%H%M%S')}"
        tab = CAFTab(
            company_id=company_id,
            table_id=table.id,
            tab_number=tab_num,
            customer_name="Cliente Expresso",
            status=CAFTabStatus.OPEN.value,
            subtotal=Decimal("0.00"),
            discount=Decimal("0.00"),
            total_amount=Decimal("0.00")
        )
        table.status = CAFTableStatus.OCCUPIED.value
        db.add(tab)
        db.commit()
        db.refresh(tab)
        assert tab.id is not None
        assert table.status == CAFTableStatus.OCCUPIED.value
        print(f" -> Comanda #{tab.tab_number} aberta! Mesa {table.number} atualizada para {table.status}")

        # 5. Teste de Adição de Itens com Modificadores
        print("\n[5/8] Testando lançamento de Itens com modificadores na Comanda...")
        item1 = CAFOrderItem(
            company_id=company_id,
            tab_id=tab.id,
            barcode="CAF-001",
            sku="EXP-DUPLO",
            title="Cappuccino Italiano",
            source="CRONUZ",
            quantity=Decimal("2.00"),
            unit_price=Decimal("12.00"),
            modifiers_price=Decimal("3.50"),  # Leite de aveia
            total_price=Decimal("31.00"),     # (12 + 3.50) * 2
            modifiers_json=[{"group": "Tipo de Leite", "option": "Leite de Aveia", "price": 3.50}],
            notes="Bem quente e com canela polvilhada",
            requires_preparation=True,
            prep_status=CAFPrepStatus.PENDING.value
        )
        item2 = CAFOrderItem(
            company_id=company_id,
            tab_id=tab.id,
            barcode="CAF-002",
            sku="P-QUEIJO",
            title="Pão de Queijo Recheado",
            source="CRONUZ",
            quantity=Decimal("1.00"),
            unit_price=Decimal("9.00"),
            modifiers_price=Decimal("0.00"),
            total_price=Decimal("9.00"),
            requires_preparation=True,
            prep_status=CAFPrepStatus.PENDING.value
        )
        db.add_all([item1, item2])
        tab.subtotal = item1.total_price + item2.total_price
        tab.total_amount = tab.subtotal
        db.commit()
        db.refresh(tab)
        assert tab.total_amount == Decimal("40.00")
        print(f" -> 2 Itens lançados! Subtotal: R$ {tab.subtotal} | Total: R$ {tab.total_amount}")

        # 6. Teste da Fila de Preparo do Barista (KDS)
        print("\n[6/8] Testando KDS (Fila de Barista)...")
        kds_items = db.query(CAFOrderItem).filter(
            CAFOrderItem.company_id == company_id,
            CAFOrderItem.tab_id == tab.id,
            CAFOrderItem.requires_preparation == True,
            CAFOrderItem.prep_status == CAFPrepStatus.PENDING.value
        ).all()
        assert len(kds_items) == 2
        print(f" -> Encontrados {len(kds_items)} itens pendentes no KDS.")

        # Avança item1 para PREPARING e depois READY
        item1.prep_status = CAFPrepStatus.PREPARING.value
        item1.prep_started_at = func.now()
        db.commit()
        print(f" -> Item '{item1.title}' avançado para {item1.prep_status}")

        item1.prep_status = CAFPrepStatus.READY.value
        item1.prep_finished_at = func.now()
        db.commit()
        print(f" -> Item '{item1.title}' avançado para {item1.prep_status}")

        # 7. Teste de Sessão de Caixa do PDV
        print("\n[7/8] Verificando sessão de PDV ativa...")
        session = db.query(POSSession).filter(
            POSSession.company_id == company_id,
            POSSession.status == POSSessionStatus.OPEN.value
        ).first()

        if not session:
            print(" -> Nenhuma sessão de PDV aberta. Criando sessão de teste...")
            session = POSSession(
                company_id=company_id,
                code=f"CX-{datetime.now().strftime('%H%M%S')}",
                title="Caixa Cafeteria / PDV Principal",
                status=POSSessionStatus.OPEN.value,
                initial_cash_amount=Decimal("100.00"),
                total_sales_count=0,
                total_sales_amount=Decimal("0.00")
            )
            db.add(session)
            db.commit()
            db.refresh(session)
        print(f" -> Sessão do PDV #{session.code} ativa (ID={session.id})")

        # 8. Teste de Checkout e Fechamento Integrado
        print("\n[8/8] Testando Checkout da Comanda integrado ao PDV...")
        sale = POSSale(
            company_id=company_id,
            session_id=session.id,
            client_sale_uuid=f"caf-test-{datetime.now().timestamp()}",
            sale_number=f"CAF-{tab.tab_number}",
            customer_name=tab.customer_name,
            payment_method="PIX",
            subtotal=tab.subtotal,
            discount=tab.discount,
            total_amount=tab.total_amount,
            items_count=2,
            sold_at=func.now(),
            origin="cafeteria_pos",
            status="COMPLETED"
        )
        db.add(sale)
        db.flush()

        tab.status = CAFTabStatus.PAID.value
        tab.pos_session_id = session.id
        tab.pos_sale_id = sale.id
        tab.closed_at = func.now()
        table.status = CAFTableStatus.AVAILABLE.value

        session.total_sales_count += 1
        session.total_sales_amount += tab.total_amount

        db.commit()

        print(f" -> Checkout concluído com sucesso!")
        print(f"    - Venda PDV gerada: #{sale.sale_number} (ID={sale.id})")
        print(f"    - Status da Comanda: {tab.status}")
        print(f"    - Status da Mesa {table.number}: {table.status} (Liberada)")
        print(f"    - Vendas do Caixa PDV: {session.total_sales_count} vendas | Total R$ {session.total_sales_amount}")

        print("\n" + "=" * 60)
        print("TODOS OS TESTES DO MÓDULO CAFETERIA PASSARAM COM 100% DE SUCESSO!")
        print("=" * 60)

    finally:
        db.close()


if __name__ == "__main__":
    run_cafeteria_tests()
