"""
cascade_bot.py — Cascade Bot.

Стратегія: входимо В МОМЕНТ ліквідаційного каскаду, не після новин.

Сигнал: Binance WebSocket (!forceOrder@arr) — реалтайм, затримка <500ms.
  BTC  $1.5M+ ліквідовано за 60 сек → входимо в напрямку каскаду
  ETH  $700K+ ліквідовано за 60 сек → входимо в напрямку каскаду
  SOL  $175K+ ліквідовано за 60 сек → входимо в напрямку каскаду
  XRP  $100K+ ліквідовано за 60 сек → входимо в напрямку каскаду
  DOGE $100K+ ліквідовано за 60 сек → входимо в напрямку каскаду
  LINK $75K+  ліквідовано за 60 сек → входимо в напрямку каскаду

Логіка напрямку:
  Шорти ліквідуються (BUY order) → LONG  (шорт-сквіз продовжується)
  Лонги ліквідуються (SELL order) → SHORT (каскад вниз продовжується)

Funding rate — фільтр підтвердження:
  FR проти напрямку (шорти платять але ми SHORT) → блокуємо
  FR в напрямку → розмір × 1.5

Параметри: TP 1.5% / SL 0.6% / 5x / 2% балансу
Break-even WR: ~29%

Запуск: crypto-cascade.service (окремий від signal та grid)
"""
import json
import os
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Optional

import ccxt
import websocket

import ccxt
from modules.trader import _init_exchange, get_free_usdt
from modules.tg_notifier import send_telegram_message
from modules.market_data import get_funding_rate
from modules.analytics_db import save_trade, close_trade, save_cascade_trade_all_users, close_cascade_trade_all_users
from config.settings import (
    TG_CHAT_ID,
    CASCADE_TRADING,
    CASCADE_LIVE_MODE, CASCADE_LIVE_API_KEY, CASCADE_LIVE_SECRET,
    CASCADE_IS_DEMO, CASCADE_DEMO_API_KEY, CASCADE_DEMO_SECRET,
    OWNER_USER_ID,
)

# ─── Конфіг ───────────────────────────────────────────────────────────────────

WATCHLIST = ["BTC", "ETH", "SOL", "XRP", "DOGE", "LINK"]

TP_PCT    = 1.5   # %
SL_PCT    = 0.6   # %
LEVERAGE  = 5
SIZE_PCT  = 2.0   # % від вільного балансу

MAX_POSITIONS      = 2        # 2 позиції одночасно (дозволяє паралельно торгувати некорельовані пари)
COOLDOWN_SEC       = 15 * 60  # 15 хв cooldown на монету після сигналу
TIME_STOP_MIN      = 15       # каскадний momentum згасає за 10-15 хв
DAILY_LOSS_LIMIT   = 0.03     # зупинити день якщо PnL < -3% від балансу
POSITION_CHECK_SEC = 30       # перевірка позицій кожні 30 сек

BYBIT_TAKER_FEE = 0.00055

# Пороги ліквідацій — 1-хвилинне вікно
LIQ_THRESHOLD = {
    "BTC":  1_500_000,  # було 5M — занадто рідко спрацьовував
    "ETH":    700_000,  # було 2M
    "SOL":    175_000,  # було 500K
    "XRP":    100_000,  # було 300K
    "DOGE":   100_000,  # було 300K
    "LINK":    75_000,  # було 250K
}
LIQ_WINDOW_SEC = 60   # 1 хвилина rolling window
LIQ_RATIO      = 2.0  # було 2.5 — знизили щоб брати реальні каскади

# Funding rate фільтр (% за 8h, Bybit)
FR_CONFIRM_THRESHOLD = 0.06   # |FR| > 0.06% в напрямку сигналу → size × 1.5
FR_BLOCK_THRESHOLD   = 0.06   # |FR| > 0.06% ПРОТИ напрямку → блокуємо
FR_SIZE_BONUS        = 1.5

# ─── Стан ─────────────────────────────────────────────────────────────────────

_liq_data: dict = defaultdict(deque)   # coin → [(ts, side, usd)]
_liq_lock  = threading.Lock()

_cooldowns: dict[str, float] = {}

