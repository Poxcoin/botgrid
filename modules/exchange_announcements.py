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

# Per-source backoff: retry after N seconds on consecutive failures
_backoff: dict = {"binance": 0.0, "okx": 0.0}
_fail_count: dict = {"binance": 0, "okx": 0}

_SESSION = requests.Session()
_SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json",
})

_LISTING_KEYWORDS = [
    "will list", "will add", "listing", "lists ", "new listing",
    "spot trading", "perpetual contract", "new pairs",
    "adds ", "opens trading", "available for trading",
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
    now = time.time()
    if now < _backoff["binance"]:
        return []
    try:
        resp = _SESSION.get(
            "https://www.binance.com/bapi/composite/v1/public/cms/article/list/query",
            params={"type": 1, "pageNo": 1, "pageSize": 10},
            timeout=4,
        )
        if resp.status_code != 200:
            raise ValueError(f"HTTP {resp.status_code}")
        try:
            body = resp.json()
        except Exception:
            raise ValueError("invalid JSON in Binance response")
        # Guard: data may be None or not a dict if Binance returns an error envelope
        data = body.get("data") if isinstance(body, dict) else None
        catalogs = data.get("catalogs", []) if isinstance(data, dict) else []
        _fail_count["binance"] = 0
        new_items = []
        for catalog in catalogs:
            if not isinstance(catalog, dict):
                continue
            if catalog.get("catalogId") != 48:
                continue
            for article in catalog.get("articles", []) or []:
                if not isinstance(article, dict):
                    continue
                item_id = f"binance_{article.get('id', '')}"
                if not article.get('id'):
                    continue
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
        _fail_count["binance"] += 1
        wait = min(60 * _fail_count["binance"], 600)  # backoff up to 10 min
        _backoff["binance"] = now + wait
        if _fail_count["binance"] <= 2:
            print(f"[ANN] Binance помилка: {type(e).__name__} (backoff {wait}s)")
        return []


def _poll_okx() -> list[dict]:
    """OKX New Listings announcements."""
    now = time.time()
    if now < _backoff["okx"]:
        return []
    try:
        resp = _SESSION.get(
            "https://www.okx.com/priapi/v1/operate/article",
            params={"t": 0, "category": "New Listings", "page": 1, "pageSize": 10},
            timeout=4,
        )
        if resp.status_code != 200:
            raise ValueError(f"HTTP {resp.status_code}")
        try:
            body_okx = resp.json()
        except Exception:
            raise ValueError("invalid JSON in OKX response")
        data = body_okx.get("data", {}) if isinstance(body_okx, dict) else {}
        articles = data.get("articles", []) if isinstance(data, dict) else []
        _fail_count["okx"] = 0
        new_items = []
        for article in articles:
            if not isinstance(article, dict):
                continue
            item_id = f"okx_{article.get('id', '')}"
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
                source="OKX Announcements",
                ts_ms=article.get("publishTime", int(time.time() * 1000)),
            )
            new_items.append(item)
            print(f"[ANN] 🔔 OKX: {title}")
        return new_items
    except Exception as e:
        _fail_count["okx"] += 1
        wait = min(60 * _fail_count["okx"], 600)
        _backoff["okx"] = now + wait
        if _fail_count["okx"] <= 2:
            print(f"[ANN] OKX помилка: {type(e).__name__} (backoff {wait}s)")
        return []


def _poll_bybit() -> list[dict]:
    try:
        resp = _SESSION.get(
            "https://api.bybit.com/v5/announcements/index",
            params={"locale": "en-US", "type": "new_crypto", "page": 1, "limit": 10},
            timeout=4,
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
    _poll_okx()
    _save_seen()
    print("[ANN] ✅ Exchange announcements запущено (Binance + Bybit + OKX, кожні 3 сек)")

    while _running:
        time.sleep(3)
        fresh = _poll_binance() + _poll_bybit() + _poll_okx()
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
