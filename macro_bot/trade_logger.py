"""
SQLite trade logger for macro bot.
Records every trade open/close with full context.
"""
import sqlite3
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

log = logging.getLogger("macro.logger")

DB_PATH = Path(__file__).parent / "macro_trades.db"


def _conn():
    c = sqlite3.connect(DB_PATH)
    c.row_factory = sqlite3.Row
    return c


def init_db():
    with _conn() as c:
        c.execute("""
            CREATE TABLE IF NOT EXISTS trades (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ticket      INTEGER UNIQUE,
                event       TEXT,
                symbol      TEXT,
                direction   TEXT,
                volume      REAL,
                open_price  REAL,
                close_price REAL,
                sl_pips     REAL,
                tp_pips     REAL,
                deviation   REAL,
                strength    REAL,
                open_time   TEXT,
                close_time  TEXT,
                close_reason TEXT,
                profit_pips REAL,
                profit_usd  REAL,
                status      TEXT DEFAULT 'open'
            )
        """)


def log_open(
    ticket: int,
    event: str,
    symbol: str,
    direction: str,
    volume: float,
    open_price: float,
    sl_pips: float,
    tp_pips: float,
    deviation: float = 0.0,
    strength: float = 0.0,
):
    init_db()
    with _conn() as c:
        c.execute("""
            INSERT OR IGNORE INTO trades
            (ticket, event, symbol, direction, volume, open_price,
             sl_pips, tp_pips, deviation, strength, open_time, status)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            ticket, event, symbol, direction, volume, open_price,
            sl_pips, tp_pips, deviation, strength,
            datetime.now(timezone.utc).isoformat(), "open"
        ))
    log.info("Trade logged: ticket=%d %s %s %.2f lots @ %.5f",
             ticket, direction, symbol, volume, open_price)


def log_close(
    ticket: int,
    close_price: float,
    profit_usd: float,
    reason: str,
):
    init_db()
    now = datetime.now(timezone.utc).isoformat()
    with _conn() as c:
        row = c.execute("SELECT * FROM trades WHERE ticket=?", (ticket,)).fetchone()
        if not row:
            return
        pip = 0.01 if "JPY" in (row["symbol"] or "") else 0.0001
        direction = row["direction"]
        if direction == "LONG":
            profit_pips = (close_price - row["open_price"]) / pip
        else:
            profit_pips = (row["open_price"] - close_price) / pip

        c.execute("""
            UPDATE trades SET
                close_price=?, close_time=?, close_reason=?,
                profit_pips=?, profit_usd=?, status='closed'
            WHERE ticket=?
        """, (close_price, now, reason, round(profit_pips, 1), profit_usd, ticket))
    log.info("Trade closed: ticket=%d profit=%.2f USD (%.1f pips)",
             ticket, profit_usd, profit_pips)


def get_stats(days: int = 30) -> dict:
    """Returns performance stats for the last N days."""
    init_db()
    with _conn() as c:
        rows = c.execute("""
            SELECT * FROM trades
            WHERE status='closed'
              AND close_time >= datetime('now', ?)
            ORDER BY close_time DESC
        """, (f"-{days} days",)).fetchall()

    if not rows:
        return {"trades": 0}

    profits = [r["profit_usd"] for r in rows]
    wins    = [p for p in profits if p > 0]
    losses  = [p for p in profits if p <= 0]

    gross_profit = sum(wins)
    gross_loss   = abs(sum(losses))

    return {
        "trades":        len(rows),
        "wins":          len(wins),
        "losses":        len(losses),
        "win_rate":      round(len(wins) / len(rows) * 100, 1),
        "profit_factor": round(gross_profit / gross_loss, 2) if gross_loss else 0,
        "net_pnl":       round(sum(profits), 2),
        "avg_win":       round(sum(wins) / len(wins), 2) if wins else 0,
        "avg_loss":      round(sum(losses) / len(losses), 2) if losses else 0,
        "best_trade":    round(max(profits), 2),
        "worst_trade":   round(min(profits), 2),
        "avg_pips":      round(sum(r["profit_pips"] for r in rows) / len(rows), 1),
        "recent_trades": [
            {
                "ticket":    r["ticket"],
                "event":     r["event"],
                "direction": r["direction"],
                "profit":    r["profit_usd"],
                "pips":      r["profit_pips"],
                "reason":    r["close_reason"],
                "time":      r["close_time"],
            }
            for r in rows[:10]
        ],
    }
