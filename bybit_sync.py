"""
bybit_sync.py — DEPRECATED (2026-05-22). Use modules/event_ingestor.py.

This module is retained for backwards compatibility with web_server.py background
loop. New code MUST use the event-sourced pipeline:
  modules/event_ingestor.py → trade_events (immutable ledger)
  tools/derive_user_trades.py → user_trades (materialized view)

Removal deadline: 2026-06-05 (14 days from deprecation) — after parallel-run
verification that event-sourced pipeline maintains zero drift.

Original purpose: imports closed PnL from Bybit. Now redundant with event_ingestor.
Kept running to provide safety net during cutover period.
"""
import logging
import re
from datetime import datetime, timezone, timedelta

import ccxt

logger = logging.getLogger("bybit_sync")


def _normalize_coin(symbol: str) -> str:
    """SOLUSDT → SOL, SOL/USDT:USDT → SOL"""
    if not symbol:
        return "?"
    coin = re.split(r"[/:]", symbol)[0]
    if coin.upper().endswith("USDT"):
        coin = coin[:-4]
    return coin or "?"


# Bybit helpers consolidated into modules.bybit_client (2026-05-22)
from modules.bybit_client import (
    build_from_key_row as _build_exchange,
    get_closed_pnl as _fetch_closed_pnl,
)


# Cooldown hook (Council 2026-05-22) — register SL events for bot-attributed losing closes.
# Only counts trades with source ∈ bot list (not 'bybit' which = legacy/unattrib).
_TRACKED_SOURCES = {"news", "dex", "sweep", "orderblock", "cascade", "liq_cascade", "trend"}


def _maybe_register_sl(source: str | None, pnl: float) -> None:
    if pnl >= 0 or not source or source not in _TRACKED_SOURCES:
        return
    try:
        from modules.cooldown import register_sl
        from modules.tg_notifier import send_telegram_message
        from config.settings import TG_CHAT_ID
        register_sl(source, send_tg=lambda msg: send_telegram_message(msg, TG_CHAT_ID))
    except Exception as _e:
        logger.warning(f"cooldown hook failed: {_e}")


