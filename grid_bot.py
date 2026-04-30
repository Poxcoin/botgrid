"""
grid_bot.py — Grid Trading Bot (Стратегія #2).

Логіка: ділимо ціновий діапазон на N рівнів.
  - Ціна падає до рівня → BUY
  - Ціна виростає на рівень вище → SELL
  Прибуток = крок сітки × кількість completed cycles.

Не потребує передбачення напрямку — заробляє на волатильності.
Добре працює в sideways ринку (BTC/ETH 70% часу).

Запускається як окремий сервіс: crypto-grid.service
На платформі: кожен юзер має свою конфігурацію і свої API ключі.

Multi-coin support: кожна монета запускається у власному потоці.
"""
import json
import os
import threading
import time
from datetime import datetime, timezone
from typing import Optional

import ccxt

from modules.trader import _init_exchange, get_free_usdt
from modules.tg_notifier import send_telegram_message
from modules import daily_guard
from modules.market_data import get_btc_2h_change
from config.settings import TG_CHAT_ID, IS_DEMO_TRADING

BTC_DUMP_THRESHOLD = -2.5  # % за 2h — призупиняємо нові BUY на альти

# ─── Конфігурація сіток (одна або більше монет) ────────────────────────────────

GRID_CONFIGS = [
    {
        "symbol":        "SOL/USDT:USDT",
        "levels":        10,
        "size_pct":      1.5,    # % від балансу на рівень (замість фіксованого $)
        "size_usd_min":  10.0,   # мінімум на рівень
        "leverage":      2,
        "auto_range":    True,
        "upper_manual":  200.0,
        "lower_manual":  120.0,
        "max_positions": 5,
    },
    {
        "symbol":        "BTC/USDT:USDT",
        "levels":        8,
        "size_pct":      1.0,
        "size_usd_min":  10.0,
        "leverage":      2,
        "auto_range":    True,
        "upper_manual":  100000.0,
        "lower_manual":  80000.0,
        "max_positions": 4,
    },
    {
        "symbol":        "ETH/USDT:USDT",
        "levels":        10,
        "size_pct":      1.2,
        "size_usd_min":  10.0,
        "leverage":      2,
        "auto_range":    True,
        "upper_manual":  4000.0,
        "lower_manual":  2500.0,
        "max_positions": 5,
    },
    {
        "symbol":        "DOGE/USDT:USDT",
        "levels":        10,
        "size_pct":      1.0,
        "size_usd_min":  10.0,
        "leverage":      3,
        "auto_range":    True,
        "upper_manual":  0.50,
        "lower_manual":  0.15,
        "max_positions": 5,
    },
    {
        "symbol":        "XRP/USDT:USDT",
        "levels":        10,
        "size_pct":      1.0,
        "size_usd_min":  10.0,
        "leverage":      3,
        "auto_range":    True,
        "upper_manual":  3.50,
        "lower_manual":  1.50,
        "max_positions": 5,
    },
]

POLL_INTERVAL      = 60    # секунд між перевірками
RANGE_BUFFER       = 0.02  # 2% буфер по краях ATR-діапазону
MAX_REBUILDS_DAY   = 3     # макс перебудов сітки за день на монету
MAX_LOSS_PCT       = 0.03  # жорсткий стоп: 3% від балансу на монету
ATR_RANGE_PERIODS  = 10    # Range = current ± ATR_RANGE_PERIODS × ATR(14,1h)

# ─── State ───────────────────────────────────────────────────────────────────

def _state_file(symbol: str) -> str:
    """Окремий файл стану для кожної монети."""
    safe = symbol.replace("/", "_").replace(":", "_")
    return f"grid_state_{safe}.json"


def _load_state(symbol: str) -> dict:
    path = _state_file(symbol)
    if os.path.exists(path):
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_state(symbol: str, state: dict) -> None:
    with open(_state_file(symbol), "w") as f:
        json.dump(state, f, indent=2)


# ─── Авто-діапазон ───────────────────────────────────────────────────────────

def _calc_atr(exchange, symbol: str, period: int = 14) -> float:
    """ATR(14) на 1h свічках. Повертає 0.0 при помилці."""
    try:
        ohlcv = exchange.fetch_ohlcv(symbol, timeframe="1h", limit=period + 2)
        if len(ohlcv) < period + 1:
            return 0.0
        trs = []
        for i in range(1, len(ohlcv)):
            high, low, prev_close = ohlcv[i][2], ohlcv[i][3], ohlcv[i - 1][4]
            tr = max(high - low, abs(high - prev_close), abs(low - prev_close))
            trs.append(tr)
        return sum(trs[-period:]) / period
    except Exception as e:
        print(f"[GRID:{symbol}] ATR error: {e}")
        return 0.0


