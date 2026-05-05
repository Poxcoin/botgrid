"""
grid_bot.py — Grid Trading Bot (Стратегія #2).

Логіка: ділимо ціновий діапазон на N рівнів.
  LONG режим:  ціна падає до рівня → BUY;  ціна виростає на рівень вище → SELL
  SHORT режим: ціна входить в зону → SHORT; ціна падає нижче зони → COVER

Тренд-адаптивний: EMA50 на 4h визначає напрямок гріду.
При зміні тренду — закриваємо всі позиції та перемикаємо режим.

Добре працює в sideways ринку (BTC/ETH 70% часу) і трендових ринках.

Запускається як окремий сервіс: crypto-grid.service
Multi-coin support: кожна монета запускається у власному потоці.
"""
import json
import os
import threading
import time
from datetime import datetime, timezone, timedelta
from typing import Optional

import ccxt

from modules.trader import _init_exchange, _init_exchange_for_user, get_free_usdt
from modules.tg_notifier import send_telegram_message
from modules import daily_guard
from modules.market_data import get_btc_2h_change
from modules.analytics_db import save_trade, close_trade, save_user_trade, close_user_trade
from config.settings import TG_CHAT_ID, IS_DEMO_TRADING

BTC_DUMP_THRESHOLD    = -2.5    # % за 2h — призупиняємо нові LONG BUY на альти
BTC_PUMP_THRESHOLD    =  2.5    # % за 2h — призупиняємо нові SHORT на альти
BYBIT_TAKER_FEE       = 0.00055 # 0.055% — taker (market orders, closes)
BYBIT_MAKER_FEE       = 0.0002  # 0.020% — maker (PostOnly limit orders, opens)
PENDING_ORDER_TIMEOUT  = 1800   # скасувати незаповнений limit через 30 хв

# ─── Конфігурація сіток ───────────────────────────────────────────────────────

GRID_CONFIGS = [
    {
        "symbol":        "SOL/USDT:USDT",
        "levels":        8,        # зменшено з 15: ширші кроки → менше fee-збитків
        "size_pct":      3.0,
        "size_usd_min":  15.0,
        "leverage":      2,
        "auto_range":    True,
        "upper_manual":  200.0,
        "lower_manual":  120.0,
        "max_positions": 4,
    },
    {
        "symbol":        "ETH/USDT:USDT",
        "levels":        8,        # зменшено з 15
        "size_pct":      2.5,
        "size_usd_min":  15.0,
        "leverage":      2,
        "auto_range":    True,
        "upper_manual":  4000.0,
        "lower_manual":  2500.0,
        "max_positions": 4,
    },
    {
        "symbol":        "BTC/USDT:USDT",
        "levels":        5,        # зменшено з 10
        "size_pct":      1.5,
        "size_usd_min":  15.0,
        "leverage":      2,
        "auto_range":    True,
        "upper_manual":  100000.0,
        "lower_manual":   80000.0,
        "max_positions": 3,
    },
]

POLL_INTERVAL          = 30     # секунд між перевірками
RANGE_BUFFER           = 0.02   # 2% буфер по краях ATR-діапазону
MAX_REBUILDS_DAY       = 4      # макс перебудов сітки за день
MAX_LOSS_PCT           = 0.05   # жорсткий стоп: 5% від балансу
ATR_RANGE_PERIODS      = 12     # повернули до 12 (було 8 — занадто тісний, багато ребілдів)
TREND_RECHECK_TICKS    = 60     # перевірка тренду кожні 60 тіків (≈30 хв)
SHORT_CONFIRM_TICKS    = 3      # потрібно 3 послідовних SHORT-читань перед flip long→short
SHORT_EMA_MARGIN       = 0.98   # ціна повинна бути нижче EMA50×0.98 (−2%) для SHORT режиму
MIN_STEP_FEE_MULT      = 3.0    # крок сітки мінімум в 3x більший за round-trip fee
MIN_GRID_LEVELS        = 3      # мінімальна кількість рівнів при авто-зменшенні
PENDING_BACKOFF_SEC    = 300    # 5 хв backoff після 3 пропущених тіків pending ордера
RSI_OB_BUY             = 72    # RSI(14,4h) > 72 → не розміщуємо нові BUY ордери
BOUNDARY_SL_PCT        = 0.03  # 3% нижче нижньої межі сітки → жорсткий стоп
MIN_ORDER_SPREAD       = 0.002 # 0.2% мінімальний спред між limit та market — PostOnly safe

# ─── State ───────────────────────────────────────────────────────────────────

def _state_file(symbol: str, user_id: Optional[int] = None) -> str:
    safe = symbol.replace("/", "_").replace(":", "_")
    prefix = f"u{user_id}_" if user_id else ""
    return f"grid_state_{prefix}{safe}.json"


def _load_state(symbol: str, user_id: Optional[int] = None) -> dict:
    path = _state_file(symbol, user_id)
    if os.path.exists(path):
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_state(symbol: str, state: dict, user_id: Optional[int] = None) -> None:
    with open(_state_file(symbol, user_id), "w") as f:
        json.dump(state, f, indent=2)


# ─── Тренд-детектор ─────────────────────────────────────────────────────────

def _calc_ema(closes: list, period: int) -> float:
    """EMA без numpy. Використовує SMA як початкове значення."""
    if len(closes) < period:
        return closes[-1] if closes else 0.0
    k = 2.0 / (period + 1)
    ema = sum(closes[:period]) / period  # SMA seed
    for price in closes[period:]:
        ema = price * k + ema * (1.0 - k)
    return ema


def _calc_rsi(closes: list, period: int = 14) -> float:
    """RSI з Wilder's EMA smoothing (стандартний метод TradingView/Bybit)."""
    if len(closes) < period + 1:
        return 50.0
    gains = [max(closes[i] - closes[i-1], 0) for i in range(1, len(closes))]
    losses = [max(closes[i-1] - closes[i], 0) for i in range(1, len(closes))]
    avg_g = sum(gains[:period]) / period
    avg_l = sum(losses[:period]) / period
    for g, l in zip(gains[period:], losses[period:]):
        avg_g = (avg_g * (period - 1) + g) / period
        avg_l = (avg_l * (period - 1) + l) / period
    if avg_l == 0:
        return 100.0
    return round(100.0 - (100.0 / (1.0 + avg_g / avg_l)), 1)


