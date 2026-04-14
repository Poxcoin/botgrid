import anthropic
import json
from config.settings import CLAUDE_API_KEY

# Инициализируем клиента
client = anthropic.Anthropic(api_key=CLAUDE_API_KEY)

def analyze_sentiment(news_title):
    """
    Оценивает новость на потенциальное влияние для цены альткоина.
    ИИ должен вернуть строго JSON с оценкой от -10 до +10 и названием монеты.
    """
    prompt = f"""
    You are a professional crypto quant trading AI algorithm.
    Analyze the sentiment and potential physical price impact of this crypto news:
    
    News Title: '{news_title}'
    
    1. Determine the EXACT ticker symbol of the coin this news primarily affects (e.g. SUI, SOL, FET, AAVE). If it's a general market news (like Binance updates or global regulation), answer "BTC".
    2. Give a mathematical score from -10 to +10.
       +10 = Maximum pump fuel (Coinbase/Binance listing, major partnership like Google, secures huge funding)
       -10 = Maximum dump fuel (Hack, bankruptcy, SEC lawsuit, delisting)
       0 = Neutral, boring, or IRRELEVANT news.
       
    CRITICAL RULE: If the news is NOT about cryptocurrency, blockchain, or global macroeconomics (Fed, inflation, central banks, wars between major nations), it is IRRELEVANT. For animal stories, sports, celebrities (unless crypto-related), or culture, ALWAYS return a score of 0.
       
    Respond ONLY with a JSON object in this exact mathematical format, absolutely no other text:
    {{"score": 8, "coin": "TICKER"}}
    """
    
    try:
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=60,
            temperature=0.0,
            messages=[{"role": "user", "content": prompt}]
        )
        
        # Получаем текст от Клода
        result_text = response.content[0].text.strip()

        # Ищем начало первого JSON объекта
        start = result_text.find('{')
        if start == -1:
            raise ValueError(f"JSON не найден в ответе: {result_text[:100]}")

        # raw_decode парсит первый валидный JSON и игнорирует всё что после него
        decoder = json.JSONDecoder()
        data, _ = decoder.raw_decode(result_text[start:])
        
        return {
            "score": int(data.get("score", 0)),
            "coin": data.get("coin", "BTC").upper()
        }
        
    except Exception as e:
        print(f"Ошибка ИИ: {str(e)}")
        # Если ИИ сломался - не торгуем (возвращаем 0)
        return {"score": 0, "coin": "BTC"}

if __name__ == "__main__":
    # Тест
    test_title = "Binance announces official listing of FET token with zero fees"
    print(f"Тестовая новость: {test_title}")
    print(analyze_sentiment(test_title))