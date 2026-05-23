"""
overnight_backtest.py — replay all actionable signals from bot_engine.log,
simulate execution with current bot params (TP=5%, SL=2%, lev=4x).

Extracts signals where action=LONG/SHORT + total_score, fetches 1m candles
from Bybit covering signal_time to signal_time+4h, computes would-have PnL.
"""
import re
import json
import time as _t
import ccxt
from datetime import datetime, timezone
from collections import defaultdict

LOG_FILE = '/opt/botgrid/bot_engine.log'
HOURS_BACK = 14   # cover last night's full window
TP_PCT = 5.0
SL_PCT = 2.0
LEVERAGE = 4
FEE_BPS = 11.0    # 0.055% × 2 round-trip
BLOCKED_COINS = {'BTC', 'ETH', 'SOL', 'BNB'}

_SIGNAL_RE = re.compile(
    r'"coin":\s*"([A-Z0-9]+)",\s*"action":\s*"(LONG|SHORT)",\s*"total_score":\s*(-?\d+\.?\d*)'
)


def parse_signals():
    cutoff = _t.time() - HOURS_BACK * 3600
    # Get file mtime as anchor (signals don't have timestamps in JSON blocks)
    # We approximate ts by interleaving with prior log lines
    signals = []
    with open(LOG_FILE) as f:
        lines = f.readlines()

    # Walk last N lines; estimate timestamps from any datetime patterns
    # The bot_engine.log doesn't have line-level timestamps consistently,
    # so we'll approximate by file position relative to mtime
    import os
    file_mtime = os.path.getmtime(LOG_FILE)
    total_lines = len(lines)
    if total_lines == 0:
        return []

    text = '\n'.join(lines[-50000:])  # last 50k lines covers ~12h easily
    matches = list(_SIGNAL_RE.finditer(text))
    # Each match represents a signal evaluated. Distribute timestamps evenly
    # over the last HOURS_BACK window (rough but ok for batching).
    n = len(matches)
    if n == 0:
        return []
    span = HOURS_BACK * 3600
    start_ts = file_mtime - span
    for i, m in enumerate(matches):
        ts = start_ts + (i / n) * span
        signals.append({
            'ts': ts,
            'coin': m.group(1),
            'action': m.group(2),
            'score': float(m.group(3)),
        })
    return signals


def fetch_candles(ex, coin, start_ms, end_ms):
    """Fetch 1m candles for COIN/USDT:USDT perpetual."""
    sym = f"{coin}/USDT:USDT"
    try:
        ex.load_markets(False)
        if sym not in ex.markets:
            sym = f"{coin}USDT"
            if sym not in ex.markets:
                return None
    except Exception:
        pass

    candles = []
    cur = start_ms
    while cur < end_ms:
        try:
            batch = ex.fetch_ohlcv(sym, timeframe='1m', since=cur, limit=200)
            if not batch:
                break
            candles.extend(batch)
            cur = batch[-1][0] + 60_000
            if len(batch) < 200:
                break
        except Exception as e:
            break
    return candles


def simulate(signal, candles):
    """Find entry at first candle after signal.ts, simulate TP/SL forward."""
    if not candles:
        return {'status': 'no_data', 'pnl_pct': 0}
    sig_ms = int(signal['ts'] * 1000)
    entry_idx = None
    for i, c in enumerate(candles):
        if c[0] >= sig_ms:
            entry_idx = i
            break
    if entry_idx is None:
        return {'status': 'no_entry', 'pnl_pct': 0}

    entry = candles[entry_idx][1]  # open of next candle
    if signal['action'] == 'LONG':
        sl = entry * (1 - SL_PCT / 100)
        tp = entry * (1 + TP_PCT / 100)
    else:
        sl = entry * (1 + SL_PCT / 100)
        tp = entry * (1 - TP_PCT / 100)

    # Walk candles, check SL/TP intra-bar (low/high)
    max_bars = 240  # 4h on 1m
    for c in candles[entry_idx: entry_idx + max_bars]:
        hi, lo = c[2], c[3]
        if signal['action'] == 'LONG':
            if lo <= sl:
                return {'status': 'sl', 'entry': entry, 'exit': sl,
                        'pnl_pct': -SL_PCT * LEVERAGE - FEE_BPS / 100}
            if hi >= tp:
                return {'status': 'tp', 'entry': entry, 'exit': tp,
                        'pnl_pct': TP_PCT * LEVERAGE - FEE_BPS / 100}
        else:
            if hi >= sl:
                return {'status': 'sl', 'entry': entry, 'exit': sl,
                        'pnl_pct': -SL_PCT * LEVERAGE - FEE_BPS / 100}
            if lo <= tp:
                return {'status': 'tp', 'entry': entry, 'exit': tp,
                        'pnl_pct': TP_PCT * LEVERAGE - FEE_BPS / 100}
    # Time out — close at last close
    last = candles[min(entry_idx + max_bars, len(candles)) - 1][4]
    if signal['action'] == 'LONG':
        pnl = (last - entry) / entry * 100 * LEVERAGE - FEE_BPS / 100
    else:
        pnl = (entry - last) / entry * 100 * LEVERAGE - FEE_BPS / 100
    return {'status': 'timeout', 'entry': entry, 'exit': last, 'pnl_pct': pnl}


