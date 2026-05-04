import asyncio
import hashlib
import json
import math
import os
import re
import secrets
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Optional

import pyotp
import qrcode
import io
import base64
import ccxt
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from pydantic import EmailStr
from config.settings import BYBIT_API_KEY, BYBIT_SECRET, USE_TESTNET, IS_DEMO_TRADING, DASHBOARD_PASSWORD, USDT_WALLET_TRC20

PERF_CRON_SECRET = os.environ.get("STRIPE_PERFORMANCE_CRON_SECRET", "")
from database import get_db, User, WaitlistEntry, UserApiKey, UserTrade, MonthlyPnl, Subscription
from utils.auth import hash_password, verify_password, create_token, decode_token
from utils.crypto import encrypt_field, decrypt_field
from utils.email import send_verification_email
from sqlalchemy.orm import Session

from modules import position_closer
from modules import stripe_billing
from saas_dispatcher import start_dispatcher, get_status as dispatcher_status, sync_user as dispatcher_sync_user, stop_user as dispatcher_stop_user

app = FastAPI(title="Kado — AI Signal Intelligence", docs_url=None, redoc_url=None)


@app.on_event("startup")
async def _startup():
    asyncio.create_task(position_closer.run_loop())
    asyncio.get_running_loop().run_in_executor(None, start_dispatcher)

# ─── CORS: только явно разрешённые origins ────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://kadoclub.net",
        "https://www.kadoclub.net",
        "http://localhost:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# ─── Real IP: работаем за Cloudflare proxy ───────────────────────────────────
def _real_ip(request: Request) -> str:
    """
    Real IP from CF-Connecting-IP only (injected by Cloudflare, cannot be spoofed).
    X-Forwarded-For is NOT trusted — can be spoofed by clients to bypass rate limits.
    """
    cf = request.headers.get("CF-Connecting-IP")
    if cf:
        return cf.strip()
    return request.client.host

# ─── Global API rate limit middleware ────────────────────────────────────────
@app.middleware("http")
async def global_rate_limit(request: Request, call_next):
    if request.url.path.startswith("/api/"):
        ip = _real_ip(request)
        if not _check_rate_limit(f"api:{ip}", window=60, max_hits=120):
            return Response("Rate limit exceeded", status_code=429)
    return await call_next(request)

# ─── Security headers middleware ──────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "connect-src 'self' wss://kadoclub.net ws://localhost:8000 ws://localhost:5173 "
        "https://api.bybit.com wss://stream.bybit.com; "
        "img-src 'self' data:; "
        "frame-ancestors 'none'; "
        "upgrade-insecure-requests;"
    )
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    if "server" in response.headers:
        del response.headers["server"]
    response.headers.append("server", "kado")
    return response

# ─── Rate limiting (in-memory, per real IP) ──────────────────────────────────
_rate_buckets: dict = defaultdict(list)
_rate_buckets_last_cleanup: float = 0.0

def _check_rate_limit(ip: str, window: int = 60, max_hits: int = 10) -> bool:
    global _rate_buckets_last_cleanup
    now = time.time()
    # Чистим старые записи раз в 5 минут чтобы избежать memory leak
    if now - _rate_buckets_last_cleanup > 300:
        cutoff = now - 3600
        stale = [k for k, v in _rate_buckets.items() if not v or max(v) < cutoff]
        for k in stale:
            del _rate_buckets[k]
        _rate_buckets_last_cleanup = now
    hits = _rate_buckets[ip]
    _rate_buckets[ip] = [t for t in hits if now - t < window]
    if len(_rate_buckets[ip]) >= max_hits:
        return False
    _rate_buckets[ip].append(now)
    return True

# ─── Auth tokens (in-memory, с TTL 24ч) ──────────────────────────────────────
_TOKEN_TTL = 86_400  # 24 часа

# {token: expires_at_unix}
_active_tokens: dict[str, float] = {}
# {partial_token: {"user_id": int, "exp": float}} — separate from _active_tokens to avoid type mismatch
_2fa_pending: dict[str, dict] = {}
_revoked_jtis: dict[str, float] = {}  # jti → expiry; purged when expired
_ws_connections: dict = defaultdict(int)  # ip → open connection count
_WS_MAX_PER_IP = 5
security = HTTPBearer()

def _purge_expired():
    now = time.time()
    expired = [t for t, exp in _active_tokens.items() if exp < now]
    for t in expired:
        del _active_tokens[t]
    stale = [k for k, v in _2fa_pending.items() if v["exp"] < now]
    for k in stale:
        del _2fa_pending[k]
    stale_jtis = [j for j, exp in _revoked_jtis.items() if exp < now]
    for j in stale_jtis:
        del _revoked_jtis[j]

def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    _purge_expired()
    token = credentials.credentials
    exp = _active_tokens.get(token)
    if exp is None or exp < time.time():
        _active_tokens.pop(token, None)
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return token


