"""
tools/historical_replay.py — walk-forward SL/TP grid search on news bot signals.

Council 2026-05-23 PROCEED WITH CONDITIONS:
  - Filter signals >= 2026-05-19 21:06 (post-inflection baseline)
  - Grid limited to 48 combinations
  - 70/30 train/test chronological split (anti-overfit)
  - Bootstrap 1000x for 95% CI on test PnL
  - NO action unless test_lower_CI > current_params_upper_CI

Source: /opt/botgrid/signals_log.json (last 500 emitted signals).
"""
from __future__ import annotations

import json
import os
import sys
import time as _t
import random
from datetime import datetime, timezone
from collections import defaultdict
from itertools import product

import ccxt

sys.path.insert(0, '/opt/botgrid')

SIGNALS_FILE = '/opt/botgrid/signals_log.json'
BASELINE_CUTOFF = '2026-05-19T21:06:00'

# Council-approved grid (48 = 6 × 4 × 2)
SL_PCTS = [1.0, 1.5, 2.0, 2.5, 3.0, 4.0]
TP_PCTS = [3.0, 5.0, 7.0, 10.0]
ATR_FLOORS = [None, 2.5]   # None = pure %; 2.5 = max(SL%, 2.5×ATR)

LEVERAGE = 4
FEE_BPS = 11.0    # 0.055% × 2 round-trip
MAX_HOLD_BARS = 240  # 4h on 1m
BOOTSTRAP_N = 1000


def load_signals():
    with open(SIGNALS_FILE) as f:
        data = json.load(f)
    out = []
    for s in data:
        ts = s.get('timestamp') or s.get('ts')
        if not ts:
            continue
        if ts < BASELINE_CUTOFF:
            continue
        if s.get('action') not in ('LONG', 'SHORT'):
            continue
        coin = s.get('coin', '').upper()
        if not coin or coin in ('BTC', 'ETH', 'SOL', 'BNB'):
            continue
        dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
        out.append({
            'ts': dt.timestamp(),
            'coin': coin,
            'action': s['action'],
            'score': s.get('total_score', 0),
        })
    out.sort(key=lambda x: x['ts'])
    return out


def fetch_coin_candles(ex, coin, ts_min, ts_max):
    """1m candles for COIN/USDT:USDT covering [ts_min, ts_max] in seconds."""
    sym = f"{coin}/USDT:USDT"
    try:
        ex.load_markets(False)
        if sym not in ex.markets:
            sym = f"{coin}USDT"
            if sym not in ex.markets:
                return None
    except Exception:
        return None
    candles = []
    cur = int(ts_min * 1000)
    end = int(ts_max * 1000)
    while cur < end:
        try:
            batch = ex.fetch_ohlcv(sym, timeframe='1m', since=cur, limit=1000)
        except Exception as e:
            print(f'    fetch err {coin}: {e}')
            break
        if not batch:
            break
        candles.extend(batch)
        cur = batch[-1][0] + 60_000
        if len(batch) < 1000:
            break
        _t.sleep(0.05)
    return candles


def atr_at(candles, idx, period=14):
    """Calc ATR over candles[idx-period:idx]. Returns abs price unit."""
    if idx < period:
        return None
    trs = []
    for i in range(idx - period + 1, idx + 1):
        if i == 0:
            continue
        h, l, prev_c = candles[i][2], candles[i][3], candles[i-1][4]
        tr = max(h - l, abs(h - prev_c), abs(l - prev_c))
        trs.append(tr)
    if not trs:
        return None
    return sum(trs) / len(trs)


