"""
modules/event_ingestor.py — Phase 2 of event-sourced sync.

Pulls Bybit events (closed-pnl + transaction log) and ingests as immutable rows
into trade_events. Idempotent via UNIQUE(user_id, bybit_event_id).

Sources:
  REST_CLOSED_PNL  — /v5/position/closed-pnl   (event_type=CLOSED_PNL)
  REST_TXN_LOG     — /v5/account/transaction-log (event_type=FUNDING/SETTLEMENT/...)

Phase 3 will add WS_EXECUTION + WS_POSITION for realtime.
"""
from __future__ import annotations

import json
import os
import time as _t
from datetime import datetime, timezone
from typing import Iterable

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from sqlalchemy.exc import IntegrityError

from database import SessionLocal, User, UserApiKey, TradeEvent
from modules.bybit_client import build_from_key_row


_BYBIT_WINDOW_SEC = 7 * 86400  # closed-pnl + txn log limit


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _from_ms(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, timezone.utc).replace(tzinfo=None)


def _paginate_7d(ex, endpoint_fn, params_extra: dict, max_pages: int = 50) -> list[dict]:
    """Paginate a Bybit V5 endpoint within a single 7d window."""
    end_ms = int(_t.time() * 1000)
    start_ms = end_ms - _BYBIT_WINDOW_SEC * 1000
    rows: list[dict] = []
    cursor = None
    for _ in range(max_pages):
        params = {'category': 'linear', 'startTime': start_ms, 'endTime': end_ms, 'limit': 100, **params_extra}
        if cursor:
            params['cursor'] = cursor
        r = endpoint_fn(params)
        rows.extend(r.get('result', {}).get('list', []) or [])
        cursor = r.get('result', {}).get('nextPageCursor') or None
        if not cursor:
            break
    return rows


def _closed_pnl_to_event(user_id: int, it: dict) -> dict | None:
    oid = it.get('orderId') or ''
    updated_ms = int(it.get('updatedTime') or 0)
    if not oid or not updated_ms:
        return None
    # Composite event id — Bybit's orderId is unique per close. updatedTime makes
    # accidental orderId collisions impossible to dedup-collide.
    eid = f"cp:{oid}:{updated_ms}"
    side_str = (it.get('side') or '').upper()
    position_side = 'SHORT' if side_str == 'BUY' else 'LONG'  # closing side inverts position
    return dict(
        user_id=user_id,
        bybit_event_id=eid,
        event_type='CLOSED_PNL',
        source_channel='REST_CLOSED_PNL',
        symbol=it.get('symbol') or None,
        side=position_side,
        qty=float(it.get('qty') or 0) or None,
        price=float(it.get('avgExitPrice') or 0) or None,
        pnl_usdt=float(it.get('closedPnl') or 0),
        fee_usdt=None,
        order_id=oid,
        raw_json=json.dumps(it, separators=(',', ':')),
        event_ts=_from_ms(updated_ms),
    )


def _txn_to_event(user_id: int, it: dict) -> dict | None:
    tid = it.get('id') or it.get('transactionTime') or ''
    if not tid:
        return None
    typ = (it.get('type') or 'UNKNOWN').upper()
    # Map Bybit txn types we care about; TRADE rows duplicate closed-pnl, skip them
    if typ == 'TRADE':
        return None
    ts_ms = int(it.get('transactionTime') or 0)
    if not ts_ms:
        return None
    eid = f"tx:{tid}"
    return dict(
        user_id=user_id,
        bybit_event_id=eid,
        event_type=typ,  # SETTLEMENT | FUNDING | TRANSFER_IN | TRANSFER_OUT | ...
        source_channel='REST_TXN_LOG',
        symbol=it.get('symbol') or None,
        side=None,
        qty=None,
        price=None,
        pnl_usdt=float(it.get('change') or 0),
        fee_usdt=float(it.get('fee') or 0) if it.get('fee') else None,
        order_id=it.get('orderId') or None,
        raw_json=json.dumps(it, separators=(',', ':')),
        event_ts=_from_ms(ts_ms),
    )


def _bulk_insert(db, rows: Iterable[dict]) -> int:
    """Insert rows skipping duplicates (UNIQUE constraint on user_id+bybit_event_id)."""
    inserted = 0
    for row in rows:
        try:
            db.add(TradeEvent(**row))
            db.flush()
            inserted += 1
        except IntegrityError:
            db.rollback()
            continue
    db.commit()
    return inserted


def ingest_user(user_id: int) -> dict:
    """Pull 7d closed-pnl + txn-log and append to trade_events. Idempotent."""
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.id == user_id).first()
        if not u:
            return {'err': 'no user'}
        key = db.query(UserApiKey).filter_by(user_id=user_id, exchange='bybit').first()
        if not key:
            return {'err': 'no key'}
        ex = build_from_key_row(key)
        if not ex:
            return {'err': 'no exchange'}

        # 1. CLOSED_PNL events
        cp_rows = _paginate_7d(ex, ex.privateGetV5PositionClosedPnl, {})
        cp_events = [e for it in cp_rows if (e := _closed_pnl_to_event(user_id, it))]
        cp_inserted = _bulk_insert(db, cp_events)

        # 2. Transaction log events
        tx_rows = _paginate_7d(ex, ex.privateGetV5AccountTransactionLog, {})
        tx_events = [e for it in tx_rows if (e := _txn_to_event(user_id, it))]
        tx_inserted = _bulk_insert(db, tx_events)

        return {
            'closed_pnl': {'fetched': len(cp_rows), 'inserted': cp_inserted},
            'txn_log':    {'fetched': len(tx_rows), 'inserted': tx_inserted},
        }
    except Exception as e:
        db.rollback()
        return {'err': str(e)}
    finally:
        db.close()


def ingest_all_active() -> dict:
    db = SessionLocal()
    user_ids = [u.id for u in db.query(User).filter(User.is_active == True).all()]
    db.close()
    out = {}
    for uid in user_ids:
        out[uid] = ingest_user(uid)
    return out


if __name__ == '__main__':
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == 'all':
        result = ingest_all_active()
        for uid, r in result.items():
            print(f'user {uid}: {r}')
    else:
        uid = int(sys.argv[1]) if len(sys.argv) > 1 else 1
        print(ingest_user(uid))
