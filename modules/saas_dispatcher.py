"""
SaaS Dispatcher — executes signals for all active subscribers.

Flow:
  Signal → dispatch(signal) → [user1, user2, ...] → execute isolated per user
  Each user: decrypt API key → ccxt exchange → trade → log to DB
"""
import json
import uuid
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

import ccxt

from database import SessionLocal, User, UserApiKey, UserTrade, MonthlyPnl, AuditLog
from utils.crypto import decrypt_field, encrypt_field

# Max parallel user executions per signal
_EXECUTOR = ThreadPoolExecutor(max_workers=20)

# Bots available per plan
PLAN_BOTS = {
    "trial":       {"grid"},
    "free":        set(),
    "basic":       {"grid", "news"},
    "pro":         {"grid", "news", "fr", "liq_cascade", "listing", "whale", "dex"},
    "performance": {"grid", "news", "fr", "liq_cascade", "listing", "whale", "dex"},
}


def _get_active_users(source: str) -> list[dict]:
    """Return users who can trade this signal source."""
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.is_active == True).all()
        result = []
        for u in users:
            allowed = PLAN_BOTS.get(u.effective_plan, set())
            if source not in allowed:
                continue
            if not u.api_keys:
                continue
            key_row = next((k for k in u.api_keys if k.exchange == "bybit"), None)
            if not key_row:
                continue
            api_key = decrypt_field(key_row.api_key_enc)
            secret  = decrypt_field(key_row.secret_enc)
            if not api_key or not secret:
                continue
            result.append({
                "user_id":    u.user_id if hasattr(u, "user_id") else u.id,
                "tg_chat_id": u.tg_chat_id,
                "is_testnet": key_row.is_testnet,
                "api_key":    api_key,
                "secret":     secret,
            })
        return result
    finally:
        db.close()


def _build_exchange(api_key: str, secret: str, is_testnet: bool) -> ccxt.bybit:
    ex = ccxt.bybit({
        "apiKey": api_key,
        "secret": secret,
        "options": {"defaultType": "linear"},
    })
    ex.has["fetchCurrencies"] = False
    if is_testnet:
        ex.urls["api"] = ex.urls["demotrading"]
    ex.load_markets()
    return ex


def _get_free_usdt(ex: ccxt.bybit) -> float:
    """Balance fetch compatible with both demo (UNIFIED) and live (CONTRACT/UNIFIED)."""
    for acct in ("UNIFIED", "CONTRACT"):
        try:
            r = ex.private_get_v5_account_wallet_balance(params={"accountType": acct})
            coins = r.get("result", {}).get("list", [{}])[0].get("coin", [])
            for c in coins:
                if c.get("coin") == "USDT":
                    v = float(c.get("availableToWithdraw") or c.get("walletBalance") or 0)
                    if v > 0:
                        return v
        except Exception:
            pass
    try:
        return float(ex.fetch_balance()["USDT"]["free"] or 0)
    except Exception:
        return 0.0


def _log_trade(user_id: int, signal_id: str, source: str, symbol: str,
               side: str, leverage: int, order_id: str | None,
               entry_price: float | None, qty: float | None,
               status: str, error_msg: str | None = None):
    db = SessionLocal()
    try:
        trade = UserTrade(
            user_id=user_id, signal_id=signal_id, source=source,
            symbol=symbol, side=side, leverage=leverage,
            order_id=order_id, entry_price=entry_price, qty=qty,
            status=status, error_msg=error_msg,
        )
        db.add(trade)
        db.add(AuditLog(
            user_id=user_id,
            action="trade_open" if status == "open" else "trade_failed",
            detail_enc=encrypt_field(json.dumps({"symbol": symbol, "side": side, "order_id": order_id, "error": error_msg})),
        ))
        db.commit()
        return trade.id
    except Exception:
        db.rollback()
    finally:
        db.close()


