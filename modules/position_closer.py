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
from modules.saas_dispatcher import _build_exchange, update_trade_closed, _get_free_usdt
from modules.analytics_db import close_user_trade
from utils.crypto import decrypt_field

POLL_INTERVAL    = 300   # seconds between polls
MIN_AGE_SECS     = 120   # skip trades younger than 2 min (may not be filled yet)
GHOST_HOURS      = 8     # close with pnl=0 if still "open" after this many hours
FR_MAX_HOLD_SEC  = 45 * 60  # FR strategy target is 20 min; force-close at 45 min
GRID_AGG_SL_PCT  = 0.15    # close all grid positions if combined unrealized < -15% of free balance

# Trade IDs where we already sent a force-close order this process lifetime
_fr_close_attempted: set[int] = set()


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
                "is_demo": key_row.is_demo,
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
    is_demo = user["is_demo"]
    user_id    = user["user_id"]

    trades = _open_trades_for_user(user_id)
    if not trades:
        return 0

    try:
        ex = _build_exchange(api_key, secret, is_demo)
        positions = ex.fetch_positions(params={"category": "linear"})
        open_market_ids = {
            ex.market_id(p["symbol"])
            for p in positions
            if float(p.get("contracts") or 0) > 0
        }
    except Exception:
        traceback.print_exc()
        return 0

    # Grid aggregate SL — close all grid positions if combined loss exceeds threshold
    grid_trades = [t for t in trades if t.source == "grid"]
    if grid_trades:
        grid_unrealized = 0.0
        grid_to_close: list[tuple[str, float, str]] = []
        for t in grid_trades:
            try:
                mkt = ex.market_id(t.symbol)
                for p in positions:
                    if ex.market_id(p["symbol"]) == mkt and float(p.get("contracts") or 0) > 0:
                        grid_unrealized += float(p.get("unrealizedPnl") or 0)
                        grid_to_close.append((t.symbol, float(p["contracts"]), t.side))
                        break
            except Exception:
                pass

        balance       = _get_free_usdt(ex) if grid_to_close else 0.0
        grid_sl_limit = -(balance * GRID_AGG_SL_PCT) if balance > 0 else -9999.0

        if grid_to_close and grid_unrealized < grid_sl_limit:
            print(f"[CLOSER]  GRID AGG SL user={user_id}: "
                  f"unrealized={grid_unrealized:.2f} < {grid_sl_limit:.2f} "
                  f"({GRID_AGG_SL_PCT*100:.0f}% of ${balance:.0f})")
            for sym, qty, side in grid_to_close:
                try:
                    order_side = "sell" if side == "LONG" else "buy"
                    ex.create_order(sym, "market", order_side, qty, params={
                        "category": "linear", "positionIdx": 0, "reduceOnly": True,
                    })
                    print(f"[CLOSER]  GRID AGG SL closed {sym} qty={qty}")
                except Exception as _e:
                    print(f"[CLOSER]  GRID AGG SL close error {sym}: {_e}")
            try:
                from modules.tg_notifier import send_telegram_message
                from config.settings import TG_CHAT_ID
                send_telegram_message(
                    f" <b>Grid Aggregate SL</b>\n"
                    f"User {user_id} | loss: {grid_unrealized:.2f} USDT "
                    f"({abs(grid_unrealized/balance*100):.1f}% of ${balance:.0f})\n"
                    f"Closed {len(grid_to_close)} grid position(s)",
                    TG_CHAT_ID,
                )
            except Exception:
                pass

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

        # FR strategy: force-close if held past the funding-collection window
        if (trade.source == "fr"
                and age_sec > FR_MAX_HOLD_SEC
                and mkt_id in open_market_ids
                and trade.id not in _fr_close_attempted):
            _fr_close_attempted.add(trade.id)
            pos_qty = None
            for p in positions:
                try:
                    if ex.market_id(p["symbol"]) == mkt_id and float(p.get("contracts") or 0) > 0:
                        pos_qty = float(p["contracts"])
                        break
                except Exception:
                    pass
            if pos_qty:
                try:
                    order_side = "sell" if trade.side == "LONG" else "buy"
                    ex.create_order(trade.symbol, "market", order_side, pos_qty, params={
                        "category":    "linear",
                        "positionIdx": 0,
                        "reduceOnly":  True,
                    })
                    print(f"[CLOSER] ⏱ FR force-close user={user_id} {trade.symbol} "
                          f"qty={pos_qty} ({age_sec/60:.0f}min open) — next poll records PnL")
                except Exception as _fc_err:
                    print(f"[CLOSER]  FR force-close failed {trade.symbol}: {_fc_err}")
            continue  # PnL will be fetched on next 5-min poll when position shows closed

        # Symbol still open on exchange — nothing to do
        if mkt_id in open_market_ids:
            continue

        # Fetch closed PnL for this symbol from Bybit (V5 API)
        # Try twice: first with startTime (fast path), then without (catches delayed records)
        exit_price = float(trade.entry_price or 0)
        pnl_usdt   = 0.0
        opened_ms  = int(opened_ts.timestamp() * 1000)
        pnl_found  = False
        for pnl_params in [
            {"category": "linear", "symbol": mkt_id, "startTime": opened_ms, "limit": 50},
            {"category": "linear", "symbol": mkt_id, "limit": 50},  # fallback: no time filter
        ]:
            if pnl_found:
                break
            try:
                resp  = ex.private_get_v5_position_closed_pnl(pnl_params)
                items = resp.get("result", {}).get("list", [])
                for item in items:
                    # 5s tolerance for Bybit timestamp vs local clock skew
                    if float(item.get("createdTime", 0)) >= opened_ms - 5000:
                        ep = float(item.get("avgExitPrice") or 0)
                        if ep > 0:
                            exit_price = ep
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

        _notify_data = {
            "symbol":    trade.symbol,
            "side":      trade.side,
            "pnl_usdt":  pnl_usdt,
            "exit_price": exit_price,
            "opened_at": trade.opened_at,
        }
        _notify_uid = trade.user_id

        if trade.order_id:
            update_trade_closed(trade.order_id, exit_price, pnl_usdt)
        else:
            # Grid trades: no Bybit order_id stored — close directly by DB id
            close_user_trade(trade.id, exit_price, pnl_usdt)
        closed += 1
        print(f"[CLOSER] user={user_id} closed {trade.symbol} "
              f"exit={exit_price} pnl={pnl_usdt:+.2f}")

        try:
            from modules.tg_notifier import notify_user_trade
            notify_user_trade(_notify_uid, "close", _notify_data)
        except Exception:
            pass

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
