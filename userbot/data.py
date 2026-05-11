"""
Data helpers for @KADO_c_BOT — exchange access + per-user PnL aggregation.

Kept lightweight on purpose: no FastAPI imports, no shared state with web_server.
Mirrors the raw V5 calls used in web_server._bybit_balance / _bybit_positions
to avoid the 3-4s load_markets() overhead on every Telegram reply.
"""
from datetime import datetime, timedelta, timezone

import ccxt
from sqlalchemy import case, func

from database import User, UserApiKey, UserTrade
from utils.crypto import decrypt_field


def get_user_by_chat(db, chat_id: str) -> User | None:
    return db.query(User).filter(User.tg_chat_id == chat_id).first()


def _init_exchange(key_row: UserApiKey):
    try:
        ex = ccxt.bybit({
            "apiKey": decrypt_field(key_row.api_key_enc),
            "secret": decrypt_field(key_row.secret_enc),
            "enableRateLimit": True,
            "options": {"defaultType": "linear", "recvWindow": 10000},
        })
        ex.has["fetchCurrencies"] = False
        if key_row.is_testnet:
            ex.urls["api"] = ex.urls["demotrading"]
        return ex
    except Exception:
        return None


def get_bybit_balance(user: User, db) -> dict | None:
    """Returns {wallet, equity, unrealized_pnl} or None if no key / API error."""
    key_row = db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit").first()
    if not key_row:
        return None
    ex = _init_exchange(key_row)
    if not ex:
        return None
    try:
        raw   = ex.private_get_v5_account_wallet_balance({"accountType": "UNIFIED"})
        coins = raw["result"]["list"][0].get("coin", [])
        usdt  = next((c for c in coins if c["coin"] == "USDT"), {})
        return {
            "wallet":         float(usdt.get("walletBalance")  or 0),
            "equity":         float(usdt.get("equity")         or 0),
            "unrealized_pnl": float(usdt.get("unrealisedPnl")  or 0),
        }
    except Exception:
        return None


def get_bybit_positions(user: User, db) -> list[dict] | None:
    """Returns list of open positions sorted by uPnL desc, or None on error / no key."""
    key_row = db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit").first()
    if not key_row:
        return None
    ex = _init_exchange(key_row)
    if not ex:
        return None
    try:
        raw   = ex.private_get_v5_position_list({"category": "linear", "settleCoin": "USDT"})
        items = raw.get("result", {}).get("list", [])
    except Exception:
        return None

    open_items = [p for p in items if float(p.get("size") or 0) > 0]
    out = []
    for p in sorted(open_items, key=lambda x: float(x.get("unrealisedPnl") or 0), reverse=True):
        upnl   = float(p.get("unrealisedPnl") or 0)
        margin = float(p.get("positionIM") or 1)
        out.append({
            "symbol":         p["symbol"].replace("USDT", ""),
            "side":           "LONG" if p.get("side") == "Buy" else "SHORT",
            "entry_price":    float(p.get("avgPrice") or 0),
            "mark_price":     float(p.get("markPrice") or 0),
            "qty":            float(p.get("size") or 0),
            "unrealized_pnl": upnl,
            "pnl_pct":        round(upnl / margin * 100, 2) if margin else 0,
            "leverage":       int(float(p.get("leverage") or 0)),
        })
    return out


def get_user_pnl_stats(user: User, db) -> dict:
    """Aggregates closed UserTrade rows: today / 7d / 30d / all-time."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start  = now - timedelta(days=7)
    month_start = now - timedelta(days=30)

    win = case((UserTrade.pnl_usdt > 0, 1), else_=0)
    base = db.query(
        func.coalesce(func.sum(UserTrade.pnl_usdt), 0.0).label("pnl"),
        func.count(UserTrade.id).label("trades"),
        func.coalesce(func.sum(win), 0).label("wins"),
    ).filter(
        UserTrade.user_id == user.id,
        UserTrade.status == "closed",
        UserTrade.pnl_usdt.isnot(None),
    )

    def _scope(since):
        q = base.filter(UserTrade.closed_at >= since) if since else base
        row = q.one()
        n   = int(row.trades or 0)
        wr  = round((row.wins or 0) / n * 100) if n else 0
        return {"pnl": round(float(row.pnl or 0), 2), "trades": n, "wr": wr}

    return {
        "today": _scope(today_start),
        "week":  _scope(week_start),
        "month": _scope(month_start),
        "all":   _scope(None),
    }
