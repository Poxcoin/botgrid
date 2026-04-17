"""
newsapi_fetch.py — Бутстрап архива через NewsAPI.

Скачивает последние N дней крипто-новостей из NewsAPI
и сохраняет в news.db (SQLite архив).

Запуск:
    python tools/newsapi_fetch.py           # последние 30 дней
    python tools/newsapi_fetch.py --days 7  # последние 7 дней

Получить бесплатный ключ: https://newsapi.org (100 req/day, 30 дней)
Добавить в .env: NEWSAPI_KEY=ваш_ключ
"""
import os
import sys
import time
import argparse
from datetime import datetime, timezone, timedelta

import httpx

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from modules.news_archive import archive_news, count
from dotenv import load_dotenv
load_dotenv()

NEWSAPI_KEY = os.getenv("NEWSAPI_KEY", "")

QUERIES = [
    "bitcoin crypto",
    "ethereum blockchain",
    "cryptocurrency SEC",
    "crypto exchange hack",
    "defi protocol",
    "binance bybit coinbase",
]

SOURCE_WEIGHT = 0.80  # NewsAPI новости — средний вес


def fetch_page(query: str, from_date: str, to_date: str, page: int = 1) -> list:
    if not NEWSAPI_KEY:
        print("❌ NEWSAPI_KEY не задан в .env")
        return []
    try:
        r = httpx.get(
            "https://newsapi.org/v2/everything",
            params={
                "q": query,
                "from": from_date,
                "to": to_date,
                "language": "en",
                "sortBy": "publishedAt",
                "pageSize": 100,
                "page": page,
                "apiKey": NEWSAPI_KEY,
            },
            timeout=15,
        )
        data = r.json()
        if data.get("status") != "ok":
            print(f"  NewsAPI ошибка: {data.get('message', data)}")
            return []
        return data.get("articles", [])
    except Exception as e:
        print(f"  Ошибка запроса: {e}")
        return []


def run(days: int = 30) -> None:
    if not NEWSAPI_KEY:
        print("❌ Добавь NEWSAPI_KEY=... в файл .env и запусти снова")
        sys.exit(1)

    now = datetime.now(timezone.utc)
    from_dt = (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    to_dt   = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    print(f"NewsAPI fetch: {days} дней ({from_dt[:10]} → {to_dt[:10]})")
    print(f"Архив до старта: {count()} новостей\n")

    total_saved = 0
    for query in QUERIES:
        print(f"  Запрос: '{query}'")
        articles = fetch_page(query, from_dt, to_dt)
        saved = 0
        for art in articles:
            item = {
                "title":        art.get("title", ""),
                "link":         art.get("url", ""),
                "source":       art.get("source", {}).get("name", "NewsAPI"),
                "source_weight": SOURCE_WEIGHT,
                "description":  art.get("description", "") or "",
                "published":    art.get("publishedAt", now.isoformat()),
            }
            if archive_news(item, from_newsapi=True):
                saved += 1
        total_saved += saved
        print(f"    Добавлено: {saved} / {len(articles)}")
        time.sleep(1)  # rate limit

    print(f"\n✅ Готово! Добавлено {total_saved} новых новостей.")
    print(f"Архив теперь: {count()} новостей в news.db")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=30)
    args = parser.parse_args()
    run(days=args.days)
