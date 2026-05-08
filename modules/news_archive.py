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
import threading
import re
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
                from_newsapi INTEGER DEFAULT 0,
                image_url    TEXT,
                category     TEXT DEFAULT 'OTHER'
            )
        """)
        con.execute("CREATE INDEX IF NOT EXISTS idx_published ON news(published_at)")
        for col, definition in [
            ("image_url", "TEXT"),
            ("category",  "TEXT DEFAULT 'OTHER'"),
        ]:
            try:
                con.execute(f"ALTER TABLE news ADD COLUMN {col} {definition}")
            except Exception:
                pass


def _fetch_og_image(url: str) -> str | None:
    """Fetch og:image from an article URL. Returns image URL or None."""
    try:
        import urllib.request
        req = urllib.request.Request(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; KadoBot/1.0)",
            "Accept": "text/html",
        })
        with urllib.request.urlopen(req, timeout=6) as resp:
            # Read first 32KB only — og:image is always in <head>
            chunk = resp.read(32768).decode("utf-8", errors="ignore")

        # Try og:image first, then twitter:image
        for pattern in [
            r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']',
            r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']',
            r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']',
        ]:
            m = re.search(pattern, chunk, re.IGNORECASE)
            if m:
                img = m.group(1).strip()
                if img.startswith("http"):
                    return img
    except Exception:
        pass
    return None


def _save_image_url(link: str, image_url: str) -> None:
    try:
        with _conn() as con:
            con.execute("UPDATE news SET image_url=? WHERE link=? AND image_url IS NULL", (image_url, link))
    except Exception:
        pass


def _fetch_and_save_image(link: str) -> None:
    """Background thread: fetch og:image and save to DB."""
    img = _fetch_og_image(link)
    if img:
        _save_image_url(link, img)


def archive_news(item: dict, from_newsapi: bool = False) -> bool:
    """Сохраняет новость в архив. Возвращает True если добавлена (не дубль)."""
    init_db()
    link = item.get("link", "")
    if not link or not item.get("title"):
        return False

    # Use provided image_url if present (e.g. from NewsAPI urlToImage)
    image_url = item.get("image_url") or item.get("urlToImage")

    try:
        with _conn() as con:
            con.execute("""
                INSERT OR IGNORE INTO news
                    (title, link, source, source_weight, description, published_at, archived_at, from_newsapi, image_url, category)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                item.get("title", ""),
                link,
                item.get("source", ""),
                float(item.get("source_weight", 0.75)),
                item.get("description", ""),
                item.get("published", datetime.now(timezone.utc).isoformat()),
                datetime.now(timezone.utc).isoformat(),
                1 if from_newsapi else 0,
                image_url,
                item.get("category", "OTHER"),
            ))
            inserted = con.total_changes > 0

        # If newly inserted and has a real HTTP link but no image yet → fetch og:image in background
        if inserted and not image_url and link.startswith("https://"):
            t = threading.Thread(target=_fetch_and_save_image, args=(link,), daemon=True)
            t.start()

        return inserted
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
