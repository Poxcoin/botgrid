"""
altcoin_bot.py — Рисковый бот для альткоинов.

Стратегия: поймать быстрые памп/дамп движения на волатильных монетах.
  TP = 25%  SL = 5%  Плечо = 2x  Размер = 2% баланса
  Breakeven WR = 5 / (25 + 5) = 16.7%  (намного легче достичь)

Отличия от main.py:
  - Отдельный список монет (альткоины + мемы)
  - Нижний порог сигнала: score >= 6 (более агрессивный вход)
  - Нет RSI фильтра (альткоины могут оставаться перекупленными днями)
  - Funding Rate фильтр усилен (основная защита от плохих входов)
  - Отдельный лог: signals_log_alt.json
  - TG-сообщения с префиксом 🎯 ALT
"""

import time
import json
import os
from datetime import datetime

from modules.news_parser import get_aggregated_news
from modules.ai_analyzer import analyze_sentiment
from modules.market_data import get_market_metrics, get_funding_rate
from modules.trader import execute_trade, get_free_usdt, _init_exchange
from modules.tg_notifier import send_telegram_message
from modules import daily_guard, position_monitor
from config.settings import TG_CHAT_ID

# ─── Параметры рискового бота ───────────────────────────────────────────────
ALT_TP          = 25.0   # Take Profit %
ALT_SL          = 5.0    # Stop Loss %
ALT_LEVERAGE    = 2      # Плечо
ALT_SIZE        = 2.0    # % от баланса на сделку
ALT_THRESHOLD   = 6.0    # Минимальный score для входа (ниже чем у main)
ALT_VOL_SPIKE   = 3.0    # Кратность объёма для подтверждения кита

# Монеты: только те где протокольные новости реально двигают цену.
# DOGE/SHIB/PEPE исключены — движутся на соцсетях, объём не предиктивен.
ALT_COINS = [
    "XRP",  "ADA",  "DOT",           # Layer-1 альты — реагируют на регуляторику
    "LINK", "UNI",  "AAVE",          # DeFi — листинги, апдейты протоколов, TVL
    "SUI",  "APT",  "OP",            # новые L1/L2 — сильные реакции на апдейты
    "NEAR", "INJ",  "FET",           # ecosystem + AI narrative
]

LEDGER_FILE       = "signals_log_alt.json"
PROCESSED_URLS    = "processed_urls_alt.json"
BREAKEVEN_WR      = round(ALT_SL / (ALT_TP + ALT_SL) * 100, 1)

# ─── Утилиты ─────────────────────────────────────────────────────────────────

