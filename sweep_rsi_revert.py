"""RSI mean-revert sweep — buy oversold, sell overbought."""
import sys
sys.path.insert(0, '/home/minus/Desktop/bot grid')
from backtester_sweep_harness import fetch_ohlcv_cached, sweep

LEVERAGE  = 3
TAKER_FEE = 0.00055
FEE_COST  = TAKER_FEE * 2 * LEVERAGE


def _rsi(closes, i, period=14):
    if i < period + 1:
        return 50.0
    prices = closes[max(0, i - period * 3):i + 1]
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


def _atr(highs, lows, closes, i, period=14):
    if i < period:
        return highs[i] - lows[i]
    trs = []
    for j in range(i - period + 1, i + 1):
        if j == 0:
            tr = highs[j] - lows[j]
        else:
            tr = max(highs[j] - lows[j], abs(highs[j] - closes[j-1]), abs(lows[j] - closes[j-1]))
        trs.append(tr)
    return sum(trs) / period


def rsi_backtest(ohlcv, symbol, params):
    rsi_low  = params["RSI_LOW"]
    rsi_high = params["RSI_HIGH"]
    rsi_exit = params["RSI_EXIT"]
    atr_k_sl = params["ATR_K_SL"]
    max_hold = params["MAX_HOLD"]

    if not ohlcv or len(ohlcv) < 50:
        return []

    timestamps = [b[0] for b in ohlcv]
    highs = [b[2] for b in ohlcv]
    lows  = [b[3] for b in ohlcv]
    closes = [b[4] for b in ohlcv]

    trades = []
    in_trade = False
    entry_price = sl_price = 0
    direction = None
    entry_i = 0

    for i in range(20, len(ohlcv) - 1):
        rsi = _rsi(closes, i, 14)
        if in_trade:
            hi, lo, cl = highs[i], lows[i], closes[i]
            held = i - entry_i
            closed = False
            if direction == "LONG":
                if lo <= sl_price:
                    trades.append({"pnl": (sl_price - entry_price)/entry_price * LEVERAGE - FEE_COST, "ts": timestamps[i]})
                    in_trade = False; closed = True
                elif rsi >= rsi_exit:
                    trades.append({"pnl": (cl - entry_price)/entry_price * LEVERAGE - FEE_COST, "ts": timestamps[i]})
                    in_trade = False; closed = True
            else:
                if hi >= sl_price:
                    trades.append({"pnl": (entry_price - sl_price)/entry_price * LEVERAGE - FEE_COST, "ts": timestamps[i]})
                    in_trade = False; closed = True
                elif rsi <= (100 - rsi_exit):
                    trades.append({"pnl": (entry_price - cl)/entry_price * LEVERAGE - FEE_COST, "ts": timestamps[i]})
                    in_trade = False; closed = True
            if not closed and held >= max_hold:
                pnl = (cl - entry_price)/entry_price * LEVERAGE if direction == "LONG" else (entry_price - cl)/entry_price * LEVERAGE
                trades.append({"pnl": pnl - FEE_COST, "ts": timestamps[i]})
                in_trade = False
            continue

        atr = _atr(highs, lows, closes, i)
        if atr <= 0:
            continue
        if rsi <= rsi_low:
            direction = "LONG"
            entry_price = closes[i]
            sl_price = entry_price - atr_k_sl * atr
            in_trade = True
            entry_i = i
        elif rsi >= rsi_high:
            direction = "SHORT"
            entry_price = closes[i]
            sl_price = entry_price + atr_k_sl * atr
            in_trade = True
            entry_i = i

    return trades


if __name__ == "__main__":
    symbols = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
    ohlcv = fetch_ohlcv_cached(symbols, "4h", days=90)
    grid = {
        "RSI_LOW":   [20, 25, 30],
        "RSI_HIGH":  [70, 75, 80],
        "RSI_EXIT":  [50, 55, 60, 65],
        "ATR_K_SL":  [1.5, 2.0, 2.5, 3.0],
        "MAX_HOLD":  [12, 24, 60],
    }
    print(f"\n### RSI mean-revert 4h 90d sweep ###")
    sweep(rsi_backtest, grid, ohlcv, symbols, top_n=8)
