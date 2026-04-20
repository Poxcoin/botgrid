"""
gemini_filter.py — Первый слой AI пайплайна (Groq LLaMA-3.1, бесплатно).

Быстро фильтрует новости ДО Claude:
  - Мусор / уже отработанные новости → отбрасываем (экономим Claude токены)
  - Важные свежие события → передаём Claude с контекстом
"""
import json
import requests
from config.settings import GROQ_API_KEY

_URL = "https://api.groq.com/openai/v1/chat/completions"
_MODEL = "llama-3.1-8b-instant"  # быстрый и бесплатный

_SYSTEM = """You are a crypto market news filter. Analyze news and respond ONLY with JSON:
{"novelty":0-10,"priced_in":true/false,"market_impact":"HIGH"/"MEDIUM"/"LOW"/"NONE","expected_move":"UP"/"DOWN"/"NEUTRAL","reasoning":"one sentence"}

Rules:
- novelty 10=breaking news, 0=old/recycled
- priced_in=true if news is >2h old or clearly already known
- HIGH: exchange listing, hack >$10M, major partnership, regulatory action on specific coin
- NONE: general market commentary, price predictions, opinion pieces
- Respond with valid JSON only."""


def analyze_news(title: str, description: str = "", age_minutes: int = None) -> dict | None:
    if not GROQ_API_KEY:
        return None

    age_str = f" (published {age_minutes} min ago)" if age_minutes else ""
    user_msg = f"News: {title}{age_str}"
    if description:
        user_msg += f"\nContext: {description[:200]}"

    try:
        resp = requests.post(
            _URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
            json={
                "model": _MODEL,
                "messages": [
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user", "content": user_msg},
                ],
                "temperature": 0.0,
                "max_tokens": 120,
            },
            timeout=8,
        )
        resp.raise_for_status()
        text = resp.json()["choices"][0]["message"]["content"].strip()

        start = text.find("{")
        if start == -1:
            return None
        data = json.loads(text[start:text.rfind("}") + 1])

        return {
            "novelty":       int(data.get("novelty", 5)),
            "priced_in":     bool(data.get("priced_in", False)),
            "market_impact": str(data.get("market_impact", "MEDIUM")),
            "expected_move": str(data.get("expected_move", "NEUTRAL")),
            "reasoning":     str(data.get("reasoning", "")),
        }
    except Exception as e:
        print(f"[Groq] Ошибка: {e}")
        return None
