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
"""
import json
import os
import time
from datetime import datetime, timezone
from typing import Optional

import ccxt

from modules.trader import _init_exchange, get_free_usdt
from modules.tg_notifier import send_telegram_message
from modules import daily_guard
from config.settings import TG_CHAT_ID, IS_DEMO_TRADING

# ─── Конфігурація сітки ───────────────────────────────────────────────────────

GRID_SYMBOL    = "SOL/USDT:USDT"
GRID_LEVELS    = 10        # кількість рівнів
GRID_SIZE_USD  = 30.0      # USDT на рівень
GRID_LEVERAGE  = 2         # плечо
GRID_AUTO_RANGE = True     # авто-визначення діапазону з 30d OHLCV
# Ручний діапазон (якщо GRID_AUTO_RANGE=False)
GRID_UPPER_MANUAL = 200.0
GRID_LOWER_MANUAL = 120.0

POLL_INTERVAL  = 60        # секунд між перевірками
STATE_FILE     = "grid_state.json"
RANGE_BUFFER   = 0.05      # 5% буфер від 30d high/low

# ─── State ───────────────────────────────────────────────────────────────────

def _load_state() -> dict:
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_state(state: dict) -> None:
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)


# ─── Авто-діапазон ───────────────────────────────────────────────────────────

def _detect_range(exchange) -> tuple[float, float]:
    """30-денний high/low + 5% буфер."""
    ohlcv = exchange.fetch_ohlcv(GRID_SYMBOL, timeframe="1d", limit=30)
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


# ─── Core логіка ─────────────────────────────────────────────────────────────

def _get_current_price(exchange) -> float:
    ticker = exchange.fetch_ticker(GRID_SYMBOL)
    return float(ticker["last"])


def _get_quantity(exchange, price: float) -> float:
    """Конвертуємо GRID_SIZE_USD в кількість контрактів."""
    market   = exchange.market(GRID_SYMBOL)
    min_qty  = float(market.get("limits", {}).get("amount", {}).get("min", 0.01))
    qty      = (GRID_SIZE_USD * GRID_LEVERAGE) / price
    qty      = max(round(qty, 3), min_qty)
    return qty


def _set_leverage(exchange):
    try:
        exchange.set_leverage(GRID_LEVERAGE, GRID_SYMBOL, params={"category": "linear"})
    except Exception as e:
        print(f"[GRID] leverage: {e}")


def _open_long(exchange, level_price: float, level_idx: int) -> Optional[dict]:
    try:
        qty = _get_quantity(exchange, level_price)
        order = exchange.create_order(
            GRID_SYMBOL, "market", "buy", qty,
            params={"category": "linear"},
        )
        fill = float(order.get("average") or order.get("price") or level_price)
        print(f"[GRID] 🟢 BUY level {level_idx} @ {fill:.4f} | qty={qty}")
        return {"fill_price": fill, "qty": qty, "order_id": order.get("id")}
    except Exception as e:
        print(f"[GRID] ❌ BUY error level {level_idx}: {e}")
        return None


def _close_long(exchange, entry: dict, level_idx: int) -> bool:
    try:
        order = exchange.create_order(
            GRID_SYMBOL, "market", "sell", entry["qty"],
            params={"category": "linear", "reduceOnly": True},
        )
        fill  = float(order.get("average") or order.get("price") or 0)
        pnl   = (fill - entry["fill_price"]) * entry["qty"] * GRID_LEVERAGE
        print(f"[GRID] 🔴 SELL level {level_idx} @ {fill:.4f} | PnL≈${pnl:.2f}")
        return True
    except Exception as e:
        print(f"[GRID] ❌ SELL error level {level_idx}: {e}")
        return False


# ─── Головний цикл ───────────────────────────────────────────────────────────

def run_grid_engine():
    exchange = _init_exchange()
    _set_leverage(exchange)

    # Визначаємо діапазон
    if GRID_AUTO_RANGE:
        upper, lower = _detect_range(exchange)
        print(f"[GRID] 📐 Авто-діапазон: ${lower:.2f} — ${upper:.2f}")
    else:
        upper, lower = GRID_UPPER_MANUAL, GRID_LOWER_MANUAL

    levels = _calc_levels(upper, lower, GRID_LEVELS)
    step   = levels[1] - levels[0]

    print(f"[GRID] 🔷 {GRID_SYMBOL} | {GRID_LEVELS} рівнів | крок ${step:.2f}")
    print(f"[GRID] 💰 ${GRID_SIZE_USD}/рівень × {GRID_LEVERAGE}x | "
          f"макс позицій: {GRID_LEVELS}")

    # Завантажуємо або ініціалізуємо стан
    state = _load_state()
    if not state.get("levels") or state.get("symbol") != GRID_SYMBOL:
        state = {
            "symbol":     GRID_SYMBOL,
            "upper":      upper,
            "lower":      lower,
            "levels":     levels,
            "positions":  {},   # idx → {fill_price, qty, order_id, opened_at}
            "completed":  0,
            "total_pnl":  0.0,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }
        _save_state(state)

    free = get_free_usdt(exchange)
    send_telegram_message(
        f"🔷 <b>Grid Bot запущено</b>\n"
        f"<b>Монета:</b> {GRID_SYMBOL}\n"
        f"<b>Діапазон:</b> ${lower:.2f} — ${upper:.2f}\n"
        f"<b>Рівнів:</b> {GRID_LEVELS} | Крок: ${step:.2f}\n"
        f"<b>Розмір:</b> ${GRID_SIZE_USD} × {GRID_LEVERAGE}x\n"
        f"<b>Баланс:</b> ${free:.2f} USDT",
        TG_CHAT_ID,
    )

    last_price = _get_current_price(exchange)
    print(f"[GRID] Поточна ціна: ${last_price:.4f}")

    while True:
        try:
            time.sleep(POLL_INTERVAL)
            price = _get_current_price(exchange)

            # Визначаємо в якому рівні зараз ціна
            current_zone = None
            for i in range(len(levels) - 1):
                if levels[i] <= price < levels[i + 1]:
                    current_zone = i
                    break

            if current_zone is None:
                if price < levels[0]:
                    print(f"[GRID] ⚠️ Ціна ${price:.2f} нижче сітки (${levels[0]:.2f})")
                elif price >= levels[-1]:
                    print(f"[GRID] ⚠️ Ціна ${price:.2f} вище сітки (${levels[-1]:.2f})")
                last_price = price
                continue

            positions = state["positions"]

            # SELL: якщо ціна виросла вище рівня де маємо позицію
            for idx_str, entry in list(positions.items()):
                idx = int(idx_str)
                sell_level = levels[idx + 1] if idx + 1 < len(levels) else None
                if sell_level and price >= sell_level:
                    if _close_long(exchange, entry, idx):
                        pnl = (price - entry["fill_price"]) * entry["qty"] * GRID_LEVERAGE
                        state["total_pnl"] += pnl
                        state["completed"] += 1
                        del positions[idx_str]
                        _save_state(state)
                        send_telegram_message(
                            f"✅ <b>Grid SELL</b> {GRID_SYMBOL}\n"
                            f"Рівень {idx} → {idx + 1}\n"
                            f"Вхід: ${entry['fill_price']:.4f} | Вихід: ${price:.4f}\n"
                            f"PnL: +${pnl:.2f} | Всього циклів: {state['completed']}\n"
                            f"Загальний PnL: ${state['total_pnl']:.2f}",
                            TG_CHAT_ID,
                        )

            # BUY: якщо ціна в зоні рівня і позиції тут немає
            if str(current_zone) not in positions:
                # Не купуємо якщо вже забагато відкритих позицій (макс 5)
                if len(positions) < 5:
                    result = _open_long(exchange, price, current_zone)
                    if result:
                        positions[str(current_zone)] = {
                            **result,
                            "opened_at": datetime.now(timezone.utc).isoformat(),
                            "level_price": levels[current_zone],
                        }
                        _save_state(state)
                        send_telegram_message(
                            f"🟢 <b>Grid BUY</b> {GRID_SYMBOL}\n"
                            f"Рівень {current_zone} @ ${price:.4f}\n"
                            f"Qty: {result['qty']} | "
                            f"Відкрито позицій: {len(positions)}",
                            TG_CHAT_ID,
                        )

            last_price = price

        except KeyboardInterrupt:
            print("\n[GRID] Зупинено.")
            _save_state(state)
            break
        except Exception as e:
            print(f"[GRID] ❌ Помилка: {e}")
            time.sleep(30)


if __name__ == "__main__":
    run_grid_engine()