def _execute_for_user(user: dict, signal: dict, signal_id: str) -> bool:
    """Execute one signal for one user — fully isolated."""
    uid      = user["user_id"]
    source   = signal.get("source", "news")
    symbol   = signal["symbol"]
    side     = signal["side"]           # LONG | SHORT
    leverage = signal.get("leverage", 3)
    size_pct = signal.get("size_pct", 3.0)
    tp_pct   = signal.get("tp_pct",  10.0)
    sl_pct   = signal.get("sl_pct",   4.0)

    try:
        ex = _build_exchange(user["api_key"], user["secret"], user["is_testnet"])

        # Balance → position size
        balance  = _get_free_usdt(ex)
        size_usd = balance * (size_pct / 100) * leverage

        # Market price
        ticker = ex.fetch_ticker(symbol)
        price  = ticker["last"]

        qty = round(size_usd / price, 3)
        if qty <= 0:
            raise ValueError(f"qty={qty} too small (balance={balance:.2f})")

        # Set leverage
        market_id = ex.market_id(symbol)
        ex.set_leverage(leverage, symbol)

        # TP / SL prices (calculated from ticker before fill)
        tp_price = round(price * (1 + tp_pct / 100), 6) if side == "LONG" else round(price * (1 - tp_pct / 100), 6)
        sl_price = round(price * (1 - sl_pct / 100), 6) if side == "LONG" else round(price * (1 + sl_pct / 100), 6)

        # Open position with inline TP/SL (Bybit linear supports this)
        order_side = "buy" if side == "LONG" else "sell"
        order = ex.create_order(symbol, "market", order_side, qty, params={
            "category":    "linear",
            "positionIdx": 0,
            "takeProfit":  str(tp_price),
            "stopLoss":    str(sl_price),
            "tpTriggerBy": "MarkPrice",
            "slTriggerBy": "MarkPrice",
        })
        fill = float(order.get("average") or price)

        _log_trade(uid, signal_id, source, symbol, side, leverage,
                   order.get("id"), fill, qty, "open")
        print(f"[DISPATCHER] ✅ user={uid} {side} {symbol} qty={qty} fill={fill:.4f}")
        return True

    except Exception as e:
        err = str(e)[:200]
        _log_trade(uid, signal_id, source, symbol, side, leverage,
                   None, None, None, "failed", err)
        print(f"[DISPATCHER] ❌ user={uid} {symbol} — {err}")
        return False


def dispatch(signal: dict) -> dict:
    """
    Main entry point. Call this instead of execute_trade() in main.py.

    signal = {
        "source":   "news" | "fr" | "grid" | "listing" | "whale",
        "symbol":   "SOL/USDT:USDT",
        "side":     "LONG" | "SHORT",
        "leverage": 3,
        "size_pct": 3.0,
        "tp_pct":   10.0,
        "sl_pct":   4.0,
    }
    """
    source    = signal.get("source", "news")
    signal_id = str(uuid.uuid4())
    users     = _get_active_users(source)

    if not users:
        print(f"[DISPATCHER] No active users for source={source}")
        return {"ok": 0, "fail": 0, "signal_id": signal_id}

    print(f"[DISPATCHER] Signal {source} {signal.get('symbol')} → {len(users)} users")

    futures = {
        _EXECUTOR.submit(_execute_for_user, u, signal, signal_id): u["user_id"]
        for u in users
    }

    ok = fail = 0
    for future in as_completed(futures, timeout=60):
        try:
            ok += 1 if future.result() else 0
            fail += 0 if future.result() else 1
        except Exception:
            fail += 1

    print(f"[DISPATCHER] Done — ok={ok} fail={fail}")
    return {"ok": ok, "fail": fail, "signal_id": signal_id}


def update_trade_closed(order_id: str, exit_price: float, pnl_usdt: float):
    """Call this when a position closes to record PnL and update monthly settlement."""
    db = SessionLocal()
    try:
        trade = db.query(UserTrade).filter(
            UserTrade.order_id == order_id,
            UserTrade.status == "open",
        ).first()
        if not trade:
            return

        trade.exit_price = exit_price
        trade.pnl_usdt   = pnl_usdt
        trade.status     = "closed"
        trade.closed_at  = datetime.now(timezone.utc)

        # Update monthly PnL
        now = datetime.now(timezone.utc)
        monthly = db.query(MonthlyPnl).filter_by(
            user_id=trade.user_id, year=now.year, month=now.month
        ).first()
        if not monthly:
            monthly = MonthlyPnl(user_id=trade.user_id, year=now.year, month=now.month)
            db.add(monthly)

        monthly.gross_pnl       += pnl_usdt
        monthly.performance_fee  = max(0.0, monthly.gross_pnl * 0.20)
        monthly.net_pnl          = monthly.gross_pnl - monthly.performance_fee

        db.add(AuditLog(
            user_id=trade.user_id,
            action="trade_close",
            detail_enc=encrypt_field(json.dumps({"order_id": order_id, "pnl": pnl_usdt, "exit": exit_price})),
        ))
        db.commit()
    except Exception:
        db.rollback()
        traceback.print_exc()
    finally:
        db.close()
