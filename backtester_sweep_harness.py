"""
backtester_sweep_harness.py — Generic parameter sweep for crypto perp bots.

Usage:
    from backtester_sweep_harness import sweep
    results = sweep(
        backtest_fn=ob_backtest_one,
        params_grid={
            "TP_RATIO":         [1.5, 2.0, 2.5, 3.0],
            "MIN_OB_BODY_PCT":  [0.002, 0.003, 0.005],
            "USE_EMA200":       [True, False],
        },
        ohlcv_by_symbol=ohlcv_cache,
        symbols=["BTC/USDT:USDT", "ETH/USDT:USDT"],
    )
    # results is sorted by score descending; top 10 printed.

backtest_fn signature:
    fn(ohlcv, symbol, params) -> list of trade dicts {pnl, ts, ...}

OHLCV is fetched once, reused across all param combos for speed.
"""
from __future__ import annotations

import itertools
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Callable

import ccxt


def fetch_ohlcv_cached(symbols, timeframe="4h", days=90, sleep_ms=100):
    """Fetch + cache OHLCV per symbol. Returns dict symbol → list of bars."""
    ex = ccxt.bybit({"options": {"defaultType": "linear"}, "enableRateLimit": True})
    out = {}
    for sym in symbols:
        print(f"  Fetching {sym} {timeframe} ({days}d) ...")
        bars = []
        since = int((datetime.now(timezone.utc).timestamp() - days * 86400) * 1000)
        while True:
            batch = ex.fetch_ohlcv(sym, timeframe, since=since, limit=1000)
            if not batch:
                break
            bars.extend(batch)
            since = batch[-1][0] + 1
            if len(batch) < 1000:
                break
            time.sleep(sleep_ms / 1000)
        out[sym] = bars
    return out


def compute_stats(trades, label=""):
    """Standard stats: n, WR, total_pnl, PF, avg_W, avg_L, max_DD."""
    if not trades:
        return {"label": label, "n": 0, "wr": 0, "total": 0, "pf": 0,
                "avg_w": 0, "avg_l": 0, "max_dd": 0, "score": -999}
    n = len(trades)
    pnls = [t["pnl"] for t in trades]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    total = sum(pnls)
    wr = len(wins) * 100.0 / n
    avg_w = sum(wins) / len(wins) if wins else 0
    avg_l = sum(losses) / len(losses) if losses else 0
    pf = sum(wins) / abs(sum(losses)) if losses else (999 if wins else 0)

    cum = peak = 0
    max_dd = 0
    for p in pnls:
        cum += p
        peak = max(peak, cum)
        max_dd = min(max_dd, cum - peak)

    # Composite score: rewards WR + PF + total, penalizes small n
    # Penalize n<20 (too noisy to trust)
    n_penalty = min(1.0, n / 20.0)
    score = (wr / 100 + min(pf, 5) / 5) * total * n_penalty if total > 0 else total * n_penalty
    return {
        "label": label, "n": n, "wr": wr, "total": total, "pf": pf,
        "avg_w": avg_w, "avg_l": avg_l, "max_dd": max_dd, "score": score,
    }


def fmt_stat(s):
    return (f"n={s['n']:3d}  WR={s['wr']:4.1f}%  total={s['total']:+7.2f}  "
            f"PF={s['pf']:5.2f}  W={s['avg_w']:+5.2f}  L={s['avg_l']:+5.2f}  "
            f"DD={s['max_dd']:+6.2f}  score={s['score']:+7.2f}")


def sweep(backtest_fn: Callable,
          params_grid: dict,
          ohlcv_by_symbol: dict,
          symbols: list = None,
          top_n: int = 10):
    """Run backtest_fn across cartesian product of params_grid.

    backtest_fn(ohlcv: list, symbol: str, params: dict) -> list of trades.

    Returns list of (params, combined_stats, per_symbol_stats) sorted by score desc.
    Prints top_n.
    """
    symbols = symbols or list(ohlcv_by_symbol.keys())

    keys = list(params_grid.keys())
    values = [params_grid[k] for k in keys]
    combos = list(itertools.product(*values))
    print(f"\n=== SWEEP: {len(combos)} param combos × {len(symbols)} symbols = "
          f"{len(combos) * len(symbols)} backtests ===\n")

    results = []
    for i, combo in enumerate(combos):
        params = dict(zip(keys, combo))
        all_trades = []
        per_symbol = {}
        for sym in symbols:
            ohlcv = ohlcv_by_symbol.get(sym, [])
            if not ohlcv:
                continue
            try:
                trades = backtest_fn(ohlcv, sym, params)
            except Exception as e:
                print(f"  ERROR combo {i+1}/{len(combos)} {sym}: {e}")
                trades = []
            all_trades.extend(trades)
            per_symbol[sym] = compute_stats(trades, label=sym)

        combined = compute_stats(all_trades, label=str(params))
        results.append((params, combined, per_symbol))

    results.sort(key=lambda r: r[1]["score"], reverse=True)

    print(f"\n=== TOP {min(top_n, len(results))} configs by score ===\n")
    for rank, (params, combined, per_sym) in enumerate(results[:top_n], 1):
        print(f"#{rank:2d}  {fmt_stat(combined)}")
        param_str = " ".join(f"{k}={v}" for k, v in params.items())
        print(f"      {param_str}")
        for sym, s in per_sym.items():
            short = sym.replace("/USDT:USDT", "")
            print(f"        {short:6s}  {fmt_stat(s)}")
        print()

    return results
