"""
modules/paper_trader.py — simulated trade execution (no exchange calls).

Council 2026-05-22 (Alt 2): collect statistical data on Cascade/OB/Orderflow
without burning capital. Also tests INVERTED Orderflow direction (Alt 3).

Schema (paper_trades.sqlite):
  id, source, symbol, side, leverage, entry_price, qty,
  sl_pct, tp_pct, opened_at, closed_at, exit_price, pnl_pct, status,
  variant ('normal' | 'inverted')

API:
  paper_open(source, symbol, side, leverage, entry, sl_pct, tp_pct, variant='normal')
  paper_check_and_close()   # call periodically: poll Bybit mark price, simulate TP/SL hits

Designed to be invoked from existing bot signal-generation paths even when
TRADING flag is False — drop in `paper_open(...)` after the signal is computed.

Slippage model: 5bp on entry (assumes market order at mid + spread).
Fee: 0.055% × 2 round-trip × leverage.
"""
from __future__ import annotations

import sqlite3
import time
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

DB_PATH = Path("/opt/botgrid/paper_trades.sqlite")
SLIPPAGE_BP = 5  # 5 basis points on entry
BYBIT_TAKER_FEE = 0.00055

_lock = threading.Lock()


def _ensure_schema():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS paper_trades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            leverage INTEGER NOT NULL,
            entry_price REAL NOT NULL,
            qty REAL NOT NULL,
            sl_pct REAL NOT NULL,
            tp_pct REAL NOT NULL,
            sl_price REAL NOT NULL,
            tp_price REAL NOT NULL,
            opened_at INTEGER NOT NULL,
            closed_at INTEGER,
            exit_price REAL,
            exit_reason TEXT,
            pnl_pct REAL,
            status TEXT NOT NULL DEFAULT 'open',
            variant TEXT NOT NULL DEFAULT 'normal'
        )
    """)
    conn.commit()
    conn.close()


_ensure_schema()


def paper_open(
    source: str,
    symbol: str,
    side: str,       # 'LONG' | 'SHORT'
    leverage: int,
    entry_price: float,
    sl_pct: float,
    tp_pct: float,
    qty: float = 1.0,
    variant: str = "normal",  # or 'inverted' (flips side)
) -> int:
    """Open a paper trade. Returns row id. If `variant='inverted'`, flip side."""
    if variant == "inverted":
        side = "SHORT" if side == "LONG" else "LONG"

    # Apply slippage
    slip = SLIPPAGE_BP / 10000.0
    fill = entry_price * (1 + slip if side == "LONG" else 1 - slip)

    if side == "LONG":
        sl_price = fill * (1 - sl_pct / 100)
        tp_price = fill * (1 + tp_pct / 100)
    else:
        sl_price = fill * (1 + sl_pct / 100)
        tp_price = fill * (1 - tp_pct / 100)

    with _lock:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO paper_trades
            (source, symbol, side, leverage, entry_price, qty, sl_pct, tp_pct,
             sl_price, tp_price, opened_at, variant, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'open')
        """, (source, symbol, side, leverage, fill, qty, sl_pct, tp_pct,
              sl_price, tp_price, int(time.time()), variant))
        rid = cur.lastrowid
        conn.commit()
        conn.close()
    return rid


def paper_close(trade_id: int, exit_price: float, reason: str = "manual") -> None:
    with _lock:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("SELECT side, leverage, entry_price FROM paper_trades WHERE id=?", (trade_id,))
        row = cur.fetchone()
        if not row:
            conn.close()
            return
        side, lev, entry = row
        if side == "LONG":
            move_pct = (exit_price - entry) / entry * 100
        else:
            move_pct = (entry - exit_price) / entry * 100
        # Apply fees (round-trip × leverage)
        gross_pct = move_pct * lev
        fee_pct = BYBIT_TAKER_FEE * 2 * lev * 100
        pnl_pct = gross_pct - fee_pct

        cur.execute("""
            UPDATE paper_trades
               SET status='closed', closed_at=?, exit_price=?, exit_reason=?, pnl_pct=?
             WHERE id=?
        """, (int(time.time()), exit_price, reason, pnl_pct, trade_id))
        conn.commit()
        conn.close()


def paper_check_and_close(get_mark_price_fn) -> int:
    """For each open paper trade, fetch mark price via callable. Close if TP or SL hit.
    Returns number of closed trades.
    """
    with _lock:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute("""
            SELECT id, symbol, side, sl_price, tp_price
            FROM paper_trades WHERE status='open'
        """)
        opens = cur.fetchall()
        conn.close()

    closed = 0
    for tid, sym, side, sl_p, tp_p in opens:
        try:
            mark = get_mark_price_fn(sym)
        except Exception:
            continue
        if mark is None or mark <= 0:
            continue
        exit_reason = None
        if side == "LONG":
            if mark <= sl_p:
                exit_reason = "SL"
                exit_price = sl_p
            elif mark >= tp_p:
                exit_reason = "TP"
                exit_price = tp_p
        else:  # SHORT
            if mark >= sl_p:
                exit_reason = "SL"
                exit_price = sl_p
            elif mark <= tp_p:
                exit_reason = "TP"
                exit_price = tp_p
        if exit_reason:
            paper_close(tid, exit_price, reason=exit_reason)
            closed += 1
    return closed


def stats_by_source(window_days: int = 14) -> list:
    """Return per-source × variant stats."""
    cutoff = int(time.time()) - window_days * 86400
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        SELECT source, variant, COUNT(*),
               SUM(CASE WHEN pnl_pct > 0 THEN 1 ELSE 0 END),
               ROUND(SUM(pnl_pct), 2),
               ROUND(AVG(pnl_pct), 3)
        FROM paper_trades
        WHERE status='closed' AND closed_at >= ?
        GROUP BY source, variant
        ORDER BY source, variant
    """, (cutoff,))
    rows = cur.fetchall()
    conn.close()
    out = []
    for src, var, n, wins, total, avg in rows:
        wr = (wins * 100.0 / n) if n else 0
        out.append({"source": src, "variant": var, "n": n, "wr": wr,
                    "total_pnl_pct": total, "avg_pnl_pct": avg})
    return out
