import base64
import logging
import os
from cryptography.fernet import Fernet, InvalidToken

_log = logging.getLogger("kado.crypto")

def _get_fernet() -> Fernet:
    key = os.getenv("FIELD_ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError("FIELD_ENCRYPTION_KEY not set in .env")
    if len(key) != 44:
        raise RuntimeError(
            f"FIELD_ENCRYPTION_KEY must be 44 chars (base64 URL-safe Fernet key), got {len(key)}"
        )
    try:
        base64.urlsafe_b64decode(key)
    except Exception as e:
        raise RuntimeError(f"FIELD_ENCRYPTION_KEY is not valid base64: {e}") from e
    return Fernet(key.encode())


def encrypt_field(value: str) -> str:
    if not value:
        return ""
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_field(value: str) -> str:
    if not value:
        return ""
    try:
        return _get_fernet().decrypt(value.encode()).decode()
    except RuntimeError:
        raise  # key misconfiguration — must surface
    except (InvalidToken, Exception):
        _log.error("decrypt_field: InvalidToken for value prefix=%s", value[:10])
        return ""
