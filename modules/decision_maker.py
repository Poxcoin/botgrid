from datetime import datetime, timezone
from modules.ai_analyzer import analyze_sentiment
from modules.market_data import get_market_metrics, get_fear_greed_index, get_btc_dominance
from modules.macro_calendar import get_size_modifier, get_active_macro_event, get_funding_settlement
from modules.liquidation_monitor import get_liquidation_signal, get_liquidation_1h_boost
from modules.onchain_monitor import get_onchain_signal
from modules.gemini_filter import analyze_news as gemini_analyze

_STABLECOINS = frozenset({"USDC", "USDT", "DAI", "BUSD", "TUSD", "FDUSD", "PYUSD", "USDE", "FRAX"})

import re as _re

_TICKER_RE = _re.compile(r'\(([A-Z]{2,10})\)')  # "Binance Will List Chip (CHIP)" → CHIP
_USDT_RE   = _re.compile(r'\b([A-Z]{2,10})USDT\b')  # "New listing: CHIPUSDT" → CHIP


def generate_listing_signal(news_item: dict) -> dict | None:
    """
    Fast-path для анонсів лістингів бірж.
    Байпасить Claude/Groq — лістинг майже завжди = LONG.
    Викликати ТІЛЬКИ якщо news_item['is_listing'] == True.
    """
    title = news_item.get("title", "")
    title_upper = title.upper()

    # Пропускаємо stablecoins і futures-only анонси (не spot)
    if any(s in title_upper for s in ("USDC", "USDT PERPETUAL", "USDⓈ-MARGINED")):
        if "SPOT" not in title_upper and "WILL LIST" not in title_upper:
            return None

    # Витягуємо тікер
    coin = None
    m = _TICKER_RE.search(title)
    if m:
        coin = m.group(1)
    else:
        m = _USDT_RE.search(title)
        if m:
            coin = m.group(1)

    if not coin or coin in _STABLECOINS:
        return None

    source = news_item.get("source", "Exchange")
    print(f"[LISTING] 🚀 {source}: {coin} — fast-path LONG сигнал")

    return {
        "coin":           coin,
        "action":         "LONG",
        "total_score":    12.0,
        "confidence":     85,
        "size_multiplier": 1.0,
        "reason":         f"Exchange listing: {source}",
        "news_title":     title,
        "is_listing":     True,
    }


def generate_whale_signal(news_item: dict) -> dict | None:
    """
    Fast-path для whale transfers з @whale_alert_io.
    Байпасить Claude/Groq — on-chain факт не потребує AI аналізу.
    coin/action вже розпарсені в telegram_monitor._parse_whale_alert().
    """
    coin   = news_item.get("whale_coin", "")
    action = news_item.get("whale_action", "")
    if not coin or action not in ("LONG", "SHORT"):
        return None
    if coin in _STABLECOINS:
        return None
    # BTC/ETH whale alerts are too noisy — score too low to pass 13.0 threshold, skip
    _btc_eth = {"BTC", "ETH", "BITCOIN", "ETHEREUM"}
    if coin.upper() in _btc_eth:
        return None
    score = 8.0 if action == "LONG" else -8.0
    return {
        "coin":           coin,
        "action":         action,
        "total_score":    score,
        "ai_score":       0,
        "confidence":     70,
        "size_multiplier": 0.8,
        "reason":         f"Whale Alert: {news_item.get('title', '')[:80]}",
        "news_title":     news_item.get("title", ""),
        "bot_tag":        "🐋",
        "is_whale_alert": True,
    }


def _news_age_minutes(published_dt: str) -> int | None:
    """Возраст новости в минутах относительно UTC now. None если нет даты."""
    if not published_dt:
        return None
    try:
        pub = datetime.fromisoformat(published_dt)
        age = datetime.now(timezone.utc) - pub
        return max(0, int(age.total_seconds() / 60))
    except Exception:
        return None


