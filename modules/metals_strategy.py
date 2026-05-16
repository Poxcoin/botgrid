"""
Precious Metals Strategy — XAU (Gold) session-aware trading.

Стратегії:
  1. London Open Breakout (07:00-08:30 UTC = 10:00-11:30 MSK) — пріоритет:
     Фіксуємо Asian range (00:00-07:00 UTC high/low), вхід при пробою ±0.1%
  2. Price momentum: 5-хв зміна > threshold → сигнал з EMA5/EMA20 підтвердженням
  3. DXY (USD Index) фільтр: підтверджує / блокує напрямок (^DXY via yfinance)
  4. HSI (Hang Seng) macro boost: падіння >1.5% → активує macro threshold
  5. Macro news boost: on_macro_news() → знижений поріг на 30 хв

Session thresholds (UTC):
  - 00:00-07:00  Asian session:      0.30% (base)
  - 07:00-08:30  London open entry:  0.20%
  - 08:30-17:00  London session:     0.20%
  - 13:00-17:00  London/NY overlap:  0.20% (highest volatility)
  - macro active:                    0.15%
  - macro + DXY confirms:            0.12%

Outputs:
  - metals_signal_queue: metals_bot.py → executes XAUUSDT trades
  - metals_macro_state.json: main.py → +20% boost to alt-signals for 20 min
"""
import json
import os
import queue
import time
import threading
from datetime import datetime, timezone

import ccxt

import requests as _requests

_YF_AVAILABLE = True  # використовуємо прямий HTTP замість yfinance


def _yahoo_closes(ticker: str, interval: str, range_: str) -> list:
    """Пряме звернення до Yahoo Finance chart API без yfinance."""
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0 Safari/537.36"
        ),
        "Accept": "application/json",
    }
    params = {"interval": interval, "range": range_}
    r = _requests.get(url, headers=headers, params=params, timeout=15)
    r.raise_for_status()
    result = r.json()["chart"]["result"][0]
    closes = result["indicators"]["quote"][0]["close"]
    return [c for c in closes if c is not None]

metals_signal_queue: queue.Queue = queue.Queue()

_STATE_FILE = os.path.join(os.path.dirname(__file__), "..", "metals_macro_state.json")

# Bybit public (no auth — price data only)
_bybit_pub = ccxt.bybit({"enableRateLimit": True, "options": {"defaultType": "swap"}})

# ── Timing ────────────────────────────────────────────────────────────────────
POLL_INTERVAL  = 60
COOLDOWN_SEC   = 4 * 3600

# ── Momentum thresholds ───────────────────────────────────────────────────────
MOMENTUM_PCT      = 0.30   # baseline (Asian session, off-hours)
MOMENTUM_SESSION  = 0.20   # London open + London/NY overlap
MOMENTUM_MACRO    = 0.15   # macro news window active
MOMENTUM_CONFIRM  = 0.12   # macro + DXY confirms direction
MACRO_WINDOW      = 1800   # 30 хв — вікно macro boost

# ── Session windows (UTC hours) ───────────────────────────────────────────────
LONDON_OPEN_H   = 7    # 07:00 UTC = 10:00 MSK
LONDON_CLOSE_H  = 17   # 17:00 UTC
NY_OPEN_H       = 13   # 13:00 UTC

# ── DXY filter ────────────────────────────────────────────────────────────────
DXY_CONFIRM_PCT = 0.15   # |DXY 30-хв зміна| що підтверджує напрямок
DXY_BLOCK_PCT   = 0.30   # |DXY 30-хв зміна| що блокує протилежний напрямок

WATCHLIST = [
    {"name": "XAU", "symbol": "XAU/USDT:USDT", "tp": 1.5, "sl": 1.0},
    # {"name": "XAG", "symbol": "XAG/USDT:USDT", "tp": 2.5, "sl": 1.2},
]

_MACRO_KW = frozenset({
    # US macro / Fed
    "cpi", "ppi", "inflation", "federal reserve", "fed rate", "fomc",
    "rate cut", "rate hike", "interest rate", "powell", "yellen", "warsh",
    "debt ceiling", "treasury yield", "fed chair", "retail sales", "jobs report", "nonfarm",
    # Geopolitics / crisis
    "nuclear", "invasion", "war declared", "military strike", "world war",
    "recession", "banking crisis", "financial crisis", "bank run",
    "sanctions", "trade war", "trade deal", "trade agreement", "geopolit",
    # Gold / safe haven
    "gold rally", "gold surge", "gold hits", "gold record",
    "silver rally", "dollar weakens", "safe haven",
    # US-China trade
    "tariff", "tariff pause", "us-china",
    # Chinese market — PBoC policy + demand = biggest gold driver after USD
    "pboc", "people's bank of china", "china rate", "china pmi",
    "shanghai composite", "csi 300", "hang seng", "shenzhen",
    "yuan devaluation", "yuan weakens", "renminbi", "rmb",
    "chinese demand", "china gold", "chinese gold",
    "china gdp", "china growth", "china slowdown",
    # Asian session / broader Asia
    "nikkei", "asia market", "asia open", "asian stocks",
    "bank of japan", "boj", "japan inflation",
})

