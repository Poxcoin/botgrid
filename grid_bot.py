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
from config.settings import TG_CHAT_ID, IS_DEMO_TRADING

# ─── Конфігурація сіток (одна або більше монет) ────────────────────────────────

GRID_CONFIGS = [
    {
        "symbol":        "SOL/USDT:USDT",
        "levels":        10,
        "size_usd":      30.0,
        "leverage":      2,
        "auto_range":    True,
        "upper_manual":  200.0,
        "lower_manual":  120.0,
        "max_positions": 5,
    },
    {
        "symbol":        "BTC/USDT:USDT",
        "levels":        8,
        "size_usd":      20.0,
        "leverage":      2,
        "auto_range":    True,
        "upper_manual":  100000.0,
        "lower_manual":  80000.0,
        "max_positions": 4,
    },
    {
        "symbol":        "ETH/USDT:USDT",
        "levels":        10,
        "size_usd":      25.0,
        "leverage":      2,
        "auto_range":    True,
        "upper_manual":  4000.0,
        "lower_manual":  2500.0,
        "max_positions": 5,
    },
]

POLL_INTERVAL      = 60    # секунд між перевірками
RANGE_BUFFER       = 0.05  # 5% буфер від 30d high/low
MAX_REBUILDS_DAY   = 3     # макс перебудов сітки за день на монету
MAX_LOSS_PCT       = 0.03  # жорсткий стоп: 3% від балансу на монету

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

def _detect_range(exchange, symbol: str) -> tuple[float, float]:
    """30-денний high/low + 5% буфер."""
    ohlcv = exchange.fetch_ohlcv(symbol, timeframe="1d", limit=30)
    highs = [c[2] for c in ohlcv]
    lows  = [c[3] for c in ohlcv]
    high  = max(highs)
    low   = min(lows)
    upper = round(high * (1 + RANGE_BUFFER), 2)
    lower = round(low  * (1 - RANGE_BUFFER), 2)
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
            fill = float(order.get("average") or order.get("price") or price)
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
        fill = float(order.get("average") or order.get("price") or level_price)
        print(f"[GRID:{symbol}] BUY level {level_idx} @ {fill:.4f} | qty={qty}")
        return {"fill_price": fill, "qty": qty, "order_id": order.get("id")}
    except Exception as e:
        print(f"[GRID:{symbol}] BUY error level {level_idx}: {e}")
        return None


def _close_long(exchange, symbol: str, entry: dict, level_idx: int, leverage: int) -> bool:
    try:
        order = exchange.create_order(
            symbol, "market", "sell", entry["qty"],
            params={"category": "linear", "reduceOnly": True},
        )
        fill = float(order.get("average") or order.get("price") or 0)
        pnl  = (fill - entry["fill_price"]) * entry["qty"] * leverage
        print(f"[GRID:{symbol}] SELL level {level_idx} @ {fill:.4f} | PnL≈${pnl:.2f}")
        return True
    except Exception as e:
        print(f"[GRID:{symbol}] SELL error level {level_idx}: {e}")
        return False


# ─── Один потік на монету ─────────────────────────────────────────────────────

def _run_single(cfg: dict) -> None:
    """Запускаємо grid-цикл для однієї монети (виконується у власному потоці)."""
    symbol       = cfg["symbol"]
    grid_levels  = cfg["levels"]
    size_usd     = cfg["size_usd"]
    leverage     = cfg["leverage"]
    auto_range   = cfg["auto_range"]
    max_pos      = cfg["max_positions"]

    exchange = _init_exchange()  # окремий об'єкт на кожен потік — ccxt не thread-safe
    _set_leverage(exchange, symbol, leverage)

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
                if price >= levels[-1]:
                    print(f"[GRID:{symbol}] Ціна ${price:.2f} вище сітки (${levels[-1]:.2f})")
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

            positions = state["positions"]

            # SELL: якщо ціна виросла вище рівня де маємо позицію
            for idx_str, entry in list(positions.items()):
                idx = int(idx_str)
                sell_level = levels[idx + 1] if idx + 1 < len(levels) else None
                if sell_level and price >= sell_level:
                    if _close_long(exchange, symbol, entry, idx, leverage):
                        pnl = (price - entry["fill_price"]) * entry["qty"] * leverage
                        state["total_pnl"] += pnl
                        state["completed"] += 1
                        del positions[idx_str]
                        _save_state(symbol, state)
                        send_telegram_message(
                            f"✅ <b>Grid SELL</b> {symbol}\n"
                            f"Рівень {idx} → {idx + 1}\n"
                            f"Вхід: ${entry['fill_price']:.4f} | Вихід: ${price:.4f}\n"
                            f"PnL: +${pnl:.2f} | Всього циклів: {state['completed']}\n"
                            f"Загальний PnL: ${state['total_pnl']:.2f}",
                            TG_CHAT_ID,
                        )

            # BUY: якщо ціна в зоні рівня і позиції тут немає
            if str(current_zone) not in positions:
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

def run_grid_engine():
    """Запускає кожну монету з GRID_CONFIGS у власному потоці."""
    threads = []
    for cfg in GRID_CONFIGS:
        t = threading.Thread(
            target=_run_single,
            args=(cfg,),
            name=f"grid-{cfg['symbol']}",
            daemon=True,
        )
        t.start()
        threads.append(t)
        print(f"[GRID] Запущено потік для {cfg['symbol']}")

    try:
        while True:
            time.sleep(60)
            alive = [t.name for t in threads if t.is_alive()]
            dead  = [t.name for t in threads if not t.is_alive()]
            if dead:
                print(f"[GRID] Мертві потоки: {dead}")
    except KeyboardInterrupt:
        print("\n[GRID] Зупинено всі сітки.")


if __name__ == "__main__":
    run_grid_engine()
