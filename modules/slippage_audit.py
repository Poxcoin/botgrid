"""
modules/slippage_audit.py — capture entry slippage on every live order.

Council 2026-05-22 (Alt 1): backtester assumes no slippage. Real fills differ
from intended entry by spread + market impact. Without measurement, we can't
trust backtest EV projections.

Schema (slippage_audit.sqlite):
  id, user_id, source, symbol, side, qty, expected_entry, actual_fill,
  slippage_bps (positive = adverse for trader), leverage, ts

Usage from dispatcher after order fills:
    from modules.slippage_audit import log_fill
    log_fill(uid, source, symbol, side, qty, expected_entry=price,
             actual_fill=fill, leverage=leverage)
"""
from __future__ import annotations

import sqlite3
import time
import threading
from pathlib import Path

DB_PATH = Path("/opt/botgrid/slippage_audit.sqlite")
_lock = threading.Lock()


def _ensure_schema():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS slippage_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            source TEXT NOT NULL,
            symbol TEXT NOT NULL,
            side TEXT NOT NULL,
            qty REAL,
            expected_entry REAL NOT NULL,
            actual_fill REAL NOT NULL,
            slippage_bps REAL NOT NULL,
            leverage INTEGER,
            ts INTEGER NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_sa_source_ts ON slippage_audit(source, ts)")
    conn.commit()
    conn.close()


_ensure_schema()


def log_fill(user_id: int, source: str, symbol: str, side: str,
             qty: float, expected_entry: float, actual_fill: float,
             leverage: int = 1) -> None:
    """Record slippage event. Slippage = adverse price move from expected to actual.
    Positive bps = worse than expected (e.g., bought higher / sold lower)."""
    if expected_entry <= 0 or actual_fill <= 0:
        return
    if side == "LONG":
        # Bought — bad if actual > expected (paid more)
        slip = (actual_fill - expected_entry) / expected_entry * 10000  # bps
    else:
        # Sold — bad if actual < expected (received less)
        slip = (expected_entry - actual_fill) / expected_entry * 10000

    with _lock:
        try:
            conn = sqlite3.connect(DB_PATH)
            conn.execute("""
                INSERT INTO slippage_audit
                (user_id, source, symbol, side, qty, expected_entry,
                 actual_fill, slippage_bps, leverage, ts)
                VALUES (?,?,?,?,?,?,?,?,?,?)
            """, (user_id, source, symbol, side, qty, expected_entry,
                  actual_fill, slip, leverage, int(time.time())))
            conn.commit()
            conn.close()
        except Exception as e:
            print(f"[SLIPPAGE_AUDIT] log err: {e}")


def stats(window_days: int = 14) -> list[dict]:
    """Per-source slippage stats over the window."""
    cutoff = int(time.time()) - window_days * 86400
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        SELECT source, COUNT(*) n,
               ROUND(AVG(slippage_bps), 2) avg_bps,
               ROUND(MAX(slippage_bps), 2) worst_bps,
               ROUND(MIN(slippage_bps), 2) best_bps,
               ROUND(SUM(slippage_bps), 2) total_bps
        FROM slippage_audit
        WHERE ts >= ?
        GROUP BY source
        ORDER BY avg_bps DESC
    """, (cutoff,))
    out = [
        {"source": r[0], "n": r[1], "avg_bps": r[2],
         "worst_bps": r[3], "best_bps": r[4], "total_bps": r[5]}
        for r in cur.fetchall()
    ]
    conn.close()
    return out
