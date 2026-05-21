"""
liquidity_sweep_bot.py — Liquidity Sweep Reversal Bot (ETH / SOL).

Стратегія: виявлення sweep swing high/low + розворот назад за рівень.
  TP = max(1.5% від entry, 1.5 × sweep_distance)
  SL = 0.3% за swept level
  Плечо = 3x  |  Розмір = 5% вільного балансу
  Cooldown: 8h на символ  |  Scan interval: 30 хв
  Max 1 позиція на символ
"""
import time
import threading
from datetime import datetime

import ccxt

from modules.trader import execute_trade, get_free_usdt, get_wallet_usdt, _init_exchange
from modules.tg_notifier import send_telegram_message
from modules import daily_guard, position_monitor
from grid_bot import _calc_hurst
from config.settings import TG_CHAT_ID, IS_DEMO_TRADING, SWEEP_TRADING

_HURST_FILTER = 0.90  # H > 0.90 = parabolic trend, skip sweep entries
                      # Backtest 90d ETH: at H=0.90 → 19 trades, WR 57.9%, +3.53%/mo @ SIZE=40
                      # Without filter: +1.41%/mo. Hurst adds +2.1%/mo edge.

SYMBOLS = [
    "ETH/USDT:USDT",
    # SOL removed 2026-05-21: backtest 48.6% WR -9.19%/90d; cost kinder -$107.64 on one bad SL
    # BTC removed: backtest 38.3% WR -7.99% (downtrend kills LONGs)
    # XRP/LINK removed: no backtest data, untested alpha
]

LEVERAGE    = 5
SIZE_PCT    = 40.0   # 25→40% (2026-05-21): backtest with Hurst 0.90 filter shows ETH-only
                     # +3.53%/mo at this size (vs +1.41% no filter @ 25%). 2.5x edge.
COOLDOWN    = 8 * 3600    # seconds
SCAN_SLEEP  = 15 * 60     # seconds (was 30min — too slow, sweeps recover quickly)

# Strategy parameters
SWING_LOOKBACK  = 3       # candles each side for pivot detection
MAX_SWINGS      = 15      # keep last N swings per symbol
SWEEP_MIN_PCT   = 0.05    # min distance above/below swing level to count as sweep
SWEEP_MAX_PCT   = 1.2     # max distance — restored to catch real sweeps (was over-tightened to 0.5)
REVERSAL_CANDLES = 3      # price must close back within this many candles
TP_MIN_PCT      = 1.5     # minimum TP regardless of sweep distance
TP_MULTIPLIER   = 1.5     # TP = max(TP_MIN_PCT, sweep_distance * TP_MULTIPLIER)
SL_BUFFER_PCT   = 0.3     # SL = 0.3% beyond swept level

# EMA filter thresholds
EMA_LONG_SKIP_RATIO  = 0.98   # skip LONG  if ema50 < ema200 * 0.98 (strong downtrend)
EMA_SHORT_SKIP_RATIO = 1.05   # skip SHORT if ema50 > ema200 * 1.05 (strong uptrend)


# ─── Market-data exchange (no auth needed for OHLCV) ─────────────────────────

def _make_market_exchange() -> ccxt.bybit:
    ex = ccxt.bybit({"options": {"defaultType": "linear"}})
    return ex


# ─── EMA calculation ─────────────────────────────────────────────────────────

def _ema(values: list[float], period: int) -> list[float]:
    if len(values) < period:
        return []
    k = 2.0 / (period + 1)
    result = [sum(values[:period]) / period]
    for v in values[period:]:
        result.append(v * k + result[-1] * (1 - k))
    return result


# ─── Swing pivot detection ───────────────────────────────────────────────────

