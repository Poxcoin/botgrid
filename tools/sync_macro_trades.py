"""
tools/sync_macro_trades.py — pull macro_bot MT5 trades → main user_trades DB.

Runs every 5 min via cron. Idempotent (UNIQUE on (user_id, source, order_id)).

Source mapping:
  forex pair (EURUSD/GBPUSD/AUDJPY/etc) → 'macro_forex'
  gold (XAUUSD)                          → 'macro_gold'
  silver (XAGUSD)                        → 'macro_metals'
  index (US500/NAS100/etc)               → 'macro_indices'
  other                                  → 'macro_other'

All trades attributed to OWNER_LIVE_USER_ID (Poxcoin) since MT5 is owner-controlled.
"""
from __future__ import annotations

import os
import sys
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, '/opt/botgrid')
from dotenv import load_dotenv
load_dotenv('/opt/botgrid/.env')

from sqlalchemy import text
from database import SessionLocal

MACRO_DB = Path('/opt/botgrid/macro_bot/macro_trades.db')
OWNER_USER_ID = int(os.getenv('OWNER_LIVE_USER_ID', '1') or '1')

FOREX_PAIRS = {'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD',
                'USDCHF', 'EURJPY', 'GBPJPY', 'AUDJPY', 'EURGBP', 'EURCHF'}
GOLD = {'XAUUSD', 'GOLD'}
SILVER = {'XAGUSD', 'SILVER'}
INDICES = {'US500', 'NAS100', 'US30', 'GER40', 'JPN225', 'UK100'}


def _source_for(symbol: str) -> str:
    s = (symbol or '').upper().replace('.', '').replace('-', '')
    if s in GOLD:
        return 'macro_gold'
    if s in SILVER:
        return 'macro_metals'
    if s in INDICES:
        return 'macro_indices'
    if s in FOREX_PAIRS:
        return 'macro_forex'
    return 'macro_other'


def _parse_dt(s: str | None) -> datetime | None:
    if not s:
        return None
    for fmt in ('%Y-%m-%d %H:%M:%S', '%Y-%m-%dT%H:%M:%S', '%Y.%m.%d %H:%M:%S'):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except (ValueError, TypeError):
            continue
    return None


def sync() -> tuple[int, int]:
    if not MACRO_DB.exists():
        print(f'macro DB not found: {MACRO_DB}')
        return 0, 0
    src = sqlite3.connect(str(MACRO_DB))
    src.row_factory = sqlite3.Row
    rows = src.execute(
        'SELECT ticket, symbol, direction, volume, open_price, close_price, '
        'open_time, close_time, profit_usd, status FROM trades'
    ).fetchall()
    src.close()
    if not rows:
        return 0, 0

    db = SessionLocal()
    inserted = updated = 0
    try:
        for r in rows:
            order_id = f"mt5_{r['ticket']}"
            source = _source_for(r['symbol'])
            side = 'LONG' if (r['direction'] or '').upper() in ('BUY', 'LONG') else 'SHORT'
            status = 'closed' if (r['status'] or '').lower() == 'closed' else 'open'

            existing = db.execute(text(
                "SELECT id FROM user_trades WHERE user_id=:u AND order_id=:oid"
            ), {'u': OWNER_USER_ID, 'oid': order_id}).fetchone()

            opened_at = _parse_dt(r['open_time'])
            closed_at = _parse_dt(r['close_time']) if status == 'closed' else None

            if existing:
                db.execute(text(
                    "UPDATE user_trades SET status=:s, exit_price=:ep, pnl_usdt=:p, "
                    "closed_at=:ct WHERE id=:id"
                ), {
                    's': status, 'ep': r['close_price'], 'p': r['profit_usd'] or 0,
                    'ct': closed_at, 'id': existing[0],
                })
                updated += 1
            else:
                db.execute(text(
                    "INSERT INTO user_trades(user_id, source, symbol, side, leverage, "
                    "entry_price, exit_price, qty, pnl_usdt, status, order_id, opened_at, closed_at) "
                    "VALUES(:u, :src, :sym, :side, :lev, :ep, :xp, :q, :p, :s, :oid, :ot, :ct)"
                ), {
                    'u': OWNER_USER_ID, 'src': source, 'sym': r['symbol'], 'side': side,
                    'lev': 1, 'ep': r['open_price'], 'xp': r['close_price'],
                    'q': r['volume'], 'p': r['profit_usd'] or 0,
                    's': status, 'oid': order_id, 'ot': opened_at, 'ct': closed_at,
                })
                inserted += 1
        db.commit()
    finally:
        db.close()
    return inserted, updated


if __name__ == '__main__':
    ins, upd = sync()
    if ins or upd:
        print(f'[macro_sync] inserted={ins} updated={upd}')
