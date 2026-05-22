"""
backtester_orderblock.py — Order Block (SMC) bot backtest

Mirrors orderblock_bot.py logic:
  Find OB candle (last bearish before ≥BOS_MIN_PCT bullish break-of-structure,
  vice versa). When price retraces into OB zone, enter trade.

SL = OB far edge × (1 ± SL_BUFFER).
TP = entry ± sl_distance × TP_RATIO.

Tests TWO variants side-by-side:
  A: original static SL buffer (0.2%)
  B: ATR-adaptive SL (max of static, 1.5 × ATR(14, 4h))

Period: 90 days, 4h, BTC/ETH/SOL. Fees included.
"""
import ccxt
import time
from collections import defaultdict
from datetime import datetime, timezone

SYMBOLS  = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
TF       = "4h"
DAYS     = int(__import__("os").getenv("BT_DAYS", 90))
CANDLES  = int(DAYS * 24 / 4) + 60

# OB detection (mirror prod)
OB_LOOKBACK     = 50
BOS_MIN_PCT     = 0.025
BOS_WINDOW      = 5
MIN_OB_BODY_PCT = 0.003

# Trade params
LEVERAGE  = 5
SL_BUFFER = 0.002        # 0.2% beyond OB far edge
TP_RATIO  = 3.0          # 3:1 R:R
MAX_HOLD  = 30           # 30 × 4h = 5 days max
SIZE_PCT  = 0.40

TAKER_FEE = 0.00055
FEE_COST  = TAKER_FEE * 2 * LEVERAGE

# ATR settings for Variant B
ATR_PERIOD = 14
ATR_K      = 1.5


def _atr_pct(highs, lows, closes, i, period=14):
    """ATR(period) ending at i, as % of close[i]."""
    if i < period:
        return 0.0
    trs = []
    for j in range(i - period + 1, i + 1):
        if j == 0:
            tr = highs[j] - lows[j]
        else:
            tr = max(highs[j] - lows[j],
                     abs(highs[j] - closes[j - 1]),
                     abs(lows[j]  - closes[j - 1]))
        trs.append(tr)
    atr = sum(trs) / period
    return (atr / closes[i]) * 100 if closes[i] > 0 else 0.0


def _find_ob(opens, highs, lows, closes, anchor_i):
    """
    Scan candles up to anchor_i to find most recent unbroken OB.
    Returns (ob_long_dict, ob_short_dict) — each is None if no valid OB.

    ob_long: last bearish candle before a ≥BOS_MIN_PCT upward BOS that
             remains unbroken below ob_low through anchor_i.
    """
    start = max(0, anchor_i - OB_LOOKBACK)
    ob_long = None
    ob_short = None

    for i in range(start, anchor_i - BOS_WINDOW):
        body = abs(closes[i] - opens[i])
        if body / opens[i] < MIN_OB_BODY_PCT:
            continue

        bearish = closes[i] < opens[i]
        bullish = closes[i] > opens[i]

        if bearish:
            # Look for upward BOS within BOS_WINDOW
            ref_high = max(highs[i + 1: i + 1 + BOS_WINDOW]) if i + 1 < anchor_i else 0
            if ref_high == 0:
                continue
            bos_pct = (ref_high - highs[i]) / highs[i]
            if bos_pct < BOS_MIN_PCT:
                continue
            # Check unbroken: no close below ob_low (=low[i]) after BOS
            ob_low = lows[i]
            broken = any(closes[j] < ob_low for j in range(i + 1, anchor_i + 1))
            if not broken:
                ob_long = {"ob_low": ob_low, "ob_high": highs[i], "ob_idx": i, "bos_pct": bos_pct * 100}

        elif bullish:
            ref_low = min(lows[i + 1: i + 1 + BOS_WINDOW]) if i + 1 < anchor_i else 0
            if ref_low == 0:
                continue
            bos_pct = (lows[i] - ref_low) / lows[i]
            if bos_pct < BOS_MIN_PCT:
                continue
            ob_high = highs[i]
            broken = any(closes[j] > ob_high for j in range(i + 1, anchor_i + 1))
            if not broken:
                ob_short = {"ob_low": lows[i], "ob_high": ob_high, "ob_idx": i, "bos_pct": bos_pct * 100}

    return ob_long, ob_short


def _calc_params(ob, direction, price, atr_pct_val=0.0):
    """Compute sl_pct, tp_pct, sl_price (with optional ATR floor)."""
    if direction == "LONG":
        if not (ob["ob_low"] <= price <= ob["ob_high"]):
            return None
        sl_price = ob["ob_low"] * (1.0 - SL_BUFFER)
        sl_dist  = price - sl_price
    else:
        if not (ob["ob_low"] <= price <= ob["ob_high"]):
            return None
        sl_price = ob["ob_high"] * (1.0 + SL_BUFFER)
        sl_dist  = sl_price - price

    if sl_dist <= 0:
        return None

    sl_pct = sl_dist / price * 100

    # ATR floor (Variant B)
    if atr_pct_val > 0:
        atr_floor = ATR_K * atr_pct_val
        if atr_floor > sl_pct:
            sl_pct  = atr_floor
            sl_dist = price * sl_pct / 100
            sl_price = price - sl_dist if direction == "LONG" else price + sl_dist

    tp_dist = sl_dist * TP_RATIO
    if direction == "LONG":
        tp_price = price + tp_dist
    else:
        tp_price = price - tp_dist
    tp_pct = tp_dist / price * 100

    if tp_pct < 0.5:
        return None

    return {"sl_pct": sl_pct, "tp_pct": tp_pct, "sl_price": sl_price, "tp_price": tp_price}