_macro_ts: float = 0.0
_dxy_cache: dict = {"ts": 0.0, "change": 0.0}
_hsi_cache: dict = {"ts": 0.0, "change": 0.0}


def on_macro_news(news_item: dict) -> None:
    """Викликається з main.py для кожної оброблюваної новини."""
    global _macro_ts
    text = (
        news_item.get("title", "") + " " + news_item.get("description", "")
    ).lower()
    if any(kw in text for kw in _MACRO_KW):
        _macro_ts = time.time()
        print(f"[METALS] 📰 Macro: {news_item['title'][:70]}")


# ── External market data ──────────────────────────────────────────────────────

def _get_dxy_change() -> float:
    """DXY 30-хв зміна %. Positive = USD strengthens = bearish for gold."""
    cache = _dxy_cache
    if time.time() - cache["ts"] < 1800:  # 30-хв кеш
        return cache["change"]
    try:
        closes = _yahoo_closes("^DXY", "5m", "1d")
        if len(closes) < 8:
            cache["ts"] = time.time()
            return 0.0
        change = (closes[-1] - closes[-7]) / closes[-7] * 100
        cache["ts"] = time.time()
        cache["change"] = round(float(change), 3)
        return cache["change"]
    except Exception:
        cache["ts"] = time.time()
        return 0.0


def _get_hsi_change() -> float:
    """Hang Seng денна зміна %. Negative = risk-off = позитив для золота."""
    cache = _hsi_cache
    if time.time() - cache["ts"] < 14400:  # 4-год кеш (HSI оновлюється раз на день)
        return cache["change"]
    try:
        closes = _yahoo_closes("^HSI", "1d", "5d")
        if len(closes) < 2:
            cache["ts"] = time.time()
            return 0.0
        change = (closes[-1] - closes[-2]) / closes[-2] * 100
        cache["ts"] = time.time()
        cache["change"] = round(float(change), 3)
        return cache["change"]
    except Exception:
        cache["ts"] = time.time()
        return 0.0


# ── Session helpers ───────────────────────────────────────────────────────────

def _session_threshold() -> float:
    """Порог momentum залежно від поточної сесії + macro стану."""
    h = datetime.now(timezone.utc).hour
    m = datetime.now(timezone.utc).minute
    macro_active = time.time() - _macro_ts < MACRO_WINDOW

    if macro_active:
        dxy = _get_dxy_change()
        if abs(dxy) >= DXY_CONFIRM_PCT:
            return MOMENTUM_CONFIRM
        return MOMENTUM_MACRO

    in_london_entry = (h == LONDON_OPEN_H) or (h == LONDON_OPEN_H + 1 and m <= 30)
    in_active_session = (LONDON_OPEN_H <= h < LONDON_CLOSE_H) or (NY_OPEN_H <= h < LONDON_CLOSE_H)

    if in_london_entry or in_active_session:
        return MOMENTUM_SESSION

    return MOMENTUM_PCT


def _dxy_confirms(action: str) -> bool:
    """True якщо DXY підтверджує напрямок: LONG=USD слабшає, SHORT=USD зростає."""
    dxy = _get_dxy_change()
    if action == "LONG"  and dxy <= -DXY_CONFIRM_PCT:
        return True
    if action == "SHORT" and dxy >= DXY_CONFIRM_PCT:
        return True
    return False


def _dxy_blocks(action: str) -> bool:
    """True якщо DXY сильно суперечить напрямку — блокуємо сигнал."""
    dxy = _get_dxy_change()
    if action == "LONG"  and dxy >= DXY_BLOCK_PCT:
        return True   # USD rising hard → don't buy gold
    if action == "SHORT" and dxy <= -DXY_BLOCK_PCT:
        return True   # USD falling hard → don't short gold
    return False


# ── Asian range + London Open breakout ───────────────────────────────────────

