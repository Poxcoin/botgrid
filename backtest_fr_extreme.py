"""
backtest_fr_extreme.py — Funding Rate Extreme Reversal Backtest
Uses Bybit funding rate history + 1h OHLCV
Fees included: 0.11% round trip
~25 days of funding history (Bybit limit=200 @ 8h intervals)
"""
import ccxt
import time as tmod
from datetime import datetime, timezone
from collections import defaultdict

SYMBOLS_MAJOR = [
    "BTC/USDT:USDT",
    "ETH/USDT:USDT",
]

LEVERAGE  = 5
TP_PCT    = 0.025   # 2.5% — bigger move needed for true FR extremes
SL_PCT    = 0.010   # 1.0%  R:R = 2.5:1 → break-even at 31% WR at 5x
SIZE_PCT  = 0.20
MAX_HOLD  = 16      # 16h candles — give more time for reversal to play out

# Raw fundingRate thresholds (not %)
# Bybit BTC/ETH hard cap = 0.01% = 0.0001 raw
# Extreme = ≥90% of cap (very rare, genuinely over-leveraged crowd)
FR_BULL_MAJOR = 0.00009   # >0.009% → SHORT (near Bybit BTC/ETH cap)
FR_BEAR_MAJOR = 0.00006   # <-0.006% → LONG (unusual negative funding)

TAKER_FEE = 0.00055
FEE_COST  = TAKER_FEE * 2 * LEVERAGE  # per trade fraction

OHLCV_TF = "1h"
# ~25 days of funding (200 events × 8h = 1600h ≈ 66 days, but Bybit often caps at ~25d)
# Fetch enough 1h bars to cover the full funding history
OHLCV_DAYS = 70
OHLCV_LIMIT = OHLCV_DAYS * 24 + 100


def fetch_funding_history(exchange, symbol):
    """Fetch Bybit funding rate history. Returns list of {timestamp, fundingRate}."""
    try:
        # Request max available; Bybit caps at ~200 per call
        since_90d = int(tmod.time() * 1000) - (90 * 24 * 3600 * 1000)
        fr_data = exchange.fetch_funding_rate_history(symbol, since=since_90d, limit=200)
        return fr_data
    except Exception as e:
        print(f"  ERROR fetching funding for {symbol}: {e}")
        return []


def fetch_ohlcv_1h(exchange, symbol):
    """Fetch 1h OHLCV bars covering OHLCV_DAYS."""
    try:
        since = int(tmod.time() * 1000) - (OHLCV_LIMIT * 3600 * 1000)
        # Chunk to get enough data
        all_bars = []
        current_since = since
        timeframe_ms = 3600 * 1000
        end_ts = int(tmod.time() * 1000)

        while True:
            bars = exchange.fetch_ohlcv(
                symbol, OHLCV_TF, since=current_since, limit=500,
                params={"category": "linear"}
            )
            if not bars:
                break
            all_bars.extend(bars)
            current_since = bars[-1][0] + timeframe_ms
            if current_since >= end_ts:
                break
            if len(bars) < 500:
                break
            tmod.sleep(0.2)

        # Deduplicate
        seen = set()
        unique = []
        for b in all_bars:
            if b[0] not in seen:
                seen.add(b[0])
                unique.append(b)
        unique.sort(key=lambda x: x[0])
        return unique
    except Exception as e:
        print(f"  ERROR fetching 1h OHLCV for {symbol}: {e}")
        return []


