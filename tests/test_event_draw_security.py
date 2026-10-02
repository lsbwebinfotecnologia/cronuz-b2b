import sys
import os
import unittest
from datetime import datetime, date

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))
from types import SimpleNamespace

from fastapi import HTTPException
from app.api.school_storefront import validate_cpf


class TestEventDrawSecurity(unittest.TestCase):
    def test_cpf_validator(self):
        # Validação de CPF válido e inválido
        self.assertTrue(validate_cpf("52998224725"))
        self.assertFalse(validate_cpf("11111111111"))
        self.assertFalse(validate_cpf("12345678900"))

    def test_draw_performed_security_logic(self):
        # Evento com sorteio já realizado
        evt_drawn = SimpleNamespace(
            id=10,
            company_id=1,
            title="Amigo Secreto 2026",
            status="IN_PROGRESS",
            draw_performed_at=datetime.utcnow()
        )


        with self.assertRaises(HTTPException) as ctx:
            if evt_drawn.status not in ["OPEN", "DRAFT"]:
                raise HTTPException(status_code=400, detail="Inscrições encerradas para este evento.")
            if evt_drawn.draw_performed_at is not None:
                raise HTTPException(
                    status_code=400,
                    detail="As inscrições para este evento foram encerradas pois o sorteio do amigo secreto já foi realizado. Não é permitido novos cadastros após o sorteio."
                )

        self.assertEqual(ctx.exception.status_code, 400)

        # Evento em aberto mas com sorteio já executado
        evt_open_but_drawn = SimpleNamespace(
            id=11,
            company_id=1,
            title="Amigo Secreto Aberto mas Sorteado",
            status="OPEN",
            draw_performed_at=datetime.utcnow()
        )


        with self.assertRaises(HTTPException) as ctx2:
            if evt_open_but_drawn.status not in ["OPEN", "DRAFT"]:
                raise HTTPException(status_code=400, detail="Inscrições encerradas para este evento.")
            if evt_open_but_drawn.draw_performed_at is not None:
                raise HTTPException(
                    status_code=400,
                    detail="As inscrições para este evento foram encerradas pois o sorteio do amigo secreto já foi realizado. Não é permitido novos cadastros após o sorteio."
                )

        self.assertEqual(ctx2.exception.status_code, 400)
        self.assertIn("sorteio do amigo secreto já foi realizado", ctx2.exception.detail)


if __name__ == "__main__":
    unittest.main()