def _get_asian_range(symbol: str) -> tuple[float, float]:
    """High/low Asian session (00:00-07:00 UTC) for the current day."""
    try:
        bars = _bybit_pub.fetch_ohlcv(symbol, "1h", limit=24)
        if not bars:
            return 0.0, 0.0
        now_utc = datetime.now(timezone.utc)
        day_start_ms = int(now_utc.replace(hour=0, minute=0, second=0, microsecond=0).timestamp() * 1000)
        asian_end_ms  = int(now_utc.replace(hour=7, minute=0, second=0, microsecond=0).timestamp() * 1000)
        asian_bars = [b for b in bars if day_start_ms <= b[0] < asian_end_ms]
        if not asian_bars:
            return 0.0, 0.0
        return max(b[2] for b in asian_bars), min(b[3] for b in asian_bars)
    except Exception:
        return 0.0, 0.0


def _check_london_breakout(symbol: str, item: dict) -> dict | None:
    """
    London Open Breakout (07:00-08:30 UTC = 10:00-11:30 MSK).
    Повертає сигнал якщо ціна пробила Asian range, або None.
    """
    now_utc = datetime.now(timezone.utc)
    h, m = now_utc.hour, now_utc.minute
    if not ((h == LONDON_OPEN_H) or (h == LONDON_OPEN_H + 1 and m <= 30)):
        return None

    range_high, range_low = _get_asian_range(symbol)
    if range_high == 0.0 or range_low == 0.0:
        return None

    try:
        ticker = _bybit_pub.fetch_ticker(symbol)
        price = ticker["last"]
    except Exception:
        return None

    breakout_up   = price > range_high * 1.001
    breakout_down = price < range_low  * 0.999

    if not breakout_up and not breakout_down:
        return None

    action = "LONG" if breakout_up else "SHORT"

    if _dxy_blocks(action):
        return None

    range_size   = (range_high - range_low) / range_low * 100
    dxy          = _get_dxy_change()
    hsi          = _get_hsi_change()
    macro_active = time.time() - _macro_ts < MACRO_WINDOW
    dxy_conf     = _dxy_confirms(action)

    score = round(range_size * 25 * (1.2 if dxy_conf else 1.0), 1)

    print(
        f"[METALS] 🇬🇧 London Breakout {action} {item['name']} | "
        f"range={range_size:.2f}% | price={price:.2f} | "
        f"DXY={dxy:+.2f}% HSI={hsi:+.2f}%"
    )

    return {
        "coin":        item["name"],
        "action":      action,
        "total_score": score,
        "confidence":  min(int(range_size * 200), 90),
        "source":      "Metals London Open",
        "news_title": (
            f"[METALS] 🇬🇧 London Open {action} {item['name']}: "
            f"пробій Asian range ({range_size:.2f}%)"
            + (" | 📰 macro" if macro_active else "")
            + (f" | DXY {dxy:+.2f}%" if abs(dxy) >= DXY_CONFIRM_PCT else "")
        ),
        "bot_tag":   "🥇",
        "is_metals": True,
        "tp_pct":    item["tp"],
        "sl_pct":    item["sl"],
        "timestamp": now_utc.isoformat(),
        "components": {
            "price":           price,
            "asian_range_h":   range_high,
            "asian_range_l":   range_low,
            "range_size_pct":  range_size,
            "dxy_change":      dxy,
            "hsi_change":      hsi,
            "dxy_confirmed":   dxy_conf,
            "macro_active":    macro_active,
            "trigger":         "london_breakout",
        },
    }


# ── EMA + momentum ────────────────────────────────────────────────────────────

def _ema(closes: list[float], period: int) -> float:
    if len(closes) < period:
        return closes[-1] if closes else 0.0
    k = 2 / (period + 1)
    val = sum(closes[:period]) / period
    for c in closes[period:]:
        val = c * k + val * (1 - k)
    return val


def _get_momentum(symbol: str) -> tuple[float, float, str | None]:
    """(price, 5m_change_pct, action_or_None)"""
    bars = _bybit_pub.fetch_ohlcv(symbol, "1m", limit=22)
    if len(bars) < 7:
        return 0.0, 0.0, None

    closes  = [b[4] for b in bars]
    current = closes[-1]
    change  = (current - closes[-6]) / closes[-6] * 100

    ema5  = _ema(closes, 5)
    ema20 = _ema(closes, 20)

    threshold = _session_threshold()

    if change >= threshold and ema5 > ema20:
        action = "LONG"
    elif change <= -threshold and ema5 < ema20:
        action = "SHORT"
    else:
        return current, change, None

    if _dxy_blocks(action):
        return current, change, None

    return current, change, action


# ── State I/O ─────────────────────────────────────────────────────────────────

def _write_macro_state(name: str, action: str, change: float) -> None:
    try:
        with open(_STATE_FILE, "w") as f:
            json.dump({"ts": time.time(), "name": name, "action": action, "change": change}, f)
    except Exception:
        pass


