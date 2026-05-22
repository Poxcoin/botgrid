"""Donchian breakout sweep — buy N-bar highs, sell N-bar lows."""
import sys
sys.path.insert(0, '/home/minus/Desktop/bot grid')
from backtester_sweep_harness import fetch_ohlcv_cached, sweep

LEVERAGE  = 3
TAKER_FEE = 0.00055
FEE_COST  = TAKER_FEE * 2 * LEVERAGE


def _atr(highs, lows, closes, i, period=14):
    if i < period:
        return (highs[i] - lows[i])
    trs = []
    for j in range(i - period + 1, i + 1):
        if j == 0:
            tr = highs[j] - lows[j]
        else:
            tr = max(highs[j] - lows[j], abs(highs[j] - closes[j-1]), abs(lows[j] - closes[j-1]))
        trs.append(tr)
    return sum(trs) / period


def breakout_backtest(ohlcv, symbol, params):
    lookback   = params["LOOKBACK"]
    atr_k_sl   = params["ATR_K_SL"]
    atr_k_tp   = params["ATR_K_TP"]
    max_hold   = params["MAX_HOLD"]
    use_ema    = params.get("USE_EMA_FILTER", False)

    if not ohlcv or len(ohlcv) < lookback + 50:
        return []

    timestamps = [b[0] for b in ohlcv]
    highs = [b[2] for b in ohlcv]
    lows  = [b[3] for b in ohlcv]
    closes = [b[4] for b in ohlcv]

    # Simple EMA50 for trend filter
    ema50 = None
    if use_ema:
        k = 2 / (50 + 1)
        ema50 = [sum(closes[:50]) / 50]
        for v in closes[50:]:
            ema50.append(v * k + ema50[-1] * (1 - k))
        ema50 = [ema50[0]] * (len(closes) - len(ema50)) + ema50

    trades = []
    in_trade = False
    entry_price = sl_price = tp_price = 0
    direction = None
    entry_i = 0

    for i in range(lookback + 1, len(ohlcv) - 1):
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

        # Donchian breakout
        window_hi = max(highs[i - lookback: i])
        window_lo = min(lows[i - lookback: i])
        atr = _atr(highs, lows, closes, i, 14)
        if atr <= 0:
            continue

        long_break = closes[i] > window_hi
        short_break = closes[i] < window_lo

        if use_ema:
            if long_break and closes[i] < ema50[i]:
                continue
            if short_break and closes[i] > ema50[i]:
                continue

        if long_break:
            direction = "LONG"
            entry_price = closes[i]
            sl_price = entry_price - atr_k_sl * atr
            tp_price = entry_price + atr_k_tp * atr
            in_trade = True
            entry_i = i
        elif short_break:
            direction = "SHORT"
            entry_price = closes[i]
            sl_price = entry_price + atr_k_sl * atr
            tp_price = entry_price - atr_k_tp * atr
            in_trade = True
            entry_i = i

    return trades


if __name__ == "__main__":
    symbols = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
    print(f"\n### Breakout (Donchian) 4h 90d sweep ###")
    ohlcv = fetch_ohlcv_cached(symbols, "4h", days=90)
    grid = {
        "LOOKBACK":       [10, 20, 30, 50],
        "ATR_K_SL":       [1.0, 1.5, 2.0],
        "ATR_K_TP":       [2.0, 3.0, 4.0, 5.0],
        "MAX_HOLD":       [30, 60],
        "USE_EMA_FILTER": [True, False],
    }
    sweep(breakout_backtest, grid, ohlcv, symbols, top_n=8)
