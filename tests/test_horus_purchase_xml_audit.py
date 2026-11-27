"""
Validação automatizada do motor de Auditoria Preventiva de XML de NF-e vs Pedido de Compra
(Preço de Capa, Desconto %, Quantidade, Itens Extras e Faltantes).
"""
import sys
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.api.horus_purchases import (  # noqa: E402
    _compare_xml_with_purchase_order,
    _evaluate_horus_safety_row,
    _parse_supplier_nfe_xml,
)


def _mock_order():
    items = [
        SimpleNamespace(
            id=101,
            cod_item=5001,
            isbn="9788535914849",
            nome_item="LIVRO A - COMPRA CERTA",
            nome_editora="COMPANHIA DAS LETRAS",
            quantity=10,
            unit_cover_price=Decimal("80.00"),
            discount_pct=Decimal("50.00"),
            unit_net_price=Decimal("40.0000"),
            subtotal_net=Decimal("400.00"),
        ),
        SimpleNamespace(
            id=102,
            cod_item=5002,
            isbn="9786559210886",
            nome_item="LIVRO B - SEGUNDO ITEM",
            nome_editora="ZAHAR",
            quantity=5,
            unit_cover_price=Decimal("60.00"),
            discount_pct=Decimal("45.00"),
            unit_net_price=Decimal("33.0000"),
            subtotal_net=Decimal("165.00"),
        ),
    ]
    return SimpleNamespace(
        id=1,
        horus_cod_pedido=9876,
        branch_cnpj="12345678000199",
        cnpj_fornecedor="61533942000120",
        nome_fornecedor="DISTRIBUIDORA EXEMPLO LTDA",
        items=items,
    )


def test_xml_100_percent_match():
    xml_ok = b"""<?xml version="1.0" encoding="UTF-8"?>
    <nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
      <NFe>
        <infNFe Id="NFe35261161533942000120550010000123451000123456" versao="4.00">
          <ide><nNF>12345</nNF><serie>1</serie><dhEmi>2026-11-23T15:00:00-03:00</dhEmi><natOp>VENDA</natOp></ide>
          <emit><CNPJ>61533942000120</CNPJ><xNome>DISTRIBUIDORA EXEMPLO LTDA</xNome></emit>
          <dest><CNPJ>12345678000199</CNPJ><xNome>PAISAGEM POMPEIA</xNome></dest>
          <det nItem="1">
            <prod>
              <cProd>5001</cProd><cEAN>9788535914849</cEAN><xProd>LIVRO A</xProd><CFOP>5102</CFOP>
              <qCom>10.0000</qCom><vUnCom>80.0000</vUnCom><vProd>800.00</vProd><vDesc>400.00</vDesc>
            </prod>
          </det>
          <det nItem="2">
            <prod>
              <cProd>5002</cProd><cEAN>9786559210886</cEAN><xProd>LIVRO B</xProd><CFOP>5102</CFOP>
              <qCom>5.0000</qCom><vUnCom>60.0000</vUnCom><vProd>300.00</vProd><vDesc>135.00</vDesc>
            </prod>
          </det>
          <total><ICMSTot><vProd>1100.00</vProd><vDesc>535.00</vDesc><vNF>565.00</vNF></ICMSTot></total>
          <compra><xPed>9876</xPed></compra>
        </infNFe>
      </NFe>
    </nfeProc>"""

    parsed = _parse_supplier_nfe_xml(xml_ok)
    comp = _compare_xml_with_purchase_order(_mock_order(), parsed)
    assert comp["diagnostic_status"] == "MATCH_100", comp
    assert comp["divergent_items_count"] == 0
    assert comp["matched_ok_count"] == 2
    assert comp["xml_total_qty"] == 15
    assert comp["xml_total_products_net"] == Decimal("565.00")


