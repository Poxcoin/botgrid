"""
modules/adaptive_sizing.py — rolling per-(symbol, source) PnL → size multiplier.

Council 2026-05-25 Alt 1: avoid coin blacklists. Instead, scale position size
by the recent performance of each (symbol, source) pair. Losers shrink to 20%,
winners stay at 100%+. Works for ANY failure mode, no regime prediction needed.

Multiplier formula:
    rolling_pnl_pct = sum(last_N_pnl_usdt) / sum(last_N_notional_usdt) * 100
    multiplier      = clamp(MIN_MULT, 1.0 + rolling_pnl_pct / 10, MAX_MULT)

Defaults: N=14 trades, MIN_MULT=0.2, MAX_MULT=1.5.

Feature flag (env): ADAPTIVE_SIZING_SOURCES="smartmoney,fr"
  - Empty/unset → adaptive sizing disabled globally (returns 1.0)
  - Otherwise   → only listed sources get adaptive multiplier; others return 1.0
"""
from __future__ import annotations

import os
import time
from sqlalchemy import text

from database import SessionLocal

ROLLING_N = 14
MIN_MULT = 0.2
MAX_MULT = 1.5
DEFAULT_MULT = 1.0
_BASELINE = '2026-05-19 21:06:00'


def _enabled_sources() -> set[str]:
    raw = os.getenv('ADAPTIVE_SIZING_SOURCES', '').strip()
    if not raw:
        return set()
    return {s.strip() for s in raw.split(',') if s.strip()}


def get_size_multiplier(symbol: str, source: str) -> float:
    """Return size multiplier for next trade on (symbol, source).

    Reads last ROLLING_N closed trades from user_trades.
    Falls back to 1.0 if disabled, insufficient data, or query error.
    """
    sources = _enabled_sources()
    if source not in sources:
        return DEFAULT_MULT
    db = SessionLocal()
    try:
        rows = db.execute(text(
            """
            SELECT pnl_usdt, qty, entry_price
            FROM user_trades
            WHERE status = 'closed'
              AND source = :source
              AND symbol = :symbol
              AND closed_at >= :baseline
            ORDER BY closed_at DESC
            LIMIT :n
            """
        ), {
            'source': source, 'symbol': symbol,
            'baseline': _BASELINE, 'n': ROLLING_N,
        }).fetchall()

        if len(rows) < 3:
            return DEFAULT_MULT

        sum_pnl = sum(float(r[0] or 0) for r in rows)
        sum_notional = sum(float(r[1] or 0) * float(r[2] or 0) for r in rows)
        if sum_notional <= 0:
            return DEFAULT_MULT

        pnl_pct = (sum_pnl / sum_notional) * 100.0
        mult = 1.0 + pnl_pct / 10.0
        return max(MIN_MULT, min(mult, MAX_MULT))
    except Exception as e:
        print(f'[adaptive_sizing] {symbol}/{source} err: {e}')
        return DEFAULT_MULT
    finally:
        db.close()


if __name__ == '__main__':
    # Smoke test: print current multipliers for active (symbol, source) pairs
    db = SessionLocal()
    try:
        rows = db.execute(text(
            """
            SELECT DISTINCT symbol, source FROM user_trades
            WHERE status='closed' AND closed_at >= :baseline
            """
        ), {'baseline': _BASELINE}).fetchall()
        print(f'Enabled sources: {sorted(_enabled_sources()) or "(none)"}')
        print(f'{"symbol":18} {"source":12} → multiplier')
        print('-' * 50)
        os.environ['ADAPTIVE_SIZING_SOURCES'] = 'news,smartmoney,fr,trend,dex'
        for sym, src in rows:
            m = get_size_multiplier(sym, src)
            print(f'{sym:18} {src:12} → {m:.3f}x')
    finally:
        db.close()
