from modules.ai_analyzer import analyze_sentiment
from modules.market_data import get_market_metrics

def generate_signal(news_item):
    """
    Главная Математическая Модель (Scoring Formula)
    Принимает словарь с новостью, рассчитывает вероятности, возвращает СИГНАЛ.
    """
    
    # 1. Защита от глобальной паники (Глобальное падение рынков)
    if news_item.get("is_panic"):
        return {
            "coin": "ALL",
            "action": "SELL_ALL",
            "total_score": -100.0,
            "reason": "ГЛОБАЛЬНАЯ МАКРО-ПАНИКА",
            "news_title": news_item['title']
        }
        
    # 2. Идем к Claude за оценкой
    ai_result = analyze_sentiment(news_item['title'])
    news_score = ai_result['score'] # Оценка ИИ от -10 до +10
    coin = ai_result['coin']
    
    # Если новость слабая (баллы от -3 до +3), мы не рискуем
    if abs(news_score) < 4:
        return None 
        
    # 3. Идем на биржу и берем метрики по этой монете
    market_data = get_market_metrics(coin, timestamp_ms=news_item.get('timestamp_ms'))
    
    if not market_data:
        # Если не смогли найти такую монету на бирже
        return None 
        
    # ==========================================
    # 4. МАТЕМАТИКА (Формула весов)
    # ==========================================
    
    # База: Оценка ИИ
    total_score = float(news_score)
    
    # Фактор А: Киты (Всплески объемов)
    vol_mult = market_data['volume_multiplier']
    
    if news_score > 0 and market_data['is_whale_active']:
        total_score += 4.0  # Супер-подтверждение: отличная новость + кто-то скупает монету
    elif news_score < 0 and market_data['is_whale_active']:
        total_score -= 4.0  # Паническая продажа: плохая новость + кто-то массово "сливает"
        
    # Фактор Б: Тренд (Идем по тренду или против?)
    trend_24h = market_data['trend_24h_percent']
    
    if news_score > 0 and trend_24h > 1.5:
        total_score += 2.0  # Тренд позитивный, новость только усилит рост
    elif news_score > 0 and trend_24h <= -1.5:
        total_score -= 2.0  # Новость хорошая, но рынок сильно давит вниз (опасно покупать)
        
    elif news_score < 0 and trend_24h < -1.5:
        total_score -= 2.0  # Тренд и так падал, плохая новость убьет монету - шортим увереннее

    # Фактор В: Технический RSI (Защита от входа на хаях)
    rsi = market_data.get('rsi', 50)
    if news_score > 0 and rsi > 70:
        total_score -= 3.0  # Опасно: новость хорошая, но монета ПЕРЕКУПЛЕНА. Снижаем балл.
    elif news_score < 0 and rsi < 30:
        total_score += 3.0  # Опасно: новость плохая, но монета уже ПЕРЕПРОДАНА. Снижаем балл.

    # ==========================================
    # 5. ИТОГОВЫЙ ВЕРДИКТ И ПЛЕЧО
    # ==========================================
    
    action = "HOLD"
    if total_score >= 8.0:
        action = "LONG"
    elif total_score <= -8.0:
        action = "SHORT"
        
    # Рассчитываем множитель размера (от 0.5 до 1.5)
    # Если балл идеальный (14+), заходим большим объемом
    size_multiplier = max(0.5, min(1.5, abs(total_score) / 10.0))
        
    return {
        "coin": coin,
        "action": action,
        "total_score": round(total_score, 1),
        "size_multiplier": round(size_multiplier, 2),
        "components": {
            "ai_score": news_score,
            "market_volume_mult": vol_mult,
            "trend_percent": trend_24h,
            "rsi": rsi
        },
        "news_title": news_item['title'],
        "source": news_item.get('source', 'Unknown')
    }

if __name__ == "__main__":
    import json
    
    test_news = {
        "title": "AAVE Foundation secures $100M massive funding for Protocol V4",
        "source": "CryptoSlate Test",
        "is_panic": False
    }
    
    print("Отправляем тестовую новость в Математическую модель...\n")
    # Примечание: Для теста нужен активный ключ Claude API
    signal = generate_signal(test_news)
    
    if signal:
        print("СГЕНЕРИРОВАН СИГНАЛ:")
        print(json.dumps(signal, indent=2, ensure_ascii=False))
    else:
        print("Сигнал отклонен (слабая новость или нет данных на бирже).")
