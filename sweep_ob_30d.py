"""OB sweep on 30d (post-fix regime)."""
import sys
sys.path.insert(0, '/home/minus/Desktop/bot grid')
from backtester_sweep_harness import fetch_ohlcv_cached, sweep
from sweep_ob import ob_backtest

symbols = ["BTC/USDT:USDT", "ETH/USDT:USDT"]
ohlcv = fetch_ohlcv_cached(symbols, "4h", days=30)
grid = {
    "TP_RATIO":        [1.5, 2.0, 2.5, 3.0, 4.0],
    "BOS_MIN_PCT":     [0.02, 0.025, 0.035, 0.05],
    "MIN_OB_BODY_PCT": [0.002, 0.003, 0.005],
    "USE_EMA200":      [True, False],
}
sweep(ob_backtest, grid, ohlcv, symbols, top_n=10)
