"""
sweep_ob_regime.py — find regime conditions where OB strategy works.

Per-trade regime measurement:
  - ADX(14): 0-100, >25 = trending
  - Hurst: rolling 60-bar R/S analysis, >0.55 = trending
  - ATR pct: ATR(14) / close as %, rising = volatility expanding
  - EMA50 slope: % change of EMA over 10 bars
  - Direction bias: price vs EMA200 (LONG only above, SHORT only below)

Test grid: which combination preserves +14.88%/mo on 90d while killing 30d.
"""
import sys
sys.path.insert(0, '/home/minus/Desktop/bot grid')
from backtester_sweep_harness import fetch_ohlcv_cached, sweep
from sweep_ob import _find_ob, _ema, OB_LOOKBACK, BOS_WINDOW, LEVERAGE, SL_BUFFER, MAX_HOLD, FEE_COST


def _adx(highs, lows, closes, i, period=14):
    """Simplified ADX over period ending at i."""
    if i < period * 2:
        return 0.0
    dm_plus = []
    dm_minus = []
    trs = []
    for j in range(i - period * 2 + 1, i + 1):
        if j == 0:
            continue
        up = highs[j] - highs[j-1]
        dn = lows[j-1] - lows[j]
        dm_plus.append(up if (up > dn and up > 0) else 0)
        dm_minus.append(dn if (dn > up and dn > 0) else 0)
        trs.append(max(highs[j] - lows[j], abs(highs[j] - closes[j-1]), abs(lows[j] - closes[j-1])))
    if not trs:
        return 0.0
    atr = sum(trs[-period:]) / period
    if atr == 0:
        return 0.0
    di_plus = 100 * sum(dm_plus[-period:]) / (atr * period)
    di_minus = 100 * sum(dm_minus[-period:]) / (atr * period)
    denom = di_plus + di_minus
    if denom == 0:
        return 0.0
    dx = 100 * abs(di_plus - di_minus) / denom
    return dx


def _hurst(closes, i, lookback=60):
    """Quick Hurst via R/S analysis."""
    if i < lookback:
        return 0.5
    series = closes[i - lookback + 1: i + 1]
    n = len(series)
    if n < 8:
        return 0.5
    mean = sum(series) / n
    dev = [series[k] - mean for k in range(n)]
    cum = []
    s = 0
    for d in dev:
        s += d
        cum.append(s)
    R = max(cum) - min(cum)
    var = sum(d*d for d in dev) / n
    S = var ** 0.5
    if S == 0 or R == 0:
        return 0.5
    rs = R / S
    import math
    if rs <= 0:
        return 0.5
    return math.log(rs) / math.log(n)


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