def load_ledger() -> list:
    if os.path.exists(LEDGER_FILE):
        try:
            with open(LEDGER_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return []


def save_ledger(ledger: list) -> None:
    try:
        with open(LEDGER_FILE, "w") as f:
            json.dump(ledger[-500:], f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"Ошибка сохранения лога: {e}")


def load_processed_urls() -> set:
    if os.path.exists(PROCESSED_URLS):
        try:
            with open(PROCESSED_URLS) as f:
                return set(json.load(f))
        except Exception:
            pass
    return set()


def save_processed_urls(urls: set) -> None:
    try:
        with open(PROCESSED_URLS, "w") as f:
            json.dump(list(urls)[-2000:], f)
    except Exception as e:
        print(f"Ошибка сохранения URLs: {e}")


# ─── Скоринг для альткоинов ──────────────────────────────────────────────────

def generate_alt_signal(news_item: dict) -> dict | None:
    """
    Упрощённая формула для альткоинов.
    Меньше фильтров, более агрессивный вход.
    Основная защита — Funding Rate (не входим в перегретый рынок).
    """
    if news_item.get("is_panic"):
        return None  # Паника — пропускаем, не рискуем

    ai_result  = analyze_sentiment(news_item["title"], news_item.get("description", ""))
    score      = ai_result["score"]
    coin       = ai_result["coin"]
    confidence = ai_result["confidence"]

    # Слабая новость или ИИ не уверен
    if abs(score) < 3 or confidence < 2:
        return None

    # Монета должна быть в нашем списке альтов
    if coin not in ALT_COINS and coin not in ("BTC", "ETH"):
        return None

    market = get_market_metrics(coin)
    if not market:
        return None

    total = float(score)

    # Фактор 1: Объём (кит вошёл?)
    vol_mult = market["volume_multiplier"]
    if vol_mult >= ALT_VOL_SPIKE:
        total += 3.0 if score > 0 else -3.0

    # Фактор 2: Тренд 24h
    trend = market["trend_24h_percent"]
    if score > 0 and trend > 2.0:
        total += 1.5
    elif score < 0 and trend < -2.0:
        total -= 1.5

    # Фактор 3: Funding Rate — главная защита
    # Альтам можно войти при более агрессивных значениях
    fr = market.get("funding_rate", 0.0)
    if score > 0:
        if fr > 0.1:
            total -= 3.0   # Очень перегрет лонгами — пропустить
        elif fr > 0.05:
            total -= 1.5
    elif score < 0:
        if fr < -0.1:
            total += 3.0   # Очень перегрет шортами — риск сквиза
        elif fr < -0.05:
            total += 1.5

    # Решение
    action = "HOLD"
    if total >= ALT_THRESHOLD and score > 0:
        action = "LONG"
    elif total <= -ALT_THRESHOLD and score < 0:
        action = "SHORT"

    return {
        "coin":         coin,
        "action":       action,
        "total_score":  round(total, 1),
        "confidence":   confidence,
        "size_multiplier": 1.0,
        "bot_tag":      "🎯",
        "components": {
            "ai_score":      score,
            "volume_mult":   vol_mult,
            "trend_pct":     trend,
            "funding_rate":  fr,
        },
        "news_title": news_item["title"],
        "source":     news_item.get("source", "Unknown"),
    }


# ─── Главный цикл ────────────────────────────────────────────────────────────

def run_alt_engine():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 🎯 ALT ENGINE ЗАПУЩЕН!")
    print(f"   TP={ALT_TP}%  SL={ALT_SL}%  x{ALT_LEVERAGE}  Size={ALT_SIZE}%")
    print(f"   Breakeven WR: {BREAKEVEN_WR}%  |  Монет: {len(ALT_COINS)}\n")

    # ─── Инициализация guard-модулей ──────────────────────────────────────────
    # ALT бот использует ТОТЖЕ daily_guard (STATE_FILE общий) — оба бота
    # учитывают общий лимит убытков за день.
    # Position monitor не запускаем повторно — main.py уже запустил поток.
    # Если ALT стартует раньше main, запускаем здесь.
    try:
        ex_init = _init_exchange()
        start_bal = get_free_usdt(ex_init)
    except Exception:
        start_bal = 0.0
    daily_guard.init(current_balance=start_bal)

    import threading
    if not any(t.name == "position-monitor" for t in threading.enumerate()):
        position_monitor.start_monitor(
            exchange_factory=_init_exchange,
            send_tg=send_telegram_message,
            chat_id=TG_CHAT_ID,
        )

    send_telegram_message(
        f"🎯 <b>ALT BOT запущен</b>\n"
        f"TP={ALT_TP}% | SL={ALT_SL}% | x{ALT_LEVERAGE} | {len(ALT_COINS)} монет\n"
        f"Breakeven WR: {BREAKEVEN_WR}%",
        TG_CHAT_ID
    )

    ledger          = load_ledger()
    processed_urls  = load_processed_urls()
    last_error_tg   = 0

    while True:
        try:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] 📡 ALT сканирование...")
            news_list = get_aggregated_news(limit_per_source=8)

            urls_changed = False
            for item in news_list:
                if item["link"] in processed_urls:
                    continue
                processed_urls.add(item["link"])
                urls_changed = True

                print(f"   [ALT] Анализ: {item['title'][:60]}...")
                signal = generate_alt_signal(item)

                if not signal:
                    continue

                signal["timestamp"] = datetime.now().isoformat()
                ledger.append(signal)
                save_ledger(ledger)

                if signal["action"] in ("LONG", "SHORT"):
                    print(f"\n{'='*50}")
                    print(f"🎯 ALT СИГНАЛ: {signal['action']} {signal['coin']}  score={signal['total_score']}")
                    print(f"{'='*50}\n")

                    execute_trade(
                        signal,
                        tp_pct=ALT_TP,
                        sl_pct=ALT_SL,
                        leverage_override=ALT_LEVERAGE,
                        size_pct=ALT_SIZE,
                    )

            if urls_changed:
                save_processed_urls(processed_urls)

            time.sleep(30)

        except KeyboardInterrupt:
            print("\nALT бот остановлен.")
            save_ledger(ledger)
            break
        except Exception as e:
            print(f"❌ ALT ошибка: {e}")
            now = time.time()
            if now - last_error_tg > 300:
                last_error_tg = now
                send_telegram_message(
                    f"❌ <b>ALT BOT — ошибка</b>\n<code>{str(e)[:300]}</code>",
                    TG_CHAT_ID
                )
            time.sleep(10)


if __name__ == "__main__":
    run_alt_engine()