def _detect_trend(exchange, symbol: str) -> str:
    """Повертає 'long' або 'short' на основі EMA50 на 4h свічках.

    long  = ціна > EMA50 (висхідний або sideways тренд)
    short = ціна < EMA50 (низхідний тренд)
    """
    try:
        ohlcv  = exchange.fetch_ohlcv(symbol, "4h", limit=60)
        closes = [c[4] for c in ohlcv]
        ema50  = _calc_ema(closes, 50)
        price  = closes[-1]
        direction = "long" if price >= ema50 * SHORT_EMA_MARGIN else "short"
        print(f"[GRID:{symbol}] Тренд: ціна=${price:.4f} EMA50=${ema50:.4f} threshold=${ema50 * SHORT_EMA_MARGIN:.4f} → {direction.upper()}")
        return direction
    except Exception as e:
        print(f"[GRID:{symbol}] Trend detection error: {e} — defaulting to long")
        return "long"


# ─── Авто-діапазон ───────────────────────────────────────────────────────────

def _calc_atr(exchange, symbol: str, period: int = 14) -> float:
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

    ohlcv = exchange.fetch_ohlcv(symbol, timeframe="1d", limit=30)
    highs = [c[2] for c in ohlcv]
    lows  = [c[3] for c in ohlcv]
    upper = round(max(highs) * 1.05, 2)
    lower = round(min(lows)  * 0.95, 2)
    print(f"[GRID:{symbol}] Fallback 30d range: ${lower}—${upper}")
    return upper, lower


def _calc_levels(upper: float, lower: float, n: int) -> list[float]:
    step = (upper - lower) / n
    return [round(lower + step * i, 4) for i in range(n + 1)]


def _min_profitable_step(price: float) -> float:
    """Мінімальний крок сітки щоб покрити round-trip taker комісії з запасом."""
    return price * BYBIT_TAKER_FEE * 2 * MIN_STEP_FEE_MULT


def _adjust_levels_to_profitable(symbol: str, upper: float, lower: float,
                                  n: int, price: float) -> tuple[list[float], int]:
    """Зменшує кількість рівнів доки крок не стане прибутковим.

    Повертає (levels, actual_n).
    """
    min_step = _min_profitable_step(price)
    step = (upper - lower) / n
    if step >= min_step:
        return _calc_levels(upper, lower, n), n

    # Мінімальна кількість рівнів для прибуткового кроку
    adjusted_n = max(MIN_GRID_LEVELS, int((upper - lower) / min_step))
    adjusted_step = (upper - lower) / adjusted_n
    print(
        f"[GRID:{symbol}] ⚠️ Крок ${step:.4f} < мін ${min_step:.4f} "
        f"(fee {BYBIT_TAKER_FEE*2*100:.3f}% × {MIN_STEP_FEE_MULT}x) "
        f"→ рівні {n} → {adjusted_n}, новий крок ${adjusted_step:.4f}"
    )
    return _calc_levels(upper, lower, adjusted_n), adjusted_n


# ─── Допоміжні функції ───────────────────────────────────────────────────────

def _get_current_price(exchange, symbol: str) -> float:
    ticker = exchange.fetch_ticker(symbol)
    return float(ticker["last"])


def _get_quantity(exchange, symbol: str, price: float, size_usd: float, leverage: int) -> float:
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


def _close_all_positions(exchange, symbol: str, positions: dict,
                         leverage: int, price: float, direction: str = "long",
                         user_id: Optional[int] = None) -> float:
    """Закриває всі відкриті позиції. direction визначає сторону закриття.
    Рахує комісії та закриває DB записи (як _close_long/_close_short).
    """
    total_pnl = 0.0
    close_side = "buy" if direction == "short" else "sell"
    for idx_str, entry in list(positions.items()):
        try:
            order = exchange.create_order(
                symbol, "market", close_side, entry["qty"],
                params={"category": "linear", "reduceOnly": True},
            )
            info = order.get("info", {})
            fill = float(
                order.get("average") or
                info.get("avgPrice") or
                info.get("lastPriceOnCreated") or
                order.get("price") or
                price
            )
            qty = entry["qty"]
            if direction == "short":
                gross_pnl = (entry["fill_price"] - fill) * qty * leverage
            else:
                gross_pnl = (fill - entry["fill_price"]) * qty * leverage
            entry_fee = entry["fill_price"] * qty * entry.get("open_fee_rate", BYBIT_TAKER_FEE)
            exit_fee  = fill * qty * BYBIT_TAKER_FEE
            net_pnl   = gross_pnl - entry_fee - exit_fee
            total_pnl += net_pnl

            db_trade_id = entry.get("db_trade_id")
            if db_trade_id:
                try:
                    if direction == "short":
                        pnl_pct = round((entry["fill_price"] / fill - 1) * 100, 2) if fill else 0
                    else:
                        pnl_pct = round((fill / entry["fill_price"] - 1) * 100, 2) if entry["fill_price"] else 0
                    opened_ms = entry.get("opened_ms", 0)
                    duration  = max(0, round((datetime.now(timezone.utc).timestamp() * 1000 - opened_ms) / 60000)) if opened_ms else 0
                    if user_id is not None:
                        close_user_trade(db_trade_id, fill, net_pnl)
                    else:
                        close_trade(db_trade_id, fill, net_pnl, pnl_pct, duration)
                except Exception as _de:
                    print(f"[GRID:{symbol}] DB close error level {idx_str}: {_de}")

            print(f"[GRID:{symbol}] CLOSE-ALL {direction.upper()} level {idx_str} @ {fill:.4f} | net=${net_pnl:.2f}")
        except Exception as e:
            print(f"[GRID:{symbol}] CLOSE-ALL error level {idx_str}: {e}")
    positions.clear()
    return total_pnl


def _unrealized_loss(positions: dict, price: float, leverage: int, direction: str = "long") -> float:
    """Поточний нереалізований збиток (лише від'ємна частина)."""
    loss = 0.0
    for entry in positions.values():
        if direction == "short":
            pnl = (entry["fill_price"] - price) * entry["qty"] * leverage
        else:
            pnl = (price - entry["fill_price"]) * entry["qty"] * leverage
        if pnl < 0:
            loss += pnl
    return loss


# ─── LONG позиції ─────────────────────────────────────────────────────────────

def _open_long(exchange, symbol: str, level_price: float, level_idx: int,
               size_usd: float, leverage: int,
               user_id: Optional[int] = None) -> Optional[dict]:
    try:
        qty   = _get_quantity(exchange, symbol, level_price, size_usd, leverage)
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
        coin = symbol.split("/")[0]
        ts_open = datetime.now(timezone.utc).isoformat()
        try:
            if user_id is not None:
                db_trade_id = save_user_trade(user_id, coin, "LONG", fill, "grid")
            else:
                db_trade_id = save_trade(None, coin, "LONG", fill, ts_open)
        except Exception:
            db_trade_id = None
        print(f"[GRID:{symbol}] 🟢 LONG BUY level {level_idx} @ {fill:.4f} | qty={qty}")
        return {"fill_price": fill, "qty": qty, "order_id": order.get("id"),
                "db_trade_id": db_trade_id,
                "opened_ms": int(datetime.now(timezone.utc).timestamp() * 1000)}
    except Exception as e:
        print(f"[GRID:{symbol}] LONG BUY error level {level_idx}: {e}")
        return None


