"""
modules/adaptive_sizing.py — rolling per-(symbol, source) PnL → size multiplier.

Council 2026-05-25 Alt 1: avoid coin blacklists. Instead, scale position size
by the recent performance of each (symbol, source) pair. Losers shrink to 20%,
winners stay at 100%+. Works for ANY failure mode, no regime prediction needed.

Multiplier formula (margin-relative, NOT notional — see _MARGIN_RELATIVE note below):
    rolling_pnl_pct = sum(last_N_pnl_usdt) / sum(last_N_margin_usdt) * 100
    multiplier      = clamp(MIN_MULT, 1.0 + rolling_pnl_pct / 10, MAX_MULT)

Defaults: N=14 trades, MIN_MULT=0.2, MAX_MULT=1.5, NEW_PAIR_MULT=0.7.

New (symbol, source) pairs with <3 closed trades return NEW_PAIR_MULT (0.7) —
they start at 70% size and only grow as edge proves out. Council Alt 1 intent:
unproven pairs MUST be capped, not given full size.

Feature flag (env): ADAPTIVE_SIZING_SOURCES="smartmoney,fr"
  - Empty/unset → adaptive sizing disabled globally (returns 1.0)
  - Otherwise   → only listed sources get adaptive multiplier; others return 1.0
"""
from __future__ import annotations

import os
import time
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from database import SessionLocal

ROLLING_N = 14
MIN_MULT = 0.2
MAX_MULT = 1.5
DEFAULT_MULT = 1.0
NEW_PAIR_MULT = 0.7  # conservative cap for pairs with <3 closed trades
# Baseline assumes user_trades.closed_at is stored as Python datetime via SQLAlchemy,
# which SQLite serialises as 'YYYY-MM-DD HH:MM:SS[.ffffff]' (space separator, no tz).
# If sync code ever switches to ISO 'T' separator or appends a timezone suffix, this
# text comparison silently drops rows — see warning log in get_size_multiplier.
_BASELINE = '2026-05-19 21:06:00'
# Symbols we know have recent closed news trades — used only for the baseline-mismatch
# warning. Empty set disables the check.
_KNOWN_GOOD_NEWS_SYMBOLS = {'LINK/USDT:USDT', 'XRP/USDT:USDT', 'ONDO/USDT:USDT'}


def _enabled_sources() -> set[str]:
    raw = os.getenv('ADAPTIVE_SIZING_SOURCES', '').strip()
    if not raw:
        return set()
    return {s.strip() for s in raw.split(',') if s.strip()}


def get_size_multiplier(symbol: str, source: str) -> float:
    """Return size multiplier for next trade on (symbol, source).

    Reads last ROLLING_N closed trades from user_trades.
    - Disabled / source not in flag → DEFAULT_MULT (1.0)
    - <3 closed trades on the pair → NEW_PAIR_MULT (0.7, conservative cap)
    - SQLite OperationalError → re-raised so dispatcher sees real DB failures
    - Other exceptions → DEFAULT_MULT (1.0) with typed log
    """
    sources = _enabled_sources()
    if source not in sources:
        return DEFAULT_MULT
    db = SessionLocal()
    try:
        rows = db.execute(text(
            """
            SELECT pnl_usdt, qty, entry_price, leverage
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
            # Safety: known-good (symbol, source) returning 0 rows likely means
            # the baseline format no longer matches closed_at storage format.
            if not rows and source == 'news' and symbol in _KNOWN_GOOD_NEWS_SYMBOLS:
                print(
                    f'[adaptive_sizing] WARN baseline mismatch suspected: '
                    f'{symbol}/{source} returned 0 rows since {_BASELINE!r} '
                    f'(check closed_at storage format)'
                )
            return NEW_PAIR_MULT

        # Margin-relative PnL: pnl_usdt / (qty * entry_price) is leveraged-return.
        # qty * entry_price is the NOTIONAL exposure; dividing pnl by notional gives
        # the price-move %, not the margin return. To recover margin-relative return
        # (which matches what the trader actually earns/loses on collateral) multiply
        # the denominator by 1/leverage — i.e. use margin = notional / leverage.
        sum_pnl = sum(float(r[0] or 0) for r in rows)
        sum_margin = 0.0
        for r in rows:
            qty = float(r[1] or 0)
            entry = float(r[2] or 0)
            lev = float(r[3] or 1) or 1.0  # default to 1x if NULL/0
            notional = qty * entry
            sum_margin += notional / lev
        if sum_margin <= 0:
            return DEFAULT_MULT

        pnl_pct = (sum_pnl / sum_margin) * 100.0
        mult = 1.0 + pnl_pct / 10.0
        return max(MIN_MULT, min(mult, MAX_MULT))
    except OperationalError:
        # DB locked / disk I/O / schema mismatch — caller (dispatcher) must see this.
        raise
    except Exception as e:
        print(f'[adaptive_sizing] {symbol}/{source} {type(e).__name__}: {e}')
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
