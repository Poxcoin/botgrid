import asyncio
import hashlib
import json
import math
import os
import re
import secrets
import time
import requests
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
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field
from pydantic import EmailStr
from typing import Annotated
from config.settings import BYBIT_API_KEY, BYBIT_SECRET, IS_DEMO_TRADING, DASHBOARD_PASSWORD, USDT_WALLET_TRC20, TG_BOT_TOKEN, TG_CHAT_ID, USERBOT_TOKEN

PERF_CRON_SECRET = os.environ.get("STRIPE_PERFORMANCE_CRON_SECRET", "")
from database import get_db, User, WaitlistEntry, UserApiKey, UserTrade, MonthlyPnl, WeeklyPnl, Subscription, TgLinkToken, ReferralEarning, AuditLog, UserMt5Key, Application
from utils.auth import hash_password, verify_password, create_token, decode_token
from utils.crypto import encrypt_field, decrypt_field
from utils.email import send_verification_email, send_login_otp_email, send_welcome_email, _smtp_enabled
from sqlalchemy.orm import Session

from modules import position_closer
from modules import position_ws
from modules import stripe_billing
from saas_dispatcher import start_dispatcher, get_status as dispatcher_status, sync_user as dispatcher_sync_user, stop_user as dispatcher_stop_user
from bybit_sync import sync_user_trades as _bybit_sync_user, sync_all_users as _bybit_sync_all

try:
    from modules.liquidation_monitor import get_liquidation_signal, liquidation_signal_queue as _liq_queue
    _LIQ_AVAILABLE = True
except Exception as _liq_import_err:
    print(f"[LIQ] Import skipped: {_liq_import_err}")
    _LIQ_AVAILABLE = False
    _liq_queue = None  # type: ignore

app = FastAPI(title="Kado — AI Signal Intelligence", docs_url=None, redoc_url=None)

try:
    from macro_bot.macro_api import router as macro_router
    app.include_router(macro_router, prefix="/api/macro")
except Exception:
    pass


# {user_id: [(unix_ts, unrealized_pnl), ...]}  — in-process ring buffer
_pnl_history: dict = {}
_PNL_ALERT_THRESHOLD = 200.0  # USD drop within 1 hour triggers alert

# Per-position unrealized loss alert state
# key: "{user_id}:{symbol}" → last_alert_unix_ts
_unreal_loss_last_alert: dict = {}
_UNREAL_LOSS_THRESHOLD = -50.0   # USD; configurable
_UNREAL_LOSS_COOLDOWN  = 3600    # 1 alert per position per hour

def _tg_alert(text: str):
    """Fire-and-forget TG message to admin chat."""
    token = os.getenv("TG_BOT_TOKEN", "")
    chat  = os.getenv("TG_CHAT_ID", "")
    if not token or not chat:
        return
    try:
        import requests as _req
        _req.post(f"https://api.telegram.org/bot{token}/sendMessage",
                  json={"chat_id": chat, "text": text, "parse_mode": "HTML"},
                  timeout=6)
    except Exception:
        pass


async def _pnl_alert_loop():
    """Every 5 min: check unrealized PnL per user.

    Runs two checks:
    1. _pnl_alert_check  — alerts if aggregate PnL dropped >$200 in last hour
    2. _unrealized_loss_check — alerts per-position if unrealized loss < -$50
    """
    await asyncio.sleep(300)
    while True:
        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _pnl_alert_check)
            await loop.run_in_executor(None, _unrealized_loss_check)
        except Exception as e:
            print(f"[PNL_ALERT] error: {e}")
        await asyncio.sleep(300)


def _pnl_alert_check():
    from database import SessionLocal
    db = SessionLocal()
    try:
        key_rows = db.query(UserApiKey).filter_by(exchange="bybit").all()
        now_ts = time.time()
        for kr in key_rows:
            try:
                ex = _init_user_exchange(kr)
                if not ex:
                    continue
                positions = _bybit_positions(ex)
                upnl = sum(p["unrealized_pnl"] for p in positions)
                hist = _pnl_history.setdefault(kr.user_id, [])
                hist.append((now_ts, upnl))
                # keep only last 2 hours
                _pnl_history[kr.user_id] = [(t, v) for t, v in hist if now_ts - t <= 7200]
                # check drop vs 1h ago
                one_hour_ago = now_ts - 3600
                old = [v for t, v in _pnl_history[kr.user_id] if t <= one_hour_ago]
                if old:
                    baseline = old[-1]
                    drop = baseline - upnl
                    if drop >= _PNL_ALERT_THRESHOLD:
                        _tg_alert(
                            f" <b>PnL Alert</b>\n"
                            f"Unrealized PnL dropped <b>${drop:.0f}</b> in the last hour\n"
                            f"Was: <b>${baseline:+.0f}</b> → Now: <b>${upnl:+.0f}</b>\n"
                            f"Positions: {len(positions)}"
                        )
                        # Reset to avoid spam — clear history so next alert is fresh
                        _pnl_history[kr.user_id] = [(now_ts, upnl)]
            except Exception as e:
                print(f"[PNL_ALERT] user {kr.user_id}: {e}")
    finally:
        db.close()


def _unrealized_loss_check():
    """Check every open position for all users; alert if unrealized loss < threshold.

    Fires at most once per position per _UNREAL_LOSS_COOLDOWN seconds to avoid spam.
    Alert format matches Council spec:
       Unrealized loss alert: {symbol} position is at -{loss}$ unrealized
    """
    from database import SessionLocal
    db = SessionLocal()
    try:
        key_rows = db.query(UserApiKey).filter_by(exchange="bybit").all()
        now_ts = time.time()
        for kr in key_rows:
            try:
                ex = _init_user_exchange(kr)
                if not ex:
                    continue
                positions = _bybit_positions(ex)
                for pos in positions:
                    upnl   = pos["unrealized_pnl"]
                    symbol = pos["symbol"]
                    if upnl >= _UNREAL_LOSS_THRESHOLD:
                        continue
                    alert_key  = f"{kr.user_id}:{symbol}"
                    last_alert = _unreal_loss_last_alert.get(alert_key, 0)
                    if now_ts - last_alert < _UNREAL_LOSS_COOLDOWN:
                        continue
                    _unreal_loss_last_alert[alert_key] = now_ts
                    loss = abs(upnl)
                    _tg_alert(
                        f" Unrealized loss alert: {symbol} position is at -${loss:.2f} unrealized"
                    )
            except Exception as e:
                print(f"[UNREAL_LOSS] user {kr.user_id}: {e}")
    finally:
        db.close()


async def _bybit_sync_loop():
    """Background loop: import closed PnL for all users every 15 minutes."""
    await asyncio.sleep(120)  # let services start first
    while True:
        try:
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(None, _bybit_sync_all)
        except Exception as e:
            print(f"[BYBIT_SYNC] loop error: {e}")
        await asyncio.sleep(900)


@app.on_event("startup")
async def _startup():
    asyncio.create_task(position_closer.run_loop())
    asyncio.create_task(position_ws.run_manager())
    asyncio.create_task(_bybit_sync_loop())
    asyncio.create_task(_pnl_alert_loop())
    asyncio.get_running_loop().run_in_executor(None, start_dispatcher)
    _threading.Thread(target=_cascade_reader_loop, daemon=True, name="CascadeReader").start()

# ─── CORS: только явно разрешённые origins ────────────────────────────────────
_PROD_ORIGINS = [
    "https://kadoclub.net",
    "https://www.kadoclub.net",
]
_DEV_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
# Localhost origins are only included in development (ENVIRONMENT != production)
_ENV = os.environ.get("ENVIRONMENT", "production")
_CORS_ORIGINS = _PROD_ORIGINS + (_DEV_ORIGINS if _ENV != "production" else [])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
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
    if request.url.path.startswith("/api/") and request.url.path != "/api/health":
        ip = _real_ip(request)
        if not _check_rate_limit(f"api:{ip}", window=60, max_hits=120):
            return Response("Rate limit exceeded", status_code=429)
    return await call_next(request)

# ─── Security headers middleware ──────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    is_webapp = request.url.path.rstrip("/") == "/webapp"

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"

    if is_webapp:
        # Telegram Mini App: allow telegram.org SDK + framing from Telegram clients
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://telegram.org; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "connect-src 'self' https://api.bybit.com wss://stream.bybit.com; "
            "img-src 'self' data: https:; "
            "frame-ancestors https://web.telegram.org https://*.telegram.org;"
        )
    else:
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com https://connect.facebook.net https://telegram.org; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' https://fonts.gstatic.com; "
            "connect-src 'self' wss://kadoclub.net ws://localhost:8000 ws://localhost:5173 "
            "https://api.bybit.com wss://stream.bybit.com "
            "https://cloudflareinsights.com https://www.facebook.com; "
            "img-src 'self' data: https:; "
            "frame-src https://s.tradingview.com; "
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
_otp_pending: dict[str, dict] = {}   # otp_token → {user_id, code, exp, attempts}
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
    stale_otp = [k for k, v in _otp_pending.items() if v["exp"] < now]
    for k in stale_otp:
        del _otp_pending[k]
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
import threading as _threading

_backtest_running  = False
_backtest_progress: dict = {"current": 0, "total": 0, "run_id": None}
_backtest_owner_id: Optional[int] = None   # None = admin (no ownership filter)

# ─── Liquidation cascade history ──────────────────────────────────────────────
_cascade_history: list = []   # останні 50 cascade сигналів
_cascade_lock = _threading.Lock()

_LIQ_COINS = ["BTC", "ETH", "SOL", "BNB", "XRP", "LINK", "AVAX", "ARB", "OP", "INJ", "SUI", "APT", "AAVE"]


def _cascade_reader_loop():
    """Фоновий daemon thread: читає liquidation_signal_queue кожні 5 сек."""
    global _cascade_history
    while True:
        if _LIQ_AVAILABLE and _liq_queue is not None:
            while True:
                try:
                    item = _liq_queue.get_nowait()
                    with _cascade_lock:
                        _cascade_history.append(item)
                        if len(_cascade_history) > 50:
                            _cascade_history = _cascade_history[-50:]
                except Exception:
                    break
        time.sleep(5)


def _token_user_id(token: str) -> Optional[int]:
    """Return user DB id from JWT, or None for admin opaque tokens."""
    payload = decode_token(token)
    if payload is None:
        return None
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError):
        return None


class BacktestStartRequest(BaseModel):
    days:    int        = 30
    coins:   list[str]  = []
    balance: float      = 10_000.0
    tp:      float      = 0.0
    sl:      float      = 0.0


class BillingCheckoutRequest(BaseModel):
    plan: str   # basic | pro | performance


# ─── Health check (public, no auth, no rate limit) ────────────────────────────
@app.get("/api/health")
async def health_check(db: Session = Depends(get_db)):
    from sqlalchemy import text
    try:
        db.execute(text("SELECT 1"))
        return {"status": "ok", "timestamp": datetime.utcnow().isoformat() + "Z"}
    except Exception as e:
        import logging; logging.getLogger("kado").error("health_check DB error: %s", e)
        raise HTTPException(status_code=503, detail="Database unavailable")


@app.post("/api/backtest/start")
async def start_backtest(body: BacktestStartRequest, token: str = Depends(require_any_auth)):
    global _backtest_running, _backtest_progress, _backtest_owner_id
    if _backtest_running:
        raise HTTPException(status_code=409, detail="Backtest already running")

    requester_id = _token_user_id(token)

    def _progress_cb(current: int, total: int, run_id: str):
        global _backtest_progress
        _backtest_progress = {"current": current, "total": total, "run_id": run_id}

    def _run_bg():
        global _backtest_running, _backtest_progress, _backtest_owner_id
        _backtest_owner_id = requester_id
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
            # tag saved result with owner so future queries can filter by user
            if requester_id is not None:
                _run_id = _backtest_progress.get("run_id")
                if _run_id:
                    _path = os.path.join(BACKTEST_DIR, f"{_run_id}.json")
                    try:
                        with open(_path, "r+", encoding="utf-8") as _f:
                            _data = json.load(_f)
                            _data["user_id"] = requester_id
                            _f.seek(0); json.dump(_data, _f, indent=2, ensure_ascii=False); _f.truncate()
                    except Exception:
                        pass
        except Exception as _e:
            print(f"[backtest] Error: {_e}")
        finally:
            _backtest_running = False
            _backtest_owner_id = None

    _bt_thread.Thread(target=_run_bg, daemon=True).start()
    return {"ok": True}


@app.get("/api/backtest/status")
async def backtest_status(token: str = Depends(require_any_auth)):
    requester_id = _token_user_id(token)
    # admin (None) sees any run; user only sees their own run
    if requester_id is not None and _backtest_owner_id is not None and requester_id != _backtest_owner_id:
        return {"running": False, "progress": {"current": 0, "total": 0, "run_id": None}}
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
    email: EmailStr
    username: str
    password: str
    referral_source: str = ""
    ref_code: str = ""

class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str

class UpdateProfileRequest(BaseModel):
    tg_chat_id: str = ""

class ApiKeyRequest(BaseModel):
    api_key: str
    secret: str
    is_demo: bool = False

def _db_retry(db: Session, query_fn, retries: int = 3):
    """Run a DB query with retry on transient SQLite OperationalError.

    Multi-process SQLite (8+ services share one file) occasionally throws
    'disk I/O error' / 'database is locked' under write contention. Retry with
    exponential backoff to ride out the lock.
    """
    import sqlalchemy
    delay = 0.05
    for attempt in range(retries):
        try:
            return query_fn()
        except sqlalchemy.exc.OperationalError as e:
            if attempt == retries - 1:
                raise
            try:
                db.rollback()
            except Exception:
                pass
            time.sleep(delay)
            delay *= 2


def _get_user_from_token(token: str, db: Session):
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("jti") and payload["jti"] in _revoked_jtis:
        raise HTTPException(status_code=401, detail="Token revoked — please login again")
    user = _db_retry(db, lambda: db.query(User).filter(User.id == int(payload["sub"])).first())
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user

