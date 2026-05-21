"""
position_ws.py — Real-time position monitor via Bybit private WebSocket.

One asyncio task per active user. On position close (size → 0), immediately
fetches closed PnL from REST and updates the DB — no polling delay.

Kept alongside position_closer.py as a fallback for edge cases (e.g. WS gap
during reconnect), but the WS is the primary notification path.
"""
import asyncio
import hashlib
import hmac
import json
import time
import traceback
from datetime import datetime, timezone

import websockets

from database import SessionLocal, User, UserApiKey, UserTrade
from modules.analytics_db import close_user_trade
from utils.crypto import decrypt_field

WS_LIVE = "wss://stream.bybit.com/v5/private"
WS_DEMO = "wss://stream-demo.bybit.com/v5/private"

PING_INTERVAL   = 20   # seconds between keepalive pings
RECONNECT_DELAY = 5    # seconds before reconnect on error
MANAGER_INTERVAL = 60  # seconds between DB sync cycles

_tasks: dict[int, asyncio.Task] = {}


# ─── helpers ──────────────────────────────────────────────────────────────────

def _sign(secret: str) -> tuple[int, str]:
    expires = int(time.time() * 1000) + 10_000
    sig = hmac.new(
        secret.encode("utf-8"),
        f"GET/realtime{expires}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return expires, sig


def _coin_from_symbol(symbol: str) -> str:
    """'BTCUSDT' → 'BTC'  (strips trailing USDT / PERP)"""
    return symbol.replace("PERP", "").replace("USDT", "")


def _fetch_closed_pnl(api_key: str, secret: str, is_demo: bool,
                      symbol: str, opened_ms: int) -> tuple[float, float]:
    """REST: fetch closed PnL + funding settlements for this symbol since opened_ms."""
    try:
        from modules.saas_dispatcher import _build_exchange
        import time as _time
        ex = _build_exchange(api_key, secret, is_demo)

        # 1. Price-based closed PnL
        resp = ex.private_get_v5_position_closed_pnl({
            "category":  "linear",
            "symbol":    symbol,
            "startTime": opened_ms,
            "limit":     20,
        })
        exit_price, price_pnl = 0.0, 0.0
        for item in resp.get("result", {}).get("list", []):
            if float(item.get("createdTime", 0)) >= opened_ms - 5_000:
                exit_price = float(item.get("avgExitPrice") or 0)
                price_pnl  = float(item.get("closedPnl", 0))
                break

        # 2. Funding fees collected (SETTLEMENT type in transaction log)
        funding = 0.0
        try:
            now_ms = int(_time.time() * 1000)
            tx_resp = ex.private_get_v5_account_transaction_log({
                "accountType": "UNIFIED",
                "type":        "SETTLEMENT",
                "symbol":      symbol,
                "startTime":   opened_ms,
                "endTime":     now_ms,
                "limit":       50,
            })
            for tx in tx_resp.get("result", {}).get("list", []):
                funding += float(tx.get("amount") or 0)
        except Exception:
            pass  # funding fetch is best-effort

        return exit_price, round(price_pnl + funding, 4)
    except Exception:
        traceback.print_exc()
    return 0.0, 0.0


def _close_trades(user_id: int, api_key: str, secret: str,
                  is_demo: bool, bybit_symbol: str) -> None:
    """Find open UserTrade records for this symbol+user and close them in DB."""
    from modules.saas_dispatcher import update_trade_closed
    coin = _coin_from_symbol(bybit_symbol)
    db = SessionLocal()
    try:
        trades = (
            db.query(UserTrade)
            .filter(
                UserTrade.user_id == user_id,
                UserTrade.status  == "open",
                UserTrade.symbol.like(f"%{coin}%"),
            )
            .all()
        )
        if not trades:
            return

        for trade in trades:
            opened_ms = int(
                (trade.opened_at or datetime.now(timezone.utc)).timestamp() * 1000
            )
            exit_price, pnl_usdt = _fetch_closed_pnl(
                api_key, secret, is_demo, bybit_symbol, opened_ms
            )
            _notify_data = {
                "symbol":     trade.symbol,
                "side":       trade.side,
                "pnl_usdt":   pnl_usdt,
                "exit_price": exit_price,
                "opened_at":  trade.opened_at,
            }
            _notify_uid = trade.user_id

            if trade.order_id:
                update_trade_closed(trade.order_id, exit_price, pnl_usdt)
            else:
                # No order_id: update user_trades directly then sync analytics
                trade.status     = "closed"
                trade.exit_price = exit_price or trade.exit_price
                trade.pnl_usdt   = pnl_usdt
                trade.closed_at  = datetime.now(timezone.utc)
                db.commit()
                close_user_trade(trade.id, exit_price, pnl_usdt)
            print(
                f"[WS] user={user_id} closed {bybit_symbol} "
                f"exit={exit_price} pnl={pnl_usdt:+.2f}"
            )
            try:
                from modules.tg_notifier import notify_user_trade
                notify_user_trade(_notify_uid, "close", _notify_data)
            except Exception:
                pass
    except Exception:
        traceback.print_exc()
    finally:
        db.close()


# ─── per-user WebSocket task ───────────────────────────────────────────────────

async def _watch_user(user_id: int, api_key: str, secret: str, is_demo: bool):
    url  = WS_DEMO if is_demo else WS_LIVE
    mode = "demo" if is_demo else "live"
    print(f"[WS] ▶ user={user_id} starting ({mode})")

    while True:
        try:
            async with websockets.connect(url, ping_interval=None) as ws:
                # ── auth ──────────────────────────────────────────────────────
                expires, sig = _sign(secret)
                await ws.send(json.dumps({"op": "auth", "args": [api_key, expires, sig]}))
                try:
                    auth_msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                except asyncio.TimeoutError:
                    print(f"[WS] user={user_id} auth timeout — retry")
                    await asyncio.sleep(RECONNECT_DELAY)
                    continue
                if not auth_msg.get("success"):
                    print(f"[WS] user={user_id} auth failed: {auth_msg.get('ret_msg')} — retry")
                    await asyncio.sleep(RECONNECT_DELAY)
                    continue

                # ── subscribe ─────────────────────────────────────────────────
                await ws.send(json.dumps({"op": "subscribe", "args": ["position"]}))
                print(f"[WS]  user={user_id} subscribed")

                loop = asyncio.get_running_loop()

                # ── receive loop ──────────────────────────────────────────────
                while True:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=PING_INTERVAL)
                    except asyncio.TimeoutError:
                        # No message for PING_INTERVAL seconds → send keepalive
                        await ws.send(json.dumps({"op": "ping"}))
                        continue

                    msg = json.loads(raw)

                    # Skip op-level responses (auth, subscribe, pong)
                    if "op" in msg:
                        continue
                    # Skip initial snapshot — only react to live changes (delta)
                    if msg.get("topic") != "position" or msg.get("type") != "delta":
                        continue

                    for item in msg.get("data", []):
                        size = float(item.get("size") or 1)
                        if size == 0:
                            symbol = item.get("symbol", "")
                            if symbol:
                                await loop.run_in_executor(
                                    None, _close_trades,
                                    user_id, api_key, secret, is_demo, symbol,
                                )

        except asyncio.CancelledError:
            print(f"[WS] ■ user={user_id} stopped")
            return
        except Exception as exc:
            print(f"[WS] user={user_id} error: {exc} — reconnect in {RECONNECT_DELAY}s")
            await asyncio.sleep(RECONNECT_DELAY)


