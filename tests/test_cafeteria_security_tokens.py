import os
import sys
import unittest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from fastapi.testclient import TestClient
import main
from main import app
from app.db.session import SessionLocal
from app.models.company import Company
from app.models.company_settings import CompanySettings
from app.models.cafeteria import CAFTable, CAFTableStatus


class TestCafeteriaSecurityTokens(unittest.TestCase):
    def setUp(self):
        self.db = SessionLocal()
        self.client = TestClient(app)
        self.company = self.db.query(Company).filter(Company.module_cafeteria == True).first()
        if not self.company:
            self.company = self.db.query(Company).first()
            self.company.module_cafeteria = True
            self.db.commit()

        self.settings = self.db.query(CompanySettings).filter(CompanySettings.company_id == self.company.id).first()
        if not self.settings:
            self.settings = CompanySettings(company_id=self.company.id, cafeteria_menu_token='crd_test12345678')
            self.db.add(self.settings)
            self.db.commit()
            self.db.refresh(self.settings)
        elif not self.settings.cafeteria_menu_token:
            self.settings.cafeteria_menu_token = 'crd_test12345678'
            self.db.commit()

        self.table = self.db.query(CAFTable).filter(CAFTable.company_id == self.company.id).first()
        if not self.table:
            self.table = CAFTable(
                company_id=self.company.id,
                number='T-99',
                table_token='tab_test99',
                area='Salão',
                capacity=4,
                status=CAFTableStatus.AVAILABLE.value
            )
            self.db.add(self.table)
            self.db.commit()
            self.db.refresh(self.table)
        elif not self.table.table_token:
            self.table.table_token = 'tab_test99'
            self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_01_public_menu_with_valid_token(self):
        token = self.settings.cafeteria_menu_token
        res = self.client.get(f'/public/cafeteria/menu/{token}?mesa={self.table.table_token}')
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn('company', data)
        self.assertEqual(data['company']['id'], self.company.id)
        self.assertIsNotNone(data['table'])
        self.assertEqual(data['table']['table_token'], self.table.table_token)

    def test_02_block_numeric_idor(self):
        # Tentar acessar diretamente com o ID da empresa deve ser rejeitado (404)
        res = self.client.get(f'/public/cafeteria/menu/{self.company.id}')
        self.assertEqual(res.status_code, 404)

    def test_03_call_waiter_with_valid_token(self):
        payload = {
            'company_id': self.company.id,
            'table_token': self.table.table_token,
            'customer_name': 'Cliente Teste'
        }
        res = self.client.post('/public/cafeteria/call-waiter', json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertTrue(data['success'])

    def test_04_call_waiter_blocked_with_fake_token(self):
        payload = {
            'company_id': self.company.id,
            'table_token': 'tab_token_falso_trotista',
            'customer_name': 'Invasor'
        }
        res = self.client.post('/public/cafeteria/call-waiter', json=payload)
        self.assertEqual(res.status_code, 403)


if __name__ == '__main__':
    unittest.main()
