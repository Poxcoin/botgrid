"""
backtest_ob.py — Order Block (SMC) Backtest
4h OHLCV, 90 days, BTC/ETH/SOL via Bybit
Fees included: 0.11% round trip
"""
import ccxt
import time as tmod
from datetime import datetime, timezone
from collections import defaultdict

SYMBOLS = ["BTC/USDT:USDT", "SOL/USDT:USDT"]
TIMEFRAME = "4h"
DAYS = 90

LEVERAGE        = 5
TP_RATIO        = 3.0      # 3:1 R:R → break-even at 25% WR at 5x
SL_BUFFER       = 0.002    # 0.2% beyond OB edge
SIZE_PCT        = 0.20
MAX_HOLD        = 12       # 12×4h = 48h timeout
COOLDOWN_BARS   = 12       # bars equivalent of cooldown

BOS_MIN_PCT     = 0.025    # 2.5% BOS required (was 1.5% — too many weak signals)
BOS_WINDOW      = 5
MIN_OB_BODY_PCT = 0.003    # OB candle ≥0.3% body (was 0.1% — filter weak OBs)
EMA_FILTER      = 200      # only trade in EMA200 direction

TAKER_FEE = 0.00055
FEE_COST  = TAKER_FEE * 2 * LEVERAGE  # per trade cost fraction


def _calc_ema(prices: list, period: int) -> float:
    if len(prices) < period:
        return prices[-1] if prices else 0.0
    k = 2.0 / (period + 1)
    ema = sum(prices[:period]) / period
    for p in prices[period:]:
        ema = p * k + ema * (1 - k)
    return ema


def _find_order_blocks(ohlcv):
    """Returns (ob_long, ob_short) - most recent unbroken OBs"""
    candles = ohlcv[-50:] if len(ohlcv) >= 50 else ohlcv
    n = len(candles)
    ob_long = ob_short = None

    for i in range(n - BOS_WINDOW - 1):
        o, h, l, c = candles[i][1], candles[i][2], candles[i][3], candles[i][4]
        body_pct = abs(c - o) / o
        if body_pct < MIN_OB_BODY_PCT:
            continue

        future_closes = [candles[j][4] for j in range(i+1, min(i+1+BOS_WINDOW, n))]
        if not future_closes:
            continue

        if c < o:  # bearish → OB_LONG
            bos_pct = (max(future_closes) - h) / h
            if bos_pct >= BOS_MIN_PCT:
                subsequent = [candles[j][4] for j in range(i+1, n)]
                if all(cl >= l for cl in subsequent):
                    ob_long = {"ob_high": h, "ob_low": l, "ob_mid": (h+l)/2}

        if c > o:  # bullish → OB_SHORT
            bos_pct = (l - min(future_closes)) / l
            if bos_pct >= BOS_MIN_PCT:
                subsequent = [candles[j][4] for j in range(i+1, n)]
                if all(cl <= h for cl in subsequent):
                    ob_short = {"ob_high": h, "ob_low": l, "ob_mid": (h+l)/2}

    return ob_long, ob_short


def fetch_ohlcv(exchange, symbol):
    """Fetch 4h candles covering 90 days + 50-candle warmup."""
    # 90 days * 6 candles/day = 540 candles + 50 warmup = 590
    # Add extra buffer, fetch in chunks
    candles_needed = DAYS * 6 + 80
    timeframe_ms = 4 * 3600 * 1000
    end_ts = int(tmod.time() * 1000)
    start_ts = end_ts - (candles_needed * timeframe_ms)

    all_bars = []
    current_since = start_ts
    chunk = 200

    while True:
        try:
            bars = exchange.fetch_ohlcv(
                symbol, TIMEFRAME, since=current_since, limit=chunk,
                params={"category": "linear"}
            )
        except Exception as e:
            print(f"  ERROR fetching {symbol}: {e}")
            break
        if not bars:
            break
        all_bars.extend(bars)
        current_since = bars[-1][0] + timeframe_ms
        if current_since >= end_ts:
            break
        if len(bars) < chunk:
            break
        tmod.sleep(0.3)

    # Deduplicate and sort
    seen = set()
    unique = []
    for b in all_bars:
        if b[0] not in seen:
            seen.add(b[0])
            unique.append(b)
    unique.sort(key=lambda x: x[0])
    return unique