@app.post("/api/users/register")
async def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    ip = _real_ip(request)
    if not _check_rate_limit(ip, window=3600, max_hits=5):
        raise HTTPException(status_code=429, detail="Too many registrations. Wait 1h.")
    # Username: 3-32 chars, alphanumeric + underscore only
    if not re.match(r'^[A-Za-z0-9_]{3,32}$', body.username):
        raise HTTPException(status_code=400, detail="Username must be 3-32 characters (letters, digits, underscore only)")
    # ref_code: if provided must match KADO-XXXXXX format exactly
    incoming_code_raw = (body.ref_code or "").strip().upper()
    if incoming_code_raw and not re.match(r'^KADO-[A-Z0-9]{6}$', incoming_code_raw):
        raise HTTPException(status_code=400, detail="Invalid referral code format")
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    # Case-insensitive uniqueness — block 'John' colliding with 'john' for impersonation safety
    from sqlalchemy import func
    if db.query(User).filter(func.lower(User.username) == body.username.lower()).first():
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
    def _make_ref_code(db):
        chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        for _ in range(20):
            code = 'KADO-' + ''.join(secrets.choice(chars) for _ in range(6))
            if not db.query(User).filter(User.ref_code == code).first():
                return code
        return 'KADO-' + secrets.token_hex(3).upper()

    referred_by_id = None
    if incoming_code_raw:
        referrer = db.query(User).filter(User.ref_code == incoming_code_raw).first()
        if referrer:
            referred_by_id = referrer.id
    user = User(
        email=body.email,
        username=body.username,
        password_hash=hash_password(body.password[:72]),  # bcrypt 72-byte limit — match reset-password
        email_verified=False,
        email_verify_token=verify_token_hash,
        ref_code=_make_ref_code(db),
        referred_by_id=referred_by_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    loop = asyncio.get_running_loop()
    loop.run_in_executor(None, send_verification_email, body.email, verify_token)
    loop.run_in_executor(None, send_welcome_email, body.email, body.username)
    token = create_token(user.id, user.email)
    return {"token": token, "user": {"id": user.id, "email": user.email, "username": user.username, "email_verified": False, "onboarding_completed": False}}

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
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    password: str

@app.post("/api/users/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, request: Request, db: Session = Depends(get_db)):
    ip = _real_ip(request)
    if not _check_rate_limit(f"reset:{ip}", window=3600, max_hits=5):
        raise HTTPException(status_code=429, detail="Too many requests. Please wait 1 hour.")
    user = db.query(User).filter(User.email == body.email).first()
    if user:
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        user.password_reset_token   = token_hash
        user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()
        from utils.email import send_password_reset_email
        asyncio.get_running_loop().run_in_executor(None, send_password_reset_email, user.email, token)
    return {"ok": True, "message": "If this email is registered, a reset link has been sent."}


@app.post("/api/users/reset-password")
async def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if not re.search(r'[A-Z]', body.password):
        raise HTTPException(status_code=400, detail="Password must contain at least one uppercase letter")
    if not re.search(r'[0-9]', body.password):
        raise HTTPException(status_code=400, detail="Password must contain at least one number")
    if not re.search(r'[^A-Za-z0-9]', body.password):
        raise HTTPException(status_code=400, detail="Password must contain at least one special character")
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    user = db.query(User).filter(User.password_reset_token == token_hash).first()
    if not user or not user.password_reset_expires:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")
    if datetime.now(timezone.utc) > user.password_reset_expires.replace(tzinfo=timezone.utc):
        raise HTTPException(status_code=400, detail="Reset link expired — please request a new one")
    user.password_hash           = hash_password(body.password[:72])
    user.password_reset_token    = None
    user.password_reset_expires  = None
    db.commit()
    return {"ok": True, "message": "Password changed successfully"}


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
    # Note: email_verified is NOT required to login — UserDashboard shows a "Verify email"
    # banner for unverified users, and sensitive actions can require verification separately.
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    if user.totp_enabled:
        partial = secrets.token_hex(16)
        _2fa_pending[partial] = {"user_id": user.id, "exp": time.time() + 300, "attempts": 0}
        return {"requires_2fa": True, "partial_token": partial}
    # Email OTP — only if SMTP is configured; otherwise issue JWT directly
    if _smtp_enabled():
        otp_token = secrets.token_hex(24)
        code = f"{secrets.randbelow(1000000):06d}"
        _otp_pending[otp_token] = {
            "user_id": user.id,
            "code": code,
            "exp": time.time() + 300,
            "attempts": 0,
            "ip": ip,
        }
        asyncio.get_running_loop().run_in_executor(None, send_login_otp_email, user.email, code)
        return {"requires_otp": True, "otp_token": otp_token}
    token = create_token(user.id, user.email)
    return {"token": token, "user": {
        "id": user.id, "email": user.email, "username": user.username,
        "email_verified": bool(user.email_verified), "totp_enabled": bool(user.totp_enabled),
    }}


class OtpResendRequest(BaseModel):
    otp_token: str

@app.post("/api/users/resend-otp")
async def resend_otp(body: OtpResendRequest, request: Request, db: Session = Depends(get_db)):
    ip = _real_ip(request)
    if not _check_rate_limit(f"resend_otp:{ip}", window=60, max_hits=3):
        raise HTTPException(status_code=429, detail="Too many resend attempts. Wait 60s.")
    _purge_expired()
    entry = _otp_pending.get(body.otp_token)
    if not entry or time.time() > entry["exp"]:
        raise HTTPException(status_code=400, detail="Session expired. Please login again.")
    new_code = f"{secrets.randbelow(1000000):06d}"
    entry["code"] = new_code
    entry["exp"]  = time.time() + 300
    entry["attempts"] = 0
    user = db.query(User).filter(User.id == entry["user_id"]).first()
    if user:
        asyncio.get_running_loop().run_in_executor(None, send_login_otp_email, user.email, new_code)
    return {"ok": True}


class OtpVerifyRequest(BaseModel):
    otp_token: str
    code: str


@app.post("/api/users/verify-otp")
async def verify_otp(body: OtpVerifyRequest, request: Request, db: Session = Depends(get_db)):
    ip = _real_ip(request)
    if not _check_rate_limit(f"otp:{ip}", window=60, max_hits=10):
        raise HTTPException(status_code=429, detail="Too many attempts. Wait 60s.")
    _purge_expired()
    entry = _otp_pending.get(body.otp_token)
    if not entry or time.time() > entry["exp"]:
        _otp_pending.pop(body.otp_token, None)
        raise HTTPException(status_code=401, detail="Session expired. Please login again.")
    if entry["attempts"] >= 5:
        _otp_pending.pop(body.otp_token, None)
        raise HTTPException(status_code=401, detail="Too many incorrect attempts. Please login again.")
    if not secrets.compare_digest(body.code.strip(), entry["code"]):
        entry["attempts"] += 1
        raise HTTPException(status_code=401, detail="Invalid code")
    # Code correct — consume entry and issue JWT
    _otp_pending.pop(body.otp_token, None)
    user = db.query(User).filter(User.id == entry["user_id"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")
    token = create_token(user.id, user.email)
    from utils.email import send_login_notification_email
    asyncio.get_running_loop().run_in_executor(None, send_login_notification_email, user.email, ip)
    return {"token": token, "user": {"id": user.id, "email": user.email, "username": user.username, "plan": user.plan, "subscribed": user.is_pro, "email_verified": bool(user.email_verified), "totp_enabled": bool(user.totp_enabled)}}


@app.get("/api/users/me")
async def get_me(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    user = _get_user_from_token(credentials.credentials, db)
    sub = user.subscription
    key_rows = [k for k in user.api_keys if k.exchange == "bybit"]
    live_key = next((k for k in key_rows if not k.is_demo), None)
    demo_key = next((k for k in key_rows if k.is_demo), None)
    display_key = live_key or demo_key
    def _mask(enc_key):
        try:
            k = decrypt_field(enc_key)
            if not k or len(k) < 8:
                return '••••••••••••••••••••'
            return k[:6] + '••••••••••••' + k[-4:]
        except Exception:
            return '••••••••••••••••••••'
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "tg_chat_id": user.tg_chat_id,
        "tg_username": user.tg_username or "",
        "tg_connected": bool(user.tg_chat_id),
        "has_api_keys": len(key_rows) > 0,
        "has_demo_key": demo_key is not None,
        "has_live_key": live_key is not None,
        "api_key_demo": display_key.is_demo if display_key else False,
        "bybit_api_key_masked": _mask(display_key.api_key_enc) if display_key else None,
        "bybit_demo_key_masked": _mask(demo_key.api_key_enc) if demo_key else None,
        "bybit_live_key_masked": _mask(live_key.api_key_enc) if live_key else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "email_verified": bool(user.email_verified),
        "totp_enabled": bool(user.totp_enabled),
        "onboarding_completed": bool(user.onboarding_completed),
        "onboarding_step": user.onboarding_step or 0,
        "terms_accepted_at": user.terms_accepted_at.isoformat() if user.terms_accepted_at else None,
    }

@app.put("/api/users/me")
async def update_me(body: UpdateProfileRequest, credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    user = _get_user_from_token(credentials.credentials, db)
    if body.tg_chat_id:
        # Telegram chat IDs are numeric strings (possibly negative for groups)
        if not re.match(r'^-?\d{1,20}$', body.tg_chat_id.strip()):
            raise HTTPException(status_code=400, detail="Invalid tg_chat_id format")
        user.tg_chat_id = body.tg_chat_id.strip()
    db.commit()
    return {"ok": True}


class ChangePasswordRequest(BaseModel):
    old_password: Annotated[str, Field(min_length=1, max_length=128)]
    new_password: Annotated[str, Field(min_length=8, max_length=128)]

@app.post("/api/users/change-password")
async def change_password(body: ChangePasswordRequest, request: Request, credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    ip = _real_ip(request)
    if not _check_rate_limit(f"chpw:{ip}", window=300, max_hits=5):
        raise HTTPException(status_code=429, detail="Too many attempts")
    user = _get_user_from_token(credentials.credentials, db)
    if not verify_password(body.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Incorrect current password")
    user.password_hash = hash_password(body.new_password[:72])
    db.commit()
    return {"ok": True}


@app.get("/api/users/mt5-keys")
async def get_mt5_keys(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    user = _get_user_from_token(credentials.credentials, db)
    row = db.query(UserMt5Key).filter_by(user_id=user.id).first()
    if not row:
        return {"configured": False}
    login = decrypt_field(row.login_enc)
    masked_login = (login[:2] + "****" + login[-2:]) if len(login) > 4 else "****"
    return {"configured": True, "login": masked_login, "server": row.server}


class Mt5KeyRequest(BaseModel):
    login:    Annotated[str, Field(min_length=1, max_length=20, pattern=r'^\d+$')]
    password: Annotated[str, Field(min_length=1, max_length=128)]
    server:   Annotated[str, Field(min_length=3, max_length=100, pattern=r'^[A-Za-z0-9.\-]+(:\d{1,5})?$')]

@app.post("/api/users/mt5-keys")
async def save_mt5_keys(body: Mt5KeyRequest, credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    user = _get_user_from_token(credentials.credentials, db)
    login    = body.login.strip()
    password = body.password.strip()
    server   = body.server.strip()
    if not login or not password or not server:
        raise HTTPException(status_code=400, detail="All fields required")
    row = db.query(UserMt5Key).filter_by(user_id=user.id).first()
    if row:
        row.login_enc    = encrypt_field(login)
        row.password_enc = encrypt_field(password)
        row.server       = server
    else:
        db.add(UserMt5Key(user_id=user.id, login_enc=encrypt_field(login), password_enc=encrypt_field(password), server=server))
    db.commit()
    return {"ok": True}


@app.delete("/api/users/mt5-keys")
async def delete_mt5_keys(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    user = _get_user_from_token(credentials.credentials, db)
    db.query(UserMt5Key).filter_by(user_id=user.id).delete()
    db.commit()
    return {"ok": True}


# ─── GDPR endpoints ──────────────────────────────────────────────────────────
@app.delete("/api/users/me")
async def delete_account(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """GDPR: right to erasure — permanently delete account and all personal data."""
    user = _get_user_from_token(credentials.credentials, db)

    # Stop active grid/bot threads
    try:
        dispatcher_stop_user(user.id)
    except Exception:
        pass

    # Delete API keys (encrypted — removing them destroys access)
    db.query(UserApiKey).filter_by(user_id=user.id).delete()

    # Anonymise trade history (keep for 2yr tax compliance, remove PII link)
    db.query(UserTrade).filter_by(user_id=user.id).update({"user_id": None})
    db.query(MonthlyPnl).filter_by(user_id=user.id).update({"user_id": None})
    db.query(WeeklyPnl).filter_by(user_id=user.id).update({"user_id": None})

    # Delete personal data
    db.query(ReferralEarning).filter_by(referral_id=user.id).delete()
    db.query(TgLinkToken).filter_by(user_id=user.id).delete()
    db.query(AuditLog).filter_by(user_id=user.id).delete()

    db.delete(user)
    db.commit()
    return {"ok": True, "message": "Account deleted. Personal data will be fully purged within 30 days."}


@app.get("/api/users/me/data")
async def export_my_data(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """GDPR: right to data portability — export all personal data as JSON."""
    user = _get_user_from_token(credentials.credentials, db)

    trades = db.query(UserTrade).filter_by(user_id=user.id).all()
    keys   = db.query(UserApiKey).filter_by(user_id=user.id).all()

    return {
        "export_date": datetime.now(timezone.utc).isoformat(),
        "account": {
            "email":      user.email,
            "username":   user.username,
            "plan":       user.plan,
            "created_at": user.created_at.isoformat() if user.created_at else None,
            "tg_chat_id": user.tg_chat_id,
            "ref_code":   user.ref_code,
        },
        "api_keys": [
            {
                "exchange":   k.exchange,
                "is_demo": k.is_demo,
                "created_at": k.created_at.isoformat() if k.created_at else None,
                "note":       "Key values are encrypted and not included in this export for security.",
            }
            for k in keys
        ],
        "trades": [
            {
                "symbol":    t.symbol,
                "side":      t.side,
                "pnl_usdt":  t.pnl_usdt,
                "source":    t.source,
                "opened_at": t.opened_at.isoformat() if t.opened_at else None,
                "closed_at": t.closed_at.isoformat() if t.closed_at else None,
            }
            for t in trades
        ],
    }


# ─── Onboarding ──────────────────────────────────────────────────────────────
class OnboardingStepRequest(BaseModel):
    step: int

@app.post("/api/onboarding/step")
async def update_onboarding_step(
    body: OnboardingStepRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    user = _get_user_from_token(credentials.credentials, db)
    user.onboarding_step = max(user.onboarding_step or 0, body.step)
    if body.step >= 3:
        user.onboarding_completed = True
    db.commit()
    return {"ok": True, "onboarding_completed": bool(user.onboarding_completed), "onboarding_step": user.onboarding_step}


@app.post("/api/users/accept-terms")
async def accept_terms(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    user = _get_user_from_token(credentials.credentials, db)
    if not user.terms_accepted_at:
        user.terms_accepted_at = datetime.now(timezone.utc)
        db.commit()
    return {"ok": True, "terms_accepted_at": user.terms_accepted_at.isoformat()}


# ─── Telegram bot linking (deep-link one-click flow) ─────────────────────────
@app.post("/api/tg/link-token")
async def create_tg_link_token(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """
    Generate a one-time token to link the user's Telegram account via deep-link.
    Returns: { url: "https://t.me/<bot>?start=<token>", expires_at: iso }
    """
    from config.settings import USERBOT_USERNAME, USERBOT_TOKEN
    if not USERBOT_TOKEN:
        raise HTTPException(status_code=503, detail="Telegram bot is not configured")

    user = _get_user_from_token(credentials.credentials, db)
    # Invalidate any prior unused tokens for this user
    db.query(TgLinkToken).filter(
        TgLinkToken.user_id == user.id,
        TgLinkToken.used_at.is_(None),
    ).update({"used_at": datetime.utcnow()}, synchronize_session=False)

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(minutes=10)
    db.add(TgLinkToken(user_id=user.id, token=token, expires_at=expires_at))
    db.commit()

    return {
        "url": f"https://t.me/{USERBOT_USERNAME}?start={token}",
        "expires_at": expires_at.replace(tzinfo=timezone.utc).isoformat(),
    }


@app.post("/api/tg/disconnect")
async def disconnect_tg(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Detach Telegram from this user account."""
    user = _get_user_from_token(credentials.credentials, db)
    user.tg_chat_id = ""
    user.tg_username = ""
    db.commit()
    return {"ok": True}


@app.post("/api/users/keys")
async def save_api_keys(body: ApiKeyRequest, credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Save or replace the user's Bybit API key (stored encrypted). Validates key before saving."""
    user = _get_user_from_token(credentials.credentials, db)
    if not body.api_key or not body.secret:
        raise HTTPException(status_code=400, detail="api_key and secret are required")

    # Validate key against Bybit API before storing
    try:
        test_ex = ccxt.bybit({
            'apiKey':        body.api_key,
            'secret':        body.secret,
            'enableRateLimit': True,
            'options':       {'defaultType': 'linear', 'recvWindow': 10000},
        })
        test_ex.has['fetchCurrencies'] = False
        if body.is_demo:
            test_ex.urls['api'] = test_ex.urls['demotrading']
        _bybit_positions(test_ex)   # raises on invalid key; empty list is fine
    except Exception as _e:
        msg = str(_e)
        # Extract just the Bybit error message if buried in ccxt output
        import re as _re
        m = _re.search(r'"retMsg"\s*:\s*"([^"]+)"', msg)
        clean = m.group(1) if m else (msg[:120] if msg else "check key, secret and permissions")
        raise HTTPException(status_code=400, detail=f"Bybit rejected the key: {clean}")

    from sqlalchemy.exc import IntegrityError
    try:
        key_row = (
            db.query(UserApiKey)
            .filter_by(user_id=user.id, exchange="bybit", is_demo=body.is_demo)
            .with_for_update()
            .first()
        )
        if key_row:
            key_row.api_key_enc   = encrypt_field(body.api_key)
            key_row.secret_enc    = encrypt_field(body.secret)
            key_row.is_demo       = body.is_demo
            key_row.last_verified = datetime.utcnow()
        else:
            key_row = UserApiKey(
                user_id       = user.id,
                exchange      = "bybit",
                api_key_enc   = encrypt_field(body.api_key),
                secret_enc    = encrypt_field(body.secret),
                is_demo       = body.is_demo,
                last_verified = datetime.utcnow(),
            )
            db.add(key_row)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not save keys, try again")
    asyncio.get_running_loop().run_in_executor(None, dispatcher_sync_user, user.id)
    asyncio.get_running_loop().run_in_executor(None, _bybit_sync_user, user.id)
    return {"ok": True}


@app.delete("/api/users/keys")
async def delete_api_keys(is_demo: bool = Query(False), credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    user = _get_user_from_token(credentials.credentials, db)
    db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit", is_demo=is_demo).delete()
    db.commit()
    # Немедленно останавливаем боты
    asyncio.get_running_loop().run_in_executor(None, dispatcher_stop_user, user.id)
    return {"ok": True}


class RevealKeyRequest(BaseModel):
    password: str


@app.post("/api/users/keys/reveal")
async def reveal_api_keys(body: RevealKeyRequest, request: Request, credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    """Return masked api_key + partial secret after password re-verification.
    Secret is never returned in full — only first 6 and last 4 chars.
    """
    ip = _real_ip(request)
    if not _check_rate_limit(f"reveal:{ip}", window=300, max_hits=5):
        raise HTTPException(status_code=429, detail="Too many attempts. Wait 5 minutes.")
    user = _get_user_from_token(credentials.credentials, db)
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Wrong password")
    key_rows = db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit").all()
    key_row  = next((k for k in key_rows if not k.is_demo), key_rows[0] if key_rows else None)
    if not key_row:
        raise HTTPException(status_code=404, detail="No API keys saved")
    api_key = decrypt_field(key_row.api_key_enc)
    secret  = decrypt_field(key_row.secret_enc)
    masked_key    = (api_key[:6] + "•" * max(0, len(api_key) - 10) + api_key[-4:]) if len(api_key) > 10 else "•" * len(api_key)
    masked_secret = (secret[:6]  + "•" * max(0, len(secret)  - 10) + secret[-4:])  if len(secret)  > 10 else "•" * len(secret)
    try:
        ip_str = _real_ip(request) if hasattr(request, 'client') else "unknown"
        db.add(AuditLog(user_id=user.id, action="api_key_revealed", detail_enc=encrypt_field(ip_str)))
        db.commit()
    except Exception:
        db.rollback()
    return {"api_key": masked_key, "masked_secret": masked_secret}


# ──────────────────────────────────────────────────────────────────────────────
#  2FA endpoints
# ──────────────────────────────────────────────────────────────────────────────

class TotpVerifyRequest(BaseModel):
    code: str

class TotpLoginRequest(BaseModel):
    partial_token: str
    code: str

class TotpRecoverRequest(BaseModel):
    email: EmailStr
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
    return {"qr": f"data:image/png;base64,{qr_b64}"}

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
    if entry.get("attempts", 0) >= 5:
        _2fa_pending.pop(body.partial_token, None)
        raise HTTPException(status_code=401, detail="Too many attempts. Please login again.")
    user = db.query(User).filter(User.id == entry["user_id"]).first()
    if not user or not user.totp_secret:
        raise HTTPException(status_code=401, detail="User not found")
    if not pyotp.TOTP(decrypt_field(user.totp_secret)).verify(body.code, valid_window=1):
        entry["attempts"] = entry.get("attempts", 0) + 1
        raise HTTPException(status_code=400, detail="Invalid authenticator code")
    _2fa_pending.pop(body.partial_token, None)
    token = create_token(user.id, user.email)
    return {"token": token, "user": {"id": user.id, "email": user.email, "username": user.username, "email_verified": bool(user.email_verified), "totp_enabled": True}}


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
                 "email_verified": bool(user.email_verified)},
        "warning": f"{remaining} recovery codes remaining. Set up a new authenticator app.",
    }


# ══════════════════════════════════════════════════════════════════════════════
#  USER TRADES & PnL
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/users/trades")
async def get_user_trades(
    limit: int = Query(50, ge=1, le=5000),
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

    # Compute gross_pnl from UserTrade directly so bybit-imported trades are included.
    # MonthlyPnl table is only updated by saas_dispatcher, not by bybit_sync.
    raw_rows = (
        db.query(UserTrade)
        .filter(UserTrade.user_id == user.id, UserTrade.status == "closed")
        .all()
    )
    trade_rows = _filter_ghost_closes(_dedup_bybit_dupes(raw_rows))

    from collections import defaultdict
    monthly_gross: dict = defaultdict(float)
    for t in trade_rows:
        if not t.closed_at:
            continue
        key = (t.closed_at.year, t.closed_at.month)
        monthly_gross[key] += float(t.pnl_usdt or 0)

    # Load fee data from MonthlyPnl (set by saas_dispatcher for performance fee billing)
    fee_rows = (
        db.query(MonthlyPnl)
        .filter(MonthlyPnl.user_id == user.id)
        .all()
    )
    fee_map = {(r.year, r.month): r for r in fee_rows}

    result = []
    for (year, month), gross in sorted(monthly_gross.items(), reverse=True):
        fee_row = fee_map.get((year, month))
        perf_fee = float(fee_row.performance_fee) if fee_row else 0.0
        fee_paid = bool(fee_row.fee_paid) if fee_row else False
        gross_r  = round(gross, 8)
        result.append({
            "year":            year,
            "month":           month,
            "gross_pnl":       gross_r,
            "performance_fee": perf_fee,
            "net_pnl":         round(gross_r - perf_fee, 8),
            "fee_paid":        fee_paid,
        })

    return result[:12]




# NOTE: Bybit helpers consolidated into modules.bybit_client (2026-05-22).
# These local wrappers keep the existing function signatures + return shapes
# (incl. "symbol" stripped of "USDT") so callers don't need changes.
from modules.bybit_client import (
    build_from_key_row as _bc_build_from_key_row,
    get_balance as _bc_get_balance,
    get_positions as _bc_get_positions,
)


def _init_user_exchange(key_row):
    return _bc_build_from_key_row(key_row)


def _bybit_balance(ex):
    """USDT balance — wallet/equity/unrealized_pnl/usdt_free."""
    b = _bc_get_balance(ex)
    return {
        "wallet":         b["wallet"],
        "equity":         b["equity"],
        "unrealized_pnl": b["unrealized_pnl"],
        "usdt_free":      b["usdt_free"],
    }


def _bybit_positions(ex):
    """Open positions with legacy shape (symbol stripped of USDT)."""
    out = []
    for p in _bc_get_positions(ex):
        out.append({
            "symbol":         p["coin"],  # stripped — preserved for legacy callers
            "side":           p["side"],
            "entry_price":    p["entry_price"],
            "qty":            p["qty"],
            "unrealized_pnl": p["unrealized_pnl"],
            "pnl_pct":        p["pnl_pct"],
            "stop_loss":      p["stop_loss"],
            "take_profit":    p["take_profit"],
            "liq_price":      p["liq_price"],
            "mark_price":     p["mark_price"],
            "leverage":       p["leverage"],
        })
    return out


@app.get("/api/users/balance")
async def get_user_balance(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    user     = _get_user_from_token(credentials.credentials, db)
    key_rows = db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit").all()
    key_row  = next((k for k in key_rows if not k.is_demo), key_rows[0] if key_rows else None)
    if not key_row:
        raise HTTPException(status_code=404, detail="No API keys")
    ex = _init_user_exchange(key_row)
    if not ex:
        raise HTTPException(status_code=502, detail="Cannot connect to exchange")
    try:
        b = _bybit_balance(ex)
        return {"usdt_wallet": b["wallet"], "usdt_equity": b["equity"],
                "unrealized_pnl": b["unrealized_pnl"], "usdt_free": b["usdt_free"]}
    except Exception as e:
        import logging; logging.getLogger("kado").error("exchange error: %s", e)
        raise HTTPException(status_code=502, detail="Exchange request failed")


@app.get("/api/users/positions")
async def get_user_positions(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    user    = _get_user_from_token(credentials.credentials, db)
    key_rows = db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit").all()
    if not key_rows:
        raise HTTPException(status_code=404, detail="No API keys")
    key_row = next((k for k in key_rows if not k.is_demo), None) or key_rows[0]
    ex = _init_user_exchange(key_row)
    if not ex:
        raise HTTPException(status_code=502, detail="Cannot connect to exchange")
    try:
        return _bybit_positions(ex)
    except Exception as e:
        import logging; logging.getLogger("kado").error("positions error: %s", e)
        raise HTTPException(status_code=502, detail="Exchange request failed")


class ClosePositionRequest(BaseModel):
    symbol: Annotated[str, Field(pattern=r'^[A-Z0-9]{1,20}$')]

@app.post("/api/users/close-position")
async def close_user_position(
    body: ClosePositionRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    user     = _get_user_from_token(credentials.credentials, db)
    key_rows = db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit").all()
    key_row  = next((k for k in key_rows if not k.is_demo), key_rows[0] if key_rows else None)
    if not key_row:
        raise HTTPException(status_code=404, detail="No API keys")
    ex = _init_user_exchange(key_row)
    if not ex:
        raise HTTPException(status_code=502, detail="Cannot connect to exchange")
    try:
        positions = _bybit_positions(ex)
        p = next((x for x in positions if x["symbol"] == body.symbol), None)
        if not p:
            raise HTTPException(status_code=404, detail="Position not found")
        close_side = "sell" if p["side"] == "LONG" else "buy"
        market_id  = ex.market_id(f"{body.symbol}USDT")
        ex.private_post_v5_order_create({
            "category":   "linear",
            "symbol":     market_id,
            "side":       "Sell" if p["side"] == "LONG" else "Buy",
            "orderType":  "Market",
            "qty":        str(p["qty"]),
            "reduceOnly": True,
            "timeInForce": "IOC",
        })
        return {"ok": True, "symbol": body.symbol, "qty": p["qty"]}
    except HTTPException:
        raise
    except Exception as e:
        import logging; logging.getLogger("kado").error("exchange error: %s", e)
        raise HTTPException(status_code=502, detail="Exchange request failed")


@app.get("/api/users/open-orders")
async def get_user_open_orders(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    user     = _get_user_from_token(credentials.credentials, db)
    key_rows = db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit").all()
    key_row  = next((k for k in key_rows if not k.is_demo), key_rows[0] if key_rows else None)
    if not key_row:
        return []
    ex = _init_user_exchange(key_row)
    if not ex:
        return []
    try:
        raw   = ex.private_get_v5_order_realtime({"category": "linear", "settleCoin": "USDT", "limit": 50})
        items = raw.get("result", {}).get("list", [])
        return [
            {
                "order_id":    o.get("orderId", ""),
                "symbol":      o.get("symbol", "").replace("USDT", ""),
                "side":        "LONG" if o.get("side") == "Buy" else "SHORT",
                "order_type":  o.get("orderType", ""),
                "qty":         float(o.get("qty") or 0),
                "price":       float(o.get("price") or 0),
                "filled_qty":  float(o.get("cumExecQty") or 0),
                "status":      o.get("orderStatus", ""),
                "created_at":  o.get("createdTime", ""),
                "reduce_only": bool(o.get("reduceOnly", False)),
            }
            for o in items
        ]
    except Exception:
        return []


class CancelOrderRequest(BaseModel):
    order_id: Annotated[str, Field(max_length=64, pattern=r'^[A-Za-z0-9\-]+$')]
    symbol: Annotated[str, Field(pattern=r'^[A-Z0-9]{1,20}$')]

@app.post("/api/users/cancel-order")
async def cancel_user_order(
    body: CancelOrderRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    user     = _get_user_from_token(credentials.credentials, db)
    key_rows = db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit").all()
    key_row  = next((k for k in key_rows if not k.is_demo), key_rows[0] if key_rows else None)
    if not key_row:
        raise HTTPException(status_code=404, detail="No API keys")
    ex = _init_user_exchange(key_row)
    if not ex:
        raise HTTPException(status_code=502, detail="Cannot connect to exchange")
    try:
        ex.private_post_v5_order_cancel({
            "category": "linear",
            "symbol":   f"{body.symbol}USDT",
            "orderId":  body.order_id,
        })
        return {"ok": True}
    except Exception as e:
        import logging; logging.getLogger("kado").error("exchange error: %s", e)
        raise HTTPException(status_code=502, detail="Exchange request failed")


@app.get("/api/users/bot-heartbeat")
async def get_bot_heartbeat(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    user = _get_user_from_token(credentials.credentials, db)
    from sqlalchemy import func as _sf2
    rows = (
        db.query(UserTrade.source, _sf2.max(UserTrade.opened_at).label("last_open"))
        .filter(UserTrade.user_id == user.id)
        .group_by(UserTrade.source)
        .all()
    )
    now = datetime.utcnow()
    result = {}
    for source, last_open in rows:
        if last_open:
            diff_min = int((now - last_open).total_seconds() / 60)
            result[source] = {"last_trade_min_ago": diff_min, "last_trade_at": last_open.isoformat()}
    return result


_BOT_LABELS = {
    "news":        "Signal Bot",
    "signal":      "Signal Bot",
    "grid":        "Grid Bot",
    "whale":       "Whale Tracker",
    "liq_cascade": "Liq Cascade",
    "cascade":     "Cascade Bot",
    
    "sweep":       "Liq Sweep",
    "ob":          "Order Block",
    "orderblock":  "Order Block",
    "sniper":      "DEX Sniper",
    "bybit":       "Bybit Import",
    "macro":       "Macro Forex",
    "dex":         "DEX Bot",
}

@app.get("/api/users/plan-features")
async def get_plan_features(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """Return the list of bot IDs this user has access to — all bots, no plan gate."""
    _get_user_from_token(credentials.credentials, db)
    all_bots = ["news", "grid", "whale",
                "cascade", "sweep", "ob", "sniper"]
    return {"bots": sorted(all_bots)}


@app.get("/api/users/bot-summary")
async def get_user_bot_summary(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    user = _get_user_from_token(credentials.credentials, db)

    raw_rows = (
        db.query(UserTrade)
        .filter(UserTrade.user_id == user.id, UserTrade.status == "closed")
        .all()
    )
    deduped = _filter_ghost_closes(_dedup_bybit_dupes(raw_rows))

    by_source: dict = {}
    for t in deduped:
        src = t.source or "unknown"
        if src not in by_source:
            by_source[src] = {"n": 0, "pnl": 0.0, "wins": 0}
        pnl_val = float(t.pnl_usdt or 0)
        by_source[src]["n"]    += 1
        by_source[src]["pnl"]  += pnl_val
        by_source[src]["wins"] += 1 if pnl_val > 0 else 0

    bots = []
    total_realized = 0.0
    for source, agg in by_source.items():
        n   = agg["n"]
        pnl = agg["pnl"]
        wr  = round(agg["wins"] / n * 100, 1) if n else 0
        total_realized += pnl
        bots.append({
            "source":   source,
            "label":    _BOT_LABELS.get(source, source),
            "trades":   n,
            "pnl":      round(pnl, 2),
            "win_rate": wr,
        })
    bots.sort(key=lambda x: x["pnl"], reverse=True)

    balance   = None
    positions = []
    key_rows  = db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit").all()
    key_row   = next((k for k in key_rows if not k.is_demo), None) or (key_rows[0] if key_rows else None)
    has_key   = len(key_rows) > 0
    if key_row:
        ex = _init_user_exchange(key_row)
        if ex:
            try:
                balance = _bybit_balance(ex)
            except Exception as _be:
                import logging; logging.getLogger("kado").warning("bot-summary balance error user=%s: %s", user.id, _be)
            try:
                positions = _bybit_positions(ex)
            except Exception as _pe:
                import logging; logging.getLogger("kado").warning("bot-summary positions error user=%s: %s", user.id, _pe)

    total_unrealized = sum(p["unrealized_pnl"] for p in positions)
    return {
        "has_key":          has_key,
        "balance":          balance,
        "positions":        positions,
        "bots":             bots,
        "total_realized":   round(total_realized, 2),
        "total_unrealized": round(total_unrealized, 2),
        "total":            round(total_realized + total_unrealized, 2),
    }


def _dedup_bybit_dupes(rows):
    """
    Remove bybit_sync duplicates: rows where source='bybit' and the same
    (coin, round_pnl) already exists from a bot-recorded source.

    bybit_sync re-imports ALL closed positions from Bybit including those the
    bot already recorded. This causes double-counting in analytics.

    Also fixes bybit side display: bybit_sync stores the CLOSING order side
    (Sell for closing a Long), so side=SHORT when the position was actually LONG.
    We invert it here so the display is correct.
    """
    from bybit_sync import _normalize_coin as _nc
    bot_keys: set = set()
    for t in rows:
        if t.source != "bybit":
            coin = _nc(t.symbol or "")
            key  = (coin, round(float(t.pnl_usdt or 0), 2))
            bot_keys.add(key)

    result = []
    for t in rows:
        if t.source == "bybit":
            coin = _nc(t.symbol or "")
            key  = (coin, round(float(t.pnl_usdt or 0), 2))
            if key in bot_keys:
                continue  # duplicate of a bot-recorded trade
        result.append(t)

    # Second pass: remove bot-source rows where the same Bybit close event was
    # incorrectly matched to multiple open trades (identical exit_price + pnl +
    # same-day close). Keeps the first row encountered (newest by closed_at desc).
    seen_close_keys: set = set()
    deduped = []
    for t in result:
        if t.source != "bybit" and t.exit_price is not None and t.closed_at is not None:
            coin      = _nc(t.symbol or "")
            close_day = t.closed_at.date()
            key       = (coin, round(float(t.exit_price), 2), round(float(t.pnl_usdt or 0), 2), close_day)
            if key in seen_close_keys:
                continue
            seen_close_keys.add(key)
        deduped.append(t)
    return deduped


def _filter_ghost_closes(rows):
    """
    Remove ghost-close records from stats: trades where position_closer gave up
    waiting for Bybit PnL and closed with pnl=0 / exit=entry.
    Identified by: pnl_usdt=0 AND exit_price ≈ entry_price (within 0.01%).
    """
    result = []
    for t in rows:
        pnl = float(t.pnl_usdt or 0)
        ep  = float(t.exit_price or 0)
        enp = float(t.entry_price or 0)
        if pnl == 0 and ep > 0 and enp > 0 and abs(ep - enp) / enp < 0.0001:
            continue
        result.append(t)
    return result


def _fix_bybit_side(side: str | None, source: str | None) -> str | None:
    """bybit_sync records the position direction directly from Bybit closed-pnl
    (Buy→LONG, Sell→SHORT). No inversion needed."""
    return side


def _fetch_all_closed_pnl(ex, max_pages: int = 20):
    """Fetch all closed PnL from Bybit via cursor pagination."""
    all_items = []
    cursor = ""
    for _ in range(max_pages):
        params = {"category": "linear", "limit": 200}
        if cursor:
            params["cursor"] = cursor
        raw    = ex.private_get_v5_position_closed_pnl(params)
        result = raw.get("result", {})
        items  = result.get("list", [])
        all_items.extend(items)
        cursor = result.get("nextPageCursor", "")
        if not cursor or not items:
            break
    return all_items


@app.get("/api/users/closed-pnl")
async def get_user_closed_pnl(
    days: int = 30,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    user    = _get_user_from_token(credentials.credentials, db)
    has_key = db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit").first() is not None
    _EMPTY = {"trades": [], "total_pnl": 0.0, "total_trades": 0, "wins": 0, "losses": 0, "win_rate": 0.0}
    if not has_key:
        return _EMPTY

    cutoff = datetime.utcnow() - timedelta(days=days) if days > 0 else None
    q = db.query(UserTrade).filter(UserTrade.user_id == user.id, UserTrade.status == "closed")
    if cutoff is not None:
        q = q.filter(UserTrade.closed_at >= cutoff)
    rows = _filter_ghost_closes(_dedup_bybit_dupes(q.order_by(UserTrade.closed_at.desc()).all()))

    trades     = []
    total_pnl  = 0.0
    total_wins = 0
    from bybit_sync import _normalize_coin
    for t in rows:
        pnl = float(t.pnl_usdt or 0)
        total_pnl += pnl
        if pnl > 0:
            total_wins += 1
        closed_ms = int(t.closed_at.timestamp() * 1000) if t.closed_at else 0
        opened_ms = int(t.opened_at.timestamp() * 1000) if t.opened_at else closed_ms
        trades.append({
            "symbol":      _normalize_coin(t.symbol or ""),
            "side":        _fix_bybit_side(t.side, t.source) or "",
            "qty":         float(t.qty or 0),
            "entry_price": float(t.entry_price or 0),
            "exit_price":  float(t.exit_price or 0) if t.exit_price else None,
            "pnl":         round(pnl, 2),
            "opened_at":   str(opened_ms),
            "closed_at":   str(closed_ms),
            "source":      t.source or "bybit",
        })
    return {
        "trades":       trades,
        "total_pnl":    round(total_pnl, 2),
        "total_trades": len(trades),
        "wins":         total_wins,
        "losses":       len(trades) - total_wins,
        "win_rate":     round(total_wins / len(trades) * 100, 1) if trades else 0,
    }


@app.get("/api/users/analytics")
async def get_user_analytics(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    user    = _get_user_from_token(credentials.credentials, db)
    has_key = db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit").first() is not None

    def _empty():
        return {
            "has_key":   has_key,
            "summary":   {"total_trades": 0, "total_pnl": 0.0, "wins": 0, "losses": 0, "win_rate": 0.0},
            "daily":     [], "by_coin": [], "by_source": [], "best": [], "worst": [],
        }

    raw_rows = _db_retry(db, lambda: (
        db.query(UserTrade)
        .filter(UserTrade.user_id == user.id, UserTrade.status == "closed")
        .all()
    ))
    rows = _filter_ghost_closes(_dedup_bybit_dupes(raw_rows))
    if not rows:
        return _empty()

    from bybit_sync import _normalize_coin
    cutoff_30d  = datetime.utcnow() - timedelta(days=30)
    total_pnl   = 0.0
    wins        = 0
    coin_stats   = defaultdict(lambda: {"trades": 0, "pnl": 0.0, "wins": 0, "win_pnls": [], "loss_pnls": []})
    source_stats = defaultdict(lambda: {"trades": 0, "pnl": 0.0, "wins": 0, "win_pnls": [], "loss_pnls": []})
    daily_stats  = defaultdict(lambda: {"pnl": 0.0, "trades": 0})
    trade_list   = []

    for t in rows:
        pnl    = float(t.pnl_usdt or 0)
        coin   = _normalize_coin(t.symbol or "")
        src    = t.source or "other"
        side   = _fix_bybit_side(t.side, t.source) or ""
        closed = t.closed_at  # naive UTC from SQLite

        total_pnl += pnl
        if pnl > 0:
            wins += 1

        cs = coin_stats[coin]
        cs["trades"] += 1
        cs["pnl"]    += pnl
        if pnl > 0:
            cs["wins"] += 1; cs["win_pnls"].append(pnl)
        else:
            cs["loss_pnls"].append(pnl)

        ss = source_stats[src]
        ss["trades"] += 1
        ss["pnl"]    += pnl
        if pnl > 0:
            ss["wins"] += 1; ss["win_pnls"].append(pnl)
        else:
            ss["loss_pnls"].append(pnl)

        if closed and closed >= cutoff_30d:
            daily_stats[closed.strftime("%Y-%m-%d")]["pnl"]    += pnl
            daily_stats[closed.strftime("%Y-%m-%d")]["trades"] += 1

        closed_ms    = int(closed.timestamp() * 1000) if closed else 0
        opened_at    = t.opened_at
        duration_min = round((closed - opened_at).total_seconds() / 60) if closed and opened_at else None
        result       = "WIN" if pnl > 0 else ("LOSS" if pnl < 0 else "BE")
        trade_list.append({
            "coin":         coin,
            "pnl":          round(pnl, 2),
            "closed_at":    str(closed_ms),
            "side":         side,
            "source":       src,
            "result":       result,
            "duration_min": duration_min,
        })

    def _agg(stats_dict):
        return sorted([{
            "source":   k,
            "label":    _BOT_LABELS.get(k, k),
            "trades":   v["trades"],
            "pnl":      round(v["pnl"], 2),
            "wins":     v["wins"],
            "avg_win":  round(sum(v["win_pnls"]) / len(v["win_pnls"]), 2) if v["win_pnls"] else 0,
            "avg_loss": round(sum(v["loss_pnls"]) / len(v["loss_pnls"]), 2) if v["loss_pnls"] else 0,
        } for k, v in stats_dict.items()], key=lambda x: x["pnl"], reverse=True)

    def _agg_coin(stats_dict):
        return sorted([{
            "coin":     k,
            "trades":   v["trades"],
            "pnl":      round(v["pnl"], 2),
            "wins":     v["wins"],
            "avg_win":  round(sum(v["win_pnls"]) / len(v["win_pnls"]), 2) if v["win_pnls"] else 0,
            "avg_loss": round(sum(v["loss_pnls"]) / len(v["loss_pnls"]), 2) if v["loss_pnls"] else 0,
        } for k, v in stats_dict.items()], key=lambda x: x["pnl"], reverse=True)

    n      = len(rows)
    daily  = sorted([{"date": d, "pnl": round(v["pnl"], 2), "trades": v["trades"]}
                     for d, v in daily_stats.items()], key=lambda x: x["date"])
    by_date = sorted(trade_list, key=lambda x: x["pnl"], reverse=True)

    return {
        "has_key":   True,
        "summary":   {
            "total_trades": n,
            "total_pnl":    round(total_pnl, 2),
            "wins":         wins,
            "losses":       n - wins,
            "win_rate":     round(wins / n * 100, 1),
        },
        "daily":     daily,
        "by_coin":   _agg_coin(coin_stats),
        "by_source": _agg(source_stats),
        "best":      by_date[:5],
        "worst":     by_date[-5:][::-1] if len(by_date) >= 5 else by_date[::-1],
    }


@app.get("/api/users/referrals")
async def get_user_referrals(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    user = _get_user_from_token(credentials.credentials, db)

    referred_users = db.query(User).filter(User.referred_by_id == user.id).all()

    earnings = db.query(ReferralEarning).filter(
        ReferralEarning.referral_id == user.id
    ).order_by(ReferralEarning.created_at.desc()).all()

    total_earned = sum(e.earned for e in earnings)
    pending      = sum(e.earned for e in earnings if not e.paid_out)
    active_count = sum(1 for u in referred_users if u.is_active)

    by_user = {}
    for e in earnings:
        uid = e.referred_id
        if uid not in by_user:
            ref_user = next((u for u in referred_users if u.id == uid), None)
            email = ref_user.email if ref_user else "unknown"
            parts = email.split("@")
            masked = (parts[0][0] + "***@" + parts[1]) if len(parts) == 2 else email
            by_user[uid] = {
                "email_masked": masked,
                "joined":       ref_user.created_at.isoformat() if ref_user else None,
                "is_active":    ref_user.is_active if ref_user else False,
                "total_earned": 0.0,
            }
        by_user[uid]["total_earned"] = round(by_user[uid]["total_earned"] + e.earned, 2)

    site_url = "https://kadoclub.net"
    return {
        "ref_code":      user.ref_code or "",
        "ref_link":      f"{site_url}?ref={user.ref_code}" if user.ref_code else "",
        "invited_count": len(referred_users),
        "active_count":  active_count,
        "total_earned":  round(total_earned, 2),
        "pending":       round(pending, 2),
        "referrals":     list(by_user.values()),
    }


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
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid billing request")


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
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid billing request")


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
    import hmac as _hmac_cron
    secret = request.headers.get("X-Cron-Secret", "")
    if not PERF_CRON_SECRET:
        raise HTTPException(status_code=503, detail="Cron secret not configured")
    if not _hmac_cron.compare_digest(secret, PERF_CRON_SECRET):
        raise HTTPException(status_code=403, detail="Forbidden")
    import subprocess
    subprocess.Popen(["python3", "billing_cron.py"])
    return {"ok": True, "message": "Cron started"}


@app.post("/api/billing/invoice-weekly")
async def invoice_weekly(request: Request):
    """Weekly billing cron endpoint — called every Monday by systemd timer."""
    import hmac as _hmac_cron
    secret = request.headers.get("X-Cron-Secret", "")
    if not PERF_CRON_SECRET:
        raise HTTPException(status_code=503, detail="Cron secret not configured")
    if not _hmac_cron.compare_digest(secret, PERF_CRON_SECRET):
        raise HTTPException(status_code=403, detail="Forbidden")
    import subprocess
    subprocess.Popen(["python3", "billing_cron_weekly.py"])
    return {"ok": True, "message": "Weekly cron started"}


# ─── Manual USDT invoice endpoints ───────────────────────────────────────────

class InvoiceNotifyRequest(BaseModel):
    invoice_id: int
    tx_hash: Optional[str] = None
    invoice_type: str = "weekly"   # "weekly" | "monthly"


def _week_label(year: int, week: int) -> str:
    from datetime import timedelta
    monday = datetime.fromisocalendar(year, week, 1).replace(tzinfo=timezone.utc)
    sunday = monday + timedelta(days=6)
    return f"Week {week} ({monday.strftime('%b %-d')}–{sunday.strftime('%-d')})"


@app.get("/api/billing/invoice/current")
async def get_current_invoice(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """Return oldest unpaid weekly invoice + this-week running PnL."""
    from sqlalchemy import func
    user = _get_user_from_token(credentials.credentials, db)

    now = datetime.now(timezone.utc)
    iso = now.isocalendar()
    week_start = datetime.fromisocalendar(iso.year, iso.week, 1).replace(tzinfo=timezone.utc)

    # Current week running PnL
    current_pnl = db.query(func.sum(UserTrade.pnl_usdt)).filter(
        UserTrade.user_id == user.id,
        UserTrade.status  == "closed",
        UserTrade.closed_at >= week_start,
    ).scalar() or 0.0

    # Oldest unpaid weekly invoice
    invoice = (
        db.query(WeeklyPnl)
        .filter(WeeklyPnl.user_id == user.id, WeeklyPnl.performance_fee > 0, WeeklyPnl.fee_paid == False)
        .order_by(WeeklyPnl.year, WeeklyPnl.week)
        .first()
    )

    result: dict = {
        "wallet_trc20":      USDT_WALLET_TRC20,
        "current_week_pnl":  round(float(current_pnl), 2),
        "projected_fee":     round(max(0.0, float(current_pnl) * 0.20), 2),
        "week_label":        _week_label(iso.year, iso.week),
        "invoice": None,
    }

    if invoice:
        result["invoice"] = {
            "id":        invoice.id,
            "type":      "weekly",
            "year":      invoice.year,
            "week":      invoice.week,
            "label":     _week_label(invoice.year, invoice.week),
            "gross_pnl": invoice.gross_pnl,
            "fee":       invoice.performance_fee,
            "fee_paid":  invoice.fee_paid,
            "notified":  invoice.payment_notified_at is not None,
            "notified_at": invoice.payment_notified_at.isoformat() if invoice.payment_notified_at else None,
            "tx_hash":   invoice.tx_hash,
        }

    return result


@app.post("/api/billing/invoice/notify")
async def notify_invoice_payment(
    body: InvoiceNotifyRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """User notifies that USDT payment was sent."""
    if body.invoice_type not in ("weekly", "monthly"):
        raise HTTPException(status_code=400, detail="invoice_type must be 'weekly' or 'monthly'")
    user = _get_user_from_token(credentials.credentials, db)

    # Support both weekly (default) and legacy monthly invoices
    if body.invoice_type == "monthly":
        invoice = db.query(MonthlyPnl).filter(
            MonthlyPnl.id == body.invoice_id, MonthlyPnl.user_id == user.id,
        ).first()
    else:
        invoice = db.query(WeeklyPnl).filter(
            WeeklyPnl.id == body.invoice_id, WeeklyPnl.user_id == user.id,
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


# ─── Careers landing page (vacancy showcase + role pre-fill) ─────────────────

_ROLES = {
    'ml':       {'icon':'🧠','equity':'5-15%','hours':'30+'},
    'backend':  {'icon':'⚙️','equity':'0.5-2%','hours':'15-30'},
    'frontend': {'icon':'🎨','equity':'0.3-1.5%','hours':'15-30'},
    'quant':    {'icon':'🔬','equity':'0.5-2%','hours':'15-25'},
    'growth':   {'icon':'📈','equity':'0.5-2%','hours':'15-30'},
    'devops':   {'icon':'🛡️','equity':'0.3-1.5%','hours':'10-20'},
    'community':{'icon':'🤝','equity':'0.2-0.8%','hours':'10-20'},
}

_CAREERS_I18N = {
    'ru': {
        'title': 'Вакансии', 'tag': 'ПРИСОЕДИНЯЙСЯ К KADO',
        'hero_title': 'Строим AI trading platform 2027',
        'hero_sub': 'Live продукт. Event-sourced billing. Свой AI dataset. Telegram-native. Pre-seed → YC W27.',
        'why_title': 'Почему сейчас',
        'why': [
            '✓ Live платформа kadoclub.net — не vapor',
            '✓ Event-sourced billing инфраструктура — defensible accounting',
            '✓ Proprietary "Regret Engine" — counterfactual signal auto-tuning (никто другой не делает)',
            '✓ 4,797 архивных новостей с апреля — свой dataset для AI training',
            '✓ Telegram-native distribution — CAC ≈ $0',
            '✓ AI + crypto convergence 2026-2027 — perfect timing',
        ],
        'comp_title': 'Что даём всем co-builders',
        'comp': [
            '💎 Equity 0.2-15% (4 года vest, 1 год cliff)',
            '🤖 15% performance fee на наши боты вместо 25% — НАВСЕГДА',
            '🔓 Early access ко всем новым AI стратегиям',
            '📈 Pre-IPO / token allocation — гарантировано',
            '💵 Deferred salary → market post-seed (запуск Q1 2027)',
            '🌍 Fully remote, async, 10-30 часов/неделю',
        ],
        'roles_title': 'Открытые позиции',
        'roles': {
            'ml':       {'title':'ML / AI Co-Founder', 'desc':'Fine-tuning LLM (Llama/Mistral) на trading datasets · RL агенты для strategy optimization · Эволюция Regret Engine. Бонус: ex-Renaissance / Two Sigma / Citadel или сильная AI research лаба.'},
            'backend':  {'title':'Senior Backend Engineer (Python)', 'desc':'FastAPI + SQLAlchemy + event-sourcing patterns · Bybit V5 API integration · Reliability в multi-process среде.'},
            'frontend': {'title':'Senior Frontend Developer (React)', 'desc':'React 18 + Vite + Tailwind · Mobile-first dashboard · Real-time WebSocket UI · i18n 6 языков уже есть.'},
            'quant':    {'title':'Quant Researcher', 'desc':'Backtesting framework expansion · Market microstructure analysis · Strategy validation · Бонус: orderflow / SMC background.'},
            'growth':   {'title':'Growth / Marketing Lead', 'desc':'Telegram-native growth · Crypto Twitter operator · Content strategy · CAC near zero — нужно понимать viral mechanics.'},
            'devops':   {'title':'DevOps / Security Engineer', 'desc':'Multi-tenant scaling · SOC2 prep · SSL/CSP/encrypted credentials · Hetzner+Cloudflare stack.'},
            'community':{'title':'Community / Customer Success', 'desc':'Telegram community management · Onboarding flow optimization · First-line support для платных subscribers.'},
        },
        'cta_apply': 'Подать заявку →',
        'cta_invest': 'Я инвестор →',
        'foot': 'Вопросы? @Poxcoin в Telegram или glorimanunited@gmail.com',
    },
    'ua': {
        'title': 'Вакансії', 'tag': 'ПРИЄДНУЙСЯ ДО KADO',
        'hero_title': 'Будуємо AI trading platform 2027',
        'hero_sub': 'Live продукт. Event-sourced billing. Власний AI dataset. Telegram-native. Pre-seed → YC W27.',
        'why_title': 'Чому зараз',
        'why': [
            '✓ Live платформа kadoclub.net — не vapor',
            '✓ Event-sourced billing інфраструктура — defensible accounting',
            '✓ Proprietary "Regret Engine" — counterfactual signal auto-tuning (ніхто інший не робить)',
            '✓ 4,797 архівних новин з квітня — власний dataset для AI training',
            '✓ Telegram-native distribution — CAC ≈ $0',
            '✓ AI + crypto convergence 2026-2027 — perfect timing',
        ],
        'comp_title': 'Що даємо всім co-builders',
        'comp': [
            '💎 Equity 0.2-15% (4 роки vest, 1 рік cliff)',
            '🤖 15% performance fee на наші боти замість 25% — НАЗАВЖДИ',
            '🔓 Early access до всіх нових AI стратегій',
            '📈 Pre-IPO / token allocation — гарантовано',
            '💵 Deferred salary → market post-seed (запуск Q1 2027)',
            '🌍 Fully remote, async, 10-30 годин/тиждень',
        ],
        'roles_title': 'Відкриті позиції',
        'roles': {
            'ml':       {'title':'ML / AI Co-Founder', 'desc':'Fine-tuning LLM (Llama/Mistral) на trading datasets · RL агенти для strategy optimization · Еволюція Regret Engine. Бонус: ex-Renaissance / Two Sigma / Citadel.'},
            'backend':  {'title':'Senior Backend Engineer (Python)', 'desc':'FastAPI + SQLAlchemy + event-sourcing · Bybit V5 API integration · Reliability в multi-process середовищі.'},
            'frontend': {'title':'Senior Frontend Developer (React)', 'desc':'React 18 + Vite + Tailwind · Mobile-first dashboard · Real-time WebSocket UI · i18n 6 мов вже є.'},
            'quant':    {'title':'Quant Researcher', 'desc':'Backtesting framework expansion · Market microstructure · Strategy validation · Бонус: orderflow / SMC background.'},
            'growth':   {'title':'Growth / Marketing Lead', 'desc':'Telegram-native growth · Crypto Twitter operator · Content strategy · CAC near zero — треба розуміти viral mechanics.'},
            'devops':   {'title':'DevOps / Security Engineer', 'desc':'Multi-tenant scaling · SOC2 prep · SSL/CSP/encrypted credentials · Hetzner + Cloudflare stack.'},
            'community':{'title':'Community / Customer Success', 'desc':'Telegram community management · Onboarding flow optimization · First-line support для платних subscribers.'},
        },
        'cta_apply': 'Подати заявку →',
        'cta_invest': 'Я інвестор →',
        'foot': 'Питання? @Poxcoin в Telegram або glorimanunited@gmail.com',
    },
    'en': {
        'title': 'Careers', 'tag': 'JOIN KADO',
        'hero_title': 'Building the AI trading platform of 2027',
        'hero_sub': 'Live product. Event-sourced billing. Own AI dataset. Telegram-native. Pre-seed → YC W27.',
        'why_title': 'Why now',
        'why': [
            '✓ Live platform kadoclub.net — not vapor',
            '✓ Event-sourced billing infrastructure — defensible accounting',
            '✓ Proprietary "Regret Engine" — counterfactual signal auto-tuning (no competitor)',
            '✓ 4,797 archived news since April — own dataset for AI training',
            '✓ Telegram-native distribution — CAC ≈ $0',
            '✓ AI + crypto convergence 2026-2027 — perfect timing',
        ],
        'comp_title': 'What every co-builder gets',
        'comp': [
            '💎 Equity 0.2-15% (4yr vest, 1yr cliff)',
            '🤖 15% performance fee on our bots vs standard 25% — FOR LIFE',
            '🔓 Early access to all new AI strategies',
            '📈 Pre-IPO / token allocation guaranteed',
            '💵 Deferred salary → market post-seed (Q1 2027)',
            '🌍 Fully remote, async, 10-30 hrs/week',
        ],
        'roles_title': 'Open positions',
        'roles': {
            'ml':       {'title':'ML / AI Co-Founder', 'desc':'Fine-tune LLM (Llama/Mistral) on trading datasets · RL agents for strategy optimization · Regret Engine evolution. Bonus: ex-Renaissance / Two Sigma / Citadel.'},
            'backend':  {'title':'Senior Backend Engineer (Python)', 'desc':'FastAPI + SQLAlchemy + event-sourcing · Bybit V5 API integration · Reliability in multi-process env.'},
            'frontend': {'title':'Senior Frontend Developer (React)', 'desc':'React 18 + Vite + Tailwind · Mobile-first dashboard · Real-time WebSocket UI · 6 languages i18n.'},
            'quant':    {'title':'Quant Researcher', 'desc':'Backtesting framework expansion · Market microstructure · Strategy validation. Bonus: orderflow / SMC.'},
            'growth':   {'title':'Growth / Marketing Lead', 'desc':'Telegram-native growth · Crypto Twitter operator · Content strategy · CAC near zero proof.'},
            'devops':   {'title':'DevOps / Security Engineer', 'desc':'Multi-tenant scaling · SOC2 prep · SSL/CSP/encrypted credentials · Hetzner + Cloudflare.'},
            'community':{'title':'Community / Customer Success', 'desc':'Telegram community management · Onboarding flow · First-line support for paying subs.'},
        },
        'cta_apply': 'Apply →',
        'cta_invest': "I'm an investor →",
        'foot': 'Questions? @Poxcoin on Telegram or glorimanunited@gmail.com',
    },
}


def _render_careers(lang: str) -> str:
    lang = lang if lang in _CAREERS_I18N else 'ru'
    t = _CAREERS_I18N[lang]

    role_cards = ''
    for key, meta in _ROLES.items():
        r = t['roles'][key]
        role_cards += (
            f'<div class="role">'
            f'<div class="role-h"><span class="icon">{meta["icon"]}</span>'
            f'<div><div class="role-title">{r["title"]}</div>'
            f'<div class="role-meta">Equity {meta["equity"]} · {meta["hours"]} hrs/week</div></div></div>'
            f'<div class="role-desc">{r["desc"]}</div>'
            f'<a class="role-cta" href="/apply/cobuilder?lang={lang}&role={key}">{t["cta_apply"]}</a>'
            f'</div>'
        )

    why_html = ''.join(f'<li>{x}</li>' for x in t['why'])
    comp_html = ''.join(f'<li>{x}</li>' for x in t['comp'])

    return f"""<!DOCTYPE html>
<html lang="{lang}"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KADO — {t['title']}</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:#050505;color:#e8e8e8;font-family:'Inter',-apple-system,sans-serif;min-height:100vh;padding:40px 16px}}
.wrap{{max-width:720px;margin:0 auto}}
.lang{{position:fixed;top:16px;right:16px;font-size:11px;background:rgba(0,0,0,0.6);padding:6px 10px}}
.lang a{{color:#666;margin-left:10px;text-decoration:none;font-weight:600}}
.lang a:hover{{color:#fff}}
.logo{{font-size:36px;font-weight:900;letter-spacing:-0.04em;color:#fff}}
.tag{{font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#666;margin-top:4px;margin-bottom:48px}}
h1{{font-size:30px;font-weight:800;line-height:1.15;margin-bottom:12px}}
.hero-sub{{color:#999;font-size:16px;line-height:1.6;margin-bottom:48px}}
.section{{margin-bottom:48px}}
.section h2{{font-size:18px;font-weight:700;color:#fff;margin-bottom:16px;text-transform:uppercase;letter-spacing:0.1em}}
.section ul{{list-style:none}}
.section li{{padding:8px 0;color:#ccc;font-size:14px;line-height:1.6;border-bottom:1px solid #111}}
.section li:last-child{{border-bottom:none}}
.role{{background:#0a0a0a;border:1px solid #1a1a1a;padding:24px;margin-bottom:16px;transition:border-color 0.2s}}
.role:hover{{border-color:#00b894}}
.role-h{{display:flex;align-items:center;margin-bottom:12px}}
.icon{{font-size:32px;margin-right:16px}}
.role-title{{font-size:18px;font-weight:700;color:#fff;margin-bottom:2px}}
.role-meta{{font-size:11px;color:#666;letter-spacing:0.08em;text-transform:uppercase}}
.role-desc{{color:#bbb;font-size:14px;line-height:1.6;margin-bottom:20px}}
.role-cta{{display:inline-block;background:#00b894;color:#000;padding:12px 20px;font-weight:700;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none}}
.role-cta:hover{{background:#04d39c}}
.foot{{margin-top:48px;padding-top:32px;border-top:1px solid #1a1a1a;text-align:center;color:#666;font-size:13px}}
.foot a{{color:#00b894;text-decoration:none}}
.invest-box{{background:#0a0f0a;border:1px solid #0a3a2a;padding:20px;text-align:center;margin-top:32px}}
.invest-box a{{color:#00b894;text-decoration:none;font-weight:700;font-size:14px}}
</style></head>
<body>
<div class="lang"><a href="?lang=en">EN</a><a href="?lang=ua">UA</a><a href="?lang=ru">RU</a></div>
<div class="wrap">
<div class="logo">KADO</div>
<div class="tag">{t['tag']}</div>
<h1>{t['hero_title']}</h1>
<div class="hero-sub">{t['hero_sub']}</div>

<div class="section"><h2>{t['why_title']}</h2><ul>{why_html}</ul></div>
<div class="section"><h2>{t['comp_title']}</h2><ul>{comp_html}</ul></div>

<div class="section"><h2>{t['roles_title']}</h2>
{role_cards}
</div>

<div class="invest-box">
<a href="/apply/investor?lang={lang}">{t['cta_invest']}</a>
</div>

<div class="foot">{t['foot']}</div>
</div>
</body></html>"""


@app.get("/careers", response_class=HTMLResponse)
async def careers_page(lang: str = "ru"):
    return _render_careers(lang)


# ─── Application intake (Phase 0 fundraise — co-builder + investor forms) ────

_APPLY_FORM_HTML = """<!DOCTYPE html>
<html lang="{lang}"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KADO — {title}</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{background:#050505;color:#e8e8e8;font-family:'Inter',-apple-system,sans-serif;min-height:100vh;padding:40px 16px}}
.wrap{{max-width:560px;margin:0 auto}}
.logo{{font-size:32px;font-weight:900;letter-spacing:-0.04em;color:#fff;margin-bottom:4px}}
.tag{{font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:#666;margin-bottom:32px}}
h1{{font-size:24px;font-weight:700;margin-bottom:8px}}
.intro{{color:#999;font-size:14px;line-height:1.6;margin-bottom:32px}}
label{{display:block;font-size:12px;text-transform:uppercase;letter-spacing:0.1em;color:#888;margin-top:20px;margin-bottom:8px}}
input,textarea,select{{width:100%;background:#0f0f0f;border:1px solid #222;padding:14px;color:#fff;font-family:inherit;font-size:14px;border-radius:0}}
textarea{{min-height:80px;resize:vertical}}
input:focus,textarea:focus,select:focus{{outline:none;border-color:#00b894}}
button{{margin-top:32px;width:100%;background:#00b894;color:#000;border:none;padding:16px;font-weight:700;font-size:13px;letter-spacing:0.15em;text-transform:uppercase;cursor:pointer;font-family:inherit}}
button:disabled{{opacity:0.5;cursor:not-allowed}}
.ok{{background:#0f1f0f;border:1px solid #0a4a2a;padding:24px;color:#4ade80;margin-top:24px}}
.err{{background:#2a0f0f;border:1px solid #5a1a1a;padding:14px;color:#f87171;margin-top:16px}}
.req:after{{content:" *";color:#f87171}}
.lang{{position:absolute;top:20px;right:20px;font-size:12px}}
.lang a{{color:#666;margin-left:12px;text-decoration:none}}
.lang a:hover{{color:#fff}}
</style></head>
<body>
<div class="lang"><a href="?lang=en">EN</a><a href="?lang=ua">UA</a><a href="?lang=ru">RU</a></div>
<div class="wrap">
<div class="logo">KADO</div>
<div class="tag">{tag}</div>
<h1>{heading}</h1>
<div class="intro">{intro}</div>
<form id="f" onsubmit="return submit_form(event)">
<input type="hidden" name="type" value="{type}">
{fields}
<button type="submit" id="b">{submit_label}</button>
</form>
<div id="result"></div>
</div>
<script>
const OK_MSG = {ok_msg_json};
const SUBMIT = {submit_json};
const SUBMITTING = {submitting_json};
async function submit_form(e){{
  e.preventDefault();
  const f=document.getElementById('f'); const btn=document.getElementById('b');
  btn.disabled=true; btn.textContent=SUBMITTING;
  const data=Object.fromEntries(new FormData(f));
  const res=document.getElementById('result');
  try{{
    const r=await fetch('/api/applications',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify(data)}});
    if(r.ok){{
      const d=document.createElement('div'); d.className='ok'; d.textContent=OK_MSG;
      res.replaceChildren(d); f.style.display='none';
    }} else {{
      const e=await r.json();
      const d=document.createElement('div'); d.className='err';
      d.textContent=(e && e.detail)?String(e.detail):'Error';
      res.replaceChildren(d); btn.disabled=false; btn.textContent=SUBMIT;
    }}
  }} catch(e){{
    const d=document.createElement('div'); d.className='err'; d.textContent='Network error';
    res.replaceChildren(d); btn.disabled=false; btn.textContent=SUBMIT;
  }}
  return false;
}}
</script></body></html>"""


def _i18n(lang: str, key: str) -> str:
    T = {
        'cobuilder_tag':   {'en':'CO-BUILDER APPLICATION','ua':'CO-BUILDER ЗАЯВКА','ru':'CO-BUILDER ЗАЯВКА'},
        'cobuilder_heading': {'en':'Join Kado as co-builder','ua':'Приєднайся до Kado як co-builder','ru':'Присоединяйся к Kado'},
        'cobuilder_intro': {
            'en':'Equity 0.2-15% · 15% perf fee (vs 25%) for life · Pre-IPO allocation · Deferred salary → market post-seed · Fully remote',
            'ua':'Equity 0.2-15% · 15% perf fee (замість 25%) назавжди · Pre-IPO allocation · Deferred salary → market після seed · Fully remote',
            'ru':'Equity 0.2-15% · 15% perf fee (вместо 25%) навсегда · Pre-IPO allocation · Deferred salary → market после seed · Fully remote',
        },
        'investor_tag':    {'en':'INVESTOR APPLICATION','ua':'INVESTOR ЗАЯВКА','ru':'INVESTOR ЗАЯВКА'},
        'investor_heading':{'en':'Invest in KADO','ua':'Інвестувати в KADO','ru':'Инвестировать в KADO'},
        'investor_intro': {
            'en':'Pre-seed SAFE · $5M cap · $50K-$500K checks · Live platform with event-sourced billing · YC W27 planned',
            'ua':'Pre-seed SAFE · $5M cap · $50K-$500K чеки · Live platform з event-sourced billing · YC W27 планується',
            'ru':'Pre-seed SAFE · $5M cap · $50K-$500K чеки · Live platform с event-sourced billing · YC W27 планируется',
        },
        'name':       {'en':'Full name','ua':"Повне ім'я",'ru':'Полное имя'},
        'email':      {'en':'Email','ua':'Email','ru':'Email'},
        'telegram':   {'en':'Telegram (@username)','ua':'Telegram (@username)','ru':'Telegram (@username)'},
        'role':       {'en':'Role of interest','ua':'Роль','ru':'Роль'},
        'check_size': {'en':'Check size (USD)','ua':'Розмір чеку (USD)','ru':'Размер чека (USD)'},
        'timezone':   {'en':'Timezone (e.g. UTC+2)','ua':'Timezone (наприклад UTC+2)','ru':'Timezone (например UTC+2)'},
        'hours':      {'en':'Hours per week available','ua':'Годин на тиждень','ru':'Часов в неделю'},
        'equity':     {'en':'Equity % expectation','ua':'Очікувана equity %','ru':'Ожидаемая equity %'},
        'terms':      {'en':'Terms required (board / pro-rata / advisor)','ua':'Умови (board / pro-rata / advisor)','ru':'Условия (board / pro-rata / advisor)'},
        'portfolio':  {'en':'Portfolio URL (GitHub/LinkedIn)','ua':'Portfolio URL (GitHub/LinkedIn)','ru':'Portfolio URL (GitHub/LinkedIn)'},
        'fund':       {'en':'Fund / portfolio URL','ua':'Fund / portfolio URL','ru':'Fund / portfolio URL'},
        'track':      {'en':'Track record relevant to role','ua':'Track record по ролі','ru':'Track record по роли'},
        'previous':   {'en':'Previous portfolio investments (crypto/AI/fintech)','ua':'Попередні інвестиції (crypto/AI/fintech)','ru':'Предыдущие инвестиции (crypto/AI/fintech)'},
        'why':        {'en':'Why Kado (3 sentences)','ua':'Чому Kado (3 речення)','ru':'Почему Kado (3 предложения)'},
        'start':      {'en':'When can you start','ua':'Коли можеш стартувати','ru':'Когда можешь стартовать'},
        'dd_time':    {'en':'Due diligence timeline (weeks)','ua':'Due diligence timeline (тижнів)','ru':'Due diligence timeline (недель)'},
        'submit':     {'en':'Submit application','ua':'Подати заявку','ru':'Отправить заявку'},
        'submitting': {'en':'Submitting...','ua':'Надсилається...','ru':'Отправка...'},
        'ok_msg':     {'en':'Application received. We will reach out within 48h via email or Telegram.','ua':'Заявку отримано. Напишемо протягом 48 годин email або Telegram.','ru':'Заявка получена. Напишем в течение 48ч на email или Telegram.'},
    }
    return T.get(key, {}).get(lang, T.get(key, {}).get('en', key))


_ROLE_PREFILL_LABELS = {
    'ml':       {'en':'ML / AI Co-Founder','ua':'ML / AI Co-Founder','ru':'ML / AI Co-Founder'},
    'backend':  {'en':'Senior Backend Engineer','ua':'Senior Backend Engineer','ru':'Senior Backend Engineer'},
    'frontend': {'en':'Senior Frontend Developer','ua':'Senior Frontend Developer','ru':'Senior Frontend Developer'},
    'quant':    {'en':'Quant Researcher','ua':'Quant Researcher','ru':'Quant Researcher'},
    'growth':   {'en':'Growth / Marketing Lead','ua':'Growth / Marketing Lead','ru':'Growth / Marketing Lead'},
    'devops':   {'en':'DevOps / Security Engineer','ua':'DevOps / Security Engineer','ru':'DevOps / Security Engineer'},
    'community':{'en':'Community / Customer Success','ua':'Community / Customer Success','ru':'Community / Customer Success'},
}


def _build_fields(typ: str, lang: str, prefill_role: str = '') -> str:
    import html as _html
    def f(name, label_key, req=False, ta=False, value=''):
        cls = ' class="req"' if req else ''
        req_attr = ' required' if req else ''
        label = _i18n(lang, label_key)
        val_attr = f' value="{_html.escape(value)}"' if value else ''
        if ta:
            return f'<label{cls}>{label}</label><textarea name="{name}"{req_attr}>{_html.escape(value)}</textarea>'
        return f'<label{cls}>{label}</label><input type="text" name="{name}"{val_attr}{req_attr}>'
    if typ == 'cobuilder':
        role_value = _ROLE_PREFILL_LABELS.get(prefill_role, {}).get(lang, '')
        return ''.join([
            f('name', 'name', req=True),
            f('email', 'email', req=True),
            f('telegram', 'telegram'),
            f('role_or_check', 'role', req=True, value=role_value),
            f('timezone', 'timezone'),
            f('hours_per_week', 'hours'),
            f('equity_or_terms', 'equity'),
            f('portfolio_url', 'portfolio'),
            f('track_record', 'track', ta=True),
            f('why_kado', 'why', ta=True, req=True),
            f('start_date', 'start'),
        ])
    return ''.join([
        f('name', 'name', req=True),
        f('email', 'email', req=True),
        f('telegram', 'telegram'),
        f('role_or_check', 'check_size', req=True),
        f('portfolio_url', 'fund'),
        f('equity_or_terms', 'terms'),
        f('track_record', 'previous', ta=True),
        f('why_kado', 'why', ta=True, req=True),
        f('start_date', 'dd_time'),
    ])


def _render_form(lang: str, typ: str, prefill_role: str = '') -> str:
    import json as _json
    lang = lang if lang in ('en', 'ua', 'ru') else 'en'
    return _APPLY_FORM_HTML.format(
        lang=lang,
        title=("Co-Builder Application" if typ == 'cobuilder' else "Investor Application"),
        tag=_i18n(lang, f'{typ}_tag'),
        heading=_i18n(lang, f'{typ}_heading'),
        intro=_i18n(lang, f'{typ}_intro'),
        type=typ,
        fields=_build_fields(typ, lang, prefill_role),
        submit_label=_i18n(lang, 'submit'),
        submitting=_i18n(lang, 'submitting'),
        ok_msg=_i18n(lang, 'ok_msg'),
        ok_msg_json=_json.dumps(_i18n(lang, 'ok_msg')),
        submit_json=_json.dumps(_i18n(lang, 'submit')),
        submitting_json=_json.dumps(_i18n(lang, 'submitting')),
    )


_ADMIN_APPLICATIONS_HTML = """<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>KADO Admin — Applications</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#050505;color:#e8e8e8;font-family:-apple-system,sans-serif;padding:20px;font-size:13px}
.head{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #1a1a1a}
h1{font-size:20px;font-weight:800;letter-spacing:-0.02em}
.filters{display:flex;gap:8px}
select,input,button{background:#0f0f0f;border:1px solid #222;color:#fff;padding:8px 12px;font-family:inherit;font-size:12px}
button{background:#00b894;color:#000;border:none;font-weight:700;cursor:pointer;text-transform:uppercase;letter-spacing:0.1em}
button:hover{background:#04d39c}
.login{max-width:320px;margin:80px auto;text-align:center}
.login input{width:100%;margin-bottom:12px;padding:14px}
.login button{width:100%;padding:14px}
table{width:100%;border-collapse:collapse;margin-top:16px}
th{text-align:left;color:#666;font-size:10px;text-transform:uppercase;letter-spacing:0.1em;padding:10px 8px;border-bottom:1px solid #1a1a1a;font-weight:600}
td{padding:12px 8px;border-bottom:1px solid #111;vertical-align:top}
tr:hover{background:#0a0a0a}
.badge{padding:3px 8px;font-size:10px;text-transform:uppercase;letter-spacing:0.08em;font-weight:600}
.b-new{background:#0a2a4a;color:#7dc4ff}
.b-contacted{background:#4a3a0a;color:#ffd57d}
.b-hired{background:#0a4a2a;color:#7dffac}
.b-rejected{background:#4a0a1a;color:#ff7d8c}
.b-cobuilder{background:#3a0a4a;color:#d77dff}
.b-investor{background:#4a2a0a;color:#ffac7d}
.cell-name{font-weight:600;color:#fff}
.cell-email{color:#999;font-size:11px}
.cell-why{color:#bbb;max-width:280px;font-size:11px;line-height:1.5}
.status-btns{display:flex;gap:4px;flex-wrap:wrap}
.status-btns button{padding:4px 8px;font-size:9px;letter-spacing:0.05em}
.btn-contacted{background:#4a3a0a;color:#ffd57d}
.btn-hired{background:#0a4a2a;color:#7dffac}
.btn-rejected{background:#4a0a1a;color:#ff7d8c}
.empty{text-align:center;padding:60px;color:#666}
.meta{color:#555;font-size:10px;font-family:'JetBrains Mono',monospace}
a{color:#00b894;text-decoration:none}
</style></head>
<body>
<div id="login-view" class="login" style="display:none">
<h1>KADO Admin</h1>
<input type="password" id="pw" placeholder="Admin password" autofocus>
<button onclick="doLogin()">Login</button>
<div id="login-err" style="color:#f87171;margin-top:12px;font-size:12px"></div>
</div>

<div id="main-view" style="display:none">
<div class="head">
<h1>Applications</h1>
<div class="filters">
<select id="f-type" onchange="load()"><option value="">All types</option><option value="cobuilder">Co-builder</option><option value="investor">Investor</option></select>
<select id="f-status" onchange="load()"><option value="">All statuses</option><option value="new">New</option><option value="contacted">Contacted</option><option value="rejected">Rejected</option><option value="hired">Hired</option></select>
<button onclick="logout()">Logout</button>
</div>
</div>
<div id="table-wrap"></div>
</div>

<script>
let TOKEN = localStorage.getItem('kado_admin_token');

function show(view){
  document.getElementById('login-view').style.display = view==='login'?'block':'none';
  document.getElementById('main-view').style.display = view==='main'?'block':'none';
}

async function doLogin(){
  const pw = document.getElementById('pw').value;
  const err = document.getElementById('login-err');
  err.textContent = '';
  try {
    const r = await fetch('/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({password: pw})});
    if (!r.ok) { err.textContent = 'Invalid password'; return; }
    const d = await r.json();
    TOKEN = d.token;
    localStorage.setItem('kado_admin_token', TOKEN);
    show('main'); load();
  } catch(e) { err.textContent = 'Network error'; }
}

function logout(){
  localStorage.removeItem('kado_admin_token'); TOKEN=null;
  show('login');
}

async function load(){
  if (!TOKEN) { show('login'); return; }
  const t = document.getElementById('f-type').value;
  const s = document.getElementById('f-status').value;
  let url = '/api/admin/applications';
  const params = [];
  if (t) params.push('typ='+t);
  if (s) params.push('status='+s);
  if (params.length) url += '?' + params.join('&');
  const r = await fetch(url, {headers:{'Authorization':'Bearer '+TOKEN}});
  if (r.status === 401) { logout(); return; }
  const apps = await r.json();
  render(apps);
}

function badge(cls, text) {
  const s = document.createElement('span');
  s.className = 'badge ' + cls;
  s.textContent = text;
  return s;
}

function render(apps){
  const wrap = document.getElementById('table-wrap');
  wrap.replaceChildren();
  if (!apps.length) {
    const d = document.createElement('div'); d.className='empty'; d.textContent='No applications';
    wrap.appendChild(d); return;
  }
  const tbl = document.createElement('table');
  const thead = document.createElement('thead');
  const trh = document.createElement('tr');
  ['ID','Type','Status','Name / Contact','Role/Check','Hours/Equity','Why','When','Actions'].forEach(h=>{
    const th = document.createElement('th'); th.textContent = h; trh.appendChild(th);
  });
  thead.appendChild(trh); tbl.appendChild(thead);
  const tbody = document.createElement('tbody');
  apps.forEach(a=>{
    const tr = document.createElement('tr');
    const tdId = document.createElement('td'); tdId.className='meta'; tdId.textContent='#'+a.id; tr.appendChild(tdId);
    const tdType = document.createElement('td'); tdType.appendChild(badge('b-'+a.type, a.type)); tr.appendChild(tdType);
    const tdStatus = document.createElement('td'); tdStatus.appendChild(badge('b-'+a.status, a.status)); tr.appendChild(tdStatus);
    const tdName = document.createElement('td');
    const nm = document.createElement('div'); nm.className='cell-name'; nm.textContent = a.name || '-'; tdName.appendChild(nm);
    const em = document.createElement('div'); em.className='cell-email'; em.textContent = a.email + (a.telegram?' · @'+a.telegram.replace(/^@/,''):''); tdName.appendChild(em);
    tr.appendChild(tdName);
    const tdRole = document.createElement('td'); tdRole.textContent = a.role_or_check || '-'; tr.appendChild(tdRole);
    const tdHours = document.createElement('td');
    tdHours.textContent = (a.hours_per_week||'-') + ' / ' + (a.equity_or_terms||'-');
    tr.appendChild(tdHours);
    const tdWhy = document.createElement('td'); tdWhy.className='cell-why'; tdWhy.textContent = a.why_kado || '-'; tr.appendChild(tdWhy);
    const tdWhen = document.createElement('td'); tdWhen.className='meta';
    tdWhen.textContent = (a.created_at||'').substring(0,16).replace('T',' '); tr.appendChild(tdWhen);
    const tdAct = document.createElement('td');
    const wrap = document.createElement('div'); wrap.className='status-btns';
    ['contacted','hired','rejected'].forEach(st=>{
      if (a.status === st) return;
      const b = document.createElement('button'); b.className='btn-'+st; b.textContent=st;
      b.onclick = () => setStatus(a.id, st);
      wrap.appendChild(b);
    });
    tdAct.appendChild(wrap);
    tr.appendChild(tdAct);
    tbody.appendChild(tr);
  });
  tbl.appendChild(tbody);
  wrap.appendChild(tbl);
}

async function setStatus(id, status){
  const r = await fetch('/api/admin/applications/'+id+'/status?status='+status, {method:'POST', headers:{'Authorization':'Bearer '+TOKEN}});
  if (r.ok) load();
}

if (TOKEN) { show('main'); load(); } else { show('login'); }
</script>
</body></html>"""


@app.get("/admin/applications", response_class=HTMLResponse)
async def admin_applications_page():
    return _ADMIN_APPLICATIONS_HTML


@app.get("/apply/cobuilder", response_class=HTMLResponse)
async def apply_cobuilder_page(lang: str = "en", role: str = ""):
    return _render_form(lang, 'cobuilder', role)


@app.get("/apply/investor", response_class=HTMLResponse)
async def apply_investor_page(lang: str = "en"):
    return _render_form(lang, 'investor')


class ApplicationSubmit(BaseModel):
    type: str
    name: str
    email: str
    telegram: Optional[str] = None
    role_or_check: Optional[str] = None
    timezone: Optional[str] = None
    hours_per_week: Optional[str] = None
    equity_or_terms: Optional[str] = None
    portfolio_url: Optional[str] = None
    track_record: Optional[str] = None
    why_kado: Optional[str] = None
    start_date: Optional[str] = None


@app.post("/api/applications")
async def submit_application(body: ApplicationSubmit, request: Request, db: Session = Depends(get_db)):
    if body.type not in ('cobuilder', 'investor'):
        raise HTTPException(status_code=400, detail="Invalid type")
    if not body.name or not body.email or '@' not in body.email:
        raise HTTPException(status_code=400, detail="Name and valid email required")
    ip = _real_ip(request)
    if not _check_rate_limit(f"app_{ip}", window=300, max_hits=5):
        raise HTTPException(status_code=429, detail="Too many submissions, try later")

    app_row = Application(
        type=body.type, name=body.name[:200], email=body.email[:200],
        telegram=(body.telegram or '')[:80],
        role_or_check=(body.role_or_check or '')[:200],
        timezone=(body.timezone or '')[:80],
        hours_per_week=(body.hours_per_week or '')[:80],
        equity_or_terms=(body.equity_or_terms or '')[:200],
        portfolio_url=(body.portfolio_url or '')[:500],
        track_record=(body.track_record or '')[:2000],
        why_kado=(body.why_kado or '')[:2000],
        start_date=(body.start_date or '')[:80],
        ip_address=ip,
    )
    db.add(app_row)
    db.commit()
    db.refresh(app_row)

    try:
        from modules.tg_notifier import send_telegram_message
        from config.settings import TG_CHAT_ID
        if TG_CHAT_ID:
            emoji = '🧑‍💻' if body.type == 'cobuilder' else '💰'
            msg = (
                f'{emoji} <b>New {body.type} application #{app_row.id}</b>\n'
                f'Name: {body.name}\n'
                f'Email: {body.email}\n'
                f'TG: {body.telegram or "-"}\n'
                f'Role/Check: {body.role_or_check or "-"}\n'
                f'Hours: {body.hours_per_week or "-"}\n'
                f'Equity/Terms: {body.equity_or_terms or "-"}\n'
                f'Portfolio: {body.portfolio_url or "-"}\n'
                f'Why: {(body.why_kado or "")[:300]}\n'
                f'IP: {ip}'
            )
            send_telegram_message(msg, TG_CHAT_ID)
    except Exception as e:
        print(f'app TG notify err: {e}')

    return {"ok": True, "id": app_row.id}


@app.get("/api/admin/applications")
async def admin_list_applications(
    typ: Optional[str] = None,
    status: Optional[str] = None,
    token: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Admin: list received applications, newest first."""
    from sqlalchemy import desc
    q = db.query(Application).order_by(desc(Application.created_at))
    if typ:
        q = q.filter(Application.type == typ)
    if status:
        q = q.filter(Application.status == status)
    rows = q.limit(200).all()
    return [
        {
            'id': r.id, 'type': r.type, 'status': r.status,
            'name': r.name, 'email': r.email, 'telegram': r.telegram,
            'role_or_check': r.role_or_check, 'timezone': r.timezone,
            'hours_per_week': r.hours_per_week, 'equity_or_terms': r.equity_or_terms,
            'portfolio_url': r.portfolio_url,
            'track_record': r.track_record, 'why_kado': r.why_kado,
            'start_date': r.start_date, 'ip_address': r.ip_address,
            'created_at': r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@app.post("/api/admin/applications/{app_id}/status")
async def admin_set_app_status(
    app_id: int, status: str,
    token: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    if status not in ('new', 'contacted', 'rejected', 'hired'):
        raise HTTPException(status_code=400, detail='Invalid status')
    row = db.query(Application).filter(Application.id == app_id).first()
    if not row:
        raise HTTPException(status_code=404, detail='Not found')
    row.status = status
    db.commit()
    return {'ok': True, 'status': status}


# ─── Admin billing (Phase 6 event-sourced sync) ───────────────────────────────

@app.get("/api/admin/billing/check")
async def admin_billing_check(token: str = Depends(require_auth)):
    """Admin: drift safety check before any billing run.

    Returns:
      safe: bool — true if drift <= $5 for all users
      issues: [str] — human-readable drift descriptions
      per_user: detailed events vs Bybit comparison
    """
    from modules.billing_guard import check_billing_safe
    return check_billing_safe()


@app.post("/api/admin/billing/run")
async def admin_billing_run(
    year: Optional[int] = None,
    week: Optional[int] = None,
    force: bool = False,
    token: str = Depends(require_auth),
):
    """Admin: run weekly performance fee billing.

    Refuses if drift safety check fails (HTTP 409) unless force=true.
    Uses event-sourced trade_events as PnL source.
    """
    from modules.billing_guard import check_billing_safe
    from billing_cron_weekly import run as run_weekly_billing

    safety = check_billing_safe()
    if not safety['safe'] and not force:
        raise HTTPException(
            status_code=409,
            detail={
                "error": "billing_unsafe",
                "issues": safety['issues'],
                "hint": "Fix drift before billing, or pass ?force=true to override"
            }
        )

    results = run_weekly_billing(year, week)
    return {
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "year": year, "week": week,
        "safety": safety,
        "results": results,
    }


# ─── Admin summary stats ──────────────────────────────────────────────────────

@app.get("/api/admin/stats")
async def admin_stats(
    token: str = Depends(require_auth),
    db: Session = Depends(get_db),
):
    """Admin: platform-wide summary — users, bots, revenue."""
    from sqlalchemy import func

    total_users   = db.query(func.count(User.id)).scalar() or 0
    active_users  = db.query(func.count(User.id)).filter(User.is_active == True).scalar() or 0
    verified_users = db.query(func.count(User.id)).filter(User.email_verified == True).scalar() or 0

    # Users by plan
    plan_rows = db.query(User.plan, func.count(User.id)).group_by(User.plan).all()
    plans = {p: c for p, c in plan_rows}

    # API keys connected
    users_with_keys = db.query(func.count(func.distinct(UserApiKey.user_id))).scalar() or 0

    # Trades
    total_trades  = db.query(func.count(UserTrade.id)).scalar() or 0
    open_trades   = db.query(func.count(UserTrade.id)).filter(UserTrade.status == "open").scalar() or 0
    closed_trades = db.query(func.count(UserTrade.id)).filter(UserTrade.status == "closed").scalar() or 0

    # Revenue: sum of all performance fees collected
    fees_collected = db.query(func.sum(MonthlyPnl.performance_fee)).filter(
        MonthlyPnl.fee_paid == True
    ).scalar() or 0.0

    fees_pending = db.query(func.sum(MonthlyPnl.performance_fee)).filter(
        MonthlyPnl.fee_paid == False,
        MonthlyPnl.performance_fee > 0,
    ).scalar() or 0.0

    pending_invoices = db.query(func.count(MonthlyPnl.id)).filter(
        MonthlyPnl.fee_paid == False,
        MonthlyPnl.performance_fee > 0,
    ).scalar() or 0

    notified_invoices = db.query(func.count(MonthlyPnl.id)).filter(
        MonthlyPnl.fee_paid.is_(False),
        MonthlyPnl.performance_fee > 0,
        MonthlyPnl.payment_notified_at.isnot(None),
    ).scalar() or 0

    # Running bots from dispatcher
    dispatcher_instances = dispatcher_status()
    running_bots = len(dispatcher_instances) if isinstance(dispatcher_instances, list) else 0

    return {
        "users": {
            "total":        total_users,
            "active":       active_users,
            "verified":     verified_users,
            "with_keys":    users_with_keys,
            "by_plan":      plans,
        },
        "trades": {
            "total":  total_trades,
            "open":   open_trades,
            "closed": closed_trades,
        },
        "revenue": {
            "collected":         round(float(fees_collected), 2),
            "pending":           round(float(fees_pending), 2),
            "pending_invoices":  pending_invoices,
            "notified_invoices": notified_invoices,
        },
        "bots": {
            "running": running_bots,
        },
    }


# ─── Admin users list ─────────────────────────────────────────────────────────

@app.get("/api/admin/users")
async def admin_list_users(
    token: str = Depends(require_auth),
    db: Session = Depends(get_db),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
):
    """Admin: paginated list of all users with trade and PnL summaries."""
    from sqlalchemy import func, case

    total_count = db.query(func.count(User.id)).scalar() or 0

    users = (
        db.query(User)
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    if not users:
        return {"users": [], "total": total_count}

    user_ids = [u.id for u in users]

    # Trade counts — 1 query for all users
    trade_rows = (
        db.query(
            UserTrade.user_id,
            func.count(UserTrade.id).label("total"),
            func.sum(case((UserTrade.status == "open", 1), else_=0)).label("open"),
        )
        .filter(UserTrade.user_id.in_(user_ids))
        .group_by(UserTrade.user_id)
        .all()
    )
    trade_map = {r.user_id: (int(r.total), int(r.open or 0)) for r in trade_rows}

    # Pending fees — 1 query for all users
    fee_rows = (
        db.query(
            MonthlyPnl.user_id,
            func.sum(MonthlyPnl.performance_fee).label("pending"),
        )
        .filter(
            MonthlyPnl.user_id.in_(user_ids),
            MonthlyPnl.fee_paid.is_(False),
            MonthlyPnl.performance_fee > 0,
        )
        .group_by(MonthlyPnl.user_id)
        .all()
    )
    fee_map = {r.user_id: float(r.pending) for r in fee_rows}

    # Latest MonthlyPnl per user — subquery on year*100+month, then join
    latest_sub = (
        db.query(
            MonthlyPnl.user_id,
            func.max(MonthlyPnl.year * 100 + MonthlyPnl.month).label("ym"),
        )
        .filter(MonthlyPnl.user_id.in_(user_ids))
        .group_by(MonthlyPnl.user_id)
        .subquery()
    )
    pnl_rows = (
        db.query(MonthlyPnl)
        .join(
            latest_sub,
            (MonthlyPnl.user_id == latest_sub.c.user_id) &
            (MonthlyPnl.year * 100 + MonthlyPnl.month == latest_sub.c.ym),
        )
        .all()
    )
    pnl_map = {r.user_id: r for r in pnl_rows}

    # Bybit API keys — 1 query for all users
    key_rows = (
        db.query(UserApiKey.user_id)
        .filter(UserApiKey.user_id.in_(user_ids), UserApiKey.exchange == "bybit")
        .distinct()
        .all()
    )
    keys_set = {r.user_id for r in key_rows}

    result = []
    for u in users:
        total_t, open_t = trade_map.get(u.id, (0, 0))
        latest_pnl = pnl_map.get(u.id)
        pending_fee = fee_map.get(u.id, 0.0)

        result.append({
            "id":             u.id,
            "email":          u.email,
            "username":       u.username,
            "plan":           u.plan,
            "is_active":      u.is_active,
            "email_verified": bool(u.email_verified),
            "has_api_keys":   u.id in keys_set,
            "created_at":     u.created_at.isoformat() if u.created_at else None,
            "last_login":     u.last_login.isoformat() if u.last_login else None,
            "trades_total":   total_t,
            "trades_open":    open_t,
            "latest_pnl": {
                "year":    latest_pnl.year,
                "month":   latest_pnl.month,
                "net_pnl": latest_pnl.net_pnl,
            } if latest_pnl else None,
            "pending_fee": round(pending_fee, 2),
        })

    return {"users": result, "total": total_count}



# ══════════════════════════════════════════════════════════════════════════════
#  WAITLIST
# ══════════════════════════════════════════════════════════════════════════════

class WaitlistRequest(BaseModel):
    email: EmailStr

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
                exchange.has['fetchCurrencies'] = False
                exchange.load_markets()
                r = exchange.private_get_v5_account_wallet_balance(params={'accountType': 'UNIFIED'})
                coins = r.get('result', {}).get('list', [{}])[0].get('coin', [])
                for c in coins:
                    if c.get('coin') == 'USDT':
                        total = float(c.get('walletBalance') or 0)
                        free  = float(c.get('availableToWithdraw') or c.get('walletBalance') or 0)
                        balance_info["total"] = total
                        balance_info["free"]  = free
                        break
            else:
                exchange.load_markets()
                try:
                    balance = exchange.fetch_balance({'accountType': 'unified'})
                    if "USDT" not in balance or balance["USDT"].get("total", 0) == 0:
                        balance = exchange.fetch_balance({'accountType': 'contract'})
                    if "USDT" not in balance or balance["USDT"].get("total", 0) == 0:
                        balance = exchange.fetch_balance()
                except Exception:
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


# ── Forex OHLCV proxy (Twelve Data) ──────────────────────────────────────────
_forex_cache: dict = {}
_TD_INTERVALS = {"1": "1min", "5": "5min", "15": "15min", "60": "1h", "240": "4h", "D": "1day"}

_FOREX_SYMBOL_RE = re.compile(r'^[A-Z]{3,6}/[A-Z]{3,6}$')

@app.get("/api/forex/ohlcv")
async def forex_ohlcv(
    symbol: str = Query(..., max_length=20),
    interval: str = Query("60"),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    _get_user_from_token(credentials.credentials, db)  # auth check only
    if not _FOREX_SYMBOL_RE.match(symbol.upper()):
        raise HTTPException(status_code=400, detail="Invalid symbol format")
    symbol = symbol.upper()

    td_interval = _TD_INTERVALS.get(interval, "1h")
    cache_key = (symbol, td_interval)
    now = datetime.now(timezone.utc)

    cached = _forex_cache.get(cache_key)
    if cached and cached["expires"] > now:
        return cached["data"]

    api_key = os.environ.get("TWELVEDATA_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=503, detail="TWELVEDATA_API_KEY not configured")

    url = (
        f"https://api.twelvedata.com/time_series"
        f"?symbol={symbol}&interval={td_interval}&outputsize=500&apikey={api_key}"
    )
    try:
        r = requests.get(url, timeout=15)
        raw = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Twelve Data fetch error: {e}")

    if raw.get("status") == "error":
        raise HTTPException(status_code=502, detail=raw.get("message", "Twelve Data API error"))

    bars = []
    for v in raw.get("values", []):
        dt_str = v["datetime"]
        try:
            dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            dt = datetime.strptime(dt_str, "%Y-%m-%d")
        bars.append({
            "time":   int(dt.replace(tzinfo=timezone.utc).timestamp()),
            "open":   float(v["open"]),
            "high":   float(v["high"]),
            "low":    float(v["low"]),
            "close":  float(v["close"]),
            "volume": float(v.get("volume") or 0),
        })
    bars.sort(key=lambda b: b["time"])

    _forex_cache[cache_key] = {"data": bars, "expires": now + timedelta(minutes=30)}
    return bars


@app.get("/api/bot-pnl")
async def get_bot_pnl(token: str = Depends(require_any_auth)):
    """Unified PnL report across ALL bots (signal + grid + funding)."""
    try:
        from modules.unified_pnl import get_report
        return get_report()
    except Exception as e:
        import logging; logging.getLogger("kado").error("unified_pnl error: %s", e)
        raise HTTPException(status_code=500, detail="Internal error")


@app.get("/api/bot-trades")
async def get_bot_trades(
    n: int = Query(default=50, ge=1, le=500),
    source: str = Query(default="all"),
    token: str = Depends(require_any_auth),
):
    """Recent trades across all bots. source= all | signal | grid | funding"""
    try:
        from modules.unified_pnl import get_recent_trades, init_all_trades_table, _conn
        init_all_trades_table()
        con = _conn()
        if source == "all":
            rows = con.execute(
                "SELECT bot_source,coin,action,qty,entry_price,exit_price,"
                "pnl_usdt,result,timestamp_open,timestamp_close,duration_min "
                "FROM all_trades ORDER BY timestamp_close DESC LIMIT ?", (n,)
            ).fetchall()
        else:
            rows = con.execute(
                "SELECT bot_source,coin,action,qty,entry_price,exit_price,"
                "pnl_usdt,result,timestamp_open,timestamp_close,duration_min "
                "FROM all_trades WHERE bot_source=? ORDER BY timestamp_close DESC LIMIT ?",
                (source, n)
            ).fetchall()
        con.close()
        return {"trades": [dict(r) for r in rows]}
    except Exception as e:
        import logging; logging.getLogger("kado").error("endpoint error: %s", e)
        raise HTTPException(status_code=500, detail="Internal error")


@app.get("/api/stats")
async def get_stats(token: str = Depends(require_any_auth)):
    all_signals = _load_signals()
    trades = [s for s in all_signals if s.get("action") in ("LONG", "SHORT")]

    closed_trades  = [s for s in trades if "result" in s]
    winning_trades = sum(1 for s in closed_trades if s.get("result") == "WIN")
    losing_trades  = sum(1 for s in closed_trades if s.get("result") == "LOSS")
    total_pnl      = round(sum(float(s.get("pnl_usdt", 0)) for s in closed_trades), 2)
    win_rate       = round(winning_trades / len(closed_trades) * 100, 1) if closed_trades else 0.0

    # Merge with unified PnL for full picture
    try:
        from modules.unified_pnl import get_report
        unified = get_report()
        total_pnl = unified["all"]["total"]
        win_rate  = unified["all"]["wr"]
        winning_trades = unified["all"]["wins"]
        closed_trades_n = unified["all"]["trades"]
        losing_trades = closed_trades_n - winning_trades
    except Exception:
        closed_trades_n = len(closed_trades)

    return {
        "total_trades":   len(trades),
        "closed_trades":  closed_trades_n,
        "win_rate":       win_rate,
        "total_pnl":      total_pnl,
        "winning_trades": winning_trades,
        "losing_trades":  losing_trades,
        "long_count":     sum(1 for s in trades if s.get("action") == "LONG"),
        "short_count":    sum(1 for s in trades if s.get("action") == "SHORT"),
    }


@app.get("/api/analytics/breakdown")
async def analytics_breakdown(token: str = Depends(require_any_auth)):
    """Per-bot and per-coin PnL analytics from all_trades."""
    try:
        from modules.unified_pnl import _conn
        conn = _conn()
        c = conn.cursor()

        # Overall summary
        c.execute("""
            SELECT COUNT(*),
                   SUM(pnl_usdt),
                   SUM(CASE WHEN pnl_usdt > 0 THEN 1 ELSE 0 END),
                   SUM(CASE WHEN pnl_usdt < 0 THEN 1 ELSE 0 END),
                   MIN(timestamp_open),
                   MAX(timestamp_close)
            FROM all_trades
        """)
        row = c.fetchone()
        summary = {
            "total_trades": row[0] or 0,
            "total_pnl": round(row[1] or 0, 2),
            "wins": row[2] or 0,
            "losses": row[3] or 0,
            "first_trade": row[4],
            "last_trade": row[5],
        }

        # By bot source
        c.execute("""
            SELECT bot_source, COUNT(*),
                   SUM(pnl_usdt),
                   SUM(CASE WHEN pnl_usdt > 0 THEN 1 ELSE 0 END),
                   AVG(CASE WHEN pnl_usdt > 0 THEN pnl_usdt END),
                   AVG(CASE WHEN pnl_usdt < 0 THEN pnl_usdt END)
            FROM all_trades GROUP BY bot_source ORDER BY SUM(pnl_usdt) DESC
        """)
        by_bot = [{"source": r[0], "trades": r[1], "pnl": round(r[2] or 0, 2),
                   "wins": r[3] or 0, "avg_win": round(r[4] or 0, 2),
                   "avg_loss": round(r[5] or 0, 2)} for r in c.fetchall()]

        # By coin
        c.execute("""
            SELECT coin, COUNT(*),
                   SUM(pnl_usdt),
                   SUM(CASE WHEN pnl_usdt > 0 THEN 1 ELSE 0 END),
                   AVG(CASE WHEN pnl_usdt > 0 THEN pnl_usdt END),
                   AVG(CASE WHEN pnl_usdt < 0 THEN pnl_usdt END)
            FROM all_trades GROUP BY coin ORDER BY SUM(pnl_usdt) DESC
        """)
        by_coin = [{"coin": r[0], "trades": r[1], "pnl": round(r[2] or 0, 2),
                    "wins": r[3] or 0, "avg_win": round(r[4] or 0, 2),
                    "avg_loss": round(r[5] or 0, 2)} for r in c.fetchall()]

        # Daily PnL (last 30 days)
        c.execute("""
            SELECT DATE(timestamp_open) as d, SUM(pnl_usdt), COUNT(*)
            FROM all_trades
            WHERE timestamp_open >= datetime('now', '-30 days')
            GROUP BY d ORDER BY d ASC
        """)
        daily = [{"date": r[0], "pnl": round(r[1] or 0, 2), "trades": r[2]} for r in c.fetchall()]

        # Recent best trades
        c.execute("""
            SELECT bot_source, coin, action, pnl_usdt, result, timestamp_open
            FROM all_trades WHERE pnl_usdt IS NOT NULL
            ORDER BY pnl_usdt DESC LIMIT 5
        """)
        best = [{"source": r[0], "coin": r[1], "action": r[2], "pnl": round(r[3], 2),
                 "result": r[4], "ts": r[5]} for r in c.fetchall()]

        # Recent worst trades
        c.execute("""
            SELECT bot_source, coin, action, pnl_usdt, result, timestamp_open
            FROM all_trades WHERE pnl_usdt IS NOT NULL
            ORDER BY pnl_usdt ASC LIMIT 5
        """)
        worst = [{"source": r[0], "coin": r[1], "action": r[2], "pnl": round(r[3], 2),
                  "result": r[4], "ts": r[5]} for r in c.fetchall()]

        conn.close()
        return {"summary": summary, "by_bot": by_bot, "by_coin": by_coin,
                "daily": daily, "best": best, "worst": worst}
    except Exception as e:
        import logging; logging.getLogger("kado").error("endpoint error: %s", e)
        raise HTTPException(status_code=500, detail="Internal error")


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
    requester_id = _token_user_id(token)
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
            # admin (None) sees all; user only sees their own runs
            # legacy files without user_id are admin-only
            file_owner = data.get("user_id")
            if requester_id is not None and file_owner != requester_id:
                continue
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
    path = os.path.realpath(os.path.join(BACKTEST_DIR, f"{run_id}.json"))
    _base = os.path.realpath(BACKTEST_DIR) + os.sep
    if not path.startswith(_base):
        raise HTTPException(status_code=400, detail="Invalid run_id")
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Run not found")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to read backtest result")
    requester_id = _token_user_id(token)
    file_owner = data.get("user_id")
    # admin sees all; user only sees their own; legacy files (no user_id) admin-only
    if requester_id is not None and file_owner != requester_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return data


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
    limit: int = Query(default=120, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    import sqlite3
    import html as _html
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

        # ── Balanced mix: avoid Telegram flood pushing out RSS articles ──────
        # Telegram/on-chain sources flood the DB every minute.
        # Strategy: fetch separately by source type, then merge.

        TELEGRAM_SOURCES = ("Telegram", "Smart Wallet", "whale_alert", "lookonchain",
                            "WatcherGuru", "wublockchain")

        def is_telegram(source: str) -> bool:
            s = (source or "").lower()
            return any(t.lower() in s for t in TELEGRAM_SOURCES)

        # 1. RSS articles with images — top quality, up to 25
        cur.execute(
            "SELECT id,title,source,description,published_at,link,from_newsapi,image_url,category "
            "FROM news WHERE image_url IS NOT NULL AND image_url != '' "
            "  AND source NOT LIKE '%Telegram%' "
            "  AND source NOT LIKE '%Smart Wallet%' "
            "  AND source NOT LIKE '%whale_alert%' "
            "ORDER BY published_at DESC LIMIT 25"
        )
        rss_with_img = [dict(r) for r in cur.fetchall()]

        # 2. RSS articles without images — up to 35
        cur.execute(
            "SELECT id,title,source,description,published_at,link,from_newsapi,image_url,category "
            "FROM news WHERE (image_url IS NULL OR image_url = '') "
            "  AND source NOT LIKE '%Telegram%' "
            "  AND source NOT LIKE '%Smart Wallet%' "
            "  AND source NOT LIKE '%whale_alert%' "
            "ORDER BY published_at DESC LIMIT 35"
        )
        rss_no_img = [dict(r) for r in cur.fetchall()]

        # 3. On-chain / Telegram — up to 30 (for ON-CHAIN category)
        cur.execute(
            "SELECT id,title,source,description,published_at,link,from_newsapi,image_url,category "
            "FROM news WHERE (source LIKE '%Telegram%' OR source LIKE '%Smart Wallet%' "
            "  OR source LIKE '%whale_alert%' OR source LIKE '%lookonchain%') "
            "ORDER BY published_at DESC LIMIT 30"
        )
        onchain = [dict(r) for r in cur.fetchall()]

        conn.close()

        # Merge: RSS first (images, then text), then on-chain, dedup by id
        seen_ids: set = set()
        merged: list = []
        for item in rss_with_img + rss_no_img + onchain:
            if item["id"] not in seen_ids:
                seen_ids.add(item["id"])
                merged.append(item)

        # Sort by published_at descending
        merged.sort(key=lambda x: x.get("published_at") or "", reverse=True)

        # Title-level dedup: catch same story from different outlets
        seen_titles: set = set()
        deduped: list = []
        for item in merged:
            words = item["title"].lower().split()
            key = " ".join(w for w in words if len(w) > 3)[:60]
            if key not in seen_titles:
                seen_titles.add(key)
                deduped.append(item)
        merged = deduped[:limit]

        for r in merged:
            if r.get("description"):
                r["description"] = r["description"][:200]
            if r.get("image_url"):
                r["image_url"] = _html.unescape(r["image_url"])

        return {"items": merged, "total": total, "mock": False}
    except Exception as e:
        return {"items": _MOCK_NEWS[:limit], "total": len(_MOCK_NEWS), "mock": True}


# ══════════════════════════════════════════════════════════════════════════════
#  LIQUIDATION DASHBOARD ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/liquidations/live")
async def liquidations_live(token: str = Depends(require_any_auth)):
    """Поточний стан ліквідацій по топ монетах."""
    coins_data: dict = {}
    if _LIQ_AVAILABLE:
        for coin in _LIQ_COINS:
            try:
                sig = get_liquidation_signal(coin)
                coins_data[coin] = {
                    "long_liq_usd":  sig.get("long_liq_usd", 0),
                    "short_liq_usd": sig.get("short_liq_usd", 0),
                    "signal":        sig.get("signal", "NEUTRAL"),
                    "signal_score":  sig.get("signal_score", 0.0),
                }
            except Exception as _e:
                coins_data[coin] = {
                    "long_liq_usd":  0,
                    "short_liq_usd": 0,
                    "signal":        "NEUTRAL",
                    "signal_score":  0.0,
                    "error":         str(_e),
                }
    return {
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "coins": coins_data,
    }


@app.get("/api/liquidations/cascades")
async def liquidations_cascades(token: str = Depends(require_any_auth)):
    """Останні cascade сигнали від liquidation_signal_queue."""
    with _cascade_lock:
        history = list(_cascade_history)
    return {
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "count":   len(history),
        "cascades": list(reversed(history)),  # newest first
    }


# ══════════════════════════════════════════════════════════════════════════════
#  TELEGRAM MINI APP
# ══════════════════════════════════════════════════════════════════════════════

import hmac as _hmac
from urllib.parse import parse_qsl as _parse_qsl, unquote as _unquote

_WEBAPP_TOKENS: dict = {}   # token → user_id, expires at


def _verify_tg_init_data(init_data: str, bot_token: str) -> dict | None:
    """Return parsed user dict if initData HMAC is valid, else None."""
    try:
        params  = dict(_parse_qsl(init_data, keep_blank_values=True))
        tg_hash = params.pop("hash", None)
        if not tg_hash:
            return None
        data_check = "\n".join(f"{k}={params[k]}" for k in sorted(params))
        secret = _hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
        calc   = _hmac.new(secret, data_check.encode(), hashlib.sha256).hexdigest()
        if not _hmac.compare_digest(calc, tg_hash):
            return None
        user_raw = params.get("user", "{}")
        return json.loads(user_raw)
    except Exception:
        return None


class WebAppInitRequest(BaseModel):
    init_data: str


class WebAppPauseRequest(BaseModel):
    pause: bool


@app.get("/webapp")
async def serve_webapp():
    path = "static/webapp.html"
    if not os.path.exists(path):
        raise HTTPException(status_code=404)
    return FileResponse(path, media_type="text/html",
                        headers={"Cache-Control": "no-store, no-cache, must-revalidate"})


@app.options("/api/webapp/init")
@app.options("/api/webapp/pause")
async def webapp_cors_preflight():
    from fastapi.responses import Response as _Resp
    r = _Resp()
    r.headers["Access-Control-Allow-Origin"] = "*"
    r.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    r.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Webapp-Token"
    return r


@app.post("/api/webapp/init")
async def webapp_init(body: WebAppInitRequest, db: Session = Depends(get_db)):
    bot_token = USERBOT_TOKEN or ""
    tg_user   = None

    if body.init_data and bot_token:
        tg_user = _verify_tg_init_data(body.init_data, bot_token)

    # Dev fallback: allow empty initData only in demo mode
    if tg_user is None:
        if not IS_DEMO_TRADING:
            raise HTTPException(status_code=401, detail="Invalid Telegram session")
        tg_user = {"id": 0}

    tg_id   = str(tg_user.get("id", ""))
    # Look up user by tg_chat_id
    user = db.query(User).filter(User.tg_chat_id == tg_id).first() if tg_id else None

    balance   = {"usdt_wallet": 0, "unrealized_pnl": 0}
    positions = []
    signals   = []
    paused    = False

    key_row  = None
    mt5_row  = None
    demo_row = None

    if user:
        key_row  = db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit", is_demo=False).first()
        demo_row = db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit", is_demo=True).first()
        mt5_row  = db.query(UserMt5Key).filter_by(user_id=user.id).first()

    if user:
        if key_row:
            try:
                ex = _init_user_exchange(key_row)
                if ex:
                    b         = await asyncio.wait_for(
                        asyncio.to_thread(_bybit_balance, ex), timeout=8
                    )
                    balance   = {
                        "usdt_wallet":    b["wallet"],
                        "usdt_equity":    b["equity"],
                        "usdt_free":      b["usdt_free"],
                        "unrealized_pnl": b["unrealized_pnl"],
                    }
                    positions = await asyncio.wait_for(
                        asyncio.to_thread(_bybit_positions, ex), timeout=8
                    )
            except Exception:
                pass

        # Recent signals from DB
        try:
            rows = (
                db.query(UserTrade)
                .filter_by(user_id=user.id)
                .order_by(UserTrade.opened_at.desc())
                .limit(10)
                .all()
            )
            signals = [
                {
                    "coin":      r.symbol.replace("/USDT:USDT", "").replace("/USDT", "").replace("USDT", ""),
                    "action":    r.side or "LONG",
                    "result":    r.status.upper() if r.status and r.status != "open" else None,
                    "timestamp": r.opened_at.isoformat() if r.opened_at else None,
                }
                for r in rows
            ]
        except Exception:
            pass

    # PnL summary: all-time, last 30d, today (2026-05-22)
    pnl_summary = {"all_time": 0.0, "d30": 0.0, "today": 0.0, "trades_all": 0, "trades_today": 0, "wr_d30": 0.0}
    if user:
        try:
            cutoff_30d = datetime.utcnow() - timedelta(days=30)
            today_str  = datetime.utcnow().strftime("%Y-%m-%d")
            raw = _db_retry(db, lambda: (
                db.query(UserTrade)
                .filter(UserTrade.user_id == user.id, UserTrade.status == "closed")
                .all()
            ))
            rows = _filter_ghost_closes(_dedup_bybit_dupes(raw))
            wins_30 = trades_30 = 0
            for t in rows:
                pnl_summary["all_time"] += float(t.pnl_usdt or 0)
                pnl_summary["trades_all"] += 1
                if t.closed_at and t.closed_at >= cutoff_30d:
                    pnl_summary["d30"] += float(t.pnl_usdt or 0)
                    trades_30 += 1
                    if float(t.pnl_usdt or 0) > 0:
                        wins_30 += 1
                if t.closed_at and t.closed_at.strftime("%Y-%m-%d") == today_str:
                    pnl_summary["today"] += float(t.pnl_usdt or 0)
                    pnl_summary["trades_today"] += 1
            if trades_30 > 0:
                pnl_summary["wr_d30"] = round(wins_30 * 100.0 / trades_30, 1)
            pnl_summary["all_time"] = round(pnl_summary["all_time"], 2)
            pnl_summary["d30"]      = round(pnl_summary["d30"], 2)
            pnl_summary["today"]    = round(pnl_summary["today"], 2)
        except Exception:
            pass

    # Issue short-lived opaque token for pause endpoint
    token = secrets.token_hex(16)
    _WEBAPP_TOKENS[token] = {
        "user_id": user.id if user else None,
        "expires": time.time() + 3600,
    }

    # Real JWT for React SPA bridge — lets user enter /account inside Telegram
    # without re-login. Generated only if Telegram initData verified successfully.
    jwt_token = create_token(user.id, user.email) if user else None
    full_user = {
        "id":             user.id,
        "email":          user.email,
        "username":       user.username,
        "email_verified": bool(user.email_verified),
        "totp_enabled":   bool(user.totp_enabled),
    } if user else None

    from fastapi.responses import JSONResponse
    return JSONResponse(
        content={
            "token":     token,
            "jwt":       jwt_token,
            "full_user": full_user,
            "paused":    paused,
            "balance":   balance,
            "positions": positions,
            "signals":   signals,
            "pnl":       pnl_summary,
            "user": {
                "email":    user.email    if user else None,
                "username": user.username if user else None,
                "plan":     user.effective_plan if user else None,
            },
            "keys": {
                "bybit":      key_row  is not None,
                "demo":       demo_row is not None,
                "mt5":        mt5_row  is not None,
                "mt5_server": mt5_row.server if mt5_row else None,
            },
        },
        headers={"Access-Control-Allow-Origin": "*"},
    )


@app.post("/api/webapp/pause")
async def webapp_pause(
    body: WebAppPauseRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    token  = request.headers.get("X-Webapp-Token", "")
    meta   = _WEBAPP_TOKENS.get(token)
    if not meta or meta["expires"] < time.time():
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    user_id = meta.get("user_id")
    if not user_id:
        raise HTTPException(status_code=403, detail="No linked account")

    try:
        if body.pause:
            dispatcher_stop_user(user_id)
        else:
            dispatcher_sync_user(user_id, db)
    except Exception as e:
        import logging; logging.getLogger("kado").error("endpoint error: %s", e)
        raise HTTPException(status_code=500, detail="Internal error")

    return {"ok": True, "paused": body.pause}


# ══════════════════════════════════════════════════════════════════════════════
#  LIVE WEBSOCKET  — real-time positions / balance / orders / trades per user
# ══════════════════════════════════════════════════════════════════════════════

# Per-user Bybit data cache shared across WebSocket connections for that user.
# Prevents calling Bybit more often than _LIVE_CACHE_TTL seconds regardless of
# how many browser tabs the user has open.
_live_cache:      dict = {}          # user_id → {positions, balance, orders, ts}
_live_cache_lock: _threading.Lock = _threading.Lock()
_LIVE_CACHE_TTL   = 1.8             # seconds


def _refresh_live_cache(user_id: int, ex) -> dict:
    """Return fresh Bybit snapshot, re-fetching only when TTL has expired."""
    now    = time.time()
    cached = _live_cache.get(user_id, {})
    if now - cached.get("ts", 0.0) < _LIVE_CACHE_TTL:
        return cached

    try:
        positions = _bybit_positions(ex)
    except Exception:
        positions = cached.get("positions", [])

    try:
        raw_bal = _bybit_balance(ex)
    except Exception:
        raw_bal = cached.get("balance", None)

    try:
        raw_orders = ex.private_get_v5_order_realtime({
            "category": "linear", "settleCoin": "USDT", "limit": 50,
        })
        orders = [
            {
                "order_id":   o.get("orderId", ""),
                "symbol":     o.get("symbol", "").replace("USDT", ""),
                "side":       "LONG" if o.get("side") == "Buy" else "SHORT",
                "order_type": o.get("orderType", ""),
                "qty":        float(o.get("qty") or 0),
                "price":      float(o.get("price") or 0),
                "filled_qty": float(o.get("cumExecQty") or 0),
                "status":     o.get("orderStatus", ""),
                "created_at": o.get("createdTime", ""),
                "reduce_only": bool(o.get("reduceOnly", False)),
            }
            for o in raw_orders.get("result", {}).get("list", [])
        ]
    except Exception:
        orders = cached.get("orders", [])

    entry = {"positions": positions, "balance": raw_bal, "orders": orders, "ts": now}
    with _live_cache_lock:
        _live_cache[user_id] = entry
    return entry


def _fmt_trade_ws(t) -> dict:
    return {
        "id":          t.id,
        "source":      t.source,
        "symbol":      t.symbol,
        "side":        _fix_bybit_side(t.side, t.source),
        "leverage":    t.leverage,
        "entry_price": t.entry_price,
        "exit_price":  t.exit_price,
        "qty":         t.qty,
        "pnl_usdt":    t.pnl_usdt,
        "status":      t.status,
        "opened_at":   t.opened_at.isoformat() if t.opened_at else None,
        "closed_at":   t.closed_at.isoformat() if t.closed_at else None,
    }


@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    """
    Live feed for the user dashboard.
    Sends 'init' snapshot on connect, then 'update' diff every 2 s.
    Auth: accept connection, then read JWT as first message (never in URL).
    Close codes: 4001 auth, 4002 no API key, 4003 internal, 4029 rate limit.
    """
    ip = websocket.client.host if websocket.client else "unknown"
    await websocket.accept()

    if not _check_rate_limit(f"ws:{ip}", window=60, max_hits=30):
        await websocket.close(code=4029)
        return

    # Read token from first message — keeps JWT out of server access logs
    try:
        auth_msg = await asyncio.wait_for(websocket.receive_text(), timeout=5.0)
        token = auth_msg.strip()
    except (asyncio.TimeoutError, Exception):
        await websocket.close(code=4001)
        return

    from database import SessionLocal as _SL
    payload = decode_token(token)
    if not payload:
        await websocket.close(code=4001)
        return

    db = _SL()
    try:
        user = db.query(User).filter(User.id == int(payload["sub"])).first()
        if not user or not user.is_active:
            await websocket.close(code=4001)
            db.close()
            return
        key_rows = db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit").all()
        key_row  = next((k for k in key_rows if not k.is_demo), key_rows[0] if key_rows else None)
        if not key_row:
            await websocket.close(code=4002)
            db.close()
            return
        user_id = user.id
    except Exception:
        await websocket.close(code=4003)
        db.close()
        return
    finally:
        db.close()

    ex = _init_user_exchange(key_row)
    if not ex:
        await websocket.close(code=4003)
        return

    # ── initial trades load ───────────────────────────────────────────────────
    db2 = _SL()
    try:
        init_rows = (
            db2.query(UserTrade)
            .filter(UserTrade.user_id == user_id)
            .order_by(UserTrade.opened_at.desc())
            .limit(500)
            .all()
        )
        init_rows     = _dedup_bybit_dupes(init_rows)
        trades_json   = [_fmt_trade_ws(t) for t in init_rows]
        last_trade_id = init_rows[0].id if init_rows else 0
    finally:
        db2.close()

    # ── init snapshot ─────────────────────────────────────────────────────────
    loop  = asyncio.get_running_loop()
    cache = await loop.run_in_executor(None, lambda: _refresh_live_cache(user_id, ex))

    try:
        await websocket.send_json({
            "type":      "init",
            "positions": cache["positions"],
            "balance":   cache["balance"],
            "orders":    cache["orders"],
            "trades":    trades_json,
            "ts":        time.time(),
        })
    except Exception:
        return

    # ── streaming loop ────────────────────────────────────────────────────────
    try:
        while True:
            await asyncio.sleep(2)

            cache = await loop.run_in_executor(None, lambda: _refresh_live_cache(user_id, ex))

            db3 = _SL()
            try:
                new_rows = (
                    db3.query(UserTrade)
                    .filter(UserTrade.user_id == user_id, UserTrade.id > last_trade_id)
                    .order_by(UserTrade.id.asc())
                    .all()
                )
                new_trades_json = [_fmt_trade_ws(t) for t in new_rows]
                if new_rows:
                    last_trade_id = new_rows[-1].id
            finally:
                db3.close()

            await websocket.send_json({
                "type":       "update",
                "positions":  cache["positions"],
                "balance":    cache["balance"],
                "orders":     cache["orders"],
                "new_trades": new_trades_json,
                "ts":         time.time(),
            })

    except WebSocketDisconnect:
        pass
    except Exception:
        pass


# ══════════════════════════════════════════════════════════════════════════════
#  SPA CATCH-ALL  — MUST BE LAST — иначе перехватывает все /api/* маршруты
# ══════════════════════════════════════════════════════════════════════════════

_NO_CACHE = {"Cache-Control": "no-store, no-cache, must-revalidate", "Pragma": "no-cache"}

@app.get("/favicon.svg")
async def favicon_svg():
    return FileResponse("static/favicon.svg", media_type="image/svg+xml")

# Root-level static files that crawlers, social platforms, and search engines
# expect at exact paths (NOT under /static/...). Served before the SPA catch-all.
_ROOT_STATIC_FILES = {
    "robots.txt":   "text/plain; charset=utf-8",
    "sitemap.xml":  "application/xml; charset=utf-8",
    "og-image.png": "image/png",
}

for _name, _mime in _ROOT_STATIC_FILES.items():
    def _make_handler(filename: str, mime: str):
        async def _handler():
            path = f"static/{filename}"
            if not os.path.exists(path):
                raise HTTPException(status_code=404)
            return FileResponse(path, media_type=mime)
        return _handler
    app.get(f"/{_name}")(_make_handler(_name, _mime))

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
