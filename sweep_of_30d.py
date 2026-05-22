"""Orderflow 30d sanity check on top configs."""
import sys
sys.path.insert(0, '/home/minus/Desktop/bot grid')
from backtester_sweep_harness import fetch_ohlcv_cached, sweep
from sweep_orderflow import of_backtest

symbols = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
ohlcv = fetch_ohlcv_cached(symbols, "4h", days=30)
grid = {
    "VWAP_DEV_MIN":  [0.3, 0.6],
    "VWAP_DEV_MAX":  [3.0],
    "RSI_LONG_MAX":  [30, 35, 40],
    "RSI_SHORT_MIN": [60, 65, 70],
    "TP_PCT":        [0.015, 0.025, 0.04],
    "SL_PCT":        [0.010, 0.015],
    "USE_EMA200":    [False],
    "DIRECTION":     ["mean_revert"],
}
sweep(of_backtest, grid, ohlcv, symbols, top_n=10)
