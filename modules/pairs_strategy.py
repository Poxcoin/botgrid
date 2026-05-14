"""
pairs_strategy.py — BTC/ETH Spread Mean-Reversion Pairs Trading.

Strategy: z-score of ETH/BTC price ratio (5-min bars, 20-period rolling).

  z < -2.0: ETH cheap vs BTC → LONG ETH + SHORT BTC (equal USDT notional per leg)
  z > +2.0: ETH expensive vs BTC → SHORT ETH + LONG BTC

Exit conditions:
  |z| <= 0.5  → mean reversion complete
  age > 8h    → time stop
  combined PnL < -(SIZE_PCT * free_usdt * 1.5) → dollar stop
  |z| >= 3.5  → diverging further (hard stop)

Parameters:
  POLL_INTERVAL = 300   (5 min)
  LOOKBACK = 20 bars
  Z_ENTRY = 2.0
  Z_EXIT = 0.5
  Z_STOP = 3.5
  LEVERAGE = 2
  SIZE_PCT = 2.0  (% free USDT per leg, total 4%)
  MAX_HOLD_SEC = 8 * 3600
  COOLDOWN_SEC = 4 * 3600
  BYBIT_TAKER_FEE = 0.00055

State file: pairs_state.json (project root)
Threads: _strategy_loop (opens) + _monitor_loop (exits every 30s)
"""
import json
import os
import threading
import time
from datetime import datetime, timezone
from typing import Optional

import ccxt

from modules.trader import _init_exchange, get_free_usdt, has_open_position
from modules.tg_notifier import send_telegram_message
from modules.market_data import exchange as _binance_ex
from modules.analytics_db import save_trade, close_trade
from config.settings import TG_CHAT_ID, IS_DEMO_TRADING, PAIRS_TRADING

# ─── Parameters ───────────────────────────────────────────────────────────────

POLL_INTERVAL  = 300       # 5 min
MONITOR_SEC    = 30        # position check interval
LOOKBACK       = 20        # z-score rolling window (bars)
Z_ENTRY        = 2.0
Z_EXIT         = 0.5
Z_STOP         = 3.5       # hard stop — spread diverging
LEVERAGE       = 2
SIZE_PCT       = 2.0       # % free USDT per leg
MAX_HOLD_SEC   = 8 * 3600  # 8 hours
COOLDOWN_SEC   = 4 * 3600  # 4 hours after close

BYBIT_TAKER_FEE = 0.00055

BTC_SYMBOL = "BTC/USDT:USDT"
ETH_SYMBOL = "ETH/USDT:USDT"

_STATE_FILE = os.path.join(os.path.dirname(__file__), "..", "pairs_state.json")

# ─── Module state ──────────────────────────────────────────────────────────────

_exchange: Optional[ccxt.Exchange] = None
_running = False
_state_lock = threading.Lock()

# in-memory position (mirrored to state file)
_position: Optional[dict] = None

# unix timestamp of last close (for cooldown)
_last_close_ts: float = 0.0


# ─── State persistence ─────────────────────────────────────────────────────────

def _load_state() -> Optional[dict]:
    try:
        with open(_STATE_FILE) as f:
            data = json.load(f)
        if data and isinstance(data, dict) and data.get("open"):
            return data
    except Exception:
        pass
    return None


def _save_state(pos: Optional[dict]) -> None:
    try:
        with open(_STATE_FILE, "w") as f:
            if pos:
                json.dump({**pos, "open": True}, f, indent=2)
            else:
                json.dump({"open": False}, f, indent=2)
    except Exception as e:
        print(f"[PAIRS] ⚠️ save_state error: {e}")


def _load_last_close_ts() -> float:
    try:
        data = json.load(open(_STATE_FILE))
        return float(data.get("last_close_ts", 0))
    except Exception:
        return 0.0


def _save_last_close_ts(ts: float) -> None:
    try:
        try:
            with open(_STATE_FILE) as f:
                data = json.load(f)
        except Exception:
            data = {}
        data["last_close_ts"] = ts
        data["open"] = data.get("open", False)
        with open(_STATE_FILE, "w") as f:
            json.dump(data, f, indent=2)
    except Exception:
        pass


# ─── Market data helpers ───────────────────────────────────────────────────────

