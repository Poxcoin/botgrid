"""
Funding Rate Collection Strategy.

Edge: входимо за ≤60 хв до funding payment (00:00 / 08:00 / 16:00 UTC),
      збираємо funding ≥ 0.10% + потенційний price squeeze.

За даними BitMEX 9-річного дослідження, основна частина прибутку FR
стратегії — це сам funding payment, а не цінова реверсія.
Tight TP/SL (3%/2%) мінімізує час під ризиком.

Фільтри:
  LONG : |FR| ≥ 0.10% (negative) + EMA50 > EMA200 (4h) + RSI < 60 + BTC macro OK
  SHORT: |FR| ≥ 0.10% (positive) + RSI > 45 + BTC macro OK
"""
import json
import os
import time
import threading
import queue
from datetime import datetime, timezone

from modules.market_data import get_market_metrics, exchange as _binance_ex

funding_queue: queue.Queue = queue.Queue()

_CD_FILE = os.path.join(os.path.dirname(__file__), "..", "coin_cooldown.json")


def _load_cooldowns() -> dict:
    try:
        with open(_CD_FILE) as f:
            raw = json.load(f)
        now = time.time()
        return {k: v for k, v in raw.items() if now - v < COIN_COOLDOWN_SEC}
    except Exception:
        return {}


def _save_cooldown(coin: str, ts: float) -> None:
    try:
        try:
            with open(_CD_FILE) as f:
                data = json.load(f)
        except Exception:
            data = {}
        data[coin] = ts
        with open(_CD_FILE, "w") as f:
            json.dump(data, f)
    except Exception:
        pass


# ── Таймінги ──────────────────────────────────────────────────────────────────
POLL_INTERVAL    = 60     # 1 хвилина — треба надійно ловити 20-хв вікно
COIN_SLEEP       = 1.5    # пауза між монетами
COIN_COOLDOWN_SEC = 4 * 3600  # 4h — не торгуємо ту саму монету в одному funding-циклі
ENTRY_WINDOW_MIN  = 20    # входимо тільки якщо до наступного funding ≤ 20 хв

# ── FR пороги ─────────────────────────────────────────────────────────────────
FR_MIN  = 0.05   # мінімум: комісія ~0.10% → net ≥ 0.08% за угоду
FR_HIGH = 0.30   # size_multiplier 1.5 тільки для справді великих FR

# ── Допоміжні фільтри (спрощені — чиста колекція не потребує напрямкових фільтрів) ──
RSI_LONG_MAX  = 75   # блокуємо тільки явний перегрів
RSI_SHORT_MIN = 25   # блокуємо тільки явний перепродаж

BTC_LONG_BLOCK_TREND  = -3.0   # блокуємо тільки при сильному обвалі BTC
BTC_SHORT_BLOCK_TREND = +0.5   # блокуємо SHORT вже при помірному зростанні BTC

# ── Watchlist ─────────────────────────────────────────────────────────────────
# Критерії: >$50M добового обсягу на Bybit, є на Binance perps, EMA200 доступна
WATCHLIST = [
    # Tier 1 — найвища ліквідність
    "BTC", "ETH", "SOL", "BNB", "XRP", "DOGE",
    # Tier 2 — активні DeFi/L1
    "LINK", "ARB", "AVAX", "ADA", "SUI", "TON",
    # Tier 3 — висока FR-активність у волатильні фази
    "HYPE", "INJ", "NEAR",
]

# ── TP/SL для funding-collection ──────────────────────────────────────────────
# Варіант А — чиста колекція: тримаємо тільки до funding payment (~20хв), потім виходимо.
# TP/SL є страховкою на випадок різкого руху поки чекаємо funding.
FR_TP = 1.0   # TP 0.4% — бонус якщо ціна одразу пішла в наш бік
FR_SL = 1.5   # SL 1.5% — ширший захист; 0.8% було занадто tight для FR
# close_after_min додається динамічно до кожного сигналу (mins_to_funding + 3)

# ── BTC trend cache ────────────────────────────────────────────────────────────
_btc_trend_cache: dict = {"ts": 0.0, "trend": 0.0}

