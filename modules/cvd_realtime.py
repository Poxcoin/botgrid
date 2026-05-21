"""
cvd_realtime.py — Real-time CVD from Bybit WebSocket trade stream.

Shadow mode: accumulates real CVD tick-by-tick alongside the OHLCV proxy.
Purpose: validate whether real CVD divergence signals are more reliable
than the OHLCV bar approximation (which gave 35.9% WR, -42%).

Architecture:
  - WS thread: subscribes to publicTrade.{SYMBOL} for all OF symbols
  - Checkpoint thread: saves CVD state to SQLite every 60s (survives restart)
  - Reset thread: clears state at 00:00 UTC daily
  - Reconnect: replays last 1000 trades via REST before resuming WS
"""
import json
import sqlite3
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone

import ccxt

_SYMBOLS_BYBIT = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "LINKUSDT", "INJUSDT", "ARBUSDT"]
_WS_URL = "wss://stream.bybit.com/v5/public/linear"
_DB_FILE = "cvd_realtime.db"
_CHECKPOINT_INTERVAL = 60    # seconds
_RESET_HOUR = 0              # UTC
_WINDOW_TRADES = 20_000      # per symbol memory cap

_lock = threading.Lock()
# symbol → list of (timestamp_ms, "Buy"|"Sell", notional_usdt)
_trades: dict[str, list] = defaultdict(list)
_running = False
_last_reset_day = -1


# ── DB ────────────────────────────────────────────────────────────────────────

def _db_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(_DB_FILE, timeout=10)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cvd_checkpoint (
            symbol TEXT PRIMARY KEY,
            cvd_usdt REAL,
            total_notional REAL,
            updated_at TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS cvd_shadow_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ts TEXT,
            symbol TEXT,
            proxy_ratio REAL,
            real_ratio REAL,
            proxy_bearish_div INTEGER DEFAULT 0,
            proxy_bullish_div INTEGER DEFAULT 0,
            real_bearish_div INTEGER DEFAULT 0,
            real_bullish_div INTEGER DEFAULT 0
        )
    """)
    conn.commit()
    return conn


# ── CVD state helpers ─────────────────────────────────────────────────────────

def _get_totals(sym: str) -> tuple[float, float]:
    with _lock:
        trades = list(_trades.get(sym, []))
    cvd   = sum(n if side == "Buy" else -n for _, side, n in trades)
    total = sum(n for _, _, n in trades)
    return cvd, total


def get_real_cvd_ratio(symbol: str) -> float:
    """CVD ratio 0–100 (>60 = buying pressure, <40 = selling, 50 = balanced)."""
    sym = symbol.replace("/USDT:USDT", "USDT").replace("/", "")
    cvd, total = _get_totals(sym)
    if total == 0:
        return 50.0
    return max(0.0, min(100.0, (cvd / total * 100.0 + 100.0) / 2.0))


def get_real_cvd_divergence(symbol: str, lookback: int = 2000) -> dict:
    """
    Real CVD ratio over last N trades, split into 20 time buckets.
    Returns cvd_ratio only — divergence (bearish/bullish) is computed
    by the caller with actual price context.
    """
    sym = symbol.replace("/USDT:USDT", "USDT").replace("/", "")
    with _lock:
        trades = list(_trades.get(sym, []))[-lookback:]

    if len(trades) < 100:
        return {"cvd_ratio": 50.0}

    n = 20
    bucket_size = max(1, len(trades) // n)
    running = 0.0
    series = []
    for i in range(0, len(trades), bucket_size):
        bucket = trades[i:i + bucket_size]
        running += sum(n_ if s == "Buy" else -n_ for _, s, n_ in bucket)
        series.append(running)

    if len(series) < 4:
        return {"cvd_ratio": 50.0}

    cvd_min, cvd_max = min(series), max(series)
    rng = cvd_max - cvd_min
    ratio = (series[-1] - cvd_min) / rng * 100.0 if rng > 0 else 50.0
    return {"cvd_ratio": round(ratio, 1)}


def is_ready(symbol: str) -> bool:
    """True if enough trades accumulated for reliable CVD (min 200 ticks)."""
    sym = symbol.replace("/USDT:USDT", "USDT").replace("/", "")
    with _lock:
        return len(_trades.get(sym, [])) >= 200


# ── Shadow logging ─────────────────────────────────────────────────────────────

def log_shadow(symbol: str, proxy_ratio: float, real_ratio: float,
               proxy_bearish: bool = False, proxy_bullish: bool = False,
               real_bearish: bool = False, real_bullish: bool = False):
    """Persist one comparison row per orderflow scan for post-48h analysis."""
    try:
        conn = _db_conn()
        conn.execute("""
            INSERT INTO cvd_shadow_log
            (ts, symbol, proxy_ratio, real_ratio,
             proxy_bearish_div, proxy_bullish_div, real_bearish_div, real_bullish_div)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            datetime.now(timezone.utc).isoformat(),
            symbol, round(proxy_ratio, 2), round(real_ratio, 2),
            int(proxy_bearish), int(proxy_bullish),
            int(real_bearish), int(real_bullish),
        ))
        conn.commit()
        conn.close()
    except Exception:
        pass