def sync_user_trades(user_id: int) -> int:
    """Fetch all closed positions from Bybit, upsert into UserTrade.
    Returns number of new rows inserted.
    """
    from database import SessionLocal, UserApiKey, UserTrade

    db = SessionLocal()
    try:
        key_rows = db.query(UserApiKey).filter_by(user_id=user_id, exchange="bybit").all()
        if not key_rows:
            return 0
        # Prefer live key for sync; fall back to demo
        key_row = next((k for k in key_rows if not k.is_demo), key_rows[0])

        ex = _build_exchange(key_row)
        if not ex:
            return 0

        all_items = _fetch_closed_pnl(ex)
        if not all_items:
            return 0

        # Only import trades from after the user connected their key to Kado
        key_since_ms = int(key_row.created_at.timestamp() * 1000) if key_row.created_at else 0
        items = [it for it in all_items if int(it.get("updatedTime") or 0) >= key_since_ms]
        if not items:
            return 0

        # Load existing order_ids for dedup
        existing_order_ids = {
            r[0]
            for r in db.query(UserTrade.order_id)
            .filter(UserTrade.user_id == user_id, UserTrade.order_id.isnot(None))
            .all()
        }

        # Load ALL trades indexed by (normalized coin, entry_price) for broader dedup
        all_trades = db.query(UserTrade).filter(UserTrade.user_id == user_id).all()
        trades_by_coin: dict[str, list] = {}
        for t in all_trades:
            c = _normalize_coin(t.symbol or "")
            trades_by_coin.setdefault(c, []).append(t)

        # Separate open trades for update logic
        open_by_coin: dict[str, list] = {}
        for t in all_trades:
            if t.status == "open":
                c = _normalize_coin(t.symbol or "")
                open_by_coin.setdefault(c, []).append(t)

        new_count = 0
        # Collect SL registrations to fire AFTER successful commit — prevents
        # double-SL counts if commit rolls back (audit finding Q2 cross-process).
        pending_sl_registrations: list[tuple[str, float]] = []
        for it in items:
            order_id = it.get("orderId") or ""
            if not order_id:
                order_id = f"{it.get('symbol', '')}_{it.get('updatedTime', '')}"

            if order_id in existing_order_ids:
                continue

            pnl       = float(it.get("closedPnl") or 0)
            coin      = _normalize_coin(it.get("symbol", ""))
            closed_ms = int(it.get("updatedTime") or 0)
            # tz-aware UTC; later .replace(tzinfo=None) when comparing to DB naive datetimes
            closed_dt = datetime.fromtimestamp(closed_ms / 1000, tz=timezone.utc).replace(tzinfo=None) if closed_ms else None
            entry_p   = float(it.get("avgEntryPrice") or 0)
            exit_p    = float(it.get("avgExitPrice") or 0)
            qty       = float(it.get("qty") or 0)
            lev       = int(float(it.get("leverage") or 3))

            # Skip if we already have a trade for this coin+entry_price combo.
            # Three cases:
            #   1. source != "bybit": bot already recorded this trade canonically — skip
            #      insertion and update open→closed if needed.
            #   2. source == "bybit": a previous bybit_sync run already imported this
            #      trade (e.g. orderId changed between API calls) — skip to avoid dupes.
            #   3. Closed trade matching by exit_price+pnl+time: this Bybit event was
            #      previously matched via the open_by_coin fallback (where entry_price
            #      didn't match within 2%), so the canonical bot order_id wasn't overwritten
            #      — but the exit data on the now-closed trade proves this event ran already.
            # Tolerance: 2% on entry price. Time check: close time must be after open
            # time (with 10 min slack for clock skew).
            already_exists = False
            for t in trades_by_coin.get(coin, []):
                # Case 3: closed trade already carries this event's exit data
                if t.status == "closed" and t.exit_price and exit_p and closed_dt and t.closed_at:
                    ep_match  = abs(float(t.exit_price) - exit_p) / max(float(t.exit_price), exit_p) < 0.001
                    pnl_match = abs(float(t.pnl_usdt or 0) - pnl) < 0.01
                    t_sec     = abs((t.closed_at.replace(tzinfo=None) - closed_dt).total_seconds())
                    if ep_match and pnl_match and t_sec < 60:
                        already_exists = True
                        break

                if not (t.entry_price and entry_p):
                    continue
                price_match = abs(t.entry_price - entry_p) / max(t.entry_price, entry_p) < 0.02
                if not price_match:
                    continue
                time_ok = closed_dt is None or t.opened_at is None or closed_dt >= (
                    t.opened_at.replace(tzinfo=None) - timedelta(minutes=10)
                )
                if not time_ok:
                    continue
                # Existing bybit row → pure duplicate, skip silently
                if t.source == "bybit":
                    already_exists = True
                    break
                # Bot-recorded trade → this is the canonical record
                already_exists = True
                # If the existing trade is still open, close it with real PnL from Bybit
                if t.status == "open":
                    t.exit_price = exit_p
                    t.pnl_usdt   = pnl
                    t.status     = "closed"
                    t.closed_at  = closed_dt
                    if pnl < 0:
                        pending_sl_registrations.append((t.source, pnl))
                break
            if already_exists:
                existing_order_ids.add(order_id)
                continue

            # Try to match an existing open trade to update (for cases without entry_price match)
            # Only match if the open trade was opened BEFORE this close event
            matched = None
            candidates = open_by_coin.get(coin, [])
            if candidates and closed_dt:
                valid = [
                    t for t in candidates
                    if t.opened_at is None or
                    t.opened_at.replace(tzinfo=None) <= closed_dt + timedelta(minutes=10)
                ]
                if valid:
                    # datetime.min naive; ensure same naivete to avoid TypeError
                    matched = min(valid, key=lambda t: (t.opened_at.replace(tzinfo=None) if t.opened_at and t.opened_at.tzinfo else t.opened_at) or datetime.min)

            if matched:
                matched.exit_price = exit_p
                matched.pnl_usdt   = pnl
                matched.status     = "closed"
                matched.closed_at  = closed_dt
                if not matched.order_id:
                    matched.order_id = order_id
                open_by_coin[coin] = [t for t in candidates if t.id != matched.id]
                if pnl < 0:
                    pending_sl_registrations.append((matched.source, pnl))
            else:
                # Completely new trade — insert as standalone "bybit" record
                # Bybit closed_pnl "side" = closing order direction:
                #   "Buy"  = bought to CLOSE a SHORT → position was SHORT
                #   "Sell" = sold  to CLOSE a LONG  → position was LONG
                raw_side = it.get("side", "")
                side = "SHORT" if raw_side == "Buy" else "LONG"
                db.add(UserTrade(
                    user_id     = user_id,
                    source      = "bybit",
                    symbol      = it.get("symbol", ""),
                    side        = side,
                    leverage    = lev,
                    qty         = qty,
                    entry_price = entry_p,
                    exit_price  = exit_p,
                    pnl_usdt    = pnl,
                    status      = "closed",
                    order_id    = order_id,
                    opened_at   = closed_dt,
                    closed_at   = closed_dt,
                ))

            existing_order_ids.add(order_id)
            new_count += 1

        if new_count:
            db.commit()
            logger.info(f"[bybit_sync] user={user_id} updated/inserted {new_count} trades")
            # Fire SL registrations ONLY after successful commit.
            # Per memory feedback_sqlite_concurrent_writes: if commit raised,
            # SL counts would have been double-registered next sync.
            for src, pnl in pending_sl_registrations:
                _maybe_register_sl(src, pnl)
        return new_count

    except Exception as e:
        # Surface SQLite 'malformed' / OperationalError explicitly — was hidden
        # in audit (bare except → silent return 0).
        logger.error(f"[bybit_sync] sync_user_trades({user_id}): {type(e).__name__}: {e}")
        try:
            db.rollback()
        except Exception as _rb:
            logger.error(f"[bybit_sync] rollback failed: {_rb}")
        return 0
    finally:
        db.close()


def sync_all_users() -> None:
    """Sync all users that have a Bybit API key. Called from background loop."""
    from database import SessionLocal, UserApiKey

    db = SessionLocal()
    try:
        user_ids = list({
            r[0]
            for r in db.query(UserApiKey.user_id).filter_by(exchange="bybit").all()
        })
    finally:
        db.close()

    for uid in user_ids:
        try:
            sync_user_trades(uid)
        except Exception as e:
            logger.error(f"[bybit_sync] sync_all_users: user {uid}: {e}")
