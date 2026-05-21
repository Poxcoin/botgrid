"""
orderflow_engine.py — Market microstructure data: VWAP, OI delta, CVD,
                       Anchored VWAP, CVD Divergence.

Used by signal bot (OI filter), grid bot (VWAP direction), and orderflow bot.
All functions return 0.0 / empty dict on any error — never raise.

CVD source priority:
  1. modules.cvd_realtime (Bybit WS publicTrade accumulator, ~20k trades)
  2. REST fetch_trades fallback (last 500 trades)
The WS source has 40x more depth and ~0 latency vs REST polling.
"""
import time
import threading
import ccxt

from config.settings import IS_DEMO_TRADING

try:
    from modules import cvd_realtime as _cvd_rt
except Exception:
    _cvd_rt = None

_lock = threading.Lock()
_pub: ccxt.Exchange | None = None

# Cache to avoid hammering the API
_cache: dict = {}
_VWAP_TTL    = 60    # seconds
_OI_TTL      = 60
_CVD_TTL     = 30
_AVWAP_TTL   = 300   # 5 min — 4h OHLCV changes slowly
_CVD_DIV_TTL = 60


def _get_pub() -> ccxt.Exchange:
    global _pub
    with _lock:
        if _pub is None:
            _pub = ccxt.bybit({
                "options": {"defaultType": "swap"},
                "enableRateLimit": True,
                "timeout": 15000,
            })
            _pub.has["fetchCurrencies"] = False
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


# ─── Rolling VWAP ─────────────────────────────────────────────────────────────

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
    """OI % change over last two 5-minute periods."""
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


# ─── Cumulative Volume Delta ───────────────────────────────────────────────────

def calc_cvd(symbol: str, limit: int = 500) -> tuple[float, float]:
    """Net buy/sell aggression. Prefers real-time WS accumulator (20k trades),
    falls back to REST snapshot (500 trades) when WS isn't ready.
    Returns (cvd_usdt, total_notional_usdt).
    cvd_ratio_pct = (cvd / total) * 100 → directional bias:
      > 60% = strong buying, < 40% = strong selling, ~50% = balanced
    """
    if _cvd_rt is not None and _cvd_rt.is_ready(symbol):
        sym = symbol.replace("/USDT:USDT", "USDT").replace("/", "")
        cvd, total = _cvd_rt._get_totals(sym)
        if total > 0:
            return cvd, total

    def _fetch():
        ex = _get_pub()
        trades = ex.fetch_trades(symbol, limit=limit, params={"category": "linear"})
        cvd = 0.0
        total = 0.0
        for t in trades:
            notional = float(t["price"]) * float(t["amount"])
            total += notional
            if t["side"] == "buy":
                cvd += notional
            else:
                cvd -= notional
        return cvd, total

    result = _cached(f"cvd:{symbol}:{limit}", _CVD_TTL, _fetch)
    if not result:
        return 0.0, 0.0
    return result


# ─── Anchored VWAP ────────────────────────────────────────────────────────────

def _find_swing_indices(highs: list, lows: list, n: int = 3) -> tuple[int, int]:
    """
    Return (last_swing_high_idx, last_swing_low_idx) from OHLCV arrays.
    Swing high at i: high[i] > all n candles left and right.
    Swing low  at i: low[i]  < all n candles left and right.
    Returns the most recent swing of each type.
    """
    size = len(highs)
    sh_idx = 0
    sl_idx = 0
    for i in range(n, size - n):
        if highs[i] > max(highs[i - n:i]) and highs[i] > max(highs[i + 1:i + n + 1]):
            sh_idx = i
        if lows[i] < min(lows[i - n:i]) and lows[i] < min(lows[i + 1:i + n + 1]):
            sl_idx = i
    return sh_idx, sl_idx


def _avwap_from_idx(ohlcv: list, anchor_idx: int) -> float:
    """Calculate VWAP anchored to ohlcv[anchor_idx] through to the end."""
    window = ohlcv[anchor_idx:]
    if not window:
        return 0.0
    tp_vol = sum((c[2] + c[3] + c[4]) / 3.0 * c[5] for c in window)
    vol    = sum(c[5] for c in window)
    return tp_vol / vol if vol > 0 else 0.0


