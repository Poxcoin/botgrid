"""
analytics_db.py — Аналитическая SQLite база данных.

Хранит все сигналы + результаты сделок в структурированном виде.
Даёт ответы на вопросы:
  - Какой тип новостей даёт лучший WR?
  - Какие монеты самые прибыльные?
  - В какое время суток лучше входить?
  - Groq HIGH impact → какой реальный результат?
"""
import sqlite3
import json
import os
from datetime import datetime, timezone

DB_PATH = "analytics.db"


def _conn() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db() -> None:
    with _conn() as con:
        # Migration: add bot_source to existing DBs that predate this column
        try:
            con.execute("ALTER TABLE trades ADD COLUMN bot_source TEXT NOT NULL DEFAULT 'signal'")
        except Exception:
            pass  # column already exists
        con.executescript("""
        CREATE TABLE IF NOT EXISTS signals (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp        TEXT NOT NULL,
            coin             TEXT NOT NULL,
            action           TEXT NOT NULL,
            total_score      REAL,
            confidence       INTEGER,
            size_multiplier  REAL,
            news_title       TEXT,
            news_source      TEXT,
            news_age_minutes INTEGER,
            ai_score         INTEGER,
            ai_confidence    INTEGER,
            groq_novelty     INTEGER,
            groq_priced_in   INTEGER,
            groq_impact      TEXT,
            groq_expected    TEXT,
            liq_signal       TEXT,
            onchain_signal   TEXT,
            whale_active     INTEGER,
            whale_side       TEXT,
            rsi              REAL,
            funding_rate     REAL,
            fear_greed       INTEGER,
            btc_dominance    REAL,
            hour_utc         INTEGER,
            executed         INTEGER DEFAULT 0,
            order_id         TEXT
        );

        CREATE TABLE IF NOT EXISTS trades (
            id               INTEGER PRIMARY KEY AUTOINCREMENT,
            signal_id        INTEGER REFERENCES signals(id),
            coin             TEXT NOT NULL,
            action           TEXT NOT NULL,
            bot_source       TEXT NOT NULL DEFAULT 'signal',
            entry_price      REAL,
            exit_price       REAL,
            pnl_usdt         REAL,
            pnl_pct          REAL,
            result           TEXT DEFAULT 'OPEN',
            duration_minutes INTEGER,
            timestamp_open   TEXT,
            timestamp_close  TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_signals_coin ON signals(coin);
        CREATE INDEX IF NOT EXISTS idx_signals_action ON signals(action);
        CREATE INDEX IF NOT EXISTS idx_signals_ts ON signals(timestamp);
        CREATE INDEX IF NOT EXISTS idx_trades_signal ON trades(signal_id);
        CREATE INDEX IF NOT EXISTS idx_trades_source ON trades(bot_source);
        """)


