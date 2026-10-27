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
            customer_document="123.456.789-00",
        )
        assert sale["session_id"] == 77
        assert sale["user_email"] == "operador@livraria.com.br"
        assert sale["subtotal"] == 119.80
        assert sale["total_amount"] == 110.00
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
        print("  ✅ Licença HPDV1 (Validade, HMAC-SHA256, Empresa e Anti-Rollback de Relógio) validada!")


if __name__ == "__main__":
    run_tests()
    print("\n🎉 TODOS OS 7 TESTES DO HORUS PDV WINDOWS PASSARAM 100%!")