def calc_anchored_vwap(symbol: str) -> dict:
    """
    Two Anchored VWAPs based on the most recent 4h swing high and swing low.

    avwap_bull: anchored to last swing LOW  → acts as dynamic support
    avwap_bear: anchored to last swing HIGH → acts as dynamic resistance

    Returns:
      avwap_bull       float  (0.0 if unavailable)
      avwap_bear       float
      bull_dev_pct     float  (price vs avwap_bull %)
      bear_dev_pct     float  (price vs avwap_bear %)
      at_bull_support  bool   (price within 0–0.35% ABOVE avwap_bull)
      at_bear_resist   bool   (price within 0–0.35% BELOW avwap_bear)
    """
    def _fetch():
        ex = _get_pub()
        # 30 days of 4h candles = 180 candles; need enough for swing detection
        ohlcv = ex.fetch_ohlcv(symbol, "4h", limit=180, params={"category": "linear"})
        if not ohlcv or len(ohlcv) < 10:
            return _empty_avwap()

        highs = [c[2] for c in ohlcv]
        lows  = [c[3] for c in ohlcv]
        price = ohlcv[-1][4]  # last close as proxy for current price

        sh_idx, sl_idx = _find_swing_indices(highs, lows, n=3)

        avwap_bear = _avwap_from_idx(ohlcv, sh_idx) if sh_idx > 0 else 0.0
        avwap_bull = _avwap_from_idx(ohlcv, sl_idx) if sl_idx > 0 else 0.0

        bull_dev = (price - avwap_bull) / avwap_bull * 100.0 if avwap_bull > 0 else 0.0
        bear_dev = (price - avwap_bear) / avwap_bear * 100.0 if avwap_bear > 0 else 0.0

        # "At support": price is 0–0.35% above avwap_bull (testing it from above)
        at_bull = avwap_bull > 0 and 0.0 <= bull_dev <= 0.35
        # "At resistance": price is 0–0.35% below avwap_bear (testing it from below)
        at_bear = avwap_bear > 0 and -0.35 <= bear_dev <= 0.0

        return {
            "avwap_bull":      round(avwap_bull, 6),
            "avwap_bear":      round(avwap_bear, 6),
            "bull_dev_pct":    round(bull_dev, 3),
            "bear_dev_pct":    round(bear_dev, 3),
            "at_bull_support": at_bull,
            "at_bear_resist":  at_bear,
        }

    result = _cached(f"avwap:{symbol}", _AVWAP_TTL, _fetch)
    return result or _empty_avwap()


def _empty_avwap() -> dict:
    return {
        "avwap_bull": 0.0, "avwap_bear": 0.0,
        "bull_dev_pct": 0.0, "bear_dev_pct": 0.0,
        "at_bull_support": False, "at_bear_resist": False,
    }


# ─── CVD Divergence ───────────────────────────────────────────────────────────

def calc_cvd_divergence(symbol: str, lookback: int = 20) -> dict:
    """
    Detect price/CVD divergence on 15m candles.

    CVD source priority:
      1. Real-time WS accumulator (cvd_realtime) — actual trade sides per tick
      2. OHLCV bar proxy fallback — bullish bar → +volume, bearish → -volume
         (proxy is noisy: 35.9% WR in 90d backtest → fallback only)

    bearish_div: price at/near 20-bar high + CVD cumulative ratio < 47%
                 → distribution (longs added but CVD not confirming) → SHORT
    bullish_div: price at/near 20-bar low  + CVD cumulative ratio > 53%
                 → accumulation (shorts added but CVD not confirming) → LONG

    Returns: {bearish_div, bullish_div, cvd_ratio, cvd_source}
    """
    def _fetch():
        ex = _get_pub()
        ohlcv = ex.fetch_ohlcv(
            symbol, "15m", limit=lookback + 5, params={"category": "linear"}
        )
        if not ohlcv or len(ohlcv) < lookback:
            return {"bearish_div": False, "bullish_div": False, "cvd_ratio": 50.0, "cvd_source": "none"}

        candles = ohlcv[-lookback:]
        highs = [c[2] for c in candles]
        lows  = [c[3] for c in candles]
        cur_high  = highs[-1]
        cur_low   = lows[-1]
        prev_high = max(highs[:-1])
        prev_low  = min(lows[:-1])

        cvd_ratio = 50.0
        source = "proxy"

        # Prefer real CVD bucket series when WS is warm
        if _cvd_rt is not None and _cvd_rt.is_ready(symbol):
            try:
                rt = _cvd_rt.get_real_cvd_divergence(symbol, lookback=2000)
                cvd_ratio = float(rt.get("cvd_ratio", 50.0))
                source = "real"
            except Exception:
                pass

        if source == "proxy":
            # Fallback: cumulative CVD from OHLCV bars (close>=open → +vol)
            running = 0.0
            cvd_series = []
            for c in candles:
                bar_cvd = c[5] if c[4] >= c[1] else -c[5]
                running += bar_cvd
                cvd_series.append(running)
            cvd_min, cvd_max = min(cvd_series), max(cvd_series)
            rng = cvd_max - cvd_min
            cvd_ratio = ((cvd_series[-1] - cvd_min) / rng * 100.0) if rng > 0 else 50.0

        bearish_div = (cur_high >= prev_high * 0.998) and (cvd_ratio < 47.0)
        bullish_div = (cur_low  <= prev_low  * 1.002) and (cvd_ratio > 53.0)

        return {
            "bearish_div": bearish_div,
            "bullish_div": bullish_div,
            "cvd_ratio":   round(cvd_ratio, 1),
            "cvd_source":  source,
        }

    result = _cached(f"cvd_div:{symbol}", _CVD_DIV_TTL, _fetch)
    return result or {"bearish_div": False, "bullish_div": False, "cvd_ratio": 50.0, "cvd_source": "none"}


