"""
unified_pnl.py — Єдиний трекер угод для ВСІХ ботів.

Тягне ЗАКРИТІ позиції з Bybit /v5/position/closed-pnl кожні 5 хв,
зберігає в таблицю all_trades з тегом bot_source (signal / grid / funding).

Публічний API:
  start_sync(exchange_factory)   — запустити daemon-поток
  get_report()                   — dict з PnL по всіх ботах
  get_recent_trades(n)           — список останніх N угод
"""
import sqlite3
import threading
import time
from datetime import datetime, timezone, timedelta

from modules.analytics_db import DB_PATH

# Всі монети по яких Bybit може мати закриті позиції
_ALL_COINS = [
    "BTC", "ETH", "SOL",
    # signal bot watchlist
    "BNB", "XRP", "ADA", "DOGE", "AVAX", "DOT", "LINK",
    "INJ", "SUI", "APT", "OP", "ARB",
    "NEAR", "FET", "TON", "TRX", "ATOM",
    "AAVE", "UNI", "LDO", "CRV", "RUNE",
    "WLD", "JUP", "PENDLE", "ONDO",
]

SYNC_INTERVAL = 300   # 5 хвилин
LOOKBACK_DAYS = 30    # як далеко в минуле тягнемо при першому синку


def _conn() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_all_trades_table() -> None:
    with _conn() as con:
        con.executescript("""
        CREATE TABLE IF NOT EXISTS all_trades (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            bybit_key       TEXT UNIQUE,
            bot_source      TEXT NOT NULL DEFAULT 'grid',
            coin            TEXT NOT NULL,
            action          TEXT NOT NULL,
            qty             REAL,
            entry_price     REAL,
            exit_price      REAL,
            pnl_usdt        REAL,
            result          TEXT,
            timestamp_open  TEXT,
            timestamp_close TEXT,
            duration_min    INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_at_coin   ON all_trades(coin);
        CREATE INDEX IF NOT EXISTS idx_at_source ON all_trades(bot_source);
        CREATE INDEX IF NOT EXISTS idx_at_close  ON all_trades(timestamp_close);
        """)


def _fetch_closed_pnl(exchange, symbol: str, since_ms: int) -> list:
    try:
        params = {"category": "linear", "symbol": symbol, "limit": 200}
        # startTime не підтримується на demo — пробуємо з ним, фолбек без нього
        try:
            resp = exchange.private_get_v5_position_closed_pnl(
                {**params, "startTime": str(since_ms)}
            )
            rows = resp.get("result", {}).get("list", [])
            if rows:
                return rows
        except Exception:
            pass
        # Фолбек: без startTime — деду через bybit_key
        resp = exchange.private_get_v5_position_closed_pnl(params)
        return resp.get("result", {}).get("list", [])
    except Exception as e:
        print(f"[unified_pnl] fetch {symbol}: {e}")
        return []


def _tag_source(coin: str, close_ts_ms: int) -> str:
    """Визначає джерело угоди: signal, funding, або grid."""
    try:
        con = sqlite3.connect(DB_PATH)
        con.row_factory = sqlite3.Row
        # Шукаємо signal bot угоду: ±30 хвилин і та ж монета
        window_ms = 30 * 60 * 1000
        open_min = datetime.fromtimestamp((close_ts_ms - window_ms * 8) / 1000, tz=timezone.utc).isoformat()
        close_max = datetime.fromtimestamp((close_ts_ms + 60_000) / 1000, tz=timezone.utc).isoformat()
        row = con.execute(
            "SELECT id FROM trades WHERE coin=? AND timestamp_open>=? AND timestamp_open<=? LIMIT 1",
            (coin, open_min, close_max)
        ).fetchone()
        con.close()
        if row:
            return "signal"
    except Exception:
        pass
    return "grid"


