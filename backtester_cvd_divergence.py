"""
backtester_cvd_divergence.py — CVD Divergence backtest
Mirrors the logic in modules/orderflow_engine.py:calc_cvd_divergence()

Signal (15m candles, lookback=20):
  bearish_div: price near 20-bar high  + CVD ratio in bottom 47% of range → SHORT
  bullish_div: price near 20-bar low   + CVD ratio in top 47% of range   → LONG

CVD approximation: bullish candle (close>=open) → +volume, bearish → -volume.
Cumulative CVD ratio = position of current CVD within [min, max] of the 20-bar range.

Symbols: BTC/ETH/SOL, 90 days, 15min, Bybit
TP=2.0%, SL=1.0%, 5x leverage (matches live orderflow_bot.py)
"""
import ccxt
import time as tmod
from datetime import datetime, timezone
from collections import defaultdict

SYMBOLS      = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
TIMEFRAME    = "15m"
DAYS         = 90
LOOKBACK     = 20       # bars for CVD/price window (matches live engine)

TP_PCT       = 0.020    # 2.0%
SL_PCT       = 0.010    # 1.0%
LEVERAGE     = 5
SIZE_PCT     = 0.20
MAX_HOLD     = 32       # 32×15m = 8h max hold

BEAR_THRESH  = 0.998    # price at ≥prev_high×0.998 → "at the high"
BULL_THRESH  = 1.002    # price at ≤prev_low×1.002  → "at the low"
CVD_BEAR_MAX = 30.0     # CVD ratio < 30 = strongly diverging bearish (was 47)
CVD_BULL_MIN = 70.0     # CVD ratio > 70 = strongly diverging bullish (was 53)
VOL_MULT_MIN = 1.5      # volume must be ≥1.5× 20-bar average to enter

COOLDOWN_BARS = 25      # ~6h between signals (was 10)
TAKER_FEE = 0.00055
FEE_COST  = TAKER_FEE * 2 * LEVERAGE


def fetch_ohlcv_chunked(exchange, symbol, limit):
    all_bars = []
    tf_ms = 15 * 60 * 1000
    end_ts = int(tmod.time() * 1000)
    start_ts = end_ts - (limit * tf_ms)
    chunk = 1000
    since = start_ts

    while len(all_bars) < limit:
        try:
            bars = exchange.fetch_ohlcv(symbol, TIMEFRAME, since=since, limit=chunk)
        except Exception as e:
            print(f"  Chunk error {symbol}: {e}")
            break
        if not bars:
            break
        all_bars.extend(bars)
        since = bars[-1][0] + tf_ms
        if since >= end_ts or len(bars) < chunk:
            break

    seen, unique = set(), []
    for b in all_bars:
        if b[0] not in seen:
            seen.add(b[0])
            unique.append(b)
    unique.sort(key=lambda x: x[0])
    return unique[-limit:] if len(unique) > limit else unique


def calc_cvd_ratio(candles_window):
    """CVD ratio 0-100: position of current CVD within [min, max] of window."""
    running = 0.0
    series = []
    for c in candles_window:
        bar_cvd = c[5] if c[4] >= c[1] else -c[5]
        running += bar_cvd
        series.append(running)
    cvd_min = min(series)
    cvd_max = max(series)
    rng = cvd_max - cvd_min
    if rng <= 0:
        return 50.0
    return (series[-1] - cvd_min) / rng * 100.0


