from modules.ai_analyzer import analyze_sentiment
from modules.market_data import get_market_metrics


def _calc_confidence(
    ai_confidence: int,      # 0-10 от Claude
    source_weight: float,    # 0.6-1.0 от news_parser
    news_score: int,         # абсолютное значение оценки ИИ
    market_data: dict,       # метрики с биржи
    trend_aligned: bool,     # тренд совпадает с сигналом
) -> int:
    """
    Рассчитывает итоговую уверенность в сигнале (0–100%).

    Формула (линейная, прозрачная):
      40% = ИИ-уверенность (AI confidence 0-10 → 0-40 pt)
      20% = Качество источника (source_weight 0.6-1.0 → 12-20 pt)
      20% = Сила новостного сигнала (|score| 4-10 → 8-20 pt)
      10% = Подтверждение китами (whale активность)
      10% = Подтверждение трендом (тренд совпадает с направлением)

    Итого макс: 100 pt = 100%
    """
    # 1. AI-уверенность: 0-10 → 0-40
    conf_ai = ai_confidence * 4

    # 2. Источник: 0.6-1.0 → 12-20 (линейный маппинг)
    conf_source = 12 + (source_weight - 0.6) / 0.4 * 8

    # 3. Сила сигнала: |score| 4-10 → 8-20
    score_abs = min(abs(news_score), 10)
    conf_signal = 8 + (score_abs - 4) / 6 * 12

    # 4. Киты (whale): +10 если whale_active совпадает с направлением сигнала
    conf_whale = 10 if market_data.get("is_whale_active") else 0

    # 5. Тренд: +10 если тренд совпадает с направлением сигнала
    conf_trend = 10 if trend_aligned else 0

    total = conf_ai + conf_source + conf_signal + conf_whale + conf_trend
    return max(0, min(100, round(total)))


