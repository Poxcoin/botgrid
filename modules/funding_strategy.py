"""
Funding Rate Mean Reversion Strategy.
Чиста математична стратегія — без новин, без Claude.

Логіка:
  FR > +0.06% + RSI > 65 + trend вже pumped → SHORT
    (лонги переплачують → ринок перегрітий → скоро розворот вниз)

  FR < -0.06% + RSI < 35 + trend вже dumped → LONG
    (шорти переплачують → squeeze ризик → скоро розворот вгору)

Запускається як daemon-поток, кладе готові сигнали в funding_queue.
main.py читає funding_queue і викликає execute_trade напряму.
"""
import json
import os
import time
import threading
import queue
from collections import deque
from datetime import datetime, timezone

from modules.market_data import get_market_metrics

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

POLL_INTERVAL   = 900   # перевіряємо кожні 15 хвилин
COIN_SLEEP      = 1.5   # пауза між монетами — не спамимо API

# Tiered funding rate пороги (% за 8 годин)
# Tier 1 (слабкий сигнал): FR > 0.04% → size_multiplier 0.5
# Tier 2 (нормальний):     FR > 0.06% → size_multiplier 1.0
# Tier 3 (сильний):        FR > 0.10% → size_multiplier 1.5
FR_SHORT_T1 = 0.04
FR_SHORT_T2 = 0.06
FR_SHORT_T3 = 0.10
FR_LONG_T1  = -0.04
FR_LONG_T2  = -0.06
FR_LONG_T3  = -0.10

RSI_OB = 65
RSI_OS = 35
TREND_CONFIRM    = 3.0
SIGNAL_THRESHOLD = 5.5   # підняли з 4.0: tier-1 сигнали (0.04% FR) були занадто слабкі
FR_TREND_BONUS   = 1.5   # бонус якщо FR зростає 3 цикли підряд

COIN_COOLDOWN_SEC = 4 * 3600

# SOL видалено: покрито Grid ботом, FR WR 20% (-$33.35, 35 угод)
# Видалено confirmed losers: OP 0%WR, ATOM 0%WR, TRX 0%WR, AAVE 0%WR
# Видалено: LTC, ZETA, STX (низький WR, підтверджені збитки)
WATCHLIST = [
    "BTC",  "ETH",  "BNB",  "XRP",
    "ADA",  "DOGE", "AVAX", "DOT",  "LINK",
    "INJ",  "SUI",  "APT",  "ARB",
    "NEAR", "FET",  "TON",
    "UNI",  "LDO",  "CRV",  "RUNE",
    "WLD",  "JUP",  "PENDLE", "ONDO",
]

_cooldowns:  dict[str, float]  = {}
# FR trend: зберігаємо останні 3 значення FR на монету
_fr_history: dict[str, deque]  = {}  # coin → last_signal_ts


