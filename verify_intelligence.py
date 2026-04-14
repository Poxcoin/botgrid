import json
from modules.ai_analyzer import analyze_sentiment
from modules.market_data import get_market_metrics
from modules.decision_maker import generate_signal

def test_intelligence():
    print("--- 1. Testing Relevance Filter ---")
    titles = [
        "Chimpanzees in Uganda locked in vicious 'civil war', say researchers",
        "Bitcoin price hits new all-time high as ETF inflows surge",
        "World Cup final ends in dramatic penalty shootout"
    ]
    
    for title in titles:
        result = analyze_sentiment(title)
        print(f"Title: {title[:40]}...")
        print(f"Result: {result}\n")

    print("--- 2. Testing RSI & Market Analysis ---")
    coins = ["BTC", "SOL", "ETH"]
    for coin in coins:
        metrics = get_market_metrics(coin)
        if metrics:
            print(f"Coin: {coin}")
            print(f"  Price: {metrics['current_price']}")
            print(f"  RSI:   {metrics['rsi']}")
            print(f"  Whale: {metrics['is_whale_active']}\n")

    print("--- 3. Testing Logic with Signals ---")
    news_item = {
        "title": "SUI Network announces billion dollar grant for developers",
        "source": "CryptoDaily",
        "is_panic": False
    }
    
    signal = generate_signal(news_item)
    print("Signal Output:")
    print(json.dumps(signal, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    test_intelligence()