# coin → {symbol, action, qty, fill_price, tp_price, sl_price,
#          opened_at, db_trade_id, cascade_usd, size_mult}
_positions: dict[str, dict] = {}
_pos_lock  = threading.Lock()

_daily_pnl       = 0.0
_daily_start_bal = 0.0
_daily_date      = ""
_daily_stopped   = False

_running  = False
_exchange: Optional[ccxt.Exchange] = None


# ─── Exchange init ────────────────────────────────────────────────────────────

def _get_owner_key() -> tuple[str, str, bool] | None:
    """Pull API key from DB for OWNER_USER_ID. Returns (api_key, secret, is_testnet) or None."""
    if not OWNER_USER_ID:
        return None
    try:
        from database import SessionLocal, UserApiKey
        from utils.crypto import decrypt_field
        db = SessionLocal()
        try:
            row = db.query(UserApiKey).filter_by(user_id=OWNER_USER_ID, exchange="bybit").first()
            if not row:
                return None
            key = decrypt_field(row.api_key_enc)
            secret = decrypt_field(row.secret_enc)
            if not key or not secret:
                return None
            return key, secret, row.is_testnet
        finally:
            db.close()
    except Exception as e:
        print(f"[CASCADE] ⚠ не вдалося прочитати ключ з БД: {e}")
        return None


def _init_cascade_exchange() -> ccxt.Exchange:
    """
    Пріоритет:
    1. CASCADE_LIVE_MODE=True  → live ключі з .env
    2. OWNER_USER_ID заданий   → ключ з БД (автоматично demo/live залежно від is_testnet)
    3. CASCADE_IS_DEMO + env   → старий demo fallback
    4. Fallback                → _init_exchange() (IS_DEMO_TRADING з .env)
    """
    if CASCADE_LIVE_MODE:
        if not CASCADE_LIVE_API_KEY or not CASCADE_LIVE_SECRET:
            raise RuntimeError(
                "CASCADE_LIVE_MODE=True але CASCADE_LIVE_API_KEY / CASCADE_LIVE_SECRET не задані в .env"
            )
        exchange = ccxt.bybit({
            "apiKey":  CASCADE_LIVE_API_KEY,
            "secret":  CASCADE_LIVE_SECRET,
            "enableRateLimit": True,
            "options": {
                "defaultType":             "linear",
                "adjustForTimeDifference": True,
                "recvWindow":              10000,
            },
        })
        exchange.load_markets()
        return exchange

    # Ключ з бази — не треба перестворювати при ротації ключів
    db_creds = _get_owner_key()
    if db_creds:
        api_key, secret, is_testnet = db_creds
        exchange = ccxt.bybit({
            "apiKey":  api_key,
            "secret":  secret,
            "enableRateLimit": True,
            "options": {"defaultType": "linear", "adjustForTimeDifference": True, "recvWindow": 10000},
        })
        if is_testnet:
            exchange.urls["api"] = exchange.urls["demotrading"]
        exchange.has["fetchCurrencies"] = False
        exchange.load_markets()
        mode = "demo" if is_testnet else "live"
        print(f"[CASCADE] 🔑 ключ з БД (user={OWNER_USER_ID}, {mode})")
        return exchange

    # Старий demo fallback через env vars
    if CASCADE_IS_DEMO and CASCADE_DEMO_API_KEY and CASCADE_DEMO_SECRET:
        exchange = ccxt.bybit({
            "apiKey":  CASCADE_DEMO_API_KEY,
            "secret":  CASCADE_DEMO_SECRET,
            "enableRateLimit": True,
            "options": {"defaultType": "linear", "adjustForTimeDifference": True, "recvWindow": 10000},
        })
        exchange.urls["api"]            = exchange.urls["demotrading"]
        exchange.options["defaultType"] = "linear"
        exchange.has["fetchCurrencies"] = False
        exchange.load_markets()
        return exchange

    return _init_exchange()


# ─── Ліквідаційний WebSocket ──────────────────────────────────────────────────

def _cleanup_liq(coin: str, now: float) -> None:
    dq = _liq_data[coin]
    while dq and now - dq[0][0] > LIQ_WINDOW_SEC:
        dq.popleft()


