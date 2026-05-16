"""
orderflow_engine.py — Market microstructure data: VWAP, OI delta, CVD.

Used by signal bot (OI filter), grid bot (VWAP direction), and orderflow bot.
All functions return 0.0 / empty dict on any error — never raise.
"""
import time
import threading
import ccxt

from config.settings import IS_DEMO_TRADING

_lock = threading.Lock()
_pub: ccxt.Exchange | None = None

# Cache to avoid hammering the API
_cache: dict = {}   # key → {"ts": float, "data": any}
_VWAP_TTL  = 60     # seconds — recalc VWAP every minute
_OI_TTL    = 60     # OI changes slowly, 1-min cache is fine
_CVD_TTL   = 30     # CVD is more real-time sensitive


def _get_pub() -> ccxt.Exchange:
    global _pub
    with _lock:
        if _pub is None:
            _pub = ccxt.bybit({
                "options": {"defaultType": "swap"},
                "enableRateLimit": True,
            })
            _pub.has["fetchCurrencies"] = False
            if IS_DEMO_TRADING:
                _pub.urls["api"] = _pub.urls["demotrading"]
            _pub.load_markets()
    return _pub


def _cached(key: str, ttl: float, fn):
    """Run fn() and cache result for ttl seconds."""
    c = _cache.get(key, {})
    if time.time() - c.get("ts", 0) < ttl:
        return c["data"]
    try:
        result = fn()
    except Exception:
        return c.get("data")  # return stale on error
    _cache[key] = {"ts": time.time(), "data": result}
    return result


# ─── VWAP ─────────────────────────────────────────────────────────────────────

def calc_vwap(symbol: str, hours: int = 8) -> float:
    """Volume-weighted average price over last N hours (1m candles)."""
    def _fetch():
        ex = _get_pub()
        limit = min(hours * 60, 1000)
        ohlcv = ex.fetch_ohlcv(symbol, "1m", limit=limit, params={"category": "linear"})
        if not ohlcv:
            return 0.0
        tp_vol = sum((c[2] + c[3] + c[4]) / 3.0 * c[5] for c in ohlcv)
        vol    = sum(c[5] for c in ohlcv)
        return tp_vol / vol if vol > 0 else 0.0

    return _cached(f"vwap:{symbol}:{hours}h", _VWAP_TTL, _fetch) or 0.0


# ─── Open Interest Delta ───────────────────────────────────────────────────────

def fetch_oi_delta(symbol: str) -> float:
    """OI % change over last two 5-minute periods.
    Positive  → new positions opening (trend conviction)
    Negative  → positions closing (momentum fading)
    """
    def _fetch():
        ex = _get_pub()
        # ccxt unifies open interest history
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
        # list is newest-first
        new_oi = float(data[0].get("openInterest", 0))
        old_oi = float(data[-1].get("openInterest", 0))
        if old_oi == 0:
            return 0.0
        return (new_oi - old_oi) / old_oi * 100.0

    return _cached(f"oi:{symbol}", _OI_TTL, _fetch) or 0.0


# ─── Cumulative Volume Delta ───────────────────────────────────────────────────

def calc_cvd(symbol: str, limit: int = 500) -> float:
    """Net buy/sell aggression from recent trades in USDT notional.
    Positive → buyers hitting ask (bullish aggression)
    Negative → sellers hitting bid (bearish aggression)
    """
    def _fetch():
        ex = _get_pub()
        trades = ex.fetch_trades(symbol, limit=limit, params={"category": "linear"})
        cvd = 0.0
        for t in trades:
            notional = float(t["price"]) * float(t["amount"])
            if t["side"] == "buy":
                cvd += notional
            else:
                cvd -= notional
        return cvd

    return _cached(f"cvd:{symbol}:{limit}", _CVD_TTL, _fetch) or 0.0


# ─── All-in-one context ────────────────────────────────────────────────────────

def get_orderflow_context(symbol: str) -> dict:
    """Returns combined orderflow context for a symbol.

    Returns dict with:
      price           float
      vwap            float
      vwap_dev_pct    float  (how far price is from VWAP, %)
      oi_delta_pct    float  (OI change %, positive = growing)
      cvd_usdt        float  (net buy pressure in USDT)
      bias            str    "long" | "short" | "neutral"
    """
    try:
        ex  = _get_pub()
        tkr = ex.fetch_ticker(symbol, params={"category": "linear"})
        price = float(tkr["last"])
    except Exception:
        price = 0.0

    vwap      = calc_vwap(symbol)
    oi_delta  = fetch_oi_delta(symbol)
    cvd       = calc_cvd(symbol)
    vwap_dev  = (price - vwap) / vwap * 100.0 if vwap > 0 else 0.0

    long_cond  = price > vwap and cvd > 0 and oi_delta > 0
    short_cond = price < vwap and cvd < 0 and oi_delta > 0
    bias = "long" if long_cond else ("short" if short_cond else "neutral")

    return {
        "price":        price,
        "vwap":         vwap,
        "vwap_dev_pct": vwap_dev,
        "oi_delta_pct": oi_delta,
        "cvd_usdt":     cvd,
        "bias":         bias,
    }
