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

# In-memory per-user-symbol lock: prevents stacking if same symbol dispatched twice
# before DB write completes. Key: (user_id, symbol)
import os
import time
import threading
_opening_lock = threading.Lock()
_opening_now: set[tuple] = set()

_FR_CLOSE_FILE = "fr_pending_closes.json"
_fr_close_lock = threading.Lock()


def _load_fr_closes() -> list[dict]:
    try:
        with open(_FR_CLOSE_FILE) as f:
            return json.load(f)
    except Exception:
        return []


def _save_fr_close(entry: dict) -> None:
    with _fr_close_lock:
        closes = _load_fr_closes()
        closes.append(entry)
        with open(_FR_CLOSE_FILE, "w") as f:
            json.dump(closes, f)


def _remove_fr_close(key: str) -> None:
    with _fr_close_lock:
        closes = [c for c in _load_fr_closes() if c.get("key") != key]
        with open(_FR_CLOSE_FILE, "w") as f:
            json.dump(closes, f)


def _schedule_fr_close(user: dict, symbol: str, side: str, qty: float,
                        delay_min: float) -> None:
    """Daemon thread: sleeps until close_at then issues reduce-only market close.
    Persists to fr_pending_closes.json so restarts can re-schedule missed closes."""
    close_at = time.time() + delay_min * 60
    key = f"{user['user_id']}:{symbol}:{int(close_at)}"
    entry = {
        "key":     key,
        "user_id": user["user_id"],
        "symbol":  symbol,
        "side":    side,
        "qty":     qty,
        "close_at": close_at,
        "is_demo": user["is_demo"],
    }
    _save_fr_close(entry)

    def _run():
        remaining = close_at - time.time()
        if remaining > 0:
            time.sleep(remaining)
        try:
            ex = _build_exchange(user["api_key"], user["secret"], user["is_demo"])
            order_side = "sell" if side == "LONG" else "buy"
            ex.create_order(symbol, "market", order_side, qty, params={
                "category":    "linear",
                "positionIdx": 0,
                "reduceOnly":  True,
            })
            print(f"[DISPATCHER] ⏱ FR scheduled close {side} {symbol} qty={qty} "
                  f"after {delay_min:.0f}min")
        except Exception as _e:
            print(f"[DISPATCHER] ⚠️ FR scheduled close error {symbol}: {_e}")
        finally:
            _remove_fr_close(key)

    threading.Thread(target=_run, daemon=True, name=f"fr-close-{symbol}").start()


def resume_fr_closes() -> None:
    """Call on startup to re-schedule any FR closes that survived a restart.
    Loads fr_pending_closes.json and fires threads for entries not yet past close_at."""
    closes = _load_fr_closes()
    if not closes:
        return
    now = time.time()
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.is_active == True).all()
        user_map: dict[int, User] = {u.user_id if hasattr(u, "user_id") else u.id: u for u in users}
    finally:
        db.close()

    for entry in closes:
        uid      = entry.get("user_id")
        symbol   = entry.get("symbol")
        side     = entry.get("side")
        qty      = entry.get("qty")
        close_at = entry.get("close_at", 0)
        key      = entry.get("key", "")
        is_demo  = entry.get("is_demo", False)

        if close_at < now - 3600:
            _remove_fr_close(key)
            continue

        u_row = user_map.get(uid)
        if not u_row:
            _remove_fr_close(key)
            continue
        key_row = next((k for k in u_row.api_keys if k.exchange == "bybit"), None)
        if not key_row:
            _remove_fr_close(key)
            continue

        api_key = decrypt_field(key_row.api_key_enc)
        secret  = decrypt_field(key_row.secret_enc)
        if not api_key or not secret:
            _remove_fr_close(key)
            continue

        user_dict = {"user_id": uid, "api_key": api_key, "secret": secret, "is_demo": is_demo}
        delay_min = max(0.0, (close_at - now) / 60.0)
        print(f"[DISPATCHER] ⏱ Resume FR close {side} {symbol} in {delay_min:.1f}min (user={uid})")

        def _run(u=user_dict, sym=symbol, s=side, q=qty, ca=close_at, k=key):
            remaining = ca - time.time()
            if remaining > 0:
                time.sleep(remaining)
            try:
                ex = _build_exchange(u["api_key"], u["secret"], u["is_demo"])
                order_side = "sell" if s == "LONG" else "buy"
                ex.create_order(sym, "market", order_side, q, params={
                    "category": "linear", "positionIdx": 0, "reduceOnly": True,
                })
                print(f"[DISPATCHER] ⏱ FR resume close {s} {sym} qty={q}")
            except Exception as _e:
                print(f"[DISPATCHER] ⚠️ FR resume close error {sym}: {_e}")
            finally:
                _remove_fr_close(k)

        threading.Thread(target=_run, daemon=True, name=f"fr-resume-{symbol}").start()

