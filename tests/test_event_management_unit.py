import hashlib
import io
import sys
import tempfile
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "backend"))

from fpdf import FPDF
from pypdf import PdfReader, PdfWriter
from app.integrators.whatsapp_events_client import (
    extract_contacts_from_free_text,
    generate_native_qr_vip_card,
    normalize_br_phone,
    parse_vcard_block,
    render_invite_message,
)


def test_phone_validator():
    # 11 dígitos padrão SP
    r1 = normalize_br_phone("(11) 99888-7766")
    assert r1["phone_canonical"] == "5511998887766"
    assert r1["phone_base_8"] == "1198887766"
    assert r1["phone_ddd"] == "11"

    # 8 dígitos móvel MG sem o 9 -> deve convergir para o mesmo canônico com 9!
    r2 = normalize_br_phone("31 8888-7766")
    r3 = normalize_br_phone("+55 (31) 98888-7766")
    assert r2["phone_canonical"] == r3["phone_canonical"] == "5531988887766"
    assert r2["phone_base_8"] == r3["phone_base_8"] == "3188887766"

    # Sem DDD -> deve bloquear
    try:
        normalize_br_phone("99888-7766")
        assert False, "Deveria rejeitar telefone sem DDD"
    except ValueError:
        pass

    # DDD inválido (20 não existe na Anatel) -> deve bloquear
    try:
        normalize_br_phone("(20) 99888-7766")
        assert False, "Deveria rejeitar DDD 20 inexistente"
    except ValueError:
        pass


def test_whatsapp_vcard_and_smart_paste():
    vcard_sample = """BEGIN:VCARD
VERSION:3.0
N:Costa;Mariana;;;
FN:Mariana Costa VIP
ORG:Agência Brilho
TEL;type=CELL;type=VOICE;waid=5521987654321:+55 21 98765-4321
END:VCARD"""
    cards = parse_vcard_block(vcard_sample)
    assert len(cards) == 1
    assert cards[0]["valid"] is True
    assert cards[0]["full_name"] == "Mariana Costa VIP"
    assert cards[0]["phone_canonical"] == "5521987654321"

    pasted = """
    1. João Pedro (11) 97777-6655 @joaopedro
    2. Contato Sem DDD 98888-1122
    3. 41999112233 - Fernanda Lima fernanda@email.com
    """
    rows = extract_contacts_from_free_text(pasted)
    assert len(rows) == 3
    assert rows[0]["valid"] is True and rows[0]["instagram"] == "@joaopedro"
    assert rows[1]["valid"] is False
    assert rows[2]["valid"] is True and rows[2]["email"] == "fernanda@email.com"


def test_pdf_splitting_and_qr_card():
    pdf = FPDF()
    for i in range(1, 4):
        pdf.add_page()
        pdf.set_font("Helvetica", size=14)
        pdf.cell(0, 10, f"INGRESSO VIP CODIGO: SYM-000{i}00")
    raw_multi = bytes(pdf.output())

    reader = PdfReader(io.BytesIO(raw_multi))
    assert len(reader.pages) == 3
    hashes = set()
    for p in reader.pages:
        w = PdfWriter()
        w.add_page(p)
        b = io.BytesIO()
        w.write(b)
        hashes.add(hashlib.sha256(b.getvalue()).hexdigest())
    assert len(hashes) == 3

    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "vip_card.png"
        generate_native_qr_vip_card(
            output_abs_path=out,
            event_title="Show Teste Cronuz",
            event_date_str="28/11/2026 às 22:00",
            venue_label="Espaço Hall SP",
            guest_name="Mariana Costa",
            sector_label="CAMAROTE",
            qr_payload="EVMQR:token_teste_123",
        )
        assert out.exists() and out.stat().st_size > 5000

    msg = render_invite_message(
        "Convite para *{{evento}}* no setor {{setor}}!",
        ["Olá {{apelido}}!"],
        {"apelido": "Mari", "evento": "Festival", "setor": "VIP"},
    )
    assert "Mari" in msg and "Festival" in msg


if __name__ == "__main__":
    test_phone_validator()
    test_whatsapp_vcard_and_smart_paste()
    test_pdf_splitting_and_qr_card()
    print("ALL_EVENT_MANAGEMENT_UNIT_TESTS_PASSED")
