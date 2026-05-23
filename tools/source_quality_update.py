"""
tools/source_quality_update.py — Bayesian per-source quality monitor.

Computes Beta-Binomial posterior over win rate for each trade source.
Compares against break-even WR derived from realized payoff ratio.

Math:
  Prior:    Beta(α=2, β=2)  — neutral 50% WR low confidence
  Update:   α += wins, β += losses
  Mean:     α / (α + β)
  Variance: αβ / ((α+β)² (α+β+1))
  CI95:     mean ± 1.96 × std    (moment-matched normal approx)

  Break-even WR = 1 / (1 + payoff)   where payoff = avg_win / |avg_loss|
  Edge_pp = posterior_mean - break_even_wr (percentage points)

Status thresholds:
  insufficient_data  n < 5
  positive_edge      edge_pp >= +5pp
  marginal           0 < edge_pp < 5pp
  negative_edge      -5pp <= edge_pp <= 0
  killed             edge_pp < -5pp AND n >= 20  (statistically dead)

Run daily 11:00 UTC. Output: TG report + DB upsert.
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone
from math import sqrt

sys.path.insert(0, '/opt/botgrid')
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from sqlalchemy import case, func
from database import SessionLocal, UserTrade, SourceQuality

PRIOR_ALPHA = 2.0
PRIOR_BETA = 2.0
MIN_SAMPLES = 5
EDGE_POSITIVE_PP = 5.0   # +5pp above break-even
EDGE_KILLED_PP = -5.0    # below break-even
N_KILL_MIN = 20          # need at least 20 samples to "kill" a source


def _beta_stats(alpha: float, beta: float) -> dict:
    s = alpha + beta
    mean = alpha / s
    var = (alpha * beta) / (s * s * (s + 1))
    std = sqrt(var)
    lo = max(0.0, mean - 1.96 * std)
    hi = min(1.0, mean + 1.96 * std)
    return {'mean': mean, 'std': std, 'ci_lo': lo, 'ci_hi': hi}


def _classify(n: int, edge_pp: float) -> str:
    if n < MIN_SAMPLES:
        return 'insufficient_data'
    if edge_pp >= EDGE_POSITIVE_PP:
        return 'positive_edge'
    if edge_pp > 0:
        return 'marginal'
    if n >= N_KILL_MIN and edge_pp < EDGE_KILLED_PP:
        return 'killed'
    return 'negative_edge'


def update_all() -> list[dict]:
    db = SessionLocal()
    try:
        # Aggregate per source from closed user_trades
        rows = db.query(
            UserTrade.source,
            func.count(UserTrade.id).label('n'),
            func.sum(case((UserTrade.pnl_usdt > 0, 1), else_=0)).label('wins'),
            func.sum(case((UserTrade.pnl_usdt < 0, 1), else_=0)).label('losses'),
            func.sum(case((UserTrade.pnl_usdt > 0, UserTrade.pnl_usdt), else_=0.0)).label('sum_win'),
            func.sum(case((UserTrade.pnl_usdt < 0, UserTrade.pnl_usdt), else_=0.0)).label('sum_loss'),
            func.coalesce(func.sum(UserTrade.pnl_usdt), 0.0).label('total_pnl'),
        ).filter(
            UserTrade.status == 'closed',
            UserTrade.pnl_usdt.isnot(None),
        ).group_by(UserTrade.source).all()

        results = []
        for source, n, wins, losses, sum_win, sum_loss, total_pnl in rows:
            wins = int(wins or 0)
            losses = int(losses or 0)
            n = int(n or 0)
            sum_win = float(sum_win or 0)
            sum_loss = float(sum_loss or 0)
            total_pnl = float(total_pnl or 0)

            alpha = PRIOR_ALPHA + wins
            beta = PRIOR_BETA + losses
            stats = _beta_stats(alpha, beta)
            posterior_mean = stats['mean']

            avg_win = sum_win / wins if wins > 0 else None
            avg_loss = abs(sum_loss / losses) if losses > 0 else None
            payoff = (avg_win / avg_loss) if (avg_win and avg_loss and avg_loss > 0) else None
            break_even = (1.0 / (1.0 + payoff)) if payoff else None
            edge_pp = ((posterior_mean - break_even) * 100) if break_even is not None else None

            status = _classify(n, edge_pp if edge_pp is not None else 0)

            # Upsert
            row = db.query(SourceQuality).filter_by(source=source).first()
            if not row:
                row = SourceQuality(source=source)
                db.add(row)
            row.n_trades = n
            row.n_wins = wins
            row.n_losses = losses
            row.wr_alpha = alpha
            row.wr_beta = beta
            row.posterior_mean = round(posterior_mean, 4)
            row.posterior_std = round(stats['std'], 4)
            row.ci95_low = round(stats['ci_lo'], 4)
            row.ci95_high = round(stats['ci_hi'], 4)
            row.avg_win_usd = round(avg_win, 4) if avg_win else None
            row.avg_loss_usd = round(avg_loss, 4) if avg_loss else None
            row.payoff_ratio = round(payoff, 4) if payoff else None
            row.break_even_wr = round(break_even, 4) if break_even else None
            row.edge_pp = round(edge_pp, 2) if edge_pp is not None else None
            row.total_pnl_usd = round(total_pnl, 2)
            row.status = status
            row.last_updated = datetime.now(timezone.utc)

            results.append({
                'source': source, 'n': n, 'wins': wins, 'losses': losses,
                'wr': round(posterior_mean * 100, 1),
                'ci': (round(stats['ci_lo'] * 100, 1), round(stats['ci_hi'] * 100, 1)),
                'payoff': round(payoff, 2) if payoff else None,
                'break_even': round(break_even * 100, 1) if break_even else None,
                'edge_pp': round(edge_pp, 1) if edge_pp is not None else None,
                'total_pnl': round(total_pnl, 2),
                'status': status,
            })

        db.commit()
        return sorted(results, key=lambda r: -(r['edge_pp'] or -999))
    finally:
        db.close()


def _format_tg(results: list[dict]) -> str:
    icon = {
        'positive_edge': '✅',
        'marginal':      '🟡',
        'negative_edge': '🟠',
        'killed':        '☠️',
        'insufficient_data': '❓',
    }
    lines = ['🧮 <b>Bayesian source quality</b>', '<i>posterior WR (CI95) · edge vs break-even</i>', '']
    for r in results:
        mark = icon.get(r['status'], '?')
        ci = r['ci']
        wr = r['wr']
        line = f"{mark} <b>{r['source']:11s}</b> n={r['n']:>3d}  "
        line += f"WR={wr:>4.1f}%  ({ci[0]:.0f}-{ci[1]:.0f})"
        if r['break_even'] is not None:
            line += f"  vs BE={r['break_even']:.0f}%"
            if r['edge_pp'] is not None:
                edge_sign = '+' if r['edge_pp'] >= 0 else ''
                line += f"  edge={edge_sign}{r['edge_pp']}pp"
        line += f"  PnL=${r['total_pnl']:+.0f}"
        lines.append(line)
    return '\n'.join(lines)


def main():
    print(f'Running source quality update @ {datetime.now(timezone.utc).isoformat()}')
    results = update_all()
    msg = _format_tg(results)
    print(msg)
    try:
        from modules.tg_notifier import send_telegram_message
        from config.settings import TG_CHAT_ID
        if TG_CHAT_ID:
            send_telegram_message(msg, TG_CHAT_ID)
    except Exception as e:
        print(f'tg err: {e}')


if __name__ == '__main__':
    main()