# ─── All-in-one context ────────────────────────────────────────────────────────

def get_orderflow_context(symbol: str) -> dict:
    """
    Combined orderflow context for a symbol.

    Returns:
      price            float
      vwap             float   (8h rolling)
      vwap_dev_pct     float
      oi_delta_pct     float
      cvd_usdt         float
      cvd_ratio_pct    float   (50=balanced, >60=buying, <40=selling)
      bias             str     "long"|"short"|"neutral"
      avwap_bull       float   (anchored to last swing low — support)
      avwap_bear       float   (anchored to last swing high — resistance)
      bull_dev_pct     float   (price distance from avwap_bull %)
      bear_dev_pct     float   (price distance from avwap_bear %)
      at_bull_support  bool    (price within 0.35% above avwap_bull)
      at_bear_resist   bool    (price within 0.35% below avwap_bear)
      cvd_bearish_div  bool    (price new high + CVD not confirming → short)
      cvd_bullish_div  bool    (price new low  + CVD not confirming → long)
      cvd_div_ratio    float
    """
    try:
        ex  = _get_pub()
        tkr = ex.fetch_ticker(symbol, params={"category": "linear"})
        price = float(tkr["last"])
    except Exception:
        price = 0.0

    vwap                = calc_vwap(symbol)
    oi_delta            = fetch_oi_delta(symbol)
    cvd, total_notional = calc_cvd(symbol)
    avwap               = calc_anchored_vwap(symbol)
    cvd_div             = calc_cvd_divergence(symbol)

    vwap_dev     = (price - vwap) / vwap * 100.0 if vwap > 0 else 0.0
    cvd_ratio_pct = (cvd / total_notional * 100.0 + 100.0) / 2.0 if total_notional > 0 else 50.0

    long_cond  = price > vwap and cvd > 0 and oi_delta > 0
    short_cond = price < vwap and cvd < 0 and oi_delta > 0
    bias = "long" if long_cond else ("short" if short_cond else "neutral")

    return {
        "price":           price,
        "vwap":            vwap,
        "vwap_dev_pct":    vwap_dev,
        "oi_delta_pct":    oi_delta,
        "cvd_usdt":        cvd,
        "cvd_ratio_pct":   cvd_ratio_pct,
        "bias":            bias,
        # Anchored VWAP
        "avwap_bull":      avwap["avwap_bull"],
        "avwap_bear":      avwap["avwap_bear"],
        "bull_dev_pct":    avwap["bull_dev_pct"],
        "bear_dev_pct":    avwap["bear_dev_pct"],
        "at_bull_support": avwap["at_bull_support"],
        "at_bear_resist":  avwap["at_bear_resist"],
        # CVD Divergence
        "cvd_bearish_div": cvd_div["bearish_div"],
        "cvd_bullish_div": cvd_div["bullish_div"],
        "cvd_div_ratio":   cvd_div["cvd_ratio"],
        "cvd_source":      cvd_div.get("cvd_source", "proxy"),
    }
