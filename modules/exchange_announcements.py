"""
exchange_announcements.py — Моніторинг анонсів бірж (Binance + Bybit).

Нові лістинги = найшвидший рух ринку. Монета може зрости 30-100% за хвилини
після анонсу. Модуль поллить API бірж кожні 30 сек і кидає нові анонси в чергу.
"""
import json
import os
import threading
import time
from datetime import datetime, timezone
from queue import Queue

import requests

ann_queue: Queue = Queue()

_SEEN_IDS_FILE = "processed_announcements.json"
_seen_ids: set = set()
_seen_lock = threading.Lock()
_running = False

_SESSION = requests.Session()
_SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
})

_LISTING_KEYWORDS = [
    "will list", "will add", "listing", "lists ", "new listing",
    "spot trading", "perpetual contract", "new pairs",
]


def _is_listing(title: str) -> bool:
    t = title.lower()
    return any(kw in t for kw in _LISTING_KEYWORDS)


def _load_seen():
    global _seen_ids
    if os.path.exists(_SEEN_IDS_FILE):
        try:
            with open(_SEEN_IDS_FILE) as f:
                _seen_ids = set(json.load(f))
        except Exception:
            _seen_ids = set()


def _save_seen():
    try:
        with _seen_lock:
            ids = list(_seen_ids)[-5000:]
        with open(_SEEN_IDS_FILE, "w") as f:
            json.dump(ids, f)
    except Exception:
        pass


def _make_item(title: str, item_id: str, source: str, ts_ms: int, description: str = "") -> dict:
    pub_dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    return {
        "title": title,
        "description": description,
        "link": f"ann://{source.lower().replace(' ', '_')}/{item_id}",
        "published": pub_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "published_dt": pub_dt.isoformat(),
        "source": source,
        "source_url": source,
        "source_weight": 1.0,
        "is_panic": False,
        "is_listing": _is_listing(title),
    }


def _poll_binance() -> list[dict]:
    try:
        resp = _SESSION.get(
            "https://www.binance.com/bapi/composite/v1/public/cms/article/list/query",
            params={"type": 1, "pageNo": 1, "pageSize": 10},
            timeout=10,
        )
        catalogs = resp.json().get("data", {}).get("catalogs", [])
        new_items = []
        for catalog in catalogs:
            if catalog.get("catalogId") != 48:
                continue
            for article in catalog.get("articles", []):
                item_id = f"binance_{article['id']}"
                with _seen_lock:
                    if item_id in _seen_ids:
                        continue
                    _seen_ids.add(item_id)
                title = article.get("title", "").strip()
                if not title:
                    continue
                item = _make_item(
                    title=title,
                    item_id=item_id,
                    source="Binance Announcements",
                    ts_ms=article.get("releaseDate", int(time.time() * 1000)),
                )
                new_items.append(item)
                print(f"[ANN] 🔔 Binance: {title}")
        return new_items
    except Exception as e:
        print(f"[ANN] Binance помилка: {type(e).__name__}")
        return []


def _poll_bybit() -> list[dict]:
    try:
        resp = _SESSION.get(
            "https://api.bybit.com/v5/announcements/index",
            params={"locale": "en-US", "type": "new_crypto", "page": 1, "limit": 10},
            timeout=10,
        )
        items = resp.json().get("result", {}).get("list", [])
        new_items = []
        for article in items:
            url_tail = (article.get("url") or "")[-50:]
            item_id = f"bybit_{url_tail}"
            with _seen_lock:
                if item_id in _seen_ids:
                    continue
                _seen_ids.add(item_id)
            title = article.get("title", "").strip()
            if not title:
                continue
            item = _make_item(
                title=title,
                item_id=item_id,
                source="Bybit Announcements",
                ts_ms=article.get("publishTime", int(time.time() * 1000)),
                description=article.get("description", "")[:300],
            )
            new_items.append(item)
            print(f"[ANN] 🔔 Bybit: {title}")
        return new_items
    except Exception as e:
        print(f"[ANN] Bybit помилка: {type(e).__name__}")
        return []


def _monitor_loop():
    global _running
    _load_seen()

    # Перший запуск — тільки заповнюємо seen_ids, не торгуємо по старих новинах
    _poll_binance()
    _poll_bybit()
    _save_seen()
    print("[ANN] ✅ Exchange announcements запущено (Binance + Bybit, кожні 30 сек)")

    while _running:
        time.sleep(30)
        fresh = _poll_binance() + _poll_bybit()
        if fresh:
            for item in fresh:
                ann_queue.put(item)
            _save_seen()


def start_announcements_monitor() -> bool:
    global _running
    _running = True
    t = threading.Thread(target=_monitor_loop, daemon=True, name="AnnMonitor")
    t.start()
    return True
