"""
news_archive.py — SQLite архив всех новостей.

Сохраняет каждую новость из RSS в БД — накапливаем историю
для Replay бэктестера. Также принимает новости из NewsAPI.

Использование:
    from modules.news_archive import archive_news, get_news

    archive_news(news_item)          # вызывается из main.py на каждую новость
    rows = get_news(days=30)         # чтение для replay
"""
import sqlite3
import os
from datetime import datetime, timezone, timedelta

DB_PATH = "news.db"


def _conn() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    return con


def init_db() -> None:
    with _conn() as con:
        con.execute("""
            CREATE TABLE IF NOT EXISTS news (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                title        TEXT NOT NULL,
                link         TEXT UNIQUE NOT NULL,
                source       TEXT,
                source_weight REAL DEFAULT 0.75,
                description  TEXT,
                published_at TEXT,
                archived_at  TEXT,
                from_newsapi INTEGER DEFAULT 0
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_published ON news(published_at)")


def archive_news(item: dict, from_newsapi: bool = False) -> bool:
    """Сохраняет новость в архив. Возвращает True если добавлена (не дубль)."""
    init_db()
    link = item.get("link", "")
    if not link or not item.get("title"):
        return False
    try:
        with _conn() as con:
            con.execute("""
                INSERT OR IGNORE INTO news
                    (title, link, source, source_weight, description, published_at, archived_at, from_newsapi)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                item.get("title", ""),
                link,
                item.get("source", ""),
                float(item.get("source_weight", 0.75)),
                item.get("description", ""),
                item.get("published", datetime.now(timezone.utc).isoformat()),
                datetime.now(timezone.utc).isoformat(),
                1 if from_newsapi else 0,
            ))
            return con.total_changes > 0
    except Exception as e:
        print(f"[archive] Ошибка: {e}")
        return False


def get_news(days: int = 30, limit: int = 2000) -> list[dict]:
    """Возвращает новости за последние N дней для replay."""
    init_db()
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM news WHERE published_at >= ? ORDER BY published_at ASC LIMIT ?",
            (since, limit),
        ).fetchall()
    return [dict(r) for r in rows]


def count() -> int:
    init_db()
    with _conn() as con:
        return con.execute("SELECT COUNT(*) FROM news").fetchone()[0]


if __name__ == "__main__":
    init_db()
    print(f"Архив: {count()} новостей в {DB_PATH}")
