"""
certificates.py
---------------
Validação e normalização dos certificados da Integração Direta do Banco Cora.

Formatos aceitos na importação:
  - PEM : certificado (.pem/.crt) + chave privada (.key/.pem) em arquivos separados — formato entregue pelo Cora.
  - PFX : arquivo único PKCS#12 (.pfx/.p12) protegido por senha — convertido para PEM no servidor.

Saída sempre normalizada: certificado PEM + chave privada PKCS#8 PEM **sem senha** (exigência do mTLS
do `requests`). A chave é criptografada (Fernet) antes de ir ao banco — ver api/cora.py.

Validações:
  - arquivos parseáveis; chave privada corresponde ao certificado (mesma chave pública);
  - certificado dentro da validade.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from cryptography import x509
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID


class CoraCertificateError(ValueError):
    """Certificado/chave inválidos para a Integração Direta."""


@dataclass
class NormalizedCertificate:
    cert_pem: str
    key_pem: str
    subject: str
    valid_from: datetime
    valid_until: datetime


def _password_bytes(password: Optional[str]) -> Optional[bytes]:
    return password.encode("utf-8") if password else None


def _cert_validity(cert: x509.Certificate):
    try:
        return cert.not_valid_before_utc, cert.not_valid_after_utc
    except AttributeError:  # cryptography < 42
        return cert.not_valid_before.replace(tzinfo=timezone.utc), cert.not_valid_after.replace(tzinfo=timezone.utc)


def _subject(cert: x509.Certificate) -> str:
    try:
        cn = cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)
        if cn:
            return str(cn[0].value)[:255]
    except Exception:
        pass
    return cert.subject.rfc4514_string()[:255]


def _public_bytes(public_key) -> bytes:
    return public_key.public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)


def _normalize(cert: x509.Certificate, key) -> NormalizedCertificate:
    if key is None:
        raise CoraCertificateError("Chave privada não encontrada.")
    if _public_bytes(key.public_key()) != _public_bytes(cert.public_key()):
        raise CoraCertificateError("A chave privada não corresponde ao certificado enviado.")

    valid_from, valid_until = _cert_validity(cert)
    now = datetime.now(timezone.utc)
    if valid_until < now:
        raise CoraCertificateError(f"Certificado expirado em {valid_until.strftime('%d/%m/%Y')}.")

    cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode("ascii")
    key_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode("ascii")
    return NormalizedCertificate(cert_pem, key_pem, _subject(cert), valid_from, valid_until)


def load_pem_pair(cert_bytes: bytes, key_bytes: bytes, key_password: Optional[str] = None) -> NormalizedCertificate:
    try:
        cert = x509.load_pem_x509_certificate(cert_bytes)
    except Exception:
        try:
            cert = x509.load_der_x509_certificate(cert_bytes)
        except Exception:
            raise CoraCertificateError("Arquivo de certificado inválido (esperado PEM/CRT).")
    try:
        key = serialization.load_pem_private_key(key_bytes, password=_password_bytes(key_password))
    except TypeError:
        raise CoraCertificateError("A chave privada está protegida por senha: informe a senha.")
    except ValueError:
        raise CoraCertificateError("Chave privada inválida ou senha incorreta.")
    return _normalize(cert, key)


def load_pfx(pfx_bytes: bytes, password: Optional[str]) -> NormalizedCertificate:
    try:
        key, cert, _chain = pkcs12.load_key_and_certificates(pfx_bytes, _password_bytes(password))
    except ValueError:
        raise CoraCertificateError("Não foi possível abrir o arquivo PFX: senha incorreta ou arquivo inválido.")
    if cert is None:
        raise CoraCertificateError("O arquivo PFX não contém certificado.")
    return _normalize(cert, key)


def describe_pem_certificate(cert_pem: str) -> dict:
    """Metadados para exibição de um certificado já salvo."""
    cert = x509.load_pem_x509_certificate(cert_pem.encode("ascii"))
    valid_from, valid_until = _cert_validity(cert)
    return {"subject": _subject(cert), "valid_from": valid_from, "valid_until": valid_until}
