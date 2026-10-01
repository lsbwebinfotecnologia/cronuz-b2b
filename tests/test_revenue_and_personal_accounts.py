import os
import sys
from datetime import datetime, date, timedelta

# Adiciona o diretório backend ao sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.db.session import SessionLocal
import main
from app.models.company import Company
from app.models.user import User
from app.models.customer import Customer
from app.models.order import Order
from app.models.print_point import PrintPoint
from app.models.service import Service, ServiceOrder
from app.models.financial import FinancialCategory, FinancialTransaction, FinancialInstallment, FinancialAccount

def run_tests():
    db = SessionLocal()
    try:
        print("=== Iniciando Testes de Faturamento Consolidado e Contas Pessoais ===")

        # 1. Recupera ou cria empresa de teste
        company = db.query(Company).first()
        if not company:
            company = Company(name="Empresa Teste", cnpj="00000000000191", trade_name="Teste")
            db.add(company)
            db.commit()
            db.refresh(company)

        # 2. Testa criação de Conta Empresarial e Conta Pessoal
        conta_pj = FinancialAccount(
            company_id=company.id,
            name="Conta PJ Banco Inter",
            type="CURRENT",
            initial_balance=1000.0,
            current_balance=1000.0,
            is_personal=False
        )
        conta_pf = FinancialAccount(
            company_id=company.id,
            name="Conta PF Sócio",
            type="CURRENT",
            initial_balance=500.0,
            current_balance=500.0,
            is_personal=True
        )
        db.add_all([conta_pj, conta_pf])
        db.commit()
        db.refresh(conta_pj)
        db.refresh(conta_pf)
        print(f"✔ Contas criadas: PJ ID {conta_pj.id} (is_personal={conta_pj.is_personal}), PF ID {conta_pf.id} (is_personal={conta_pf.is_personal})")

        # 3. Testa Categoria e Lançamentos
        cat = db.query(FinancialCategory).filter(FinancialCategory.company_id == company.id).first()
        if not cat:
            cat = FinancialCategory(company_id=company.id, name="Despesas Gerais", type="PAYABLE", is_system=True)
            db.add(cat)
            db.commit()
            db.refresh(cat)

        today = date.today()

        # Transação da Empresa (deve aparecer em relatórios)
        trans_pj = FinancialTransaction(
            company_id=company.id,
            category_id=cat.id,
            description="Despesa Empresa - Servidor",
            type="PAYABLE",
            total_amount=300.0,
            issue_date=today,
            first_due_date=today,
            exclude_from_reports=False
        )
        db.add(trans_pj)
        db.flush()
        inst_pj = FinancialInstallment(
            transaction_id=trans_pj.id,
            number=1,
            due_date=today,
            amount=300.0,
            status="PENDING",
            account_id=conta_pj.id,
            exclude_from_reports=False
        )
        db.add(inst_pj)

        # Transação de Conta Pessoal (NÃO deve aparecer em relatórios gerenciais)
        trans_pf = FinancialTransaction(
            company_id=company.id,
            category_id=cat.id,
            description="Despesa Pessoal - Mercado",
            type="PAYABLE",
            total_amount=150.0,
            issue_date=today,
            first_due_date=today,
            exclude_from_reports=False
        )
        db.add(trans_pf)
        db.flush()
        inst_pf = FinancialInstallment(
            transaction_id=trans_pf.id,
            number=1,
            due_date=today,
            amount=150.0,
            status="PENDING",
            account_id=conta_pf.id,
            exclude_from_reports=False
        )
        db.add(inst_pf)

        # Transação Avulsa Marcada para Exclusão (NÃO deve aparecer em relatórios gerenciais)
        trans_excl = FinancialTransaction(
            company_id=company.id,
            category_id=cat.id,
            description="Lançamento Fora da Análise",
            type="PAYABLE",
            total_amount=70.0,
            issue_date=today,
            first_due_date=today,
            exclude_from_reports=True
        )
        db.add(trans_excl)
        db.flush()
        inst_excl = FinancialInstallment(
            transaction_id=trans_excl.id,
            number=1,
            due_date=today,
            amount=70.0,
            status="PENDING",
            account_id=conta_pj.id,
            exclude_from_reports=True
        )
        db.add(inst_excl)

        db.commit()
        db.refresh(inst_pj)
        db.refresh(inst_pf)
        db.refresh(inst_excl)
        print("✔ Transações e parcelas inseridas com sucesso.")

        # 4. Testa listagem e filtragem de generic_installments
        from app.api.financial import list_generic_installments, get_financial_summary
        user = User(id=1, email="admin@cronuz.com.br", type="SELLER", company_id=company.id)

        # Sem incluir pessoal (apenas gerencial da empresa): inst_pj deve vir, inst_pf e inst_excl NÃO devem vir
        resp_mgt = list_generic_installments(
            db=db,
            current_user=user,
            management_only=True
        )
        mgt_ids = [item["id"] for item in resp_mgt["items"]]
        assert inst_pj.id in mgt_ids, "inst_pj deveria estar no relatório gerencial da empresa"
        assert inst_pf.id not in mgt_ids, "inst_pf (conta pessoal) NÃO deveria estar no relatório gerencial"
        assert inst_excl.id not in mgt_ids, "inst_excl (exclude_from_reports) NÃO deveria estar no relatório gerencial"
        print(f"✔ list_generic_installments (management_only=True) filtrou perfeitamente contas pessoais e lançamentos desconsiderados!")

        # 5. Testa toggle_exclude
        from app.api.financial import toggle_installment_exclude
        t_res = toggle_installment_exclude(inst_pj.id, db=db, current_user=user)
        assert t_res["exclude_from_reports"] == True, "Deveria ter alternado para True"
        t_res2 = toggle_installment_exclude(inst_pj.id, db=db, current_user=user)
        assert t_res2["exclude_from_reports"] == False, "Deveria ter alternado de volta para False"
        print("✔ toggle_installment_exclude funcionando com sucesso!")

        # 6. Testa Dashboard Metrics e Revenue History
        from app.api.dashboard import get_dashboard_metrics
        dash_res = get_dashboard_metrics(
            start_date=today.strftime("%Y-%m-%d"),
            end_date=today.strftime("%Y-%m-%d"),
            include_personal=False,
            history_months=6,
            db=db,
            current_user=user
        )
        assert "revenue_history" in dash_res, "Dashboard deve conter revenue_history"
        assert "consolidated_revenue" in dash_res, "Dashboard deve conter consolidated_revenue"
        assert len(dash_res["revenue_history"]) == 6, f"Esperado 6 meses no histórico, obteve {len(dash_res['revenue_history'])}"
        print(f"✔ Dashboard revenue_history gerado com {len(dash_res['revenue_history'])} meses!")
        for mh in dash_res["revenue_history"]:
            print(f"   • {mh['label']} ({mh['year_month']}): Pedidos R$ {mh['orders_revenue']} | Serviços R$ {mh['services_revenue']} | Total R$ {mh['total_revenue']}")

        # 7. Limpeza dos dados de teste
        db.delete(inst_pj)
        db.delete(trans_pj)
        db.delete(inst_pf)
        db.delete(trans_pf)
        db.delete(inst_excl)
        db.delete(trans_excl)
        db.delete(conta_pj)
        db.delete(conta_pf)
        db.commit()
        print("✔ Limpeza realizada com sucesso.")
        print("=== TODOS OS TESTES PASSARAM COM SUCESSO! ===")

    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
