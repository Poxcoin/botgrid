import asyncio
import json
import math
import os
import re
import secrets
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Optional

import ccxt
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from pydantic import EmailStr
from config.settings import BYBIT_API_KEY, BYBIT_SECRET, USE_TESTNET, IS_DEMO_TRADING, DASHBOARD_PASSWORD
from database import get_db, User
from utils.auth import hash_password, verify_password, create_token, decode_token
from sqlalchemy.orm import Session

app = FastAPI(title="Kado — AI Signal Intelligence", docs_url=None, redoc_url=None)

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
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# ─── Real IP: работаем за Cloudflare proxy ───────────────────────────────────
def _real_ip(request: Request) -> str:
    """Берём реальный IP из CF-Connecting-IP (Cloudflare) или X-Forwarded-For."""
    cf = request.headers.get("CF-Connecting-IP")
    if cf:
        return cf.strip()
    fwd = request.headers.get("X-Forwarded-For")
    if fwd:
        return fwd.split(",")[0].strip()
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
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline'; "
        "connect-src 'self' wss://kadoclub.net ws://localhost:8000 ws://localhost:5173; "
        "img-src 'self' data:; "
        "frame-ancestors 'none';"
    )
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
_ws_connections: dict = defaultdict(int)  # ip → open connection count
_WS_MAX_PER_IP = 5
security = HTTPBearer()

def _purge_expired():
    now = time.time()
    expired = [t for t, exp in _active_tokens.items() if exp < now]
    for t in expired:
        del _active_tokens[t]

def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    _purge_expired()
    token = credentials.credentials
    exp = _active_tokens.get(token)
    if exp is None or exp < time.time():
        _active_tokens.pop(token, None)
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return token

LEDGER_FILE = "signals_log.json"

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
    if body.password != DASHBOARD_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    token = secrets.token_hex(32)
    _active_tokens[token] = time.time() + _TOKEN_TTL
    return {"token": token}

@app.post("/api/auth/logout")
async def logout(token: str = Depends(require_auth)):
    _active_tokens.pop(token, None)
    return {"ok": True}


# ─── SaaS User Auth ──────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: str
    username: str
    password: str
    referral_source: str = "direct"

class UserLoginRequest(BaseModel):
    email: str
    password: str

class UpdateProfileRequest(BaseModel):
    bybit_api_key: str = ""
    bybit_secret: str = ""
    tg_chat_id: str = ""
    leverage: int = 3
    trade_size_percent: float = 5.0

def _get_user_from_token(token: str, db: Session):
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token")
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
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    user = User(
        email=body.email,
        username=body.username,
        password_hash=hash_password(body.password),
        referral_source=body.referral_source,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_token(user.id, user.email)
    return {"token": token, "user": {"id": user.id, "email": user.email, "username": user.username, "plan": user.subscription_plan}}

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
    token = create_token(user.id, user.email)
    return {"token": token, "user": {"id": user.id, "email": user.email, "username": user.username, "plan": user.subscription_plan, "subscribed": user.is_subscribed}}

@app.get("/api/users/me")
async def get_me(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    user = _get_user_from_token(credentials.credentials, db)
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "plan": user.subscription_plan,
        "subscribed": user.is_subscribed,
        "subscription_expires": user.subscription_expires.isoformat() if user.subscription_expires else None,
        "tg_chat_id": user.tg_chat_id,
        "leverage": user.leverage,
        "trade_size_percent": user.trade_size_percent,
        "has_api_keys": bool(user.bybit_api_key),
        "referral_source": user.referral_source,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }

@app.put("/api/users/me")
async def update_me(body: UpdateProfileRequest, credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    user = _get_user_from_token(credentials.credentials, db)
    if body.bybit_api_key:
        user.bybit_api_key = body.bybit_api_key
    if body.bybit_secret:
        user.bybit_secret = body.bybit_secret
    if body.tg_chat_id:
        user.tg_chat_id = body.tg_chat_id
    user.leverage = max(1, min(body.leverage, 10))
    user.trade_size_percent = max(1.0, min(body.trade_size_percent, 20.0))
    db.commit()
    return {"ok": True}


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
async def get_dashboard_data(token: str = Depends(require_auth)):
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
    coin: Optional[str] = Query(default=None, max_length=20),
    action: Optional[str] = Query(default=None, max_length=10),
    token: str = Depends(require_auth),
):
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
async def get_stats(token: str = Depends(require_auth)):
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
async def get_intel(token: str = Depends(require_auth)):
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
    token: str = Depends(require_auth),
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
async def get_backtest_runs(token: str = Depends(require_auth)):
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
async def get_backtest_run(run_id: str, token: str = Depends(require_auth)):
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
