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
import time
import threading
import queue
from datetime import datetime, timezone

from modules.market_data import get_market_metrics

funding_queue: queue.Queue = queue.Queue()

POLL_INTERVAL   = 900   # перевіряємо кожні 15 хвилин
COIN_SLEEP      = 1.5   # пауза між монетами — не спамимо API

# Funding rate пороги (% за 8 годин)
FR_SHORT_MIN = 0.06    # лонги починають переплачувати
FR_SHORT_HOT = 0.10    # дуже перегріто — сильний сигнал
FR_LONG_MIN  = -0.06
FR_LONG_HOT  = -0.10

RSI_OB = 65    # overbought для SHORT підтвердження
RSI_OS = 35    # oversold для LONG підтвердження
TREND_CONFIRM = 3.0    # % 24h trend для підтвердження напрямку
SIGNAL_THRESHOLD = 5.0  # мінімальний score для торгівлі

COIN_COOLDOWN_SEC = 4 * 3600   # не торгуємо одну монету частіше 4h

# Монети для моніторингу — топ за ліквідністю на Bybit futures
WATCHLIST = [
    "BTC",  "ETH",  "SOL",  "BNB",  "XRP",
    "ADA",  "DOGE", "AVAX", "DOT",  "LINK",
    "INJ",  "SUI",  "APT",  "OP",   "ARB",
    "NEAR", "FET",  "TON",  "TRX",  "ATOM",
]

_cooldowns: dict[str, float] = {}  # coin → last_signal_ts


def _calc_signal(coin: str) -> dict | None:
    market = get_market_metrics(coin)
    if not market:
        return None

    fr    = market.get("funding_rate", 0.0)
    rsi   = market.get("rsi", 50.0)
    trend = market.get("trend_24h_percent", 0.0)
    price = market.get("current_price", 0.0)

    score = 0.0

    if fr > FR_SHORT_MIN:
        # Лонги переплачують — потенційний SHORT
        score -= (fr - 0.04) * 150                        # 0.06% → -3, 0.10% → -9
        if rsi > RSI_OB:
            score -= (rsi - RSI_OB) * 0.15               # RSI 70 → -0.75
        if trend > TREND_CONFIRM:
            score -= min(trend * 0.4, 3.0)               # вже pumped → підтверджує
        if fr > FR_SHORT_HOT:
            score -= 2.0                                  # екстремально перегріто

    elif fr < FR_LONG_MIN:
        # Шорти переплачують — потенційний LONG (squeeze)
        score += (abs(fr) - 0.04) * 150
        if rsi < RSI_OS:
            score += (RSI_OS - rsi) * 0.15
        if trend < -TREND_CONFIRM:
            score += min(abs(trend) * 0.4, 3.0)
        if fr < FR_LONG_HOT:
            score += 2.0

    if abs(score) < SIGNAL_THRESHOLD:
        return None

    action = "SHORT" if score < 0 else "LONG"

    reason_parts = [f"FR={fr:+.4f}%", f"RSI={rsi:.0f}", f"trend={trend:+.1f}%"]
    if action == "SHORT":
        reason_parts.append("лонги перегріті → очікуємо розворот вниз")
    else:
        reason_parts.append("шорти перегріті → очікуємо squeeze вгору")

    return {
        "coin":            coin,
        "action":          action,
        "total_score":     round(score, 1),
        "confidence":      min(int(abs(score) * 7), 100),
        "size_multiplier": min(abs(score) / 10, 1.2),
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