def backtest_symbol(exchange, symbol, variant_b=False):
    """Run backtest for one symbol. variant_b=True uses ATR-adaptive SL."""
    print(f"  Fetching {symbol} {TF} ({DAYS}d) ...")
    bars = []
    since = int((datetime.now(timezone.utc).timestamp() - DAYS * 86400) * 1000)
    while True:
        batch = exchange.fetch_ohlcv(symbol, TF, since=since, limit=1000)
        if not batch:
            break
        bars.extend(batch)
        since = batch[-1][0] + 1
        if len(batch) < 1000:
            break
        time.sleep(0.1)

    if len(bars) < OB_LOOKBACK + 10:
        return []

    timestamps = [b[0] for b in bars]
    opens  = [b[1] for b in bars]
    highs  = [b[2] for b in bars]
    lows   = [b[3] for b in bars]
    closes = [b[4] for b in bars]

    trades = []
    in_trade = False
    entry_price = 0
    direction = None
    entry_i = 0
    sl_price_held = tp_price_held = 0

    for i in range(OB_LOOKBACK, len(bars) - 1):
        if in_trade:
            hi = highs[i]
            lo = lows[i]
            cl = closes[i]
            held = i - entry_i
            closed_this_bar = False

            if direction == "LONG":
                if lo <= sl_price_held:
                    pnl = -(entry_price - sl_price_held) / entry_price * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": direction, "pnl": pnl, "ts": timestamps[i], "exit": "SL"})
                    in_trade = False
                    closed_this_bar = True
                elif hi >= tp_price_held:
                    pnl = (tp_price_held - entry_price) / entry_price * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": direction, "pnl": pnl, "ts": timestamps[i], "exit": "TP"})
                    in_trade = False
                    closed_this_bar = True
            else:
                if hi >= sl_price_held:
                    pnl = -(sl_price_held - entry_price) / entry_price * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": direction, "pnl": pnl, "ts": timestamps[i], "exit": "SL"})
                    in_trade = False
                    closed_this_bar = True
                elif lo <= tp_price_held:
                    pnl = (entry_price - tp_price_held) / entry_price * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": direction, "pnl": pnl, "ts": timestamps[i], "exit": "TP"})
                    in_trade = False
                    closed_this_bar = True

            if not closed_this_bar and held >= MAX_HOLD:
                if direction == "LONG":
                    pnl = (cl - entry_price) / entry_price * LEVERAGE - FEE_COST
                else:
                    pnl = (entry_price - cl) / entry_price * LEVERAGE - FEE_COST
                trades.append({"symbol": symbol, "dir": direction, "pnl": pnl, "ts": timestamps[i], "exit": "TIME"})
                in_trade = False
            continue

        # Look for OB + entry
        ob_long, ob_short = _find_ob(opens, highs, lows, closes, i)
        price = closes[i]
        atr_p = _atr_pct(highs, lows, closes, i, ATR_PERIOD) if variant_b else 0.0

        for direc, ob in (("LONG", ob_long), ("SHORT", ob_short)):
            if ob is None:
                continue
            params = _calc_params(ob, direc, price, atr_p)
            if params is None:
                continue
            in_trade = True
            direction = direc
            entry_price = price
            entry_i = i
            sl_price_held = params["sl_price"]
            tp_price_held = params["tp_price"]
            break

    return trades


def format_results(trades, label):
    if not trades:
        return f"{label}: 0 trades"
    n = len(trades)
    wins = [t for t in trades if t["pnl"] > 0]
    losses = [t for t in trades if t["pnl"] < 0]
    wr = len(wins) * 100.0 / n
    avg_pnl = sum(t["pnl"] for t in trades) / n * 100
    total_pnl = sum(t["pnl"] for t in trades) * SIZE_PCT * 100

    monthly = defaultdict(float)
    for t in trades:
        dt = datetime.fromtimestamp(t["ts"] / 1000, tz=timezone.utc)
        monthly[f"{dt.year}-{dt.month:02d}"] += t["pnl"] * SIZE_PCT * 100
    monthly_avg = sum(monthly.values()) / len(monthly) if monthly else 0

    exits = defaultdict(int)
    for t in trades:
        exits[t.get("exit", "?")] += 1

    return (f"{label}: n={n}  WR={wr:.1f}%  avg={avg_pnl:+.2f}%(lev)  "
            f"total={total_pnl:+.2f}%(acct)  monthly={monthly_avg:+.2f}%  "
            f"exits={dict(exits)}")


def main():
    ex = ccxt.bybit({"options": {"defaultType": "linear"}, "enableRateLimit": True})

    for variant_label, variant_b in (("A: static SL 0.2%", False),
                                      ("B: ATR-floor 1.5×ATR", True)):
        print(f"\n=== VARIANT {variant_label} ===")
        all_trades = []
        for sym in SYMBOLS:
            t = backtest_symbol(ex, sym, variant_b=variant_b)
            all_trades.extend(t)
            print("  " + format_results(t, sym))
        print()
        print("  " + format_results(all_trades, "COMBINED"))


if __name__ == "__main__":
    main()
