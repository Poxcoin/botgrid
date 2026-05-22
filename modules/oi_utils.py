"""
modules/oi_utils.py — Open Interest delta helper, extracted from retired
orderflow_engine.py (2026-05-22).

Used by main.py for Signal bot OI delta enrichment.
"""
import time
import threading
from typing import Callable

import ccxt

_OI_TTL = 60  # seconds
_cache: dict = {}
_cache_lock = threading.Lock()
_pub_ex: ccxt.Exchange | None = None


def _get_pub() -> ccxt.Exchange:
    global _pub_ex
    if _pub_ex is None:
        _pub_ex = ccxt.bybit({"enableRateLimit": True})
        _pub_ex.has["fetchCurrencies"] = False
    return _pub_ex


def _cached(key: str, ttl: float, fn: Callable):
    with _cache_lock:
        entry = _cache.get(key)
        if entry and time.time() - entry["ts"] < ttl:
            return entry["val"]
    try:
        val = fn()
    except Exception:
        return None
    with _cache_lock:
        _cache[key] = {"val": val, "ts": time.time()}
    return val


def fetch_oi_delta(symbol: str) -> float:
    """OI % change over last two 5-minute periods. 0.0 on failure."""
    def _fetch():
        ex = _get_pub()
        sym_id = symbol.replace("/USDT:USDT", "USDT")
        resp = ex.publicGetV5MarketOpenInterest({
            "category":     "linear",
            "symbol":       sym_id,
            "intervalTime": "5min",
            "limit":        3,
        })
        data = resp.get("result", {}).get("list", [])
        if len(data) < 2:
            return 0.0
        new_oi = float(data[0].get("openInterest", 0))
        old_oi = float(data[-1].get("openInterest", 0))
        if old_oi == 0:
            return 0.0
        return (new_oi - old_oi) / old_oi * 100.0

    return _cached(f"oi:{symbol}", _OI_TTL, _fetch) or 0.0
