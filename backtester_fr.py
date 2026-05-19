"""
backtester_fr.py — Funding Rate bot backtest
NOTE: Original spec uses Binance-era thresholds (0.18%/-0.05%) which never occur on Bybit.
Bybit USDT perps cap funding at ±0.01% (0.0001 raw). 
Adapted thresholds that preserve the spirit: SHORT >= 0.008% (near Bybit cap), LONG <= -0.005%
TP=0.4%, SL=1.5%, hold max 3 candles on 1h chart.
Symbols: BTC/ETH/SOL, ~25 days (Bybit funding history limit=200 = ~25 days @ 8h intervals).
"""
import ccxt
import time as tmod
from datetime import datetime, timezone
from collections import defaultdict

SYMBOLS = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
TIMEFRAME = "1h"
DAYS = 90
CANDLES_LIMIT = DAYS * 24 + 100

TP_PCT = 0.004   # 0.4%
SL_PCT = 0.015   # 1.5%
MAX_HOLD = 3
SIZE_PCT = 0.05

# Bybit-adapted thresholds (original spec 0.18%/-0.05% never hit on Bybit)
FR_SHORT_THRESH = 0.00008   # >=0.008% → SHORT (near Bybit positive cap)
FR_LONG_THRESH  = -0.00005  # <=-0.005% → LONG (negative funding)

def fetch_funding_history(exchange, symbol):
    try:
        since_90d = int(tmod.time() * 1000) - (90 * 24 * 3600 * 1000)
        fr_data = exchange.fetch_funding_rate_history(symbol, since=since_90d, limit=1000)
        return fr_data
    except Exception as e:
        print(f"  ERROR fetching funding for {symbol}: {e}")
        return []

def fetch_ohlcv_1h(exchange, symbol, limit):
    try:
        since = int(tmod.time() * 1000) - (limit * 3600 * 1000)
        bars = exchange.fetch_ohlcv(symbol, TIMEFRAME, since=since, limit=limit)
        return bars
    except Exception as e:
        print(f"  ERROR fetching 1h OHLCV for {symbol}: {e}")
        return []

def backtest_symbol(exchange, symbol):
    print(f"  Fetching {symbol} funding + 1h OHLCV ...")
    
    fr_list = fetch_funding_history(exchange, symbol)
    bars = fetch_ohlcv_1h(exchange, symbol, CANDLES_LIMIT)
    
    if not fr_list or not bars:
        print(f"  Skipping {symbol} — no data")
        return []

    bar_ts    = [b[0] for b in bars]
    bar_open  = [b[1] for b in bars]
    bar_high  = [b[2] for b in bars]
    bar_low   = [b[3] for b in bars]
    bar_close = [b[4] for b in bars]

    # Build ts→idx map for fast lookup
    ts_to_idx = {ts: i for i, ts in enumerate(bar_ts)}

    def find_next_candle_idx(funding_ts):
        # Find first candle that starts after funding_ts
        for idx in range(len(bar_ts)):
            if bar_ts[idx] > funding_ts:
                return idx
        return None

    trades = []
    signal_count = {"short": 0, "long": 0}

    for fr_event in fr_list:
        fr_ts  = fr_event.get("timestamp")
        fr_val = fr_event.get("fundingRate")
        if fr_ts is None or fr_val is None:
            continue

        if fr_val >= FR_SHORT_THRESH:
            direction = "SHORT"
            signal_count["short"] += 1
        elif fr_val <= FR_LONG_THRESH:
            direction = "LONG"
            signal_count["long"] += 1
        else:
            continue

        entry_idx = find_next_candle_idx(fr_ts)
        if entry_idx is None or entry_idx >= len(bars) - 1:
            continue

        entry_price = bar_open[entry_idx]
        if not entry_price or entry_price == 0:
            continue

        pnl = None
        exit_candle = min(entry_idx + MAX_HOLD, len(bars) - 1)

        for k in range(entry_idx, exit_candle + 1):
            hi = bar_high[k]
            lo = bar_low[k]
            cl = bar_close[k]

            if direction == "LONG":
                tp = entry_price * (1 + TP_PCT)
                sl = entry_price * (1 - SL_PCT)
                if lo <= sl:
                    pnl = -SL_PCT; break
                elif hi >= tp:
                    pnl = TP_PCT; break
                elif k == exit_candle:
                    pnl = (cl - entry_price) / entry_price
            else:
                tp = entry_price * (1 - TP_PCT)
                sl = entry_price * (1 + SL_PCT)
                if hi >= sl:
                    pnl = -SL_PCT; break
                elif lo <= tp:
                    pnl = TP_PCT; break
                elif k == exit_candle:
                    pnl = (entry_price - cl) / entry_price

        if pnl is not None:
            trades.append({
                "symbol": symbol, "dir": direction,
                "fr_pct": fr_val * 100, "pnl": pnl, "ts": fr_ts
            })

    print(f"  {symbol}: {signal_count['short']} SHORT signals, {signal_count['long']} LONG signals → {len(trades)} trades")
    return trades

def format_results(all_trades, label="COMBINED"):
    if not all_trades:
        return f"{label}: 0 trades"
    n = len(all_trades)
    wins = sum(1 for t in all_trades if t["pnl"] > 0)
    wr = wins / n * 100
    avg_pnl = sum(t["pnl"] for t in all_trades) / n * 100
    total_pnl = sum(t["pnl"] for t in all_trades) * SIZE_PCT * 100

    monthly = defaultdict(float)
    for t in all_trades:
        dt = datetime.fromtimestamp(t["ts"]/1000, tz=timezone.utc)
        key = f"{dt.year}-{dt.month:02d}"
        monthly[key] += t["pnl"] * SIZE_PCT * 100

    monthly_avg = sum(monthly.values()) / len(monthly) if monthly else 0

    return (f"{label}: trades={n}, WR={wr:.1f}%, avg_pnl={avg_pnl:+.3f}% (raw), "
            f"total_account_pnl={total_pnl:+.2f}%, monthly_avg={monthly_avg:+.2f}%")

def main():
    exchange = ccxt.bybit({"options": {"defaultType": "swap"}})
    exchange.load_markets()

    all_combined = []
    results = {}

    for sym in SYMBOLS:
        trades = backtest_symbol(exchange, sym)
        results[sym] = trades
        all_combined.extend(trades)
        print("  " + format_results(trades, sym))

    print()
    print(format_results(all_combined, "COMBINED"))
    return results, all_combined

if __name__ == "__main__":
    print("=== FUNDING RATE BACKTEST (Bybit-adapted thresholds) ===")
    print("NOTE: Original thresholds (0.18%/-0.05%) never occur on Bybit (cap=0.01%)")
    print("Using adapted: SHORT>=0.008%, LONG<=-0.005%")
    print()
    results, combined = main()
    print("=== DONE ===")
