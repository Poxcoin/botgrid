"""
orderflow_bot.py — Orderflow Bot (BTC / ETH / SOL).

Стратегія: VWAP deviation + OI delta + CVD confluence.
  TP = 1.0%  SL = 0.5%  Плечо = 3x  Розмір = 3% балансу
  Cooldown: 2h на символ  |  Scan interval: 3 хв
  Max concurrent positions: 2
"""
import time
import threading
from datetime import datetime

from modules.orderflow_engine import get_orderflow_context
from modules.trader import execute_trade, get_free_usdt, _init_exchange
from modules.tg_notifier import send_telegram_message
from modules import daily_guard, position_monitor
from config.settings import TG_CHAT_ID, IS_DEMO_TRADING, ORDERFLOW_TRADING

SYMBOLS = [
    "BTC/USDT:USDT",
    "ETH/USDT:USDT",
    "SOL/USDT:USDT",
]

LEVERAGE   = 3
TP_PCT     = 2.0
SL_PCT     = 1.0
SIZE_PCT   = 3.0
MAX_POS    = 2
COOLDOWN   = 2 * 3600   # seconds
SCAN_SLEEP = 180        # seconds


def _check_long(ctx: dict) -> bool:
    return (
        ctx["oi_delta_pct"] > 0.1
        and ctx["cvd_usdt"] > 0
        and 0 < ctx["vwap_dev_pct"] < 1.0
    )


def _check_short(ctx: dict) -> bool:
    return (
        ctx["oi_delta_pct"] > 0.1
        and ctx["cvd_usdt"] < 0
        and -1.0 < ctx["vwap_dev_pct"] < 0
    )


def run_orderflow_engine() -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [OF] ORDERFLOW BOT ЗАПУЩЕН!")
    print(f"   Symbols: {', '.join(SYMBOLS)}")
    print(f"   TP={TP_PCT}%  SL={SL_PCT}%  x{LEVERAGE}  Size={SIZE_PCT}%")
    print(f"   Trading={'ON' if ORDERFLOW_TRADING else 'OFF (dry-run)'}  "
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

    send_telegram_message(
        f"<b>[OF] Orderflow Bot запущен</b>\n"
        f"BTC / ETH / SOL | TP={TP_PCT}% SL={SL_PCT}% x{LEVERAGE}\n"
        f"{'Demo режим' if IS_DEMO_TRADING else 'Live режим'} | "
        f"Торгівля: {'ON' if ORDERFLOW_TRADING else 'OFF (dry-run)'}",
        TG_CHAT_ID,
    )

    _cooldowns: dict[str, float] = {}
    last_error_tg = 0.0

    while True:
        try:
            now = time.time()

            try:
                exchange = _init_exchange()
                balance = get_free_usdt(exchange)
            except Exception as e:
                print(f"[OF] ❌ Balance fetch failed: {e}")
                time.sleep(SCAN_SLEEP)
                continue

            if not daily_guard.check(balance):
                print(f"[OF] Daily loss limit hit — skipping scan")
                time.sleep(SCAN_SLEEP)
                continue

            if position_monitor.get_tracked_count() >= MAX_POS:
                print(f"[OF] Max positions ({MAX_POS}) reached — skipping scan")
                time.sleep(SCAN_SLEEP)
                continue

            for symbol in SYMBOLS:
                if position_monitor.get_tracked_count() >= MAX_POS:
                    print(f"[OF] Max positions reached mid-scan — stopping")
                    break

                cooldown_remaining = COOLDOWN - (now - _cooldowns.get(symbol, 0))
                if cooldown_remaining > 0:
                    print(f"[OF] Cooldown {symbol}: {int(cooldown_remaining / 60)} хв")
                    continue

                if position_monitor.is_tracked(symbol):
                    print(f"[OF] {symbol} already tracked — skip")
                    continue

                try:
                    ctx = get_orderflow_context(symbol)
                except Exception as e:
                    print(f"[OF] ❌ Context fetch failed for {symbol}: {e}")
                    continue

                is_long  = _check_long(ctx)
                is_short = _check_short(ctx)

                if not is_long and not is_short:
                    continue

                action = "buy" if is_long else "sell"
                direction = "LONG" if is_long else "SHORT"

                print(f"\n[OF] {'='*44}")
                print(f"[OF] SIGNAL  {direction}  {symbol}")
                print(f"[OF] context: {ctx}")
                print(f"[OF] {'='*44}\n")

                tg_body = (
                    f"<b>[OF] {direction} {symbol}</b>\n"
                    f"Price: <code>{ctx['price']:.4f}</code> | "
                    f"VWAP dev: <code>{ctx['vwap_dev_pct']:+.2f}%</code>\n"
                    f"OI delta: <code>{ctx['oi_delta_pct']:+.3f}%</code> | "
                    f"CVD: <code>{ctx['cvd_usdt']:+.0f} USDT</code>\n"
                    f"TP={TP_PCT}%  SL={SL_PCT}%  x{LEVERAGE}"
                )

                _cooldowns[symbol] = now

                if ORDERFLOW_TRADING:
                    try:
                        coin = symbol.replace("/USDT:USDT", "")
                        sig = {"coin": coin, "action": action, "total_score": 1, "size_multiplier": 1.0}
                        execute_trade(
                            sig,
                            leverage_override=LEVERAGE,
                            tp_pct=TP_PCT,
                            sl_pct=SL_PCT,
                            size_pct=SIZE_PCT,
                            bot_source="orderflow",
                        )
                        try:
                            from modules.saas_dispatcher import dispatch as _saas_dispatch
                            _saas_dispatch({
                                "source":   "orderflow",
                                "symbol":   symbol,
                                "side":     direction,
                                "leverage": LEVERAGE,
                                "tp_pct":   TP_PCT,
                                "sl_pct":   SL_PCT,
                                "size_pct": SIZE_PCT,
                            })
                        except Exception as _de:
                            print(f"[OF] saas_dispatch error: {_de}")
                        send_telegram_message(tg_body, TG_CHAT_ID)
                    except Exception as e:
                        print(f"[OF] ❌ execute_trade error {symbol}: {e}")
                else:
                    print(f"[OF] DRY-RUN — trading disabled, no order placed")
                    send_telegram_message(
                        f"[OF] DRY-RUN\n{tg_body}",
                        TG_CHAT_ID,
                    )

            time.sleep(SCAN_SLEEP)

        except KeyboardInterrupt:
            print("\n[OF] Orderflow бот зупинено.")
            break
        except Exception as e:
            print(f"[OF] ❌ {e}")
            now_ts = time.time()
            if now_ts - last_error_tg > 300:
                last_error_tg = now_ts
                send_telegram_message(
                    f"❌ <b>[OF] Orderflow Bot — помилка</b>\n<code>{str(e)[:300]}</code>",
                    TG_CHAT_ID,
                )
            time.sleep(10)


if __name__ == "__main__":
    run_orderflow_engine()