# ─── public API ───────────────────────────────────────────────────────────────

def start_user(user_id: int, api_key: str, secret: str, is_demo: bool) -> None:
    """Start (or ignore if already running) a WS watcher for this user."""
    existing = _tasks.get(user_id)
    if existing and not existing.done():
        return
    task = asyncio.get_running_loop().create_task(
        _watch_user(user_id, api_key, secret, is_demo),
        name=f"pos-ws-u{user_id}",
    )
    _tasks[user_id] = task


def stop_user(user_id: int) -> None:
    task = _tasks.pop(user_id, None)
    if task and not task.done():
        task.cancel()


async def sync_with_db() -> None:
    """Start/stop WS tasks to match active users in DB."""
    db = SessionLocal()
    try:
        rows = (
            db.query(User, UserApiKey)
            .join(UserApiKey, User.id == UserApiKey.user_id)
            .filter(User.is_active == True, User.email_verified == True)
            .all()
        )
        active_ids: set[int] = set()
        for user, key_row in rows:
            uid = user.id
            active_ids.add(uid)
            existing = _tasks.get(uid)
            if existing and not existing.done():
                continue   # already running
            api_key = decrypt_field(key_row.api_key_enc)
            secret  = decrypt_field(key_row.secret_enc)
            if api_key and secret:
                start_user(uid, api_key, secret, key_row.is_demo)

        for uid in [u for u in list(_tasks) if u not in active_ids]:
            stop_user(uid)
    finally:
        db.close()


async def run_manager() -> None:
    """Background coroutine: keep WS tasks in sync with active users."""
    print("[WS] Position WebSocket manager started")
    while True:
        try:
            await sync_with_db()
        except Exception:
            traceback.print_exc()
        await asyncio.sleep(MANAGER_INTERVAL)