def _detect_range(exchange, symbol: str) -> tuple[float, float]:
    """ATR-based range: current_price ± ATR_RANGE_PERIODS × ATR(14,1h).

    У волатильний час ATR зростає → крок сітки ширший → менше whipsaw.
    У спокійний час ATR менший → кроки вужчі → більше циклів.
    Fallback на 30-денний high/low якщо ATR недоступний.
    """
    try:
        ticker = exchange.fetch_ticker(symbol)
        price  = float(ticker["last"])
        atr    = _calc_atr(exchange, symbol)

        if atr > 0:
            half_range = ATR_RANGE_PERIODS * atr
            upper = round(price * (1 + RANGE_BUFFER) + half_range, 4)
            lower = round(max(price * (1 - RANGE_BUFFER) - half_range, price * 0.5), 4)
            print(f"[GRID:{symbol}] ATR={atr:.4f} → range ${lower}—${upper} "
                  f"(крок ≈${half_range * 2 / 10:.2f} на 10 рівнів)")
            return upper, lower
    except Exception as e:
        print(f"[GRID:{symbol}] ATR range error: {e}")

    # Fallback: 30-денний high/low
    ohlcv = exchange.fetch_ohlcv(symbol, timeframe="1d", limit=30)
    highs = [c[2] for c in ohlcv]
    lows  = [c[3] for c in ohlcv]
    upper = round(max(highs) * 1.05, 2)
    lower = round(min(lows)  * 0.95, 2)
    print(f"[GRID:{symbol}] Fallback 30d range: ${lower}—${upper}")
    return upper, lower


def _calc_levels(upper: float, lower: float, n: int) -> list[float]:
    """Рівномірно ділимо діапазон на n рівнів."""
    step = (upper - lower) / n
    return [round(lower + step * i, 4) for i in range(n + 1)]


# ─── Допоміжні функції ───────────────────────────────────────────────────────

def _close_all_positions(exchange, symbol: str, positions: dict, leverage: int, price: float) -> float:
    """Закриває всі відкриті позиції, повертає реалізований збиток (від'ємне число)."""
    total_pnl = 0.0
    for idx_str, entry in list(positions.items()):
        try:
            order = exchange.create_order(
                symbol, "market", "sell", entry["qty"],
                params={"category": "linear", "reduceOnly": True},
            )
            info = order.get("info", {})
            fill = float(
                order.get("average") or
                info.get("avgPrice") or
                info.get("lastPriceOnCreated") or
                order.get("price") or price
            )
            pnl  = (fill - entry["fill_price"]) * entry["qty"] * leverage
            total_pnl += pnl
            print(f"[GRID:{symbol}] CLOSE level {idx_str} @ {fill:.4f} | PnL≈${pnl:.2f}")
        except Exception as e:
            print(f"[GRID:{symbol}] CLOSE error level {idx_str}: {e}")
    positions.clear()
    return total_pnl


def _unrealized_loss(positions: dict, price: float, leverage: int) -> float:
    """Поточний нереалізований збиток по всіх відкритих позиціях."""
    loss = 0.0
    for entry in positions.values():
        pnl = (price - entry["fill_price"]) * entry["qty"] * leverage
        if pnl < 0:
            loss += pnl
    return loss


# ─── Core логіка ─────────────────────────────────────────────────────────────

def _get_current_price(exchange, symbol: str) -> float:
    ticker = exchange.fetch_ticker(symbol)
    return float(ticker["last"])


def _get_quantity(exchange, symbol: str, price: float, size_usd: float, leverage: int) -> float:
    """Конвертуємо size_usd в кількість контрактів."""
    market  = exchange.market(symbol)
    min_qty = float(market.get("limits", {}).get("amount", {}).get("min", 0.01))
    qty     = (size_usd * leverage) / price
    qty     = max(round(qty, 3), min_qty)
    return qty


def _set_leverage(exchange, symbol: str, leverage: int) -> None:
    try:
        exchange.set_leverage(leverage, symbol, params={"category": "linear"})
    except Exception as e:
        print(f"[GRID:{symbol}] leverage: {e}")