def _fetch_ratio_bars(limit: int) -> list[float]:
    """Fetch ETH/BTC price ratio as list of (close_ETH / close_BTC) from Binance 5m bars."""
    btc_ohlcv = _binance_ex.fetch_ohlcv("BTC/USDT", "5m", limit=limit + 5)
    eth_ohlcv = _binance_ex.fetch_ohlcv("ETH/USDT", "5m", limit=limit + 5)

    # align by timestamp
    btc_map = {b[0]: b[4] for b in btc_ohlcv}
    eth_map = {e[0]: e[4] for e in eth_ohlcv}
    common_ts = sorted(set(btc_map) & set(eth_map))
    if len(common_ts) < limit:
        raise ValueError(f"[PAIRS] Not enough aligned bars: {len(common_ts)} < {limit}")

    common_ts = common_ts[-limit:]
    return [eth_map[t] / btc_map[t] for t in common_ts]


def _calc_zscore(ratios: list[float]) -> float:
    n = len(ratios)
    mean = sum(ratios) / n
    variance = sum((r - mean) ** 2 for r in ratios) / n
    std = variance ** 0.5
    if std < 1e-12:
        return 0.0
    return (ratios[-1] - mean) / std


def _current_zscore() -> tuple[float, float, float]:
    """Returns (z_score, btc_price, eth_price)."""
    ratios = _fetch_ratio_bars(LOOKBACK)
    z = _calc_zscore(ratios)

    btc_ticker = _exchange.fetch_ticker(BTC_SYMBOL)
    eth_ticker = _exchange.fetch_ticker(ETH_SYMBOL)
    return z, float(btc_ticker["last"]), float(eth_ticker["last"])


# ─── Trade execution ───────────────────────────────────────────────────────────

def _set_leverage(symbol: str) -> None:
    try:
        _exchange.set_leverage(LEVERAGE, symbol, params={"category": "linear"})
    except Exception as e:
        print(f"[PAIRS] ⚠️ set_leverage {symbol}: {e}")


def _market_order(symbol: str, side: str, qty: float) -> dict:
    """Place a market order and return the order dict."""
    return _exchange.create_order(
        symbol, "market", side, qty,
        params={"category": "linear", "positionIdx": 0},
    )


def _close_leg(symbol: str, action: str, qty: float) -> float:
    """Close a position leg with reduceOnly market order. Returns fill price."""
    close_side = "sell" if action == "LONG" else "buy"
    try:
        order = _exchange.create_order(
            symbol, "market", close_side, qty,
            params={"category": "linear", "reduceOnly": True},
        )
        info = order.get("info", {})
        return float(
            order.get("average") or
            info.get("avgPrice") or
            info.get("lastPriceOnCreated") or
            0
        )
    except Exception as e:
        print(f"[PAIRS] ❌ close_leg {symbol} {action}: {e}")
        return 0.0


def _fetch_leg_pnl(symbol: str) -> float:
    """Fetch realized PnL for the most recent closed position on symbol."""
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


def _calc_leg_qty(free_usdt: float, price: float) -> float:
    """Calculate position size in base currency for one leg."""
    usdt_per_leg = free_usdt * SIZE_PCT / 100.0
    notional = usdt_per_leg * LEVERAGE
    qty = notional / price
    market = _exchange.market(BTC_SYMBOL if price > 1000 else ETH_SYMBOL)
    min_qty = float((market.get("limits") or {}).get("amount", {}).get("min") or 0.001)
    precision = market.get("precision", {}).get("amount", 3)
    qty = round(qty, int(precision) if isinstance(precision, (int, float)) else 3)
    return max(qty, min_qty)


# ─── Open pair ────────────────────────────────────────────────────────────────

