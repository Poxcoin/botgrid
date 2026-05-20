"""
Shared Market State — inter-bot communication layer.

Each bot publishes its market view. Dispatcher reads before opening positions.

States (priority order for safety):
  CRASH > BEAR > NEUTRAL > BULL > PUMP

TTL: each state entry expires after STATE_TTL_HOURS. If no bot updated
the state for a symbol in that window, it's treated as NEUTRAL.

Aggregation rules:
  - Any CRASH source → CRASH (immediate override)
  - Majority vote weighted by confidence for others
  - Tie → NEUTRAL (safe default)
"""
import sqlite3
from datetime import datetime, timezone, timedelta
from enum import Enum
from pathlib import Path

_DB_PATH = Path(__file__).parent.parent / "saas_database.sqlite"
STATE_TTL_HOURS = 2
CRASH_TTL_HOURS = 0.5  # CRASH expires faster — market recovers quickly

_PRIORITY = {"CRASH": 5, "BEAR": 3, "BULL": 3, "PUMP": 4, "NEUTRAL": 1}
_SCORE    = {"CRASH": -10, "BEAR": -1, "NEUTRAL": 0, "BULL": 1, "PUMP": 2}


class MarketCondition(str, Enum):
    CRASH   = "CRASH"
    BEAR    = "BEAR"
    NEUTRAL = "NEUTRAL"
    BULL    = "BULL"
    PUMP    = "PUMP"


def _conn() -> sqlite3.Connection:
    con = sqlite3.connect(str(_DB_PATH), timeout=10)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("""
        CREATE TABLE IF NOT EXISTS market_states (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol    TEXT    NOT NULL,
            state     TEXT    NOT NULL,
            source    TEXT    NOT NULL,
            confidence REAL   NOT NULL DEFAULT 0.5,
            reason    TEXT,
            ts        TEXT    NOT NULL
        )
    """)
    con.execute("CREATE INDEX IF NOT EXISTS ix_ms_symbol_ts ON market_states(symbol, ts)")
    con.commit()
    return con


def set_state(symbol: str, state: MarketCondition | str, source: str,
              confidence: float = 0.5, reason: str = "") -> None:
    """Publish a market condition from a bot."""
    symbol = symbol.split("/")[0].replace(":USDT", "").upper()
    state  = MarketCondition(state).value
    ts     = datetime.now(timezone.utc).isoformat()
    try:
        con = _conn()
        con.execute(
            "INSERT INTO market_states (symbol, state, source, confidence, reason, ts) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (symbol, state, source, round(confidence, 3), reason[:200], ts),
        )
        con.commit()
        con.close()
    except Exception as e:
        print(f"[MARKET_STATE] write error: {e}")


def get_state(symbol: str) -> MarketCondition:
    """
    Aggregate all recent bot signals for a symbol and return consensus state.
    Safe default: NEUTRAL.
    """
    symbol = symbol.split("/")[0].replace(":USDT", "").upper()
    try:
        con = _conn()
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=STATE_TTL_HOURS)).isoformat()
        rows = con.execute(
            "SELECT state, confidence FROM market_states "
            "WHERE symbol = ? AND ts >= ? ORDER BY ts DESC",
            (symbol, cutoff),
        ).fetchall()
        con.close()
    except Exception as e:
        print(f"[MARKET_STATE] read error: {e}")
        return MarketCondition.NEUTRAL

    if not rows:
        return MarketCondition.NEUTRAL

    crash_cutoff = (datetime.now(timezone.utc) - timedelta(hours=CRASH_TTL_HOURS)).isoformat()
    try:
        con = _conn()
        crash_rows = con.execute(
            "SELECT state FROM market_states "
            "WHERE symbol = ? AND state = 'CRASH' AND ts >= ?",
            (symbol, crash_cutoff),
        ).fetchall()
        con.close()
        if crash_rows:
            return MarketCondition.CRASH
    except Exception:
        pass

    # Weighted score vote
    score = sum(_SCORE.get(r[0], 0) * r[1] for r in rows)
    total_confidence = sum(r[1] for r in rows) or 1

    normalized = score / total_confidence
    if normalized <= -2.0:
        return MarketCondition.BEAR
    if normalized >= 2.0:
        return MarketCondition.PUMP
    if normalized >= 1.0:
        return MarketCondition.BULL
    if normalized <= -0.5:
        return MarketCondition.BEAR
    return MarketCondition.NEUTRAL


def get_global_state() -> MarketCondition:
    """Aggregate across all symbols — used for global risk checks."""
    try:
        con = _conn()
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=STATE_TTL_HOURS)).isoformat()
        rows = con.execute(
            "SELECT state, confidence FROM market_states WHERE ts >= ?",
            (cutoff,),
        ).fetchall()
        con.close()
    except Exception:
        return MarketCondition.NEUTRAL

    if not rows:
        return MarketCondition.NEUTRAL

    crash_count = sum(1 for r in rows if r[0] == "CRASH")
    if crash_count >= 2:
        return MarketCondition.CRASH

    score = sum(_SCORE.get(r[0], 0) * r[1] for r in rows)
    total  = sum(r[1] for r in rows) or 1
    normalized = score / total
    if normalized <= -1.5:
        return MarketCondition.BEAR
    if normalized >= 1.5:
        return MarketCondition.BULL
    return MarketCondition.NEUTRAL


def should_block(symbol: str, side: str) -> tuple[bool, str]:
    """
    Main gate for dispatcher. Returns (blocked, reason).

    Rules:
      CRASH  → block LONG, allow SHORT
      BEAR   → block LONG (soft — only if global also BEAR)
      BULL   → block SHORT (soft — only if global also BULL)
      PUMP   → block SHORT, allow LONG
      NEUTRAL → allow everything
    """
    state  = get_state(symbol)
    global_ = get_global_state()

    if state == MarketCondition.CRASH:
        if side == "LONG":
            return True, f"market CRASH ({symbol})"
        return False, ""

    if state == MarketCondition.PUMP:
        if side == "SHORT":
            return True, f"market PUMP ({symbol})"
        return False, ""

    # Soft blocks: only when symbol AND global agree
    if state == MarketCondition.BEAR and global_ in (MarketCondition.BEAR, MarketCondition.CRASH):
        if side == "LONG":
            return True, f"market BEAR ({symbol} + global)"

    if state == MarketCondition.BULL and global_ == MarketCondition.BULL:
        if side == "SHORT":
            return True, f"market BULL ({symbol} + global)"

    return False, ""
