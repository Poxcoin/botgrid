"""
Daily PnL report — runs at 23:55 UTC via cron.

For each active user:
  1. Query user_trades closed today → per-source breakdown
  2. Query Bybit closed-pnl API → cross-check totals
  3. Send TG message summary

Output to TG_CHAT_ID (admin/owner) + per-user tg_chat_id.
"""
import sys
import os
import time
from datetime import datetime, timezone, timedelta
from collections import defaultdict

sys.path.insert(0, '/opt/botgrid')
os.chdir('/opt/botgrid')

from dotenv import load_dotenv
load_dotenv('/opt/botgrid/.env')

from sqlalchemy.orm import joinedload
from database import SessionLocal, User
from modules.tg_notifier import send_telegram_message
from modules.bybit_client import build_from_key_row, get_balance, get_closed_pnl
from config.settings import TG_CHAT_ID


def _today_utc_bounds():
    """Return (start_ts_ms, end_ts_ms) for current UTC day."""
    now = datetime.now(timezone.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return int(start.timestamp() * 1000), int(end.timestamp() * 1000)


def _bybit_closed_pnl(key_row, start_ms: int, end_ms: int):
    """Fetch all closed-pnl rows from Bybit for given window."""
    ex = build_from_key_row(key_row)
    rows = get_closed_pnl(ex, start_ms, end_ms)
    pnl = sum(float(r.get('closedPnl', 0) or 0) for r in rows)
    wins = sum(1 for r in rows if float(r.get('closedPnl', 0) or 0) > 0)
    losses = sum(1 for r in rows if float(r.get('closedPnl', 0) or 0) < 0)
    n = len(rows)
    wr = (wins * 100.0 / n) if n else 0.0
    return pnl, n, wins, losses, wr, rows


def _db_per_source_today():
    """Per-user-per-source PnL from user_trades closed today (UTC)."""
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    db = SessionLocal()
    try:
        from sqlalchemy import text
        sql = text("""
            SELECT user_id, source, COUNT(*) n,
                   COALESCE(SUM(pnl_usdt), 0) pnl,
                   SUM(CASE WHEN pnl_usdt > 0 THEN 1 ELSE 0 END) wins
            FROM user_trades
            WHERE status = 'closed'
              AND pnl_usdt IS NOT NULL
              AND date(closed_at) = :today
            GROUP BY user_id, source
            ORDER BY user_id, pnl DESC
        """)
        rows = db.execute(sql, {'today': today}).fetchall()
        result = defaultdict(list)
        for uid, src, n, pnl, wins in rows:
            wr = (wins * 100.0 / n) if n else 0.0
            result[uid].append({
                'source': src, 'n': n, 'pnl': float(pnl), 'wr': wr,
            })
        return result
    finally:
        db.close()


def _format_user_msg(username: str, bybit_pnl: float, bybit_n: int,
                     bybit_wr: float, by_source: list,
                     top_winners: list, top_losers: list,
                     balance: float) -> str:
    sign = '+' if bybit_pnl >= 0 else ''
    emoji = '✅' if bybit_pnl > 0 else ('⚠️' if bybit_pnl < 0 else '➖')
    lines = [
        f'{emoji} <b>Daily PnL — {username}</b>',
        f'<i>{datetime.now(timezone.utc).strftime("%Y-%m-%d UTC")}</i>',
        '',
        f'<b>Total:</b> {sign}${bybit_pnl:.2f}  ({bybit_n} trades, WR {bybit_wr:.0f}%)',
        f'<b>Balance:</b> ${balance:.2f}',
    ]
    if by_source:
        lines.append('')
        lines.append('<b>Per-bot:</b>')
        for s in by_source:
            sign2 = '+' if s['pnl'] >= 0 else ''
            lines.append(f"  • {s['source']:10s} {sign2}${s['pnl']:7.2f}  ({s['n']} trades, WR {s['wr']:.0f}%)")
    if top_winners:
        lines.append('')
        lines.append('<b>Top wins:</b>')
        for r in top_winners[:3]:
            sym = r.get('symbol', '?')
            pnl = float(r.get('closedPnl', 0))
            side = r.get('side', '?')
            lines.append(f'  • {sym} {side} +${pnl:.2f}')
    if top_losers:
        lines.append('')
        lines.append('<b>Top losses:</b>')
        for r in top_losers[:3]:
            sym = r.get('symbol', '?')
            pnl = float(r.get('closedPnl', 0))
            side = r.get('side', '?')
            lines.append(f'  • {sym} {side} ${pnl:.2f}')
    return '\n'.join(lines)


def main():
    start_ms, end_ms = _today_utc_bounds()
    db_data = _db_per_source_today()

    db = SessionLocal()
    try:
        users = (
            db.query(User)
              .options(joinedload(User.api_keys))
              .filter(User.is_active == True)
              .all()
        )
        # detach with eager-loaded relationships intact
        for u in users:
            _ = list(u.api_keys)  # force load
    finally:
        db.close()

    for u in users:
        uid = u.id
        if not u.api_keys:
            continue
        key_row = next((k for k in u.api_keys if k.exchange == 'bybit'), None)
        if not key_row:
            continue
        is_demo = key_row.is_demo

        try:
            pnl, n, wins, losses, wr, rows = _bybit_closed_pnl(
                key_row, start_ms, end_ms)
        except Exception as e:
            print(f'user={uid} bybit err: {e}')
            continue

        rows_sorted = sorted(rows, key=lambda r: float(r.get('closedPnl', 0) or 0), reverse=True)
        top_winners = [r for r in rows_sorted if float(r.get('closedPnl', 0) or 0) > 0][:3]
        top_losers = [r for r in rows_sorted if float(r.get('closedPnl', 0) or 0) < 0][-3:]

        # Balance via consolidated helper
        ex = build_from_key_row(key_row)
        balance = get_balance(ex)['total_equity']

        username = u.username or f'user_{uid}'
        if is_demo:
            username += ' [DEMO]'
        else:
            username += ' [LIVE]'

        msg = _format_user_msg(username, pnl, n, wr, db_data.get(uid, []),
                                top_winners, top_losers, balance)

        # Send to per-user TG if set
        if u.tg_chat_id:
            try:
                send_telegram_message(msg, u.tg_chat_id)
                print(f'user={uid} sent to {u.tg_chat_id}')
            except Exception as e:
                print(f'user={uid} TG err: {e}')

        # Also send to admin (owner's TG_CHAT_ID) for visibility on all users
        if TG_CHAT_ID and (not u.tg_chat_id or str(u.tg_chat_id) != str(TG_CHAT_ID)):
            try:
                send_telegram_message(msg, TG_CHAT_ID)
                print(f'admin copy sent for user={uid}')
            except Exception as e:
                print(f'admin TG err for user={uid}: {e}')

        time.sleep(1)  # rate-limit TG

    # Append paper-trade stats summary (Council 2026-05-22) — admin-only
    try:
        from modules.paper_trader import stats_by_source
        s = stats_by_source(14)
        if s and TG_CHAT_ID:
            lines = ['📈 <b>Paper trader — 14d</b>', '']
            for row in s:
                sign = '+' if row['total_pnl_pct'] >= 0 else ''
                lines.append(
                    f"  {row['source']:10s} [{row['variant']:8s}]  "
                    f"n={row['n']:3d}  WR={row['wr']:.0f}%  "
                    f"{sign}{row['total_pnl_pct']:.2f}%"
                )
            send_telegram_message('\n'.join(lines), TG_CHAT_ID)
    except Exception as e:
        print(f'paper stats err: {e}')


if __name__ == '__main__':
    main()
