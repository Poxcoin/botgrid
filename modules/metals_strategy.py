"""
Precious Metals Strategy — XAU (Gold) momentum trading.

Логіка:
  1. Ціновий момент: XAUUSDT 5-хв зміна > MOMENTUM_PCT → сигнал в напрямку руху
  2. Macro news boost: on_macro_news() знижує поріг з 0.30% до 0.15%
     (якщо macro news в останні 30 хв: CPI/Fed/геополітика)

Два output:
  - metals_signal_queue: metals_bot.py читає → виконує XAUUSDT угоди
  - metals_macro_state.json: main.py читає → +20% boost до alt-сигналів на 20 хв

EMA підтвердження (1m bars): LONG тільки якщо EMA5 > EMA20, SHORT навпаки.
"""
import json
import os
import queue
import time
import threading
from datetime import datetime, timezone

import ccxt

metals_signal_queue: queue.Queue = queue.Queue()

_STATE_FILE = os.path.join(os.path.dirname(__file__), "..", "metals_macro_state.json")

# Bybit public (no auth — price data only)
_bybit_pub = ccxt.bybit({"enableRateLimit": True, "options": {"defaultType": "swap"}})

POLL_INTERVAL  = 60      # 1 хвилина
COOLDOWN_SEC   = 4 * 3600
MOMENTUM_PCT   = 0.30    # 5-хв зміна % → сигнал (нормально)
MOMENTUM_MACRO = 0.15    # знижений поріг при macro news
MACRO_WINDOW   = 1800    # 30 хв — вікно macro boost

WATCHLIST = [
    {"name": "XAU", "symbol": "XAU/USDT:USDT", "tp": 1.5, "sl": 1.0},
    # {"name": "XAG", "symbol": "XAG/USDT:USDT", "tp": 2.5, "sl": 1.2},  # додати якщо є на Bybit
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
    # Chinese market (PBoC policy + demand = biggest gold driver after USD)
    "pboc", "people's bank of china", "china rate", "china pmi",
    "shanghai composite", "csi 300", "hang seng", "shenzhen",
    "yuan devaluation", "yuan weakens", "renminbi", "rmb",
    "chinese demand", "china gold", "chinese gold",
    "china gdp", "china growth", "china slowdown",
    # Asian session / broader Asia
    "nikkei", "asia market", "asia open", "asian stocks",
    "bank of japan", "boj", "japan inflation",
})

_macro_ts: float = 0.0  # GIL-safe single float


def on_macro_news(news_item: dict) -> None:
    """Викликається з main.py для кожної оброблюваної новини."""
    global _macro_ts
    text = (
        news_item.get("title", "") + " " + news_item.get("description", "")
    ).lower()
    if any(kw in text for kw in _MACRO_KW):
        _macro_ts = time.time()
        print(f"[METALS] 📰 Macro: {news_item['title'][:70]}")


def _write_macro_state(name: str, action: str, change: float) -> None:
    """Пише стан для cross-process boost в main.py."""
    try:
        with open(_STATE_FILE, "w") as f:
            json.dump({
                "ts":     time.time(),
                "name":   name,
                "action": action,
                "change": change,
            }, f)
    except Exception:
        pass


def read_macro_state() -> dict | None:
    """main.py читає цей файл щоб застосувати boost до alt-сигналів."""
    try:
        with open(_STATE_FILE) as f:
            data = json.load(f)
        if time.time() - data.get("ts", 0) < 1200:  # 20 хв вікно
            return data
    except Exception:
        pass
    return None


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

    threshold = MOMENTUM_MACRO if time.time() - _macro_ts < MACRO_WINDOW else MOMENTUM_PCT

    if change >= threshold and ema5 > ema20:
        return current, change, "LONG"
    if change <= -threshold and ema5 < ema20:
        return current, change, "SHORT"
    return current, change, None


def _strategy_loop() -> None:
    print(
        f"[METALS] 🥇 Metals Strategy запущена | "
        f"поріг {MOMENTUM_PCT}% | macro поріг {MOMENTUM_MACRO}%"
    )
    _cooldowns: dict[str, float] = {}

    while True:
        try:
            now = time.time()
            macro_active = now - _macro_ts < MACRO_WINDOW

            for item in WATCHLIST:
                name   = item["name"]
                symbol = item["symbol"]

                if now - _cooldowns.get(name, 0) < COOLDOWN_SEC:
                    continue

                try:
                    price, change, action = _get_momentum(symbol)
                except Exception as e:
                    print(f"[METALS] {name} fetch error: {e}")
                    continue

                if not action:
                    continue

                sig = {
                    "coin":        name,
                    "action":      action,
                    "total_score": round(abs(change) * 20, 1),
                    "confidence":  min(int(abs(change) * 150), 90),
                    "source":      "Metals Momentum",
                    "news_title":  (
                        f"[METALS] {name} {action}: {change:+.2f}% за 5хв"
                        + (" | 📰 macro" if macro_active else "")
                    ),
                    "bot_tag":     "🥇",
                    "is_metals":   True,
                    "tp_pct":      item["tp"],
                    "sl_pct":      item["sl"],
                    "timestamp":   datetime.now(timezone.utc).isoformat(),
                    "components": {
                        "price":         price,
                        "change_5m_pct": change,
                        "macro_active":  macro_active,
                    },
                }

                _cooldowns[name] = now
                metals_signal_queue.put_nowait(sig)
                _write_macro_state(name, action, change)

                print(
                    f"[METALS] 🥇 {action} {name} | {change:+.2f}% за 5хв | "
                    f"TP={item['tp']}% SL={item['sl']}%"
                    + (" | 📰 macro boost" if macro_active else "")
                )

        except Exception as e:
            print(f"[METALS] loop error: {e}")

        time.sleep(POLL_INTERVAL)


def start_metals_strategy() -> threading.Thread:
    t = threading.Thread(target=_strategy_loop, daemon=True, name="metals-strategy")
    t.start()
    return t