def read_macro_state() -> dict | None:
    try:
        with open(_STATE_FILE) as f:
            data = json.load(f)
        if time.time() - data.get("ts", 0) < 1200:
            return data
    except Exception:
        pass
    return None


# ── Main loop ─────────────────────────────────────────────────────────────────

def _strategy_loop() -> None:
    global _macro_ts
    print(
        f"[METALS] 🥇 Metals Strategy запущена | "
        f"thresholds: base={MOMENTUM_PCT}% session={MOMENTUM_SESSION}% "
        f"macro={MOMENTUM_MACRO}% confirm={MOMENTUM_CONFIRM}% | "
        f"DXY+HSI={'enabled' if _YF_AVAILABLE else 'disabled (install yfinance)'}"
    )
    _cooldowns:    dict[str, float] = {}
    _london_fired: dict[str, str]   = {}  # name → date string, fires once/day

    while True:
        try:
            now = time.time()
            h   = datetime.now(timezone.utc).hour

            # ── HSI macro boost ───────────────────────────────────────────
            hsi = _get_hsi_change()
            if hsi <= -1.5 and time.time() - _macro_ts > MACRO_WINDOW:
                _macro_ts = time.time()
                print(f"[METALS] 📉 HSI {hsi:+.2f}% → macro boost activated (risk-off)")

            # ── Session state log (once at session open) ──────────────────
            if h in (LONDON_OPEN_H, NY_OPEN_H) and datetime.now(timezone.utc).minute < 2:
                dxy = _get_dxy_change()
                thr = _session_threshold()
                session = "London Open" if h == LONDON_OPEN_H else "NY Open"
                print(f"[METALS] 📊 {session} | DXY={dxy:+.2f}% HSI={hsi:+.2f}% threshold={thr}%")

            for item in WATCHLIST:
                name   = item["name"]
                symbol = item["symbol"]

                if now - _cooldowns.get(name, 0) < COOLDOWN_SEC:
                    continue

                # ── London Open Breakout (once per day, priority) ─────────
                today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
                if _london_fired.get(name) != today:
                    sig = _check_london_breakout(symbol, item)
                    if sig:
                        _london_fired[name] = today
                        _cooldowns[name] = now
                        metals_signal_queue.put_nowait(sig)
                        _write_macro_state(name, sig["action"], sig["components"]["range_size_pct"])
                        continue

                # ── Regular momentum signal ───────────────────────────────
                try:
                    price, change, action = _get_momentum(symbol)
                except Exception as e:
                    print(f"[METALS] {name} fetch error: {e}")
                    continue

                if not action:
                    continue

                dxy          = _get_dxy_change()
                dxy_conf     = _dxy_confirms(action)
                macro_active = time.time() - _macro_ts < MACRO_WINDOW
                thr          = _session_threshold()

                score = round(abs(change) * 20 * (1.2 if dxy_conf else 1.0), 1)

                sig = {
                    "coin":        name,
                    "action":      action,
                    "total_score": score,
                    "confidence":  min(int(abs(change) * 150), 90),
                    "source":      "Metals Momentum",
                    "news_title": (
                        f"[METALS] {name} {action}: {change:+.2f}% за 5хв"
                        + (" | 📰 macro" if macro_active else "")
                        + (f" | DXY {dxy:+.2f}%✓" if dxy_conf else (f" | DXY {dxy:+.2f}%" if abs(dxy) >= 0.1 else ""))
                        + (f" | HSI {hsi:+.2f}%" if abs(hsi) >= 1.0 else "")
                    ),
                    "bot_tag":   "🥇",
                    "is_metals": True,
                    "tp_pct":    item["tp"],
                    "sl_pct":    item["sl"],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "components": {
                        "price":              price,
                        "change_5m_pct":      change,
                        "macro_active":       macro_active,
                        "dxy_change":         dxy,
                        "hsi_change":         hsi,
                        "dxy_confirmed":      dxy_conf,
                        "session_threshold":  thr,
                        "trigger":            "momentum",
                    },
                }

                _cooldowns[name] = now
                metals_signal_queue.put_nowait(sig)
                _write_macro_state(name, action, change)

                print(
                    f"[METALS] 🥇 {action} {name} | {change:+.2f}% за 5хв | "
                    f"TP={item['tp']}% SL={item['sl']}% | threshold={thr}%"
                    + (" | 📰 macro" if macro_active else "")
                    + (f" | DXY {dxy:+.2f}%✓" if dxy_conf else "")
                )

        except Exception as e:
            print(f"[METALS] loop error: {e}")

        time.sleep(POLL_INTERVAL)


def start_metals_strategy() -> threading.Thread:
    t = threading.Thread(target=_strategy_loop, daemon=True, name="metals-strategy")
    t.start()
    return t
