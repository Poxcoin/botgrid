"""
tools/sync_health.py — Phase 5 monitoring.

Daily 23:50 UTC cron: verify event-sourced pipeline still produces accurate
billing vs Bybit ground truth. TG alert on any drift > $5 OR if ingestor
hasn't ingested new events in last 30 minutes (silent failure mode).
"""
from __future__ import annotations

import os
import sys
import sqlite3
from datetime import datetime, timezone, timedelta
sys.path.insert(0, '/opt/botgrid')
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from database import SessionLocal, User, UserApiKey, TradeEvent
from modules.bybit_client import build_from_key_row

DB_PATH = '/opt/botgrid/saas_database.sqlite'
DRIFT_THRESHOLD = 5.0
INGESTOR_SILENCE_MAX = timedelta(minutes=30)


def _last_ingest_age(user_id: int) -> timedelta | None:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("SELECT MAX(ingested_at) FROM trade_events WHERE user_id=?", (user_id,))
    row = cur.fetchone()
    conn.close()
    if not row or not row[0]:
        return None
    last = datetime.fromisoformat(row[0]) if 'T' in row[0] else datetime.strptime(row[0], '%Y-%m-%d %H:%M:%S.%f' if '.' in row[0] else '%Y-%m-%d %H:%M:%S')
    return datetime.utcnow() - last


def _events_pnl(user_id: int) -> tuple[float, int]:
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


def _bybit_pnl(ex) -> tuple[float, int]:
    import time as _t
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
    total = sum(float(x.get('closedPnl', 0) or 0) for x in rows)
    return round(total, 2), len(rows)


def main():
    db = SessionLocal()
    users = db.query(User).filter(User.is_active == True).all()
    db.close()

    lines = ['🏥 <b>Sync Health Check</b>', '']
    has_issue = False

    for u in users:
        db = SessionLocal()
        key = db.query(UserApiKey).filter_by(user_id=u.id, exchange='bybit').first()
        db.close()
        if not key:
            continue

        age = _last_ingest_age(u.id)
        if age is None:
            lines.append(f'  🚨 user {u.id}: NO events ever ingested')
            has_issue = True
            continue
        if age > INGESTOR_SILENCE_MAX:
            lines.append(f'  🚨 user {u.id}: ingestor silent for {age}')
            has_issue = True

        ev_pnl, ev_n = _events_pnl(u.id)
        try:
            ex = build_from_key_row(key)
            bb_pnl, bb_n = _bybit_pnl(ex)
        except Exception as e:
            lines.append(f'  ⚠️ user {u.id}: bybit api err {e}')
            continue

        drift = round(bb_pnl - ev_pnl, 2)
        marker = '🚨' if abs(drift) > DRIFT_THRESHOLD else '✅'
        lines.append(
            f'  {marker} user {u.id}: events ${ev_pnl:+.2f} ({ev_n})  '
            f'bybit ${bb_pnl:+.2f} ({bb_n})  drift ${drift:+.2f}  '
            f'last_ingest {age}'
        )
        if abs(drift) > DRIFT_THRESHOLD:
            has_issue = True

    msg = '\n'.join(lines)
    print(msg)

    if has_issue:
        try:
            from modules.tg_notifier import send_telegram_message, tg_footer
            from config.settings import TG_CHAT_ID
            if TG_CHAT_ID:
                send_telegram_message(msg + tg_footer('track'), TG_CHAT_ID)
        except Exception as e:
            print(f'tg err: {e}')


if __name__ == '__main__':
    main()
