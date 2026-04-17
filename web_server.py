import asyncio
import json
import math
import os
import secrets
import time
from collections import defaultdict
from datetime import datetime
from typing import Optional

import ccxt
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect, Depends, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from config.settings import BYBIT_API_KEY, BYBIT_SECRET, USE_TESTNET, DASHBOARD_PASSWORD

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

# ─── Security headers middleware ──────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
    # Убираем раскрытие сервера — удаляем uvicorn header и заменяем
    if "server" in response.headers:
        del response.headers["server"]
    response.headers.append("server", "kado")
    return response

# ─── Rate limiting (in-memory, per IP) ───────────────────────────────────────
_login_attempts: dict = defaultdict(list)
_LOGIN_WINDOW  = 60    # секунд
_LOGIN_MAX     = 10    # попыток в окне

def _check_rate_limit(ip: str) -> bool:
    """Возвращает True если запрос разрешён, False если лимит исчерпан."""
    now = time.time()
    attempts = _login_attempts[ip]
    # Удаляем старые попытки
    _login_attempts[ip] = [t for t in attempts if now - t < _LOGIN_WINDOW]
    if len(_login_attempts[ip]) >= _LOGIN_MAX:
        return False
    _login_attempts[ip].append(now)
    return True

# ─── Auth tokens (in-memory) ──────────────────────────────────────────────────
_active_tokens: set[str] = set()
security = HTTPBearer()

def require_auth(credentials: HTTPAuthorizationCredentials = Depends(security)):
    if credentials.credentials not in _active_tokens:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return credentials.credentials

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
    ip = request.client.host
    if not _check_rate_limit(ip):
        raise HTTPException(status_code=429, detail="Too many attempts. Wait 60s.")
    if body.password != DASHBOARD_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid password")
    token = secrets.token_hex(32)
    _active_tokens.add(token)
    return {"token": token}

@app.post("/api/auth/logout")
async def logout(token: str = Depends(require_auth)):
    _active_tokens.discard(token)
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
                "options": {"defaultType": "swap"},
            })
            if USE_TESTNET:
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

    filtered = [
        s for s in all_signals
        if s.get("action") in (action.upper() if action else ("LONG", "SHORT"))
    ]
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
async def websocket_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(default=None),
):
    if not token or token not in _active_tokens:
        await websocket.close(code=4001)
        return

    await websocket.accept()
    last_mtime = _get_file_mtime()
    try:
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
                    "timestamp": datetime.utcnow().isoformat(),
                    "signals_count": sum(1 for s in signals if s.get("action") in ("LONG", "SHORT")),
                })
    except WebSocketDisconnect:
        pass
    except Exception as e:
        print(f"WebSocket ошибка: {e}")


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