def main():
    print('Parsing signals from log...')
    sigs = parse_signals()
    print(f'Found {len(sigs)} actionable signals')

    # Filter: drop BLOCKED coins, drop duplicates of same coin+action within 5min
    sigs = [s for s in sigs if s['coin'] not in BLOCKED_COINS]
    print(f'After BTC/ETH/SOL/BNB block: {len(sigs)}')

    deduped = []
    seen = {}
    for s in sigs:
        key = (s['coin'], s['action'])
        last = seen.get(key, 0)
        if s['ts'] - last > 300:  # 5 min cooldown like real bot
            deduped.append(s)
            seen[key] = s['ts']
    print(f'After 5-min dedup: {len(deduped)}')

    by_coin = defaultdict(list)
    for s in deduped:
        by_coin[s['coin']].append(s)
    print(f'Unique coins: {len(by_coin)}')

    ex = ccxt.bybit({'enableRateLimit': True, 'options': {'defaultType': 'linear'}})

    results = []
    for coin, coin_sigs in by_coin.items():
        ts_min = min(s['ts'] for s in coin_sigs) * 1000
        ts_max = max(s['ts'] for s in coin_sigs) * 1000 + 4 * 3600 * 1000
        candles = fetch_candles(ex, coin, int(ts_min), int(ts_max))
        if not candles:
            for s in coin_sigs:
                results.append({**s, 'status': 'no_market', 'pnl_pct': 0})
            print(f'  {coin}: no market data ({len(coin_sigs)} sigs)')
            continue
        for s in coin_sigs:
            r = simulate(s, candles)
            results.append({**s, **r})

    # Aggregate
    total = len(results)
    tp_n = sum(1 for r in results if r.get('status') == 'tp')
    sl_n = sum(1 for r in results if r.get('status') == 'sl')
    timeout_n = sum(1 for r in results if r.get('status') == 'timeout')
    no_data = sum(1 for r in results if r.get('status') in ('no_market', 'no_data', 'no_entry'))
    total_pnl_pct = sum(r.get('pnl_pct', 0) for r in results)
    wr = tp_n * 100.0 / max(tp_n + sl_n + timeout_n, 1)
    actionable = tp_n + sl_n + timeout_n

    print('\n=== RESULTS ===')
    print(f'Total signals (after filters): {total}')
    print(f'  Actionable (had price data): {actionable}')
    print(f'  No market data:              {no_data}')
    print(f'  TP hit:    {tp_n}  ({tp_n*100/max(actionable,1):.0f}%)')
    print(f'  SL hit:    {sl_n}  ({sl_n*100/max(actionable,1):.0f}%)')
    print(f'  Timeout:   {timeout_n}')
    print(f'  WR (TP / TP+SL+timeout): {wr:.0f}%')
    print(f'  Sum PnL %: {total_pnl_pct:+.2f}% (sum of all per-trade % returns)')
    avg = total_pnl_pct / max(actionable, 1)
    print(f'  Avg PnL %/trade: {avg:+.3f}%')

    # Per-coin breakdown
    print('\n=== PER COIN ===')
    by_coin_r = defaultdict(lambda: {'n': 0, 'pnl': 0.0, 'tp': 0, 'sl': 0})
    for r in results:
        if r.get('status') in ('no_market', 'no_data', 'no_entry'):
            continue
        by_coin_r[r['coin']]['n'] += 1
        by_coin_r[r['coin']]['pnl'] += r.get('pnl_pct', 0)
        if r['status'] == 'tp':
            by_coin_r[r['coin']]['tp'] += 1
        elif r['status'] == 'sl':
            by_coin_r[r['coin']]['sl'] += 1

    rows = sorted(by_coin_r.items(), key=lambda x: -x[1]['pnl'])
    print(f"{'COIN':<8} {'N':>4} {'TP':>4} {'SL':>4} {'PnL%':>9}")
    for coin, d in rows:
        print(f"{coin:<8} {d['n']:>4} {d['tp']:>4} {d['sl']:>4} {d['pnl']:>+8.2f}")


if __name__ == '__main__':
    main()