def backtest_symbol(exchange, symbol):
    print(f"  Fetching {symbol} 4h ({DAYS}d + warmup) ...")
    bars = fetch_ohlcv(exchange, symbol)

    if len(bars) < 60:
        print(f"  Not enough data for {symbol}: {len(bars)} bars")
        return []

    print(f"  Got {len(bars)} candles for {symbol}")

    trades = []
    last_trade_bar = -COOLDOWN_BARS - 1  # no cooldown at start

    # Use warmup of 50 candles; scan from bar 50 onward
    warmup = 50

    for i in range(warmup, len(bars) - 1):
        # Cooldown check
        if i - last_trade_bar < COOLDOWN_BARS:
            continue

        # Build lookback window up to and including bar i
        window = bars[:i+1]

        ob_long, ob_short = _find_order_blocks(window)

        price = bars[i][4]  # current close
        ts = bars[i][0]

        closes_so_far = [bars[j][4] for j in range(i + 1)]
        ema200 = _calc_ema(closes_so_far, EMA_FILTER)

        for direction, ob in (("LONG", ob_long), ("SHORT", ob_short)):
            if ob is None:
                continue

            # EMA200 trend filter — only trade in trend direction
            if direction == "LONG" and price < ema200:
                continue
            if direction == "SHORT" and price > ema200:
                continue

            # Entry condition: price inside OB zone
            if not (ob["ob_low"] <= price <= ob["ob_high"]):
                continue

            # Calculate SL/TP
            if direction == "LONG":
                sl_price = ob["ob_low"] * (1.0 - SL_BUFFER)
                sl_dist = price - sl_price
                tp_price = price + sl_dist * TP_RATIO
            else:
                sl_price = ob["ob_high"] * (1.0 + SL_BUFFER)
                sl_dist = sl_price - price
                tp_price = price - sl_dist * TP_RATIO

            if sl_dist <= 0:
                continue

            sl_pct = sl_dist / price
            tp_pct = abs(tp_price - price) / price

            if tp_pct < 0.005:  # < 0.5%
                continue

            # Simulate trade from next candle (i+1)
            entry_price = bars[i+1][1]  # next candle open
            if not entry_price or entry_price == 0:
                continue

            # Recompute SL/TP from actual entry
            if direction == "LONG":
                actual_sl = ob["ob_low"] * (1.0 - SL_BUFFER)
                actual_tp = entry_price + (entry_price - actual_sl) * TP_RATIO
            else:
                actual_sl = ob["ob_high"] * (1.0 + SL_BUFFER)
                actual_tp = entry_price - (actual_sl - entry_price) * TP_RATIO

            pnl = None
            exit_ts = ts

            # Walk forward candles to find exit
            for j in range(i + 1, min(i + 1 + MAX_HOLD, len(bars))):
                hi = bars[j][2]
                lo = bars[j][3]
                cl = bars[j][4]
                exit_ts = bars[j][0]
                held = j - (i + 1)

                if direction == "LONG":
                    if lo <= actual_sl:
                        raw_pnl = (actual_sl - entry_price) / entry_price * LEVERAGE
                        pnl = raw_pnl - FEE_COST
                        break
                    elif hi >= actual_tp:
                        raw_pnl = (actual_tp - entry_price) / entry_price * LEVERAGE
                        pnl = raw_pnl - FEE_COST
                        break
                    elif held >= MAX_HOLD - 1:
                        raw_pnl = (cl - entry_price) / entry_price * LEVERAGE
                        pnl = raw_pnl - FEE_COST
                        break
                else:  # SHORT
                    if hi >= actual_sl:
                        raw_pnl = (entry_price - actual_sl) / entry_price * LEVERAGE
                        pnl = raw_pnl - FEE_COST
                        break
                    elif lo <= actual_tp:
                        raw_pnl = (entry_price - actual_tp) / entry_price * LEVERAGE
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
                })
                last_trade_bar = i
                # Only one direction per bar
                break

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

    return (
        f"{label}: trades={n}, WR={wr:.1f}%, avg_pnl={avg_pnl:+.3f}% (per trade, 3x lev, fees inc),\n"
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

    for sym in SYMBOLS:
        trades = backtest_symbol(exchange, sym)
        print("  " + format_results(trades, sym))
        all_combined.extend(trades)
        tmod.sleep(1.0)

    print()
    print(format_results(all_combined, "COMBINED"))


if __name__ == "__main__":
    print("=== ORDER BLOCK (SMC) BACKTEST ===")
    print(f"Params: LEVERAGE={LEVERAGE}, TP_RATIO={TP_RATIO}, SL_BUFFER={SL_BUFFER*100:.2f}%, "
          f"SIZE_PCT={SIZE_PCT*100:.0f}%, FEE_COST={FEE_COST*100:.4f}%/trade")
    print(f"BOS_MIN_PCT={BOS_MIN_PCT*100:.1f}%, BOS_WINDOW={BOS_WINDOW}, MAX_HOLD={MAX_HOLD} candles")
    print()
    main()
    print("=== DONE ===")
