"""
backtester_orderflow.py — Orderflow bot backtest
VWAP mean-reversion + RSI oversold/overbought on 4h OHLCV.
Price significantly below VWAP + RSI<35 → LONG (bounce back to VWAP)
Price significantly above VWAP + RSI>65 → SHORT (fade the extension)
Symbols: BTC/ETH/SOL, 90 days, Bybit via ccxt
Fees: 0.11% round-trip × leverage
"""
import ccxt
import time
from datetime import datetime, timezone
from collections import defaultdict

SYMBOLS = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
TIMEFRAME = "4h"
DAYS = 90
CANDLES_NEEDED = int((DAYS * 24) / 4) + 60

# Strategy params
VWAP_WINDOW    = 24     # 4-day rolling VWAP
RSI_PERIOD     = 14
TP_PCT         = 0.015  # 1.5% TP (partial VWAP gap recovery)
SL_PCT         = 0.010  # 1.0% SL
LEVERAGE       = 3
SIZE_PCT       = 0.10
MAX_HOLD       = 12     # 48h max

VWAP_DEV_MIN   = 0.4    # price at least 0.4% away from VWAP
VWAP_DEV_MAX   = 3.0    # price not more than 3% from VWAP (not in crash)
RSI_LONG_MAX   = 35     # oversold: price below VWAP with RSI < 35
RSI_SHORT_MIN  = 65     # overbought: price above VWAP with RSI > 65
VOL_MULT       = 1.3    # current volume ≥ 1.3× rolling average

TAKER_FEE = 0.00055
FEE_COST  = TAKER_FEE * 2 * LEVERAGE


def fetch_ohlcv(exchange, symbol, limit):
    try:
        bars = exchange.fetch_ohlcv(symbol, TIMEFRAME, limit=limit)
        return bars
    except Exception as e:
        print(f"  ERROR fetching {symbol}: {e}")
        return []


def calc_rolling_vwap(closes, volumes, i, window):
    start = max(0, i - window + 1)
    cv = sum(closes[j] * volumes[j] for j in range(start, i + 1))
    sv = sum(volumes[j] for j in range(start, i + 1))
    return cv / sv if sv > 0 else closes[i]


def calc_rsi(closes, i, period=14):
    """Wilder RSI over `period` bars ending at index i."""
    if i < period + 1:
        return 50.0
    start = max(0, i - period * 3)
    prices = closes[start:i + 1]
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
    return 100.0 - 100.0 / (1.0 + rs)