def _open_pair(z: float, btc_price: float, eth_price: float) -> None:
    global _position, _last_close_ts

    if not PAIRS_TRADING:
        print(f"[PAIRS] 📊 z={z:.3f} — торгівля вимкнена (PAIRS_TRADING=False)")
        return

    # Check grid bot conflict
    if has_open_position(_exchange, BTC_SYMBOL):
        print(f"[PAIRS] ⛔ BTC вже має відкриту позицію — пропускаємо")
        return
    if has_open_position(_exchange, ETH_SYMBOL):
        print(f"[PAIRS] ⛔ ETH вже має відкриту позицію — пропускаємо")
        return

    free_usdt = get_free_usdt(_exchange)
    if free_usdt < 20:
        print(f"[PAIRS] ⚠️ Недостатньо балансу: ${free_usdt:.2f}")
        return

    # z < -2: ETH cheap → LONG ETH + SHORT BTC
    # z > +2: ETH expensive → SHORT ETH + LONG BTC
    if z < -Z_ENTRY:
        eth_action = "LONG"
        btc_action = "SHORT"
        direction = "ETH дешева vs BTC"
    else:
        eth_action = "SHORT"
        btc_action = "LONG"
        direction = "ETH дорога vs BTC"

    _set_leverage(ETH_SYMBOL)
    _set_leverage(BTC_SYMBOL)

    eth_qty = _calc_leg_qty(free_usdt, eth_price)
    btc_qty = _calc_leg_qty(free_usdt, btc_price)

    eth_side = "buy" if eth_action == "LONG" else "sell"
    btc_side = "buy" if btc_action == "LONG" else "sell"

    # Open ETH leg first
    try:
        eth_order = _market_order(ETH_SYMBOL, eth_side, eth_qty)
    except Exception as e:
        print(f"[PAIRS] ❌ ETH leg failed: {e}")
        return

    eth_fill = float(
        eth_order.get("average") or
        eth_order.get("info", {}).get("avgPrice") or
        eth_price
    )

    # Open BTC leg — if it fails, immediately close ETH leg
    try:
        btc_order = _market_order(BTC_SYMBOL, btc_side, btc_qty)
    except Exception as e:
        print(f"[PAIRS] ❌ BTC leg failed: {e} — закриваємо ETH щоб не тримати half-pair")
        _close_leg(ETH_SYMBOL, eth_action, eth_qty)
        send_telegram_message(
            f"⚠️ <b>PAIRS: помилка відкриття пари</b>\n"
            f"ETH відкрито але BTC провалився: {e}\n"
            f"ETH закрито аварійно.",
            TG_CHAT_ID,
        )
        return

    btc_fill = float(
        btc_order.get("average") or
        btc_order.get("info", {}).get("avgPrice") or
        btc_price
    )

    opened_at = datetime.now(timezone.utc).timestamp()
    ts_open = datetime.now(timezone.utc).isoformat()
    dollar_stop = -(free_usdt * SIZE_PCT / 100.0 * 1.5)

    # Save to analytics_db (one record per leg)
    eth_db_id = None
    btc_db_id = None
    try:
        eth_db_id = save_trade(None, "ETH", eth_action, eth_fill, ts_open, bot_source="pairs")
        btc_db_id = save_trade(None, "BTC", btc_action, btc_fill, ts_open, bot_source="pairs")
    except Exception as e:
        print(f"[PAIRS] ⚠️ analytics_db save error: {e}")

    pos = {
        "eth_action":   eth_action,
        "btc_action":   btc_action,
        "eth_qty":      eth_qty,
        "btc_qty":      btc_qty,
        "eth_fill":     eth_fill,
        "btc_fill":     btc_fill,
        "opened_at":    opened_at,
        "dollar_stop":  dollar_stop,
        "z_entry":      z,
        "eth_db_id":    eth_db_id,
        "btc_db_id":    btc_db_id,
    }

    with _state_lock:
        _position = pos
    _save_state(pos)

    emoji = "📈" if eth_action == "LONG" else "📉"
    send_telegram_message(
        f"{emoji} <b>PAIRS відкрито</b>\n"
        f"Напрямок: {direction}\n"
        f"z-score: <b>{z:+.3f}</b>\n"
        f"ETH {eth_action}: {eth_qty} @ ${eth_fill:.2f}\n"
        f"BTC {btc_action}: {btc_qty} @ ${btc_fill:.2f}\n"
        f"Плече: {LEVERAGE}x | Розмір: {SIZE_PCT}% × 2 = {SIZE_PCT * 2:.0f}%\n"
        f"Dollar stop: ${dollar_stop:.2f} | Баланс: ${free_usdt:.2f}",
        TG_CHAT_ID,
    )
    print(
        f"[PAIRS] {emoji} Відкрито | z={z:+.3f} | "
        f"ETH {eth_action} {eth_qty}@{eth_fill:.2f} | "
        f"BTC {btc_action} {btc_qty}@{btc_fill:.2f}"
    )


# ─── Close pair ────────────────────────────────────────────────────────────────

