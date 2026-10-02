import sys
import os
import unittest
from datetime import datetime, date

# Configurar PYTHONPATH para backend
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

from app.models.school import SchoolDetail, SchoolClass, SchoolEvent, SchoolEventParticipant
from app.models.company import Company
from app.models.customer import Customer
from app.models.order import Order
from app.schemas.school import SchoolCreate, SchoolEventCreate, EventParticipantEnroll

class TestSchoolsAndEvents(unittest.TestCase):
    def test_schema_validations(self):
        # 1. Validação de cadastro de escola
        school_data = SchoolCreate(
            name="Colégio Visconde de Porto Seguro",
            corporate_name="Sociedade Visconde de Porto Seguro",
            document="12.345.678/0001-90",
            email="contato@portoseguro.org.br",
            phone="11999999999",
            city="São Paulo",
            state="SP",
            inep_code="12345678",
            coordinator_name="Profa. Marina Silva",
            initial_classes=["1º Ano A", "2º Ano B", "5º Ano C"]
        )
        self.assertEqual(school_data.name, "Colégio Visconde de Porto Seguro")
        self.assertEqual(len(school_data.initial_classes), 3)

        # 2. Validação de criação de evento de Amigo Secreto
        event_data = SchoolEventCreate(
            title="Amigo Secreto Literário de Natal 2026",
            slug="amigo-secreto-natal-2026",
            event_type="AMIGO_SECRETO",
            description="Troca de livros entre os alunos do 5º Ano",
            status="OPEN",
            rules_config={"allow_wishlist": True, "school_delivery": True}
        )
        self.assertEqual(event_data.event_type, "AMIGO_SECRETO")
        self.assertTrue(event_data.rules_config["school_delivery"])

        # 3. Validação de inscrição de aluno com preferências
        enroll_data = EventParticipantEnroll(
            student_name="Arthur Silva",
            student_birth_date=date(2016, 5, 20),
            parent_name="Licivando Silva",
            parent_cpf="12345678901",
            parent_phone="11988887777",
            wishlist_preferences={"genres": ["Aventura", "HQ", "Dinossauros"]}
        )
        self.assertEqual(enroll_data.student_name, "Arthur Silva")
        self.assertIn("Dinossauros", enroll_data.wishlist_preferences["genres"])

    def test_derangement_algorithm(self):
        import random
        # Testar que o algoritmo de permutação cíclica garante ciclo fechado e ninguém tira a si mesmo
        participants = ["Aluno_A", "Aluno_B", "Aluno_C", "Aluno_D", "Aluno_E"]
        shuffled = list(participants)
        random.shuffle(shuffled)

        n = len(shuffled)
        pairs = {}
        for i in range(n):
            giver = shuffled[i]
            receiver = shuffled[(i + 1) % n]
            pairs[giver] = receiver

        # Ninguém tira a si mesmo
        for giver, receiver in pairs.items():
            self.assertNotEqual(giver, receiver, f"Erro: {giver} tirou a si mesmo!")

        # Todo mundo dá e todo mundo recebe exatamente 1 presente
        self.assertEqual(len(set(pairs.keys())), n)
        self.assertEqual(len(set(pairs.values())), n)

if __name__ == "__main__":
    unittest.main()
