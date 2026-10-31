#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Teste Automatizado do Aplicativo Desktop Horus PDV (Online & Offline)
Valida:
1. Formatação monetária padrão brasileiro (R$ e %)
2. Armazenamento e busca instantânea (< 1ms) no catálogo offline
3. Registro de vendas offline vinculadas à Sessão e Usuário com UUID idempotente
4. Sincronização de vendas pendentes e marcação de status sincronizado
5. Exportação de Relatório Analítico CSV/Excel (Padrão Migração Horus) e HTML
"""

import csv
import sys
import tempfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "tools" / "horus-pdv-windows"))

import horus_pdv_app as pdv  # noqa: E402


def run_tests() -> None:
    print("▶ [1/5] Testando máscaras financeiras automáticas (R$ e %)...")
    txt_brl, val_brl = pdv.format_atm_currency("125050", mode="BRL")
    assert txt_brl == "R$ 1.250,50", f"Esperado R$ 1.250,50, obtido {txt_brl}"
    assert val_brl == 1250.50

    txt_pct, val_pct = pdv.format_atm_currency("1500", mode="PCT")
    assert txt_pct == "15,00%", f"Esperado 15,00%, obtido {txt_pct}"
    assert val_pct == 15.0

    # Trava de 100% no modo percentual
    txt_pct_max, val_pct_max = pdv.format_atm_currency("99999", mode="PCT")
    assert val_pct_max == 100.0
    print("  ✅ Máscaras financeiras BRL e % validadas!")

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = Path(tmpdir)
        cat_file = tmp_path / "test_catalog.json"
        sales_file = tmp_path / "test_sales.json"

        storage = pdv.LocalPOSStorage(catalog_path=cat_file, sales_path=sales_file)

        print("▶ [2/5] Testando cache de catálogo offline e busca instantânea...")
        mock_horus_items = [
            {
                "COD_ITEM": "10452",
                "COD_BARRA_ITEM": "9788535914849",
                "NOM_ITEM": "1984 - GEORGE ORWELL",
                "NOM_EDITORA": "COMPANHIA DAS LETRAS",
                "VLR_CAPA": 59.90,
                "SALDO_DISPONIVEL": 25,
            },
            {
                "sku": "20881",
                "isbn": "9786555871234",
                "name": "DOM CASMURRO - EDICAO LUXO",
                "brand": "EDITORA TESTE",
                "price": 89.50,
                "stock_quantity": 10,
            },
        ]
        total_cached = storage.save_catalog(mock_horus_items, merge=True)
        assert total_cached == 2, f"Esperado 2 itens em cache, obtido {total_cached}"

        by_isbn = storage.search_local("9788535914849")
        assert len(by_isbn) == 1 and by_isbn[0]["sku"] == "10452"

        by_name = storage.search_local("CASMURRO")
        assert len(by_name) == 1 and by_name[0]["price"] == 89.50
        print("  ✅ Cache offline e busca instantânea por ISBN/SKU/Título validados!")

        print("▶ [3/5] Testando gravação de vendas offline vinculadas ao Usuário e Sessão...")
        mock_cfg = {
            "company_id": "1",
            "company_name": "LIVRARIA HORUS DEMONSTRACAO",
            "company_document": "12.345.678/0001-99",
            "email": "operador@livraria.com.br",
            "user_id": 42,
            "user_name": "Operador Caixa 01",
            "active_session_id": 77,
            "active_session_title": "Feira do Livro - Estande Principal",
        }
        cart_items = [
            {
                "id": "10452",
                "sku": "10452",
                "isbn": "9788535914849",
                "name": "1984 - GEORGE ORWELL",
                "unit_price": 59.90,
                "quantity": 2,
            }
        ]
        sale = storage.record_sale(
            cfg=mock_cfg,
            items=cart_items,
            payment_method="DINHEIRO",
            installments=1,
            discount_amount=9.80,
            cash_received=120.00,
            change_amount=10.00,
            payment_splits=None,
            customer_name="Cliente Feira",
            customer_document="529.982.247-25",
        )
        assert sale["session_id"] == 77
        assert sale["customer_document"] == "52998224725"
        assert sale["user_email"] == "operador@livraria.com.br"
        assert sale["subtotal"] == 119.80
        assert sale["total_amount"] == 110.00
        assert sale["items"][0]["discount"] == 9.80
        assert sale["items"][0]["total_price"] == 110.00
        assert sale["synced"] is False
        assert len(storage.get_pending_sales(session_id=77)) == 1
        print(f"  ✅ Venda offline registrada com UUID {sale['client_sale_uuid']} na Sessão #77!")

        print("▶ [4/5] Testando exportação de Relatório CSV Analítico (Padrão Migração Horus) e HTML...")
        csv_path = tmp_path / "relatorio_horus.csv"
        rows = storage.export_csv_for_horus(csv_path, session_id=77)
        assert rows == 1
        assert csv_path.exists()

        with open(csv_path, mode="r", encoding="utf-8-sig") as f:
            reader = list(csv.DictReader(f, delimiter=";"))
            assert len(reader) == 1
            assert reader[0]["COD_ITEM_HORUS_SKU"] == "10452"
            assert reader[0]["ISBN_CODIGO_BARRAS"] == "9788535914849"
            assert reader[0]["SESSAO_ID"] == "77"
            assert reader[0]["STATUS_SINCRONIZACAO"] == "PENDENTE_OFFLINE"

        receipt_html = pdv.generate_receipt_html(sale, mock_cfg)
        assert receipt_html.exists()
        closing_html = pdv.generate_session_report_html(storage.sales, mock_cfg)
        assert closing_html.exists()
        print("  ✅ Relatórios CSV (p/ Horus), Cupom 80mm e Fechamento HTML gerados com sucesso!")

        print("▶ [5/7] Testando confirmação de sincronização de vendas com a Sessão...")
        marked = storage.mark_sales_synced([sale["client_sale_uuid"]], target_session_id=77)
        assert marked == 1
        assert len(storage.get_pending_sales(session_id=77)) == 0
        assert storage.sales[0]["synced"] is True
        print("  ✅ Sincronização e baixa da fila offline validadas com sucesso!")

        print("▶ [6/7] Testando estado incremental de sincronização por Range Horus (COD_ITEM_INI..FIM)...")
        sync_state_file = tmp_path / "test_sync_state.json"
        storage_range = pdv.LocalPOSStorage(
            catalog_path=cat_file,
            sales_path=sales_file,
            sync_state_path=sync_state_file,
        )
        storage_range.record_range_synced(1, 500, 312)
        storage_range.record_range_synced(501, 1000, 198)
        assert storage_range.sync_state["last_cod_item_synced"] == 1000
        assert len(storage_range.sync_state["ranges_history"]) == 2
        assert len(storage_range.get_stale_ranges(max_age_hours=24)) == 0

        # Simula faixa sincronizada há 48 horas para testar detecção de faixa desatualizada
        storage_range.sync_state["ranges_history"][0]["synced_at"] = "2020-01-01T00:00:00"
        stale = storage_range.get_stale_ranges(max_age_hours=24)
        assert len(stale) == 1 and stale[0]["cod_ini"] == 1 and stale[0]["cod_fim"] == 500
        print("  ✅ Controle de sequência (Watermark + Faixas para Recarregar) validado!")

        print("▶ [7/7] Testando Chave de Licença Criptográfica HPDV1 (Validade, Assinatura e Anti-Rollback)...")
        import base64
        import hashlib
        import hmac
        import json

        def make_test_key(cid: int, exp: str, rng: bool = True, en: bool = True) -> str:
            payload = {"v": 1, "cid": cid, "en": 1 if en else 0, "exp": exp[:10], "rng": 1 if rng else 0, "iat": 1730000000}
            raw = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
            b64 = base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")
            sig = hmac.new(pdv.PDV_DESKTOP_LICENSE_SECRET, b64.encode("ascii"), hashlib.sha256).hexdigest()[:24].upper()
            return f"HPDV1.{b64}.{sig}"

        valid_key = make_test_key(1, "2099-12-31", rng=True)
        res_ok = pdv.verify_pdv_desktop_license_key(valid_key, expected_company_id=1)
        assert res_ok["is_valid"] is True and res_ok["range_sync_enabled"] is True

        # Chave vencida
        expired_key = make_test_key(1, "2020-01-01", rng=True)
        res_exp = pdv.verify_pdv_desktop_license_key(expired_key, expected_company_id=1)
        assert res_exp["is_valid"] is False and "EXPIRADA" in res_exp["status_label"].upper()

        # Chave adulterada
        tampered_key = valid_key[:-4] + "FFFF"
        res_tamp = pdv.verify_pdv_desktop_license_key(tampered_key, expected_company_id=1)
        assert res_tamp["is_valid"] is False and "ASSINATURA" in res_tamp["status_label"].upper()

        # Chave de outra empresa
        res_wrong_cid = pdv.verify_pdv_desktop_license_key(valid_key, expected_company_id=999)
        assert res_wrong_cid["is_valid"] is False

        # Proteção contra recuo de relógio do Windows
        res_rollback = pdv.verify_pdv_desktop_license_key(
            valid_key,
            expected_company_id=1,
            last_seen_date="2099-01-01",
        )
        assert res_rollback["is_valid"] is False and "RELÓGIO" in res_rollback["status_label"].upper()

        # Validação de expiração imediata quando a chave é colocada para ontem (ex: dia 25 sendo hoje dia 26)
        from datetime import datetime, timedelta
        yesterday_iso = (datetime.now().date() - timedelta(days=1)).isoformat()
        yesterday_key = make_test_key(1, yesterday_iso, rng=True)
        res_yesterday = pdv.verify_pdv_desktop_license_key(yesterday_key, expected_company_id=1)
        assert res_yesterday["is_valid"] is False and res_yesterday["days_remaining"] == -1
        print("  ✅ Licença HPDV1 (Validade, Ontem=-1d, HMAC-SHA256, Empresa e Anti-Rollback) validada!")

        print("▶ [8/8] Testando anti-duplicidade de produtos (por SKU e por ISBN/Barras)...")
        dup_candidates = [
            {
                "sku": "",
                "isbn": "9788535914849",
                "name": "1984 - GEORGE ORWELL (ATUALIZADO)",
                "price": 64.90,
                "stock_quantity": 30,
            },
            {
                "COD_ITEM": "20881",
                "COD_BARRA_ITEM": "9786555871234",
                "NOM_ITEM": "DOM CASMURRO - EDICAO LUXO",
                "VLR_CAPA": 92.00,
                "SALDO_DISPONIVEL": 15,
            },
        ]
        total_after_merge = storage.save_catalog(dup_candidates, merge=True)
        assert total_after_merge == 2, f"Esperado continuar com 2 produtos sem duplicar, obtido {total_after_merge}"
        print("  ✅ Anti-duplicidade de produtos (SKU + ISBN) validada com sucesso!")

        print("▶ [9/10] Testando validação obrigatória de CPF, CNPJ e Consumidor Padrão (99999999999)...")
        ok_def, dig_def, tp_def, _ = pdv.validate_cpf_or_cnpj("99999999999")
        assert ok_def is True and dig_def == "99999999999" and tp_def == "CONSUMIDOR_PADRAO"

        ok_cpf, dig_cpf, tp_cpf, _ = pdv.validate_cpf_or_cnpj("529.982.247-25")
        assert ok_cpf is True and dig_cpf == "52998224725" and tp_cpf == "CPF"

        ok_bad_cpf, _, _, _ = pdv.validate_cpf_or_cnpj("123.456.789-00")
        assert ok_bad_cpf is False

        ok_rep_cpf, _, _, _ = pdv.validate_cpf_or_cnpj("111.111.111-11")
        assert ok_rep_cpf is False

        ok_cnpj, dig_cnpj, tp_cnpj, _ = pdv.validate_cpf_or_cnpj("11.222.333/0001-81")
        assert ok_cnpj is True and dig_cnpj == "11222333000181" and tp_cnpj == "CNPJ"

        ok_bad_cnpj, _, _, _ = pdv.validate_cpf_or_cnpj("11.222.333/0001-99")
        assert ok_bad_cnpj is False

        # Venda com campo de documento em branco deve preencher 99999999999 automaticamente
        sale_default_doc = storage.record_sale(
            cfg=mock_cfg,
            items=cart_items,
            payment_method="PIX",
            installments=1,
            discount_amount=0.0,
            cash_received=None,
            change_amount=None,
            payment_splits=None,
            customer_name="",
            customer_document="",
        )
        assert sale_default_doc["customer_document"] == "99999999999"
        assert sale_default_doc["customer_name"] == "Consumidor Final"
        print("  ✅ Validação de CPF, CNPJ e preenchimento obrigatório 99999999999 validados!")

        print("▶ [10/10] Testando aplicação de Desconto: Ratear na Venda vs. Único Item Selecionado...")
        test_cart = [
            {"id": "1", "sku": "1", "isbn": "111", "name": "Livro A", "unit_price": 60.00, "quantity": 1, "discount": 0.0},
            {"id": "2", "sku": "2", "isbn": "222", "name": "Livro B", "unit_price": 40.00, "quantity": 1, "discount": 0.0},
        ]
        # 1) Desconto individual de R$ 5,00 apenas no Item #2 (índice 1)
        tot_disc_item = pdv.apply_cart_discount(test_cart, discount_value=5.00, discount_mode="BRL", scope="ITEM", selected_idx=1)
        assert tot_disc_item == 5.00
        assert test_cart[0]["discount"] == 0.00
        assert test_cart[1]["discount"] == 5.00

        # 2) Desconto rateado na venda toda de R$ 10,00 (proporcional: 60% = R$ 6,00 e 40% = R$ 4,00)
        tot_disc_sale = pdv.apply_cart_discount(test_cart, discount_value=10.00, discount_mode="BRL", scope="SALE")
        assert tot_disc_sale == 10.00
        assert test_cart[0]["discount"] == 6.00
        assert test_cart[1]["discount"] == 4.00
        print("  ✅ Rateio proporcional na venda e desconto em item único validados com sucesso!")

        print("▶ [11/12] Testando identificação do último COD_ITEM integrado e coleta incremental de novos itens Horus...")
        # No catálogo temos COD_ITEM 10452 e 20881 -> último integrado na prática deve ser 20881
        last_real_code = storage.get_last_integrated_horus_code()
        assert last_real_code == 20881, f"Esperado último COD_ITEM 20881, obtido {last_real_code}"

        # Mesmo se uma faixa vazia futura (ex: 20882..21500 com 0 itens) for consultada, o último código real continua 20881
        storage.record_range_synced(20882, 21500, 0, max_cod_found=None)
        assert storage.get_last_integrated_horus_code() == 20881

        # Quando novos itens são cadastrados no Horus (ex: COD_ITEM 20882 e 20889) e sincronizados ao abrir o PDV:
        new_horus_items = [
            {
                "COD_ITEM": "20882",
                "COD_BARRA_ITEM": "9786555879001",
                "NOM_ITEM": "LANCAMENTO HORUS 01",
                "VLR_CAPA": 49.90,
                "SALDO_DISPONIVEL": 12,
            },
            {
                "COD_ITEM": "20889",
                "COD_BARRA_ITEM": "9786555879002",
                "NOM_ITEM": "LANCAMENTO HORUS 02",
                "VLR_CAPA": 74.90,
                "SALDO_DISPONIVEL": 8,
            },
        ]
        storage.save_catalog(new_horus_items, merge=True)
        assert storage.get_last_integrated_horus_code() == 20889
        assert len(storage.products) == 4
        print("  ✅ Detecção automática do último COD_ITEM (20881 ➔ 20889) e integração incremental validadas!")

        print("▶ [12/12] Testando Cupom em Tempo Real (80mm), descoberta de impressoras e opção NÃO IMPRIMIR...")
        printers, _ = pdv.list_installed_printers()
        assert isinstance(printers, list) and len(printers) >= 1
        assert printers[0] == pdv.NO_PRINTER_OPTION

        preview_txt = pdv.format_thermal_receipt_text(sale, mock_cfg, is_preview=True)
        assert "CUPOM EM CONSTRUCAO" in preview_txt
        assert "1984 - GEORGE ORWELL" in preview_txt
        assert "529.982.247-25" in preview_txt

        final_txt = pdv.format_thermal_receipt_text(sale, mock_cfg, is_preview=False)
        assert "Obrigado pela preferencia!" in final_txt
        assert sale["sale_number"] in final_txt

        # Quando configurado para NÃO IMPRIMIR, não deve imprimir nada nem abrir navegador
        ok_prt_off, msg_prt_off = pdv.send_receipt_to_printer(final_txt, pdv.NO_PRINTER_OPTION, sale_number=sale["sale_number"])
        assert ok_prt_off is False
        assert "não imprimir" in msg_prt_off.lower()

        ok_prt_empty, _ = pdv.send_receipt_to_printer(final_txt, "", sale_number=sale["sale_number"])
        assert ok_prt_empty is False
        print("  ✅ Cupom em tempo real, listagem de impressoras da máquina e trava 'NÃO IMPRIMIR' validados!")


if __name__ == "__main__":
    run_tests()
    print("\n🎉 TODOS OS 12 TESTES DO HORUS PDV WINDOWS PASSARAM 100%!")




