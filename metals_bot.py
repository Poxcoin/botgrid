"""
metals_bot.py — Precious Metals Bot (XAU/Gold).

Стратегія: ціновий момент на XAUUSDT (Bybit Linear Perpetual).
  TP = 1.5%  SL = 1.0%  Плечо = 5x  Розмір = 3% балансу
  Cooldown: 4h на символ
  Також пише metals_macro_state.json → main.py читає для +20% boost до alt-сигналів.
"""
import time
import threading
from datetime import datetime

from modules.metals_strategy import start_metals_strategy, metals_signal_queue
from modules.trader import execute_trade, get_free_usdt, _init_exchange
from modules.tg_notifier import send_telegram_message
from modules import daily_guard, position_monitor, pnl_tracker
from config.settings import (
    TG_CHAT_ID, IS_DEMO_TRADING,
    METALS_TRADING, METALS_LEVERAGE, METALS_TP, METALS_SL, METALS_SIZE,
)

COIN_COOLDOWN = 4 * 3600


def run_metals_engine() -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] 🥇 METALS BOT ЗАПУЩЕН!")
    print(f"   TP={METALS_TP}%  SL={METALS_SL}%  x{METALS_LEVERAGE}  Size={METALS_SIZE}%")
    print(f"   Trading={'✅' if METALS_TRADING else '❌ вимкнена'}  "
          f"{'[DEMO]' if IS_DEMO_TRADING else '[LIVE]'}\n")

    try:
        ex_init = _init_exchange()
        start_bal = get_free_usdt(ex_init)
    except Exception:
        start_bal = 0.0

    daily_guard.init(current_balance=start_bal)

    if not any(t.name == "position-monitor" for t in threading.enumerate()):
        position_monitor.start_monitor(
            exchange_factory=_init_exchange,
            send_tg=send_telegram_message,
            chat_id=TG_CHAT_ID,
        )
    if not any(t.name == "pnl-tracker" for t in threading.enumerate()):
        pnl_tracker.start_pnl_tracker(exchange_factory=_init_exchange)

    start_metals_strategy()

    send_telegram_message(
        f"🥇 <b>Metals Bot запущен</b>\n"
        f"XAU/USDT | TP={METALS_TP}% SL={METALS_SL}% x{METALS_LEVERAGE}\n"
        f"{'Demo режим' if IS_DEMO_TRADING else '🔴 Live режим'} | "
        f"Торгівля: {'✅' if METALS_TRADING else '❌ вимкнена'}",
        TG_CHAT_ID,
    )

    _cooldowns: dict[str, float] = {}
    last_error_tg = 0.0

    while True:
        try:
            now = time.time()
            while not metals_signal_queue.empty():
                try:
                    sig = metals_signal_queue.get_nowait()
                except Exception:
                    break

                name = sig["coin"]

                if now - _cooldowns.get(name, 0) < COIN_COOLDOWN:
                    remaining = int((COIN_COOLDOWN - (now - _cooldowns.get(name, 0))) / 60)
                    print(f"[METALS] ⏳ Cooldown {name}: ще {remaining} хв")
                    continue

                if not daily_guard.can_trade():
                    print(f"[METALS] 🛑 Daily limit — skip {name}")
                    continue

                _cooldowns[name] = now
                change = sig["components"]["change_5m_pct"]

                print(f"\n[METALS] {'='*40}")
                print(f"🥇 {sig['action']} {name} | {change:+.2f}% за 5хв | "
                      f"TP={sig['tp_pct']}% SL={sig['sl_pct']}%")
                print(f"[METALS] {'='*40}\n")

                if METALS_TRADING:
                    execute_trade(
                        sig,
                        leverage_override=METALS_LEVERAGE,
                        tp_pct=METALS_TP,
                        sl_pct=METALS_SL,
                        size_pct=METALS_SIZE,
                        bot_source="metals",
                    )
                else:
                    print(f"[METALS] 📊 {name} {sig['action']} — статистика (торгівля вимкнена)")

            time.sleep(15)

        except KeyboardInterrupt:
            print("\nMetals бот зупинено.")
            break
        except Exception as e:
            print(f"[METALS] ❌ {e}")
            now_ts = time.time()
            if now_ts - last_error_tg > 300:
                last_error_tg = now_ts
                send_telegram_message(
                    f"❌ <b>Metals Bot — помилка</b>\n<code>{str(e)[:300]}</code>",
                    TG_CHAT_ID,
                )
            time.sleep(10)


if __name__ == "__main__":
    run_metals_engine()
