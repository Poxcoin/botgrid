"""Sweep OB parameters: TP_RATIO × MIN_OB_BODY × EMA200_filter × TF."""
import sys
sys.path.insert(0, '/home/minus/Desktop/bot grid')
from backtester_sweep_harness import fetch_ohlcv_cached, sweep

# OB detection constants
OB_LOOKBACK     = 50
BOS_WINDOW      = 5
LEVERAGE        = 5
SL_BUFFER       = 0.002
MAX_HOLD        = 30
SIZE_PCT        = 0.40
TAKER_FEE       = 0.00055
FEE_COST        = TAKER_FEE * 2 * LEVERAGE


def _ema(values, period):
    if len(values) < period:
        return [values[-1]] * len(values)
    k = 2 / (period + 1)
    out = [sum(values[:period]) / period]
    for v in values[period:]:
        out.append(v * k + out[-1] * (1 - k))
    # pad front
    return [out[0]] * (len(values) - len(out)) + out


def _find_ob(opens, highs, lows, closes, anchor_i, bos_min_pct, min_ob_body_pct):
    start = max(0, anchor_i - OB_LOOKBACK)
    ob_long = None
    ob_short = None
    for i in range(start, anchor_i - BOS_WINDOW):
        body = abs(closes[i] - opens[i])
        if body / opens[i] < min_ob_body_pct:
            continue
        bearish = closes[i] < opens[i]
        bullish = closes[i] > opens[i]
        if bearish:
            ref_high = max(highs[i + 1: i + 1 + BOS_WINDOW]) if i + 1 < anchor_i else 0
            if ref_high == 0:
                continue
            bos_pct = (ref_high - highs[i]) / highs[i]
            if bos_pct < bos_min_pct:
                continue
            ob_low = lows[i]
            broken = any(closes[j] < ob_low for j in range(i + 1, anchor_i + 1))
            if not broken:
                ob_long = {"ob_low": ob_low, "ob_high": highs[i]}
        elif bullish:
            ref_low = min(lows[i + 1: i + 1 + BOS_WINDOW]) if i + 1 < anchor_i else 0
            if ref_low == 0:
                continue
            bos_pct = (lows[i] - ref_low) / lows[i]
            if bos_pct < bos_min_pct:
                continue
            ob_high = highs[i]
            broken = any(closes[j] > ob_high for j in range(i + 1, anchor_i + 1))
            if not broken:
                ob_short = {"ob_low": lows[i], "ob_high": ob_high}
    return ob_long, ob_short