def _find_swings(highs: list[float], lows: list[float], n: int = SWING_LOOKBACK):
    """
    Returns list of (index, price, 'high'|'low') for confirmed pivot swings.
    A swing high at i: high[i] > all highs in [i-n:i] and [i+1:i+n+1].
    A swing low  at i: low[i]  < all lows  in [i-n:i] and [i+1:i+n+1].
    We need at least n candles on each side → only check i in [n .. len-n-1].
    """
    swings = []
    size = len(highs)
    for i in range(n, size - n):
        left_h  = highs[i - n : i]
        right_h = highs[i + 1 : i + n + 1]
        if highs[i] > max(left_h) and highs[i] > max(right_h):
            swings.append((i, highs[i], "high"))

        left_l  = lows[i - n : i]
        right_l = lows[i + 1 : i + n + 1]
        if lows[i] < min(left_l) and lows[i] < min(right_l):
            swings.append((i, lows[i], "low"))

    return swings


# ─── Sweep reversal detection ────────────────────────────────────────────────

def _detect_sweep(
    opens: list[float],
    highs: list[float],
    lows: list[float],
    closes: list[float],
    swings: list[tuple],
) -> dict | None:
    """
    Scan the most recent REVERSAL_CANDLES+1 candles for a sweep-and-close-back pattern.
    Returns signal dict or None.

    SHORT sweep: candle high pierces above swing_high by SWEEP_MIN–MAX %,
                 then within REVERSAL_CANDLES the close falls back below swing_high.
    LONG  sweep: candle low pierces below swing_low  by SWEEP_MIN–MAX %,
                 then within REVERSAL_CANDLES the close rises back above swing_low.
    """
    if not swings or len(closes) < REVERSAL_CANDLES + 2:
        return None

    size = len(closes)
    # We only look at the most recent window — from index (size-REVERSAL_CANDLES-2) onward
    window_start = max(0, size - REVERSAL_CANDLES - 2)

    swing_highs = [(idx, price) for idx, price, kind in swings if kind == "high"]
    swing_lows  = [(idx, price) for idx, price, kind in swings if kind == "low"]

    for sweep_idx in range(window_start, size - 1):
        # ── SHORT: sweep above a swing high ──────────────────────────────────
        for s_idx, s_price in swing_highs:
            if s_idx >= sweep_idx:
                continue
            sweep_pct = (highs[sweep_idx] - s_price) / s_price * 100
            if not (SWEEP_MIN_PCT <= sweep_pct <= SWEEP_MAX_PCT):
                continue
            # Check: does any subsequent close fall back below s_price?
            for close_idx in range(sweep_idx + 1, min(sweep_idx + REVERSAL_CANDLES + 1, size)):
                if closes[close_idx] < s_price:
                    sweep_distance = sweep_pct
                    tp_pct = max(TP_MIN_PCT, sweep_distance * TP_MULTIPLIER)
                    sl_pct = SL_BUFFER_PCT + sweep_pct  # 0.3% beyond the swept high
                    return {
                        "direction":       "SHORT",
                        "swept_level":     s_price,
                        "sweep_pct":       sweep_pct,
                        "entry_price":     closes[close_idx],
                        "tp_pct":          round(tp_pct, 3),
                        "sl_pct":          round(sl_pct, 3),
                        "sweep_idx":       sweep_idx,
                        "close_idx":       close_idx,
                    }

        # ── LONG: sweep below a swing low ────────────────────────────────────
        for s_idx, s_price in swing_lows:
            if s_idx >= sweep_idx:
                continue
            sweep_pct = (s_price - lows[sweep_idx]) / s_price * 100
            if not (SWEEP_MIN_PCT <= sweep_pct <= SWEEP_MAX_PCT):
                continue
            for close_idx in range(sweep_idx + 1, min(sweep_idx + REVERSAL_CANDLES + 1, size)):
                if closes[close_idx] > s_price:
                    sweep_distance = sweep_pct
                    tp_pct = max(TP_MIN_PCT, sweep_distance * TP_MULTIPLIER)
                    sl_pct = SL_BUFFER_PCT + sweep_pct
                    return {
                        "direction":       "LONG",
                        "swept_level":     s_price,
                        "sweep_pct":       sweep_pct,
                        "entry_price":     closes[close_idx],
                        "tp_pct":          round(tp_pct, 3),
                        "sl_pct":          round(sl_pct, 3),
                        "sweep_idx":       sweep_idx,
                        "close_idx":       close_idx,
                    }

    return None


# ─── EMA filter ──────────────────────────────────────────────────────────────

