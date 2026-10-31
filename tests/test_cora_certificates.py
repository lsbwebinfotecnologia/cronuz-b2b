"""
Testes unitários (offline) da importação de certificados do Banco Cora.
Gera certificados autoassinados em memória — não acessa banco nem a API do Cora.

Uso: cd backend && ./venv/bin/python ../tests/test_cora_certificates.py
"""
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from cryptography import x509  # noqa: E402
from cryptography.hazmat.primitives import hashes, serialization  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import rsa  # noqa: E402
from cryptography.hazmat.primitives.serialization import pkcs12  # noqa: E402
from cryptography.x509.oid import NameOID  # noqa: E402

from app.integrators.cora.certificates import CoraCertificateError, load_pem_pair, load_pfx  # noqa: E402


def make_cert(days_valid=365, expired=False):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "int-teste-cronuz")])
    now = datetime.now(timezone.utc)
    start = now - timedelta(days=400) if expired else now - timedelta(days=1)
    end = now - timedelta(days=1) if expired else now + timedelta(days=days_valid)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
            .serial_number(x509.random_serial_number()).not_valid_before(start).not_valid_after(end)
            .sign(key, hashes.SHA256()))
    return cert, key


def pem(cert, key, password=None):
    enc = serialization.BestAvailableEncryption(password.encode()) if password else serialization.NoEncryption()
    return (cert.public_bytes(serialization.Encoding.PEM),
            key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL, enc))


def expect_error(fn, contains):
    try:
        fn()
    except CoraCertificateError as e:
        assert contains.lower() in str(e).lower(), f"mensagem inesperada: {e}"
        return
    raise AssertionError(f"esperava erro contendo '{contains}'")


def main():
    cert, key = make_cert()
    c, k = pem(cert, key)
    n = load_pem_pair(c, k)
    assert n.subject == "int-teste-cronuz" and "BEGIN PRIVATE KEY" in n.key_pem and n.valid_until > datetime.now(timezone.utc)
    print("✔ PEM válido (certificado + chave) normalizado para PKCS#8 sem senha")

    c2, k2 = pem(cert, key, password="s3nha")
    expect_error(lambda: load_pem_pair(c2, k2), "senha")
    assert load_pem_pair(c2, k2, key_password="s3nha").subject == "int-teste-cronuz"
    print("✔ PEM com chave protegida: exige senha e aceita a senha correta")

    _, other_key = make_cert()
    expect_error(lambda: load_pem_pair(c, pem(cert, other_key)[1]), "não corresponde")
    print("✔ Chave privada de outro certificado é rejeitada")

    exp_cert, exp_key = make_cert(expired=True)
    expect_error(lambda: load_pem_pair(*pem(exp_cert, exp_key)), "expirado")
    print("✔ Certificado expirado é rejeitado")

    pfx = pkcs12.serialize_key_and_certificates(b"cora", key, cert, None, serialization.BestAvailableEncryption(b"pfx123"))
    assert load_pfx(pfx, "pfx123").subject == "int-teste-cronuz"
    expect_error(lambda: load_pfx(pfx, "errada"), "senha incorreta")
    print("✔ PFX: converte com a senha correta e rejeita senha errada")

    expect_error(lambda: load_pem_pair(b"lixo", k), "certificado inválido")
    print("✔ Arquivo de certificado inválido é rejeitado")
    print("\nTodos os testes de certificado passaram.")


if __name__ == "__main__":
    main()
