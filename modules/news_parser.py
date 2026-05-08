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
    # ── ГЕОПОЛИТИКА & МИРОВЫЕ НОВОСТИ — market_filter=True: убираем спорт/шоу ──
    {"url": "https://feeds.bbci.co.uk/news/world/rss.xml",
     "weight": 1.0,  "crypto_only": False, "market_filter": True, "cat": "GEOPOLITICS"},
    {"url": "https://feeds.reuters.com/reuters/worldNews",
     "weight": 1.0,  "crypto_only": False, "market_filter": True, "cat": "GEOPOLITICS"},
    {"url": "https://www.aljazeera.com/xml/rss/all.xml",
     "weight": 0.85, "crypto_only": False, "market_filter": True, "cat": "GEOPOLITICS"},

    # ── МАКРО & ЭКОНОМИКА (тематические фиды — фильтр не нужен) ────────────
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
     "weight": 1.0,  "crypto_only": False, "market_filter": True, "cat": "MARKETS"},
    {"url": "https://finance.yahoo.com/news/rssindex",
     "weight": 0.85, "crypto_only": False, "market_filter": True, "cat": "MARKETS"},
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

_MAX_AGE_HOURS = 8
_DUPLICATE_THRESHOLD = 0.60


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


# Темы, которые никогда не попадут в ленту (спорт, шоу-бизнес, быт)
_JUNK_TOPICS: frozenset[str] = frozenset({
    # Спорт — виды
    "football", "soccer", "basketball", "tennis", "baseball", "hockey", "rugby",
    "cricket", "golf", "world cup", "premier league", "nfl", "nba", "nhl", "mlb",
    "champions league", "serie a", "bundesliga", "la liga", "ligue 1", "el clasico",
    "formula 1", " f1 ", "motogp", "cycling race", "marathon", "athletics",
    "olympic games", "paralympic", "world athletics", "super bowl", "wimbledon",
    # Футбольные клубы и игроки
    "real madrid", "barcelona", "atletico madrid", "manchester", "liverpool",
    "arsenal ", "chelsea ", "juventus", "ac milan", "inter milan", "ajax",
    "psg", "paris saint-germain", "bayern munich", "dortmund",
    "mbappe", "mbapp", "messi", "ronaldo", "neymar", "haaland", "valverde",
    "tchouameni", "vinicius", "bellingham", "salah", "lewandowski",
    # Другой спорт — команды/имена
    "lakers", "celtics", "warriors", "knicks",
    "formula e", "tour de france",
    # Шоу-бизнес
    "oscar", "grammy", "emmy", "golden globe", "bafta",
    "music video", "album release", "tour dates", "singer", "rapper",
    "movie premiere", "film review", "box office", "streaming series",
    "reality tv", "celebrity", "actor ", "actress ",
    # Быт
    "recipe", "cooking", "fashion week", "beauty tips", "diet plan",
    "horoscope", "astrology",
})

# Ключевые слова рыночной релевантности для широких новостных фидов
_MARKET_TERMS: frozenset[str] = frozenset({
    "economy", "economic", "gdp", "inflation", "interest rate", "rate hike", "rate cut",
    "federal reserve", "fed ", "central bank", "ecb", "bank of england", "boe",
    "recession", "stagflation", "debt", "deficit", "budget",
    "market", "stock", "equity", "bond", "yield", "dollar", "currency", "forex",
    "oil", "gold", "silver", "commodity", "commodities", "crude", "brent", "lng",
    "tariff", "sanctions", "embargo", "trade war", "trade deal", "export", "import",
    "unemployment", "jobs report", "payrolls", "cpi", "ppi", "pce",
    "war", "invasion", "nuclear", "military strike", "conflict", "geopolit",
    "opec", "energy crisis", "supply chain",
    "imf", "world bank", "g7", "g20", "treasury",
    "crypto", "bitcoin", "ethereum", "blockchain", "defi",
    "bank run", "banking crisis", "financial crisis", "liquidity",
})


def _is_market_relevant(title: str) -> bool:
    """Для широких фидов (BBC World, Reuters Top): пропускать только рыночные темы."""
    tl = title.lower()
    if any(j in tl for j in _JUNK_TOPICS):
        return False
    return any(m in tl for m in _MARKET_TERMS)


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


_BAD_IMAGE_PATTERNS = (
    "pixel", "tracking", "1x1", "icon", "logo", "avatar",
    "placeholder", "default", "blank", "spacer", "transparent",
    "ads", "doubleclick", "analytics", "beacon",
)
_IMAGE_EXTS = (".jpg", ".jpeg", ".png", ".webp", ".gif")


def _is_good_image(url: str) -> bool:
    if not url or not url.startswith("http"):
        return False
    ul = url.lower()
    if any(b in ul for b in _BAD_IMAGE_PATTERNS):
        return False
    # Must look like a real image (has extension or known image CDN path)
    has_ext = any(ext in ul for ext in _IMAGE_EXTS)
    is_cdn = any(x in ul for x in ("images.", "img.", "media.", "cdn.", "photo", "thumb", "asset"))
    return has_ext or is_cdn


def _extract_image(entry) -> str | None:
    """Extract best-quality image URL from RSS entry."""
    # 1) media:content — prefer largest by width attribute
    media = getattr(entry, "media_content", None)
    if media and isinstance(media, list):
        candidates = [(int(m.get("width", 0) or 0), m.get("url", "")) for m in media]
        candidates.sort(reverse=True)
        for _, u in candidates:
            if _is_good_image(u):
                return u
    # 2) media:thumbnail
    thumb = getattr(entry, "media_thumbnail", None)
    if thumb and isinstance(thumb, list):
        for t in thumb:
            u = t.get("url", "")
            if _is_good_image(u):
                return u
    # 3) enclosure
    for enc in getattr(entry, "enclosures", []):
        if enc.get("type", "").startswith("image"):
            u = enc.get("href") or enc.get("url") or ""
            if _is_good_image(u):
                return u
    # 4) img tag in summary HTML — skip tiny tracker images
    summary = getattr(entry, "summary", "") or ""
    for m in re.finditer(r'<img[^>]+src=["\']([^"\']+)["\']', summary):
        u = m.group(1)
        if _is_good_image(u):
            return u
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

        url           = source["url"]
        weight        = source["weight"]
        crypto_only   = source.get("crypto_only", True)
        market_filter = source.get("market_filter", False)

        for entry in feed.entries[:limit_per_source]:
            if not _is_fresh(entry):
                continue
            title = getattr(entry, "title", "").strip()
            if not title:
                continue

            is_panic = check_panic_news(title, source_url=url)

            if crypto_only and not is_panic and not is_altcoin_news(title):
                continue
            if market_filter and not is_panic and not _is_market_relevant(title):
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
                "category":     source.get("cat", "OTHER"),
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
