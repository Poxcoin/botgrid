"""
loss_monitor.py — runs every 5 min via cron.

For each active user:
  1. Fetch open positions from Bybit (per user keys, demo or live)
  2. For each open position, calc unrealized PnL as % of margin
  3. If unrealized loss < -3% AND position has been losing for ≥ 15 min → TG alert

State persisted in /opt/botgrid/loss_monitor_state.json:
  { user_id: { symbol_side: { first_seen_loss_at: ts, last_alerted_at: ts } } }

Alert is sent at most once per 30 min per (user, symbol, side).
"""
import sys
import os
import json
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, '/opt/botgrid')
os.chdir('/opt/botgrid')

from dotenv import load_dotenv
load_dotenv('/opt/botgrid/.env')

from sqlalchemy.orm import joinedload
from database import SessionLocal, User
from modules.tg_notifier import send_telegram_message
from modules.bybit_client import build_from_key_row, get_positions
from config.settings import TG_CHAT_ID

STATE_FILE = Path('/opt/botgrid/loss_monitor_state.json')
LOSS_PCT_THRESHOLD = -3.0   # unrealized loss as % of margin
MIN_LOSS_DURATION_SEC = 15 * 60
ALERT_COOLDOWN_SEC = 30 * 60


def _load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            return {}
    return {}


def _save_state(s: dict) -> None:
    STATE_FILE.write_text(json.dumps(s, indent=2))


def _fetch_positions(key_row) -> list:
    """Returns list of dicts in the legacy format expected by _check_user."""
    ex = build_from_key_row(key_row)
    out = []
    for p in get_positions(ex):
        out.append({
            'symbol':         p['symbol'],
            'side':           p['raw_side'],  # Buy / Sell
            'size':           p['qty'],
            'avgPrice':       p['entry_price'],
            'markPrice':      p['mark_price'] or 0.0,
            'unrealisedPnl':  p['unrealized_pnl'],
            'positionValue':  p['qty'] * p['entry_price'],
            'positionIM':     p['margin'],
            'leverage':       float(p['leverage']),
            'createdTime':    p['created_time'],
        })
    return out


def _check_user(u: User, state: dict, now: float) -> None:
    uid = u.id
    key_row = next((k for k in u.api_keys if k.exchange == 'bybit'), None)
    if not key_row:
        return

    try:
        positions = _fetch_positions(key_row)
    except Exception as e:
        print(f'user={uid} fetch err: {e}')
        return

    user_state = state.setdefault(str(uid), {})
    seen_keys = set()

    for p in positions:
        key = f"{p['symbol']}_{p['side']}"
        seen_keys.add(key)

        # loss % of initial margin (most meaningful — % of own capital at risk)
        margin = p['positionIM'] or (p['positionValue'] / max(p['leverage'], 1))
        if margin <= 0:
            continue
        loss_pct = (p['unrealisedPnl'] / margin) * 100.0

        ps = user_state.setdefault(key, {})

        if loss_pct >= LOSS_PCT_THRESHOLD:
            # Above threshold (winning or small loss) — reset timer
            ps.pop('first_seen_loss_at', None)
            continue

        # Below threshold — start/continue timer
        if 'first_seen_loss_at' not in ps:
            ps['first_seen_loss_at'] = now
            continue

        duration = now - ps['first_seen_loss_at']
        if duration < MIN_LOSS_DURATION_SEC:
            continue

        last_alerted = ps.get('last_alerted_at', 0)
        if now - last_alerted < ALERT_COOLDOWN_SEC:
            continue

        # Fire alert
        side_emoji = '🟢 LONG' if p['side'] == 'Buy' else '🔴 SHORT'
        mins = int(duration / 60)
        msg = (
            f'⚠️ <b>Unrealized loss alert</b>\n'
            f'<i>user: {u.username or uid}</i>\n\n'
            f'<b>{p["symbol"]}</b> {side_emoji}\n'
            f'Entry: {p["avgPrice"]:.4f}\n'
            f'Mark:  {p["markPrice"]:.4f}\n'
            f'Size:  {p["size"]:.3f}\n'
            f'Lev:   {p["leverage"]:.0f}x\n\n'
            f'Unrealized: <b>{p["unrealisedPnl"]:+.2f}</b> USDT '
            f'(<b>{loss_pct:+.1f}%</b> of margin)\n'
            f'Losing for: <b>{mins} min</b>\n\n'
            f'Threshold: {LOSS_PCT_THRESHOLD}% for {MIN_LOSS_DURATION_SEC // 60} min'
        )

        if u.tg_chat_id:
            try:
                send_telegram_message(msg, u.tg_chat_id)
                print(f'user={uid} alert sent for {key} ({loss_pct:.1f}%, {mins}min)')
            except Exception as e:
                print(f'user={uid} TG err: {e}')

        if TG_CHAT_ID and str(u.tg_chat_id) != str(TG_CHAT_ID):
            try:
                send_telegram_message(msg, TG_CHAT_ID)
            except Exception:
                pass

        ps['last_alerted_at'] = now

    # Cleanup state entries for closed positions
    for k in list(user_state.keys()):
        if k not in seen_keys:
            user_state.pop(k, None)


def main():
    state = _load_state()
    now = time.time()

    db = SessionLocal()
    try:
        users = (
            db.query(User)
              .options(joinedload(User.api_keys))
              .filter(User.is_active == True)
              .all()
        )
        for u in users:
            _ = list(u.api_keys)
    finally:
        db.close()

    for u in users:
        try:
            _check_user(u, state, now)
        except Exception as e:
            print(f'user={u.id} check err: {e}')

    _save_state(state)

    # Cooldown expiry sweep — emits "✅ source resumed" TG when 6h block ends
    try:
        from modules.cooldown import check_and_expire
        tracked = ("news", "dex", "sweep", "orderblock",
                   "cascade", "liq_cascade", "fr", "trend")
        for source in tracked:
            check_and_expire(
                source,
                send_tg=lambda msg: send_telegram_message(msg, TG_CHAT_ID),
            )
    except Exception as e:
        print(f'cooldown expire check err: {e}')


if __name__ == '__main__':
    main()