def _on_ws_message(ws, raw: str) -> None:
    try:
        msg    = json.loads(raw)
        order  = msg.get("o", {})
        symbol = order.get("s", "")
        if not symbol.endswith("USDT"):
            return
        coin = symbol.replace("USDT", "")
        if coin not in WATCHLIST:
            return

        side      = order.get("S", "")       # "SELL"=лонг ліквідований, "BUY"=шорт ліквідований
        avg_price = float(order.get("ap", 0) or 0)
        qty       = float(order.get("l", 0) or order.get("z", 0) or 0)
        usd_value = avg_price * qty
        if usd_value < 50_000:               # ігноруємо < $50K
            return

        now = datetime.now(timezone.utc).timestamp()
        with _liq_lock:
            _liq_data[coin].append((now, side, usd_value))

        _check_cascade_signal(coin)

    except Exception:
        pass


def _check_cascade_signal(coin: str) -> None:
    if _daily_stopped:
        return

    now = datetime.now(timezone.utc).timestamp()

    # Cooldown
    if now - _cooldowns.get(coin, 0) < COOLDOWN_SEC:
        return

    # Ліміт позицій
    with _pos_lock:
        if len(_positions) >= MAX_POSITIONS:
            return
        if coin in _positions:
            return

    threshold = LIQ_THRESHOLD.get(coin, 500_000)

    with _liq_lock:
        _cleanup_liq(coin, now)
        entries = list(_liq_data.get(coin, []))

    long_liq  = sum(v for _, s, v in entries if s == "SELL")  # лонги ліквідовано
    short_liq = sum(v for _, s, v in entries if s == "BUY")   # шорти ліквідовано

    action      = None
    cascade_usd = 0.0

    if short_liq >= threshold and short_liq >= long_liq * LIQ_RATIO:
        action, cascade_usd = "LONG", short_liq    # шорти летять → сквіз продовжується
    elif long_liq >= threshold and long_liq >= short_liq * LIQ_RATIO:
        action, cascade_usd = "SHORT", long_liq    # лонги летять → дамп продовжується

    if not action:
        return

    # Funding rate фільтр
    fr = get_funding_rate(coin)
    size_mult = 1.0

    if action == "LONG" and fr >= FR_BLOCK_THRESHOLD:
        print(f"[CASCADE] ⛔ {coin} LONG заблоковано — FR={fr:+.4f}% (лонги вже платять, небезпечно)")
        return
    if action == "SHORT" and fr <= -FR_BLOCK_THRESHOLD:
        print(f"[CASCADE] ⛔ {coin} SHORT заблоковано — FR={fr:+.4f}% (шорти вже платять, squeeze ризик)")
        return
    if action == "LONG" and fr <= -FR_CONFIRM_THRESHOLD:
        size_mult = FR_SIZE_BONUS
    if action == "SHORT" and fr >= FR_CONFIRM_THRESHOLD:
        size_mult = FR_SIZE_BONUS

    _cooldowns[coin] = now

    emoji = "🚀" if action == "LONG" else "🔴"
    fr_note = f" FR={fr:+.4f}%" + (f" size×{size_mult}" if size_mult > 1 else "")
    print(f"[CASCADE] {emoji} {coin}: ${cascade_usd/1e6:.2f}M за 1хв → {action} |{fr_note}")

    _execute_trade(coin, action, cascade_usd, size_mult)


# ─── Виконання угоди ──────────────────────────────────────────────────────────

