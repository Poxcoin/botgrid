"""
tools/backtest_adaptive_sizing.py — replay closed news trades with adaptive sizing.

Compare: fixed sizing (current) vs adaptive sizing (Alt 1).
Output: total PnL, win rate, max drawdown, Sharpe-ish proxy for both.

Usage:
  python tools/backtest_adaptive_sizing.py
  python tools/backtest_adaptive_sizing.py --source news --days 90
  python tools/backtest_adaptive_sizing.py --rolling-n 20 --max-mult 2.0

Run AFTER all news trades have stabilized (closed). Decision rule:
  - If adaptive Sharpe >= fixed AND adaptive max DD <= fixed * 1.1 → enable adaptive on news
  - Else → keep adaptive OFF on news; only enable on smartmoney/fr where edge is unclear
"""
from __future__ import annotations

import argparse
import math
import sys
sys.path.insert(0, '/opt/botgrid')

from dotenv import load_dotenv
load_dotenv('/opt/botgrid/.env')

from sqlalchemy import text
from database import SessionLocal

_BASELINE = '2026-05-19 21:06:00'


def fetch_trades(source: str, days: int):
    db = SessionLocal()
    try:
        rows = db.execute(text(
            """
            SELECT id, symbol, source, pnl_usdt, qty, entry_price, closed_at
            FROM user_trades
            WHERE status='closed'
              AND source = :source
              AND closed_at >= :baseline
              AND closed_at >= datetime('now', :win)
            ORDER BY closed_at ASC
            """
        ), {'source': source, 'baseline': _BASELINE, 'win': f'-{days} day'}).fetchall()
        return [dict(zip(['id', 'symbol', 'source', 'pnl', 'qty', 'entry', 'closed_at'], r)) for r in rows]
    finally:
        db.close()


def compute_adaptive_multiplier(trades_so_far: list, symbol: str, rolling_n: int,
                                  min_mult: float, max_mult: float) -> float:
    """Mimic adaptive_sizing.get_size_multiplier using only trades closed BEFORE current."""
    relevant = [t for t in trades_so_far if t['symbol'] == symbol][-rolling_n:]
    if len(relevant) < 3:
        return 1.0
    sum_pnl = sum(float(t['pnl'] or 0) for t in relevant)
    sum_notional = sum(float(t['qty'] or 0) * float(t['entry'] or 0) for t in relevant)
    if sum_notional <= 0:
        return 1.0
    pnl_pct = (sum_pnl / sum_notional) * 100.0
    return max(min_mult, min(1.0 + pnl_pct / 10.0, max_mult))


def replay(trades: list, mode: str, **kw):
    """Returns dict with stats: total_pnl, wr, max_dd, sharpe_proxy."""
    cum = 0.0
    peak = 0.0
    max_dd = 0.0
    wins = 0
    pnls = []
    processed = []
    for t in trades:
        if mode == 'fixed':
            scaled = float(t['pnl'] or 0)
        else:
            mult = compute_adaptive_multiplier(
                processed, t['symbol'],
                kw.get('rolling_n', 14),
                kw.get('min_mult', 0.2),
                kw.get('max_mult', 1.5),
            )
            scaled = float(t['pnl'] or 0) * mult
        cum += scaled
        if cum > peak: peak = cum
        dd = peak - cum
        if dd > max_dd: max_dd = dd
        if scaled > 0: wins += 1
        pnls.append(scaled)
        processed.append(t)
    n = len(trades)
    wr = wins / n if n else 0
    mean = sum(pnls) / n if n else 0
    var = sum((p - mean) ** 2 for p in pnls) / n if n else 0
    sd = math.sqrt(var)
    sharpe = (mean / sd) * math.sqrt(252) if sd > 0 else 0
    return {
        'n': n,
        'total_pnl': cum,
        'wr_pct': wr * 100,
        'max_dd': max_dd,
        'sharpe_proxy': sharpe,
    }


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--source', default='news')
    p.add_argument('--days', type=int, default=30)
    p.add_argument('--rolling-n', type=int, default=14)
    p.add_argument('--min-mult', type=float, default=0.2)
    p.add_argument('--max-mult', type=float, default=1.5)
    args = p.parse_args()

    trades = fetch_trades(args.source, args.days)
    if not trades:
        print(f'No trades for source={args.source} in last {args.days} days.')
        return

    fixed = replay(trades, 'fixed')
    adapt = replay(trades, 'adaptive',
                    rolling_n=args.rolling_n,
                    min_mult=args.min_mult, max_mult=args.max_mult)

    print(f'=== Source: {args.source} · Window: {args.days}d · Trades: {fixed["n"]} ===')
    print(f'                  fixed       adaptive')
    print(f'  total_pnl   ${fixed["total_pnl"]:+10.2f}  ${adapt["total_pnl"]:+10.2f}')
    print(f'  WR%          {fixed["wr_pct"]:6.1f}%      {adapt["wr_pct"]:6.1f}%')
    print(f'  max_dd      ${fixed["max_dd"]:10.2f}  ${adapt["max_dd"]:10.2f}')
    print(f'  sharpe_proxy {fixed["sharpe_proxy"]:6.2f}      {adapt["sharpe_proxy"]:6.2f}')

    pnl_lift = adapt['total_pnl'] - fixed['total_pnl']
    dd_chg = adapt['max_dd'] - fixed['max_dd']
    verdict = 'ENABLE' if (adapt['sharpe_proxy'] >= fixed['sharpe_proxy']
                            and adapt['max_dd'] <= fixed['max_dd'] * 1.1) else 'KEEP_OFF'
    print(f'\nPnL lift: ${pnl_lift:+.2f} · DD change: ${dd_chg:+.2f} · Verdict: {verdict}')


if __name__ == '__main__':
    main()
