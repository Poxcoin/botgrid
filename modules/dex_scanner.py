"""
DEX Volume Scanner — виявляє токени з аномальним об'ємом на DEX.
Джерело: GeckoTerminal API (безкоштовно, без ключів).

Логіка: токен отримав об'єм в 5x+ від норми за останню 1h
→ потенційний рух ціни або прийдешній CEX лістинг.
Генерує news item → іде через generate_signal (Claude + market data).
Якщо токен не на Bybit — get_market_metrics поверне None → відпаде сам.
"""
import time
import threading
import queue
from datetime import datetime, timezone

import requests

dex_queue: queue.Queue = queue.Queue()

_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "BotGrid/1.0", "Accept": "application/json"})

POLL_INTERVAL   = 90         # 90 сек між перевірками
MIN_LIQUIDITY   = 200_000    # $200k — відсіює rug pull пули
MAX_VOL_24H     = 100_000_000  # $100M — якщо більше, вже мейнстрім і CEX не здивує
VOL_SPIKE_RATIO = 5.0        # h1 в 5x+ від середнього h6/6
SEEN_TTL_SEC    = 7200       # не дублюємо той самий токен протягом 2 годин

_seen: dict[str, float] = {}  # symbol → timestamp останнього сигналу


def _fetch_trending() -> list[dict]:
    try:
        r = _SESSION.get(
            "https://api.geckoterminal.com/api/v2/networks/trending_pools",
            params={"include": "base_token", "page": 1},
            timeout=15,
        )
        if r.status_code != 200:
            return []
        data    = r.json()
        pools    = data.get("data", [])
        included = {item["id"]: item for item in data.get("included", [])}
        results  = []

        for pool in pools:
            attrs    = pool.get("attributes", {})
            rels     = pool.get("relationships", {})
            token_id = rels.get("base_token", {}).get("data", {}).get("id", "")
            t_attrs  = included.get(token_id, {}).get("attributes", {})
            symbol   = t_attrs.get("symbol", "").upper().strip()

            if not symbol or len(symbol) > 10:
                continue

            vol     = attrs.get("volume_usd", {})
            vol_1h  = float(vol.get("h1",  0) or 0)
            vol_6h  = float(vol.get("h6",  0) or 0)
            vol_24h = float(vol.get("h24", 0) or 0)
            liq     = float(attrs.get("reserve_in_usd", 0) or 0)
            pc      = attrs.get("price_change_percentage", {})
            pc_1h   = float(pc.get("h1",  0) or 0)
            pc_24h  = float(pc.get("h24", 0) or 0)

            avg_hourly = vol_6h / 6 if vol_6h > 0 else 0
            ratio      = round(vol_1h / avg_hourly, 1) if avg_hourly > 0 else 0

            dex_id = rels.get("dex", {}).get("data", {}).get("id", "unknown")

            results.append({
                "symbol":          symbol,
                "vol_1h":          vol_1h,
                "vol_6h":          vol_6h,
                "vol_24h":         vol_24h,
                "liquidity":       liq,
                "vol_spike_ratio": ratio,
                "price_change_1h": pc_1h,
                "price_change_24h": pc_24h,
                "pool_id":         pool.get("id", ""),
                "dex_name":        dex_id,
            })
        return results

    except Exception as e:
        print(f"[DEX] fetch error: {e}")
        return []


def _scan_loop():
    print("[DEX] 🔍 DEX Volume Scanner запущен (GeckoTerminal, інтервал 90 сек)")
    while True:
        try:
            now_ts  = time.time()
            now_utc = datetime.now(timezone.utc)

            # Чистимо старі записи дедуплікатора
            expired = [s for s, ts in _seen.items() if now_ts - ts > SEEN_TTL_SEC]
            for s in expired:
                del _seen[s]

            pools = _fetch_trending()
            for p in pools:
                sym = p["symbol"]

                if p["liquidity"]       < MIN_LIQUIDITY:   continue
                if p["vol_24h"]         > MAX_VOL_24H:     continue
                if p["vol_spike_ratio"] < VOL_SPIKE_RATIO: continue
                if sym in _seen:                           continue

                _seen[sym] = now_ts

                item = {
                    "title": (
                        f"{sym} DEX volume spike {p['vol_spike_ratio']}x "
                        f"(${p['vol_1h']/1e3:.0f}k last 1h, "
                        f"{p['price_change_1h']:+.1f}% price)"
                    ),
                    "description": (
                        f"{sym} shows {p['vol_spike_ratio']}x unusual DEX volume vs 6h avg. "
                        f"24h vol: ${p['vol_24h']/1e6:.2f}M. "
                        f"Liquidity: ${p['liquidity']/1e3:.0f}k. "
                        f"24h price: {p['price_change_24h']:+.1f}%. "
                        f"Possible whale accumulation or upcoming CEX listing."
                    ),
                    "link":         f"dex://{p['pool_id']}",
                    "published":    now_utc.strftime("%a, %d %b %Y %H:%M:%S +0000"),
                    "published_dt": now_utc.isoformat(),
                    "source":       f"DEX Scanner ({p['dex_name']})",
                    "source_weight": 0.85,
                    "is_panic":     False,
                    "is_dex_spike": True,
                    "dex_data":     p,
                }
                dex_queue.put_nowait(item)
                print(
                    f"[DEX] 🔥 {sym} spike {p['vol_spike_ratio']}x | "
                    f"${p['vol_1h']/1e3:.0f}k/h | liq ${p['liquidity']/1e3:.0f}k"
                )

        except Exception as e:
            print(f"[DEX] scan error: {e}")

        time.sleep(POLL_INTERVAL)


def start_dex_scanner() -> threading.Thread:
    t = threading.Thread(target=_scan_loop, daemon=True, name="dex-scanner")
    t.start()
    return t
