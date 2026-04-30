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

import httpx

from modules.decision_maker import generate_listing_signal
from modules.trader import execute_trade, get_free_usdt, _init_exchange
from modules.tg_notifier import send_telegram_message
from modules.exchange_announcements import start_announcements_monitor, ann_queue
from modules import daily_guard, position_monitor, pnl_tracker
from config.settings import TG_CHAT_ID, LISTING_LEVERAGE, LISTING_TP, LISTING_SL, LISTING_SIZE

LEDGER_FILE    = "signals_log_alt.json"
PROCESSED_URLS = "processed_urls_alt.json"
BREAKEVEN_WR   = round(LISTING_SL / (LISTING_TP + LISTING_SL) * 100, 1)

LISTING_TP1_PCT      = 10.0     # перший TP: 50% позиції фіксуємо на +10%
DEX_MIN_VOLUME_USD   = 100_000  # якщо монета вже на DEX з об'ємом >$100K — стейл лістинг


def _is_on_dex(coin: str) -> bool:
    """True якщо монета вже торгується на DEX з 24h об'ємом > DEX_MIN_VOLUME_USD.

    Свіжі лістинги зазвичай мають нульовий або мінімальний DEX-об'єм.
    Якщо об'єм значний — памп вже стався на DEX і CEX-лістинг запізнився.
    """
    try:
        resp = httpx.get(
            "https://api.geckoterminal.com/api/v2/search/pools",
            params={"query": coin},
            timeout=5.0,
        )
        if resp.status_code != 200:
            return False
        for pool in resp.json().get("data", [])[:5]:
            attrs = pool.get("attributes", {})
            name  = attrs.get("name", "").upper()
            vol   = float(attrs.get("volume_usd", {}).get("h24") or 0)
            if coin.upper() in name and vol >= DEX_MIN_VOLUME_USD:
                print(f"[ALT] 🚫 DEX filter: {coin} вже на DEX, об'єм ${vol:,.0f}/24h")
                return True
        return False
    except Exception:
        return False  # fail-safe: при помилці API — не блокуємо угоду


def _place_listing_tp1(exchange, symbol: str, action: str) -> None:
    """Limit reduceOnly ордер на 50% позиції при +LISTING_TP1_PCT%.

    TP2 (+LISTING_TP%) вже встановлений через set_trading_stop в execute_trade.
    Разом: 50% фіксуємо рано, 50% чекаємо повного розвороту.
    Пропускається в Demo (reduceOnly limit може вести себе інакше).
    """
    from config.settings import IS_DEMO_TRADING
    if IS_DEMO_TRADING:
        return
    try:
        market_id = exchange.market_id(symbol)
        pos_list  = exchange.private_get_v5_position_list(params={
            "category": "linear",
            "symbol":   market_id,
        }).get("result", {}).get("list", [])
        if not pos_list:
            return

        pos        = pos_list[0]
        qty        = float(pos.get("size") or 0)
        avg_price  = float(pos.get("avgPrice") or 0)
        if qty <= 0 or avg_price <= 0:
            return

        half_qty = float(exchange.amount_to_precision(symbol, qty * 0.5))
        min_qty  = (exchange.markets.get(symbol) or {}).get("limits", {}).get("amount", {}).get("min") or 0
        if half_qty < min_qty:
            return

        if action.upper() == "LONG":
            tp1_price = float(exchange.price_to_precision(symbol, avg_price * (1 + LISTING_TP1_PCT / 100)))
            side = "sell"
        else:
            tp1_price = float(exchange.price_to_precision(symbol, avg_price * (1 - LISTING_TP1_PCT / 100)))
            side = "buy"

        exchange.create_order(
            symbol, "limit", side, half_qty, tp1_price,
            params={"category": "linear", "reduceOnly": True, "positionIdx": 0},
        )
        print(f"✅ [ALT] TP1: {half_qty} @ ${tp1_price} (+{LISTING_TP1_PCT}%) | TP2: +{LISTING_TP}%")
    except Exception as e:
        print(f"⚠️ [ALT] TP1 не встановлено: {e}")

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

                # DEX filter: якщо монета вже активно торгується на DEX — памп стався раніше
                if _is_on_dex(coin):
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

                # Partial TP1: limit reduceOnly 50% @ +10% (TP2 @ +20% вже в set_trading_stop)
                try:
                    _ex = _init_exchange()
                    _ex.load_markets()
                    from modules.trader import resolve_market_symbol
                    _sym = resolve_market_symbol(_ex, coin)
                    if _sym:
                        _place_listing_tp1(_ex, _sym, signal["action"])
                except Exception as _e:
                    print(f"⚠️ [ALT] TP1 init error: {_e}")

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