# ── EMA cache (4h EMA50 / EMA200) ─────────────────────────────────────────────
_ema_cache: dict[str, dict] = {}
_EMA_TTL = 900  # 15 хв — оновлюємо раз на POLL_INTERVAL


def _ema(closes: list, period: int) -> float:
    if len(closes) < period:
        return closes[-1] if closes else 0.0
    k = 2 / (period + 1)
    val = sum(closes[:period]) / period
    for price in closes[period:]:
        val = price * k + val * (1 - k)
    return val


def _get_ema_trend(coin: str) -> tuple[float | None, float | None]:
    """Returns (ema50_4h, ema200_4h). Cached 15 хв."""
    now = time.time()
    cached = _ema_cache.get(coin)
    if cached and now - cached["ts"] < _EMA_TTL:
        return cached["ema50"], cached["ema200"]
    try:
        ohlcv = _binance_ex.fetch_ohlcv(f"{coin}/USDT", "4h", limit=250)
        closes = [c[4] for c in ohlcv]
        if len(closes) < 200:
            return None, None
        ema50  = _ema(closes, 50)
        ema200 = _ema(closes, 200)
        _ema_cache[coin] = {"ts": now, "ema50": ema50, "ema200": ema200}
        return ema50, ema200
    except Exception:
        return None, None


def _get_btc_trend() -> float:
    """BTC 24h тренд з кешем 15 хв."""
    now = time.time()
    if now - _btc_trend_cache["ts"] < 900:
        return _btc_trend_cache["trend"]
    try:
        btc = get_market_metrics("BTC")
        trend = btc.get("trend_24h_percent", 0.0) if btc else 0.0
    except Exception:
        trend = 0.0
    _btc_trend_cache["ts"]    = now
    _btc_trend_cache["trend"] = trend
    return trend


def _minutes_to_next_funding() -> int:
    """Хвилин до наступного funding payment (Bybit: 00:00, 08:00, 16:00 UTC)."""
    now  = datetime.now(timezone.utc)
    mins = now.hour * 60 + now.minute
    for slot in (0, 480, 960, 1440):
        if mins < slot:
            return slot - mins
    return 1440 - mins


def _calc_signal(coin: str) -> dict | None:
    # 1. Timing gate — тільки у вікні до funding payment
    mins_to_funding = _minutes_to_next_funding()
    if mins_to_funding > ENTRY_WINDOW_MIN:
        return None

    # 2. Ринкові дані
    market = get_market_metrics(coin)
    if not market:
        return None

    fr    = market.get("funding_rate", 0.0)
    rsi   = market.get("rsi", 50.0)
    trend = market.get("trend_24h_percent", 0.0)
    price = market.get("current_price", 0.0)

    # 3. FR threshold — мінімальний значущий рівень
    abs_fr = abs(fr)
    if abs_fr < FR_MIN:
        return None

    # 4. Напрямок: отримуємо funding від сторони що переплачує
    action = "LONG" if fr < 0 else "SHORT"

    # 5. BTC macro filter
    btc_trend = _get_btc_trend() if coin != "BTC" else trend

    # 6. Напрямок-специфічні фільтри
    if action == "LONG":
        if rsi > RSI_LONG_MAX:
            return None  # squeeze вже стався, не входимо після відскоку
        if btc_trend <= BTC_LONG_BLOCK_TREND:
            print(f"[FR] ⛔ {coin} LONG — BTC {btc_trend:.1f}% (ринок падає)")
            return None
        # EMA50 < EMA200 → макро-даунтренд → hard block
        ema50, ema200 = _get_ema_trend(coin)
        if ema50 is not None and ema200 is not None and ema50 < ema200:
            print(f"[FR] ⛔ {coin} LONG — EMA50({ema50:.2f}) < EMA200({ema200:.2f}) даунтренд")
            return None

    elif action == "SHORT":
        if rsi < RSI_SHORT_MIN:
            return None  # ринок вже продали, momentum закінчився
        if btc_trend >= BTC_SHORT_BLOCK_TREND:
            print(f"[FR] ⛔ {coin} SHORT — BTC +{btc_trend:.1f}% (ринок росте)")
            return None
        # EMA50 > EMA200 → макро-аптренд → hard block (симетрично до LONG-фільтру)
        ema50, ema200 = _get_ema_trend(coin)
        if ema50 is not None and ema200 is not None and ema50 > ema200:
            print(f"[FR] ⛔ {coin} SHORT — EMA50({ema50:.2f}) > EMA200({ema200:.2f}) аптренд")
            return None

    # 7. Size: більший FR → більша позиція
    size_mult = 1.5 if abs_fr >= FR_HIGH else 1.0

    reason = (
        f"FR={fr:+.4f}% | RSI={rsi:.0f} | trend={trend:+.1f}% | "
        f"funding через {mins_to_funding}хв"
    )
    qualifier = "шорти переплачують → отримуємо funding" if action == "LONG" \
                else "лонги переплачують → отримуємо funding"

    return {
        "coin":             coin,
        "action":           action,
        "total_score":      round(abs_fr * 100, 1),  # сумісність з main.py
        "confidence":       min(int(abs_fr * 500), 100),
        "size_multiplier":  size_mult,
        "tp_pct":           FR_TP,
        "sl_pct":           FR_SL,
        "close_after_min":  mins_to_funding + 3,  # закрити через 3 хв після funding payment
        "source":           "FR Collection",
        "news_title":       f"[FR] {coin} {action}: {reason} — {qualifier}",
        "bot_tag":          "💰",
        "is_funding_signal": True,
        "components": {
            "funding_rate":    fr,
            "rsi":             rsi,
            "trend_24h":       trend,
            "current_price":   price,
            "mins_to_funding": mins_to_funding,
        },
    }


