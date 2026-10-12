import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

import main
from app.db.session import SessionLocal
from app.models.cafeteria import CAFTab, CAFOrderItem, CAFPrepStatus, CAFPrepSector
from decimal import Decimal

def test_draft_and_dispatch():
    db = SessionLocal()
    try:
        tab = db.query(CAFTab).filter(CAFTab.status == 'OPEN').first()
        if not tab:
            print('Nenhuma comanda aberta para teste.')
            return

        company_id = tab.company_id
        print(f'Testando com Comanda #{tab.tab_number} (ID: {tab.id}) da Empresa {company_id}')

        # 1. Cria item em DRAFT (Rascunho)
        draft_item = CAFOrderItem(
            company_id=company_id,
            tab_id=tab.id,
            title='Capuccino Canela Especial (Teste Rascunho)',
            quantity=Decimal('1.00'),
            unit_price=Decimal('12.50'),
            total_price=Decimal('12.50'),
            prep_sector=CAFPrepSector.BEVERAGE.value,
            prep_status=CAFPrepStatus.DRAFT.value,
            requires_preparation=True
        )
        db.add(draft_item)
        db.commit()
        db.refresh(draft_item)
        print(f'[OK] Item em Rascunho criado com sucesso! ID: {draft_item.id}, Status: {draft_item.prep_status}')
        assert draft_item.prep_status == CAFPrepStatus.DRAFT.value

        # 2. Testa despacho para PENDING (Fila KDS)
        draft_item.prep_status = CAFPrepStatus.PENDING.value
        db.commit()
        db.refresh(draft_item)
        print(f'[OK] Item despachado para a fila KDS! ID: {draft_item.id}, Status: {draft_item.prep_status}')
        assert draft_item.prep_status == CAFPrepStatus.PENDING.value

        # 3. Limpeza do item de teste
        db.delete(draft_item)
        db.commit()
        print('[OK] Limpeza concluida com sucesso!')

    finally:
        db.close()

if __name__ == '__main__':
    test_draft_and_dispatch()
