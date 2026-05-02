"""
Position Closer — background service that polls Bybit every 5 minutes
and closes SaaS trades that are no longer open on the exchange.

Flow:
  Every 5 min → find users with open trades → query Bybit positions →
  if symbol not open anymore → fetch closed PnL → update_trade_closed()
"""
import asyncio
import traceback
from datetime import datetime, timezone

import ccxt

from database import SessionLocal, User, UserApiKey, UserTrade
from modules.saas_dispatcher import _build_exchange, update_trade_closed
from utils.crypto import decrypt_field

POLL_INTERVAL    = 300   # seconds between polls
MIN_AGE_SECS     = 120   # skip trades younger than 2 min (may not be filled yet)
GHOST_HOURS      = 8     # close with pnl=0 if still "open" after this many hours


def _get_users_with_open_trades() -> list[dict]:
    """Return users who have open trades, with their decrypted API keys."""
    db = SessionLocal()
    try:
        rows = (
            db.query(UserTrade.user_id)
            .filter(UserTrade.status == "open")
            .distinct()
            .all()
        )
        uid_list = [r[0] for r in rows]

        result = []
        for uid in uid_list:
            user = db.query(User).filter(User.id == uid, User.is_active == True).first()
            if not user:
                continue
            key_row = next((k for k in (user.api_keys or []) if k.exchange == "bybit"), None)
            if not key_row:
                continue
            api_key = decrypt_field(key_row.api_key_enc)
            secret  = decrypt_field(key_row.secret_enc)
            if not api_key or not secret:
                continue
            result.append({
                "user_id":    uid,
                "api_key":    api_key,
                "secret":     secret,
                "is_testnet": key_row.is_testnet,
            })
        return result
    finally:
        db.close()


def _open_trades_for_user(user_id: int) -> list[UserTrade]:
    db = SessionLocal()
    try:
        return (
            db.query(UserTrade)
            .filter(UserTrade.user_id == user_id, UserTrade.status == "open")
            .all()
        )
    finally:
        db.close()


def _check_user(user: dict) -> int:
    """Check one user's open trades against Bybit. Returns number of trades closed."""
    api_key    = user["api_key"]
    secret     = user["secret"]
    is_testnet = user["is_testnet"]
    user_id    = user["user_id"]

    trades = _open_trades_for_user(user_id)
    if not trades:
        return 0

    try:
        ex = _build_exchange(api_key, secret, is_testnet)
        positions = ex.fetch_positions(params={"category": "linear"})
        open_market_ids = {
            ex.market_id(p["symbol"])
            for p in positions
            if float(p.get("contracts") or 0) > 0
        }
    except Exception:
        traceback.print_exc()
        return 0

    now = datetime.now(timezone.utc)
    closed = 0
    for trade in trades:
        try:
            raw_ts    = trade.opened_at or now
            opened_ts = raw_ts if raw_ts.tzinfo else raw_ts.replace(tzinfo=timezone.utc)
            age_sec   = (now - opened_ts).total_seconds()

            # Skip very fresh trades — position might not be reflected yet
            if age_sec < MIN_AGE_SECS:
                continue

            mkt_id = ex.market_id(trade.symbol)
        except Exception:
            continue

        # Symbol still open on exchange — nothing to do
        if mkt_id in open_market_ids:
            continue

        # Fetch closed PnL for this symbol from Bybit (V5 API)
        exit_price = float(trade.entry_price or 0)
        pnl_usdt   = 0.0
        opened_ms  = int(opened_ts.timestamp() * 1000)
        pnl_found  = False
        try:
            resp  = ex.private_get_v5_position_closed_pnl({
                "category":  "linear",
                "symbol":    mkt_id,
                "startTime": opened_ms,
                "limit":     20,
            })
            items = resp.get("result", {}).get("list", [])
            for item in items:
                # 5s tolerance for Bybit timestamp vs local clock skew
                if float(item.get("createdTime", 0)) >= opened_ms - 5000:
                    exit_price = float(item.get("avgExitPrice") or exit_price)
                    pnl_usdt   = float(item.get("closedPnl", 0))
                    pnl_found  = True
                    break
        except Exception:
            pass

        # No PnL record found — only close if old enough to be a ghost
        if not pnl_found:
            if age_sec <= GHOST_HOURS * 3600:
                continue  # too young, retry next poll
            print(f"[CLOSER] ghost user={user_id} {trade.symbol} ({age_sec/3600:.0f}h) → close pnl=0")

        update_trade_closed(trade.order_id, exit_price, pnl_usdt)
        closed += 1
        print(f"[CLOSER] user={user_id} closed {trade.symbol} "
              f"exit={exit_price} pnl={pnl_usdt:+.2f}")

    return closed


async def run_loop():
    """Background loop — runs forever, polls every POLL_INTERVAL seconds."""
    print("[CLOSER] Position closer started")
    while True:
        try:
            users = _get_users_with_open_trades()
            if users:
                total = 0
                for u in users:
                    total += await asyncio.get_running_loop().run_in_executor(
                        None, _check_user, u
                    )
                if total:
                    print(f"[CLOSER] Closed {total} position(s) this cycle")
        except Exception:
            traceback.print_exc()
        await asyncio.sleep(POLL_INTERVAL)
