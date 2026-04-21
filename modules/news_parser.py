import re
import time
import feedparser
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from difflib import SequenceMatcher

# ---------------------------------------------------------------------------
# RSS источники с весами надёжности (source_weight: 1.0 = эталон)
# Вес влияет на итоговый confidence signal в decision_maker.
# ---------------------------------------------------------------------------
RSS_SOURCES = [
    # --- Макро / Геополітика (планові події — лаг не критичний) ---
    {"url": "https://feeds.bbci.co.uk/news/world/rss.xml",            "weight": 1.0},   # BBC World
    {"url": "https://feeds.reuters.com/reuters/businessNews",          "weight": 1.0},   # Reuters Business

    # --- Регуляторика (SEC/CFTC/ФРС — важливо для крипти) ---
    {"url": "https://www.federalreserve.gov/feeds/press_all.xml",      "weight": 1.0},   # ФРС прес-релізи
    {"url": "https://dlnews.com/arc/outboundfeeds/rss/",               "weight": 0.95},  # DL News — SEC/CFTC/DeFi

    # --- Криптомедіа (залишаємо тільки топ-2 — решту замінив Telegram) ---
    {"url": "https://www.coindesk.com/arc/outboundfeeds/rss/",        "weight": 1.0},
    {"url": "https://theblock.co/rss.xml",                             "weight": 1.0},
]

# Для обратной совместимости с кодом, который импортирует RSS_FEEDS
RSS_FEEDS = [s["url"] for s in RSS_SOURCES]

# Словарь url -> вес (быстрый доступ)
_SOURCE_WEIGHT: dict[str, float] = {s["url"]: s["weight"] for s in RSS_SOURCES}

# Максимальный возраст новости, которую считаем свежей
_MAX_AGE_HOURS = 6

# Порог сходства заголовков для дедупликации (0.0–1.0)
_DUPLICATE_THRESHOLD = 0.72


def _parse_published(entry) -> datetime | None:
    """Возвращает aware-datetime публикации записи или None."""
    # feedparser кладёт parsed-время в published_parsed / updated_parsed
    for attr in ("published_parsed", "updated_parsed"):
        t = getattr(entry, attr, None)
        if t:
            try:
                return datetime(*t[:6], tzinfo=timezone.utc)
            except Exception:
                pass
    return None


def _is_fresh(entry) -> bool:
    """True, если новость не старше _MAX_AGE_HOURS. Без даты — блокируем."""
    pub = _parse_published(entry)
    if pub is None:
        return False  # нет даты — невозможно оценить свежесть, пропускаем
    age = datetime.now(timezone.utc) - pub
    return age <= timedelta(hours=_MAX_AGE_HOURS)


