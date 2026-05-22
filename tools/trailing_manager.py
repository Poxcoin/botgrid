"""
tools/trailing_manager.py — trail SL up on winning positions to lock profit while letting winners run.

Strategy (per-position):
  state IDLE  → unrealized < +3%: do nothing (original SL)
  +3% reached → move SL to entry × (1 + 0.5%) for LONG (break-even + 0.5%)
                                    × (1 - 0.5%) for SHORT
  +5% reached → trail SL at peak_price × (1 - 1.5%) for LONG
                                       × (1 + 1.5%) for SHORT
  +10% reached → trail tighter at peak × (1 - 1%)

State persisted in /opt/botgrid/trailing_state.json keyed by (user_id, symbol, side).

Bybit V5 trading_stop endpoint modifies the SL on an existing position.

Cron: every 1 min.
Targets only news/dex/signal source positions (Signal bot winners — Council 2026-05-22).
"""
from __future__ import annotations

import json
import os
import sys
import time
import sqlite3
from pathlib import Path

sys.path.insert(0, '/opt/botgrid')
os.chdir('/opt/botgrid')

from dotenv import load_dotenv
load_dotenv('/opt/botgrid/.env')

from sqlalchemy.orm import joinedload
from database import SessionLocal, User
from modules.bybit_client import build_from_key_row, get_positions
from modules.tg_notifier import send_telegram_message
from config.settings import TG_CHAT_ID

STATE_FILE = Path("/opt/botgrid/trailing_state.json")
DB_PATH = "/opt/botgrid/saas_database.sqlite"

# Trailing thresholds
BE_TRIGGER_PCT       = 3.0       # +3% unrealized → activate break-even SL
BE_BUFFER_PCT        = 0.5       # SL at entry ± 0.5% (lock small profit)
TRAIL_TRIGGER_PCT    = 5.0       # +5% → start trailing from peak
TRAIL_DISTANCE_PCT   = 1.5       # trail 1.5% below peak (LONG) / above (SHORT)
TIGHT_TRIGGER_PCT    = 10.0      # +10% → tighten to 1.0% from peak
TIGHT_DISTANCE_PCT   = 1.0

# Only manage these sources (Signal-style winners)
MANAGED_SOURCES = {"news", "dex", "liq_cascade"}


def _load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            return {}
    return {}


def _save_state(s: dict) -> None:
    tmp = STATE_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(s, indent=2))
    tmp.replace(STATE_FILE)


def _open_positions_with_source(user_id: int) -> dict:
    """Map (symbol_normalized, side) → source for current open positions."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        SELECT symbol, side, source, entry_price, opened_at
        FROM user_trades
        WHERE user_id = ? AND status = 'open'
    """, (user_id,))
    out = {}
    for sym, side, src, entry, opened in cur.fetchall():
        s_norm = sym.replace("/", "").replace(":USDT", "")
        if not s_norm.endswith("USDT"):
            s_norm += "USDT"
        out[(s_norm, side)] = {"source": src, "entry": float(entry or 0)}
    conn.close()
    return out


def _set_trailing_sl(ex, symbol, side, sl_price):
    """Update SL on existing position via /v5/position/trading-stop."""
    try:
        ex.private_post_v5_position_trading_stop(params={
            "category":    "linear",
            "symbol":      symbol,
            "stopLoss":    str(round(sl_price, 8)),
            "slTriggerBy": "MarkPrice",
            "positionIdx": 0,
        })
        return True
    except Exception as e:
        err = str(e)
        # 34040 = "not modified" = already set
        if "34040" in err or "not modified" in err.lower():
            return True
        print(f"  [TRAIL] SL update fail {symbol}: {err[:100]}")
        return False