def _execute_trade(coin: str, action: str, cascade_usd: float, size_mult: float) -> None:
    if not CASCADE_TRADING:
        print(f"[CASCADE] 📊 {coin} {action} — торгівля вимкнена (CASCADE_TRADING=False)")
        return

    try:
        symbol    = f"{coin}/USDT:USDT"
        free_usdt = get_free_usdt(_exchange)
        size_usd  = max(round(free_usdt * SIZE_PCT / 100.0 * size_mult, 2), 10.0)

        # Leverage
        try:
            _exchange.set_leverage(LEVERAGE, symbol, params={"category": "linear"})
        except Exception:
            pass

        # Кількість контрактів
        market   = _exchange.market(symbol)
        min_qty  = float(market.get("limits", {}).get("amount", {}).get("min", 0.001))
        ticker   = _exchange.fetch_ticker(symbol)
        price    = float(ticker["last"])
        qty      = max(round((size_usd * LEVERAGE) / price, 3), min_qty)

        # TP/SL ціни
        if action == "LONG":
            tp_price = round(price * (1 + TP_PCT / 100), 4)
            sl_price = round(price * (1 - SL_PCT / 100), 4)
            side     = "buy"
        else:
            tp_price = round(price * (1 - TP_PCT / 100), 4)
            sl_price = round(price * (1 + SL_PCT / 100), 4)
            side     = "sell"

        # Ринковий ордер із вбудованим TP/SL
        order = _exchange.create_order(
            symbol, "market", side, qty,
            params={
                "category":    "linear",
                "takeProfit":  str(tp_price),
                "stopLoss":    str(sl_price),
                "tpTriggerBy": "MarkPrice",
                "slTriggerBy": "MarkPrice",
            },
        )

        info       = order.get("info", {})
        fill_price = float(
            order.get("average") or
            info.get("avgPrice") or
            info.get("lastPriceOnCreated") or
            price
        )

        ts_open = datetime.now(timezone.utc).isoformat()
        try:
            db_id = save_trade(None, coin, action, fill_price, ts_open, bot_source="cascade")
        except Exception:
            db_id = None
        try:
            save_cascade_trade_all_users(coin, action, fill_price, qty)
        except Exception:
            pass

        with _pos_lock:
            _positions[coin] = {
                "symbol":      symbol,
                "action":      action,
                "qty":         qty,
                "fill_price":  fill_price,
                "tp_price":    tp_price,
                "sl_price":    sl_price,
                "opened_at":   datetime.now(timezone.utc).timestamp(),
                "db_id":       db_id,
                "cascade_usd": cascade_usd,
                "size_mult":   size_mult,
            }

        send_telegram_message(
            f"{'🚀' if action == 'LONG' else '🔴'} <b>CASCADE {action}</b> {coin}\n"
            f"Вхід: ${fill_price:.4f} | Qty: {qty}\n"
            f"TP: ${tp_price:.4f} (+{TP_PCT}%) | SL: ${sl_price:.4f} (-{SL_PCT}%)\n"
            f"Каскад: ${cascade_usd/1e6:.2f}M ліквідацій за 1 хв\n"
            f"Плече: {LEVERAGE}x | Розмір: ${size_usd:.0f} (×{size_mult:.1f})\n"
            f"Баланс: ${free_usdt:.2f} USDT",
            TG_CHAT_ID,
        )
        print(f"[CASCADE] ✅ {action} {coin} @ ${fill_price:.4f} qty={qty} TP=${tp_price:.4f} SL=${sl_price:.4f}")

    except Exception as e:
        print(f"[CASCADE] ❌ Execute error {coin} {action}: {e}")
        _cooldowns.pop(coin, None)  # скидаємо cooldown щоб retry спрацював


# ─── Моніторинг позицій ───────────────────────────────────────────────────────

def _monitor_positions() -> None:
    global _daily_pnl, _daily_stopped, _daily_date, _daily_start_bal

    while _running:
        time.sleep(POSITION_CHECK_SEC)

        now   = datetime.now(timezone.utc)
        today = now.strftime("%Y-%m-%d")

        # Скидаємо денний ліміт опівночі UTC
        if today != _daily_date:
            _daily_date    = today
            _daily_pnl     = 0.0
            _daily_stopped = False
            try:
                _daily_start_bal = get_free_usdt(_exchange)
                print(f"[CASCADE] 📅 Новий день | Баланс: ${_daily_start_bal:.2f}")
            except Exception:
                pass

        with _pos_lock:
            coins = list(_positions.keys())

        for coin in coins:
            with _pos_lock:
                pos = _positions.get(coin)
            if not pos:
                continue

            symbol = pos["symbol"]

            # Перевіряємо чи позиція ще відкрита на Bybit
            try:
                ex_pos   = _exchange.fetch_positions([symbol], params={"category": "linear"})
                open_qty = sum(abs(float(p.get("contracts") or 0)) for p in ex_pos)
            except Exception as e:
                print(f"[CASCADE] ⚠️ Position check {coin}: {e}")
                continue

            if open_qty == 0:
                # TP або SL спрацював — Bybit закрив
                realized_pnl = _fetch_realized_pnl(symbol)
                _on_closed(coin, pos, exit_price=0.0, realized_pnl=realized_pnl, reason="tp_sl")
                continue

            # Time stop: 20 хвилин — закриваємо вручну
            age_min = (now.timestamp() - pos["opened_at"]) / 60
            if age_min >= TIME_STOP_MIN:
                print(f"[CASCADE] ⏱️ {coin} time stop ({age_min:.0f} хв)")
                _close_market(coin, pos)


