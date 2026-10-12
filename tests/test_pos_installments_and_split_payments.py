import unittest
import json
from app.api.pos import _parse_payment_breakdown


class TestPOSInstallmentsAndSplitPayments(unittest.TestCase):
    def test_parse_credito_single_and_installments(self):
        # Crédito à vista (sem details ou 1x)
        b_map, label, cash, inst = _parse_payment_breakdown("CREDITO", None, 150.0)
        self.assertEqual(b_map["CREDITO"], 150.0)
        self.assertEqual(b_map["DINHEIRO"], 0.0)
        self.assertEqual(cash, 0.0)
        self.assertEqual(label, "Crédito")
        self.assertEqual(inst, 1)

        # Crédito parcelado em 3x
        details = json.dumps({"installments": 3, "installment_amount": 50.0})
        b_map, label, cash, inst = _parse_payment_breakdown("CREDITO", details, 150.0)
        self.assertEqual(b_map["CREDITO"], 150.0)
        self.assertEqual(cash, 0.0)
        self.assertEqual(label, "Crédito (3x)")
        self.assertEqual(inst, 3)

    def test_parse_dinheiro_troco(self):
        details = json.dumps({"valor_recebido": 200.0, "troco": 52.40})
        b_map, label, cash, inst = _parse_payment_breakdown("DINHEIRO", details, 147.60)
        self.assertEqual(b_map["DINHEIRO"], 147.60)
        self.assertEqual(cash, 147.60)
        self.assertEqual(label, "Dinheiro")
        self.assertIsNone(inst)

    def test_parse_misto_split_credito_e_dinheiro(self):
        # Exemplo do usuário: R$ 300 no crédito (em 2x) e R$ 147.60 no dinheiro (total R$ 447.60)
        details = json.dumps({
            "method": "MISTO",
            "payments": [
                {
                    "method": "CREDITO",
                    "amount": 300.0,
                    "installments": 2,
                },
                {
                    "method": "DINHEIRO",
                    "amount": 147.60,
                    "cash_received": 150.0,
                    "troco": 2.40,
                }
            ],
            "troco": 2.40,
        })

        b_map, label, cash, inst = _parse_payment_breakdown("MISTO", details, 447.60)
        self.assertEqual(b_map["CREDITO"], 300.0)
        self.assertEqual(b_map["DINHEIRO"], 147.60)
        self.assertEqual(cash, 147.60)  # O dinheiro físico para apuração da gaveta do caixa
        self.assertTrue("Crédito 2x: R$ 300" in label)
        self.assertTrue("Dinheiro: R$ 147.60" in label or "Dinheiro: R$ 147,60" in label)

    def test_parse_misto_legacy_split(self):
        # Suporte a splitDetails legado: {"dinheiro": "100.0", "pix": "50.0", "cartao": "50.0"}
        details = json.dumps({"dinheiro": "100.0", "pix": "50.0", "cartao": "50.0"})
        b_map, label, cash, inst = _parse_payment_breakdown("MISTO", details, 200.0)
        self.assertEqual(b_map["DINHEIRO"], 100.0)
        self.assertEqual(b_map["PIX"], 50.0)
        self.assertEqual(b_map["CREDITO"], 50.0)
        self.assertEqual(cash, 100.0)


if __name__ == "__main__":
    unittest.main()