def _open_long(exchange, symbol: str, level_price: float, level_idx: int,
               size_usd: float, leverage: int) -> Optional[dict]:
    try:
        qty = _get_quantity(exchange, symbol, level_price, size_usd, leverage)
        order = exchange.create_order(
            symbol, "market", "buy", qty,
            params={"category": "linear"},
        )
        info = order.get("info", {})
        fill = float(
            order.get("average") or
            info.get("avgPrice") or
            info.get("lastPriceOnCreated") or
            order.get("price") or
            level_price
        )
        print(f"[GRID:{symbol}] BUY level {level_idx} @ {fill:.4f} | qty={qty}")
        return {"fill_price": fill, "qty": qty, "order_id": order.get("id")}
    except Exception as e:
        print(f"[GRID:{symbol}] BUY error level {level_idx}: {e}")
        return None


def _close_long(exchange, symbol: str, entry: dict, level_idx: int, leverage: int) -> tuple[bool, float, float]:
    """Закриває позицію. Повертає (success, realized_pnl, fill_price)."""
    try:
        order = exchange.create_order(
            symbol, "market", "sell", entry["qty"],
            params={"category": "linear", "reduceOnly": True},
        )
        info = order.get("info", {})
        fill = float(
            order.get("average") or
            info.get("avgPrice") or
            info.get("lastPriceOnCreated") or
            order.get("price") or
            entry["fill_price"]
        )
        pnl  = (fill - entry["fill_price"]) * entry["qty"] * leverage
        print(f"[GRID:{symbol}] SELL level {level_idx} @ {fill:.4f} | PnL=${pnl:.2f}")
        return True, pnl, fill
    except Exception as e:
        print(f"[GRID:{symbol}] SELL error level {level_idx}: {e}")
        return False, 0.0, 0.0


# ─── Один потік на монету ─────────────────────────────────────────────────────