def _close_long(exchange, symbol: str, entry: dict, level_idx: int, leverage: int,
                current_price: float = 0.0,
                user_id: Optional[int] = None) -> tuple[bool, float, float]:
    """Закриває long позицію. Повертає (success, net_pnl, fill_price)."""
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
            current_price or
            entry["fill_price"]
        )
        qty       = entry["qty"]
        gross_pnl = (fill - entry["fill_price"]) * qty * leverage
        entry_fee = entry["fill_price"] * qty * entry.get("open_fee_rate", BYBIT_TAKER_FEE)
        exit_fee  = fill * qty * BYBIT_TAKER_FEE
        net_pnl   = gross_pnl - entry_fee - exit_fee

        db_trade_id = entry.get("db_trade_id")
        if db_trade_id:
            try:
                pnl_pct  = round((fill / entry["fill_price"] - 1) * 100, 2) if entry["fill_price"] else 0
                opened_ms = entry.get("opened_ms", 0)
                duration  = max(0, round((datetime.now(timezone.utc).timestamp() * 1000 - opened_ms) / 60000)) if opened_ms else 0
                if user_id is not None:
                    close_user_trade(db_trade_id, fill, net_pnl)
                else:
                    close_trade(db_trade_id, fill, net_pnl, pnl_pct, duration)
            except Exception as _e:
                print(f"[GRID:{symbol}] DB close error: {_e}")

        print(f"[GRID:{symbol}] ✅ LONG SELL level {level_idx} @ {fill:.4f} | gross=${gross_pnl:.2f} fee=${entry_fee+exit_fee:.3f} net=${net_pnl:.2f}")
        return True, net_pnl, fill
    except Exception as e:
        print(f"[GRID:{symbol}] LONG SELL error level {level_idx}: {e}")
        return False, 0.0, 0.0


# ─── SHORT позиції ────────────────────────────────────────────────────────────