def simulate(signal, candles, sl_pct, tp_pct, atr_floor):
    """One signal simulation. Returns pnl_pct % (after fees), or None."""
    sig_ms = int(signal['ts'] * 1000)
    entry_idx = None
    for i, c in enumerate(candles):
        if c[0] >= sig_ms:
            entry_idx = i
            break
    if entry_idx is None or entry_idx + 1 >= len(candles):
        return None
    entry = candles[entry_idx + 1][1]   # open of NEXT 1m candle (avoid same-bar lookahead)
    if entry <= 0:
        return None

    sl_dist_pct = sl_pct
    if atr_floor is not None:
        atr = atr_at(candles, entry_idx)
        if atr and atr > 0:
            atr_pct = (atr / entry) * 100
            sl_dist_pct = max(sl_pct, atr_floor * atr_pct)

    if signal['action'] == 'LONG':
        sl_px = entry * (1 - sl_dist_pct / 100)
        tp_px = entry * (1 + tp_pct / 100)
    else:
        sl_px = entry * (1 + sl_dist_pct / 100)
        tp_px = entry * (1 - tp_pct / 100)

    for c in candles[entry_idx + 1: entry_idx + 1 + MAX_HOLD_BARS]:
        hi, lo = c[2], c[3]
        if signal['action'] == 'LONG':
            if lo <= sl_px:
                return -sl_dist_pct * LEVERAGE - FEE_BPS / 100
            if hi >= tp_px:
                return tp_pct * LEVERAGE - FEE_BPS / 100
        else:
            if hi >= sl_px:
                return -sl_dist_pct * LEVERAGE - FEE_BPS / 100
            if lo <= tp_px:
                return tp_pct * LEVERAGE - FEE_BPS / 100
    # Timeout
    last = candles[min(entry_idx + 1 + MAX_HOLD_BARS, len(candles)) - 1][4]
    if signal['action'] == 'LONG':
        return (last - entry) / entry * 100 * LEVERAGE - FEE_BPS / 100
    return (entry - last) / entry * 100 * LEVERAGE - FEE_BPS / 100


def bootstrap_ci(pnls, n=BOOTSTRAP_N):
    if not pnls:
        return (0, 0, 0)
    means = []
    k = len(pnls)
    for _ in range(n):
        sample = [pnls[random.randint(0, k - 1)] for _ in range(k)]
        means.append(sum(sample) / k)
    means.sort()
    lo = means[int(n * 0.025)]
    hi = means[int(n * 0.975)]
    return (sum(pnls) / k, lo, hi)