def ob_backtest(ohlcv, symbol, params):
    tp_ratio        = params["TP_RATIO"]
    bos_min_pct     = params["BOS_MIN_PCT"]
    min_ob_body_pct = params["MIN_OB_BODY_PCT"]
    use_ema200      = params.get("USE_EMA200", False)

    if not ohlcv or len(ohlcv) < OB_LOOKBACK + 10:
        return []

    timestamps = [b[0] for b in ohlcv]
    opens  = [b[1] for b in ohlcv]
    highs  = [b[2] for b in ohlcv]
    lows   = [b[3] for b in ohlcv]
    closes = [b[4] for b in ohlcv]

    ema200 = _ema(closes, 200) if use_ema200 else None

    trades = []
    in_trade = False
    entry_price = 0
    direction = None
    entry_i = 0
    sl_price_held = tp_price_held = 0

    for i in range(OB_LOOKBACK, len(ohlcv) - 1):
        if in_trade:
            hi, lo, cl = highs[i], lows[i], closes[i]
            held = i - entry_i
            closed = False
            if direction == "LONG":
                if lo <= sl_price_held:
                    pnl = -(entry_price - sl_price_held) / entry_price * LEVERAGE - FEE_COST
                    trades.append({"pnl": pnl, "ts": timestamps[i], "exit": "SL"})
                    in_trade = False; closed = True
                elif hi >= tp_price_held:
                    pnl = (tp_price_held - entry_price) / entry_price * LEVERAGE - FEE_COST
                    trades.append({"pnl": pnl, "ts": timestamps[i], "exit": "TP"})
                    in_trade = False; closed = True
            else:
                if hi >= sl_price_held:
                    pnl = -(sl_price_held - entry_price) / entry_price * LEVERAGE - FEE_COST
                    trades.append({"pnl": pnl, "ts": timestamps[i], "exit": "SL"})
                    in_trade = False; closed = True
                elif lo <= tp_price_held:
                    pnl = (entry_price - tp_price_held) / entry_price * LEVERAGE - FEE_COST
                    trades.append({"pnl": pnl, "ts": timestamps[i], "exit": "TP"})
                    in_trade = False; closed = True
            if not closed and held >= MAX_HOLD:
                if direction == "LONG":
                    pnl = (cl - entry_price) / entry_price * LEVERAGE - FEE_COST
                else:
                    pnl = (entry_price - cl) / entry_price * LEVERAGE - FEE_COST
                trades.append({"pnl": pnl, "ts": timestamps[i], "exit": "TIME"})
                in_trade = False
            continue

        ob_long, ob_short = _find_ob(opens, highs, lows, closes, i,
                                      bos_min_pct, min_ob_body_pct)
        price = closes[i]

        for direc, ob in (("LONG", ob_long), ("SHORT", ob_short)):
            if ob is None:
                continue
            # EMA200 trend filter: LONG only above EMA, SHORT only below
            if use_ema200:
                if direc == "LONG" and price < ema200[i]:
                    continue
                if direc == "SHORT" and price > ema200[i]:
                    continue
            if not (ob["ob_low"] <= price <= ob["ob_high"]):
                continue
            if direc == "LONG":
                sl_price = ob["ob_low"] * (1.0 - SL_BUFFER)
                sl_dist = price - sl_price
                tp_price = price + sl_dist * tp_ratio
            else:
                sl_price = ob["ob_high"] * (1.0 + SL_BUFFER)
                sl_dist = sl_price - price
                tp_price = price - sl_dist * tp_ratio
            if sl_dist <= 0:
                continue
            tp_pct = abs(tp_price - price) / price * 100
            if tp_pct < 0.5:
                continue
            in_trade = True
            direction = direc
            entry_price = price
            entry_i = i
            sl_price_held = sl_price
            tp_price_held = tp_price
            break

    return trades


if __name__ == "__main__":
    symbols = ["BTC/USDT:USDT", "ETH/USDT:USDT"]
    print("\n### Fetching OHLCV for 4h timeframe ###")
    ohlcv_4h = fetch_ohlcv_cached(symbols, "4h", days=90)

    grid = {
        "TP_RATIO":        [1.5, 2.0, 2.5, 3.0, 4.0],
        "BOS_MIN_PCT":     [0.02, 0.025, 0.035],
        "MIN_OB_BODY_PCT": [0.002, 0.003, 0.005],
        "USE_EMA200":      [True, False],
    }
    print("\n### 4h sweep ###")
    sweep(ob_backtest, grid, ohlcv_4h, symbols, top_n=8)

    print("\n### Fetching OHLCV for 8h timeframe ###")
    ohlcv_8h = fetch_ohlcv_cached(symbols, "8h", days=90)
    print("\n### 8h sweep ###")
    sweep(ob_backtest, grid, ohlcv_8h, symbols, top_n=8)

# 30d focused re-run on top candidates
def _run_30d():
    print("\n\n### 30d focused re-run (post-fix regime check) ###")
    ohlcv_4h_30d = fetch_ohlcv_cached(["BTC/USDT:USDT", "ETH/USDT:USDT"], "4h", days=30)
    grid_focused = {
        "TP_RATIO":        [2.0, 2.5, 3.0, 4.0],
        "BOS_MIN_PCT":     [0.025, 0.035, 0.05],
        "MIN_OB_BODY_PCT": [0.002, 0.003],
        "USE_EMA200":      [True, False],
    }
    sweep(ob_backtest, grid_focused, ohlcv_4h_30d,
          ["BTC/USDT:USDT", "ETH/USDT:USDT"], top_n=10)


_run_30d()
