"""
backtester_cascade.py — Cascade bot backtest
Signal: large body candle ≥0.8% → momentum entry in candle direction
TP=2%, SL=0.6%, 5x leverage, 5% size, max hold=6 candles
Symbols: BTC/ETH/SOL/XRP/DOGE, 90 days, 15min
"""
import ccxt
import time
from datetime import datetime, timezone
from collections import defaultdict

SYMBOLS = [
    "ETH/USDT:USDT",
    "SOL/USDT:USDT",
    "DOGE/USDT:USDT",
    "LINK/USDT:USDT",
]
TIMEFRAME = "15m"
DAYS = 90
CANDLES_PER_DAY = 96  # 15min * 96 = 24h
CANDLES_NEEDED = DAYS * CANDLES_PER_DAY + 50

TP_PCT = 0.02
SL_PCT = 0.006
LEVERAGE = 5
SIZE_PCT = 0.20     # 20% per trade for meaningful P&L on $10k
MAX_HOLD = 18       # 18×15m = 4.5h — enough time for 2% TP to hit
BODY_THRESH = 0.012  # 1.2% min body — filter weak momentum candles

TAKER_FEE = 0.00055
FEE_COST  = TAKER_FEE * 2 * LEVERAGE  # 0.55% round-trip at 5x

def fetch_ohlcv_chunked(exchange, symbol, limit):
    """Fetch in chunks since some exchanges cap per-request limit."""
    all_bars = []
    timeframe_ms = 15 * 60 * 1000
    since = None

    # Calculate start time
    import time as tmod
    end_ts = int(tmod.time() * 1000)
    start_ts = end_ts - (limit * timeframe_ms)

    chunk_size = 1000
    current_since = start_ts

    while len(all_bars) < limit:
        try:
            bars = exchange.fetch_ohlcv(symbol, TIMEFRAME, since=current_since, limit=chunk_size)
        except Exception as e:
            print(f"  Chunk fetch error for {symbol}: {e}")
            break
        if not bars:
            break
        all_bars.extend(bars)
        current_since = bars[-1][0] + timeframe_ms
        if current_since >= end_ts:
            break
        if len(bars) < chunk_size:
            break

    # Deduplicate and sort
    seen = set()
    unique = []
    for b in all_bars:
        if b[0] not in seen:
            seen.add(b[0])
            unique.append(b)
    unique.sort(key=lambda x: x[0])
    return unique[-limit:] if len(unique) > limit else unique

def backtest_symbol(exchange, symbol):
    print(f"  Fetching {symbol} 15m ({DAYS}d) ...")
    bars = fetch_ohlcv_chunked(exchange, symbol, CANDLES_NEEDED)

    if len(bars) < 20:
        print(f"  Not enough data for {symbol}: {len(bars)} bars")
        return []

    timestamps = [b[0] for b in bars]
    opens  = [b[1] for b in bars]
    highs  = [b[2] for b in bars]
    lows   = [b[3] for b in bars]
    closes = [b[4] for b in bars]

    trades = []
    in_trade = False
    entry_price = 0.0
    direction = None
    entry_i = 0

    for i in range(1, len(bars) - 1):
        if in_trade:
            hi = highs[i]
            lo = lows[i]
            cl = closes[i]
            held = i - entry_i

            if direction == "LONG":
                tp_price = entry_price * (1 + TP_PCT)
                sl_price = entry_price * (1 - SL_PCT)
                if lo <= sl_price:
                    pnl = -SL_PCT * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "LONG", "pnl": pnl, "ts": timestamps[i]})
                    in_trade = False
                elif hi >= tp_price:
                    pnl = TP_PCT * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "LONG", "pnl": pnl, "ts": timestamps[i]})
                    in_trade = False
                elif held >= MAX_HOLD:
                    pnl = (cl - entry_price) / entry_price * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "LONG", "pnl": pnl, "ts": timestamps[i]})
                    in_trade = False
            else:  # SHORT
                tp_price = entry_price * (1 - TP_PCT)
                sl_price = entry_price * (1 + SL_PCT)
                if hi >= sl_price:
                    pnl = -SL_PCT * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "SHORT", "pnl": pnl, "ts": timestamps[i]})
                    in_trade = False
                elif lo <= tp_price:
                    pnl = TP_PCT * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "SHORT", "pnl": pnl, "ts": timestamps[i]})
                    in_trade = False
                elif held >= MAX_HOLD:
                    pnl = (entry_price - cl) / entry_price * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "SHORT", "pnl": pnl, "ts": timestamps[i]})
                    in_trade = False
            continue

        # Signal: large body candle
        op = opens[i]
        cl = closes[i]
        if op == 0:
            continue
        body_pct = abs(cl - op) / op
        if body_pct >= BODY_THRESH:
            in_trade = True
            entry_price = cl  # enter at close of signal candle (next open approximation)
            direction = "LONG" if cl > op else "SHORT"
            entry_i = i + 1  # enter on NEXT candle open
            entry_price = opens[i + 1] if i + 1 < len(bars) else cl

    return trades

def format_results(all_trades, label="COMBINED"):
    if not all_trades:
        return f"{label}: 0 trades"
    n = len(all_trades)
    wins = sum(1 for t in all_trades if t["pnl"] > 0)
    wr = wins / n * 100
    avg_pnl = sum(t["pnl"] for t in all_trades) / n * 100
    total_raw = sum(t["pnl"] for t in all_trades)
    total_pnl = total_raw * SIZE_PCT * 100

    monthly = defaultdict(float)
    for t in all_trades:
        dt = datetime.fromtimestamp(t["ts"]/1000, tz=timezone.utc)
        key = f"{dt.year}-{dt.month:02d}"
        monthly[key] += t["pnl"] * SIZE_PCT * 100

    monthly_avg = sum(monthly.values()) / len(monthly) if monthly else 0

    return (f"{label}: trades={n}, WR={wr:.1f}%, avg_pnl={avg_pnl:+.3f}% (raw 5x lev), "
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
        time.sleep(0.5)  # rate limit

    print()
    print(format_results(all_combined, "COMBINED"))
    return results, all_combined

if __name__ == "__main__":
    print("=== CASCADE BACKTEST ===")
    results, combined = main()
    print("=== DONE ===")