def _ema_filter_pass(direction: str, closes: list[float]) -> bool:
    ema50_series  = _ema(closes, 50)
    ema200_series = _ema(closes, 200)
    if not ema50_series or not ema200_series:
        return True  # not enough data — allow trade
    ema50  = ema50_series[-1]
    ema200 = ema200_series[-1]

    if direction == "LONG" and ema50 < ema200 * EMA_LONG_SKIP_RATIO:
        return False
    if direction == "SHORT" and ema50 > ema200 * EMA_SHORT_SKIP_RATIO:
        return False
    return True


# ─── Main engine ─────────────────────────────────────────────────────────────

def run_sweep_engine() -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [SW] LIQUIDITY SWEEP BOT ЗАПУЩЕН!")
    print(f"   Symbols: {', '.join(SYMBOLS)}")
    print(f"   x{LEVERAGE}  Size={SIZE_PCT}%  Cooldown={COOLDOWN//3600}h")
    print(f"   Trading={'ON' if SWEEP_TRADING else 'OFF (dry-run)'}  "
          f"{'[DEMO]' if IS_DEMO_TRADING else '[LIVE]'}\n")

    try:
        ex_init = _init_exchange()
        start_bal = get_wallet_usdt(ex_init)
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
        f"<b>[SW] Liquidity Sweep Bot запущен</b>\n"
        f"ETH / SOL | x{LEVERAGE}  Size={SIZE_PCT}%  Cooldown={COOLDOWN//3600}h\n"
        f"{'Demo режим' if IS_DEMO_TRADING else 'Live режим'} | "
        f"Торгівля: {'ON' if SWEEP_TRADING else 'OFF (dry-run)'}",
        TG_CHAT_ID,
    )

    market_ex = _make_market_exchange()

    _cooldowns: dict[str, float] = {}
    _open_symbols: set = set()
    last_error_tg = 0.0

    while True:
        try:
            now = time.time()

            try:
                exchange = _init_exchange()
                balance  = get_free_usdt(exchange)
                wallet   = get_wallet_usdt(exchange)
            except Exception as e:
                print(f"[SW]  Balance fetch failed: {e}")
                time.sleep(SCAN_SLEEP)
                continue

            if not daily_guard.check(wallet):
                print(f"[SW] Daily loss limit hit — skipping scan")
                time.sleep(SCAN_SLEEP)
                continue

            # Sync _open_symbols against real exchange positions
            try:
                real_pos = {
                    p["symbol"].replace("USDT", "/USDT:USDT")
                    for p in exchange.fetch_positions(params={"category": "linear"})
                    if float(p.get("contracts", 0) or 0) > 0
                }
                if _open_symbols:
                    _open_symbols &= real_pos
                else:
                    _open_symbols = {s for s in real_pos if s in SYMBOLS}
            except Exception:
                pass

            for symbol in SYMBOLS:
                cooldown_remaining = COOLDOWN - (now - _cooldowns.get(symbol, 0))
                if cooldown_remaining > 0:
                    print(f"[SW] Cooldown {symbol}: {int(cooldown_remaining / 3600)}h "
                          f"{int((cooldown_remaining % 3600) / 60)}m")
                    continue

                if symbol in _open_symbols:
                    print(f"[SW] {symbol} already open — skip")
                    continue

                # ── Fetch 4h OHLCV ───────────────────────────────────────────
                try:
                    ohlcv = market_ex.fetch_ohlcv(symbol, timeframe="4h", limit=60)
                except Exception as e:
                    print(f"[SW]  OHLCV fetch failed for {symbol}: {e}")
                    continue

                if len(ohlcv) < 50:
                    print(f"[SW] Not enough candles for {symbol} ({len(ohlcv)})")
                    continue

                # Hurst trend filter — sweep is mean-reversion, dies in parabolic moves
                _closes_for_hurst = [c[4] for c in ohlcv[-60:]]
                _hurst = _calc_hurst(_closes_for_hurst)
                if _hurst > _HURST_FILTER:
                    print(f"[SW] {symbol} Hurst={_hurst:.2f} > {_HURST_FILTER} — trending, skip")
                    continue

                opens  = [c[1] for c in ohlcv]
                highs  = [c[2] for c in ohlcv]
                lows   = [c[3] for c in ohlcv]
                closes = [c[4] for c in ohlcv]

                # ── Find swing pivots ─────────────────────────────────────────
                all_swings = _find_swings(highs, lows)
                # Keep last MAX_SWINGS
                all_swings = all_swings[-MAX_SWINGS:]

                if not all_swings:
                    print(f"[SW] {symbol}: no swing pivots found")
                    continue

                # ── Detect sweep reversal ─────────────────────────────────────
                signal = _detect_sweep(opens, highs, lows, closes, all_swings)

                if signal is None:
                    print(f"[SW] {symbol}: no sweep signal")
                    continue

                direction = signal["direction"]

                # ── EMA filter ────────────────────────────────────────────────
                if not _ema_filter_pass(direction, closes):
                    ema50  = _ema(closes, 50)[-1]
                    ema200 = _ema(closes, 200)[-1]
                    print(f"[SW] {symbol} {direction} blocked by EMA filter "
                          f"(ema50={ema50:.2f} ema200={ema200:.2f})")
                    continue

                tp_pct = signal["tp_pct"]
                sl_pct = signal["sl_pct"]

                print(f"\n[SW] {'='*44}")
                print(f"[SW] SIGNAL  {direction}  {symbol}")
                print(f"[SW] swept_level={signal['swept_level']:.4f}  "
                      f"sweep={signal['sweep_pct']:.3f}%")
                print(f"[SW] entry={signal['entry_price']:.4f}  "
                      f"TP={tp_pct:.2f}%  SL={sl_pct:.2f}%")
                print(f"[SW] {'='*44}\n")

                tg_body = (
                    f"<b>[SW] {direction} {symbol}</b>\n"
                    f"Entry: <code>{signal['entry_price']:.4f}</code> | "
                    f"Swept: <code>{signal['swept_level']:.4f}</code>\n"
                    f"Sweep dist: <code>{signal['sweep_pct']:.3f}%</code>\n"
                    f"TP: <code>{tp_pct:.2f}%</code>  "
                    f"SL: <code>{sl_pct:.2f}%</code>  "
                    f"x{LEVERAGE}"
                )

                _cooldowns[symbol] = now

                # Publish market view to shared state
                try:
                    from modules.market_state import set_state, MarketCondition
                    ms = MarketCondition.BULL if direction == "LONG" else MarketCondition.BEAR
                    set_state(symbol, ms, "sweep", confidence=0.75,
                              reason=f"sweep {direction} {signal['sweep_pct']:.3f}%")
                except Exception:
                    pass

                if SWEEP_TRADING:
                    # execute_trade removed 2026-05-21 — owner double-position bug.
                    # Dispatch handles owner as user_id=1, all other users get isolated calls.
                    try:
                        from modules.saas_dispatcher import dispatch as _saas_dispatch
                        _saas_dispatch({
                            "source":   "sweep",
                            "symbol":   symbol,
                            "side":     direction,
                            "leverage": LEVERAGE,
                            "tp_pct":   tp_pct,
                            "sl_pct":   sl_pct,
                            "size_pct": SIZE_PCT,
                        })
                        _open_symbols.add(symbol)
                        send_telegram_message(tg_body, TG_CHAT_ID)
                    except Exception as e:
                        print(f"[SW]  dispatch error {symbol}: {e}")
                else:
                    print(f"[SW] DRY-RUN — trading disabled, no order placed")
                    send_telegram_message(
                        f"[SW] DRY-RUN\n{tg_body}",
                        TG_CHAT_ID,
                    )

            time.sleep(SCAN_SLEEP)

        except KeyboardInterrupt:
            print("\n[SW] Sweep бот зупинено.")
            break
        except Exception as e:
            print(f"[SW]  {e}")
            now_ts = time.time()
            if now_ts - last_error_tg > 300:
                last_error_tg = now_ts
                send_telegram_message(
                    f" <b>[SW] Liquidity Sweep Bot — помилка</b>\n<code>{str(e)[:300]}</code>",
                    TG_CHAT_ID,
                )
            time.sleep(10)


if __name__ == "__main__":
    run_sweep_engine()