def _get_active_users(source: str) -> list[dict]:
    """Return all active users with API keys — no plan gate."""
    db = SessionLocal()
    try:
        users = db.query(User).filter(User.is_active == True).all()
        result = []
        for u in users:
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
                "user_id":         u.user_id if hasattr(u, "user_id") else u.id,
                "tg_chat_id":      u.tg_chat_id,
                "is_demo":      key_row.is_demo,
                "api_key":         api_key,
                "secret":          secret,
                "trade_size_pct":  None,  # risk-based auto sizing
            })
        return result
    finally:
        db.close()


def _build_exchange(api_key: str, secret: str, is_demo: bool) -> ccxt.bybit:
    ex = ccxt.bybit({
        "apiKey": api_key,
        "secret": secret,
        "options": {"defaultType": "linear"},
    })
    ex.has["fetchCurrencies"] = False
    if is_demo:
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
    for attempt in range(4):
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
        except Exception as _e:
            db.rollback()
            print(f"[DISPATCHER] ⚠️ _log_trade attempt {attempt+1} failed user={user_id} {symbol}: {_e}")
            if attempt < 3:
                time.sleep(0.5 * (2 ** attempt))
        finally:
            db.close()
    return None


def _execute_for_user(user: dict, signal: dict, signal_id: str) -> bool:
    """Execute one signal for one user — fully isolated."""
    uid             = user["user_id"]
    source          = signal.get("source", "news")
    symbol          = signal["symbol"]
    side            = signal["side"]           # LONG | SHORT
    leverage        = signal.get("leverage", 3)
    size_pct        = signal.get("size_pct", 3.0)
    tp_pct          = signal.get("tp_pct",  10.0)
    sl_pct          = signal.get("sl_pct",   4.0)
    close_after_min = signal.get("close_after_min")

    _lock_key = (uid, symbol)
    with _opening_lock:
        if _lock_key in _opening_now:
            print(f"[DISPATCHER] SKIP user={uid} {symbol} — вже відкривається (in-memory lock)")
            return False
        _opening_now.add(_lock_key)

    try:
        # Guard: check existing open positions in DB before touching the exchange
        _db = SessionLocal()
        try:
            coin_sym = symbol.split("/")[0].replace("USDT", "")
            existing = _db.query(UserTrade).filter(
                UserTrade.user_id == uid,
                UserTrade.symbol == symbol,
                UserTrade.status == "open",
            ).first()
            if existing:
                print(f"[DISPATCHER] SKIP user={uid} {symbol} — вже відкрита позиція (id={existing.id})")
                return False
            # Per-source limits: each bot has its own position budget.
            # Bots with different strategies (FR vs news) don't block each other.
            _PER_SOURCE_LIMIT = {
                "news": 3, "sweep": 3, "orderflow": 3, "cascade": 2,
                "orderblock": 2, "liq_cascade": 2, "dex": 2,
            }
            source_count = _db.query(UserTrade).filter(
                UserTrade.user_id == uid,
                UserTrade.status == "open",
                UserTrade.source == source,
            ).count()
            source_limit = _PER_SOURCE_LIMIT.get(source, 3)
            if source_count >= source_limit:
                print(f"[DISPATCHER] SKIP user={uid} — ліміт {source_count}/{source_limit} для {source}")
                return False
            # Global safety net across all non-grid bots
            total_count = _db.query(UserTrade).filter(
                UserTrade.user_id == uid,
                UserTrade.status == "open",
                UserTrade.source != "grid",
            ).count()
            if total_count >= 12:
                print(f"[DISPATCHER] SKIP user={uid} — глобальний ліміт {total_count}/12")
                return False
        finally:
            _db.close()

        ex = _build_exchange(user["api_key"], user["secret"], user["is_demo"])

        # Balance → position size (risk-based: 1% of balance per trade)
        balance = _get_free_usdt(ex)
        user_custom = user.get("trade_size_pct")
        if user_custom:
            size_pct = float(user_custom)
        else:
            # Auto: size = 1% risk / (leverage × sl_pct), capped at 25%
            size_pct = min(1.0 * 100 / (leverage * sl_pct), 25.0)
            # Score-based scaling: size = base × (score/10)²
            # Only for signals with an explicit score (news/whale/sweep bots).
            # score=7.0 → 49%, score=8.0 → 64%, score=9.5 → 90%, score=10+ → 100%
            sig_score = signal.get("score")
            if sig_score is not None:
                scale = min((abs(sig_score) / 10.0) ** 2, 1.0)
                size_pct = max(size_pct * scale, size_pct * 0.25)  # floor at 25% base
        size_usd = balance * (size_pct / 100) * leverage

        # Market price
        ticker = ex.fetch_ticker(symbol)
        price  = ticker["last"]

        qty = round(size_usd / price, 3)
        if qty <= 0:
            raise ValueError(f"qty={qty} too small (balance={balance:.2f})")

        # Set leverage — ignore 110043 ("leverage not modified" = already correct)
        try:
            ex.set_leverage(leverage, symbol)
        except Exception as _le:
            if "110043" not in str(_le):
                raise

        # Open position (no inline TP/SL — we set them after knowing the fill price)
        order_side = "buy" if side == "LONG" else "sell"
        order = ex.create_order(symbol, "market", order_side, qty, params={
            "category":    "linear",
            "positionIdx": 0,
        })
        fill = float(order.get("average") or price)

        # TP/SL calculated from actual fill price, not pre-order ticker
        tp_price = round(fill * (1 + tp_pct / 100), 6) if side == "LONG" else round(fill * (1 - tp_pct / 100), 6)
        sl_price = round(fill * (1 - sl_pct / 100), 6) if side == "LONG" else round(fill * (1 + sl_pct / 100), 6)

        # Set TP (LastPrice — triggers on actual traded price) + SL (MarkPrice — harder to manipulate)
        try:
            ex.private_post_v5_position_trading_stop(params={
                "category":    "linear",
                "symbol":      symbol.replace("/", "").replace(":USDT", ""),
                "takeProfit":  str(tp_price),
                "stopLoss":    str(sl_price),
                "tpTriggerBy": "LastPrice",
                "slTriggerBy": "MarkPrice",
                "positionIdx": 0,
            })
        except Exception as _tpsl_err:
            print(f"[DISPATCHER] ⚠️ TP/SL set failed {symbol}: {_tpsl_err}")

        _log_trade(uid, signal_id, source, symbol, side, leverage,
                   order.get("id"), fill, qty, "open")
        _score_tag = f" score={signal.get('score'):.1f}→{size_pct:.1f}%" if signal.get("score") is not None else ""
        print(f"[DISPATCHER] ✅ user={uid} {side} {symbol} qty={qty} fill={fill:.4f}{_score_tag}")

        # Integrity check: verify Bybit position size matches what we dispatched.
        # Drift >5% means a duplicate trade was opened elsewhere (e.g. legacy execute_trade()
        # path) or that the dispatcher itself ran twice for this signal.
        try:
            sym_id = symbol.replace("/", "").replace(":USDT", "")
            pos_resp = ex.private_get_v5_position_list(params={"category": "linear", "symbol": sym_id})
            items = (pos_resp.get("result") or {}).get("list") or []
            bybit_qty = float(items[0].get("size") or 0) if items else 0.0
            if bybit_qty > 0 and abs(bybit_qty - qty) > max(qty * 0.05, 0.001):
                drift_pct = (bybit_qty / qty - 1) * 100 if qty > 0 else 0
                alert = (
                    f"[DISPATCHER] 🚨 INTEGRITY DRIFT user={uid} {symbol}: "
                    f"dispatched qty={qty} but Bybit position={bybit_qty} ({drift_pct:+.0f}%) — "
                    f"likely a duplicate open path (execute_trade legacy?) "
                    f"or dispatch ran twice"
                )
                print(alert)
                try:
                    from modules.tg_notifier import send_telegram_message
                    from config.settings import TG_CHAT_ID
                    send_telegram_message(f"🚨 <b>SYNC DRIFT</b>\n{alert[:400]}", TG_CHAT_ID)
                except Exception:
                    pass
        except Exception as _ic:
            print(f"[DISPATCHER] integrity check failed (non-blocking): {_ic}")

        try:
            from modules.tg_notifier import notify_user_trade
            notify_user_trade(uid, "open", {
                "symbol":      symbol,
                "side":        side,
                "leverage":    leverage,
                "entry_price": fill,
                "source":      source,
            })
        except Exception:
            pass

        # FR strategy: auto-close after the funding-collection window
        if close_after_min and close_after_min > 0:
            _schedule_fr_close(user, symbol, side, qty, close_after_min)
            print(f"[DISPATCHER] ⏱ FR close scheduled in {close_after_min:.0f}min")

        return True

    except Exception as e:
        err = str(e)[:200]
        _log_trade(uid, signal_id, source, symbol, side, leverage,
                   None, None, None, "failed", err)
        print(f"[DISPATCHER] ❌ user={uid} {symbol} — {err}")
        return False
    finally:
        with _opening_lock:
            _opening_now.discard(_lock_key)


def dispatch(signal: dict) -> dict:
    """
    Main entry point. Call this instead of execute_trade() in main.py.

    signal = {
        "source":   "news" | "grid" | "sweep" | "cascade" | "orderflow" | "orderblock" | "dex" | "liq_cascade",
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

        monthly.gross_pnl        = (monthly.gross_pnl or 0.0) + pnl_usdt
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