def main():
    print(f'historical_replay @ {datetime.now(timezone.utc).isoformat()}')
    signals = load_signals()
    print(f'Loaded {len(signals)} actionable signals post-baseline')

    # Chronological 70/30 split
    n = len(signals)
    split_idx = int(n * 0.7)
    train_sigs = signals[:split_idx]
    test_sigs = signals[split_idx:]
    print(f'  Train: {len(train_sigs)}   Test: {len(test_sigs)}')

    # Group by coin, fetch OHLCV once
    coins = sorted(set(s['coin'] for s in signals))
    print(f'  Unique coins: {len(coins)}')

    ts_min = min(s['ts'] for s in signals) - 3600  # 1h pre buffer for ATR
    ts_max = max(s['ts'] for s in signals) + 5 * 3600  # 5h post for max hold

    ex = ccxt.bybit({'enableRateLimit': True, 'options': {'defaultType': 'linear'}})
    candles_by_coin = {}
    for c in coins:
        print(f'  Fetching {c} 1m candles...')
        candles_by_coin[c] = fetch_coin_candles(ex, c, ts_min, ts_max)
        if not candles_by_coin[c]:
            print(f'    !! {c}: no data')
    have_coins = [c for c in coins if candles_by_coin.get(c)]
    print(f'  Got candles for {len(have_coins)}/{len(coins)} coins')

    # Grid sweep
    combos = list(product(SL_PCTS, TP_PCTS, ATR_FLOORS))
    print(f'\nGrid: {len(combos)} combinations × {len(signals)} signals = {len(combos)*len(signals)} simulations\n')

    results = []
    for sl, tp, atr_f in combos:
        train_pnls = []
        test_pnls = []
        for sig in train_sigs:
            cs = candles_by_coin.get(sig['coin'])
            if not cs:
                continue
            r = simulate(sig, cs, sl, tp, atr_f)
            if r is not None:
                train_pnls.append(r)
        for sig in test_sigs:
            cs = candles_by_coin.get(sig['coin'])
            if not cs:
                continue
            r = simulate(sig, cs, sl, tp, atr_f)
            if r is not None:
                test_pnls.append(r)
        if not train_pnls or not test_pnls:
            continue
        train_total = sum(train_pnls)
        test_total = sum(test_pnls)
        train_wr = sum(1 for p in train_pnls if p > 0) * 100 / len(train_pnls)
        test_wr = sum(1 for p in test_pnls if p > 0) * 100 / len(test_pnls)
        test_mean, test_lo, test_hi = bootstrap_ci(test_pnls)
        results.append({
            'sl': sl, 'tp': tp, 'atr_floor': atr_f,
            'train_n': len(train_pnls), 'train_pnl': train_total, 'train_wr': train_wr,
            'test_n': len(test_pnls), 'test_pnl': test_total, 'test_wr': test_wr,
            'test_mean_pnl': test_mean, 'test_ci_lo': test_lo, 'test_ci_hi': test_hi,
            'edge_ratio': (test_total / train_total) if train_total != 0 else 0,
        })

    # Rank by test PnL (NOT train — anti-overfit per Council)
    results.sort(key=lambda r: -r['test_pnl'])

    # Find current params baseline (SL=2%, TP=5%, atr_floor=None)
    current = next((r for r in results if r['sl'] == 2.0 and r['tp'] == 5.0 and r['atr_floor'] is None), None)

    print('\n=== TOP 15 by TEST PnL (out-of-sample, anti-overfit) ===')
    print(f'{"SL%":>5} {"TP%":>5} {"ATRf":>5}  {"trN":>4} {"trWR%":>5} {"trPnL":>9}  {"tsN":>4} {"tsWR%":>5} {"tsPnL":>9}  CI95(test_mean)')
    for r in results[:15]:
        atrf = f"{r['atr_floor']:.1f}" if r['atr_floor'] else '  -'
        print(f"{r['sl']:>5.1f} {r['tp']:>5.1f} {atrf:>5}  {r['train_n']:>4} {r['train_wr']:>5.0f} {r['train_pnl']:>+8.1f}%  {r['test_n']:>4} {r['test_wr']:>5.0f} {r['test_pnl']:>+8.1f}%  [{r['test_ci_lo']:+.2f}, {r['test_ci_hi']:+.2f}]")

    print('\n=== CURRENT PARAMS (SL=2%, TP=5%, no ATR) ===')
    if current:
        print(f"  train: n={current['train_n']}, WR={current['train_wr']:.0f}%, PnL={current['train_pnl']:+.1f}%")
        print(f"  test:  n={current['test_n']}, WR={current['test_wr']:.0f}%, PnL={current['test_pnl']:+.1f}%  CI95 [{current['test_ci_lo']:+.2f}, {current['test_ci_hi']:+.2f}]")

    # Verdict: best test combo's CI_lo > current's CI_hi?
    if results and current:
        best = results[0]
        print(f"\n=== VERDICT ===")
        if best['test_ci_lo'] > current['test_ci_hi']:
            print(f"✅ STATISTICAL EDGE: best (SL={best['sl']}/TP={best['tp']}/ATR={best['atr_floor']})")
            print(f"   CI_lo {best['test_ci_lo']:+.2f}%  > current CI_hi {current['test_ci_hi']:+.2f}%")
            print(f"   Action approved per Council rule")
        else:
            print(f"❌ NO STATISTICAL EDGE: best CI_lo {best['test_ci_lo']:+.2f}% does NOT exceed current CI_hi {current['test_ci_hi']:+.2f}%")
            print(f"   Per Council rule — DO NOT switch params. Keep current.")
            print(f"   (Differences within noise of bootstrap CI)")


if __name__ == '__main__':
    main()