def backtest_symbol(exchange, symbol):
    print(f"  Fetching {symbol} funding + 1h OHLCV ...")

    fr_list = fetch_funding_history(exchange, symbol)
    bars = fetch_ohlcv_1h(exchange, symbol)

    if not fr_list or not bars:
        print(f"  Skipping {symbol} — no data")
        return []

    print(f"  {symbol}: {len(fr_list)} funding events, {len(bars)} 1h bars")

    bar_ts    = [b[0] for b in bars]
    bar_open  = [b[1] for b in bars]
    bar_high  = [b[2] for b in bars]
    bar_low   = [b[3] for b in bars]
    bar_close = [b[4] for b in bars]

    def find_next_candle_idx(funding_ts):
        for idx in range(len(bar_ts)):
            if bar_ts[idx] > funding_ts:
                return idx
        return None

    trades = []
    last_signal_ts = 0

    # 24h cooldown — funding events are exactly 8h apart, so 8h cooldown
    # is bypassed every event (8h - 8h = 0, which is not < 8h). Use 24h.
    COOLDOWN_MS = 24 * 3600 * 1000

    for fr_event in fr_list:
        fr_ts  = fr_event.get("timestamp")
        fr_val = fr_event.get("fundingRate")
        if fr_ts is None or fr_val is None:
            continue

        # Cooldown check
        if fr_ts - last_signal_ts < COOLDOWN_MS:
            continue

        # Signal logic
        if fr_val >= FR_BULL_MAJOR:
            direction = "SHORT"
        elif fr_val <= -FR_BEAR_MAJOR:
            direction = "LONG"
        else:
            continue

        entry_idx = find_next_candle_idx(fr_ts)
        if entry_idx is None or entry_idx >= len(bars) - 1:
            continue

        entry_price = bar_open[entry_idx]
        if not entry_price or entry_price == 0:
            continue

        # Calculate TP/SL prices
        if direction == "LONG":
            tp_price = entry_price * (1 + TP_PCT)
            sl_price = entry_price * (1 - SL_PCT)
        else:
            tp_price = entry_price * (1 - TP_PCT)
            sl_price = entry_price * (1 + SL_PCT)

        pnl = None
        exit_ts = bar_ts[entry_idx]

        for j in range(entry_idx, min(entry_idx + MAX_HOLD, len(bars))):
            hi = bar_high[j]
            lo = bar_low[j]
            cl = bar_close[j]
            exit_ts = bar_ts[j]
            held = j - entry_idx

            if direction == "LONG":
                if lo <= sl_price:
                    raw_pnl = -SL_PCT * LEVERAGE
                    pnl = raw_pnl - FEE_COST
                    break
                elif hi >= tp_price:
                    raw_pnl = TP_PCT * LEVERAGE
                    pnl = raw_pnl - FEE_COST
                    break
                elif held >= MAX_HOLD - 1:
                    raw_pnl = (cl - entry_price) / entry_price * LEVERAGE
                    pnl = raw_pnl - FEE_COST
                    break
            else:  # SHORT
                if hi >= sl_price:
                    raw_pnl = -SL_PCT * LEVERAGE
                    pnl = raw_pnl - FEE_COST
                    break
                elif lo <= tp_price:
                    raw_pnl = TP_PCT * LEVERAGE
                    pnl = raw_pnl - FEE_COST
                    break
                elif held >= MAX_HOLD - 1:
                    raw_pnl = (entry_price - cl) / entry_price * LEVERAGE
                    pnl = raw_pnl - FEE_COST
                    break

        if pnl is not None:
            trades.append({
                "symbol": symbol,
                "dir": direction,
                "pnl": pnl,
                "ts": exit_ts,
                "fr": fr_val,
            })
            last_signal_ts = fr_ts

    return trades


def format_results(all_trades, label="COMBINED"):
    if not all_trades:
        return f"{label}: 0 trades"
    n = len(all_trades)
    wins = sum(1 for t in all_trades if t["pnl"] > 0)
    wr = wins / n * 100
    avg_pnl = sum(t["pnl"] for t in all_trades) / n * 100
    total_account_pnl = sum(t["pnl"] for t in all_trades) * SIZE_PCT * 100

    monthly = defaultdict(float)
    for t in all_trades:
        dt = datetime.fromtimestamp(t["ts"] / 1000, tz=timezone.utc)
        key = f"{dt.year}-{dt.month:02d}"
        monthly[key] += t["pnl"] * SIZE_PCT * 100

    monthly_avg = sum(monthly.values()) / len(monthly) if monthly else 0

    monthly_str = "  Monthly breakdown:\n"
    for k in sorted(monthly.keys()):
        monthly_str += f"    {k}: {monthly[k]:+.2f}%\n"

    # Count long/short split
    longs  = sum(1 for t in all_trades if t["dir"] == "LONG")
    shorts = sum(1 for t in all_trades if t["dir"] == "SHORT")

    return (
        f"{label}: trades={n} (L={longs}/S={shorts}), WR={wr:.1f}%, "
        f"avg_pnl={avg_pnl:+.3f}% (per trade, 3x lev, fees inc),\n"
        f"  total_account_pnl={total_account_pnl:+.2f}%, monthly_avg={monthly_avg:+.2f}%\n"
        + monthly_str
    )


def main():
    exchange = ccxt.bybit({
        "options": {"defaultType": "linear"},
        "enableRateLimit": True,
    })
    exchange.load_markets()

    all_combined = []

    for sym in SYMBOLS_MAJOR:
        trades = backtest_symbol(exchange, sym)
        print("  " + format_results(trades, sym))
        all_combined.extend(trades)
        tmod.sleep(1.0)

    print()
    print(format_results(all_combined, "COMBINED"))


if __name__ == "__main__":
    print("=== FR EXTREME REVERSAL BACKTEST ===")
    print(f"Params: LEVERAGE={LEVERAGE}, TP={TP_PCT*100:.1f}%, SL={SL_PCT*100:.2f}%, "
          f"SIZE={SIZE_PCT*100:.0f}%, FEE_COST={FEE_COST*100:.4f}%/trade")
    print(f"FR_BULL_MAJOR={FR_BULL_MAJOR} ({FR_BULL_MAJOR*100:.4f}%) SHORT threshold")
    print(f"FR_BEAR_MAJOR={FR_BEAR_MAJOR} ({FR_BEAR_MAJOR*100:.4f}%) LONG threshold (neg)")
    print()
    main()
    print("=== DONE ===")
