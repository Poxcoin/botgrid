import sys
sys.path.insert(0, '/home/minus/Desktop/bot grid')
from backtester_sweep_harness import fetch_ohlcv_cached, sweep
from sweep_trend_follow import trend_backtest

symbols = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
ohlcv = fetch_ohlcv_cached(symbols, "4h", days=30)
grid = {
    "FAST":     [9, 12, 20],
    "SLOW":     [21, 34, 50],
    "ATR_K_SL": [1.5, 2.0, 2.5],
    "ATR_K_TP": [2.0, 3.0, 4.0],
    "MAX_HOLD": [30, 60, 120],
}
sweep(trend_backtest, grid, ohlcv, symbols, top_n=8)