def _strategy_loop():
    print(
        f"[FR] 💰 Funding Collection Strategy запущена | "
        f"{len(WATCHLIST)} монет | вікно {ENTRY_WINDOW_MIN}хв до funding | "
        f"мін FR={FR_MIN}%"
    )
    _cooldowns: dict[str, float] = {}

    while True:
        try:
            mins_to_funding = _minutes_to_next_funding()
            now_ts = time.time()

            # Завантажуємо cooldowns тільки якщо ми у вікні (економія IO)
            if mins_to_funding <= ENTRY_WINDOW_MIN:
                _cooldowns.update(_load_cooldowns())
                fired = 0

                for coin in WATCHLIST:
                    if now_ts - _cooldowns.get(coin, 0) < COIN_COOLDOWN_SEC:
                        time.sleep(0.1)
                        continue
                    try:
                        sig = _calc_signal(coin)
                        if sig:
                            sig["timestamp"] = datetime.now(timezone.utc).isoformat()
                            _cooldowns[coin]  = now_ts
                            _save_cooldown(coin, now_ts)
                            funding_queue.put_nowait(sig)
                            print(
                                f"[FR] 💰 {sig['action']} {coin} | "
                                f"FR={sig['components']['funding_rate']:+.4f}% | "
                                f"RSI={sig['components']['rsi']:.0f} | "
                                f"funding через {sig['components']['mins_to_funding']}хв"
                            )
                            fired += 1
                    except Exception as e:
                        print(f"[FR] помилка {coin}: {e}")
                    time.sleep(COIN_SLEEP)

                if fired:
                    print(f"[FR] ✅ {fired} сигналів надіслано в чергу")
            else:
                # Поза вікном — тихий лог раз на годину
                next_slot_h = (datetime.now(timezone.utc).hour // 8 + 1) * 8 % 24
                print(f"[FR] 💤 Наступний funding о {next_slot_h:02d}:00 UTC ({mins_to_funding}хв)")

        except Exception as e:
            print(f"[FR] помилка циклу: {e}")

        time.sleep(POLL_INTERVAL)


def start_funding_strategy() -> threading.Thread:
    t = threading.Thread(target=_strategy_loop, daemon=True, name="funding-strategy")
    t.start()
    return t
