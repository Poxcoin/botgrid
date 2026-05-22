"""
tools/derive_user_trades.py — Phase 4 of event-sourced sync.

Rebuilds user_trades from trade_events while preserving signal_id linkage on
bot-tagged rows. monthly_pnl recomputed from the result.

Algorithm:
  1. For each user_trades row with source IN bot list AND status='closed':
     match a trade_event by (order_id) OR (symbol + opened_at ± 1h + qty ± 10%)
     UPDATE pnl_usdt, exit_price ← event ground truth
  2. DELETE legacy rows where source IN ('bybit', 'bybit_manual')
  3. INSERT fresh source='bybit_event' rows from events that match no bot row
  4. Recompute monthly_pnl SUM
  5. TG report of changes
"""
from __future__ import annotations

import os
import sys
from datetime import datetime, timezone, timedelta
sys.path.insert(0, '/opt/botgrid')
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

from database import SessionLocal, UserTrade, TradeEvent, MonthlyPnl, User
from sqlalchemy import func, and_


_BOT_SOURCES = {
    "news", "dex", "sweep", "orderblock", "cascade", "liq_cascade",
    "trend", "fr", "listing", "whale", "smartmoney",
}
_LEGACY_SOURCES = {"bybit", "bybit_manual", "bybit_event"}  # bybit_event is replaced fresh each run
_QTY_TOL = 0.05        # 5% qty tolerance (Council Phase 4.5: tightened from 10%)
_TIME_TOL = timedelta(minutes=15)  # ±15 min (Council: tightened from ±2h)


def _normalize_symbol(s: str | None) -> str:
    if not s:
        return ""
    import re
    return re.split(r"[/:]", s.upper())[0].removesuffix("USDT")


def _match_event_to_bot_row(event: TradeEvent, bot_rows: list[UserTrade], matched_ids: set[int]) -> UserTrade | None:
    """Returns the bot row this event corresponds to, if any."""
    # Direct: same order_id
    if event.order_id:
        for r in bot_rows:
            if r.id in matched_ids:
                continue
            if r.order_id and r.order_id == event.order_id:
                return r
    # Fuzzy: same coin + opened_at within tolerance + qty within tolerance
    e_coin = _normalize_symbol(event.symbol)
    if not e_coin or not event.qty:
        return None
    for r in bot_rows:
        if r.id in matched_ids:
            continue
        if _normalize_symbol(r.symbol) != e_coin:
            continue
        if not r.qty:
            continue
        if abs(r.qty - event.qty) / max(r.qty, event.qty) > _QTY_TOL:
            continue
        if r.opened_at and event.event_ts:
            diff = abs((event.event_ts - r.opened_at.replace(tzinfo=None)).total_seconds())
            if diff > _TIME_TOL.total_seconds():
                continue
        return r
    return None


def derive_user(user_id: int) -> dict:
    db = SessionLocal()
    matched_row_ids: set[int] = set()
    try:
        events = (
            db.query(TradeEvent)
              .filter(TradeEvent.user_id == user_id, TradeEvent.event_type == 'CLOSED_PNL')
              .all()
        )
        # Council Phase 4.5: skip open bot rows — they'll be closed by their own flow.
        # Avoids race condition where derive sees event before position_closer matches.
        bot_rows = (
            db.query(UserTrade)
              .filter(
                  UserTrade.user_id == user_id,
                  UserTrade.source.in_(_BOT_SOURCES),
                  UserTrade.status == 'closed',
              )
              .all()
        )
        legacy_count = (
            db.query(UserTrade)
              .filter(UserTrade.user_id == user_id, UserTrade.source.in_(_LEGACY_SOURCES))
              .delete(synchronize_session=False)
        )

        updated_bot = 0
        new_event_rows = 0
        for ev in events:
            match = _match_event_to_bot_row(ev, bot_rows, matched_row_ids)
            if match:
                if (match.pnl_usdt or 0) != (ev.pnl_usdt or 0):
                    match.pnl_usdt = ev.pnl_usdt
                    updated_bot += 1
                if ev.price and not match.exit_price:
                    match.exit_price = ev.price
                if not match.closed_at:
                    match.closed_at = ev.event_ts
                matched_row_ids.add(match.id)
            else:
                row = UserTrade(
                    user_id=user_id,
                    source='bybit_event',
                    symbol=ev.symbol,
                    side=ev.side,
                    leverage=3,
                    entry_price=None,
                    exit_price=ev.price,
                    qty=ev.qty,
                    pnl_usdt=ev.pnl_usdt,
                    status='closed',
                    order_id=ev.order_id,
                    opened_at=ev.event_ts,
                    closed_at=ev.event_ts,
                )
                db.add(row)
                new_event_rows += 1

        db.commit()

        # Recompute monthly_pnl from trade_events directly (Council Phase 4.5).
        # Includes CLOSED_PNL + SETTLEMENT/FUNDING — billing on NET realized PnL.
        agg = (
            db.query(
                func.strftime('%Y', TradeEvent.event_ts).label('y'),
                func.strftime('%m', TradeEvent.event_ts).label('m'),
                func.coalesce(func.sum(TradeEvent.pnl_usdt), 0.0).label('gross'),
            )
            .filter(
                TradeEvent.user_id == user_id,
                TradeEvent.event_type.in_(['CLOSED_PNL', 'SETTLEMENT', 'FUNDING']),
            )
            .group_by('y', 'm')
            .all()
        )
        for y, m, gross in agg:
            if not y or not m:
                continue
            year_i, month_i = int(y), int(m)
            row = (
                db.query(MonthlyPnl)
                  .filter_by(user_id=user_id, year=year_i, month=month_i)
                  .first()
            )
            if not row:
                row = MonthlyPnl(user_id=user_id, year=year_i, month=month_i)
                db.add(row)
            row.gross_pnl = float(gross)
            row.performance_fee = max(0.0, float(gross) * 0.20)
            row.net_pnl = row.gross_pnl - row.performance_fee
        db.commit()

        return {
            'legacy_deleted': legacy_count,
            'bot_rows_updated': updated_bot,
            'new_event_rows': new_event_rows,
        }
    except Exception as e:
        db.rollback()
        return {'err': str(e)}
    finally:
        db.close()


def derive_all() -> dict:
    db = SessionLocal()
    user_ids = [u.id for u in db.query(User).filter(User.is_active == True).all()]
    db.close()
    out = {}
    for uid in user_ids:
        out[uid] = derive_user(uid)
    return out


def _format_report(results: dict) -> str:
    lines = ['🔧 <b>Derive user_trades from events</b>', '']
    for uid, r in results.items():
        if 'err' in r:
            lines.append(f'  user {uid}: ERR {r["err"]}')
            continue
        lines.append(
            f"  user {uid}: deleted {r['legacy_deleted']} legacy, "
            f"updated {r['bot_rows_updated']} bot, +{r['new_event_rows']} event rows"
        )
    return '\n'.join(lines)


if __name__ == '__main__':
    results = derive_all()
    msg = _format_report(results)
    print(msg)
    try:
        from modules.tg_notifier import send_telegram_message
        from config.settings import TG_CHAT_ID
        if TG_CHAT_ID:
            send_telegram_message(msg, TG_CHAT_ID)
    except Exception as e:
        print(f'tg err: {e}')