def backtest_symbol(exchange, symbol):
    print(f"  Fetching {symbol} ...")
    bars = fetch_ohlcv(exchange, symbol, CANDLES_NEEDED)
    warmup = max(VWAP_WINDOW, RSI_PERIOD * 3) + 5
    if len(bars) < warmup + 10:
        print(f"  Not enough data for {symbol}")
        return []

    timestamps = [b[0] for b in bars]
    opens  = [b[1] for b in bars]
    highs  = [b[2] for b in bars]
    lows   = [b[3] for b in bars]
    closes = [b[4] for b in bars]
    vols   = [b[5] for b in bars]

    trades = []
    in_trade = False
    entry_price = 0
    direction = None
    entry_i = 0

    for i in range(warmup, len(bars) - 1):
        if in_trade:
            hi = highs[i]
            lo = lows[i]
            cl = closes[i]
            held = i - entry_i

            if direction == "LONG":
                tp_price = entry_price * (1 + TP_PCT)
                sl_price = entry_price * (1 - SL_PCT)
                if lo <= sl_price:
                    pnl = -SL_PCT * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "LONG", "pnl": pnl, "ts": timestamps[i]})
                    in_trade = False
                elif hi >= tp_price:
                    pnl = TP_PCT * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "LONG", "pnl": pnl, "ts": timestamps[i]})
                    in_trade = False
                elif held >= MAX_HOLD:
                    pnl = (cl - entry_price) / entry_price * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "LONG", "pnl": pnl, "ts": timestamps[i]})
                    in_trade = False
            else:
                tp_price = entry_price * (1 - TP_PCT)
                sl_price = entry_price * (1 + SL_PCT)
                if hi >= sl_price:
                    pnl = -SL_PCT * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "SHORT", "pnl": pnl, "ts": timestamps[i]})
                    in_trade = False
                elif lo <= tp_price:
                    pnl = TP_PCT * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "SHORT", "pnl": pnl, "ts": timestamps[i]})
                    in_trade = False
                elif held >= MAX_HOLD:
                    pnl = (entry_price - cl) / entry_price * LEVERAGE - FEE_COST
                    trades.append({"symbol": symbol, "dir": "SHORT", "pnl": pnl, "ts": timestamps[i]})
                    in_trade = False
            continue

        vwap     = calc_rolling_vwap(closes, vols, i, VWAP_WINDOW)
        vwap_dev = (closes[i] - vwap) / vwap * 100   # positive = above VWAP
        rsi      = calc_rsi(closes, i, RSI_PERIOD)

        # Volume confirmation: above rolling average
        vol_avg = sum(vols[max(0, i - VWAP_WINDOW):i]) / VWAP_WINDOW
        vol_ok  = vols[i] >= vol_avg * VOL_MULT

        if (vwap_dev <= -VWAP_DEV_MIN and abs(vwap_dev) <= VWAP_DEV_MAX
                and rsi <= RSI_LONG_MAX and vol_ok):
            in_trade = True
            direction = "LONG"
            entry_price = closes[i]
            entry_i = i

        elif (vwap_dev >= VWAP_DEV_MIN and abs(vwap_dev) <= VWAP_DEV_MAX
                and rsi >= RSI_SHORT_MIN and vol_ok):
            in_trade = True
            direction = "SHORT"
            entry_price = closes[i]
            entry_i = i

    return trades


def format_results(all_trades, label="COMBINED"):
    if not all_trades:
        return f"{label}: 0 trades"
    n = len(all_trades)
    wins = sum(1 for t in all_trades if t["pnl"] > 0)
    wr = wins / n * 100
    avg_pnl = sum(t["pnl"] for t in all_trades) / n * 100
    total_pnl = sum(t["pnl"] for t in all_trades) * SIZE_PCT * 100

    monthly = defaultdict(float)
    for t in all_trades:
        dt = datetime.fromtimestamp(t["ts"] / 1000, tz=timezone.utc)
        key = f"{dt.year}-{dt.month:02d}"
        monthly[key] += t["pnl"] * SIZE_PCT * 100

    monthly_avg = sum(monthly.values()) / len(monthly) if monthly else 0

    return (f"{label}: trades={n}, WR={wr:.1f}%, avg_pnl={avg_pnl:+.2f}% (raw leveraged), "
            f"total_account_pnl={total_pnl:+.2f}%, monthly_avg={monthly_avg:+.2f}%")


def main():
    exchange = ccxt.bybit({"options": {"defaultType": "swap"}})
    exchange.load_markets()

    results = {}
    all_combined = []

    for sym in SYMBOLS:
        trades = backtest_symbol(exchange, sym)
        results[sym] = trades
        all_combined.extend(trades)
        print("  " + format_results(trades, sym))

    print()
    print(format_results(all_combined, "COMBINED"))
    return results, all_combined


if __name__ == "__main__":
    print("=== ORDERFLOW / VWAP MEAN-REVERSION BACKTEST ===")
    print(f"Signal: price {VWAP_DEV_MIN}–{VWAP_DEV_MAX}% below VWAP + RSI<{RSI_LONG_MAX} → LONG")
    print(f"        price {VWAP_DEV_MIN}–{VWAP_DEV_MAX}% above VWAP + RSI>{RSI_SHORT_MIN} → SHORT")
    print(f"TP={TP_PCT*100:.1f}%  SL={SL_PCT*100:.1f}%  x{LEVERAGE}  Size={SIZE_PCT*100:.0f}%  Fee={FEE_COST*100:.3f}%")
    print()
    results, combined = main()
    print("=== DONE ===")
