import re
import time
import feedparser
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from difflib import SequenceMatcher

# ---------------------------------------------------------------------------
# RSS источники
# "crypto_only": True  → фильтруем, пропускаем только крипто-статьи
# "crypto_only": False → пропускаем ВСЕ статьи (макро, гео, commodities)
# ---------------------------------------------------------------------------
RSS_SOURCES = [
    # ── ГЕОПОЛИТИКА & МИРОВЫЕ НОВОСТИ ──────────────────────────────────────
    {"url": "https://feeds.bbci.co.uk/news/world/rss.xml",
     "weight": 1.0,  "crypto_only": False, "cat": "GEOPOLITICS"},
    {"url": "https://feeds.reuters.com/reuters/worldNews",
     "weight": 1.0,  "crypto_only": False, "cat": "GEOPOLITICS"},
    {"url": "https://www.aljazeera.com/xml/rss/all.xml",
     "weight": 0.85, "crypto_only": False, "cat": "GEOPOLITICS"},

    # ── МАКРО & ЭКОНОМИКА ───────────────────────────────────────────────────
    {"url": "https://feeds.reuters.com/reuters/businessNews",
     "weight": 1.0,  "crypto_only": False, "cat": "MACRO"},
    {"url": "https://feeds.reuters.com/reuters/financialsNews",
     "weight": 1.0,  "crypto_only": False, "cat": "MACRO"},
    {"url": "https://feeds.reuters.com/reuters/economicsNews",
     "weight": 1.0,  "crypto_only": False, "cat": "MACRO"},
    {"url": "https://www.federalreserve.gov/feeds/press_all.xml",
     "weight": 1.0,  "crypto_only": False, "cat": "MACRO"},
    {"url": "https://dlnews.com/arc/outboundfeeds/rss/",
     "weight": 0.95, "crypto_only": False, "cat": "MACRO"},

    # ── COMMODITIES ─────────────────────────────────────────────────────────
    {"url": "https://feeds.reuters.com/reuters/globalcoverage/commodities",
     "weight": 1.0,  "crypto_only": False, "cat": "COMMODITIES"},
    {"url": "https://oilprice.com/rss/main",
     "weight": 0.85, "crypto_only": False, "cat": "COMMODITIES"},
    {"url": "https://www.mining.com/feed/",
     "weight": 0.80, "crypto_only": False, "cat": "COMMODITIES"},

    # ── FINANCIAL MARKETS ───────────────────────────────────────────────────
    {"url": "https://feeds.reuters.com/reuters/topNews",
     "weight": 1.0,  "crypto_only": False, "cat": "MARKETS"},
    {"url": "https://finance.yahoo.com/news/rssindex",
     "weight": 0.85, "crypto_only": False, "cat": "MARKETS"},
    {"url": "https://feeds.marketwatch.com/marketwatch/topstories/",
     "weight": 0.85, "crypto_only": False, "cat": "MARKETS"},

    # ── CRYPTO — главные медиа ──────────────────────────────────────────────
    {"url": "https://www.coindesk.com/arc/outboundfeeds/rss/",
     "weight": 1.0,  "crypto_only": True,  "cat": "CRYPTO"},
    {"url": "https://www.coindesk.com/arc/outboundfeeds/rss/?category=markets",
     "weight": 0.95, "crypto_only": True,  "cat": "CRYPTO"},
    {"url": "https://theblock.co/rss.xml",
     "weight": 1.0,  "crypto_only": True,  "cat": "CRYPTO"},
    {"url": "https://cointelegraph.com/rss",
     "weight": 0.95, "crypto_only": True,  "cat": "CRYPTO"},
    {"url": "https://decrypt.co/feed",
     "weight": 0.90, "crypto_only": True,  "cat": "CRYPTO"},
    {"url": "https://cryptoslate.com/feed/",
     "weight": 0.85, "crypto_only": True,  "cat": "CRYPTO"},
    {"url": "https://beincrypto.com/feed/",
     "weight": 0.85, "crypto_only": True,  "cat": "CRYPTO"},
    {"url": "https://blockworks.co/feed",
     "weight": 0.90, "crypto_only": True,  "cat": "CRYPTO"},
    {"url": "https://www.thedefiant.io/feed",
     "weight": 0.85, "crypto_only": True,  "cat": "CRYPTO"},

    # ── LISTINGS / ANNOUNCEMENTS ────────────────────────────────────────────
    {"url": "https://www.binance.com/en/rss/announcement",
     "weight": 1.0,  "crypto_only": True,  "cat": "LISTINGS"},
    {"url": "https://blog.bybit.com/en-US/rss/",
     "weight": 1.0,  "crypto_only": True,  "cat": "LISTINGS"},
]

RSS_FEEDS = [s["url"] for s in RSS_SOURCES]
_SOURCE_WEIGHT: dict[str, float] = {s["url"]: s["weight"] for s in RSS_SOURCES}

_MAX_AGE_HOURS = 12   # расширяем окно до 12ч — больше контента в каждой категории
_DUPLICATE_THRESHOLD = 0.72


def _parse_published(entry) -> datetime | None:
    for attr in ("published_parsed", "updated_parsed"):
        t = getattr(entry, attr, None)
        if t:
            try:
                return datetime(*t[:6], tzinfo=timezone.utc)
            except Exception:
                pass
    return None


def _is_fresh(entry) -> bool:
    pub = _parse_published(entry)
    if pub is None:
        return False
    return (datetime.now(timezone.utc) - pub) <= timedelta(hours=_MAX_AGE_HOURS)