def _run_single(cfg: dict) -> None:
    """Запускаємо grid-цикл для однієї монети (виконується у власному потоці)."""
    symbol       = cfg["symbol"]
    grid_levels  = cfg["levels"]
    leverage     = cfg["leverage"]
    auto_range   = cfg["auto_range"]
    max_pos      = cfg["max_positions"]
    size_pct     = cfg.get("size_pct", 1.0)
    size_usd_min = cfg.get("size_usd_min", 10.0)

    exchange = _init_exchange()  # окремий об'єкт на кожен потік — ccxt не thread-safe
    _set_leverage(exchange, symbol, leverage)

    # Розмір позиції = % від балансу (перераховується при кожному запуску)
    _balance = get_free_usdt(exchange)
    size_usd = max(round(_balance * size_pct / 100.0, 2), size_usd_min)
    print(f"[GRID:{symbol}] size_usd=${size_usd:.2f} ({size_pct}% від ${_balance:.2f})")

    if auto_range:
        upper, lower = _detect_range(exchange, symbol)
        print(f"[GRID:{symbol}] Авто-діапазон: ${lower:.2f} — ${upper:.2f}")
    else:
        upper, lower = cfg["upper_manual"], cfg["lower_manual"]

    levels = _calc_levels(upper, lower, grid_levels)
    step   = levels[1] - levels[0]

    print(f"[GRID:{symbol}] {grid_levels} рівнів | крок ${step:.2f}")
    print(f"[GRID:{symbol}] ${size_usd}/рівень × {leverage}x | макс позицій: {max_pos}")

    state = _load_state(symbol)
    if not state.get("levels") or state.get("symbol") != symbol:
        state = {
            "symbol":     symbol,
            "upper":      upper,
            "lower":      lower,
            "levels":     levels,
            "positions":  {},
            "completed":  0,
            "total_pnl":  0.0,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }
        _save_state(symbol, state)

    # Таймер: фіксуємо коли ціна вперше вийшла за межу (затримка перед перебудовою)
    _out_of_range_since: Optional[float] = None
    OUT_OF_RANGE_DELAY = 30 * 60  # 30 хвилин

    free = get_free_usdt(exchange)
    send_telegram_message(
        f"🔷 <b>Grid Bot запущено</b>\n"
        f"<b>Монета:</b> {symbol}\n"
        f"<b>Діапазон:</b> ${lower:.2f} — ${upper:.2f}\n"
        f"<b>Рівнів:</b> {grid_levels} | Крок: ${step:.2f}\n"
        f"<b>Розмір:</b> ${size_usd} × {leverage}x\n"
        f"<b>Баланс:</b> ${free:.2f} USDT",
        TG_CHAT_ID,
    )

    last_price = _get_current_price(exchange, symbol)
    print(f"[GRID:{symbol}] Поточна ціна: ${last_price:.4f}")

    rebuilds_today  = 0
    rebuild_day     = datetime.now(timezone.utc).date()

    while True:
        try:
            time.sleep(POLL_INTERVAL)
            price = _get_current_price(exchange, symbol)

            # Скидаємо лічильник перебудов о опівночі UTC
            today = datetime.now(timezone.utc).date()
            if today != rebuild_day:
                rebuilds_today = 0
                rebuild_day    = today

            current_zone = None
            for i in range(len(levels) - 1):
                if levels[i] <= price < levels[i + 1]:
                    current_zone = i
                    break

            if current_zone is None:
                if price >= levels[-1] or price < levels[0]:
                    # Ціна вийшла за межу — запускаємо таймер затримки
                    if _out_of_range_since is None:
                        _out_of_range_since = time.time()
                        direction = "вище" if price >= levels[-1] else "нижче"
                        print(f"[GRID:{symbol}] Ціна ${price:.2f} {direction} межі — чекаємо 30 хв перед перебудовою")
                        last_price = price
                        continue

                    waited = time.time() - _out_of_range_since
                    if waited < OUT_OF_RANGE_DELAY:
                        mins_left = int((OUT_OF_RANGE_DELAY - waited) / 60)
                        print(f"[GRID:{symbol}] Out-of-range {waited/60:.0f} хв — ще {mins_left} хв до перебудови")
                        last_price = price
                        continue

                    # 30 хвилин минуло — перебудовуємо
                    _out_of_range_since = None

                if price >= levels[-1]:
                    # Ціна вище верхньої межі 30 хв → перебудовуємо сітку вгору
                    if rebuilds_today < MAX_REBUILDS_DAY:
                        print(f"[GRID:{symbol}] 🔄 Перебудова вгору (#{rebuilds_today + 1}) — ціна ${price:.2f} > ${levels[-1]:.2f}")
                        realized = _close_all_positions(exchange, symbol, state["positions"], leverage, price)
                        state["total_pnl"] += realized
                        state["positions"] = {}
                        upper, lower = _detect_range(exchange, symbol)
                        levels = _calc_levels(upper, lower, grid_levels)
                        state.update({"upper": upper, "lower": lower, "levels": levels})
                        _save_state(symbol, state)
                        rebuilds_today += 1
                        send_telegram_message(
                            f"🔄 <b>Grid перебудова вгору #{rebuilds_today}</b> {symbol}\n"
                            f"Новий діапазон: ${lower:.2f} — ${upper:.2f}\n"
                            f"Реалізований PnL: ${realized:.2f}",
                            TG_CHAT_ID,
                        )
                    last_price = price
                    continue

                if price < levels[0]:
                    unreal = _unrealized_loss(state["positions"], price, leverage)
                    total_loss = state["total_pnl"] + unreal
                    balance = get_free_usdt(exchange)
                    max_loss_usd = balance * MAX_LOSS_PCT

                    hard_stop = total_loss <= -max_loss_usd
                    no_rebuilds = rebuilds_today >= MAX_REBUILDS_DAY

                    if hard_stop or no_rebuilds:
                        reason = f"збиток ${total_loss:.2f} (ліміт ${max_loss_usd:.0f}, {MAX_LOSS_PCT*100:.0f}% балансу)" if hard_stop else f"вичерпано перебудов ({rebuilds_today})"
                        print(f"[GRID:{symbol}] 🛑 СТОП — {reason}. Закриваємо всі позиції.")
                        realized = _close_all_positions(exchange, symbol, state["positions"], leverage, price)
                        state["total_pnl"] += realized
                        state["positions"] = {}
                        _save_state(symbol, state)
                        send_telegram_message(
                            f"🛑 <b>Grid ЗУПИНЕНО</b> {symbol}\n"
                            f"Причина: {reason}\n"
                            f"Загальний PnL: ${state['total_pnl']:.2f}",
                            TG_CHAT_ID,
                        )
                        return  # зупиняємо потік

                    # Перебудова сітки навколо поточної ціни
                    print(f"[GRID:{symbol}] 🔄 Перебудова сітки (#{rebuilds_today + 1}) — ціна ${price:.2f} нижче межі")
                    realized = _close_all_positions(exchange, symbol, state["positions"], leverage, price)
                    state["total_pnl"] += realized
                    state["positions"] = {}
                    upper, lower = _detect_range(exchange, symbol)
                    levels = _calc_levels(upper, lower, grid_levels)
                    state["upper"]  = upper
                    state["lower"]  = lower
                    state["levels"] = levels
                    _save_state(symbol, state)
                    rebuilds_today += 1
                    send_telegram_message(
                        f"🔄 <b>Grid перебудова #{rebuilds_today}</b> {symbol}\n"
                        f"Новий діапазон: ${lower:.2f} — ${upper:.2f}\n"
                        f"Реалізований PnL: ${realized:.2f} | Загалом: ${state['total_pnl']:.2f}",
                        TG_CHAT_ID,
                    )
                    last_price = price
                    continue

            # Ціна повернулась в діапазон — скидаємо таймер
            _out_of_range_since = None

            positions = state["positions"]

            # SELL: якщо ціна виросла вище рівня де маємо позицію
            for idx_str, entry in list(positions.items()):
                idx = int(idx_str)
                sell_level = levels[idx + 1] if idx + 1 < len(levels) else None
                if sell_level and price >= sell_level:
                    success, realized_pnl, fill_price = _close_long(exchange, symbol, entry, idx, leverage)
                    if success:
                        state["total_pnl"] += realized_pnl
                        state["completed"] += 1
                        del positions[idx_str]
                        _save_state(symbol, state)
                        send_telegram_message(
                            f"✅ <b>Grid SELL</b> {symbol}\n"
                            f"Рівень {idx} → {idx + 1}\n"
                            f"Вхід: ${entry['fill_price']:.4f} | Вихід: ${fill_price:.4f}\n"
                            f"PnL: +${realized_pnl:.2f} | Всього циклів: {state['completed']}\n"
                            f"Загальний PnL: ${state['total_pnl']:.2f}",
                            TG_CHAT_ID,
                        )

            # BUY: якщо ціна в зоні рівня і позиції тут немає
            if str(current_zone) not in positions:
                # BTC dump filter: не відкриваємо нові позиції якщо BTC сильно падає
                _btc_chg = get_btc_2h_change()
                _is_btc = symbol.startswith("BTC")
                if not _is_btc and _btc_chg < BTC_DUMP_THRESHOLD:
                    print(f"[GRID:{symbol}] 🚫 BTC {_btc_chg:.1f}% за 2h — BUY призупинено")
                    last_price = price
                    continue

                if len(positions) < max_pos:
                    result = _open_long(exchange, symbol, price, current_zone,
                                        size_usd, leverage)
                    if result:
                        positions[str(current_zone)] = {
                            **result,
                            "opened_at":   datetime.now(timezone.utc).isoformat(),
                            "level_price": levels[current_zone],
                        }
                        _save_state(symbol, state)
                        send_telegram_message(
                            f"🟢 <b>Grid BUY</b> {symbol}\n"
                            f"Рівень {current_zone} @ ${price:.4f}\n"
                            f"Qty: {result['qty']} | "
                            f"Відкрито позицій: {len(positions)}",
                            TG_CHAT_ID,
                        )

            last_price = price

        except Exception as e:
            print(f"[GRID:{symbol}] Помилка: {e}")
            time.sleep(30)