def require_any_auth(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """Accept admin token OR user JWT — for endpoints shared between dashboards."""
    _purge_expired()
    token = credentials.credentials
    exp = _active_tokens.get(token)
    if exp and exp >= time.time():
        return token
    payload = decode_token(token)
    if payload:
        user = db.query(User).filter(User.id == int(payload["sub"])).first()
        if user and user.is_active:
            return token
    raise HTTPException(status_code=401, detail="Invalid or expired token")

LEDGER_FILE = "signals_log.json"

# ─── Backtest in-process runner ──────────────────────────────────────────────
import threading as _bt_thread

_backtest_running  = False
_backtest_progress: dict = {"current": 0, "total": 0, "run_id": None}


class BacktestStartRequest(BaseModel):
    days:    int        = 30
    coins:   list[str]  = []
    balance: float      = 10_000.0
    tp:      float      = 0.0
    sl:      float      = 0.0


class BillingCheckoutRequest(BaseModel):
    plan: str   # basic | pro | performance


@app.post("/api/backtest/start")
async def start_backtest(body: BacktestStartRequest, token: str = Depends(require_any_auth)):
    global _backtest_running, _backtest_progress
    if _backtest_running:
        raise HTTPException(status_code=409, detail="Backtest already running")

    def _progress_cb(current: int, total: int, run_id: str):
        global _backtest_progress
        _backtest_progress = {"current": current, "total": total, "run_id": run_id}

    def _run_bg():
        global _backtest_running, _backtest_progress
        _backtest_running  = True
        _backtest_progress = {"current": 0, "total": 0, "run_id": None}
        try:
            import sys as _sys
            _tools = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools")
            if _tools not in _sys.path:
                _sys.path.insert(0, _tools)
            from replay_backtest import run as _run  # noqa: PLC0415
            _run(
                days=body.days,
                coins_filter=body.coins or None,
                balance=body.balance,
                tp=body.tp or None,
                sl=body.sl or None,
                progress_cb=_progress_cb,
            )
        except Exception as _e:
            print(f"[backtest] Error: {_e}")
        finally:
            _backtest_running = False

    _bt_thread.Thread(target=_run_bg, daemon=True).start()
    return {"ok": True}


@app.get("/api/backtest/status")
async def backtest_status(token: str = Depends(require_any_auth)):
    return {"running": _backtest_running, "progress": _backtest_progress}


# ─── Static files ─────────────────────────────────────────────────────────────
if not os.path.exists("static"):
    os.makedirs("static")
app.mount("/static", StaticFiles(directory="static"), name="static")
if os.path.exists("static/assets"):
    app.mount("/assets", StaticFiles(directory="static/assets"), name="assets")


# ══════════════════════════════════════════════════════════════════════════════
#  AUTH ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

class LoginRequest(BaseModel):
    password: str

@app.post("/api/auth/login")
async def login(body: LoginRequest, request: Request):
    ip = _real_ip(request)
    if not _check_rate_limit(ip, window=60, max_hits=10):
        raise HTTPException(status_code=429, detail="Too many attempts. Wait 60s.")
    import hmac as _hmac
    if not _hmac.compare_digest(body.password, DASHBOARD_PASSWORD):
        raise HTTPException(status_code=401, detail="Invalid password")
    token = secrets.token_hex(32)
    _active_tokens[token] = time.time() + _TOKEN_TTL
    return {"token": token}

@app.post("/api/auth/logout")
async def logout(token: str = Depends(require_any_auth)):
    _active_tokens.pop(token, None)
    payload = decode_token(token)
    if payload and payload.get("jti") and payload.get("exp"):
        _revoked_jtis[payload["jti"]] = float(payload["exp"])
    return {"ok": True}


# ─── SaaS User Auth ──────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str

class UserLoginRequest(BaseModel):
    email: str
    password: str

class UpdateProfileRequest(BaseModel):
    tg_chat_id: str = ""

class ApiKeyRequest(BaseModel):
    api_key: str
    secret: str
    is_testnet: bool = False

def _get_user_from_token(token: str, db: Session):
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("jti") and payload["jti"] in _revoked_jtis:
        raise HTTPException(status_code=401, detail="Token revoked — please login again")
    user = db.query(User).filter(User.id == int(payload["sub"])).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user

@app.post("/api/users/register")
async def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    ip = _real_ip(request)
    if not _check_rate_limit(ip, window=3600, max_hits=5):
        raise HTTPException(status_code=429, detail="Too many registrations. Wait 1h.")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    pw = body.password
    if len(pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not re.search(r'[A-Z]', pw):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
    if not re.search(r'[0-9]', pw):
        raise HTTPException(status_code=400, detail="Password must contain at least one number")
    if not re.search(r'[^A-Za-z0-9]', pw):
        raise HTTPException(status_code=400, detail="Password must contain at least one special character")
    verify_token = secrets.token_urlsafe(32)
    verify_token_hash = hashlib.sha256(verify_token.encode()).hexdigest()
    user = User(
        email=body.email,
        username=body.username,
        password_hash=hash_password(body.password),
        email_verified=False,
        email_verify_token=verify_token_hash,
        plan="trial",
        trial_ends_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=7),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    # Send verification email in background — non-blocking, failure is silent
    asyncio.get_running_loop().run_in_executor(
        None, send_verification_email, body.email, verify_token
    )
    token = create_token(user.id, user.email)
    return {"token": token, "user": {"id": user.id, "email": user.email, "username": user.username, "plan": user.plan, "email_verified": False}}

class VerifyEmailRequest(BaseModel):
    token: str

@app.post("/api/users/verify-email")
async def verify_email(body: VerifyEmailRequest, db: Session = Depends(get_db)):
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    user = db.query(User).filter(
        User.email_verify_token == token_hash,
        User.email_verified == False,
    ).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or already used verification token")
    user.email_verified      = True
    user.email_verify_token  = None
    db.commit()
    return {"ok": True, "message": "Email verified successfully"}


@app.post("/api/users/resend-verification")
async def resend_verification(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    user = _get_user_from_token(credentials.credentials, db)
    if user.email_verified:
        raise HTTPException(status_code=400, detail="Email already verified")
    new_token = secrets.token_urlsafe(32)
    user.email_verify_token = hashlib.sha256(new_token.encode()).hexdigest()
    db.commit()
    asyncio.get_running_loop().run_in_executor(
        None, send_verification_email, user.email, new_token
    )
    return {"ok": True, "message": "Verification email sent"}


class ForgotPasswordRequest(BaseModel):
    email: str

class ResetPasswordRequest(BaseModel):
    token: str
    password: str

@app.post("/api/users/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    ip = _real_ip(request)
    if not _check_rate_limit(f"reset:{ip}", window=3600, max_hits=5):
        raise HTTPException(status_code=429, detail="Слишком много запросов. Подождите 1 час.")
    user = db.query(User).filter(User.email == body.email).first()
    if user:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        user.password_reset_token   = token_hash
        user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()
        from utils.email import send_password_reset_email
        asyncio.get_running_loop().run_in_executor(None, send_password_reset_email, user.email, token)
    return {"ok": True, "message": "Если email зарегистрирован — письмо отправлено"}


@app.post("/api/users/reset-password")
async def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Пароль слишком короткий")
    if not re.search(r'[A-Z]', body.password):
        raise HTTPException(status_code=400, detail="Нужна хотя бы одна заглавная буква")
    if not re.search(r'[0-9]', body.password):
        raise HTTPException(status_code=400, detail="Нужна хотя бы одна цифра")
    if not re.search(r'[^A-Za-z0-9]', body.password):
        raise HTTPException(status_code=400, detail="Нужен хотя бы один спецсимвол")
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    user = db.query(User).filter(User.password_reset_token == token_hash).first()
    if not user or not user.password_reset_expires:
        raise HTTPException(status_code=400, detail="Неверная или устаревшая ссылка")
    if datetime.now(timezone.utc) > user.password_reset_expires.replace(tzinfo=timezone.utc):
        raise HTTPException(status_code=400, detail="Ссылка истекла — запросите новую")
    user.password_hash           = hash_password(body.password[:72])
    user.password_reset_token    = None
    user.password_reset_expires  = None
    db.commit()
    return {"ok": True, "message": "Пароль успешно изменён"}


@app.post("/api/users/login")
async def user_login(body: UserLoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = _real_ip(request)
    if not _check_rate_limit(ip, window=60, max_hits=10):
        raise HTTPException(status_code=429, detail="Too many attempts. Wait 60s.")
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    if user.totp_enabled:
        partial = secrets.token_hex(16)
        _2fa_pending[partial] = {"user_id": user.id, "exp": time.time() + 300}
        return {"requires_2fa": True, "partial_token": partial}
    token = create_token(user.id, user.email)
    from utils.email import send_login_notification_email
    asyncio.get_running_loop().run_in_executor(None, send_login_notification_email, user.email, ip)
    return {"token": token, "user": {"id": user.id, "email": user.email, "username": user.username, "plan": user.plan, "subscribed": user.is_pro, "email_verified": bool(user.email_verified), "totp_enabled": bool(user.totp_enabled)}}

@app.get("/api/users/me")
async def get_me(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    user = _get_user_from_token(credentials.credentials, db)
    # Lazy trial expiry
    if user.plan == "trial" and user.trial_ends_at and datetime.utcnow() > user.trial_ends_at:
        user.plan = "free"
        db.commit()
    sub = user.subscription
    key_row = next((k for k in user.api_keys if k.exchange == "bybit"), None)
    trial_days_left = None
    if user.plan == "trial" and user.trial_ends_at:
        delta = user.trial_ends_at - datetime.utcnow()
        trial_days_left = max(0, delta.days)
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "plan": user.plan,
        "subscribed": user.is_pro,
        "subscription_expires": sub.expires_at.isoformat() if sub and sub.expires_at else None,
        "stripe_customer_id": sub.stripe_customer_id if sub else None,
        "trial_ends_at": user.trial_ends_at.isoformat() if user.trial_ends_at else None,
        "trial_days_left": trial_days_left,
        "tg_chat_id": user.tg_chat_id,
        "has_api_keys": key_row is not None,
        "api_key_testnet": key_row.is_testnet if key_row else False,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "email_verified": bool(user.email_verified),
        "totp_enabled": bool(user.totp_enabled),
    }

@app.put("/api/users/me")
async def update_me(body: UpdateProfileRequest, credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    user = _get_user_from_token(credentials.credentials, db)
    if body.tg_chat_id:
        user.tg_chat_id = body.tg_chat_id
    db.commit()
    return {"ok": True}


@app.post("/api/users/keys")
async def save_api_keys(body: ApiKeyRequest, credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Save or replace the user's Bybit API key (stored encrypted)."""
    user = _get_user_from_token(credentials.credentials, db)
    if not body.api_key or not body.secret:
        raise HTTPException(status_code=400, detail="api_key and secret are required")
    from sqlalchemy.exc import IntegrityError
    try:
        key_row = (
            db.query(UserApiKey)
            .filter_by(user_id=user.id, exchange="bybit")
            .with_for_update()
            .first()
        )
        if key_row:
            key_row.api_key_enc   = encrypt_field(body.api_key)
            key_row.secret_enc    = encrypt_field(body.secret)
            key_row.is_testnet    = body.is_testnet
            key_row.last_verified = None
        else:
            key_row = UserApiKey(
                user_id     = user.id,
                exchange    = "bybit",
                api_key_enc = encrypt_field(body.api_key),
                secret_enc  = encrypt_field(body.secret),
                is_testnet  = body.is_testnet,
            )
            db.add(key_row)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not save keys, try again")
    # Немедленно запускаем боты для этого пользователя
    asyncio.get_running_loop().run_in_executor(None, dispatcher_sync_user, user.id)
    return {"ok": True}


@app.delete("/api/users/keys")
async def delete_api_keys(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    user = _get_user_from_token(credentials.credentials, db)
    db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit").delete()
    db.commit()
    # Немедленно останавливаем боты
    asyncio.get_running_loop().run_in_executor(None, dispatcher_stop_user, user.id)
    return {"ok": True}


# ──────────────────────────────────────────────────────────────────────────────
#  2FA endpoints
# ──────────────────────────────────────────────────────────────────────────────

class TotpVerifyRequest(BaseModel):
    code: str

class TotpLoginRequest(BaseModel):
    partial_token: str
    code: str

class TotpRecoverRequest(BaseModel):
    email: str
    recovery_code: str


def _generate_recovery_codes() -> tuple[list[str], list[str]]:
    """Generate 8 one-time recovery codes. Returns (plaintext_list, hashed_list)."""
    plain, hashed = [], []
    for _ in range(8):
        code = secrets.token_hex(16)
        plain.append(code)
        hashed.append(hash_password(code))
    return plain, hashed

class TotpSetupRequest(BaseModel):
    password: str

@app.post("/api/users/2fa/setup")
async def totp_setup(body: TotpSetupRequest, credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    user = _get_user_from_token(credentials.credentials, db)
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный пароль")
    if user.totp_enabled:
        raise HTTPException(status_code=400, detail="2FA already enabled")
    secret = pyotp.random_base32()
    user.totp_secret = encrypt_field(secret)
    db.commit()
    uri = pyotp.totp.TOTP(secret).provisioning_uri(name=user.email, issuer_name="Kado")
    img = qrcode.make(uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    qr_b64 = base64.b64encode(buf.getvalue()).decode()
    return {"secret": secret, "qr": f"data:image/png;base64,{qr_b64}"}

@app.post("/api/users/2fa/enable")
async def totp_enable(body: TotpVerifyRequest, credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    user = _get_user_from_token(credentials.credentials, db)
    if not user.totp_secret:
        raise HTTPException(status_code=400, detail="Run /2fa/setup first")
    if not pyotp.TOTP(decrypt_field(user.totp_secret)).verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code")
    plain_codes, hashed_codes = _generate_recovery_codes()
    user.totp_enabled    = True
    user.recovery_codes  = json.dumps(hashed_codes)
    db.commit()
    return {"ok": True, "recovery_codes": plain_codes,
            "message": "Save these 8 recovery codes — each can be used once if you lose your authenticator."}

@app.post("/api/users/2fa/disable")
async def totp_disable(body: TotpVerifyRequest, credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    user = _get_user_from_token(credentials.credentials, db)
    if not user.totp_enabled or not user.totp_secret:
        raise HTTPException(status_code=400, detail="2FA not enabled")
    if not pyotp.TOTP(decrypt_field(user.totp_secret)).verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid code")
    user.totp_enabled = False
    user.totp_secret = None
    db.commit()
    return {"ok": True}

@app.post("/api/users/2fa/verify")
async def totp_verify_login(body: TotpLoginRequest, request: Request, db: Session = Depends(get_db)):
    ip = _real_ip(request)
    if not _check_rate_limit(f"2fa:{ip}", window=60, max_hits=10):
        raise HTTPException(status_code=429, detail="Too many attempts. Wait 60s.")
    _purge_expired()
    entry = _2fa_pending.get(body.partial_token)
    if not entry or time.time() > entry["exp"]:
        _2fa_pending.pop(body.partial_token, None)
        raise HTTPException(status_code=401, detail="Session expired. Login again.")
    user = db.query(User).filter(User.id == entry["user_id"]).first()
    if not user or not user.totp_secret:
        raise HTTPException(status_code=401, detail="User not found")
    if not pyotp.TOTP(decrypt_field(user.totp_secret)).verify(body.code, valid_window=1):
        raise HTTPException(status_code=400, detail="Invalid authenticator code")
    _2fa_pending.pop(body.partial_token, None)
    token = create_token(user.id, user.email)
    return {"token": token, "user": {"id": user.id, "email": user.email, "username": user.username, "plan": user.plan, "subscribed": user.is_pro, "email_verified": bool(user.email_verified), "totp_enabled": True}}


@app.post("/api/users/2fa/recover")
async def totp_recover(body: TotpRecoverRequest, request: Request, db: Session = Depends(get_db)):
    """Login using a one-time recovery code when authenticator is unavailable."""
    ip = _real_ip(request)
    if not _check_rate_limit(f"2fa_recover:{ip}", window=300, max_hits=5):
        raise HTTPException(status_code=429, detail="Too many attempts. Wait 5 minutes.")
    user = db.query(User).filter(User.email == body.email, User.is_active == True).first()
    if not user or not user.totp_enabled or not user.recovery_codes:
        raise HTTPException(status_code=401, detail="Invalid email or 2FA not enabled")
    codes: list = json.loads(user.recovery_codes)
    matched_idx = next(
        (i for i, h in enumerate(codes) if h and verify_password(body.recovery_code, h)),
        None,
    )
    if matched_idx is None:
        raise HTTPException(status_code=401, detail="Invalid recovery code")
    # Burn the used code
    codes[matched_idx] = None
    user.recovery_codes = json.dumps(codes)
    db.commit()
    remaining = sum(1 for c in codes if c)
    token = create_token(user.id, user.email)
    return {
        "token": token,
        "user": {"id": user.id, "email": user.email, "username": user.username,
                 "plan": user.plan, "email_verified": bool(user.email_verified)},
        "warning": f"{remaining} recovery codes remaining. Set up a new authenticator app.",
    }


# ══════════════════════════════════════════════════════════════════════════════
#  USER TRADES & PnL
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/users/trades")
async def get_user_trades(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    user = _get_user_from_token(credentials.credentials, db)
    trades = (
        db.query(UserTrade)
        .filter(UserTrade.user_id == user.id)
        .order_by(UserTrade.opened_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return [
        {
            "id":          t.id,
            "signal_id":   t.signal_id,
            "source":      t.source,
            "symbol":      t.symbol,
            "side":        t.side,
            "leverage":    t.leverage,
            "entry_price": t.entry_price,
            "exit_price":  t.exit_price,
            "qty":         t.qty,
            "pnl_usdt":    t.pnl_usdt,
            "status":      t.status,
            "opened_at":   t.opened_at.isoformat() if t.opened_at else None,
            "closed_at":   t.closed_at.isoformat() if t.closed_at else None,
        }
        for t in trades
    ]


@app.get("/api/users/pnl")
async def get_user_pnl(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    user = _get_user_from_token(credentials.credentials, db)
    rows = (
        db.query(MonthlyPnl)
        .filter(MonthlyPnl.user_id == user.id)
        .order_by(MonthlyPnl.year.desc(), MonthlyPnl.month.desc())
        .limit(12)
        .all()
    )
    return [
        {
            "year":            r.year,
            "month":           r.month,
            "gross_pnl":       r.gross_pnl,
            "performance_fee": r.performance_fee,
            "net_pnl":         r.net_pnl,
            "fee_paid":        r.fee_paid,
        }
        for r in rows
    ]


# ══════════════════════════════════════════════════════════════════════════════
#  BILLING ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.post("/api/billing/checkout")
async def billing_checkout(
    body: BillingCheckoutRequest,
    token: str = Depends(require_any_auth),
    db: Session = Depends(get_db),
):
    if body.plan not in ("basic", "pro", "performance"):
        raise HTTPException(status_code=400, detail="Invalid plan")
    user = _get_user_from_token(token, db)
    try:
        url = stripe_billing.create_checkout_session(user.id, body.plan)
        return {"url": url}
    except stripe_billing.stripe.error.StripeError:
        raise HTTPException(status_code=503, detail="Stripe unavailable")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/billing/portal")
async def billing_portal(
    token: str = Depends(require_any_auth),
    db: Session = Depends(get_db),
):
    user = _get_user_from_token(token, db)
    try:
        url = stripe_billing.create_portal_session(user.id)
        return {"url": url}
    except stripe_billing.stripe.error.StripeError:
        raise HTTPException(status_code=503, detail="Stripe unavailable")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/webhooks/stripe")
async def stripe_webhook(request: Request):
    payload    = await request.body()
    sig_header = request.headers.get("stripe-signature", "")
    try:
        stripe_billing.handle_webhook(payload, sig_header)
        return {"ok": True}
    except stripe_billing.stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    except Exception as e:
        print(f"[WEBHOOK] Error: {e}")
        raise HTTPException(status_code=400, detail="Webhook processing failed")


@app.post("/api/billing/invoice-performance")
async def invoice_performance(request: Request):
    secret = request.headers.get("X-Cron-Secret", "")
    if not PERF_CRON_SECRET or secret != PERF_CRON_SECRET:
        raise HTTPException(status_code=403, detail="Forbidden")
    import subprocess
    subprocess.Popen(["python3", "billing_cron.py"])
    return {"ok": True, "message": "Cron started"}


# ─── Manual USDT invoice endpoints ───────────────────────────────────────────

class InvoiceNotifyRequest(BaseModel):
    invoice_id: int
    tx_hash: Optional[str] = None


@app.get("/api/billing/invoice/current")
async def get_current_invoice(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """Return active unpaid invoice + current month running PnL for performance users."""
    from sqlalchemy import func, desc
    user = _get_user_from_token(credentials.credentials, db)
    if user.plan != "performance":
        raise HTTPException(status_code=403, detail="Performance plan required")

    now = datetime.now(timezone.utc)

    # Oldest unpaid invoice with a fee > 0
    invoice = (
        db.query(MonthlyPnl)
        .filter(MonthlyPnl.user_id == user.id, MonthlyPnl.performance_fee > 0, MonthlyPnl.fee_paid == False)
        .order_by(MonthlyPnl.year, MonthlyPnl.month)
        .first()
    )

    # Running total for the current calendar month
    month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    current_pnl = db.query(func.sum(UserTrade.pnl_usdt)).filter(
        UserTrade.user_id == user.id,
        UserTrade.status == "closed",
        UserTrade.closed_at >= month_start,
    ).scalar() or 0.0

    result: dict = {
        "wallet_trc20": USDT_WALLET_TRC20,
        "current_month_pnl": round(float(current_pnl), 2),
        "projected_fee": round(max(0.0, float(current_pnl) * 0.20), 2),
        "invoice": None,
    }

    if invoice:
        result["invoice"] = {
            "id":           invoice.id,
            "year":         invoice.year,
            "month":        invoice.month,
            "gross_pnl":    invoice.gross_pnl,
            "fee":          invoice.performance_fee,
            "fee_paid":     invoice.fee_paid,
            "notified":     invoice.payment_notified_at is not None,
            "notified_at":  invoice.payment_notified_at.isoformat() if invoice.payment_notified_at else None,
            "tx_hash":      invoice.tx_hash,
        }

    return result


@app.post("/api/billing/invoice/notify")
async def notify_invoice_payment(
    body: InvoiceNotifyRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """User notifies that USDT payment was sent."""
    user = _get_user_from_token(credentials.credentials, db)
    invoice = db.query(MonthlyPnl).filter(
        MonthlyPnl.id == body.invoice_id,
        MonthlyPnl.user_id == user.id,
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if invoice.fee_paid:
        raise HTTPException(status_code=400, detail="Invoice already marked paid")
    invoice.payment_notified_at = datetime.now(timezone.utc)
    if body.tx_hash:
        invoice.tx_hash = body.tx_hash[:100]
    db.commit()
    return {"ok": True}


# ─── Admin dispatcher status ──────────────────────────────────────────────────

@app.get("/api/admin/dispatcher")
async def admin_dispatcher_status(token: str = Depends(require_auth)):
    """Admin: list running user bot instances."""
    return {"instances": dispatcher_status()}


# ─── Admin invoice management ─────────────────────────────────────────────────

@app.get("/api/admin/invoices")
async def admin_list_invoices(
    token: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Admin: list all performance fee invoices (newest first)."""
    from sqlalchemy import desc
    invoices = (
        db.query(MonthlyPnl)
        .filter(MonthlyPnl.performance_fee > 0)
        .order_by(desc(MonthlyPnl.year), desc(MonthlyPnl.month))
        .all()
    )
    return [
        {
            "id":           inv.id,
            "user_id":      inv.user_id,
            "user_email":   inv.user.email if inv.user else None,
            "year":         inv.year,
            "month":        inv.month,
            "gross_pnl":    inv.gross_pnl,
            "fee":          inv.performance_fee,
            "fee_paid":     inv.fee_paid,
            "notified":     inv.payment_notified_at is not None,
            "notified_at":  inv.payment_notified_at.isoformat() if inv.payment_notified_at else None,
            "tx_hash":      inv.tx_hash,
            "settled_at":   inv.settled_at.isoformat() if inv.settled_at else None,
        }
        for inv in invoices
    ]


@app.post("/api/admin/invoices/{invoice_id}/mark-paid")
async def admin_mark_invoice_paid(
    invoice_id: int,
    token: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Admin: confirm USDT payment received."""
    invoice = db.query(MonthlyPnl).filter(MonthlyPnl.id == invoice_id).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice.fee_paid   = True
    invoice.settled_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True}


# ══════════════════════════════════════════════════════════════════════════════
#  WAITLIST
# ══════════════════════════════════════════════════════════════════════════════

class WaitlistRequest(BaseModel):
    email: str

@app.post("/api/waitlist")
async def join_waitlist(body: WaitlistRequest, request: Request, db: Session = Depends(get_db)):
    ip = _real_ip(request)
    if not _check_rate_limit(ip, window=3600, max_hits=5):
        raise HTTPException(status_code=429, detail="Too many requests. Try later.")
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Invalid email")
    if db.query(WaitlistEntry).filter(WaitlistEntry.email == email).first():
        return {"ok": True, "message": "Already on the list"}
    entry = WaitlistEntry(email=email)
    db.add(entry)
    db.commit()
    return {"ok": True, "message": "Added to waitlist"}

@app.get("/api/waitlist/count")
async def waitlist_count(db: Session = Depends(get_db)):
    count = db.query(WaitlistEntry).count()
    return {"count": count}


# ══════════════════════════════════════════════════════════════════════════════
#  DATA ENDPOINTS  (все требуют auth)
# ══════════════════════════════════════════════════════════════════════════════

def _load_signals() -> list:
    if not os.path.exists(LEDGER_FILE):
        return []
    try:
        with open(LEDGER_FILE, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"Ошибка чтения лога: {e}")
        return []


@app.get("/api/data")
async def get_dashboard_data(token: str = Depends(require_any_auth)):
    signals = _load_signals()

    balance_info = {"total": 0, "free": 0}
    try:
        if BYBIT_API_KEY and BYBIT_SECRET:
            exchange = ccxt.bybit({
                "apiKey": BYBIT_API_KEY,
                "secret": BYBIT_SECRET,
                "options": {"defaultType": "linear"},
            })
            if IS_DEMO_TRADING:
                exchange.urls['api'] = exchange.urls['demotrading']
            elif USE_TESTNET:
                exchange.set_sandbox_mode(True)
            try:
                balance = exchange.fetch_balance({'accountType': 'unified'})
                if "USDT" not in balance or balance["USDT"].get("total", 0) == 0:
                    balance = exchange.fetch_balance({'accountType': 'contract'})
                if "USDT" not in balance or balance["USDT"].get("total", 0) == 0:
                    balance = exchange.fetch_balance()
            except:
                balance = exchange.fetch_balance()
            if "USDT" in balance:
                balance_info["total"] = balance["USDT"].get("total", 0)
                balance_info["free"]  = balance["USDT"].get("free", 0)
    except Exception as e:
        print(f"Ошибка получения баланса: {e}")

    trades         = [s for s in signals if s.get('action') in ('LONG', 'SHORT')]
    closed_trades  = [s for s in trades  if 'result' in s]
    winning_trades = sum(1 for s in closed_trades if s['result'] == 'WIN')
    losing_trades  = sum(1 for s in closed_trades if s['result'] == 'LOSS')
    winrate_pct    = round(winning_trades / len(closed_trades) * 100, 1) if closed_trades else 0
    total_pnl      = round(sum(s.get('pnl_usdt', 0) for s in closed_trades), 2)

    return {
        "status": "online",
        "balance": balance_info,
        "latest_signals": signals[-20:][::-1],
        "stats": {
            "total_signals":  len(signals),
            "longs":          len([s for s in signals if s.get('action') == 'LONG']),
            "shorts":         len([s for s in signals if s.get('action') == 'SHORT']),
            "total_trades":   len(trades),
            "closed_trades":  len(closed_trades),
            "winning_trades": winning_trades,
            "losing_trades":  losing_trades,
            "winrate_pct":    winrate_pct,
            "total_pnl":      total_pnl,
        }
    }


@app.get("/api/signals")
async def get_signals(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=200),
    coin: Optional[str] = Query(default=None, max_length=20, regex=r"^[A-Z0-9]{1,20}$"),
    action: Optional[str] = Query(default=None, max_length=10),
    token: str = Depends(require_any_auth),
):
    _VALID_ACTIONS = {"LONG", "SHORT"}
    if action and action.upper() not in _VALID_ACTIONS:
        raise HTTPException(status_code=400, detail="action must be LONG or SHORT")

    all_signals = _load_signals()

    if action:
        filtered = [s for s in all_signals if s.get("action") == action.upper()]
    else:
        filtered = [s for s in all_signals if s.get("action") in ("LONG", "SHORT")]

    if coin:
        filtered = [s for s in filtered if s.get("coin", "").upper() == coin.upper()]

    filtered.sort(key=lambda s: s.get("timestamp", ""), reverse=True)

    total = len(filtered)
    pages = max(1, math.ceil(total / limit))
    start = (page - 1) * limit

    return {
        "signals": filtered[start:start + limit],
        "total": total,
        "page": page,
        "pages": pages,
    }


@app.get("/api/stats")
async def get_stats(token: str = Depends(require_any_auth)):
    all_signals = _load_signals()
    trades = [s for s in all_signals if s.get("action") in ("LONG", "SHORT")]

    closed_trades  = [s for s in trades if "result" in s]
    winning_trades = sum(1 for s in closed_trades if s.get("result") == "WIN")
    losing_trades  = sum(1 for s in closed_trades if s.get("result") == "LOSS")
    total_pnl      = round(sum(float(s.get("pnl_usdt", 0)) for s in closed_trades), 2)
    win_rate       = round(winning_trades / len(closed_trades) * 100, 1) if closed_trades else 0.0

    return {
        "total_trades":   len(trades),
        "closed_trades":  len(closed_trades),
        "win_rate":       win_rate,
        "total_pnl":      total_pnl,
        "winning_trades": winning_trades,
        "losing_trades":  losing_trades,
        "long_count":     sum(1 for s in trades if s.get("action") == "LONG"),
        "short_count":    sum(1 for s in trades if s.get("action") == "SHORT"),
    }


@app.get("/api/intel")
async def get_intel(token: str = Depends(require_any_auth)):
    """Live данные: источники, ликвидации, on-chain."""
    try:
        with open("live_intel.json") as f:
            return json.load(f)
    except Exception:
        return {
            "updated_at": None,
            "sources": {"rss": False, "telegram": False, "liquidations": False, "onchain": False},
            "liquidations": {},
            "onchain": {},
        }


@app.get("/api/logs")
async def get_logs(
    lines: int = Query(default=100, ge=1, le=500),
    token: str = Depends(require_any_auth),
):
    log_path = "bot_engine.log"
    if not os.path.exists(log_path):
        return {"lines": ["Log file not found."]}
    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
        return {"lines": [l.rstrip() for l in all_lines[-lines:]]}
    except Exception as e:
        return {"lines": [f"Error reading log: {e}"]}


# ══════════════════════════════════════════════════════════════════════════════
#  WEBSOCKET  (требует токен в query param)
# ══════════════════════════════════════════════════════════════════════════════

def _get_file_mtime() -> float:
    try:
        return os.path.getmtime(LEDGER_FILE)
    except OSError:
        return 0.0


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    ip = _real_ip(websocket)
    if _ws_connections[ip] >= _WS_MAX_PER_IP:
        await websocket.close(code=4029)
        return
    await websocket.accept()
    _ws_connections[ip] += 1
    try:
        # Ждём первое сообщение с токеном — не передаём токен в URL (логи)
        try:
            auth_msg = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
            token = auth_msg.strip()
        except (asyncio.TimeoutError, Exception):
            await websocket.close(code=4001)
            return
        _purge_expired()
        exp = _active_tokens.get(token)
        if not exp or exp < time.time():
            await websocket.close(code=4001)
            return
        last_mtime = _get_file_mtime()
        while True:
            await asyncio.sleep(5)
            current_mtime = _get_file_mtime()
            if current_mtime != last_mtime:
                last_mtime = current_mtime
                signals = _load_signals()
                await websocket.send_json({"type": "update", "latest": signals[-1] if signals else None})
            else:
                signals = _load_signals()
                await websocket.send_json({
                    "type": "ping",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "signals_count": sum(1 for s in signals if s.get("action") in ("LONG", "SHORT")),
                })
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket ошибка: {e}")
    finally:
        _ws_connections[ip] = max(0, _ws_connections[ip] - 1)


# ══════════════════════════════════════════════════════════════════════════════
#  BACKTEST ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

BACKTEST_DIR = "backtest_results"

@app.get("/api/backtest/runs")
async def get_backtest_runs(token: str = Depends(require_any_auth)):
    if not os.path.exists(BACKTEST_DIR):
        return {"runs": []}
    runs = []
    for fname in sorted(os.listdir(BACKTEST_DIR), reverse=True):
        if not fname.endswith(".json"):
            continue
        path = os.path.join(BACKTEST_DIR, fname)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            runs.append({
                "run_id":  data.get("run_id", fname.replace(".json", "")),
                "params":  data.get("params", {}),
                "summary": data.get("summary", {}),
            })
        except Exception:
            continue
    return {"runs": runs}


@app.get("/api/backtest/run/{run_id}")
async def get_backtest_run(run_id: str, token: str = Depends(require_any_auth)):
    import re
    if not re.match(r'^[\w\-:T]+$', run_id):
        raise HTTPException(status_code=400, detail="Invalid run_id")
    path = os.path.join(BACKTEST_DIR, f"{run_id}.json")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Run not found")
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read backtest result")


# ══════════════════════════════════════════════════════════════════════════════
#  PUBLIC NEWS FEED  (no auth — marketing page)
# ══════════════════════════════════════════════════════════════════════════════

_MOCK_NEWS = [
    {"id":1,"title":"Federal Reserve signals possible rate pause — crypto markets rally","source":"Reuters","published_at":"2026-05-01T10:00:00Z","description":"Bitcoin surged 3.2% following comments from Fed officials suggesting a potential pause in rate hikes.","link":"","from_newsapi":0},
    {"id":2,"title":"Binance adds SOL/USDT perpetual futures with 50× leverage","source":"Telegram:BinanceAnnouncements","published_at":"2026-05-01T09:30:00Z","description":"Binance has listed SOL/USDT perpetual futures contract supporting up to 50× leverage starting today.","link":"","from_newsapi":0},
    {"id":3,"title":"Ethereum layer-2 TVL hits new ATH at $42B","source":"CoinDesk","published_at":"2026-05-01T08:45:00Z","description":"Total value locked across Ethereum layer-2 networks reached a new all-time high, driven by Arbitrum and Base.","link":"","from_newsapi":1},
    {"id":4,"title":"SEC approves spot Ethereum ETF from 5 asset managers","source":"The Block","published_at":"2026-05-01T07:20:00Z","description":"The U.S. Securities and Exchange Commission approved spot Ethereum ETF applications from five major firms.","link":"","from_newsapi":1},
    {"id":5,"title":"Whale alert: 15,000 BTC moved from unknown wallet to Coinbase","source":"Telegram:WhaleAlert","published_at":"2026-05-01T06:00:00Z","description":"A large transfer of 15,000 BTC from an unknown wallet to Coinbase was detected on-chain.","link":"","from_newsapi":0},
]

@app.get("/api/news/public")
async def public_news_feed(
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    import sqlite3
    db_path = "news.db"
    if not os.path.exists(db_path):
        return {"items": _MOCK_NEWS[:limit], "total": len(_MOCK_NEWS), "mock": True}
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM news")
        total = cur.fetchone()[0]
        if total == 0:
            conn.close()
            return {"items": _MOCK_NEWS[:limit], "total": len(_MOCK_NEWS), "mock": True}
        cur.execute(
            "SELECT id, title, source, description, published_at, link, from_newsapi "
            "FROM news ORDER BY published_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        )
        rows = [dict(r) for r in cur.fetchall()]
        conn.close()
        for r in rows:
            if r.get("description"):
                r["description"] = r["description"][:200]
        return {"items": rows, "total": total, "mock": False}
    except Exception:
        return {"items": _MOCK_NEWS[:limit], "total": len(_MOCK_NEWS), "mock": True}


# ══════════════════════════════════════════════════════════════════════════════
#  SPA CATCH-ALL  — MUST BE LAST — иначе перехватывает все /api/* маршруты
# ══════════════════════════════════════════════════════════════════════════════

_NO_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache"}

@app.get("/")
async def read_index():
    return FileResponse("static/index.html", headers=_NO_CACHE)

@app.get("/{full_path:path}")
async def spa_fallback(full_path: str):
    if full_path.startswith("api/") or full_path.startswith("ws"):
        raise HTTPException(status_code=404)
    index = "static/index.html"
    if os.path.exists(index):
        return FileResponse(index, headers=_NO_CACHE)
    raise HTTPException(status_code=404)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, server_header=False, date_header=False)
