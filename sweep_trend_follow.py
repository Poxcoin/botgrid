"""EMA cross trend-follow sweep — proven crypto strategy per web research."""
import sys
sys.path.insert(0, '/home/minus/Desktop/bot grid')
from backtester_sweep_harness import fetch_ohlcv_cached, sweep

LEVERAGE  = 3        # lower for trend (positions held longer)
TAKER_FEE = 0.00055
FEE_COST  = TAKER_FEE * 2 * LEVERAGE


def _ema(values, period):
    if len(values) < period:
        return [values[-1]] * len(values)
    k = 2 / (period + 1)
    out = [sum(values[:period]) / period]
    for v in values[period:]:
        out.append(v * k + out[-1] * (1 - k))
    return [out[0]] * (len(values) - len(out)) + out


def _atr(highs, lows, closes, i, period=14):
    if i < period:
        return (highs[i] - lows[i])
    trs = []
    for j in range(i - period + 1, i + 1):
        h, l, pc = highs[j], lows[j], closes[max(j-1, 0)]
        trs.append(max(h-l, abs(h-pc), abs(l-pc)))
    return sum(trs) / period


def trend_backtest(ohlcv, symbol, params):
    fast_period = params["FAST"]
    slow_period = params["SLOW"]
    atr_k_sl    = params["ATR_K_SL"]
    atr_k_tp    = params["ATR_K_TP"]
    max_hold    = params["MAX_HOLD"]

    if not ohlcv or len(ohlcv) < slow_period + 20:
        return []

    timestamps = [b[0] for b in ohlcv]
    opens = [b[1] for b in ohlcv]
    highs = [b[2] for b in ohlcv]
    lows  = [b[3] for b in ohlcv]
    closes = [b[4] for b in ohlcv]

    fast = _ema(closes, fast_period)
    slow = _ema(closes, slow_period)

    trades = []
    in_trade = False
    entry_price = sl_price = tp_price = 0
    direction = None
    entry_i = 0

    for i in range(slow_period + 1, len(ohlcv) - 1):
        if in_trade:
            hi, lo, cl = highs[i], lows[i], closes[i]
            held = i - entry_i
            closed = False
            if direction == "LONG":
                if lo <= sl_price:
                    trades.append({"pnl": (sl_price - entry_price)/entry_price * LEVERAGE - FEE_COST, "ts": timestamps[i]})
                    in_trade = False; closed = True
                elif hi >= tp_price:
                    trades.append({"pnl": (tp_price - entry_price)/entry_price * LEVERAGE - FEE_COST, "ts": timestamps[i]})
                    in_trade = False; closed = True
            else:
                if hi >= sl_price:
                    trades.append({"pnl": (entry_price - sl_price)/entry_price * LEVERAGE - FEE_COST, "ts": timestamps[i]})
                    in_trade = False; closed = True
                elif lo <= tp_price:
                    trades.append({"pnl": (entry_price - tp_price)/entry_price * LEVERAGE - FEE_COST, "ts": timestamps[i]})
                    in_trade = False; closed = True
            if not closed and held >= max_hold:
                pnl = (cl - entry_price)/entry_price * LEVERAGE if direction == "LONG" else (entry_price - cl)/entry_price * LEVERAGE
                trades.append({"pnl": pnl - FEE_COST, "ts": timestamps[i]})
                in_trade = False
            continue

        # Cross detection: fast crosses above slow → LONG, below → SHORT
        crossed_up = fast[i] > slow[i] and fast[i-1] <= slow[i-1]
        crossed_dn = fast[i] < slow[i] and fast[i-1] >= slow[i-1]

        if crossed_up or crossed_dn:
            atr = _atr(highs, lows, closes, i)
            if atr == 0:
                continue
            entry_price = closes[i]
            if crossed_up:
                direction = "LONG"
                sl_price = entry_price - atr_k_sl * atr
                tp_price = entry_price + atr_k_tp * atr
            else:
                direction = "SHORT"
                sl_price = entry_price + atr_k_sl * atr
                tp_price = entry_price - atr_k_tp * atr
            in_trade = True
            entry_i = i

    return trades


if __name__ == "__main__":
    symbols = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
    for tf, days in [("4h", 90), ("1h", 60)]:
        print(f"\n### Trend-follow {tf} {days}d ###")
        ohlcv = fetch_ohlcv_cached(symbols, tf, days=days)
        grid = {
            "FAST":     [9, 12, 20],
            "SLOW":     [21, 34, 50],
            "ATR_K_SL": [1.0, 1.5, 2.0],
            "ATR_K_TP": [2.0, 3.0, 4.0, 5.0],
            "MAX_HOLD": [30, 60, 120],
        }
        sweep(trend_backtest, grid, ohlcv, symbols, top_n=8)
