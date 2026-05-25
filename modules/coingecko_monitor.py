"""
CoinGecko Monitor — два сигнали раніше ніж TG-канали:

1. TRENDING (кожні 2 хв): топ-10 монет що набирають увагу на CoinGecko.
   Якщо монета є на Bybit і ще не в кулдауні → сигнал в cg_queue.
   Trending = ринок вже цікавиться ДО того як TG-агрегатори напишуть.

2. NEW LISTINGS (кожні 5 хв): нові монети додані на CoinGecko.
   Нова монета на CoinGecko → зазвичай через 1-4 тижні CEX лістинг.
   Сигнал: "watch" — не торгуємо одразу, але ставимо в чергу уваги.

Без API ключа. Rate limit CoinGecko free: 30 req/хв — добре вкладаємось.
"""
import time
import threading
import queue
from datetime import datetime, timezone

import requests

cg_queue: queue.Queue = queue.Queue()

POLL_TRENDING = 120   # 2 хв
POLL_NEW      = 300   # 5 хв

_TRENDING_URL  = "https://api.coingecko.com/api/v3/search/trending"
_COINS_LIST_URL = "https://api.coingecko.com/api/v3/coins/list?include_platform=false"

TRENDING_COOLDOWN = 6 * 3600  # не дублюємо ту саму trending монету 6 год

_seen_trending: dict[str, float] = {}  # symbol → last_signal_ts
_known_coins:   set[str]         = set()  # id монет що вже відомі

_session = requests.Session()
_session.headers.update({"User-Agent": "BotGrid/1.0", "Accept": "application/json"})


def _fetch_trending() -> list[dict]:
    try:
        r = _session.get(_TRENDING_URL, timeout=10)
        if r.status_code == 429:
            time.sleep(60)
            return []
        r.raise_for_status()
        coins = r.json().get("coins", [])
        results = []
        for c in coins:
            item = c.get("item", {})
            symbol = item.get("symbol", "").upper().strip()
            name   = item.get("name", "")
            rank   = item.get("market_cap_rank") or 9999
            score  = item.get("score", 0)  # 0 = найтрендовіший
            # Note: NOT including coin logo — user feedback "не источников фото".
            # Trending signals get KADO brand image via marketing_poster fallback.
            results.append({"symbol": symbol, "name": name, "rank": rank, "score": score})
        return results
    except Exception as e:
        print(f"[CG] trending fetch error: {e}")
        return []


def _fetch_coins_list() -> list[dict]:
    try:
        r = _session.get(_COINS_LIST_URL, timeout=15)
        if r.status_code == 429:
            time.sleep(60)
            return []
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[CG] coins list fetch error: {e}")
        return []


def _trending_loop():
    print("[CG]  CoinGecko Trending monitor запущено (кожні 2 хв)")
    while True:
        try:
            now = time.time()
            coins = _fetch_trending()

            for coin in coins:
                symbol = coin["symbol"]
                rank   = coin["rank"]

                # Пропускаємо топ-20 за капом — вже мейнстрім, ринок знає
                if rank and rank <= 20:
                    continue

                # Cooldown
                if now - _seen_trending.get(symbol, 0) < TRENDING_COOLDOWN:
                    continue

                _seen_trending[symbol] = now

                item = {
                    "title": (
                        f"{symbol} trending on CoinGecko "
                        f"(rank #{rank}, score={coin['score']+1}/10)"
                    ),
                    "description": (
                        f"{coin['name']} ({symbol}) entered CoinGecko trending top-10. "
                        f"Market cap rank: #{rank}. "
                        f"Usually precedes increased CEX volume and potential listing."
                    ),
                    "link":         f"cg://trending/{symbol}/{int(time.time() // 3600)}",
                    "published":    datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000"),
                    "published_dt": datetime.now(timezone.utc).isoformat(),
                    "source":       "CoinGecko Trending",
                    "source_weight": 0.80,
                    "is_panic":     False,
                    "is_cg_trending": True,
                    "cg_rank":      rank,
                }
                cg_queue.put_nowait(item)
                print(f"[CG]  Trending: {symbol} (rank #{rank})")

        except Exception as e:
            print(f"[CG] trending loop error: {e}")

        time.sleep(POLL_TRENDING)


def _new_listings_loop():
    global _known_coins
    print("[CG]  CoinGecko New Listings monitor запущено (кожні 5 хв)")

    # Перший запит — заповнюємо baseline (не генеруємо сигнали)
    initial = _fetch_coins_list()
    if initial:
        _known_coins = {c["id"] for c in initial}
        print(f"[CG]  Baseline: {len(_known_coins)} монет на CoinGecko")

    while True:
        time.sleep(POLL_NEW)
        try:
            all_coins = _fetch_coins_list()
            if not all_coins:
                continue

            current_ids = {c["id"] for c in all_coins}
            new_ids     = current_ids - _known_coins

            if new_ids:
                # Отримуємо дані по нових монетах
                new_coins = [c for c in all_coins if c["id"] in new_ids]
                for coin in new_coins[:5]:  # max 5 нових за раз
                    symbol = coin.get("symbol", "").upper().strip()
                    name   = coin.get("name", "")
                    if not symbol or len(symbol) > 10:
                        continue

                    item = {
                        "title": (
                            f"{symbol} newly listed on CoinGecko — potential upcoming CEX listing"
                        ),
                        "description": (
                            f"{name} ({symbol}) just added to CoinGecko. "
                            f"New CoinGecko listings often precede CEX listings by 1-4 weeks. "
                            f"Watch for Binance/Bybit announcement."
                        ),
                        "link":         f"cg://new/{coin['id']}",
                        "published":    datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000"),
                        "published_dt": datetime.now(timezone.utc).isoformat(),
                        "source":       "CoinGecko New Listing",
                        "source_weight": 0.70,
                        "is_panic":     False,
                        "is_cg_new":    True,
                    }
                    cg_queue.put_nowait(item)
                    print(f"[CG]  New coin: {symbol} ({name})")

                _known_coins = current_ids

        except Exception as e:
            print(f"[CG] new listings loop error: {e}")


def start_coingecko_monitor() -> threading.Thread:
    t1 = threading.Thread(target=_trending_loop,    daemon=True, name="cg-trending")
    t2 = threading.Thread(target=_new_listings_loop, daemon=True, name="cg-new-listings")
    t1.start()
    t2.start()
    return t1