def test_xml_divergences_cover_discount_qty_extra_missing():
    # Item 1 (9788535914849): Qtd 8 (em vez de 10), Capa R$ 90,00 (em vez de 80,00), Desc 40% (em vez de 50%)
    # Item 2 (9786559210886): Faltante no XML!
    # Item Extra (9788532530783): Veio no XML sem estar no pedido!
    xml_div = b"""<?xml version="1.0" encoding="UTF-8"?>
    <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
      <infNFe Id="NFe35261161533942000120550010000543211000543210" versao="4.00">
        <ide><nNF>54321</nNF><serie>1</serie><dhEmi>2026-11-23T16:00:00-03:00</dhEmi></ide>
        <emit><CNPJ>61533942000120</CNPJ><xNome>DISTRIBUIDORA EXEMPLO LTDA</xNome></emit>
        <dest><CNPJ>12345678000199</CNPJ><xNome>PAISAGEM POMPEIA</xNome></dest>
        <det nItem="1">
          <prod>
            <cProd>5001</cProd><cEAN>9788535914849</cEAN><xProd>LIVRO A REAJUSTADO</xProd><CFOP>5102</CFOP>
            <qCom>8.0000</qCom><vUnCom>90.0000</vUnCom><vProd>720.00</vProd><vDesc>288.00</vDesc>
          </prod>
        </det>
        <det nItem="2">
          <prod>
            <cProd>9999</cProd><cEAN>9788532530783</cEAN><xProd>LIVRO NAO PEDIDO</xProd><CFOP>5102</CFOP>
            <qCom>3.0000</qCom><vUnCom>50.0000</vUnCom><vProd>150.00</vProd><vDesc>75.00</vDesc>
          </prod>
        </det>
        <total><ICMSTot><vProd>870.00</vProd><vDesc>363.00</vDesc><vNF>507.00</vNF></ICMSTot></total>
      </infNFe>
    </NFe>"""

    parsed = _parse_supplier_nfe_xml(xml_div)
    comp = _compare_xml_with_purchase_order(_mock_order(), parsed)
    assert comp["diagnostic_status"] == "HAS_DIVERGENCE"
    assert comp["diff_cover_count"] == 1
    assert comp["diff_discount_count"] == 1
    assert comp["extra_in_xml_count"] == 1
    assert comp["missing_in_xml_count"] == 1
    assert comp["divergent_items_count"] == 3


def test_horus_order_safety_locks():
    # 1. Pedido AP sem conferência e sem NF -> liberado para editar, trocar fornecedor, mudar status e cancelar
    clean_ap = _evaluate_horus_safety_row(
        {
            "live_status": "AP",
            "gerar_pend": "S",
            "dat_encerramento": None,
            "hdr_atendidos": 0,
            "itens_atendidos_sum": 0,
            "divergencias_cnt": 0,
            "nf_entrada_cnt": 0,
            "vinc_nf_cnt": 0,
        },
        "AP",
    )
    assert clean_ap["can_modify"] is True
    assert clean_ap["can_cancel"] is True
    assert clean_ap["can_append_items"] is True
    assert clean_ap["block_reason"] is None

    # 2. Pedido AE com itens conferidos -> bloqueado!
    conferred_ae = _evaluate_horus_safety_row(
        {
            "live_status": "AE",
            "gerar_pend": "S",
            "dat_encerramento": None,
            "hdr_atendidos": 12,
            "itens_atendidos_sum": 12,
            "divergencias_cnt": 0,
            "nf_entrada_cnt": 0,
            "vinc_nf_cnt": 0,
        },
        "AE",
    )
    assert conferred_ae["has_conferred_items"] is True
    assert conferred_ae["can_modify"] is False
    assert conferred_ae["can_cancel"] is False
    assert conferred_ae["can_append_items"] is False
    assert "conferido" in (conferred_ae["block_reason"] or "").lower()

    # 3. Pedido AP com NF vinculada -> bloqueado!
    linked_nf_ap = _evaluate_horus_safety_row(
        {
            "live_status": "AP",
            "gerar_pend": "S",
            "dat_encerramento": None,
            "hdr_atendidos": 0,
            "itens_atendidos_sum": 0,
            "divergencias_cnt": 0,
            "nf_entrada_cnt": 1,
            "vinc_nf_cnt": 0,
        },
        "AP",
    )
    assert linked_nf_ap["linked_nf_count"] == 1
    assert linked_nf_ap["can_modify"] is False
    assert linked_nf_ap["can_cancel"] is False
    assert "nota" in (linked_nf_ap["block_reason"] or "").lower()

    # 4. Pedido EE finalizado -> bloqueado!
    finalized_ee = _evaluate_horus_safety_row(
        {
            "live_status": "EE",
            "gerar_pend": "S",
            "dat_encerramento": "2026-11-24",
            "hdr_atendidos": 50,
            "itens_atendidos_sum": 50,
            "divergencias_cnt": 0,
            "nf_entrada_cnt": 1,
            "vinc_nf_cnt": 1,
        },
        "EE",
    )
    assert finalized_ee["is_finalized"] is True
    assert finalized_ee["can_modify"] is False
    assert finalized_ee["can_cancel"] is False

    # 5. Pedido CA cancelado sem movimentação -> permite reativar!
    cancelled_ca = _evaluate_horus_safety_row(
        {
            "live_status": "CA",
            "gerar_pend": "S",
            "dat_encerramento": None,
            "hdr_atendidos": 0,
            "itens_atendidos_sum": 0,
            "divergencias_cnt": 0,
            "nf_entrada_cnt": 0,
            "vinc_nf_cnt": 0,
        },
        "CA",
    )
    assert cancelled_ca["can_reopen"] is True
    assert cancelled_ca["can_modify"] is False


if __name__ == "__main__":
    test_xml_100_percent_match()
    test_xml_divergences_cover_discount_qty_extra_missing()
    test_horus_order_safety_locks()
    print("ALL XML AUDIT & SAFETY LOCK TESTS PASSED!")