def _fetch_realized_pnl(symbol: str) -> float:
    """Отримуємо реалізований PnL останньої угоди з Bybit."""
    try:
        market_id = _exchange.market_id(symbol)
        r = _exchange.private_get_v5_position_closed_pnl(
            params={"category": "linear", "symbol": market_id, "limit": 1}
        )
        rows = r.get("result", {}).get("list", [])
        if rows:
            return float(rows[0].get("closedPnl", 0) or 0)
    except Exception:
        pass
    return 0.0


def _close_market(coin: str, pos: dict) -> None:
    try:
        close_side = "sell" if pos["action"] == "LONG" else "buy"
        order = _exchange.create_order(
            pos["symbol"], "market", close_side, pos["qty"],
            params={"category": "linear", "reduceOnly": True},
        )
        info       = order.get("info", {})
        exit_price = float(
            order.get("average") or
            info.get("avgPrice") or
            info.get("lastPriceOnCreated") or
            pos["fill_price"]
        )

        # Рахуємо PnL самостійно
        qty = pos["qty"]
        if pos["action"] == "LONG":
            gross = (exit_price - pos["fill_price"]) * qty * LEVERAGE
        else:
            gross = (pos["fill_price"] - exit_price) * qty * LEVERAGE
        fees = (pos["fill_price"] + exit_price) * qty * BYBIT_TAKER_FEE
        pnl  = round(gross - fees, 4)

        _on_closed(coin, pos, exit_price=exit_price, realized_pnl=pnl, reason="time_stop")
    except Exception as e:
        print(f"[CASCADE] ❌ Close market error {coin}: {e}")


def _on_closed(coin: str, pos: dict, exit_price: float, realized_pnl: float, reason: str) -> None:
    global _daily_pnl, _daily_stopped

    with _pos_lock:
        _positions.pop(coin, None)

    _daily_pnl += realized_pnl

    # Закриваємо в БД
    ref_price = exit_price if exit_price > 0 else pos["fill_price"]
    if pos.get("db_id"):
        try:
            age_min = max(0, round((datetime.now(timezone.utc).timestamp() - pos["opened_at"]) / 60))
            if pos["action"] == "LONG":
                pnl_pct = round((ref_price / pos["fill_price"] - 1) * 100, 2)
            else:
                pnl_pct = round((pos["fill_price"] / ref_price - 1) * 100, 2)
            close_trade(pos["db_id"], ref_price, realized_pnl, pnl_pct, age_min)
        except Exception:
            pass
    try:
        close_cascade_trade_all_users(coin, ref_price, realized_pnl)
    except Exception:
        pass

    icon       = "✅" if realized_pnl >= 0 else "❌"
    reason_str = {"tp_sl": "TP/SL Bybit", "time_stop": "⏱️ Time Stop 20хв"}.get(reason, reason)

    print(f"[CASCADE] {icon} {pos['action']} {coin} → {reason_str} | PnL=${realized_pnl:+.2f} | день=${_daily_pnl:+.2f}")

    send_telegram_message(
        f"{icon} <b>CASCADE закрито</b> {coin}\n"
        f"Причина: {reason_str}\n"
        f"Вхід: ${pos['fill_price']:.4f}"
        + (f" | Вихід: ${exit_price:.4f}" if exit_price > 0 else "") +
        f"\nPnL: <b>${realized_pnl:+.2f}</b> | День: ${_daily_pnl:+.2f}",
        TG_CHAT_ID,
    )

    # Денний стоп
    if _daily_start_bal > 0 and _daily_pnl < -(_daily_start_bal * DAILY_LOSS_LIMIT):
        _daily_stopped = True
        print(f"[CASCADE] 🛑 Денний стоп: ${_daily_pnl:.2f} | ліміт ${_daily_start_bal * DAILY_LOSS_LIMIT:.2f}")
        send_telegram_message(
            f"🛑 <b>CASCADE — денний стоп</b>\n"
            f"Збиток: <b>${_daily_pnl:.2f}</b> (ліміт {DAILY_LOSS_LIMIT*100:.0f}% = ${_daily_start_bal * DAILY_LOSS_LIMIT:.2f})\n"
            f"Відновлення: UTC опівніч",
            TG_CHAT_ID,
        )


