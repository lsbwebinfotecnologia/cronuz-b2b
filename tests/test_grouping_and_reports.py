
import os
import sys

backend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend'))
sys.path.insert(0, backend_path)

import main
from app.db.session import SessionLocal
from app.models.service import ServiceOrder
from app.models.financial import FinancialTransaction, FinancialInstallment, FinancialCategory
from app.models.company import Company
from app.services.services_exports import export_services_by_customer_excel, export_services_by_customer_pdf
from app.services.financial_exports import export_cashflow_forecast_excel, export_cashflow_forecast_pdf
from app.api.services import _build_services_by_customer_data
from app.api.financial import _build_cashflow_forecast_data

def test_services_and_financial():
    db = SessionLocal()
    try:
        print('=== 1. Testando Servicos por Cliente e Exportacoes ===')
        company = db.query(Company).first()
        if not company:
            print('Nenhuma empresa encontrada para teste.')
            return

        cid = company.id
        print(f'Empresa ID: {cid} - {company.name}')

        report_data = _build_services_by_customer_data(
            company_id=cid,
            start_date=None,
            end_date=None,
            customer_id=None,
            status=None,
            db=db
        )
        print(f'Grupos de clientes encontrados em servicos: {len(report_data)}')

        excel_buf = export_services_by_customer_excel(
            customer_groups=report_data,
            company_name=company.name,
            period_label='Periodo de Testes'
        )
        assert excel_buf.getvalue(), 'Buffer do Excel de Servicos veio vazio'
        print(f'-> Excel de Servicos gerado com sucesso: {len(excel_buf.getvalue())} bytes')

        pdf_buf = export_services_by_customer_pdf(
            customer_groups=report_data,
            company_name=company.name,
            period_label='Periodo de Testes'
        )
        assert pdf_buf.getvalue(), 'Buffer do PDF de Servicos veio vazio'
        print(f'-> PDF de Servicos gerado com sucesso: {len(pdf_buf.getvalue())} bytes')

        print('=== 2. Testando Fluxo de Caixa Previsto e Exportacoes ===')
        fin_data = _build_cashflow_forecast_data(
            company_id=cid,
            start_date=None,
            end_date=None,
            customer_id=None,
            type_filter=None,
            db=db
        )
        print(f'Grupos de clientes encontrados no financeiro: {len(fin_data)}')

        fin_excel_buf = export_cashflow_forecast_excel(
            customer_groups=fin_data,
            company_name=company.name,
            period_label='Periodo de Testes Previsto'
        )
        assert fin_excel_buf.getvalue(), 'Buffer do Excel Financeiro veio vazio'
        print(f'-> Excel do Fluxo Previsto gerado com sucesso: {len(fin_excel_buf.getvalue())} bytes')

        fin_pdf_buf = export_cashflow_forecast_pdf(
            customer_groups=fin_data,
            company_name=company.name,
            period_label='Periodo de Testes Previsto'
        )
        assert fin_pdf_buf.getvalue(), 'Buffer do PDF Financeiro veio vazio'
        print(f'-> PDF do Fluxo Previsto gerado com sucesso: {len(fin_pdf_buf.getvalue())} bytes')

        print('=== 3. Validacao de Estrutura de Banco de Dados ===')
        so_cols = [c.name for c in ServiceOrder.__table__.columns]
        assert 'grouped_in_id' in so_cols, 'grouped_in_id nao encontrada em ServiceOrder'
        print('Checagem ServiceOrder.grouped_in_id: OK (coluna mapeada)')

        fi_cols = [c.name for c in FinancialInstallment.__table__.columns]
        assert 'grouped_in_id' in fi_cols, 'grouped_in_id nao encontrada em FinancialInstallment'
        print('Checagem FinancialInstallment.grouped_in_id: OK (coluna mapeada)')

        print('=== 4. Testando Soma Mes a Mes (DISTRIBUTE_MONTHLY) em Servicos e Financeiro ===')
        from datetime import date
        from app.models.customer import Customer
        from app.models.service import Service, ServiceOrderStatus
        from app.models.user import User
        from app.schemas.service import ServiceOrderCreate
        from app.schemas.financial import FinancialTransactionCreate
        from app.api.services import create_service_order
        from app.api.financial import create_transaction

        user = db.query(User).filter(User.company_id == cid).first()
        if not user:
            user = db.query(User).first()
            user.company_id = cid

        customer = db.query(Customer).filter(Customer.company_id == cid).first()
        if not customer:
            customer = Customer(company_id=cid, name="Cliente Teste Agrupamento", document="12345678901")
            db.add(customer)
            db.flush()

        service = db.query(Service).filter(Service.company_id == cid).first()
        if not service:
            service = Service(company_id=cid, name="Serviço Base Teste", base_value=500.0)
            db.add(service)
            db.flush()

        category = db.query(FinancialCategory).filter(FinancialCategory.company_id == cid, FinancialCategory.type == "RECEIVABLE").first()
        if not category:
            category = FinancialCategory(company_id=cid, name="Receita de Serviços", type="RECEIVABLE", active=True)
            db.add(category)
            db.flush()

        db.commit()

        d1 = date(2026, 10, 15)
        d2 = date(2026, 11, 15)

        # 4.1 Serviços: cria 2 O.S. existentes
        os1 = ServiceOrder(
            company_id=cid,
            customer_id=customer.id,
            service_id=service.id,
            negotiated_value=500.0,
            execution_date=d1,
            status=ServiceOrderStatus.PENDING,
            custom_description="O.S. Outubro Inicial"
        )
        os2 = ServiceOrder(
            company_id=cid,
            customer_id=customer.id,
            service_id=service.id,
            negotiated_value=500.0,
            execution_date=d2,
            status=ServiceOrderStatus.PENDING,
            custom_description="O.S. Novembro Inicial"
        )
        db.add_all([os1, os2])
        db.commit()
        db.refresh(os1)
        db.refresh(os2)

        # Novo serviço recorrente por 3 meses (Out, Nov, Dez) de R$ 250
        new_svc = ServiceOrderCreate(
            customer_id=customer.id,
            service_id=service.id,
            negotiated_value=250.0,
            execution_date=d1,
            custom_description="Adicional Manutenção",
            is_recurrent=True,
            recurrence_end_date=date(2026, 12, 15),
            merge_mode="DISTRIBUTE_MONTHLY"
        )
        create_service_order(order_in=new_svc, db=db, current_user=user)
        db.refresh(os1)
        db.refresh(os2)

        assert os1.negotiated_value == 750.0, f"OS 1 valor esperado 750, obtido {os1.negotiated_value}"
        assert os2.negotiated_value == 750.0, f"OS 2 valor esperado 750, obtido {os2.negotiated_value}"
        assert "Adicional Manutenção" in os1.custom_description

        os3 = db.query(ServiceOrder).filter(
            ServiceOrder.company_id == cid,
            ServiceOrder.customer_id == customer.id,
            ServiceOrder.execution_date == date(2026, 12, 15)
        ).first()
        assert os3 is not None, "OS excedente de Dezembro não criada"
        assert os3.negotiated_value == 250.0
        print("-> Teste DISTRIBUTE_MONTHLY em Serviços: SUCESSO (somou Outubro, Novembro e criou Dezembro)!")

        # 4.2 Financeiro: cria transação base com 2 parcelas (Out, Nov)
        trans_base = FinancialTransaction(
            company_id=cid,
            customer_id=customer.id,
            category_id=category.id,
            description="Contrato Base",
            type="RECEIVABLE",
            transaction_status="CONFIRMADO",
            total_amount=2000.0,
            issue_date=d1,
            first_due_date=d1
        )
        db.add(trans_base)
        db.flush()
        inst1 = FinancialInstallment(transaction_id=trans_base.id, number=1, due_date=d1, amount=1000.0, status="PENDING")
        inst2 = FinancialInstallment(transaction_id=trans_base.id, number=2, due_date=d2, amount=1000.0, status="PENDING")
        db.add_all([inst1, inst2])
        db.commit()
        db.refresh(inst1)
        db.refresh(inst2)

        # Lança novo valor mensal de R$ 300 por 3 meses (Out, Nov, Dez)
        new_fin = FinancialTransactionCreate(
            description="Suporte Extra",
            category_id=category.id,
            type="RECEIVABLE",
            transaction_status="CONFIRMADO",
            total_amount=900.0,
            installments_count=3,
            keep_fixed_day=True,
            issue_date=d1,
            first_due_date=d1,
            customer_id=customer.id,
            merge_mode="DISTRIBUTE_MONTHLY"
        )
        create_transaction(transaction=new_fin, db=db, current_user=user)
        db.refresh(inst1)
        db.refresh(inst2)

        assert inst1.amount == 1300.0, f"Inst 1 esperado 1300, obtido {inst1.amount}"
        assert inst2.amount == 1300.0, f"Inst 2 esperado 1300, obtido {inst2.amount}"

        inst3 = db.query(FinancialInstallment).join(
            FinancialTransaction, FinancialInstallment.transaction_id == FinancialTransaction.id
        ).filter(
            FinancialTransaction.company_id == cid,
            FinancialTransaction.customer_id == customer.id,
            FinancialInstallment.due_date == date(2026, 12, 15)
        ).first()
        assert inst3 is not None, "Parcela excedente de Dezembro não criada"
        assert inst3.amount == 300.0
        print("-> Teste DISTRIBUTE_MONTHLY no Financeiro: SUCESSO (somou Outubro, Novembro e criou Dezembro)!")

        # Limpeza
        db.delete(os1)
        db.delete(os2)
        db.delete(os3)
        db.delete(trans_base)
        if inst3 and inst3.transaction:
            db.delete(inst3.transaction)
        db.commit()
        print("-> Limpeza de dados de teste: OK")

        print('>>> TODOS OS TESTES PASSARAM COM 100% DE SUCESSO! <<<')

    finally:
        db.close()

if __name__ == '__main__':
    test_services_and_financial()