def _manage_user(user, state, now):
    uid = user.id
    key_row = next((k for k in user.api_keys if k.exchange == "bybit"), None)
    if not key_row:
        return
    ex = build_from_key_row(key_row)
    if not ex:
        return

    try:
        positions = get_positions(ex)
    except Exception as e:
        print(f"  [TRAIL] user={uid} fetch positions err: {e}")
        return

    if not positions:
        return

    db_pos = _open_positions_with_source(uid)
    user_state = state.setdefault(str(uid), {})
    seen_keys = set()

    for p in positions:
        sym = p["symbol"]
        side = p["side"]
        key = f"{sym}_{side}"
        seen_keys.add(key)

        # Cross-reference DB to get source
        db_info = db_pos.get((sym, side))
        if not db_info:
            # Position not tracked in DB (legacy/manual) — skip
            continue
        src = db_info["source"]
        if src not in MANAGED_SOURCES:
            continue

        entry = p["entry_price"]
        mark = p["mark_price"] or 0
        if entry <= 0 or mark <= 0:
            continue

        # Unrealized % from entry
        if side == "LONG":
            unr_pct = (mark - entry) / entry * 100
        else:
            unr_pct = (entry - mark) / entry * 100

        ps = user_state.setdefault(key, {
            "stage": "idle",  # idle | be | trail | tight
            "peak":  mark,
            "entry": entry,
            "source": src,
        })

        # Update peak
        if side == "LONG":
            ps["peak"] = max(ps.get("peak", mark), mark)
        else:
            ps["peak"] = min(ps.get("peak", mark), mark)
        peak = ps["peak"]

        # Determine target stage
        target_stage = "idle"
        if unr_pct >= TIGHT_TRIGGER_PCT:
            target_stage = "tight"
        elif unr_pct >= TRAIL_TRIGGER_PCT:
            target_stage = "trail"
        elif unr_pct >= BE_TRIGGER_PCT:
            target_stage = "be"

        if target_stage == ps["stage"]:
            # No upgrade — recompute SL if trail or tight (since peak may have moved)
            if target_stage == "trail":
                new_sl = peak * (1 - TRAIL_DISTANCE_PCT / 100) if side == "LONG" else peak * (1 + TRAIL_DISTANCE_PCT / 100)
                _set_trailing_sl(ex, sym, side, new_sl)
            elif target_stage == "tight":
                new_sl = peak * (1 - TIGHT_DISTANCE_PCT / 100) if side == "LONG" else peak * (1 + TIGHT_DISTANCE_PCT / 100)
                _set_trailing_sl(ex, sym, side, new_sl)
            continue

        # Stage upgraded — apply new SL
        if target_stage == "be":
            new_sl = entry * (1 + BE_BUFFER_PCT / 100) if side == "LONG" else entry * (1 - BE_BUFFER_PCT / 100)
            msg = f"📈 Move SL to break-even+{BE_BUFFER_PCT}%"
        elif target_stage == "trail":
            new_sl = peak * (1 - TRAIL_DISTANCE_PCT / 100) if side == "LONG" else peak * (1 + TRAIL_DISTANCE_PCT / 100)
            msg = f"🚀 Trail SL at peak ±{TRAIL_DISTANCE_PCT}%"
        elif target_stage == "tight":
            new_sl = peak * (1 - TIGHT_DISTANCE_PCT / 100) if side == "LONG" else peak * (1 + TIGHT_DISTANCE_PCT / 100)
            msg = f"💎 Tight trail at peak ±{TIGHT_DISTANCE_PCT}%"
        else:
            continue

        if _set_trailing_sl(ex, sym, side, new_sl):
            ps["stage"] = target_stage
            ps["sl_price"] = new_sl
            print(f"  [TRAIL] user={uid} {sym} {side} unr={unr_pct:+.1f}% peak={peak:.4f} → {msg}, SL={new_sl:.4f}")
            if user.tg_chat_id:
                try:
                    send_telegram_message(
                        f"🎯 <b>Trail {sym} {side}</b>\n"
                        f"Unrealized: <b>{unr_pct:+.1f}%</b>\n"
                        f"Peak: {peak:.4f}\n"
                        f"New SL: <code>{new_sl:.4f}</code>\n"
                        f"{msg}",
                        user.tg_chat_id,
                    )
                except Exception:
                    pass

    # Cleanup closed positions
    for k in list(user_state.keys()):
        if k not in seen_keys:
            user_state.pop(k, None)


def main():
    state = _load_state()
    now = time.time()

    db = SessionLocal()
    try:
        users = (db.query(User).options(joinedload(User.api_keys))
                   .filter(User.is_active == True).all())
        for u in users:
            _ = list(u.api_keys)
    finally:
        db.close()

    for u in users:
        try:
            _manage_user(u, state, now)
        except Exception as e:
            print(f"user={u.id} manage err: {e}")

    _save_state(state)


if __name__ == "__main__":
    main()
