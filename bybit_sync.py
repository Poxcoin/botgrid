"""
bybit_sync.py — Imports closed PnL from each user's Bybit account into UserTrade.

Run on key-add and every 15 min from background loop in web_server.py.
Dedup by (user_id, order_id) — safe to run multiple times.
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


def _build_exchange(key_row) -> ccxt.bybit | None:
    from utils.crypto import decrypt_field
    try:
        api_key = decrypt_field(key_row.api_key_enc)
        secret  = decrypt_field(key_row.secret_enc)
    except Exception:
        return None
    ex = ccxt.bybit({
        "apiKey": api_key,
        "secret": secret,
        "enableRateLimit": True,
        "options": {"defaultType": "linear", "recvWindow": 10000},
    })
    ex.has["fetchCurrencies"] = False
    if key_row.is_demo:
        ex.urls["api"] = ex.urls["demotrading"]
    return ex


def _fetch_closed_pnl(ex, max_pages: int = 20) -> list:
    all_items = []
    cursor = ""
    for _ in range(max_pages):
        params = {"category": "linear", "limit": 200}
        if cursor:
            params["cursor"] = cursor
        try:
            raw = ex.private_get_v5_position_closed_pnl(params)
        except Exception as e:
            logger.warning(f"Bybit API error during fetch: {e}")
            break
        result = raw.get("result", {})
        items  = result.get("list", [])
        all_items.extend(items)
        cursor = result.get("nextPageCursor", "")
        if not cursor or not items:
            break
    return all_items


def sync_user_trades(user_id: int) -> int:
    """Fetch all closed positions from Bybit, upsert into UserTrade.
    Returns number of new rows inserted.
    """
    from database import SessionLocal, UserApiKey, UserTrade

    db = SessionLocal()
    try:
        key_row = db.query(UserApiKey).filter_by(user_id=user_id, exchange="bybit").first()
        if not key_row:
            return 0

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
        for it in items:
            order_id = it.get("orderId") or ""
            if not order_id:
                order_id = f"{it.get('symbol', '')}_{it.get('updatedTime', '')}"

            if order_id in existing_order_ids:
                continue

            pnl       = float(it.get("closedPnl") or 0)
            coin      = _normalize_coin(it.get("symbol", ""))
            closed_ms = int(it.get("updatedTime") or 0)
            closed_dt = datetime.utcfromtimestamp(closed_ms / 1000) if closed_ms else None
            entry_p   = float(it.get("avgEntryPrice") or 0)
            exit_p    = float(it.get("avgExitPrice") or 0)
            qty       = float(it.get("qty") or 0)

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
                break
            if already_exists:
                existing_order_ids.add(order_id)
                continue

            # Try to match an existing open trade to update (for cases without entry_price match)
            matched = None
            candidates = open_by_coin.get(coin, [])
            if candidates:
                matched = min(candidates, key=lambda t: t.opened_at or datetime.min)

            if matched:
                matched.exit_price = exit_p
                matched.pnl_usdt   = pnl
                matched.status     = "closed"
                matched.closed_at  = closed_dt
                if not matched.order_id:
                    matched.order_id = order_id
                open_by_coin[coin] = [t for t in candidates if t.id != matched.id]
            else:
                # Completely new trade — insert as standalone "bybit" record
                raw_side = it.get("side", "")
                side = "LONG" if raw_side == "Buy" else "SHORT"
                db.add(UserTrade(
                    user_id     = user_id,
                    source      = "bybit",
                    symbol      = it.get("symbol", ""),
                    side        = side,
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
        return new_count

    except Exception as e:
        logger.error(f"[bybit_sync] sync_user_trades({user_id}): {e}")
        db.rollback()
        return 0
    finally:
        db.close()


def sync_all_users() -> None:
    """Sync all users that have a Bybit API key. Called from background loop."""
    from database import SessionLocal, UserApiKey

    db = SessionLocal()
    try:
        user_ids = [
            r[0]
            for r in db.query(UserApiKey.user_id).filter_by(exchange="bybit").all()
        ]
    finally:
        db.close()

    for uid in user_ids:
        try:
            sync_user_trades(uid)
        except Exception as e:
            logger.error(f"[bybit_sync] sync_all_users: user {uid}: {e}")
