"""
Bybit access helpers for the public Telegram bot.

Mirrors the logic in web_server.py (_init_user_exchange, _bybit_balance,
_bybit_positions) so the userbot is independent of FastAPI / web stack.
"""
import ccxt

from utils.crypto import decrypt_field


def init_user_exchange(key_row):
    """Build a ccxt.bybit client for a user's API key row. Returns None on failure."""
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


def bybit_balance(ex):
    """Raw Bybit V5 USDT balance — tries UNIFIED then CONTRACT."""
    for acct in ("UNIFIED", "CONTRACT"):
        try:
            raw   = ex.private_get_v5_account_wallet_balance({"accountType": acct})
            coins = raw.get("result", {}).get("list", [{}])[0].get("coin", [])
            usdt  = next((c for c in coins if c.get("coin") == "USDT"), {})
            wallet = float(usdt.get("walletBalance") or 0)
            if wallet > 0:
                return {
                    "wallet":         wallet,
                    "equity":         float(usdt.get("equity")              or wallet),
                    "unrealized_pnl": float(usdt.get("unrealisedPnl")       or 0),
                    "usdt_free":      float(usdt.get("availableToWithdraw") or wallet),
                }
        except Exception:
            pass
    return {"wallet": 0.0, "equity": 0.0, "unrealized_pnl": 0.0, "usdt_free": 0.0}


def bybit_positions(ex):
    """Raw Bybit V5 open linear positions — no load_markets needed."""
    raw   = ex.private_get_v5_position_list({"category": "linear", "settleCoin": "USDT"})
    items = raw.get("result", {}).get("list", [])
    result = []
    open_items = [p for p in items if float(p.get("size") or 0) > 0]
    for p in sorted(open_items, key=lambda x: float(x.get("unrealisedPnl") or 0), reverse=True):
        upnl   = float(p.get("unrealisedPnl") or 0)
        margin = float(p.get("positionIM") or 1)
        result.append({
            "symbol":         p["symbol"].replace("USDT", ""),
            "side":           "LONG" if p.get("side") == "Buy" else "SHORT",
            "entry_price":    float(p.get("avgPrice") or 0),
            "mark_price":     float(p.get("markPrice") or 0),
            "qty":            float(p.get("size") or 0),
            "unrealized_pnl": upnl,
            "pnl_pct":        round(upnl / margin * 100, 2) if margin else 0.0,
            "leverage":       int(float(p.get("leverage") or 0)),
        })
    return result
