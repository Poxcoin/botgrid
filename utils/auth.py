import os
import secrets
from datetime import datetime, timedelta, timezone
import bcrypt
from jose import JWTError, jwt

from config.settings import JWT_SECRET_KEY

ALGORITHM   = "HS256"
TOKEN_TTL_H = 24

def _get_secret() -> str:
    if not JWT_SECRET_KEY:
        raise RuntimeError("JWT_SECRET_KEY not set in .env — refusing to start")
    return JWT_SECRET_KEY


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(user_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_H)
    return jwt.encode(
        {"sub": str(user_id), "email": email, "exp": expire},
        _get_secret(), algorithm=ALGORITHM,
    )


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, _get_secret(), algorithms=[ALGORITHM])
    except (JWTError, RuntimeError):
        return None
