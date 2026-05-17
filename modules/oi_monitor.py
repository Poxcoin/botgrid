"""
oi_monitor.py — Binance OI + basis (spot/perp premium) monitor.

Безкоштовний Binance Futures API, без ключа.

Сигнали:
  "coil"   — OI зростає >5% за 1h, ціна flat (<±1%) → накопичення, вибух близько
  "unwind" — OI падає >5% за 1h + ціна падає → примусові закриття, слабкість
  "normal" — нічого особливого

Використання:
    from modules.oi_monitor import start_oi_monitor, get_oi_context
    start_oi_monitor()
    ctx = get_oi_context("BTC")  # {"oi_1h_pct": 2.3, "basis_pct": 0.12, "signal": "coil", "reason": "..."}
"""
import time
import threading
import requests

_BASE = "https://fapi.binance.com"
_COINS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "LINK", "UNI", "ARB"]
_POLL_SEC = 300   # 5 хв
_LOCK = threading.Lock()
_cache: dict[str, dict] = {}


def _fetch_oi_hist(symbol: str) -> list[dict]:
    try:
        r = requests.get(
            f"{_BASE}/futures/data/openInterestHist",
            params={"symbol": symbol, "period": "1h", "limit": 3},
            timeout=8,
        )
        return r.json() if r.ok else []
    except Exception:
        return []


def _fetch_premium(symbol: str) -> float:
    """Returns basis % = (markPrice - indexPrice) / indexPrice * 100."""
    try:
        r = requests.get(f"{_BASE}/fapi/v1/premiumIndex", params={"symbol": symbol}, timeout=5)
        d = r.json()
        mark  = float(d.get("markPrice", 0))
        index = float(d.get("indexPrice", 1))
        return round((mark - index) / index * 100, 4) if index else 0.0
    except Exception:
        return 0.0


def _fetch_price_change(symbol: str) -> float:
    """Returns 1h price change %."""
    try:
        r = requests.get(
            f"{_BASE}/fapi/v1/klines",
            params={"symbol": symbol, "interval": "1h", "limit": 2},
            timeout=5,
        )
        data = r.json()
        if len(data) < 2:
            return 0.0
        open_price  = float(data[0][1])
        close_price = float(data[-1][4])
        return round((close_price - open_price) / open_price * 100, 3) if open_price else 0.0
    except Exception:
        return 0.0


def _compute(coin: str) -> dict:
    sym = f"{coin}USDT"
    hist = _fetch_oi_hist(sym)
    oi_1h_pct = 0.0
    if len(hist) >= 2:
        old_oi = float(hist[0].get("sumOpenInterest", 0))
        new_oi = float(hist[-1].get("sumOpenInterest", 0))
        if old_oi > 0:
            oi_1h_pct = round((new_oi - old_oi) / old_oi * 100, 3)

    basis_pct   = _fetch_premium(sym)
    price_1h    = _fetch_price_change(sym)

    signal = "normal"
    reason = ""
    if oi_1h_pct > 5.0 and abs(price_1h) < 1.0:
        signal = "coil"
        reason = f"OI +{oi_1h_pct:.1f}%/1h, ціна flat ({price_1h:+.1f}%) — вибух наближається"
    elif oi_1h_pct < -5.0 and price_1h < -0.5:
        signal = "unwind"
        reason = f"OI {oi_1h_pct:.1f}%/1h, ціна {price_1h:+.1f}% — позиції закриваються"
    elif abs(basis_pct) > 0.5:
        bias = "перегрів лонгів" if basis_pct > 0 else "перегрів шортів"
        reason = f"Basis {basis_pct:+.2f}% ({bias})"

    return {
        "coin":       coin,
        "oi_1h_pct":  oi_1h_pct,
        "basis_pct":  basis_pct,
        "price_1h":   price_1h,
        "signal":     signal,
        "reason":     reason,
        "ts":         time.time(),
    }


def _poll_loop():
    while True:
        for coin in _COINS:
            try:
                result = _compute(coin)
                with _LOCK:
                    _cache[coin.upper()] = result
                if result["signal"] != "normal":
                    print(f"[OI] {coin}: {result['reason']}")
            except Exception as e:
                print(f"[OI] {coin} error: {e}")
            time.sleep(0.5)
        time.sleep(_POLL_SEC)


def start_oi_monitor():
    t = threading.Thread(target=_poll_loop, name="oi-monitor", daemon=True)
    t.start()
    print("[OI] Monitor запущено (Binance, 5хв оновлення)")


def get_oi_context(coin: str) -> dict:
    """Returns cached OI context for a coin, or empty dict if not yet available."""
    with _LOCK:
        return _cache.get(coin.upper(), {})