def sync_from_bybit(exchange) -> int:
    """Синхронізує всі закриті позиції з Bybit. Повертає кількість нових записів."""
    init_all_trades_table()

    # Дізнаємось найновішу запис щоб не тягнути зайве
    try:
        con = _conn()
        row = con.execute("SELECT MAX(timestamp_close) FROM all_trades").fetchone()
        con.close()
        last_close = row[0] if row and row[0] else None
    except Exception:
        last_close = None

    if last_close:
        try:
            since_dt = datetime.fromisoformat(last_close.replace("Z", "+00:00")) - timedelta(minutes=30)
        except Exception:
            since_dt = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
    else:
        since_dt = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)

    since_ms = int(since_dt.timestamp() * 1000)
    new_count = 0

    for coin in _ALL_COINS:
        symbol = f"{coin}USDT"
        entries = _fetch_closed_pnl(exchange, symbol, since_ms)
        if not entries:
            time.sleep(0.2)
            continue

        for e in entries:
            # Унікальний ключ: символ + час закриття + pnl (достатньо для деду)
            close_ms = int(e.get("updatedTime") or e.get("createdTime") or 0)
            pnl_val  = float(e.get("closedPnl") or 0)
            bybit_key = f"{symbol}_{close_ms}_{pnl_val:.4f}"

            entry_px = float(e.get("avgEntryPrice") or 0)
            exit_px  = float(e.get("avgExitPrice")  or 0)
            qty      = float(e.get("qty") or 0)
            side     = (e.get("side") or "").lower()
            action   = "LONG" if side == "buy" else "SHORT"

            open_ms = int(e.get("createdTime") or 0)
            ts_open  = datetime.fromtimestamp(open_ms  / 1000, tz=timezone.utc).isoformat() if open_ms  else None
            ts_close = datetime.fromtimestamp(close_ms / 1000, tz=timezone.utc).isoformat() if close_ms else None
            duration = round((close_ms - open_ms) / 60000) if open_ms and close_ms else None

            result = "WIN" if pnl_val > 0 else ("LOSS" if pnl_val < 0 else "BE")
            source = _tag_source(coin, close_ms)

            try:
                with _conn() as con:
                    con.execute("""
                        INSERT OR IGNORE INTO all_trades
                        (bybit_key, bot_source, coin, action, qty,
                         entry_price, exit_price, pnl_usdt, result,
                         timestamp_open, timestamp_close, duration_min)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
                    """, (bybit_key, source, coin, action, qty,
                          entry_px, exit_px, pnl_val, result,
                          ts_open, ts_close, duration))
                    if con.execute("SELECT changes()").fetchone()[0]:
                        new_count += 1
            except Exception as err:
                print(f"[unified_pnl] insert {symbol}: {err}")

        time.sleep(0.3)

    if new_count:
        print(f"[unified_pnl] ✅ Синк завершено — {new_count} нових угод")
    return new_count


# ─── Звіти ───────────────────────────────────────────────────────────────────

def get_report() -> dict:
    """Повний PnL звіт по всіх ботах."""
    init_all_trades_table()
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    week_ago  = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    con = _conn()
    rows = con.execute(
        "SELECT bot_source, coin, pnl_usdt, result, timestamp_close FROM all_trades"
    ).fetchall()
    con.close()

    def _stats(subset):
        vals  = [float(r["pnl_usdt"] or 0) for r in subset]
        total = sum(vals)
        today = sum(v for r, v in zip(subset, vals)
                    if (r["timestamp_close"] or "")[:10] == today_str)
        week  = sum(v for r, v in zip(subset, vals)
                    if (r["timestamp_close"] or "") >= week_ago)
        wins  = sum(1 for r in subset if r["result"] == "WIN")
        n     = len(subset)
        wr    = round(wins / n * 100) if n else 0
        return {"total": round(total, 2), "today": round(today, 2),
                "week": round(week, 2), "trades": n, "wins": wins, "wr": wr}

    signal_rows  = [r for r in rows if r["bot_source"] == "signal"]
    grid_rows    = [r for r in rows if r["bot_source"] == "grid"]
    funding_rows = [r for r in rows if r["bot_source"] == "funding"]
    all_closed   = list(rows)

    # Топ монети всього
    by_coin: dict[str, float] = {}
    for r in all_closed:
        by_coin[r["coin"]] = round(by_coin.get(r["coin"], 0) + float(r["pnl_usdt"] or 0), 2)
    top_coins = sorted(by_coin.items(), key=lambda x: x[1], reverse=True)

    return {
        "all":     _stats(all_closed),
        "signal":  _stats(signal_rows),
        "grid":    _stats(grid_rows),
        "funding": _stats(funding_rows),
        "top_coins": top_coins[:5],
        "worst_coins": top_coins[-3:] if len(top_coins) >= 3 else [],
    }


def get_recent_trades(n: int = 20) -> list:
    """Останні N угод по всіх ботах."""
    init_all_trades_table()
    con = _conn()
    rows = con.execute(
        "SELECT bot_source, coin, action, pnl_usdt, result, entry_price, exit_price, "
        "qty, timestamp_close, duration_min FROM all_trades "
        "ORDER BY timestamp_close DESC LIMIT ?", (n,)
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]


# ─── Daemon thread ────────────────────────────────────────────────────────────

def start_sync(exchange_factory, interval: int = SYNC_INTERVAL) -> threading.Thread:
    """Запустити фоновий синк. Викликати один раз при старті."""
    init_all_trades_table()

    def _loop():
        print(f"[unified_pnl] 🔄 Старт синку (інтервал {interval // 60} хв, {len(_ALL_COINS)} монет)")
        # Перший синк одразу при старті
        try:
            ex = exchange_factory()
            sync_from_bybit(ex)
        except Exception as e:
            print(f"[unified_pnl] Помилка першого синку: {e}")
        while True:
            time.sleep(interval)
            try:
                ex = exchange_factory()
                sync_from_bybit(ex)
            except Exception as e:
                print(f"[unified_pnl] Помилка синку: {e}")

    t = threading.Thread(target=_loop, name="unified-pnl-sync", daemon=True)
    t.start()
    return t