def _open_short(exchange, symbol: str, level_price: float, level_idx: int,
                size_usd: float, leverage: int,
                user_id: Optional[int] = None) -> Optional[dict]:
    try:
        qty   = _get_quantity(exchange, symbol, level_price, size_usd, leverage)
        order = exchange.create_order(
            symbol, "market", "sell", qty,
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
        coin = symbol.split("/")[0]
        ts_open = datetime.now(timezone.utc).isoformat()
        try:
            if user_id is not None:
                db_trade_id = save_user_trade(user_id, coin, "SHORT", fill, "grid")
            else:
                db_trade_id = save_trade(None, coin, "SHORT", fill, ts_open)
        except Exception:
            db_trade_id = None
        print(f"[GRID:{symbol}] 🔴 SHORT SELL level {level_idx} @ {fill:.4f} | qty={qty}")
        return {"fill_price": fill, "qty": qty, "order_id": order.get("id"),
                "db_trade_id": db_trade_id,
                "opened_ms": int(datetime.now(timezone.utc).timestamp() * 1000)}
    except Exception as e:
        print(f"[GRID:{symbol}] SHORT SELL error level {level_idx}: {e}")
        return None


def _close_short(exchange, symbol: str, entry: dict, level_idx: int, leverage: int,
                 current_price: float = 0.0,
                 user_id: Optional[int] = None) -> tuple[bool, float, float]:
    """Закриває short позицію (buy to cover). Повертає (success, net_pnl, fill_price)."""
    try:
        order = exchange.create_order(
            symbol, "market", "buy", entry["qty"],
            params={"category": "linear", "reduceOnly": True},
        )
        info = order.get("info", {})
        fill = float(
            order.get("average") or
            info.get("avgPrice") or
            info.get("lastPriceOnCreated") or
            order.get("price") or
            current_price or
            entry["fill_price"]
        )
        qty       = entry["qty"]
        gross_pnl = (entry["fill_price"] - fill) * qty * leverage  # reversed for short
        entry_fee = entry["fill_price"] * qty * entry.get("open_fee_rate", BYBIT_TAKER_FEE)
        exit_fee  = fill * qty * BYBIT_TAKER_FEE
        net_pnl   = gross_pnl - entry_fee - exit_fee

        db_trade_id = entry.get("db_trade_id")
        if db_trade_id:
            try:
                pnl_pct   = round((entry["fill_price"] / fill - 1) * 100, 2) if fill else 0
                opened_ms  = entry.get("opened_ms", 0)
                duration   = max(0, round((datetime.now(timezone.utc).timestamp() * 1000 - opened_ms) / 60000)) if opened_ms else 0
                if user_id is not None:
                    close_user_trade(db_trade_id, fill, net_pnl)
                else:
                    close_trade(db_trade_id, fill, net_pnl, pnl_pct, duration)
            except Exception as _e:
                print(f"[GRID:{symbol}] DB close error: {_e}")

        print(f"[GRID:{symbol}] ✅ SHORT COVER level {level_idx} @ {fill:.4f} | gross=${gross_pnl:.2f} fee=${entry_fee+exit_fee:.3f} net=${net_pnl:.2f}")
        return True, net_pnl, fill
    except Exception as e:
        print(f"[GRID:{symbol}] SHORT COVER error level {level_idx}: {e}")
        return False, 0.0, 0.0


# ─── Limit (maker) opens ──────────────────────────────────────────────────────

def _open_long_limit(exchange, symbol: str, level_price: float, level_idx: int,
                     size_usd: float, leverage: int) -> Optional[dict]:
    """PostOnly limit buy на нижній межі зони (maker fee 0.02%)."""
    try:
        qty = _get_quantity(exchange, symbol, level_price, size_usd, leverage)
        order = exchange.create_order(
            symbol, "limit", "buy", qty, level_price,
            params={"category": "linear", "timeInForce": "PostOnly"},
        )
        print(f"[GRID:{symbol}] 📋 LONG LIMIT @ {level_price:.4f} | qty={qty} | level {level_idx} | maker")
        return {
            "order_id":    order["id"],
            "qty":         qty,
            "level_price": level_price,
            "level_idx":   level_idx,
            "placed_at":   int(datetime.now(timezone.utc).timestamp() * 1000),
        }
    except Exception as e:
        print(f"[GRID:{symbol}] LONG LIMIT error level {level_idx}: {e}")
        return None


def _open_short_limit(exchange, symbol: str, level_price: float, level_idx: int,
                      size_usd: float, leverage: int) -> Optional[dict]:
    """PostOnly limit sell на верхній межі зони (maker fee 0.02%)."""
    try:
        qty = _get_quantity(exchange, symbol, level_price, size_usd, leverage)
        order = exchange.create_order(
            symbol, "limit", "sell", qty, level_price,
            params={"category": "linear", "timeInForce": "PostOnly"},
        )
        print(f"[GRID:{symbol}] 📋 SHORT LIMIT @ {level_price:.4f} | qty={qty} | level {level_idx} | maker")
        return {
            "order_id":    order["id"],
            "qty":         qty,
            "level_price": level_price,
            "level_idx":   level_idx,
            "placed_at":   int(datetime.now(timezone.utc).timestamp() * 1000),
        }
    except Exception as e:
        print(f"[GRID:{symbol}] SHORT LIMIT error level {level_idx}: {e}")
        return None


def _cancel_all_pending(exchange, symbol: str, pending: dict) -> None:
    """Скасовує всі pending limit ордери (перед rebuild / trend-flip / stop)."""
    for zone_str, entry in list(pending.items()):
        try:
            exchange.cancel_order(entry["order_id"], symbol, params={"category": "linear"})
            print(f"[GRID:{symbol}] 🚫 Pending ордер level {zone_str} скасовано")
        except Exception as e:
            print(f"[GRID:{symbol}] Cancel pending помилка level {zone_str}: {e}")
    pending.clear()


def _check_pending_orders(exchange, symbol: str, pending: dict, positions: dict,
                           direction: str, state: dict,
                           user_id: Optional[int] = None) -> None:
    """Перевіряє статус pending limit ордерів кожен тік.

    Заповнені → переміщає в positions.
    Скасовані / протерміновані → видаляє.
    Використовує fetchOpenOrders як основний метод (один batch-виклик),
    щоб не упиратись в ліміт fetchOrder (500 ордерів на Bybit demo).
    """
    if not pending:
        return

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    changed = False

    # Один batch-виклик для всіх pending ордерів цього символу
    try:
        open_orders = exchange.fetch_open_orders(symbol, params={"category": "linear"})
        open_map = {o["id"]: o for o in open_orders}
    except Exception as e:
        print(f"[GRID:{symbol}] fetchOpenOrders помилка: {e}")
        return  # Пропускаємо тік, спробуємо наступного

    for zone_str in list(pending.keys()):
        entry = pending[zone_str]
        order_id = entry["order_id"]

        if order_id in open_map:
            # Ордер ще відкритий — скидаємо miss_count, перевіряємо тільки timeout
            entry.pop("miss_count", None)
            placed_at = entry.get("placed_at", now_ms)
            if now_ms - placed_at > PENDING_ORDER_TIMEOUT * 1000:
                try:
                    exchange.cancel_order(order_id, symbol, params={"category": "linear"})
                except Exception:
                    pass
                del pending[zone_str]
                print(f"[GRID:{symbol}] ⏱️ Pending ордер level {zone_str} timeout — скасовано")
                changed = True
        else:
            # Ордер зник з відкритих — або виконаний, або скасований
            # Пробуємо fetchOrder щоб дізнатись фінальний статус
            try:
                order = exchange.fetch_order(order_id, symbol, params={"category": "linear"})
                status = order.get("status", "")
                filled = float(order.get("filled") or 0)

                if status == "closed" or filled > 0:
                    fill = float(order.get("average") or order.get("price") or entry["level_price"])
                    qty  = filled if filled > 0 else entry["qty"]
                    coin = symbol.split("/")[0]
                    ts_open = datetime.now(timezone.utc).isoformat()
                    try:
                        if user_id is not None:
                            db_trade_id = save_user_trade(user_id, coin, direction.upper(), fill, "grid")
                        else:
                            db_trade_id = save_trade(None, coin, direction.upper(), fill, ts_open)
                    except Exception:
                        db_trade_id = None
                    positions[zone_str] = {
                        "fill_price":    fill,
                        "qty":           qty,
                        "order_id":      order_id,
                        "db_trade_id":   db_trade_id,
                        "open_fee_rate": BYBIT_MAKER_FEE,
                        "opened_at":     ts_open,
                        "opened_ms":     now_ms,
                        "level_price":   entry["level_price"],
                    }
                    del pending[zone_str]
                    side_str = "LONG BUY" if direction == "long" else "SHORT SELL"
                    print(f"[GRID:{symbol}] ✅ Limit {side_str} level {zone_str} виконано @ {fill:.4f} (maker fee)")
                    changed = True
                else:
                    # canceled / rejected / expired
                    print(f"[GRID:{symbol}] ❌ Pending ордер level {zone_str} відхилено ({status})")
                    del pending[zone_str]
                    changed = True

            except Exception:
                # fetchOrder недоступний на Demo API — не видаляємо одразу,
                # чекаємо 3 пропущені тіки щоб уникнути infinite re-placement loop
                miss_count = entry.get("miss_count", 0) + 1
                if miss_count < 3:
                    entry["miss_count"] = miss_count
                    pending[zone_str] = entry
                    print(f"[GRID:{symbol}] ⚠️ Pending level {zone_str} відсутній ({miss_count}/3) — чекаємо")
                else:
                    print(f"[GRID:{symbol}] 🗑️ Pending level {zone_str} відсутній 3 тіки підряд — backoff {PENDING_BACKOFF_SEC}s")
                    del pending[zone_str]
                    state.setdefault("pending_backoff", {})[zone_str] = time.time() + PENDING_BACKOFF_SEC
                changed = True

    if changed:
        _save_state(symbol, state, user_id)


# ─── Один потік на монету ─────────────────────────────────────────────────────

def _run_single(cfg: dict) -> None:
    symbol       = cfg["symbol"]
    grid_levels  = cfg["levels"]
    leverage     = cfg["leverage"]
    auto_range   = cfg["auto_range"]
    max_pos      = cfg["max_positions"]
    size_pct     = cfg.get("size_pct", 1.0)
    size_usd_min = cfg.get("size_usd_min", 10.0)

    user_id    = cfg.get("user_id")       # None for owner's bot
    _api_key   = cfg.get("api_key")
    _api_secret = cfg.get("api_secret")

    # ─── Перевірка stop_until перед підключенням до біржі ───────────────────────
    _pre_state = _load_state(symbol, user_id)
    _stop_until = _pre_state.get("stop_until", 0)
    if _stop_until > time.time():
        _eta = datetime.fromtimestamp(_stop_until, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        print(f"[GRID:{symbol}] ⏰ Hard stop активний до {_eta} — чекаємо")
        return

    try:
        exchange = _init_exchange_for_user(_api_key, _api_secret) if _api_key else _init_exchange()
    except Exception as e:
        print(f"[GRID:{symbol}] ❌ Не вдалось підключитись до біржі: {e}")
        return
    _set_leverage(exchange, symbol, leverage)

    _balance = get_free_usdt(exchange)
    size_usd = max(round(_balance * size_pct / 100.0, 2), size_usd_min)
    print(f"[GRID:{symbol}] size_usd=${size_usd:.2f} ({size_pct}% від ${_balance:.2f})")

    # Визначаємо поточний тренд
    direction = _detect_trend(exchange, symbol)

    price = _get_current_price(exchange, symbol)

    if auto_range:
        upper, lower = _detect_range(exchange, symbol)
        print(f"[GRID:{symbol}] Авто-діапазон: ${lower:.2f} — ${upper:.2f}")
    else:
        upper, lower = cfg["upper_manual"], cfg["lower_manual"]

    levels, grid_levels = _adjust_levels_to_profitable(symbol, upper, lower, grid_levels, price)
    step   = levels[1] - levels[0]
    print(f"[GRID:{symbol}] {grid_levels} рівнів | крок ${step:.2f} | режим {direction.upper()}")

    state = _load_state(symbol, user_id)
    _state_valid = False
    if state.get("symbol") == symbol and state.get("levels"):
        _s_upper = state.get("upper", 0)
        _s_lower = state.get("lower", 0)
        _cur_price_check = _get_current_price(exchange, symbol)
        _range_ratio = _s_upper / max(_s_lower, 0.0001)
        _price_in_range = _s_lower * 0.5 <= _cur_price_check <= _s_upper * 2
        if _range_ratio > 10 or not _price_in_range:
            print(f"[GRID:{symbol}] ⚠️ Стан зіпсований — скидаємо")
        else:
            _state_valid = True

    if _state_valid:
        saved_direction = state.get("direction", "long")
        if saved_direction != direction:
            print(f"[GRID:{symbol}] ⚠️ Тренд змінився з {saved_direction.upper()} → {direction.upper()} після рестарту — закриваємо старі позиції")
            _old_positions = state.get("positions", {})
            _old_pending   = state.get("pending_orders", {})
            if _old_pending:
                _cancel_all_pending(exchange, symbol, _old_pending)
            if _old_positions:
                _restart_price = _get_current_price(exchange, symbol)
                _restart_pnl   = _close_all_positions(
                    exchange, symbol, _old_positions, leverage, _restart_price, saved_direction, user_id)
                print(f"[GRID:{symbol}] Реалізований PnL при рестарт-тренді: ${_restart_pnl:.2f}")
            _state_valid = False
        else:
            upper  = state["upper"]
            lower  = state["lower"]
            levels = state["levels"]
            step   = levels[1] - levels[0]
            # Якщо збережений крок менший за мінімально прибутковий — перебудовуємо
            _cur_price_for_step = _get_current_price(exchange, symbol)
            if step < _min_profitable_step(_cur_price_for_step):
                print(
                    f"[GRID:{symbol}] ⚠️ Збережений крок ${step:.4f} не покриває комісії "
                    f"(мін ${_min_profitable_step(_cur_price_for_step):.4f}) — перебудовуємо сітку"
                )
                _state_valid = False
            else:
                n_pos  = len(state.get("positions", {}))
                n_pend = len(state.get("pending_orders", {}))
                print(f"[GRID:{symbol}] ♻️  Відновлення: {n_pos} позицій, {n_pend} pending | {direction.upper()} | діапазон ${lower:.4f}—${upper:.4f}")
                # Скасовуємо pending ордери з попередньої сесії — після рестарту перевіримо що реально відкрито
                _stale_pending = state.get("pending_orders", {})
                if _stale_pending:
                    _cancel_all_pending(exchange, symbol, _stale_pending)
                    state["pending_orders"] = {}
                try:
                    ex_positions = exchange.fetch_positions([symbol], params={"category": "linear"})
                    ex_qty = sum(abs(float(p.get("contracts") or 0)) for p in ex_positions)
                    if ex_qty == 0 and state.get("positions"):
                        print(f"[GRID:{symbol}] ⚠️  Exchange: 0 позицій, очищаємо стан")
                        state["positions"] = {}
                        _save_state(symbol, state, user_id)
                except Exception as _e:
                    print(f"[GRID:{symbol}] Reconcile помилка: {_e}")

    if not _state_valid:
        state = {
            "symbol":        symbol,
            "direction":     direction,
            "upper":         upper,
            "lower":         lower,
            "levels":        levels,
            "positions":     {},
            "pending_orders": {},
            "completed":     0,
            "total_pnl":     0.0,
            "started_at":    datetime.now(timezone.utc).isoformat(),
        }
        _save_state(symbol, state, user_id)
        # Закрити orphaned позиції на біржі (обидві сторони)
        coin = symbol.split("/")[0]
        try:
            ex_pos = exchange.fetch_positions([symbol], params={"category": "linear"})
            for p in ex_pos:
                qty = abs(float(p.get("contracts") or 0))
                if qty > 0:
                    close_side = "buy" if p["side"] == "short" else "sell"
                    exchange.create_order(symbol, "market", close_side, qty,
                        params={"category": "linear", "reduceOnly": True})
                    print(f"[GRID:{symbol}] 🧹 Orphaned {p['side']} qty={qty} закрито")
        except Exception as _e:
            print(f"[GRID:{symbol}] Orphan exchange close помилка: {_e}")
        # Очищаємо OPEN записи в DB
        try:
            import sqlite3 as _sq
            _con = _sq.connect(os.path.join(os.path.dirname(__file__), "analytics.db"))
            _ids = [r[0] for r in _con.execute(
                "SELECT id FROM trades WHERE result='OPEN' AND coin=?", (coin,)
            ).fetchall()]
            _con.close()
            for _tid in _ids:
                close_trade(_tid, 0.0, 0.0, 0.0, 0)
                print(f"[GRID:{symbol}] 🧹 DB trade #{_tid} {coin} очищено (orphaned)")
        except Exception as _e:
            print(f"[GRID:{symbol}] Orphan DB close помилка: {_e}")

    _out_of_range_since: Optional[float] = None
    OUT_OF_RANGE_DELAY = 30 * 60  # 30 хвилин

    free = get_free_usdt(exchange)
    send_telegram_message(
        f"{'🟢' if direction == 'long' else '🔴'} <b>Grid Bot запущено</b>\n"
        f"<b>Монета:</b> {symbol}\n"
        f"<b>Режим:</b> {direction.upper()}\n"
        f"<b>Діапазон:</b> ${lower:.2f} — ${upper:.2f}\n"
        f"<b>Рівнів:</b> {grid_levels} | Крок: ${step:.2f}\n"
        f"<b>Розмір:</b> ${size_usd} × {leverage}x\n"
        f"<b>Баланс:</b> ${free:.2f} USDT",
        TG_CHAT_ID,
    )

    last_price = _get_current_price(exchange, symbol)
    print(f"[GRID:{symbol}] Поточна ціна: ${last_price:.4f}")

    # Відновлюємо лічильник ребілдів з _pre_state (завантаженого ДО будь-яких змін стану)
    # Читаємо саме _pre_state, бо state може бути вже перезаписаним порожнім dict
    _today_str = datetime.now(timezone.utc).date().isoformat()
    if _pre_state.get("rebuild_day") == _today_str:
        rebuilds_today = _pre_state.get("rebuilds_today", 0)
        if rebuilds_today > 0:
            print(f"[GRID:{symbol}] ♻️  Відновлено ребілди: {rebuilds_today}/{MAX_REBUILDS_DAY} за сьогодні")
    else:
        rebuilds_today = 0
    rebuild_day       = datetime.now(timezone.utc).date()
    trend_check_tick  = 0
    _trend_short_count = 0  # кількість послідовних SHORT-читань (для підтвердження)
    _rsi_4h           = 50.0  # кешований RSI(14,4h), оновлюється разом з трендом
    try:
        _ohlcv_rsi_init = exchange.fetch_ohlcv(symbol, "4h", limit=22)
        _rsi_4h = _calc_rsi([c[4] for c in _ohlcv_rsi_init[:-1]])
        print(f"[GRID:{symbol}] Initial RSI(14,4h)={_rsi_4h:.1f}")
    except Exception:
        pass

    while True:
        try:
            time.sleep(POLL_INTERVAL)
            price = _get_current_price(exchange, symbol)

            # Скидаємо лічильник перебудов о опівночі UTC
            today = datetime.now(timezone.utc).date()
            if today != rebuild_day:
                rebuilds_today = 0
                rebuild_day    = today

            # ─── Перевірка тренду кожні TREND_RECHECK_TICKS тіків ──────────
            trend_check_tick += 1
            if trend_check_tick >= TREND_RECHECK_TICKS:
                trend_check_tick = 0
                new_direction = _detect_trend(exchange, symbol)
                try:
                    _ohlcv_rsi = exchange.fetch_ohlcv(symbol, "4h", limit=22)
                    _rsi_4h = _calc_rsi([c[4] for c in _ohlcv_rsi[:-1]])  # exclude live candle
                    print(f"[GRID:{symbol}] RSI(14,4h)={_rsi_4h:.1f}")
                except Exception:
                    pass

                # Лічильник підтвердження SHORT: long→short потребує SHORT_CONFIRM_TICKS
                # послідовних SHORT-читань; short→long перемикається негайно
                if new_direction == "short":
                    _trend_short_count = min(_trend_short_count + 1, SHORT_CONFIRM_TICKS)
                else:
                    _trend_short_count = 0

                _should_flip = (
                    (direction == "long"  and new_direction == "short" and _trend_short_count >= SHORT_CONFIRM_TICKS) or
                    (direction == "short" and new_direction == "long")
                )

                if _should_flip:
                    positions = state["positions"]
                    print(f"[GRID:{symbol}] 🔄 Тренд підтверджено: {direction.upper()} → {new_direction.upper()} — закриваємо {len(positions)} позицій")
                    _cancel_all_pending(exchange, symbol, state.get("pending_orders", {}))
                    state.pop("pending_backoff", None)  # zone indices change after direction flip
                    state["pending_orders"] = {}
                    realized = _close_all_positions(exchange, symbol, positions, leverage, price, direction, user_id)
                    state["total_pnl"] += realized
                    state["positions"] = {}
                    direction = new_direction
                    _trend_short_count = 0
                    state["direction"] = direction
                    _save_state(symbol, state, user_id)
                    send_telegram_message(
                        f"🔄 <b>Grid тренд-флip</b> {symbol}\n"
                        f"Новий режим: {direction.upper()}\n"
                        f"Реалізований PnL: ${realized:.2f} | Загалом: ${state['total_pnl']:.2f}",
                        TG_CHAT_ID,
                    )

            # ─── Boundary SL: ціна на 3%+ нижче нижньої межі → жорсткий стоп ───
            _lower_bound = state.get("lower", levels[0])
            if direction == "long" and price < _lower_bound * (1 - BOUNDARY_SL_PCT):
                _sl_threshold = _lower_bound * (1 - BOUNDARY_SL_PCT)
                print(f"[GRID:{symbol}] 🛑 BOUNDARY SL: ${price:.2f} < ${_sl_threshold:.2f} (3% нижче межі) — закриваємо")
                _cancel_all_pending(exchange, symbol, state.get("pending_orders", {}))
                state["pending_orders"] = {}
                realized = _close_all_positions(exchange, symbol, state.get("positions", {}), leverage, price, direction, user_id)
                state["total_pnl"] += realized
                state["positions"] = {}
                state["stop_until"] = time.time() + 3600
                _save_state(symbol, state, user_id)
                send_telegram_message(
                    f"🛑 <b>Grid BOUNDARY SL</b> {symbol}\n"
                    f"Ціна ${price:.2f} нижче межі ${_lower_bound:.2f} на 3%+\n"
                    f"Реалізований PnL: ${realized:.2f} | Пауза 1h",
                    TG_CHAT_ID,
                )
                break

            # ─── Визначаємо поточну зону ────────────────────────────────────
            current_zone = None
            for i in range(len(levels) - 1):
                if levels[i] <= price < levels[i + 1]:
                    current_zone = i
                    break

            # ─── Out-of-range handling ──────────────────────────────────────
            if current_zone is None:
                if price >= levels[-1] or price < levels[0]:
                    if _out_of_range_since is None:
                        _out_of_range_since = time.time()
                        direction_str = "вище" if price >= levels[-1] else "нижче"
                        print(f"[GRID:{symbol}] Ціна ${price:.2f} {direction_str} межі — чекаємо 30 хв перед перебудовою")
                        last_price = price
                        continue

                    waited = time.time() - _out_of_range_since
                    if waited < OUT_OF_RANGE_DELAY:
                        mins_left = int((OUT_OF_RANGE_DELAY - waited) / 60)
                        print(f"[GRID:{symbol}] Out-of-range {waited/60:.0f} хв — ще {mins_left} хв до перебудови")
                        last_price = price
                        continue

                    _out_of_range_since = None

                above_range = price >= levels[-1]
                below_range = price < levels[0]

                # Небезпечна зона: LONG+нижче (dump) або SHORT+вище (pump)
                dangerous = (direction == "long" and below_range) or \
                            (direction == "short" and above_range)

                if dangerous:
                    unreal     = _unrealized_loss(state["positions"], price, leverage, direction)
                    total_loss = state["total_pnl"] + unreal
                    balance    = get_free_usdt(exchange)
                    max_loss_usd = balance * MAX_LOSS_PCT
                    hard_stop  = total_loss <= -max_loss_usd
                    no_rebuilds = rebuilds_today >= MAX_REBUILDS_DAY

                    if hard_stop or no_rebuilds:
                        reason = (
                            f"збиток ${total_loss:.2f} (ліміт ${max_loss_usd:.0f}, {MAX_LOSS_PCT*100:.0f}% балансу)"
                            if hard_stop else
                            f"вичерпано перебудов ({rebuilds_today})"
                        )
                        print(f"[GRID:{symbol}] 🛑 СТОП — {reason}. Закриваємо всі позиції.")
                        _cancel_all_pending(exchange, symbol, state.get("pending_orders", {}))
                        state["pending_orders"] = {}
                        realized = _close_all_positions(exchange, symbol, state["positions"], leverage, price, direction, user_id)
                        state["total_pnl"] += realized
                        state["positions"] = {}
                        # Зберігаємо stop_until: наступна північ UTC + 1h, мінімум 6h від зараз
                        _now_utc = datetime.now(timezone.utc)
                        _tomorrow_midnight = (_now_utc + timedelta(days=1)).replace(
                            hour=0, minute=0, second=0, microsecond=0)
                        _stop_ts = max(
                            (_tomorrow_midnight + timedelta(hours=1)).timestamp(),
                            time.time() + 6 * 3600,
                        )
                        state["stop_until"] = _stop_ts
                        state["rebuilds_today"] = rebuilds_today
                        state["rebuild_day"] = datetime.now(timezone.utc).date().isoformat()
                        _save_state(symbol, state, user_id)
                        send_telegram_message(
                            f"🛑 <b>Grid ЗУПИНЕНО до завтра</b> {symbol}\n"
                            f"Режим: {direction.upper()}\n"
                            f"Причина: {reason}\n"
                            f"Загальний PnL: ${state['total_pnl']:.2f}",
                            TG_CHAT_ID,
                        )
                        return

                # Rebuild
                rebuild_label = "вгору" if above_range else "вниз"
                pnl_note = "💰 профітний" if not dangerous else "⚠️ збитковий"
                print(f"[GRID:{symbol}] 🔄 Перебудова {rebuild_label} (#{rebuilds_today + 1}) {pnl_note} — ціна ${price:.2f}")
                _cancel_all_pending(exchange, symbol, state.get("pending_orders", {}))
                state["pending_orders"] = {}
                state.pop("pending_backoff", None)  # zone indices change after rebuild
                realized = _close_all_positions(exchange, symbol, state["positions"], leverage, price, direction)
                state["total_pnl"] += realized
                state["positions"] = {}
                upper, lower = _detect_range(exchange, symbol)
                levels, grid_levels = _adjust_levels_to_profitable(symbol, upper, lower, grid_levels, price)
                step = levels[1] - levels[0]
                rebuilds_today += 1
                state.update({
                    "upper": upper, "lower": lower, "levels": levels,
                    "rebuilds_today": rebuilds_today,
                    "rebuild_day": datetime.now(timezone.utc).date().isoformat(),
                })
                _save_state(symbol, state, user_id)
                send_telegram_message(
                    f"🔄 <b>Grid перебудова {rebuild_label} #{rebuilds_today}</b> {symbol}\n"
                    f"Режим: {direction.upper()}\n"
                    f"Новий діапазон: ${lower:.2f} — ${upper:.2f}\n"
                    f"Рівнів: {grid_levels} | Крок: ${step:.2f}\n"
                    f"Реалізований PnL: ${realized:.2f} | Загалом: ${state['total_pnl']:.2f}",
                    TG_CHAT_ID,
                )
                last_price = price
                continue

            # Ціна в діапазоні — скидаємо таймер
            _out_of_range_since = None
            positions = state["positions"]

            pending_orders = state.setdefault("pending_orders", {})

            # ─── Перевіряємо pending limit ордери ───────────────────────────
            _check_pending_orders(exchange, symbol, pending_orders, positions, direction, state, user_id)

            if direction == "long":
                # ─── LONG: SELL якщо ціна виросла вище рівня позиції ────────
                for idx_str, entry in list(positions.items()):
                    idx        = int(idx_str)
                    sell_level = levels[idx + 1] if idx + 1 < len(levels) else None
                    if sell_level and price >= sell_level:
                        # Скасовуємо pending для цієї зони якщо є
                        if idx_str in pending_orders:
                            try:
                                exchange.cancel_order(pending_orders[idx_str]["order_id"], symbol,
                                                      params={"category": "linear"})
                            except Exception:
                                pass
                            del pending_orders[idx_str]
                        success, realized_pnl, fill_price = _close_long(
                            exchange, symbol, entry, idx, leverage, price, user_id)
                        if success:
                            state["total_pnl"] += realized_pnl
                            state["completed"] += 1
                            del positions[idx_str]
                            _save_state(symbol, state, user_id)
                            send_telegram_message(
                                f"✅ <b>Grid LONG SELL</b> {symbol}\n"
                                f"Рівень {idx} → {idx + 1}\n"
                                f"Вхід: ${entry['fill_price']:.4f} | Вихід: ${fill_price:.4f}\n"
                                f"PnL: +${realized_pnl:.2f} | Циклів: {state['completed']}\n"
                                f"Загальний PnL: ${state['total_pnl']:.2f}",
                                TG_CHAT_ID,
                            )

                # ─── LONG: limit BUY на floor зони якщо нема позиції/pending ─
                zone_str = str(current_zone)
                if zone_str not in positions and zone_str not in pending_orders:
                    # Clean expired backoffs, check if zone is in backoff
                    _now_ts = time.time()
                    state["pending_backoff"] = {k: v for k, v in state.get("pending_backoff", {}).items() if v > _now_ts}
                    _in_backoff = zone_str in state.get("pending_backoff", {})
                    _btc_chg = get_btc_2h_change()
                    _is_btc  = symbol.startswith("BTC")
                    if _in_backoff:
                        _remain = int(state["pending_backoff"][zone_str] - _now_ts)
                        print(f"[GRID:{symbol}] ⏳ Level {current_zone} backoff {_remain}s — пропускаємо")
                    elif _rsi_4h > RSI_OB_BUY and direction == "long":
                        print(f"[GRID:{symbol}] 📈 RSI {_rsi_4h:.0f} > {RSI_OB_BUY} — BUY пропускаємо (overbought)")
                    elif not _is_btc and _btc_chg < BTC_DUMP_THRESHOLD:
                        print(f"[GRID:{symbol}] 🚫 BTC {_btc_chg:.1f}% за 2h — LONG BUY призупинено")
                    elif len(positions) + len(pending_orders) < max_pos:
                        limit_price = levels[current_zone]  # floor зони — maker order
                        _spread = (price - limit_price) / price if price > 0 else 0
                        if limit_price >= price:
                            # PostOnly відхилить ордер якщо ціна вже вище floor — пропускаємо
                            print(f"[GRID:{symbol}] ⏭️ Level {current_zone} floor {limit_price:.4f} >= price {price:.4f} — пропускаємо")
                            result = None
                        elif _spread < MIN_ORDER_SPREAD:
                            # Занадто близько до ринку — PostOnly може відхилити на Demo
                            print(f"[GRID:{symbol}] ⏭️ Level {current_zone} spread {_spread*100:.3f}% < {MIN_ORDER_SPREAD*100:.1f}% — занадто близько до ринку, пропускаємо")
                            result = None
                        else:
                            result = _open_long_limit(exchange, symbol, limit_price, current_zone, size_usd, leverage)
                        if result:
                            pending_orders[zone_str] = result
                            _save_state(symbol, state, user_id)
                            send_telegram_message(
                                f"📋 <b>Grid LONG LIMIT</b> {symbol}\n"
                                f"Рівень {current_zone} @ ${limit_price:.4f} (maker)\n"
                                f"Qty: {result['qty']} | Pending: {len(pending_orders)}",
                                TG_CHAT_ID,
                            )

            else:  # direction == "short"
                # ─── SHORT: COVER якщо ціна впала нижче межі зони ──────────
                for idx_str, entry in list(positions.items()):
                    idx         = int(idx_str)
                    cover_level = levels[idx]  # нижня межа зони відкриття
                    if price < cover_level:
                        if idx_str in pending_orders:
                            try:
                                exchange.cancel_order(pending_orders[idx_str]["order_id"], symbol,
                                                      params={"category": "linear"})
                            except Exception:
                                pass
                            del pending_orders[idx_str]
                        success, realized_pnl, fill_price = _close_short(
                            exchange, symbol, entry, idx, leverage, price, user_id)
                        if success:
                            state["total_pnl"] += realized_pnl
                            state["completed"] += 1
                            del positions[idx_str]
                            _save_state(symbol, state, user_id)
                            send_telegram_message(
                                f"✅ <b>Grid SHORT COVER</b> {symbol}\n"
                                f"Рівень {idx} → {idx - 1}\n"
                                f"Вхід: ${entry['fill_price']:.4f} | Вихід: ${fill_price:.4f}\n"
                                f"PnL: +${realized_pnl:.2f} | Циклів: {state['completed']}\n"
                                f"Загальний PnL: ${state['total_pnl']:.2f}",
                                TG_CHAT_ID,
                            )

                # ─── SHORT: limit SELL на ceiling зони якщо нема позиції/pending
                zone_str = str(current_zone)
                if zone_str not in positions and zone_str not in pending_orders:
                    _btc_chg = get_btc_2h_change()
                    _is_btc  = symbol.startswith("BTC")
                    if not _is_btc and _btc_chg > BTC_PUMP_THRESHOLD:
                        print(f"[GRID:{symbol}] 🚫 BTC +{_btc_chg:.1f}% за 2h — SHORT призупинено")
                    elif len(positions) + len(pending_orders) < max_pos:
                        ceil_idx    = current_zone + 1 if current_zone + 1 < len(levels) else current_zone
                        limit_price = levels[ceil_idx]  # ceiling зони — maker order
                        _spread_s = (limit_price - price) / price if price > 0 else 0
                        if limit_price <= price:
                            print(f"[GRID:{symbol}] ⏭️ Level {current_zone} ceil {limit_price:.4f} <= price {price:.4f} — пропускаємо")
                            result = None
                        elif _spread_s < MIN_ORDER_SPREAD:
                            print(f"[GRID:{symbol}] ⏭️ Level {current_zone} spread {_spread_s*100:.3f}% < {MIN_ORDER_SPREAD*100:.1f}% — занадто близько до ринку, пропускаємо")
                            result = None
                        else:
                            result = _open_short_limit(exchange, symbol, limit_price, current_zone, size_usd, leverage)
                        if result:
                            pending_orders[zone_str] = result
                            _save_state(symbol, state, user_id)
                            send_telegram_message(
                                f"📋 <b>Grid SHORT LIMIT</b> {symbol}\n"
                                f"Рівень {current_zone} @ ${limit_price:.4f} (maker)\n"
                                f"Qty: {result['qty']} | Pending: {len(pending_orders)}",
                                TG_CHAT_ID,
                            )

            last_price = price

        except Exception as e:
            print(f"[GRID:{symbol}] Помилка: {e}")
            time.sleep(30)


# ─── Головний цикл ───────────────────────────────────────────────────────────

def _start_thread(cfg: dict) -> threading.Thread:
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
                    # Перевіряємо stop_until — не перезапускаємо якщо hard stop активний
                    _sym_state = _load_state(sym)
                    _stop_until = _sym_state.get("stop_until", 0)
                    if _stop_until > time.time():
                        _eta = datetime.fromtimestamp(_stop_until, tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
                        print(f"[GRID] ⏰ {sym} hard stop до {_eta} — не перезапускаємо")
                        continue
                    print(f"[GRID] ⚠️ Потік {sym} впав — перезапуск...")
                    send_telegram_message(
                        f"⚠️ <b>Grid потік перезапущено</b>\n<code>{sym}</code>",
                        TG_CHAT_ID,
                    )
                    thread_map[sym] = _start_thread(cfg)
    except KeyboardInterrupt:
        print("\n[GRID] Зупинено всі сітки.")


def run_grid_engine_for_user(user_id: int, api_key: str, secret: str, stop_event: threading.Event) -> None:
    """Запускає grid engine для конкретного користувача з його API ключами."""
    thread_map: dict[str, threading.Thread] = {}
    for cfg in GRID_CONFIGS:
        user_cfg = {**cfg, "user_id": user_id, "api_key": api_key, "api_secret": secret}
        sym = user_cfg["symbol"]
        thread_map[sym] = _start_thread(user_cfg)
        print(f"[GRID:u{user_id}] Запущено потік для {sym}")

    while not stop_event.is_set():
        stop_event.wait(timeout=60)
        for cfg in GRID_CONFIGS:
            sym = cfg["symbol"]
            t = thread_map.get(sym)
            if t and not t.is_alive() and not stop_event.is_set():
                user_cfg = {**cfg, "user_id": user_id, "api_key": api_key, "api_secret": secret}
                _sym_state = _load_state(sym, user_id)
                if _sym_state.get("stop_until", 0) > time.time():
                    continue
                print(f"[GRID:u{user_id}] ⚠️ Потік {sym} впав — перезапуск...")
                thread_map[sym] = _start_thread(user_cfg)

    # Stop event triggered — cancel all pending for this user
    for sym in list(thread_map.keys()):
        t = thread_map.get(sym)
        if t and t.is_alive():
            print(f"[GRID:u{user_id}] Зупинка потоку {sym}")


if __name__ == "__main__":
    run_grid_engine()
