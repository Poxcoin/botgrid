"""
altcoin_bot.py — Listing pump bot.

Стратегія: ловити памп одразу після лістингу на Binance/Bybit.
  TP = 20%  SL = 5%  Плечо = 5x  Розмір = 2% балансу
  Джерело: ТІЛЬКИ exchange announcements (ann_queue)
  Будь-яка нова монета — без whitelist.
"""

import time
import json
import os
from datetime import datetime

from modules.decision_maker import generate_listing_signal
from modules.trader import execute_trade, get_free_usdt, _init_exchange
from modules.tg_notifier import send_telegram_message
from modules.exchange_announcements import start_announcements_monitor, ann_queue
from modules import daily_guard, position_monitor, pnl_tracker
from config.settings import TG_CHAT_ID, LISTING_LEVERAGE, LISTING_TP, LISTING_SL, LISTING_SIZE

LEDGER_FILE    = "signals_log_alt.json"
PROCESSED_URLS = "processed_urls_alt.json"
BREAKEVEN_WR   = round(LISTING_SL / (LISTING_TP + LISTING_SL) * 100, 1)

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


# ─── Главный цикл ────────────────────────────────────────────────────────────

def run_alt_engine():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 🚀 LISTING BOT ЗАПУЩЕН!")
    print(f"   TP={LISTING_TP}%  SL={LISTING_SL}%  x{LISTING_LEVERAGE}  Size={LISTING_SIZE}%")
    print(f"   Breakeven WR: {BREAKEVEN_WR}%  |  Джерело: Exchange Announcements\n")

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
    if not any(t.name == "pnl-tracker" for t in threading.enumerate()):
        pnl_tracker.start_pnl_tracker(exchange_factory=_init_exchange)

    start_announcements_monitor()

    send_telegram_message(
        f"🚀 <b>Listing Bot запущен</b>\n"
        f"TP={LISTING_TP}% | SL={LISTING_SL}% | x{LISTING_LEVERAGE} | Будь-яка нова монета\n"
        f"Breakeven WR: {BREAKEVEN_WR}%",
        TG_CHAT_ID
    )

    ledger          = load_ledger()
    processed_urls  = load_processed_urls()
    last_error_tg   = 0
    # coin -> timestamp: блокуємо повторну угоду по тій самій монеті 30 хвилин
    traded_coins: dict = {}
    COIN_TTL = 30 * 60

    while True:
        try:
            now_ts = time.time()

            # Announcements — найвищий пріоритет
            ann_news = []
            while not ann_queue.empty():
                try:
                    ann_news.append(ann_queue.get_nowait())
                except Exception:
                    break

            print(f"[{datetime.now().strftime('%H:%M:%S')}] 📡 LISTING сканування..." +
                  (f" | 🔔 {len(ann_news)} анонсів" if ann_news else ""))

            urls_changed = False
            for item in ann_news:
                if item["link"] in processed_urls:
                    continue
                processed_urls.add(item["link"])
                urls_changed = True

                if not item.get("is_listing"):
                    continue

                signal = generate_listing_signal(item)
                if not signal:
                    continue

                coin = signal.get("coin", "")
                last_traded = traded_coins.get(coin, 0)
                if now_ts - last_traded < COIN_TTL:
                    remaining = int((COIN_TTL - (now_ts - last_traded)) / 60)
                    print(f"[ALT] ⏭ {coin} вже торгували — пропускаємо (ще {remaining} хв)")
                    continue

                traded_coins[coin] = now_ts

                signal["timestamp"] = datetime.now().isoformat()
                ledger.append(signal)
                save_ledger(ledger)

                print(f"\n{'='*50}")
                print(f"🚀 LISTING: {signal['action']} {signal['coin']}  score={signal['total_score']}")
                print(f"{'='*50}\n")

                execute_trade(
                    signal,
                    tp_pct=LISTING_TP,
                    sl_pct=LISTING_SL,
                    leverage_override=LISTING_LEVERAGE,
                    size_pct=LISTING_SIZE,
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
