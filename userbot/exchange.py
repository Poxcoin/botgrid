"""
Bybit access helpers for the public Telegram bot.

Thin wrappers around modules.bybit_client — preserves the existing
function names + return shapes used by userbot/handlers.py.
"""
from modules.bybit_client import (
    build_from_key_row as _bc_build_from_key_row,
    get_balance as _bc_get_balance,
    get_positions as _bc_get_positions,
)


def init_user_exchange(key_row):
    return _bc_build_from_key_row(key_row)


def bybit_balance(ex):
    b = _bc_get_balance(ex)
    return {
        "wallet":         b["wallet"],
        "equity":         b["equity"],
        "unrealized_pnl": b["unrealized_pnl"],
        "usdt_free":      b["usdt_free"],
    }


def bybit_positions(ex):
    out = []
    for p in _bc_get_positions(ex):
        out.append({
            "symbol":         p["coin"],
            "side":           p["side"],
            "entry_price":    p["entry_price"],
            "mark_price":     p["mark_price"],
            "qty":            p["qty"],
            "unrealized_pnl": p["unrealized_pnl"],
            "pnl_pct":        p["pnl_pct"],
            "leverage":       p["leverage"],
        })
    return out
