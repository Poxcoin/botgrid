import json
import requests
from groq import Groq
from config.settings import GROQ_API_KEY, GEMINI_API_KEY

client = Groq(api_key=GROQ_API_KEY)

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

# Once Groq daily quota is exhausted, switch all calls to Gemini for this session
_groq_exhausted = False

_GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent"


def _parse_result(text: str) -> dict:
    start = text.find("{")
    if start == -1:
        raise ValueError(f"JSON не найден: {text[:100]}")
    data, _ = json.JSONDecoder().raw_decode(text[start:])
    return {
        "score":      int(data.get("score",      0)),
        "coin":       str(data.get("coin",      "BTC")).upper(),
        "confidence": int(data.get("confidence", 5)),
    }


def _analyze_gemini(news_title: str, news_description: str = "") -> dict:
    if not GEMINI_API_KEY:
        return {"score": 0, "coin": "BTC", "confidence": 0}

    user_content = f"News Title: '{news_title}'"
    if news_description:
        user_content += f"\nContext: '{news_description[:280].strip()}'"

    prompt = f"{_SYSTEM_PROMPT}\n\n{user_content}"
    resp = requests.post(
        f"{_GEMINI_URL}?key={GEMINI_API_KEY}",
        json={"contents": [{"parts": [{"text": prompt}]}],
              "generationConfig": {"temperature": 0.0, "maxOutputTokens": 80}},
        timeout=12,
    )
    resp.raise_for_status()
    text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    return _parse_result(text)


def analyze_sentiment(news_title: str, news_description: str = "") -> dict:
    global _groq_exhausted

    user_content = f"News Title: '{news_title}'"
    if news_description:
        user_content += f"\nContext: '{news_description[:280].strip()}'"

    if not _groq_exhausted:
        try:
            response = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": _SYSTEM_PROMPT},
                    {"role": "user",   "content": user_content},
                ],
                max_tokens=80,
                temperature=0.0,
            )
            return _parse_result(response.choices[0].message.content.strip())

        except Exception as e:
            err_str = str(e)
            if "rate_limit_exceeded" in err_str or "429" in err_str:
                print("[ai_analyzer] Groq лимит исчерпан → переключаюсь на Gemini")
                _groq_exhausted = True
            else:
                print(f"[ai_analyzer] Ошибка Groq: {e}")
                return {"score": 0, "coin": "BTC", "confidence": 0}

    # Gemini fallback
    try:
        return _analyze_gemini(news_title, news_description)
    except Exception as e:
        print(f"[ai_analyzer] Ошибка Gemini: {e}")
        return {"score": 0, "coin": "BTC", "confidence": 0}


if __name__ == "__main__":
    tests = [
        {"title": "Binance announces official listing of FET token with zero fees",
         "desc": "Binance will list Fetch.ai (FET) on the spot market starting Monday."},
        {"title": "Bybit exchange hacked — $200M stolen in smart contract exploit",
         "desc": "Hackers drained $200M from Bybit's ETH hot wallet."},
        {"title": "Local football team wins regional championship", "desc": ""},
    ]
    for t in tests:
        r = analyze_sentiment(t["title"], t["desc"])
        print(f"{t['title'][:60]}\n  → score={r['score']}  coin={r['coin']}  confidence={r['confidence']}\n")