def _close_pair(reason: str, current_z: float = 0.0) -> None:
    global _position, _last_close_ts

    with _state_lock:
        pos = _position
        if not pos:
            return
        _position = None

    _save_state(None)

    eth_exit = _close_leg(ETH_SYMBOL, pos["eth_action"], pos["eth_qty"])
    btc_exit = _close_leg(BTC_SYMBOL, pos["btc_action"], pos["btc_qty"])

    # Fetch realized PnL from Bybit (authoritative)
    eth_pnl = _fetch_leg_pnl(ETH_SYMBOL)
    btc_pnl = _fetch_leg_pnl(BTC_SYMBOL)
    combined_pnl = round(eth_pnl + btc_pnl, 4)

    opened_at = pos["opened_at"]
    age_min = max(0, round((time.time() - opened_at) / 60))

    # PnL % relative to SIZE_PCT of balance (per leg)
    if eth_exit and pos["eth_fill"]:
        if pos["eth_action"] == "LONG":
            eth_pnl_pct = round((eth_exit / pos["eth_fill"] - 1) * 100, 2)
        else:
            eth_pnl_pct = round((pos["eth_fill"] / eth_exit - 1) * 100, 2)
    else:
        eth_pnl_pct = 0.0

    if btc_exit and pos["btc_fill"]:
        if pos["btc_action"] == "LONG":
            btc_pnl_pct = round((btc_exit / pos["btc_fill"] - 1) * 100, 2)
        else:
            btc_pnl_pct = round((pos["btc_fill"] / btc_exit - 1) * 100, 2)
    else:
        btc_pnl_pct = 0.0

    # Close in analytics_db
    try:
        if pos.get("eth_db_id"):
            close_trade(pos["eth_db_id"], eth_exit, eth_pnl, eth_pnl_pct, age_min)
        if pos.get("btc_db_id"):
            close_trade(pos["btc_db_id"], btc_exit, btc_pnl, btc_pnl_pct, age_min)
    except Exception as e:
        print(f"[PAIRS] ⚠️ analytics_db close error: {e}")

    _last_close_ts = time.time()
    _save_last_close_ts(_last_close_ts)

    icon = "✅" if combined_pnl >= 0 else "❌"
    reason_labels = {
        "mean_reversion": "Mean reversion (|z| ≤ 0.5)",
        "time_stop":      f"⏱ Time stop ({age_min}хв)",
        "dollar_stop":    f"💸 Dollar stop",
        "z_stop":         f"⚡ Z-stop (розходження z={current_z:+.3f})",
    }
    reason_str = reason_labels.get(reason, reason)

    print(
        f"[PAIRS] {icon} Закрито | {reason_str} | "
        f"ETH PnL=${eth_pnl:+.2f} | BTC PnL=${btc_pnl:+.2f} | "
        f"Combined=${combined_pnl:+.2f} | Age={age_min}хв"
    )
    send_telegram_message(
        f"{icon} <b>PAIRS закрито</b>\n"
        f"Причина: {reason_str}\n"
        f"ETH {pos['eth_action']}: вхід ${pos['eth_fill']:.2f}"
        + (f" → ${eth_exit:.2f}" if eth_exit else "") +
        f"\nBTC {pos['btc_action']}: вхід ${pos['btc_fill']:.2f}"
        + (f" → ${btc_exit:.2f}" if btc_exit else "") +
        f"\nPnL: ETH ${eth_pnl:+.2f} | BTC ${btc_pnl:+.2f}\n"
        f"<b>Combined PnL: ${combined_pnl:+.2f}</b> | {age_min}хв",
        TG_CHAT_ID,
    )


# ─── Strategy loop (entry) ────────────────────────────────────────────────────

def _strategy_loop() -> None:
    global _exchange, _last_close_ts

    print(
        f"[PAIRS] 📊 BTC/ETH Pairs Strategy запущена | "
        f"Z_ENTRY={Z_ENTRY} | Z_EXIT={Z_EXIT} | Z_STOP={Z_STOP} | "
        f"LOOKBACK={LOOKBACK} bars | SIZE={SIZE_PCT}%×2 | LEV={LEVERAGE}x"
    )

    while _running:
        try:
            with _state_lock:
                has_pos = _position is not None

            if has_pos:
                time.sleep(POLL_INTERVAL)
                continue

            # Cooldown check
            if time.time() - _last_close_ts < COOLDOWN_SEC:
                remaining = int((COOLDOWN_SEC - (time.time() - _last_close_ts)) / 60)
                print(f"[PAIRS] 💤 Cooldown: {remaining}хв до наступного входу")
                time.sleep(POLL_INTERVAL)
                continue

            try:
                z, btc_price, eth_price = _current_zscore()
            except Exception as e:
                print(f"[PAIRS] ⚠️ z-score calc error: {e}")
                time.sleep(POLL_INTERVAL)
                continue

            print(f"[PAIRS] z={z:+.3f} | ETH={eth_price:.2f} BTC={btc_price:.2f}")

            if abs(z) >= Z_ENTRY:
                _open_pair(z, btc_price, eth_price)

        except Exception as e:
            print(f"[PAIRS] strategy loop error: {e}")

        time.sleep(POLL_INTERVAL)