def _calc_signal(coin: str) -> dict | None:
    market = get_market_metrics(coin)
    if not market:
        return None

    fr    = market.get("funding_rate", 0.0)
    rsi   = market.get("rsi", 50.0)
    trend = market.get("trend_24h_percent", 0.0)
    price = market.get("current_price", 0.0)

    score = 0.0

    # ── Tier-based scoring ───────────────────────────────────────────────────
    if fr > FR_SHORT_T1:
        # Лонги переплачують — потенційний SHORT
        # Блокуємо SHORT якщо RSI < 40 — ринок вже перепроданий, шортити небезпечно
        if rsi < 40:
            return None
        score -= (fr - 0.02) * 150          # T1(0.04%)→-3, T2(0.06%)→-6, T3(0.10%)→-12
        if rsi > RSI_OB:
            score -= (rsi - RSI_OB) * 0.15
        if trend > TREND_CONFIRM:
            score -= min(trend * 0.4, 3.0)

    elif fr < FR_LONG_T1:
        # Шорти переплачують — потенційний LONG (squeeze)
        # Блокуємо LONG якщо RSI > 60 — squeeze вже відбувся, входимо на піку
        if rsi > 60:
            return None
        score += (abs(fr) - 0.02) * 150
        if rsi < RSI_OS:
            score += (RSI_OS - rsi) * 0.15
        if trend < -TREND_CONFIRM:
            score += min(abs(trend) * 0.4, 3.0)

    # ── FR trend bonus: FR зростає 3 цикли підряд → сигнал посилюється ──────
    hist = _fr_history.setdefault(coin, deque(maxlen=3))
    hist.append(fr)
    if len(hist) == 3:
        h = list(hist)
        if h[0] < h[1] < h[2] and fr > FR_SHORT_T1:   # FR зростає → SHORT сильніший
            score -= FR_TREND_BONUS
        elif h[0] > h[1] > h[2] and fr < FR_LONG_T1:  # FR падає → LONG сильніший
            score += FR_TREND_BONUS

    if abs(score) < SIGNAL_THRESHOLD:
        return None

    action = "SHORT" if score < 0 else "LONG"

    # ── Tiered size multiplier ────────────────────────────────────────────────
    abs_fr = abs(fr)
    if abs_fr >= abs(FR_SHORT_T3):
        size_mult = 1.5
    elif abs_fr >= abs(FR_SHORT_T2):
        size_mult = 1.0
    else:
        size_mult = 0.5

    trend_flag = " 📈趨" if len(hist) == 3 and list(hist)[0] < list(hist)[1] < list(hist)[2] else ""
    reason_parts = [f"FR={fr:+.4f}%{trend_flag}", f"RSI={rsi:.0f}", f"trend={trend:+.1f}%"]
    if action == "SHORT":
        reason_parts.append("лонги перегріті → розворот вниз")
    else:
        reason_parts.append("шорти перегріті → squeeze вгору")

    return {
        "coin":            coin,
        "action":          action,
        "total_score":     round(score, 1),
        "confidence":      min(int(abs(score) * 7), 100),
        "size_multiplier": size_mult,
        "source":          "Funding Rate Strategy",
        "news_title":      f"[FR Strategy] {coin} {action}: {', '.join(reason_parts)}",
        "bot_tag":         "📊",
        "is_funding_signal": True,
        "components": {
            "funding_rate": fr,
            "rsi":          rsi,
            "trend_24h":    trend,
            "current_price": price,
        },
    }


def _strategy_loop():
    print(
        f"[FR] 📊 Funding Rate Strategy запущена | "
        f"{len(WATCHLIST)} монет | інтервал {POLL_INTERVAL//60} хв"
    )
    while True:
        try:
            now_ts = time.time()
            # Load cooldowns from disk each cycle so restarts don't reset them
            _cooldowns.update(_load_cooldowns())
            fired  = 0
            for coin in WATCHLIST:
                last_ts = _cooldowns.get(coin, 0)
                if now_ts - last_ts < COIN_COOLDOWN_SEC:
                    time.sleep(0.1)
                    continue
                try:
                    sig = _calc_signal(coin)
                    if sig:
                        sig["timestamp"] = datetime.now(timezone.utc).isoformat()
                        _cooldowns[coin]  = now_ts
                        _save_cooldown(coin, now_ts)   # persist immediately
                        funding_queue.put_nowait(sig)
                        print(
                            f"[FR] 🎯 {sig['action']} {coin} | "
                            f"score={sig['total_score']} | "
                            f"FR={sig['components']['funding_rate']:+.4f}% | "
                            f"RSI={sig['components']['rsi']:.0f}"
                        )
                        fired += 1
                except Exception as e:
                    print(f"[FR] помилка {coin}: {e}")
                time.sleep(COIN_SLEEP)

            if fired:
                print(f"[FR] ✅ Цикл завершено — {fired} сигналів")

        except Exception as e:
            print(f"[FR] помилка циклу: {e}")

        time.sleep(POLL_INTERVAL)


def start_funding_strategy() -> threading.Thread:
    t = threading.Thread(target=_strategy_loop, daemon=True, name="funding-strategy")
    t.start()
    return t