# ─── WebSocket thread ─────────────────────────────────────────────────────────

def _ws_thread() -> None:
    def on_error(ws, err):
        print(f"[CASCADE/WS] error: {err}")

    def on_close(ws, *_):
        print("[CASCADE/WS] з'єднання закрито — реконект через 10с")

    def on_open(ws):
        def _fmt(c):
            t = LIQ_THRESHOLD[c]
            return f"{c} ${t/1e6:.1f}M" if t >= 1_000_000 else f"{c} ${t/1000:.0f}K"
        coins_str = " | ".join(_fmt(c) for c in WATCHLIST)
        print(f"[CASCADE/WS] ✅ Підключено — {coins_str} / 1хв")

    while _running:
        try:
            ws = websocket.WebSocketApp(
                "wss://fstream.binance.com/ws/!forceOrder@arr",
                on_message=_on_ws_message,
                on_error=on_error,
                on_close=on_close,
                on_open=on_open,
            )
            ws.run_forever(ping_interval=20, ping_timeout=10)
        except Exception as e:
            print(f"[CASCADE/WS] exception: {e}")
        if _running:
            time.sleep(10)


# ─── Головний цикл ────────────────────────────────────────────────────────────

def run_cascade_bot() -> None:
    global _running, _exchange, _daily_date, _daily_start_bal

    if CASCADE_LIVE_MODE:
        mode_tag = "[LIVE 🔴]"
    elif CASCADE_IS_DEMO:
        mode_tag = "[DEMO]"
    else:
        mode_tag = "[DEMO via IS_DEMO_TRADING]"

    def _fmt_thresh(c):
        t = LIQ_THRESHOLD[c]
        return f"{c} ${t/1e6:.1f}M" if t >= 1_000_000 else f"{c} ${t/1000:.0f}K"
    thresholds_str = " | ".join(_fmt_thresh(c) for c in WATCHLIST)
    print("=" * 60)
    print(f"  CASCADE BOT {mode_tag}  —  {', '.join(WATCHLIST)}")
    print(f"  TP {TP_PCT}% | SL {SL_PCT}% | LEV {LEVERAGE}x | SIZE {SIZE_PCT}%")
    print(f"  Break-even WR: ~29%")
    print(f"  Пороги: {thresholds_str} / хвилину")
    print(f"  Max позицій: {MAX_POSITIONS} | Time stop: {TIME_STOP_MIN}хв | Денний стоп: {DAILY_LOSS_LIMIT*100:.0f}%")
    print("=" * 60)

    _running = True

    try:
        _exchange = _init_cascade_exchange()
    except Exception as e:
        print(f"[CASCADE] ❌ Bybit init failed: {e}")
        return

    _daily_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        _daily_start_bal = get_free_usdt(_exchange)
    except Exception:
        _daily_start_bal = 0.0

    send_telegram_message(
        f"🚀 <b>Cascade Bot запущено {mode_tag}</b>\n"
        f"Монети: {', '.join(WATCHLIST)}\n"
        f"TP: {TP_PCT}% | SL: {SL_PCT}% | {LEVERAGE}x | {SIZE_PCT}% балансу\n"
        f"Max позицій: {MAX_POSITIONS} | Cooldown: {COOLDOWN_SEC//60}хв | Time stop: {TIME_STOP_MIN}хв\n"
        f"Break-even WR: ~29% | Денний стоп: {DAILY_LOSS_LIMIT*100:.0f}%\n"
        f"Баланс: ${_daily_start_bal:.2f} USDT",
        TG_CHAT_ID,
    )

    threading.Thread(target=_ws_thread,        name="cascade-ws",      daemon=True).start()
    threading.Thread(target=_monitor_positions, name="cascade-monitor", daemon=True).start()

    print("[CASCADE] Всі потоки запущено. Слухаємо ліквідації...")

    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        print("\n[CASCADE] Зупинено.")
        _running = False


if __name__ == "__main__":
    run_cascade_bot()
