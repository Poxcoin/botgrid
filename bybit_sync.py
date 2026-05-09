"""
bybit_sync.py — Imports closed PnL from each user's Bybit account into UserTrade.

Run on key-add and every 15 min from background loop in web_server.py.
Dedup by (user_id, order_id) — safe to run multiple times.
"""
import logging
import re
from datetime import datetime, timezone

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
    if key_row.is_testnet:
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

        items = _fetch_closed_pnl(ex)
        if not items:
            return 0

        # Load existing order_ids for this user to skip duplicates
        existing = {
            r[0]
            for r in db.query(UserTrade.order_id)
            .filter(UserTrade.user_id == user_id, UserTrade.order_id.isnot(None))
            .all()
        }

        new_count = 0
        for it in items:
            order_id = it.get("orderId") or ""
            if not order_id:
                order_id = f"{it.get('symbol', '')}_{it.get('updatedTime', '')}"

            if order_id in existing:
                continue

            pnl      = float(it.get("closedPnl") or 0)
            raw_side = it.get("side", "")
            side     = "LONG" if raw_side == "Buy" else "SHORT"
            closed_ms = int(it.get("updatedTime") or 0)
            closed_dt = (
                datetime.utcfromtimestamp(closed_ms / 1000)
                if closed_ms else None
            )

            db.add(UserTrade(
                user_id     = user_id,
                source      = "bybit",
                symbol      = it.get("symbol", ""),
                side        = side,
                qty         = float(it.get("qty") or 0),
                entry_price = float(it.get("avgEntryPrice") or 0),
                exit_price  = float(it.get("avgExitPrice") or 0),
                pnl_usdt    = pnl,
                status      = "closed",
                order_id    = order_id,
                opened_at   = closed_dt,
                closed_at   = closed_dt,
            ))
            existing.add(order_id)
            new_count += 1

        if new_count:
            db.commit()
            logger.info(f"[bybit_sync] user={user_id} inserted {new_count} new trades")
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
