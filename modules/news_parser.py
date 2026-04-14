import re
import feedparser
from concurrent.futures import ThreadPoolExecutor

# Добавили RSS-ленту мировых новостей (BBC World) для отслеживания геополитики
RSS_FEEDS = [
    "https://cointelegraph.com/rss",
    "https://cryptoslate.com/feed/",
    "https://www.newsbtc.com/feed/",
    "https://feeds.bbci.co.uk/news/world/rss.xml" # Мировые новости для поиска паники
]

def check_panic_news(title):
    """
    Анти-фильтр: ищет слова-триггеры начала войны, обвала рынков или краха банков.
    """
    title_lower = title.lower()
    panic_keywords = ["war", "strike", "attack", "missile", "crash", "bankrupt", "emergency", "invasion"]

    for word in panic_keywords:
        if word in title_lower:
            return True
    return False

def is_altcoin_news(title):
    """
    Фильтр волатильности: ищем триггеры для альткоинов.
    """
    title_lower = title.lower()
    hot_keywords = ["airdrop", "hack", "partner", "listing", "launch", "mainnet", "secures", "raises"]
    # Используем точное совпадение слов (word boundary) чтобы "sec" не матчился в "second", "consecutive" и тп
    boring_keywords = ["bitcoin", "ethereum", "mining", "taxes", "regulation", r"\bsec\b", r"\betf\b", "president"]

    for word in hot_keywords:
        if word in title_lower:
            return True

    for pattern in boring_keywords:
        if re.search(pattern, title_lower):
            return False

    return True

def fetch_feed(url):
    try:
        return feedparser.parse(url)
    except Exception as e:
        print(f"Ошибка при чтении {url}: {e}")
        return None

def get_aggregated_news(limit_per_source=10):
    all_news = []
    
    with ThreadPoolExecutor(max_workers=len(RSS_FEEDS)) as executor:
        results = executor.map(fetch_feed, RSS_FEEDS)
    
    for feed in results:
        if feed and feed.entries:
            for entry in feed.entries[:limit_per_source]:
                
                # 1. Проверяем на мировую панику (Наивысший приоритет)
                is_panic = check_panic_news(entry.title)
                
                # 2. Если это не паника, проверяем, интересна ли новость для альткоинов
                if not is_panic and not is_altcoin_news(entry.title):
                    continue # Скучная новость, пропускаем
                    
                news_item = {
                    "title": entry.title,
                    "link": entry.link,
                    "published": entry.get("published", ""),
                    "source": feed.feed.get("title", "Unknown"),
                    "is_panic": is_panic # Сигнал для математики (True означает ТОТАЛЬНЫЙ SELL)
                }
                all_news.append(news_item)
                
    return all_news

if __name__ == "__main__":
    import time
    start_time = time.time()
    
    print("Собираем новости (Крипта + Геополитика)...")
    news = get_aggregated_news()
    
    print(f"Заняло: {time.time() - start_time:.2f} сек.\n")
    for n in news[:10]:
        if n["is_panic"]:
            print(f"🚨 [ГЛОБАЛЬНАЯ ПАНИКА] {n['title']} ({n['source']})")
        else:
            print(f"🟢 [Альт-сигнал] {n['title']} ({n['source']})")