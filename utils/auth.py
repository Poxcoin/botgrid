from datetime import datetime, timedelta, timezone
import bcrypt
from jose import JWTError, jwt

SECRET_KEY  = "kado-secret-change-in-production-please"
ALGORITHM   = "HS256"
TOKEN_TTL_H = 24


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(user_id: int, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_H)
    return jwt.encode(
        {"sub": str(user_id), "email": email, "exp": expire},
        SECRET_KEY, algorithm=ALGORITHM,
    )


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None
