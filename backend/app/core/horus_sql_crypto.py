"""
horus_sql_crypto.py
-------------------
Utilitario de criptografia/descriptografia para as credenciais do Horus SQL Direct.

SEGURANCA:
  - Usa Fernet (AES-128-CBC + HMAC-SHA256) da lib `cryptography` (ja no requirements.txt).
  - A HORUS_SQL_ENCRYPTION_KEY fica EXCLUSIVAMENTE no .env do servidor.
  - Nunca eh salva no banco de dados.
  - Apenas o texto cifrado (horus_sql_password) eh persistido.
  - Descriptografia ocorre apenas em runtime, dentro do HorusSQLClient.

GERACAO DA CHAVE (executar uma vez no servidor):
  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  => Colar o resultado em .env: HORUS_SQL_ENCRYPTION_KEY=<resultado>
"""
from cryptography.fernet import Fernet, InvalidToken
import os
import logging

logger = logging.getLogger(__name__)

_FERNET_INSTANCE = None


def _get_fernet() -> Fernet:
    global _FERNET_INSTANCE
    if _FERNET_INSTANCE is None:
        key = os.environ.get("HORUS_SQL_ENCRYPTION_KEY", "").strip()
        if not key:
            raise RuntimeError(
                "HORUS_SQL_ENCRYPTION_KEY nao configurada no .env do servidor. "
                "Gere com: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        try:
            _FERNET_INSTANCE = Fernet(key.encode())
        except Exception as e:
            raise RuntimeError(f"HORUS_SQL_ENCRYPTION_KEY invalida: {e}")
    return _FERNET_INSTANCE


def encrypt_sql_credential(plain_text: str) -> str:
    if not plain_text or not plain_text.strip():
        return ""
    try:
        f = _get_fernet()
        return f.encrypt(plain_text.encode("utf-8")).decode("utf-8")
    except Exception as e:
        logger.error(f"[HorusSQLCrypto] Falha ao criptografar credencial: {e}")
        raise


def decrypt_sql_credential(cipher_text: str) -> str:
    if not cipher_text or not cipher_text.strip():
        return ""
    try:
        f = _get_fernet()
        return f.decrypt(cipher_text.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        logger.error("[HorusSQLCrypto] Token invalido -- chave incorreta ou dado corrompido.")
        return ""
    except Exception as e:
        logger.error(f"[HorusSQLCrypto] Falha ao descriptografar credencial: {e}")
        return ""


def is_already_encrypted(value: str) -> bool:
    """Heuristica: tokens Fernet sempre comecam com 'gAAAAA'. Evita dupla criptografia."""
    return bool(value and value.startswith("gAAAAA"))
