import sys
import os
from unittest.mock import MagicMock

# Add backend directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

def test_editorial_unit():
    print("1. Testando carregamento de modelos e schemas editoriais...")
    from app.models.editorial import (
        EditorialPipeline,
        EditorialStage,
        EditorialProject,
        EditorialTask,
        EditorialFile,
        EditorialHistory,
        EditorialProfessional,
        EditorialProjectCost,
        EditorialPipelineTemplate
    )
    print("✅ Modelos ORM Editorial carregados com sucesso!")

    from app.schemas.editorial import (
        ProfessionalCreate,
        ProjectCostCreate,
        ProjectCreate,
        ProjectCardResponse,
        ProjectDetailResponse
    )
    print("✅ Schemas Pydantic Editorial carregados com sucesso!")

    print("2. Testando motor de custos editoriais e benchmarks...")
    from app.services.editorial_costing import simular_orcamento_completo, BENCHMARKS
    assert "revisao_lauda_media" in BENCHMARKS
    assert "diagramacao_pagina_padrao" in BENCHMARKS
    assert "capa_comercial" in BENCHMARKS
    assert "ficha_catalografica_isbn" in BENCHMARKS

    # Simular orçamento para livro de 240 páginas e 1000 exemplares
    orcamento = simular_orcamento_completo(paginas=240, tiragem=1000)
    resumo = orcamento["resumo_financeiro"]
    assert resumo["custo_total_projeto"] > 0
    assert resumo["custo_unitario_exemplar"] > 0
    assert resumo["ponto_equilibrio_exemplares"] > 0
    assert len(orcamento["servicos_sugeridos"]) >= 5
    print(f"✅ Motor de simulação validado: Total R$ {resumo['custo_total_projeto']:.2f}, Custo/Un R$ {resumo['custo_unitario_exemplar']:.2f}, Break-even: {resumo['ponto_equilibrio_exemplares']} exemplares")

    print("3. Testando gerador de Manual Operacional em PDF...")
    from app.services.editorial_manual import gerar_manual_editorial_pdf
    pdf_bytes = gerar_manual_editorial_pdf(company_name="Editora Teste B2B")
    assert isinstance(pdf_bytes, (bytes, bytearray))
    assert len(pdf_bytes) > 2000
    assert bytes(pdf_bytes).startswith(b"%PDF")
    print(f"✅ Gerador de PDF validado: gerou {len(pdf_bytes)} bytes de PDF válido!")

    print("4. Testando exportadores de relatórios em Excel (.xlsx) e PDF (.pdf)...")
    from app.services.editorial_exports import (
        export_services_excel,
        export_services_pdf,
        export_movements_excel,
        export_movements_pdf
    )
    dummy_costs = [{
        "id": 1, "project_title": "Obra Teste", "service_type": "DIAGRAMACAO",
        "description": "Diagramação completa 150 págs", "professional_name": "João Designer",
        "professional_pix": "joao@pix.com", "stage_name": "Diagramação",
        "unit_type": "PAGINA", "quantity": 150, "unit_value": 6.0,
        "estimated_total": 900.0, "actual_total": 900.0, "payment_status": "PAGO",
        "created_at_str": "25/09/2026", "paid_at_str": "26/09/2026", "invoice_number": "NF-123"
    }]
    excel_serv = export_services_excel(dummy_costs, "Editora Modelo", "Obra Teste")
    assert len(excel_serv.getvalue()) > 1000
    pdf_serv = export_services_pdf(dummy_costs, "Editora Modelo", "Obra Teste")
    assert bytes(pdf_serv).startswith(b"%PDF")
    print(f"✅ Exportação de Serviços validada: Excel {len(excel_serv.getvalue())}b, PDF {len(pdf_serv)}b")

    dummy_mov = [{
        "project_id": 1, "project_local_id": 101, "project_title": "Obra Teste",
        "from_stage_name": "Preparação", "to_stage_name": "1ª Revisão",
        "action": "MUDANCA_ETAPA", "user_name": "Editor Chefe", "notes": "Texto revisado e aprovado",
        "created_at_str": "25/09/2026 15:45"
    }]
    excel_mov = export_movements_excel(dummy_mov, "Editora Modelo")
    assert len(excel_mov.getvalue()) > 1000
    pdf_mov = export_movements_pdf(dummy_mov, "Editora Modelo")
    assert bytes(pdf_mov).startswith(b"%PDF")
    print(f"✅ Exportação de Movimentações validada: Excel {len(excel_mov.getvalue())}b, PDF {len(pdf_mov)}b")

    print("5. Testando rotas do router FastAPI...")
    from app.api.editorial import router
    rotas = [route.path for route in router.routes]
    assert any("professionals" in r for r in rotas)
    assert any("costs" in r for r in rotas)
    assert any("templates" in r for r in rotas)
    assert any("manual/download-pdf" in r for r in rotas)
    assert any("reports/executive" in r for r in rotas)
    assert any("exports/services" in r for r in rotas)
    assert any("exports/movements" in r for r in rotas)
    print(f"✅ Router Editorial verificado com {len(router.routes)} rotas ativas (incluindo rotas de exportação Excel/PDF)!")

    print("\n🎉 TODOS OS TESTES UNITÁRIOS E DE SERVIÇO DO MÓDULO EDITORIAL PASSARAM COM 100% DE SUCESSO!")

if __name__ == "__main__":
    test_editorial_unit()