# ── REST replay ───────────────────────────────────────────────────────────────

def _replay_rest(sym_bybit: str):
    """Seed CVD from last 1000 REST trades before/after WS (re)connect."""
    try:
        ex = ccxt.bybit({
            "options": {"defaultType": "swap"},
            "enableRateLimit": True,
            "timeout": 10000,
        })
        ex.has["fetchCurrencies"] = False
        sym_ccxt = sym_bybit.replace("USDT", "/USDT:USDT")
        raw = ex.fetch_trades(sym_ccxt, limit=1000, params={"category": "linear"})
        entries = []
        for t in raw:
            notional = float(t["price"]) * float(t["amount"])
            side = "Buy" if t["side"] == "buy" else "Sell"
            ts_ms = int(t.get("timestamp") or time.time() * 1000)
            entries.append((ts_ms, side, notional))
        with _lock:
            existing = _trades[sym_bybit]
            cutoff = entries[-1][0] if entries else 0
            merged = entries + [e for e in existing if e[0] > cutoff]
            _trades[sym_bybit] = merged[-_WINDOW_TRADES:]
        print(f"[CVD-RT] Seeded {len(entries)} trades for {sym_bybit} from REST")
    except Exception as e:
        print(f"[CVD-RT] REST replay error {sym_bybit}: {type(e).__name__}")


# ── Checkpoint ────────────────────────────────────────────────────────────────

def _save_checkpoint():
    try:
        conn = _db_conn()
        now = datetime.now(timezone.utc).isoformat()
        for sym in _SYMBOLS_BYBIT:
            cvd, total = _get_totals(sym)
            conn.execute("""
                INSERT OR REPLACE INTO cvd_checkpoint (symbol, cvd_usdt, total_notional, updated_at)
                VALUES (?, ?, ?, ?)
            """, (sym, cvd, total, now))
        conn.commit()
        conn.close()
    except Exception:
        pass


def _checkpoint_loop():
    while _running:
        time.sleep(_CHECKPOINT_INTERVAL)
        _save_checkpoint()


def _reset_loop():
    global _last_reset_day
    while _running:
        time.sleep(60)
        now = datetime.now(timezone.utc)
        if now.hour == _RESET_HOUR and now.day != _last_reset_day:
            with _lock:
                for sym in _SYMBOLS_BYBIT:
                    _trades[sym] = []
            _last_reset_day = now.day
            print("[CVD-RT] Daily CVD reset at 00:00 UTC")


# ── WebSocket ─────────────────────────────────────────────────────────────────

def _on_message(ws, msg):
    try:
        data = json.loads(msg)
        trade_list = data.get("data")
        if not trade_list:
            return
        now_ms = time.time() * 1000
        with _lock:
            for t in trade_list:
                sym = t.get("s", "")
                if sym not in _SYMBOLS_BYBIT:
                    continue
                price    = float(t.get("p", 0))
                volume   = float(t.get("v", 0))
                notional = price * volume
                if notional <= 0:
                    continue
                side  = t.get("S", "")
                ts_ms = int(t.get("T", now_ms))
                _trades[sym].append((ts_ms, side, notional))
                if len(_trades[sym]) > _WINDOW_TRADES:
                    _trades[sym] = _trades[sym][-_WINDOW_TRADES:]
    except Exception:
        pass


def _run_ws():
    args = [f"publicTrade.{s}" for s in _SYMBOLS_BYBIT]
    sub_msg = json.dumps({"op": "subscribe", "args": args})

    def on_open(ws):
        ws.send(sub_msg)
        print(f"[CVD-RT]  WebSocket connected: {', '.join(_SYMBOLS_BYBIT)}")

    def on_error(ws, err):
        print(f"[CVD-RT] WS error: {type(err).__name__}")

    def on_close(ws, code, reason):
        print(f"[CVD-RT] WS closed — replaying REST + reconnecting in 10s")
        time.sleep(10)
        if _running:
            for sym in _SYMBOLS_BYBIT:
                _replay_rest(sym)
            _connect()

    def _connect():
        try:
            import websocket as _ws_lib
            ws = _ws_lib.WebSocketApp(
                _WS_URL,
                on_open=on_open,
                on_message=_on_message,
                on_error=on_error,
                on_close=on_close,
            )
            ws.run_forever(ping_interval=20, ping_timeout=10)
        except Exception as e:
            print(f"[CVD-RT] Connect failed: {e} — retry in 30s")
            time.sleep(30)
            if _running:
                _connect()

    _connect()


# ── Public API ────────────────────────────────────────────────────────────────

def start_realtime_cvd():
    """Start WebSocket CVD stream. Idempotent — safe to call multiple times."""
    global _running
    if _running:
        return
    _running = True

    for sym in _SYMBOLS_BYBIT:
        _replay_rest(sym)

    threading.Thread(target=_run_ws,          daemon=True, name="CVD-RT-WS").start()
    threading.Thread(target=_checkpoint_loop, daemon=True, name="CVD-RT-CK").start()
    threading.Thread(target=_reset_loop,      daemon=True, name="CVD-RT-RST").start()
    print("[CVD-RT] Shadow CVD started (WS + checkpoint + daily reset)")