def _similar(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _deduplicate(news_list: list[dict]) -> list[dict]:
    unique: list[dict] = []
    for candidate in news_list:
        is_dup = False
        for kept in unique:
            if _similar(candidate["title"], kept["title"]) >= _DUPLICATE_THRESHOLD:
                if candidate["source_weight"] > kept["source_weight"]:
                    unique.remove(kept)
                    unique.append(candidate)
                is_dup = True
                break
        if not is_dup:
            unique.append(candidate)
    return unique


def check_panic_news(title: str, source_url: str = "") -> bool:
    title_lower = title.lower()
    is_world_news = any(x in source_url.lower() for x in ("bbc", "reuters", "aljazeera"))
    if is_world_news:
        world_crisis = [
            "war declared", "invasion", "nuclear", "warhead",
            "world war", "missile strike", "troops cross",
            "martial law", "global recession", "market crash",
        ]
        for phrase in world_crisis:
            if phrase in title_lower:
                return True
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


_CRYPTO_TERMS: frozenset[str] = frozenset({
    "crypto", "cryptocurrency", "blockchain", "defi", "nft", "token", "coin",
    "web3", "dex", "cefi", "altcoin", "protocol", "smart contract", "wallet",
    "staking", "yield", "airdrop", "mainnet", "testnet", "layer", "l2",
    "bridge", "liquidity", "tvl", "dao", "dapp", "mint", "burn", "swap",
    "perpetual", "futures", "bybit", "binance", "coinbase", "kraken", "okx",
    "stablecoin", "usdt", "usdc", "depeg",
    "btc", "bitcoin", "eth", "ethereum", "sol", "solana", "bnb", "xrp", "ripple",
    "ada", "cardano", "dot", "polkadot", "link", "chainlink", "uni", "uniswap",
    "aave", "sui", "apt", "aptos", "op", "optimism", "near", "inj", "injective",
    "fet", "fetch", "arb", "arbitrum", "matic", "polygon", "avax", "avalanche",
    "atom", "cosmos", "trx", "tron", "ltc", "litecoin", "doge", "dogecoin",
    "shib", "pepe", "ton", "toncoin", "starknet", "base",
})


def is_altcoin_news(title: str) -> bool:
    title_lower = title.lower()
    if not any(term in title_lower for term in _CRYPTO_TERMS):
        return False
    boring_keywords = ["mining", "taxes"]
    for pattern in boring_keywords:
        if re.search(pattern, title_lower):
            return False
    return True


def _get_description(entry) -> str:
    for attr in ("summary", "description", "content"):
        val = getattr(entry, attr, None)
        if isinstance(val, list) and val:
            val = val[0].get("value", "")
        if val:
            clean = re.sub(r"<[^>]+>", "", str(val)).strip()
            return clean[:300]
    return ""


def _extract_image(entry) -> str | None:
    """Extract image URL directly from RSS entry fields."""
    # 1) media:content
    media = getattr(entry, "media_content", None)
    if media and isinstance(media, list):
        for m in media:
            u = m.get("url", "")
            if u.startswith("http") and any(ext in u.lower() for ext in (".jpg", ".jpeg", ".png", ".webp")):
                return u
    # 2) media:thumbnail
    thumb = getattr(entry, "media_thumbnail", None)
    if thumb and isinstance(thumb, list) and thumb[0].get("url"):
        return thumb[0]["url"]
    # 3) enclosure
    for enc in getattr(entry, "enclosures", []):
        if enc.get("type", "").startswith("image"):
            return enc.get("href") or enc.get("url")
    # 4) img tag in summary HTML
    summary = getattr(entry, "summary", "") or ""
    m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', summary)
    if m and m.group(1).startswith("http"):
        return m.group(1)
    return None


def fetch_feed(source: dict) -> tuple[dict, object]:
    try:
        feed = feedparser.parse(source["url"])
        return source, feed
    except Exception as e:
        print(f"[news_parser] error {source['url']}: {e}")
        return source, None


def get_aggregated_news(limit_per_source: int = 15) -> list[dict]:
    all_news: list[dict] = []

    with ThreadPoolExecutor(max_workers=min(len(RSS_SOURCES), 16)) as executor:
        results = list(executor.map(fetch_feed, RSS_SOURCES))

    for source, feed in results:
        if not feed or not feed.entries:
            continue

        url          = source["url"]
        weight       = source["weight"]
        crypto_only  = source.get("crypto_only", True)

        for entry in feed.entries[:limit_per_source]:
            if not _is_fresh(entry):
                continue
            title = getattr(entry, "title", "").strip()
            if not title:
                continue

            is_panic = check_panic_news(title, source_url=url)

            # For crypto-only sources: filter non-crypto articles
            # For broad sources (macro/geo/commodities): let everything through
            if crypto_only and not is_panic and not is_altcoin_news(title):
                continue

            pub = _parse_published(entry)
            image_url = _extract_image(entry)

            news_item = {
                "title":        title,
                "description":  _get_description(entry),
                "link":         getattr(entry, "link", ""),
                "published":    getattr(entry, "published", ""),
                "published_dt": pub.isoformat() if pub else "",
                "source":       feed.feed.get("title", "Unknown"),
                "source_url":   url,
                "source_weight": weight,
                "is_panic":     is_panic,
                "image_url":    image_url,
            }
            all_news.append(news_item)

    all_news = _deduplicate(all_news)
    all_news.sort(
        key=lambda x: (not x["is_panic"], x.get("published_dt", "") or ""),
        reverse=True,
    )
    return all_news


if __name__ == "__main__":
    start = time.time()
    print("Собираем новости (все категории)...")
    news = get_aggregated_news()
    print(f"Время: {time.time() - start:.2f}s | Статей: {len(news)}\n")
    for n in news[:20]:
        tag = "🚨" if n["is_panic"] else "✅"
        img = "🖼" if n.get("image_url") else "  "
        print(f"{tag}{img} [{n['source_url'].split('/')[2][:20]:20}] {n['title'][:80]}")
