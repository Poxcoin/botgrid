"""
tools/reconcile_daily.py — Phase 1 of event-sourced sync rewrite.

Daily 06:00 UTC: per-user compare DB.closed_pnl_sum vs Bybit.closed_pnl_sum.
If drift > $5 → TG alert to owner.

Also runs force_reconcile.reconcile_user() to keep DB in sync.
"""
from __future__ import annotations
import sys, time as _t
from datetime import datetime, timezone, timedelta
sys.path.insert(0, '/opt/botgrid')
from dotenv import load_dotenv
load_dotenv('/opt/botgrid/.env')

from database import SessionLocal, User
from sqlalchemy.orm import joinedload
from modules.bybit_client import build_from_key_row
from tools.force_reconcile import reconcile_user

DRIFT_THRESHOLD_USD = 5.0
DELTA_NOTIFY_USD = 5.0  # only alert if drift changed by this much since last run
STATE_FILE = '/opt/botgrid/reconcile_state.json'


def _load_state() -> dict:
    import json, os
    if not os.path.exists(STATE_FILE):
        return {}
    try:
        with open(STATE_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


def _save_state(state: dict) -> None:
    import json
    try:
        with open(STATE_FILE, 'w') as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        print(f"state save err: {e}")


def _bybit_closed_pnl_sum_7d(ex) -> tuple[float, int]:
    end_ms = int(_t.time() * 1000)
    start_ms = end_ms - 7 * 86400 * 1000
    all_rows = []
    cursor = None
    for _ in range(50):
        params = {'category':'linear','startTime':start_ms,'endTime':end_ms,'limit':100}
        if cursor: params['cursor'] = cursor
        r = ex.privateGetV5PositionClosedPnl(params)
        all_rows.extend(r.get('result',{}).get('list',[]))
        cursor = r.get('result',{}).get('nextPageCursor')
        if not cursor: break
    total = sum(float(x.get('closedPnl', 0) or 0) for x in all_rows)
    return round(total, 2), len(all_rows)


def _db_closed_pnl_sum_7d(user_id: int) -> tuple[float, int]:
    import sqlite3
    conn = sqlite3.connect('/opt/botgrid/saas_database.sqlite')
    cur = conn.cursor()
    cur.execute(
        "SELECT COALESCE(SUM(pnl_usdt),0), COUNT(*) FROM user_trades "
        "WHERE user_id=? AND status='closed' AND closed_at >= datetime('now','-7 day')",
        (user_id,)
    )
    pnl, n = cur.fetchone()
    conn.close()
    return round(float(pnl or 0), 2), n


def main():
    print(f"Reconcile daily @ {datetime.now(timezone.utc).isoformat()}")
    db = SessionLocal()
    users = (
        db.query(User)
          .options(joinedload(User.api_keys))
          .filter(User.is_active == True)
          .all()
    )
    db.close()

    report_lines = ['📊 <b>Daily Reconcile</b>', '']
    state = _load_state()
    new_state = {}
    alert_needed = False
    inserted_any = False

    for u in users:
        key = next((k for k in u.api_keys if k.exchange == 'bybit'), None)
        if not key:
            continue

        rec = reconcile_user(u.id)
        n_new = rec.get('inserted', 0)
        if n_new > 0:
            inserted_any = True
            report_lines.append(f"  user {u.id} ({u.username}): inserted {n_new} missing trades (${rec.get('sum_pnl', 0):+.2f})")

        try:
            ex = build_from_key_row(key)
            bybit_sum, bybit_n = _bybit_closed_pnl_sum_7d(ex)
        except Exception as e:
            report_lines.append(f"  user {u.id}: bybit api err {e}")
            continue

        db_sum, db_n = _db_closed_pnl_sum_7d(u.id)
        drift = round(bybit_sum - db_sum, 2)
        marker = '🚨' if abs(drift) > DRIFT_THRESHOLD_USD else '✅'
        report_lines.append(
            f"  {marker} user {u.id} ({u.username}): DB=${db_sum:+.2f} ({db_n}) "
            f"Bybit=${bybit_sum:+.2f} ({bybit_n})  drift=${drift:+.2f}"
        )

        prev_drift = float(state.get(str(u.id), {}).get('drift', 0))
        new_state[str(u.id)] = {'drift': drift, 'ts': datetime.now(timezone.utc).isoformat()}
        if abs(drift - prev_drift) > DELTA_NOTIFY_USD:
            alert_needed = True

    _save_state(new_state)
    msg = '\n'.join(report_lines)
    print(msg)

    try:
        from modules.tg_notifier import send_telegram_message
        from config.settings import TG_CHAT_ID
        if TG_CHAT_ID and (alert_needed or inserted_any):
            send_telegram_message(msg, TG_CHAT_ID)
    except Exception as e:
        print(f"tg err: {e}")


if __name__ == "__main__":
    main()