def save_signal(signal: dict, executed: bool = False, order_id: str = None) -> int:
    """Сохраняет сигнал в БД. Возвращает ID записи."""
    init_db()
    comp = signal.get("components", {})
    now = signal.get("timestamp", datetime.now(timezone.utc).isoformat())
    hour = datetime.fromisoformat(now.replace("Z", "+00:00")).hour if now else 0

    # Groq данные если есть
    groq = signal.get("groq", {})

    with _conn() as con:
        cur = con.execute("""
            INSERT INTO signals (
                timestamp, coin, action, total_score, confidence, size_multiplier,
                news_title, news_source, news_age_minutes,
                ai_score, ai_confidence,
                groq_novelty, groq_priced_in, groq_impact, groq_expected,
                liq_signal, onchain_signal,
                whale_active, whale_side, rsi, funding_rate,
                fear_greed, btc_dominance, hour_utc,
                executed, order_id
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (
            now,
            signal.get("coin", ""),
            signal.get("action", "HOLD"),
            signal.get("total_score"),
            signal.get("confidence"),
            signal.get("size_multiplier"),
            signal.get("news_title", ""),
            signal.get("source", ""),
            signal.get("news_age_minutes"),
            comp.get("ai_score"),
            comp.get("ai_confidence"),
            groq.get("novelty"),
            int(groq.get("priced_in", False)) if groq else None,
            groq.get("market_impact"),
            groq.get("expected_move"),
            comp.get("liq_signal"),
            comp.get("onchain_signal"),
            int(comp.get("whale_active", False)),
            comp.get("whale_side"),
            comp.get("rsi"),
            comp.get("funding_rate"),
            comp.get("fear_greed"),
            comp.get("btc_dominance"),
            hour,
            int(executed),
            order_id,
        ))
        return cur.lastrowid


def mark_signal_executed(signal_id: int, order_id: str = None) -> None:
    """Позначає сигнал як виконаний (після успішного розміщення ордера)."""
    init_db()
    with _conn() as con:
        con.execute(
            "UPDATE signals SET executed=1, order_id=? WHERE id=?",
            (order_id, signal_id)
        )


def save_trade(signal_id: int, coin: str, action: str,
               entry_price: float, timestamp_open: str,
               bot_source: str = "signal") -> int:
    """Открывает новую сделку в БД. Возвращает ID."""
    init_db()
    with _conn() as con:
        cur = con.execute("""
            INSERT INTO trades (signal_id, coin, action, bot_source, entry_price, result, timestamp_open)
            VALUES (?,?,?,?,?,'OPEN',?)
        """, (signal_id, coin, action, bot_source, entry_price, timestamp_open))
        return cur.lastrowid


def close_trade(trade_id: int, exit_price: float, pnl_usdt: float,
                pnl_pct: float, duration_minutes: int) -> None:
    """Закрывает сделку с результатом."""
    init_db()
    result = "WIN" if pnl_usdt > 0 else "LOSS"
    with _conn() as con:
        con.execute("""
            UPDATE trades SET
                exit_price=?, pnl_usdt=?, pnl_pct=?, result=?,
                duration_minutes=?, timestamp_close=?
            WHERE id=?
        """, (
            exit_price, pnl_usdt, pnl_pct, result,
            duration_minutes, datetime.now(timezone.utc).isoformat(),
            trade_id,
        ))


def save_user_trade(user_id: int, coin: str, side: str,
                    entry_price: float, source: str = "grid") -> int:
    """Записывает открытую сделку в user_trades (SaaS таблица). Возвращает ID."""
    from database import SessionLocal, UserTrade
    from datetime import datetime, timezone
    db = SessionLocal()
    try:
        symbol = f"{coin}/USDT:USDT" if "/" not in coin else coin
        trade = UserTrade(
            user_id=user_id,
            source=source,
            symbol=symbol,
            side=side,
            entry_price=entry_price,
            status="open",
            opened_at=datetime.now(timezone.utc),
        )
        db.add(trade)
        db.commit()
        db.refresh(trade)
        return trade.id
    except Exception:
        db.rollback()
        return 0
    finally:
        db.close()


def close_user_trade(trade_id: int, exit_price: float, pnl_usdt: float) -> None:
    """Закрывает сделку в user_trades с результатом."""
    from database import SessionLocal, UserTrade
    from datetime import datetime, timezone
    if not trade_id:
        return
    db = SessionLocal()
    try:
        trade = db.query(UserTrade).filter_by(id=trade_id).first()
        if trade:
            trade.exit_price = exit_price
            trade.pnl_usdt = pnl_usdt
            trade.status = "closed"
            trade.closed_at = datetime.now(timezone.utc)
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()


def migrate_signals_log(signals_log_path: str = "signals_log.json") -> int:
    """Импортирует существующие данные из signals_log.json в analytics.db."""
    if not os.path.exists(signals_log_path):
        return 0
    with open(signals_log_path) as f:
        records = json.load(f)

    count = 0
    for rec in records:
        if rec.get("action") not in ("LONG", "SHORT"):
            continue
        try:
            sid = save_signal(rec, executed=True)
            result = rec.get("result")
            pnl = rec.get("pnl_usdt")
            if result and pnl is not None:
                comp = rec.get("components", {})
                with _conn() as con:
                    con.execute("""
                        INSERT OR IGNORE INTO trades
                        (signal_id, coin, action, pnl_usdt, result, timestamp_open)
                        VALUES (?,?,?,?,?,?)
                    """, (sid, rec["coin"], rec["action"], float(pnl),
                          "WIN" if float(pnl) > 0 else "LOSS",
                          rec.get("timestamp", "")))
            count += 1
        except Exception:
            pass
    return count
