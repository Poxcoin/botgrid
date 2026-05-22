"""Cascade sweep: body threshold × TP/SL × direction (with-trend vs fade)."""
import sys
sys.path.insert(0, '/home/minus/Desktop/bot grid')
from backtester_sweep_harness import fetch_ohlcv_cached, sweep

LEVERAGE  = 5
TAKER_FEE = 0.00055
FEE_COST  = TAKER_FEE * 2 * LEVERAGE


def cascade_backtest(ohlcv, symbol, params):
    body_thresh = params["BODY_THRESH"]
    tp_pct      = params["TP_PCT"]
    sl_pct      = params["SL_PCT"]
    max_hold    = params["MAX_HOLD"]
    direction_mode = params.get("DIRECTION", "with_trend")  # or "fade"

    if not ohlcv or len(ohlcv) < 20:
        return []

    timestamps = [b[0] for b in ohlcv]
    opens  = [b[1] for b in ohlcv]
    highs  = [b[2] for b in ohlcv]
    lows   = [b[3] for b in ohlcv]
    closes = [b[4] for b in ohlcv]

    trades = []
    in_trade = False
    entry_price = 0
    direction = None
    entry_i = 0

    for i in range(0, len(ohlcv) - 2):
        if in_trade:
            hi, lo, cl = highs[i], lows[i], closes[i]
            held = i - entry_i
            closed = False
            if direction == "LONG":
                tp = entry_price * (1 + tp_pct)
                sl = entry_price * (1 - sl_pct)
                if lo <= sl:
                    trades.append({"pnl": -sl_pct * LEVERAGE - FEE_COST, "ts": timestamps[i]})
                    in_trade = False; closed = True
                elif hi >= tp:
                    trades.append({"pnl": tp_pct * LEVERAGE - FEE_COST, "ts": timestamps[i]})
                    in_trade = False; closed = True
            else:
                tp = entry_price * (1 - tp_pct)
                sl = entry_price * (1 + sl_pct)
                if hi >= sl:
                    trades.append({"pnl": -sl_pct * LEVERAGE - FEE_COST, "ts": timestamps[i]})
                    in_trade = False; closed = True
                elif lo <= tp:
                    trades.append({"pnl": tp_pct * LEVERAGE - FEE_COST, "ts": timestamps[i]})
                    in_trade = False; closed = True
            if not closed and held >= max_hold:
                if direction == "LONG":
                    pnl = (cl - entry_price) / entry_price * LEVERAGE - FEE_COST
                else:
                    pnl = (entry_price - cl) / entry_price * LEVERAGE - FEE_COST
                trades.append({"pnl": pnl, "ts": timestamps[i]})
                in_trade = False
            continue

        op = opens[i]
        cl = closes[i]
        if op == 0 or i + 1 >= len(ohlcv):
            continue
        body_pct = abs(cl - op) / op
        if body_pct >= body_thresh:
            in_trade = True
            entry_price = opens[i + 1]
            move_dir = "LONG" if cl > op else "SHORT"
            if direction_mode == "fade":
                direction = "SHORT" if move_dir == "LONG" else "LONG"
            else:
                direction = move_dir
            entry_i = i + 1

    return trades


if __name__ == "__main__":
    symbols = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
    ohlcv = fetch_ohlcv_cached(symbols, "15m", days=90)

    grid = {
        "BODY_THRESH": [0.008, 0.010, 0.012, 0.015, 0.020],
        "TP_PCT":      [0.012, 0.020, 0.030, 0.050],
        "SL_PCT":      [0.004, 0.006, 0.010, 0.015],
        "MAX_HOLD":    [12, 18, 30],
        "DIRECTION":   ["with_trend", "fade"],
    }
    print(f"\n### Cascade 15m 90d sweep ###")
    sweep(cascade_backtest, grid, ohlcv, symbols, top_n=12)