# ─── Головний цикл ───────────────────────────────────────────────────────────

def _start_thread(cfg: dict) -> threading.Thread:
    """Створює і запускає потік для однієї монети."""
    t = threading.Thread(
        target=_run_single,
        args=(cfg,),
        name=f"grid-{cfg['symbol']}",
        daemon=True,
    )
    t.start()
    return t


def run_grid_engine():
    """Запускає кожну монету з GRID_CONFIGS у власному потоці.
    Авто-рестарт: якщо потік впав — перезапускаємо через 60 секунд.
    """
    # cfg -> thread
    thread_map: dict[str, threading.Thread] = {}
    for cfg in GRID_CONFIGS:
        sym = cfg["symbol"]
        thread_map[sym] = _start_thread(cfg)
        print(f"[GRID] Запущено потік для {sym}")

    try:
        while True:
            time.sleep(60)
            for cfg in GRID_CONFIGS:
                sym = cfg["symbol"]
                t   = thread_map.get(sym)
                if t and not t.is_alive():
                    print(f"[GRID] ⚠️ Потік {sym} впав — перезапуск...")
                    send_telegram_message(
                        f"⚠️ <b>Grid потік перезапущено</b>\n<code>{sym}</code>",
                        TG_CHAT_ID,
                    )
                    thread_map[sym] = _start_thread(cfg)
    except KeyboardInterrupt:
        print("\n[GRID] Зупинено всі сітки.")


if __name__ == "__main__":
    run_grid_engine()
