import anthropic
import json
from config.settings import CLAUDE_API_KEY

# Инициализируем клиента
client = anthropic.Anthropic(api_key=CLAUDE_API_KEY)

# Системный промпт кешируется через cache_control.
# Экономия ~90% стоимости входных токенов: промпт читается из кеша (~5 мин TTL).
_SYSTEM_PROMPT = """You are a professional crypto quant trading AI algorithm.

Your job: analyze the sentiment, potential price impact, and your own confidence in that analysis for crypto news.

=== SCORING RULES (score: -10 to +10) ===
+10 = Maximum pump fuel (Coinbase/Binance listing, major partnership like Google/Apple/MSFT, secures huge funding round $50M+)
+7  = Strong positive (exchange listing tier-2, noteworthy partnership, mainnet launch, major upgrade)
+4  = Moderate positive (smaller funding, ecosystem grant, protocol upgrade)
 0  = Neutral / irrelevant / already priced in
-4  = Moderate negative (security concern, minor exploit, regulatory warning)
-7  = Strong negative (exploit/hack, SEC action, leadership scandal)
-10 = Maximum dump fuel (exchange hack >$50M, bankruptcy, USDT/USDC depeg, delisting from major exchange)

=== CONFIDENCE RULES (confidence: 0-10) ===
10 = Certainty: direct on-chain event, official exchange announcement, verifiable hack
8  = High: reputable source (CoinDesk, TheBlock), concrete facts, named amounts/dates
6  = Medium: credible source, reasonable inference, unnamed sources citing real events
4  = Low: rumors, unconfirmed, speculative language ("could", "might", "sources say")
2  = Very low: clickbait, vague, second-hand rumor
0  = No evidence / completely irrelevant

=== CRITICAL RULES ===
- If news is NOT about cryptocurrency, blockchain, DeFi, NFTs, or global macroeconomics (Fed, wars, inflation), return score 0, confidence 0.
- For animal stories, sports, celebrities (unless crypto-related), or culture: ALWAYS return score 0, confidence 0.
- Identify the EXACT ticker symbol (e.g. SUI, SOL, FET, AAVE, ARB, OP). For general market news use "BTC".
- If multiple coins are affected equally, use the most impacted one.

Respond ONLY with a JSON object, no other text:
{"score": 8, "coin": "TICKER", "confidence": 7}"""


def analyze_sentiment(news_title: str, news_description: str = "") -> dict:
    """
    Оценивает новость на потенциальное влияние для цены альткоина.
    Возвращает score (-10..+10), coin (тикер), confidence (0..10).
    Системный промпт кешируется — экономия токенов при каждом вызове.

    Args:
        news_title: Заголовок новости
        news_description: Краткое описание/summary статьи (до 300 символов)
    """
    # Формируем пользовательское сообщение
    user_content = f"News Title: '{news_title}'"
    if news_description:
        # Обрезаем описание, чтобы не тратить лишние токены
        desc = news_description[:280].strip()
        user_content += f"\nContext: '{desc}'"

    try:
        response = client.messages.create(
            model="claude-3-5-haiku-20241022",
            max_tokens=80,
            temperature=0.0,
            timeout=30.0,
            system=[
                {
                    "type": "text",
                    "text": _SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }
            ],
            messages=[{"role": "user", "content": user_content}],
        )

        result_text = response.content[0].text.strip()

        # Находим первый JSON-объект
        start = result_text.find("{")
        if start == -1:
            raise ValueError(f"JSON не найден в ответе: {result_text[:100]}")

        decoder = json.JSONDecoder()
        data, _ = decoder.raw_decode(result_text[start:])

        return {
            "score": int(data.get("score", 0)),
            "coin": str(data.get("coin", "BTC")).upper(),
            "confidence": int(data.get("confidence", 5)),  # 0-10, дефолт средний
        }

    except Exception as e:
        print(f"[ai_analyzer] Ошибка ИИ: {str(e)}")
        # Если ИИ сломался — не торгуем
        return {"score": 0, "coin": "BTC", "confidence": 0}


if __name__ == "__main__":
    tests = [
        {
            "title": "Binance announces official listing of FET token with zero fees",
            "desc": "Binance will list Fetch.ai (FET) on the spot market starting Monday. Trading pairs: FET/USDT, FET/BTC.",
        },
        {
            "title": "Bybit exchange hacked — $200M stolen in smart contract exploit",
            "desc": "Hackers drained $200M from Bybit's ETH hot wallet via a reentrancy attack. Withdrawals suspended.",
        },
        {
            "title": "Local football team wins regional championship",
            "desc": "",
        },
    ]

    for t in tests:
        result = analyze_sentiment(t["title"], t["desc"])
        print(f"Title: {t['title']}")
        print(f"  → score={result['score']}  coin={result['coin']}  confidence={result['confidence']}\n")
