"""Orderflow sweep: VWAP_DEV × RSI thresholds × TP/SL × EMA200 trend filter."""
import sys
sys.path.insert(0, '/home/minus/Desktop/bot grid')
from backtester_sweep_harness import fetch_ohlcv_cached, sweep

LEVERAGE  = 5
TAKER_FEE = 0.00055
FEE_COST  = TAKER_FEE * 2 * LEVERAGE
MAX_HOLD  = 12


def _ema(values, period):
    if len(values) < period:
        return [values[-1]] * len(values)
    k = 2 / (period + 1)
    out = [sum(values[:period]) / period]
    for v in values[period:]:
        out.append(v * k + out[-1] * (1 - k))
    return [out[0]] * (len(values) - len(out)) + out


def _rsi(closes, i, period=14):
    if i < period + 1:
        return 50.0
    prices = closes[max(0, i - period * 3): i + 1]
    if len(prices) < period + 1:
        return 50.0
    gains, losses = [], []
    for j in range(1, len(prices)):
        d = prices[j] - prices[j - 1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
    avg_g = sum(gains[:period]) / period
    avg_l = sum(losses[:period]) / period
    for j in range(period, len(gains)):
        avg_g = (avg_g * (period - 1) + gains[j]) / period
        avg_l = (avg_l * (period - 1) + losses[j]) / period
    if avg_l == 0:
        return 100.0
    rs = avg_g / avg_l
    return 100 - 100 / (1 + rs)


def _rolling_vwap(closes, vols, i, window):
    start = max(0, i - window + 1)
    cv = sum(closes[j] * vols[j] for j in range(start, i + 1))
    sv = sum(vols[j] for j in range(start, i + 1))
    return cv / sv if sv > 0 else closes[i]


def of_backtest(ohlcv, symbol, params):
    vwap_dev_min = params["VWAP_DEV_MIN"]
    vwap_dev_max = params["VWAP_DEV_MAX"]
    rsi_long_max = params["RSI_LONG_MAX"]
    rsi_short_min = params["RSI_SHORT_MIN"]
    tp_pct = params["TP_PCT"]
    sl_pct = params["SL_PCT"]
    use_ema200 = params.get("USE_EMA200", False)
    direction_mode = params.get("DIRECTION", "mean_revert")  # or "trend_follow"
    vwap_window = 24
    warmup = 50

    if not ohlcv or len(ohlcv) < warmup + 10:
        return []

    timestamps = [b[0] for b in ohlcv]
    closes = [b[4] for b in ohlcv]
    highs = [b[2] for b in ohlcv]
    lows = [b[3] for b in ohlcv]
    vols = [b[5] for b in ohlcv]
    ema200 = _ema(closes, 200) if use_ema200 else None

    trades = []
    in_trade = False
    direction = None
    entry_price = 0
    entry_i = 0

    for i in range(warmup, len(ohlcv) - 1):
        if in_trade:
            hi, lo, cl = highs[i], lows[i], closes[i]
            held = i - entry_i
            closed = False
            if direction == "LONG":
                tp_price = entry_price * (1 + tp_pct)
                sl_price = entry_price * (1 - sl_pct)
                if lo <= sl_price:
                    trades.append({"pnl": -sl_pct * LEVERAGE - FEE_COST, "ts": timestamps[i]})
                    in_trade = False; closed = True
                elif hi >= tp_price:
                    trades.append({"pnl": tp_pct * LEVERAGE - FEE_COST, "ts": timestamps[i]})
                    in_trade = False; closed = True
            else:
                tp_price = entry_price * (1 - tp_pct)
                sl_price = entry_price * (1 + sl_pct)
                if hi >= sl_price:
                    trades.append({"pnl": -sl_pct * LEVERAGE - FEE_COST, "ts": timestamps[i]})
                    in_trade = False; closed = True
                elif lo <= tp_price:
                    trades.append({"pnl": tp_pct * LEVERAGE - FEE_COST, "ts": timestamps[i]})
                    in_trade = False; closed = True
            if not closed and held >= MAX_HOLD:
                if direction == "LONG":
                    pnl = (cl - entry_price) / entry_price * LEVERAGE - FEE_COST
                else:
                    pnl = (entry_price - cl) / entry_price * LEVERAGE - FEE_COST
                trades.append({"pnl": pnl, "ts": timestamps[i]})
                in_trade = False
            continue

        vwap = _rolling_vwap(closes, vols, i, vwap_window)
        dev = (closes[i] - vwap) / vwap * 100
        rsi = _rsi(closes, i, 14)

        # Mean-revert: below VWAP + oversold → LONG (bounce expected)
        # Trend-follow: below VWAP + oversold → SHORT (continuation expected)
        long_setup  = (dev <= -vwap_dev_min and abs(dev) <= vwap_dev_max and rsi <= rsi_long_max)
        short_setup = (dev >= vwap_dev_min and abs(dev) <= vwap_dev_max and rsi >= rsi_short_min)

        intended_long = "LONG" if direction_mode == "mean_revert" else "SHORT"
        intended_short = "SHORT" if direction_mode == "mean_revert" else "LONG"

        if long_setup:
            d = intended_long
            if use_ema200 and ((d == "LONG" and closes[i] < ema200[i]) or
                               (d == "SHORT" and closes[i] > ema200[i])):
                continue
            in_trade = True; direction = d; entry_price = closes[i]; entry_i = i
        elif short_setup:
            d = intended_short
            if use_ema200 and ((d == "LONG" and closes[i] < ema200[i]) or
                               (d == "SHORT" and closes[i] > ema200[i])):
                continue
            in_trade = True; direction = d; entry_price = closes[i]; entry_i = i

    return trades


if __name__ == "__main__":
    symbols = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
    ohlcv = fetch_ohlcv_cached(symbols, "4h", days=90)

    grid = {
        "VWAP_DEV_MIN":  [0.3, 0.4, 0.6, 1.0],
        "VWAP_DEV_MAX":  [3.0],
        "RSI_LONG_MAX":  [30, 35, 40],
        "RSI_SHORT_MIN": [60, 65, 70],
        "TP_PCT":        [0.012, 0.015, 0.025, 0.04],
        "SL_PCT":        [0.008, 0.010, 0.015],
        "USE_EMA200":    [True, False],
        "DIRECTION":     ["mean_revert", "trend_follow"],
    }
    print(f"\n### Orderflow 4h 90d sweep ({len(symbols)} symbols) ###")
    sweep(of_backtest, grid, ohlcv, symbols, top_n=10)