def _similar(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _deduplicate(news_list: list[dict]) -> list[dict]:
    """
    Убирает дубликаты по заголовку.
    Если два заголовка похожи на >= _DUPLICATE_THRESHOLD — оставляем
    тот, у которого source_weight выше.
    """
    unique: list[dict] = []
    for candidate in news_list:
        is_dup = False
        for kept in unique:
            if _similar(candidate["title"], kept["title"]) >= _DUPLICATE_THRESHOLD:
                # Оставляем источник с большим весом
                if candidate["source_weight"] > kept["source_weight"]:
                    unique.remove(kept)
                    unique.append(candidate)
                is_dup = True
                break
        if not is_dup:
            unique.append(candidate)
    return unique


def check_panic_news(title: str, source_url: str = "") -> bool:
    """
    Анти-фильтр: реагирует ТОЛЬКО на реальные макро-кризисы.

    - BBC / Reuters: война, вторжение, ядерная угроза
    - Любой источник: катастрофические крипто-события (взлом биржи, банкротство)

    НЕ реагирует на: "BTC crashes 5%", "Altcoin hits new low" — обычная волатильность.
    """
    title_lower = title.lower()

    # Глобальные макро-кризисы — только из мировых новостей
    is_world_news = any(x in source_url.lower() for x in ("bbc", "reuters"))
    if is_world_news:
        world_crisis = [
            "war declared", "invasion", "nuclear", "warhead",
            "world war", "missile strike", "troops cross",
            "martial law", "global recession", "market crash",
        ]
        for phrase in world_crisis:
            if phrase in title_lower:
                return True

    # Катастрофы крипто-инфраструктуры — для любого источника
    infra_catastrophe = [
        "exchange hacked", "exchange bankrupt", "exchange collapse",
        "exchange shutdown", "billion stolen", "billion hack",
        "tether collapse", "usdt depeg", "usdc depeg",
        "stablecoin depeg", "ftx collapse", "binance hack",
    ]
    for phrase in infra_catastrophe:
        if phrase in title_lower:
            return True

    return False



# Известные тикеры и крипто-термины. Если ни одного нет в заголовке → новость
# не про крипту и не тратим Claude API токены.
_CRYPTO_TERMS: frozenset[str] = frozenset({
    # Общие крипто-термины
    "crypto", "cryptocurrency", "blockchain", "defi", "nft", "token", "coin",
    "web3", "dex", "cefi", "altcoin", "protocol", "smart contract", "wallet",
    "staking", "yield", "airdrop", "mainnet", "testnet", "layer", "l2",
    "bridge", "liquidity", "tvl", "dao", "dapp", "mint", "burn", "swap",
    "perpetual", "futures", "bybit", "binance", "coinbase", "kraken", "okx",
    "stablecoin", "usdt", "usdc", "depeg",
    # Тикеры / проекты
    "btc", "bitcoin", "eth", "ethereum", "sol", "solana", "bnb", "xrp", "ripple",
    "ada", "cardano", "dot", "polkadot", "link", "chainlink", "uni", "uniswap",
    "aave", "sui", "apt", "aptos", "op", "optimism", "near", "inj", "injective",
    "fet", "fetch", "arb", "arbitrum", "matic", "polygon", "avax", "avalanche",
    "atom", "cosmos", "trx", "tron", "ltc", "litecoin", "doge", "dogecoin",
    "shib", "pepe", "ton", "toncoin", "starknet", "base",
})


def is_altcoin_news(title: str) -> bool:
    """
    Двухэтапный фильтр:

    1. Крипто-гейт: если нет ни одного крипто-термина/тикера → False (без AI).
       Это блокирует "Google's Latest AI Update", "Fed raises rates", etc.

    2. Boring-keywords: регуляторика / макро вокруг BTC/ETH → False.

    3. Hot-keywords: конкретные события → True.

    4. Незнакомая крипто-тема → True (прошла гейт, пропускаем на AI).
    """
    title_lower = title.lower()

    # ── Шаг 1: крипто-гейт ───────────────────────────────────────────────────
    # Хотя бы одно крипто-слово должно присутствовать.
    if not any(term in title_lower for term in _CRYPTO_TERMS):
        return False

    hot_keywords = [
        "airdrop", "hack", "partner", "listing", "launch", "mainnet",
        "secures", "raises", "upgrade", "exploit", "vulnerability",
        "acquisition", "merger", "token burn", "buyback", "defi",
        "nft", "bridge", "layer 2", "l2", "staking", "yield",
        "grant", "investment", "fund", "integrate", "integration",
    ]

    boring_keywords = [
        "mining", "taxes",
    ]

    # ── Шаг 2: boring-keywords первыми ───────────────────────────────────────
    for pattern in boring_keywords:
        if re.search(pattern, title_lower):
            return False

    # ── Шаг 3: hot-keywords ──────────────────────────────────────────────────
    for word in hot_keywords:
        if word in title_lower:
            return True

    # ── Шаг 4: крипто-тема, но не boring и не hot → AI сам разберётся ────────
    return True


def _get_description(entry) -> str:
    """Извлекает краткое описание / summary из RSS-записи (до 300 символов)."""
    for attr in ("summary", "description", "content"):
        val = getattr(entry, attr, None)
        if isinstance(val, list) and val:
            val = val[0].get("value", "")
        if val:
            # Убираем HTML-теги простым regex
            clean = re.sub(r"<[^>]+>", "", str(val)).strip()
            return clean[:300]
    return ""


def fetch_feed(source: dict) -> tuple[dict, object]:
    url = source["url"]
    try:
        feed = feedparser.parse(url)
        return source, feed
    except Exception as e:
        print(f"[news_parser] Ошибка при чтении {url}: {e}")
        return source, None


def get_aggregated_news(limit_per_source: int = 10) -> list[dict]:
    all_news: list[dict] = []

    with ThreadPoolExecutor(max_workers=len(RSS_SOURCES)) as executor:
        results = list(executor.map(fetch_feed, RSS_SOURCES))

    for source, feed in results:
        if not feed or not feed.entries:
            continue

        url = source["url"]
        weight = source["weight"]

        for entry in feed.entries[:limit_per_source]:
            # Фильтр по свежести
            if not _is_fresh(entry):
                continue

            title = getattr(entry, "title", "").strip()
            if not title:
                continue

            is_panic = check_panic_news(title, source_url=url)

            if not is_panic and not is_altcoin_news(title):
                continue

            pub = _parse_published(entry)

            news_item = {
                "title": title,
                "description": _get_description(entry),
                "link": getattr(entry, "link", ""),
                "published": getattr(entry, "published", ""),
                "published_dt": pub.isoformat() if pub else "",
                "source": feed.feed.get("title", "Unknown"),
                "source_url": url,
                "source_weight": weight,
                "is_panic": is_panic,
            }
            all_news.append(news_item)

    # Дедупликация
    all_news = _deduplicate(all_news)

    # Сортируем: паника первой, затем по времени (свежее выше)
    all_news.sort(key=lambda x: (not x["is_panic"], x.get("published_dt", "") or ""), reverse=True)

    return all_news


if __name__ == "__main__":
    start_time = time.time()

    print("Собираем новости (Крипта + Геополитика, 14 источников)...")
    news = get_aggregated_news()

    print(f"Заняло: {time.time() - start_time:.2f} сек.  |  Уникальных новостей: {len(news)}\n")
    for n in news[:15]:
        tag = "🚨 [ПАНИКА]" if n["is_panic"] else "🟢 [Сигнал]"
        src = f"{n['source']} (w={n['source_weight']})"
        print(f"{tag} {n['title']}  |  {src}")
        if n.get("description"):
            print(f"   ↳ {n['description'][:120]}...")