def ob_regime_backtest(ohlcv, symbol, params):
    """OB backtest with regime filters."""
    tp_ratio        = params["TP_RATIO"]
    bos_min_pct     = params["BOS_MIN_PCT"]
    min_ob_body_pct = params["MIN_OB_BODY_PCT"]
    adx_min         = params["ADX_MIN"]       # 0 = no filter, 20/25/30 = trending gate
    hurst_min       = params["HURST_MIN"]     # 0.5 = no filter, 0.55+ = trending
    ema200_dir      = params["EMA200_DIR"]    # "any" / "with_trend" / "with_trend_strict"

    if not ohlcv or len(ohlcv) < OB_LOOKBACK + 50:
        return []

    timestamps = [b[0] for b in ohlcv]
    opens = [b[1] for b in ohlcv]
    highs = [b[2] for b in ohlcv]
    lows  = [b[3] for b in ohlcv]
    closes = [b[4] for b in ohlcv]

    ema200 = _ema(closes, 200)

    trades = []
    in_trade = False
    entry_price = sl_price_held = tp_price_held = 0
    direction = None
    entry_i = 0

    for i in range(OB_LOOKBACK, len(ohlcv) - 1):
        if in_trade:
            hi, lo, cl = highs[i], lows[i], closes[i]
            held = i - entry_i
            closed = False
            if direction == "LONG":
                if lo <= sl_price_held:
                    pnl = -(entry_price - sl_price_held)/entry_price * LEVERAGE - FEE_COST
                    trades.append({"pnl": pnl, "ts": timestamps[i]})
                    in_trade = False; closed = True
                elif hi >= tp_price_held:
                    pnl = (tp_price_held - entry_price)/entry_price * LEVERAGE - FEE_COST
                    trades.append({"pnl": pnl, "ts": timestamps[i]})
                    in_trade = False; closed = True
            else:
                if hi >= sl_price_held:
                    pnl = -(sl_price_held - entry_price)/entry_price * LEVERAGE - FEE_COST
                    trades.append({"pnl": pnl, "ts": timestamps[i]})
                    in_trade = False; closed = True
                elif lo <= tp_price_held:
                    pnl = (entry_price - tp_price_held)/entry_price * LEVERAGE - FEE_COST
                    trades.append({"pnl": pnl, "ts": timestamps[i]})
                    in_trade = False; closed = True
            if not closed and held >= MAX_HOLD:
                if direction == "LONG":
                    pnl = (cl - entry_price)/entry_price * LEVERAGE - FEE_COST
                else:
                    pnl = (entry_price - cl)/entry_price * LEVERAGE - FEE_COST
                trades.append({"pnl": pnl, "ts": timestamps[i]})
                in_trade = False
            continue

        # Regime gate
        if adx_min > 0:
            adx = _adx(highs, lows, closes, i, 14)
            if adx < adx_min:
                continue
        if hurst_min > 0.5:
            h = _hurst(closes, i, 60)
            if h < hurst_min:
                continue

        ob_long, ob_short = _find_ob(opens, highs, lows, closes, i, bos_min_pct, min_ob_body_pct)
        price = closes[i]

        for direc, ob in (("LONG", ob_long), ("SHORT", ob_short)):
            if ob is None:
                continue
            # EMA200 direction filter
            if ema200_dir == "with_trend":
                if direc == "LONG" and price < ema200[i]:
                    continue
                if direc == "SHORT" and price > ema200[i]:
                    continue
            elif ema200_dir == "with_trend_strict":
                # 2% above/below EMA — strict trend
                if direc == "LONG" and price < ema200[i] * 1.02:
                    continue
                if direc == "SHORT" and price > ema200[i] * 0.98:
                    continue
            if not (ob["ob_low"] <= price <= ob["ob_high"]):
                continue
            if direc == "LONG":
                sl_price = ob["ob_low"] * (1 - SL_BUFFER)
                sl_dist = price - sl_price
                tp_price = price + sl_dist * tp_ratio
            else:
                sl_price = ob["ob_high"] * (1 + SL_BUFFER)
                sl_dist = sl_price - price
                tp_price = price - sl_dist * tp_ratio
            if sl_dist <= 0:
                continue
            if abs(tp_price - price)/price * 100 < 0.5:
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
    print("\n=== OB REGIME SWEEP — 90d ===")
    ohlcv_90 = fetch_ohlcv_cached(symbols, "4h", days=90)
    grid = {
        "TP_RATIO":        [3.0],
        "BOS_MIN_PCT":     [0.025, 0.035],
        "MIN_OB_BODY_PCT": [0.003],
        "ADX_MIN":         [0, 20, 25, 30],
        "HURST_MIN":       [0.5, 0.55, 0.60],
        "EMA200_DIR":      ["any", "with_trend", "with_trend_strict"],
    }
    res_90 = sweep(ob_regime_backtest, grid, ohlcv_90, symbols, top_n=10)

    print("\n=== OB REGIME SWEEP — 30d (sanity) ===")
    ohlcv_30 = fetch_ohlcv_cached(symbols, "4h", days=30)
    # Test only top-10 90d configs on 30d
    print("\nApplying top 90d configs to 30d data:")
    for rank, (params, combined_90, _) in enumerate(res_90[:10], 1):
        all_trades = []
        for sym in symbols:
            all_trades.extend(ob_regime_backtest(ohlcv_30[sym], sym, params))
        from backtester_sweep_harness import compute_stats, fmt_stat
        s_30 = compute_stats(all_trades)
        print(f"#{rank:2d}  90d {fmt_stat(combined_90)[:50]} ... | 30d {fmt_stat(s_30)}")
        param_str = " ".join(f"{k}={v}" for k, v in params.items())
        print(f"      {param_str}")
