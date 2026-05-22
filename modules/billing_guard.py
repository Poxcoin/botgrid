"""
modules/billing_guard.py — Phase 6 of event-sourced sync rewrite.

Drift guard for performance fee billing. Refuses billing if any active user
has drift > $5 between trade_events and Bybit ground truth.

Also provides authoritative PnL calculation from trade_events (replaces
user_trades.pnl_usdt sum used by legacy billing_cron_weekly.py).
"""
from __future__ import annotations

import os
import sqlite3
import time as _t
from datetime import datetime, timezone, timedelta
from typing import Optional

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from database import SessionLocal, User, UserApiKey, TradeEvent
from modules.bybit_client import build_from_key_row


DB_PATH = '/opt/botgrid/saas_database.sqlite'
DRIFT_THRESHOLD_USD = 5.0
INGESTOR_SILENCE_MAX = timedelta(minutes=30)


def _bybit_pnl_7d(ex) -> tuple[float, int]:
    end_ms = int(_t.time() * 1000)
    start_ms = end_ms - 7 * 86400 * 1000
    rows = []
    cursor = None
    for _ in range(50):
        params = {'category':'linear','startTime':start_ms,'endTime':end_ms,'limit':100}
        if cursor: params['cursor'] = cursor
        r = ex.privateGetV5PositionClosedPnl(params)
        rows.extend(r.get('result',{}).get('list',[]) or [])
        cursor = r.get('result',{}).get('nextPageCursor') or None
        if not cursor: break
    return round(sum(float(x.get('closedPnl', 0) or 0) for x in rows), 2), len(rows)


def _events_pnl_7d(user_id: int) -> tuple[float, int]:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute(
        "SELECT COALESCE(SUM(pnl_usdt),0), COUNT(*) FROM trade_events "
        "WHERE user_id=? AND event_type='CLOSED_PNL' AND event_ts >= datetime('now','-7 day')",
        (user_id,)
    )
    pnl, n = cur.fetchone()
    conn.close()
    return round(float(pnl or 0), 2), n


def _last_ingest_age(user_id: int) -> Optional[timedelta]:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT MAX(ingested_at) FROM trade_events WHERE user_id=?", (user_id,))
    row = cur.fetchone()
    conn.close()
    if not row or not row[0]:
        return None
    raw = row[0].split('.')[0] if '.' in row[0] else row[0]
    last = datetime.strptime(raw, '%Y-%m-%d %H:%M:%S')
    return datetime.now(timezone.utc).replace(tzinfo=None) - last


def check_billing_safe() -> dict:
    """
    Verify all active users have:
      1. Drift < $5 between events and Bybit
      2. Ingestor activity within INGESTOR_SILENCE_MAX

    Returns:
      {
        "safe": bool,
        "issues": [str, ...],
        "per_user": {user_id: {drift, events_pnl, bybit_pnl, last_ingest, status}}
      }
    """
    db = SessionLocal()
    users = db.query(User).filter(User.is_active == True).all()
    db.close()

    per_user = {}
    issues = []

    for u in users:
        db = SessionLocal()
        key = db.query(UserApiKey).filter_by(user_id=u.id, exchange='bybit').first()
        db.close()
        if not key:
            per_user[u.id] = {'status': 'no_key'}
            continue

        age = _last_ingest_age(u.id)
        if age is None:
            issues.append(f'user {u.id} ({u.email}): no events ever ingested')
            per_user[u.id] = {'status': 'no_events'}
            continue
        if age > INGESTOR_SILENCE_MAX:
            issues.append(f'user {u.id}: ingestor silent {age}')

        ev_pnl, ev_n = _events_pnl_7d(u.id)
        try:
            ex = build_from_key_row(key)
            bb_pnl, bb_n = _bybit_pnl_7d(ex)
        except Exception as e:
            issues.append(f'user {u.id}: bybit api err {e}')
            per_user[u.id] = {'status': 'api_err', 'err': str(e)}
            continue

        drift = round(bb_pnl - ev_pnl, 2)
        status = 'safe' if abs(drift) <= DRIFT_THRESHOLD_USD else 'drift'
        if status == 'drift':
            issues.append(
                f'user {u.id} ({u.email}): drift ${drift:+.2f} '
                f'(events ${ev_pnl:+.2f} vs bybit ${bb_pnl:+.2f})'
            )
        per_user[u.id] = {
            'status': status,
            'drift': drift,
            'events_pnl_7d': ev_pnl,
            'events_n': ev_n,
            'bybit_pnl_7d': bb_pnl,
            'bybit_n': bb_n,
            'last_ingest_age_s': int(age.total_seconds()) if age else None,
        }

    return {
        'safe': len(issues) == 0,
        'issues': issues,
        'per_user': per_user,
        'checked_at': datetime.now(timezone.utc).isoformat(),
    }


def calc_weekly_pnl_events(user_id: int, year: int, week: int) -> float:
    """
    Compute weekly PnL from trade_events (ground truth) for billing.
    Replaces legacy user_trades.pnl_usdt SUM.

    Includes CLOSED_PNL + SETTLEMENT + FUNDING events = NET realized.
    """
    monday = datetime.fromisocalendar(year, week, 1)  # naive UTC
    sunday = monday + timedelta(days=6, hours=23, minutes=59, seconds=59)

    db = SessionLocal()
    try:
        from sqlalchemy import func
        result = db.query(func.sum(TradeEvent.pnl_usdt)).filter(
            TradeEvent.user_id == user_id,
            TradeEvent.event_type.in_(['CLOSED_PNL', 'SETTLEMENT', 'FUNDING']),
            TradeEvent.event_ts >= monday,
            TradeEvent.event_ts <= sunday,
        ).scalar()
        return float(result or 0.0)
    finally:
        db.close()