def _time_multiplier() -> float:
    """
    Коэффициент размера позиции в зависимости от времени суток (UTC).

    Логика: ликвидность и надёжность объёмных сигналов меняется по времени.
      08:00–12:00 UTC — открытие Европы, пик активности        → 1.00 (норма)
      13:00–17:00 UTC — открытие США, максимальный объём       → 1.00 (норма)
      18:00–01:59 UTC — вечер / поздно, умеренный трафик       → 0.85
      02:00–07:59 UTC — глубокая ночь, ложные спайки чаще      → 0.70

    Коэффициент применяется к size_multiplier (не к total_score),
    чтобы сигнал оставался в логе но позиция открывалась меньшего размера.
    """
    hour = datetime.now(timezone.utc).hour
    if 8 <= hour < 18:
        return 1.00   # Рабочие часы Европы + США
    if 18 <= hour < 24 or hour == 0:
        return 0.85   # Вечер / ранняя ночь
    # 01:00–07:59 UTC
    return 0.70


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

    # 0. Возраст новости: RSS > 15 мин → пропуск; TG > 45 мин → пропуск
    # TG использует реальный message.date (timestamp поста в канале).
    # Канал мог переслать старую новость — фильтр это ловит.
    is_replay = news_item.get("is_replay", False)
    age_min = _news_age_minutes(news_item.get("published_dt", ""))
    is_tg = str(news_item.get("source", "")).startswith("Telegram")
    if not is_replay:
        if is_tg and age_min is not None and age_min > 45:
            print(f"   ⏰ TG новость устарела ({age_min} мин) — пропускаем")
            return None
        if not is_tg and age_min is not None and age_min > 15:
            return None

    # Smart wallet сигнал — знижений поріг (не потрібно 9 балів)
    is_smart_wallet = str(news_item.get("source", "")).startswith("Smart Wallet")

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

    # 1.5. Gemini pre-filter — проверяем новизну и рыночное влияние до Claude
    gemini = gemini_analyze(
        news_item["title"],
        news_item.get("description", ""),
        age_minutes=age_min,
    )
    if gemini:
        # Уже отработана рынком — пропускаем
        if gemini["priced_in"] and gemini["novelty"] < 4:
            return None
        # Gemini считает влияние нулевым
        if gemini["market_impact"] == "NONE":
            return None

    # 2. Анализ ИИ (с описанием для лучшего контекста + контекст от Gemini)
    gemini_context = ""
    if gemini:
        gemini_context = f" [Gemini: {gemini['market_impact']} impact, {gemini['expected_move']}, novelty={gemini['novelty']}]"

    ai_result = analyze_sentiment(
        news_item["title"] + gemini_context,
        news_item.get("description", ""),
    )
    news_score = ai_result["score"]       # -10 до +10
    coin = ai_result["coin"]
    coin_upper = coin.upper()
    ai_confidence = ai_result["confidence"]  # 0-10

    if coin_upper in _STABLECOINS:
        return None

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

    # 3.5. Перевіряємо чи ціна вже рухнула без нас
    # Якщо volume spike > 8x І trend вже > 3% в нашому напрямку — занадто пізно
    _vol_mult_check = market_data.get("volume_multiplier", 1)
    _recent_change  = market_data.get("trend_24h_percent", 0)
    if _vol_mult_check > 8 and news_score > 0 and _recent_change > 3:
        print(f"   ⏰ {coin} вже рухнув +{_recent_change:.1f}% з volume {_vol_mult_check}x — запізнились")
        return None
    if _vol_mult_check > 8 and news_score < 0 and _recent_change < -3:
        print(f"   ⏰ {coin} вже впав {_recent_change:.1f}% з volume {_vol_mult_check}x — запізнились")
        return None

    # ==========================================
    # 4. МАТЕМАТИКА (Формула весов)
    # ==========================================

    total_score = float(news_score)

    # Фактор А: Киты — объёмный спайк + реальные сделки с Binance
    vol_mult    = market_data["volume_multiplier"]
    whale_active = market_data["is_whale_active"]
    whale_side   = market_data.get("whale_side")     # "BUY" / "SELL" / None
    whale_m      = market_data.get("whale_largest_m", 0)  # млн USD

    if whale_active and whale_side:
        # Знаем направление кита — применяем направленно
        if news_score > 0 and whale_side == "BUY":
            total_score += 4.0   # Бычья новость + кит покупает — идеально
        elif news_score < 0 and whale_side == "SELL":
            total_score -= 4.0   # Медвежья новость + кит продаёт — двойное давление
        elif news_score > 0 and whale_side == "SELL":
            total_score += 1.5   # Бычья новость но кит продаёт — осторожно
        elif news_score < 0 and whale_side == "BUY":
            total_score -= 1.5   # Медвежья новость но кит покупает — дип-байер?
    elif whale_active:
        # Старая логика: спайк без направления
        if news_score > 0:
            total_score += 4.0
        elif news_score < 0:
            total_score -= 4.0

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

    # Фактор Д2: Ликвидации 5 мин (Binance реалтайм)
    liq = get_liquidation_signal(coin)
    liq_score = liq["signal_score"]
    # Применяем только если совпадает с направлением сигнала
    if news_score > 0 and liq["signal"] == "BULLISH":
        total_score += liq_score    # шорты сквизятся — лонг усиливается
    elif news_score < 0 and liq["signal"] == "BEARISH":
        total_score += abs(liq_score)  # лонги каскадят — шорт усиливается
    elif news_score > 0 and liq["signal"] == "BEARISH":
        total_score -= abs(liq_score) * 0.5  # идём против ликвидационного потока — осторожно
    elif news_score < 0 and liq["signal"] == "BULLISH":
        total_score += liq_score * 0.5  # шортим при сквизе — опасно

    # Фактор Д3: Ликвидации 1 час — масштабный каскад/сквиз
    # Пороги: >$5M за 1ч = +/-1.5, >$20M = +/-3.0
    liq_1h_boost = get_liquidation_1h_boost(coin)
    if liq_1h_boost != 0.0:
        if (news_score > 0 and liq_1h_boost > 0) or (news_score < 0 and liq_1h_boost < 0):
            total_score += liq_1h_boost  # совпадает с сигналом — усиливаем
            print(f"   ⚡ Liq 1h boost {coin}: {liq_1h_boost:+.1f} (совпадает с сигналом)")
        else:
            total_score += liq_1h_boost * 0.4  # противоположный — осторожно
            print(f"   ⚠️ Liq 1h boost {coin}: {liq_1h_boost * 0.4:+.1f} (против сигнала, снижен)")

    # Фактор Е: Fear & Greed Index (настроение всего крипто-рынка)
    # Логика контратрианства: покупай когда все боятся, продавай когда все жадничают.
    # Extreme Fear = рынок перепродан = лонги дешевле и безопаснее.
    # Extreme Greed = рынок перегрет = лонги опасны, коррекция назревает.
    fng = get_fear_greed_index()
    fng_value = fng["value"]
    if news_score > 0:      # планируем LONG
        if fng_value <= 20:
            total_score += 2.0    # Extreme Fear: все уже продали, хорошая точка входа
        elif fng_value <= 40:
            total_score += 1.0    # Fear: рынок осторожен, хорошее соотношение риск/доход
        elif fng_value >= 80:
            total_score -= 2.0    # Extreme Greed: все уже купили, некому тянуть выше
        elif fng_value >= 65:
            total_score -= 1.0    # Greed: рынок перегрет, осторожно
    elif news_score < 0:    # планируем SHORT
        if fng_value >= 80:
            total_score -= 1.5    # Extreme Greed подтверждает шорт (коррекция назревает)
        elif fng_value <= 20:
            total_score += 1.5    # Extreme Fear: рынок уже перепродан, шорт рискован

    # Фактор Е2: On-chain (whale переводы на/с бирж)
    onchain = get_onchain_signal("ETH")
    onchain_score = onchain["signal_score"]
    if coin_upper in ("ETH", "ETHEREUM") or coin_upper == "BTC":
        if news_score > 0 and onchain["signal"] == "BULLISH":
            total_score += onchain_score
        elif news_score < 0 and onchain["signal"] == "BEARISH":
            total_score += abs(onchain_score)
        elif news_score > 0 and onchain["signal"] == "BEARISH":
            total_score -= abs(onchain_score) * 0.5
        elif news_score < 0 and onchain["signal"] == "BULLISH":
            total_score += onchain_score * 0.5

    # Фактор Ж: Bitcoin Dominance (альт-сезон vs BTC-сезон)
    # Когда BTC dominance высокая — капитал уходит в BTC, альты страдают.
    # Когда dominance низкая — деньги ротируются в альты.
    # Применяется ТОЛЬКО для монет, которые не BTC и не ETH.
    btc_dom = get_btc_dominance()
    if coin_upper not in ("BTC", "ETH"):
        if news_score > 0:   # планируем LONG на альткоин
            if btc_dom >= 62:
                total_score -= 2.0   # BTC-сезон: деньги идут в BTC, альты падают
            elif btc_dom >= 55:
                total_score -= 1.0   # Нейтрально-негативно для альтов
            elif btc_dom <= 42:
                total_score += 1.5   # Альт-сезон: деньги ротируются в альты
            elif btc_dom <= 48:
                total_score += 0.5   # Начало ротации в альты
        elif news_score < 0:  # планируем SHORT на альткоин
            if btc_dom >= 62:
                total_score -= 1.0   # BTC-сезон усиливает шорт альта
            elif btc_dom <= 42:
                total_score += 1.0   # Альт-сезон: шортить альты рискованно

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

    btc_eth_coins = {"BTC", "ETH", "BITCOIN", "ETHEREUM"}
    if is_smart_wallet:
        min_score = 10.0  # smart money: підняли з 8.0 (занадто багато шумних угод)
    elif coin_upper in btc_eth_coins:
        min_score = 13.0  # BTC/ETH: підняли з 11.0 (12% winrate = поріг був занадто низький)
    else:
        min_score = 11.0  # алти: підняли з 10.0 (загальний winrate 21% = недостатньо)

    if total_score >= min_score and confidence >= 60:
        action = "LONG"
    elif total_score <= -min_score and confidence >= 60:
        action = "SHORT"

    # size_multiplier: 0.4–2.0, ступенчатые тиры по скору + confidence + время суток
    # Высокий скор = больше денег в игру; низкий — осторожнее
    time_coeff = _time_multiplier()
    score_abs = abs(total_score)
    conf_factor = confidence / 100.0
    if score_abs >= 14:
        tier_mult = 2.0
    elif score_abs >= 12:
        tier_mult = 1.6
    elif score_abs >= 10:
        tier_mult = 1.2
    elif score_abs >= 8:
        tier_mult = 0.9
    else:
        tier_mult = 0.6
    size_multiplier = max(0.4, min(2.0, tier_mult * conf_factor)) * time_coeff
    size_multiplier = round(size_multiplier, 2)

    # ==========================================
    # 7. MACRO CALENDAR — риск перед важными событиями
    # ==========================================
    # Снижаем размер позиции перед FOMC/CPI/NFP/PCE/Jobless Claims
    # и в окне Funding Rate Settlement (±20 мин от 00:00, 08:00, 16:00 UTC).
    # Если события нет — macro_mod = 1.0, сигнал не меняется.
    macro_mod, macro_reason = get_size_modifier()
    macro_event  = get_active_macro_event()
    funding_info = get_funding_settlement()

    if macro_mod < 1.0:
        size_multiplier = round(size_multiplier * macro_mod, 2)
        if size_multiplier < 0.3 and action in ("LONG", "SHORT"):
            action = "HOLD"

    # Штраф за возраст: 30-60 мин → -25% размер, >60 мин → -50% размер
    if age_min is not None:
        if age_min > 60:
            size_multiplier = round(size_multiplier * 0.5, 2)
        elif age_min > 30:
            size_multiplier = round(size_multiplier * 0.75, 2)

    return {
        "coin": coin,
        "action": action,
        "total_score": round(total_score, 1),
        "confidence": confidence,                      # 0-100%
        "size_multiplier": size_multiplier,
        "components": {
            "ai_score":          news_score,
            "ai_confidence":     ai_confidence,
            "source_weight":     source_weight,
            "market_volume_mult": vol_mult,
            "trend_percent":     trend_24h,
            "trend_aligned":     trend_aligned,
            "rsi":               rsi,
            "whale_active":      whale_active,
            "whale_side":        whale_side,
            "whale_largest_m":   whale_m,
            "funding_rate":      funding_rate,
            "oi_change_pct":     oi_change,
            "fear_greed":        fng_value,
            "fear_greed_label":  fng["label"],
            "btc_dominance":     btc_dom,
            "time_coeff":        time_coeff,
            "macro_mod":         macro_mod,
            "liq_signal":        liq["signal"],
            "liq_long_usd":      liq["long_liq_usd"],
            "liq_short_usd":     liq["short_liq_usd"],
        },
        "macro_event":   macro_reason if macro_reason else None,
        "funding_event": funding_info["name"] if funding_info else None,
        "news_title": news_item["title"],
        "source": news_item.get("source", "Unknown"),
        "news_age_minutes": age_min,
        "groq": gemini if gemini else {},
        "_market": {"quote_volume_24h": market_data.get("quote_volume_24h", 0)},
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
