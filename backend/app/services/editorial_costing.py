"""
Serviço de Cálculo e Simulação de Custos Editoriais
Baseado em benchmarks de mercado (CBL, SNEL, mercado gráfico e editorial independente).
"""
from typing import Dict, Any, List

BENCHMARKS = {
    "revisao_lauda_media": 10.50,
    "revisao_lauda_tecnica": 14.00,
    "revisao_prova_pagina": 3.00,
    "diagramacao_pagina_padrao": 5.50,
    "diagramacao_pagina_complexa": 8.00,
    "capa_comercial": 1200.00,
    "capa_ilustrada": 2200.00,
    "capa_simples": 600.00,
    "leitura_critica_lauda": 5.00,
    "ficha_catalografica_isbn": 120.00,
}

def calcular_custo_impressao_grafica(
    paginas: int,
    tiragem: int,
    formato: str = "14x21"
) -> Dict[str, float]:
    if tiragem <= 0 or paginas <= 0:
        return {"custo_total": 0.0, "custo_unitario": 0.0}

    setup_grafica = 450.00 if tiragem >= 500 else 180.00
    custo_folha_pagina = 0.024 if formato == "14x21" else 0.030

    custo_miolo_exemplar = paginas * custo_folha_pagina
    custo_capa_exemplar = 2.20 if tiragem >= 500 else 3.50
    custo_acabamento = 1.60

    custo_variavel_unitario = custo_miolo_exemplar + custo_capa_exemplar + custo_acabamento
    custo_fixo_por_livro = setup_grafica / tiragem

    custo_unitario = round(custo_variavel_unitario + custo_fixo_por_livro, 2)
    custo_total = round(custo_unitario * tiragem, 2)

    return {
        "custo_total": custo_total,
        "custo_unitario": custo_unitario,
        "setup_grafica": setup_grafica,
        "custo_miolo_exemplar": round(custo_miolo_exemplar, 2),
        "custo_capa_exemplar": round(custo_capa_exemplar, 2)
    }

def simular_orcamento_completo(
    paginas: int,
    tiragem: int,
    formato_livro: str = "14x21",
    margem_desejada: float = 60.0
) -> Dict[str, Any]:
    laudas_estimadas = max(1, int(paginas * 1.15))
    
    custo_revisao_1 = round(laudas_estimadas * BENCHMARKS["revisao_lauda_media"], 2)
    custo_diagramacao = round(paginas * BENCHMARKS["diagramacao_pagina_padrao"], 2)
    custo_capa = BENCHMARKS["capa_comercial"]
    custo_revisao_2 = round(paginas * BENCHMARKS["revisao_prova_pagina"], 2)
    custo_ficha_isbn = BENCHMARKS["ficha_catalografica_isbn"]

    custo_pre_impressao = round(custo_revisao_1 + custo_diagramacao + custo_capa + custo_revisao_2 + custo_ficha_isbn, 2)

    grafica = calcular_custo_impressao_grafica(paginas, tiragem, formato_livro)
    custo_grafica = grafica["custo_total"]

    custo_total_projeto = round(custo_pre_impressao + custo_grafica, 2)
    custo_unitario = round(custo_total_projeto / max(1, tiragem), 2)

    fator_multiplicador = 1.0 / max(0.15, (1.0 - (min(margem_desejada, 85.0) / 100.0)))
    preco_capa_sugerido = round(custo_unitario * max(3.5, fator_multiplicador), 2)
    
    reais = int(preco_capa_sugerido)
    preco_capa_comercial = float(reais) + 0.90 if (preco_capa_sugerido - reais) > 0.40 else float(reais)

    receita_liquida_por_livro = max(1.0, preco_capa_comercial * 0.50)
    ponto_equilibrio_exemplares = int(custo_total_projeto / receita_liquida_por_livro) + 1

    return {
        "paginas": paginas,
        "tiragem": tiragem,
        "laudas_estimadas": laudas_estimadas,
        "servicos_sugeridos": [
            {
                "service_type": "REVISAO_1",
                "description": f"1ª Revisão Textual ({laudas_estimadas} laudas)",
                "unit_type": "LAUDA",
                "quantity": laudas_estimadas,
                "unit_value": BENCHMARKS["revisao_lauda_media"],
                "estimated_total": custo_revisao_1
            },
            {
                "service_type": "DIAGRAMACAO",
                "description": f"Diagramação de Miolo ({paginas} págs)",
                "unit_type": "PAGINA",
                "quantity": paginas,
                "unit_value": BENCHMARKS["diagramacao_pagina_padrao"],
                "estimated_total": custo_diagramacao
            },
            {
                "service_type": "CAPA",
                "description": "Projeto Gráfico e Capa Completa",
                "unit_type": "FECHADO",
                "quantity": 1,
                "unit_value": custo_capa,
                "estimated_total": custo_capa
            },
            {
                "service_type": "REVISAO_2",
                "description": f"2ª Revisão (Cotejo de Prova - {paginas} págs)",
                "unit_type": "PAGINA",
                "quantity": paginas,
                "unit_value": BENCHMARKS["revisao_prova_pagina"],
                "estimated_total": custo_revisao_2
            },
            {
                "service_type": "FICHA_ISBN",
                "description": "Ficha Catalográfica e Registro ISBN",
                "unit_type": "FECHADO",
                "quantity": 1,
                "unit_value": custo_ficha_isbn,
                "estimated_total": custo_ficha_isbn
            },
            {
                "service_type": "IMPRESSAO_GRAFICA",
                "description": f"Impressão Gráfica ({tiragem} exemplares)",
                "unit_type": "EXEMPLAR",
                "quantity": tiragem,
                "unit_value": grafica["custo_unitario"],
                "estimated_total": custo_grafica
            }
        ],
        "resumo_financeiro": {
            "custo_pre_impressao": custo_pre_impressao,
            "custo_grafica": custo_grafica,
            "custo_total_projeto": custo_total_projeto,
            "custo_unitario_exemplar": custo_unitario,
            "preco_capa_sugerido": preco_capa_comercial,
            "margem_estimada_percentual": margem_desejada,
            "ponto_equilibrio_exemplares": min(ponto_equilibrio_exemplares, tiragem),
            "percentual_break_even_tiragem": round((min(ponto_equilibrio_exemplares, tiragem) / max(1, tiragem)) * 100, 1)
        }
    }