def backtest_symbol(exchange, symbol):
    limit = int(DAYS * 24 * 4) + LOOKBACK + 10
    print(f"  Fetching {symbol} 15m ({DAYS}d) ...")
    bars = fetch_ohlcv_chunked(exchange, symbol, limit)

    if len(bars) < LOOKBACK + 10:
        print(f"  Not enough data: {len(bars)} bars")
        return []

    highs  = [b[2] for b in bars]
    lows   = [b[3] for b in bars]
    opens  = [b[1] for b in bars]
    closes = [b[4] for b in bars]
    ts     = [b[0] for b in bars]

    trades = []
    in_trade = False
    direction = None
    entry_price = 0.0
    entry_i = 0
    last_signal_i = -COOLDOWN_BARS

    for i in range(LOOKBACK, len(bars) - 1):
        if in_trade:
            hi = highs[i]
            lo = lows[i]
            cl = closes[i]
            held = i - entry_i

            if direction == "LONG":
                tp = entry_price * (1 + TP_PCT)
                sl = entry_price * (1 - SL_PCT)
                if lo <= sl:
                    pnl = -SL_PCT * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "LONG", "pnl": pnl, "ts": ts[i]})
                    in_trade = False; last_signal_i = i
                elif hi >= tp:
                    pnl = TP_PCT * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "LONG", "pnl": pnl, "ts": ts[i]})
                    in_trade = False; last_signal_i = i
                elif held >= MAX_HOLD:
                    pnl = (cl - entry_price) / entry_price * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "LONG", "pnl": pnl, "ts": ts[i]})
                    in_trade = False; last_signal_i = i
            else:
                tp = entry_price * (1 - TP_PCT)
                sl = entry_price * (1 + SL_PCT)
                if hi >= sl:
                    pnl = -SL_PCT * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "SHORT", "pnl": pnl, "ts": ts[i]})
                    in_trade = False; last_signal_i = i
                elif lo <= tp:
                    pnl = TP_PCT * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "SHORT", "pnl": pnl, "ts": ts[i]})
                    in_trade = False; last_signal_i = i
                elif held >= MAX_HOLD:
                    pnl = (entry_price - cl) / entry_price * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "SHORT", "pnl": pnl, "ts": ts[i]})
                    in_trade = False; last_signal_i = i
            continue

        if i - last_signal_i < COOLDOWN_BARS:
            continue

        # Volume filter: current bar must be ≥1.5× average of prior 20 bars
        vol_avg = sum(bars[j][5] for j in range(i - LOOKBACK, i)) / LOOKBACK
        if bars[i][5] < vol_avg * VOL_MULT_MIN:
            continue

        window = bars[i - LOOKBACK + 1: i + 1]
        cvd_ratio = calc_cvd_ratio(window)

        cur_high = highs[i]
        cur_low  = lows[i]
        prev_highs = highs[i - LOOKBACK + 1: i]
        prev_lows  = lows[i - LOOKBACK + 1: i]
        prev_high  = max(prev_highs)
        prev_low   = min(prev_lows)

        bearish_div = (cur_high >= prev_high * BEAR_THRESH) and (cvd_ratio < CVD_BEAR_MAX)
        bullish_div = (cur_low <= prev_low * BULL_THRESH) and (cvd_ratio > CVD_BULL_MIN)

        if bearish_div and not bullish_div:
            in_trade = True
            direction = "SHORT"
            entry_price = opens[i + 1]
            entry_i = i + 1
        elif bullish_div and not bearish_div:
            in_trade = True
            direction = "LONG"
            entry_price = opens[i + 1]
            entry_i = i + 1

    return trades


def format_results(trades, label="COMBINED"):
    if not trades:
        return f"{label}: 0 trades"
    n = len(trades)
    wins = sum(1 for t in trades if t["pnl"] > 0)
    wr = wins / n * 100
    avg_pnl = sum(t["pnl"] for t in trades) / n * 100
    total_pnl = sum(t["pnl"] for t in trades) * SIZE_PCT * 100

    monthly = defaultdict(float)
    for t in trades:
        dt = datetime.fromtimestamp(t["ts"] / 1000, tz=timezone.utc)
        key = f"{dt.year}-{dt.month:02d}"
        monthly[key] += t["pnl"] * SIZE_PCT * 100

    monthly_avg = sum(monthly.values()) / len(monthly) if monthly else 0
    max_dd = 0.0
    running = 0.0
    peak = 0.0
    for t in trades:
        running += t["pnl"] * SIZE_PCT * 100
        if running > peak:
            peak = running
        dd = peak - running
        if dd > max_dd:
            max_dd = dd

    return (f"{label}: trades={n}, WR={wr:.1f}%, avg_pnl={avg_pnl:+.3f}% (5x lev), "
            f"total={total_pnl:+.2f}%, monthly={monthly_avg:+.2f}%, maxDD={max_dd:.2f}%")


def main():
    exchange = ccxt.bybit({"options": {"defaultType": "swap"}})
    exchange.load_markets()

    all_trades = []
    for sym in SYMBOLS:
        trades = backtest_symbol(exchange, sym)
        all_trades.extend(trades)
        print("  " + format_results(trades, sym))
        tmod.sleep(0.5)

    print()
    print(format_results(all_trades, "COMBINED"))
    return all_trades


if __name__ == "__main__":
    print("=== CVD DIVERGENCE BACKTEST ===")
    print(f"Logic: 20-bar window, bearish_div if price@high+CVD<47%, bullish if price@low+CVD>53%")
    print(f"TP={TP_PCT*100:.1f}%  SL={SL_PCT*100:.1f}%  x{LEVERAGE}  cooldown={COOLDOWN_BARS}bars")
    print()
    trades = main()
    print("=== DONE ===")