# ─── Monitor loop (exit) ──────────────────────────────────────────────────────

def _monitor_loop() -> None:
    print("[PAIRS] 👁 Monitor loop запущено")

    while _running:
        time.sleep(MONITOR_SEC)

        with _state_lock:
            pos = _position

        if not pos:
            continue

        try:
            now = time.time()
            age_sec = now - pos["opened_at"]

            # Time stop
            if age_sec >= MAX_HOLD_SEC:
                print(f"[PAIRS] ⏱ Time stop ({age_sec/3600:.1f}h)")
                _close_pair("time_stop")
                continue

            # Dollar stop — check without z-score fetch (fast path)
            # Approximate unrealized PnL from current prices
            try:
                eth_ticker = _exchange.fetch_ticker(ETH_SYMBOL)
                btc_ticker = _exchange.fetch_ticker(BTC_SYMBOL)
                eth_now = float(eth_ticker["last"])
                btc_now = float(btc_ticker["last"])
            except Exception as e:
                print(f"[PAIRS] ⚠️ ticker fetch error: {e}")
                continue

            if pos["eth_action"] == "LONG":
                eth_upnl = (eth_now - pos["eth_fill"]) / pos["eth_fill"] * pos["eth_qty"] * pos["eth_fill"] * LEVERAGE
            else:
                eth_upnl = (pos["eth_fill"] - eth_now) / pos["eth_fill"] * pos["eth_qty"] * pos["eth_fill"] * LEVERAGE

            if pos["btc_action"] == "LONG":
                btc_upnl = (btc_now - pos["btc_fill"]) / pos["btc_fill"] * pos["btc_qty"] * pos["btc_fill"] * LEVERAGE
            else:
                btc_upnl = (pos["btc_fill"] - btc_now) / pos["btc_fill"] * pos["btc_qty"] * pos["btc_fill"] * LEVERAGE

            combined_upnl = eth_upnl + btc_upnl

            if combined_upnl <= pos["dollar_stop"]:
                print(f"[PAIRS] 💸 Dollar stop: ${combined_upnl:.2f} <= ${pos['dollar_stop']:.2f}")
                _close_pair("dollar_stop")
                continue

            # Z-score checks (mean reversion exit + z_stop)
            try:
                z, _, _ = _current_zscore()
            except Exception as e:
                print(f"[PAIRS] ⚠️ z-score fetch error in monitor: {e}")
                continue

            print(
                f"[PAIRS] monitor | z={z:+.3f} | "
                f"upnl≈${combined_upnl:+.2f} | age={age_sec/60:.0f}хв"
            )

            if abs(z) >= Z_STOP:
                print(f"[PAIRS] ⚡ Z-stop: |z|={abs(z):.3f} >= {Z_STOP}")
                _close_pair("z_stop", current_z=z)
                continue

            if abs(z) <= Z_EXIT:
                print(f"[PAIRS] ✅ Mean reversion: |z|={abs(z):.3f} <= {Z_EXIT}")
                _close_pair("mean_reversion", current_z=z)

        except Exception as e:
            print(f"[PAIRS] monitor loop error: {e}")


# ─── Public API ───────────────────────────────────────────────────────────────

def start_pairs_strategy() -> threading.Thread:
    global _exchange, _running, _position, _last_close_ts

    _exchange = _init_exchange()
    _running = True

    # Restore state from disk (survives restarts)
    saved = _load_state()
    if saved:
        with _state_lock:
            _position = saved
        print(f"[PAIRS] 🔄 Відновлено стан з диска: ETH {saved['eth_action']} + BTC {saved['btc_action']}")

    _last_close_ts = _load_last_close_ts()

    strategy_t = threading.Thread(
        target=_strategy_loop, daemon=True, name="pairs-strategy"
    )
    monitor_t = threading.Thread(
        target=_monitor_loop, daemon=True, name="pairs-monitor"
    )
    strategy_t.start()
    monitor_t.start()

    print(
        f"[PAIRS] Стратегія запущена | "
        f"PAIRS_TRADING={'ON' if PAIRS_TRADING else 'OFF (dry)'} | "
        f"{'DEMO' if IS_DEMO_TRADING else 'LIVE'}"
    )
    return strategy_t