def generate_signal(news_item: dict) -> dict | None:
    """
    Главная математическая модель (Scoring Formula + Confidence).
    Принимает словарь с новостью, рассчитывает вероятности, возвращает СИГНАЛ.

    Возвращает None, если новость слабая или данных нет.
    """

    # 1. Защита от глобальной паники
    if news_item.get("is_panic"):
        return {
            "coin": "ALL",
            "action": "SELL_ALL",
            "total_score": -100.0,
            "confidence": 100,
            "reason": "ГЛОБАЛЬНАЯ МАКРО-ПАНИКА",
            "news_title": news_item["title"],
        }

    # 2. Анализ ИИ (с описанием для лучшего контекста)
    ai_result = analyze_sentiment(
        news_item["title"],
        news_item.get("description", ""),
    )
    news_score = ai_result["score"]       # -10 до +10
    coin = ai_result["coin"]
    ai_confidence = ai_result["confidence"]  # 0-10

    # Слабая новость — не рискуем
    if abs(news_score) < 4:
        return None

    # ИИ сам не уверен в своей оценке — пропускаем
    if ai_confidence < 3:
        return None

    # 3. Рыночные метрики
    market_data = get_market_metrics(coin, timestamp_ms=news_item.get("timestamp_ms"))
    if not market_data:
        return None

    # ==========================================
    # 4. МАТЕМАТИКА (Формула весов)
    # ==========================================

    total_score = float(news_score)

    # Фактор А: Киты (всплески объёмов)
    vol_mult = market_data["volume_multiplier"]
    whale_active = market_data["is_whale_active"]

    if news_score > 0 and whale_active:
        total_score += 4.0   # Отличная новость + скупают — супер-подтверждение
    elif news_score < 0 and whale_active:
        total_score -= 4.0   # Плохая новость + сливают — двойное давление

    # Фактор Б: Тренд
    trend_24h = market_data["trend_24h_percent"]
    trend_aligned = False

    if news_score > 0:
        if trend_24h > 1.5:
            total_score += 2.0   # Позитивная новость + восходящий тренд
            trend_aligned = True
        elif trend_24h <= -1.5:
            total_score -= 2.0   # Позитивная новость, но рынок давит вниз (опасно)
    elif news_score < 0:
        if trend_24h < -1.5:
            total_score -= 2.0   # Негативная новость + нисходящий тренд
            trend_aligned = True

    # Фактор В: RSI (защита от входа на хаях/лоях)
    rsi = market_data.get("rsi", 50)
    if news_score > 0 and rsi > 70:
        total_score -= 3.0   # Новость хорошая, но монета перекуплена
    elif news_score < 0 and rsi < 30:
        total_score += 3.0   # Новость плохая, но монета перепродана

    # Фактор Г: Funding Rate (перегрев деривативного рынка)
    # Высокий позитивный FR = лонги переплачивают = рынок перегрет снизу → риск слива
    # Высокий негативный FR = шорты переплачивают = шорт-сквиз вероятен → риск шорта
    funding_rate = market_data.get("funding_rate", 0.0)
    if news_score > 0:     # планируем LONG
        if funding_rate > 0.08:
            total_score -= 2.5   # Лонги перегреты: все уже купили, некому тянуть
        elif funding_rate > 0.04:
            total_score -= 1.0   # Умеренно перегрет
        elif funding_rate < -0.04:
            total_score += 1.5   # Шорты сожмут — хороший момент для лонга
    elif news_score < 0:   # планируем SHORT
        if funding_rate < -0.08:
            total_score += 2.5   # Шорты перегреты: риск сквиза, опасно шортить
        elif funding_rate < -0.04:
            total_score += 1.0   # Умеренно перегрет шортами
        elif funding_rate > 0.04:
            total_score -= 1.5   # Лонги перегреты — хороший момент для шорта

    # Фактор Д: Open Interest (сила тренда через деньги в рынке)
    # Растущий OI при движении цены = деньги входят = тренд настоящий
    # Падающий OI = позиции закрываются = движение слабеет
    oi_change = market_data.get("oi_change_pct", 0.0)
    if abs(oi_change) > 5.0:                          # OI вырос/упал >5% за 4h
        if (news_score > 0 and oi_change > 0) or (news_score < 0 and oi_change < 0):
            total_score += 1.5   # OI подтверждает направление сигнала
        elif (news_score > 0 and oi_change < 0) or (news_score < 0 and oi_change > 0):
            total_score -= 1.0   # OI против сигнала — слабое движение

    # ==========================================
    # 5. CONFIDENCE (уверенность 0-100%)
    # ==========================================

    source_weight = float(news_item.get("source_weight", 0.75))
    confidence = _calc_confidence(
        ai_confidence=ai_confidence,
        source_weight=source_weight,
        news_score=news_score,
        market_data=market_data,
        trend_aligned=trend_aligned,
    )

    # ==========================================
    # 6. ИТОГОВЫЙ ВЕРДИКТ И РАЗМЕР ПОЗИЦИИ
    # ==========================================

    action = "HOLD"

    # Минимальный порог confidence для реального торгового сигнала
    if total_score >= 8.0 and confidence >= 40:
        action = "LONG"
    elif total_score <= -8.0 and confidence >= 40:
        action = "SHORT"

    # size_multiplier: 0.5–1.5, учитывает и балл, и confidence
    raw_size = abs(total_score) / 10.0 * (confidence / 100.0) * 2.0
    size_multiplier = max(0.5, min(1.5, raw_size))

    return {
        "coin": coin,
        "action": action,
        "total_score": round(total_score, 1),
        "confidence": confidence,                      # 0-100%
        "size_multiplier": round(size_multiplier, 2),
        "components": {
            "ai_score":          news_score,
            "ai_confidence":     ai_confidence,
            "source_weight":     source_weight,
            "market_volume_mult": vol_mult,
            "trend_percent":     trend_24h,
            "trend_aligned":     trend_aligned,
            "rsi":               rsi,
            "whale_active":      whale_active,
            "funding_rate":      funding_rate,
            "oi_change_pct":     oi_change,
        },
        "news_title": news_item["title"],
        "source": news_item.get("source", "Unknown"),
    }


if __name__ == "__main__":
    import json

    test_news = {
        "title": "AAVE Foundation secures $100M massive funding for Protocol V4",
        "description": "The AAVE Foundation announced a $100M funding round led by a16z to accelerate development of Aave V4.",
        "source": "CoinDesk",
        "source_weight": 1.0,
        "is_panic": False,
    }

    print("Отправляем тестовую новость в математическую модель...\n")
    signal = generate_signal(test_news)

    if signal:
        print("СГЕНЕРИРОВАН СИГНАЛ:")
        print(json.dumps(signal, indent=2, ensure_ascii=False))
    else:
        print("Сигнал отклонён (слабая новость, низкий confidence или нет данных).")
