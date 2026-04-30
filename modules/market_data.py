import ccxt
import httpx
from datetime import datetime, timezone, timedelta

# Binance — технические данные (тренд, объём, RSI)
exchange = ccxt.binance({
    'enableRateLimit': True,
})

# Bybit mainnet public — funding rate и open interest (не требует ключей)
_bybit_pub = ccxt.bybit({
    'enableRateLimit': True,
    'options': {'defaultType': 'swap'},
})

# ─── Кэш глобальных индикаторов (не дёргаем API на каждую новость) ────────────
_fng_cache: dict = {"value": 50, "label": "Neutral", "ts": None}
_dom_cache: dict = {"btc_dominance": 50.0, "ts": None}
_btc_2h_cache: dict = {"pct": 0.0, "ts": None}


def get_btc_2h_change() -> float:
    """Изменение цены BTC за последние 2 часа в процентах. Кэш: 5 минут.

    Используется как фильтр корреляции: если BTC упал >2.5% за 2h —
    входить в LONG по альткоинам опасно (они тянутся вниз вслед за BTC).
    """
    now = datetime.now(timezone.utc).timestamp()
    if _btc_2h_cache["ts"] and now - _btc_2h_cache["ts"] < 300:
        return _btc_2h_cache["pct"]
    try:
        # 3 часовые свечи: [0]=3h ago, [1]=2h ago, [2]=1h ago (текущая)
        ohlcv = exchange.fetch_ohlcv("BTC/USDT", "1h", limit=3)
        if len(ohlcv) < 2:
            return 0.0
        price_2h_ago = ohlcv[0][4]   # close 2h назад
        price_now    = ohlcv[-1][4]  # последняя close
        pct = (price_now - price_2h_ago) / price_2h_ago * 100
        _btc_2h_cache["pct"] = round(pct, 2)
        _btc_2h_cache["ts"]  = now
        return _btc_2h_cache["pct"]
    except Exception:
        return 0.0


def get_fear_greed_index() -> dict:
    """
    Crypto Fear & Greed Index (0–100). Источник: alternative.me (бесплатно, без ключа).
    Кэш: 1 час (индекс обновляется раз в сутки).

    Значения:
      0–24   Extreme Fear  → рынок перепродан, хорошее время для покупки (контратрианство)
      25–44  Fear          → осторожность, но не экстрем
      45–55  Neutral       → нет сигнала
      56–74  Greed         → рынок перегрет, осторожно с лонгами
      75–100 Extreme Greed → пузырь, избегать новых лонгов
    """
    now = datetime.now(timezone.utc)
    if _fng_cache["ts"] and (now - _fng_cache["ts"]) < timedelta(hours=1):
        return {"value": _fng_cache["value"], "label": _fng_cache["label"]}
    try:
        r = httpx.get("https://api.alternative.me/fng/?limit=1", timeout=5)
        d = r.json()["data"][0]
        _fng_cache["value"] = int(d["value"])
        _fng_cache["label"] = d["value_classification"]
        _fng_cache["ts"]    = now
    except Exception:
        pass  # Возвращаем кэшированное значение (или дефолт 50)
    return {"value": _fng_cache["value"], "label": _fng_cache["label"]}


def get_btc_dominance() -> float:
    """
    Bitcoin Dominance (% капитализации BTC от всего рынка). Источник: CoinGecko (бесплатно).
    Кэш: 15 минут.

    Значения:
      > 60%  → альткоины под давлением, BTC-сезон, снижаем позиции по альтам
      50–60% → нейтрально
      42–50% → начало альт-сезона, осторожно
      < 42%  → полный альт-сезон, альты растут быстрее BTC
    """
    now = datetime.now(timezone.utc)
    if _dom_cache["ts"] and (now - _dom_cache["ts"]) < timedelta(minutes=15):
        return _dom_cache["btc_dominance"]
    try:
        r = httpx.get("https://api.coingecko.com/api/v3/global", timeout=6)
        dom = r.json()["data"]["market_cap_percentage"]["btc"]
        _dom_cache["btc_dominance"] = round(float(dom), 1)
        _dom_cache["ts"] = now
    except Exception:
        pass  # Возвращаем кэшированное значение
    return _dom_cache["btc_dominance"]


def detect_whale_trades(coin: str, min_single_usd: float = 50_000) -> dict:
    """
    Детектор китов через Binance recent trades (бесплатно, без API ключа).

    Крупные ордера на бирже дробятся на сотни мелких сделок — поэтому
    анализируем ДВА сигнала сразу:

    1. Единичная сделка >= min_single_usd  (прямой признак кита)
    2. Доминирующее направление среди крупных сделок (>$10K) — BUY или SELL
       Если перевес одного направления >= 70% — это организованная покупка/продажа.

    Возвращает:
      whale_detected  — bool
      whale_side      — "BUY" / "SELL" / None
      largest_trade   — размер крупнейшей сделки в USD (тысячи)
      whale_count     — кол-во сделок >= min_single_usd
    """
    try:
        symbol = f"{coin.upper()}/USDT"
        trades = exchange.fetch_trades(symbol, limit=500)
        if not trades:
            return {"whale_detected": False, "whale_side": None,
                    "largest_trade": 0.0, "whale_count": 0}

        # Сигнал 1: крупные единичные сделки
        whale_trades = []
        for t in trades:
            usd_size = float(t.get("cost") or 0)
            if usd_size < min_single_usd:
                continue
            raw_side = t.get("side", "")
            whale_trades.append({
                "side":     "BUY" if raw_side == "buy" else "SELL",
                "usd_size": usd_size,
            })

        # Сигнал 2: агрегированное давление (сделки > $10K)
        big_trades = [t for t in trades if float(t.get("cost") or 0) >= 10_000]
        buy_pressure  = sum(float(t.get("cost", 0)) for t in big_trades if t.get("side") == "buy")
        sell_pressure = sum(float(t.get("cost", 0)) for t in big_trades if t.get("side") == "sell")
        total_pressure = buy_pressure + sell_pressure
        pressure_side = None
        if total_pressure > 0:
            buy_ratio = buy_pressure / total_pressure
            if buy_ratio >= 0.70:
                pressure_side = "BUY"
            elif buy_ratio <= 0.30:
                pressure_side = "SELL"

        # Объединяем оба сигнала
        whale_detected = bool(whale_trades) or (pressure_side is not None)
        if not whale_detected:
            return {"whale_detected": False, "whale_side": None,
                    "largest_trade": 0.0, "whale_count": 0}

        largest = max((w["usd_size"] for w in whale_trades), default=0.0)

        # Направление: если есть крупные сделки — смотрим их перевес,
        # иначе берём агрегированное давление
        if whale_trades:
            buy_vol  = sum(w["usd_size"] for w in whale_trades if w["side"] == "BUY")
            sell_vol = sum(w["usd_size"] for w in whale_trades if w["side"] == "SELL")
            dominant_side = "BUY" if buy_vol >= sell_vol else "SELL"
        else:
            dominant_side = pressure_side

        return {
            "whale_detected": True,
            "whale_side":     dominant_side,
            "largest_trade":  round(largest / 1_000, 1),  # в тысячах USD
            "whale_count":    len(whale_trades),
        }

    except Exception:
        return {"whale_detected": False, "whale_side": None,
                "largest_trade": 0.0, "whale_count": 0}


def get_funding_rate(coin: str) -> float:
    """
    Текущая ставка финансирования фьючерса на Bybit.
    > 0  = лонги платят шортам (рынок перегрет лонгами → риск лонга)
    < 0  = шорты платят лонгам (рынок перегрет шортами → риск шорта)
    Возвращает значение в процентах (напр. 0.01 = 0.01%).
    """
    try:
        symbol = f"{coin.upper()}/USDT:USDT"
        fr = _bybit_pub.fetch_funding_rate(symbol)
        rate = fr.get('fundingRate', 0.0) or 0.0
        return round(float(rate) * 100, 5)   # → %
    except Exception:
        return 0.0


def get_open_interest(coin: str) -> dict:
    """
    Открытый интерес (OI) на Bybit.
    Возвращает {'oi_value': float, 'oi_change_pct': float}.
    oi_change_pct — изменение OI за последние 4 часа (%).
    Рост OI при росте цены = сила тренда. Падение OI = накопление прибыли.
    """
    try:
        symbol = f"{coin.upper()}/USDT:USDT"
        # История OI: последние 8 записей (каждые 30 мин = 4 часа)
        hist = _bybit_pub.fetch_open_interest_history(
            symbol, timeframe='30m', limit=8
        )
        if not hist or len(hist) < 2:
            return {'oi_value': 0.0, 'oi_change_pct': 0.0}
        first_oi = float(hist[0].get('openInterestAmount') or hist[0].get('openInterest') or 0)
        last_oi  = float(hist[-1].get('openInterestAmount') or hist[-1].get('openInterest') or 0)
        change_pct = ((last_oi - first_oi) / first_oi * 100) if first_oi > 0 else 0.0
        return {
            'oi_value':      round(last_oi, 2),
            'oi_change_pct': round(change_pct, 2),
        }
    except Exception:
        return {'oi_value': 0.0, 'oi_change_pct': 0.0}

def get_market_metrics(symbol, timestamp_ms=None):
    """
    Получает технические данные по монете:
    1. Тренд (куда идет цена последние 24ч)
    2. Всплески объемов (Киты)
    """
    try:
        # У CCXT формат торговых пар всегда содержит слэш, например 'BTC/USDT'
        if "/" not in symbol:
            symbol = f"{symbol.upper()}/USDT"
            
        # Загружаем рынки и проверяем наличие монеты
        exchange.load_markets()
        
        # 1. Поробуем прямой формат BTC/USDT
        coin_base = symbol.split('/')[0] if "/" in symbol else symbol.upper()
        symbol = f"{coin_base}/USDT"
        
        if symbol in exchange.markets:
            pass # Нашли
        else:
            # 2. Поиск по базовой валюте
            for s, m in exchange.markets.items():
                if m.get('base') == coin_base and m.get('quote') == 'USDT':
                    symbol = s
                    break
            else:
                # 3. Если монеты все еще нет, возможно она только на фьючерсах
                symbol_perp = f"{coin_base}/USDT:USDT"
                if symbol_perp in exchange.markets:
                    symbol = symbol_perp
                else:
                    return None # Монеты нет на этой бирже
            
        if timestamp_ms is None:
            # === БОЕВОЙ РЕЖИМ (Current Time) ===
            ticker = exchange.fetch_ticker(symbol)
            price_change_percent = ticker['percentage']
            current_price = ticker['last']
            quote_volume_24h = float(ticker.get('quoteVolume') or 0)
            ohlcv = exchange.fetch_ohlcv(symbol, timeframe='15m', limit=5)
        else:
            # === РЕЖИМ БЭКТЕСТА (Historical Time) ===
            # Скачиваем дневные свечи, которые закончились до этого момента
            day_ohlcv = exchange.fetch_ohlcv(symbol, timeframe='1d', limit=2, params={'endTime': timestamp_ms})
            if len(day_ohlcv) < 2:
                return None
            open_price = day_ohlcv[0][1]
            close_price = day_ohlcv[-1][4]
            price_change_percent = ((close_price - open_price) / open_price) * 100
            
            # Скачиваем 15m свечи ТОЛЬКО до момента исторической новости
            ohlcv = exchange.fetch_ohlcv(symbol, timeframe='15m', limit=5, params={'endTime': timestamp_ms})
            if not ohlcv:
                return None
            current_price = ohlcv[-1][4] # Текущая цена на тот исторический момент
            quote_volume_24h = 0.0  # недоступно в режиме бэктеста

        # Вытаскиваем объемы торгов
        volumes = [candle[5] for candle in ohlcv]
        current_volume = volumes[-1]
        past_average_volume = sum(volumes[:-1]) / (len(volumes) - 1)
        volume_multiplier = current_volume / past_average_volume if past_average_volume > 0 else 1
        
        # Вытаскиваем цены закрытия для RSI
        close_prices = [candle[4] for candle in ohlcv]
        
        # Расчет простого RSI (Relative Strength Index)
        # Нам нужно как минимум 14 изменений цены
        def calculate_rsi(prices, period=14):
            if len(prices) < period + 1:
                return 50 # Нейтрально если мало данных
            deltas = [prices[i+1] - prices[i] for i in range(len(prices)-1)]
            gain = [d if d > 0 else 0 for d in deltas]
            loss = [-d if d < 0 else 0 for d in deltas]
            avg_gain = sum(gain[-period:]) / period
            avg_loss = sum(loss[-period:]) / period
            if avg_loss == 0: return 100
            rs = avg_gain / avg_loss
            return 100 - (100 / (1 + rs))

        # RSI считаем на 1h свечах (50 штук = ~2 суток истории).
        # Раньше было 20×15m = 5 часов — RSI(14) на таком окне давал хаотичные значения.
        if timestamp_ms is None:
            ohlcv_rsi = exchange.fetch_ohlcv(symbol, timeframe='1h', limit=50)
        else:
            ohlcv_rsi = exchange.fetch_ohlcv(symbol, timeframe='1h', limit=50, params={'endTime': timestamp_ms})
        rsi_value = calculate_rsi([c[4] for c in ohlcv_rsi])
            
        # Funding rate и OI только в боевом режиме (не в бэктесте)
        funding_rate = 0.0
        oi_change_pct = 0.0
        if timestamp_ms is None:
            funding_rate  = get_funding_rate(coin_base)
            oi_data       = get_open_interest(coin_base)
            oi_change_pct = oi_data['oi_change_pct']

        # Детектор китов: объёмный спайк (быстро) + реальные сделки (точно)
        # В бэктесте пропускаем — нет исторических trade-данных
        whale_data = {"whale_detected": False, "whale_side": None,
                      "largest_trade": 0.0, "whale_count": 0}
        if timestamp_ms is None:
            whale_data = detect_whale_trades(coin_base)

        # is_whale_active = объёмный спайк (4x — снижен шум) ИЛИ реальная китовая сделка
        is_whale_active = (volume_multiplier >= 4.0) or whale_data["whale_detected"]

        return {
            "symbol":            symbol,
            "trend_24h_percent": round(price_change_percent, 2) if price_change_percent else 0,
            "volume_multiplier": round(volume_multiplier, 2),
            "quote_volume_24h":  quote_volume_24h,
            "is_whale_active":   is_whale_active,
            "whale_side":        whale_data["whale_side"],      # "BUY"/"SELL"/None
            "whale_largest_m":   whale_data["largest_trade"],  # млн USD
            "whale_count":       whale_data["whale_count"],     # кол-во сделок
            "current_price":     current_price,
            "rsi":               round(rsi_value, 2),
            "funding_rate":      funding_rate,
            "oi_change_pct":     oi_change_pct,
        }
        
    except Exception as e:
        print(f"Ошибка получения графиков для {symbol}: {e}")
        return None

# Для тестирования модуля
if __name__ == "__main__":
    test_coins = ["BTC", "ETH", "SUI", "FET", "DOGE"]
    
    print("Собираем данные с биржи Binance...\n")
    for coin in test_coins:
        metrics = get_market_metrics(coin)
        if metrics:
            whale_status = "🚨 КИТЫ ВОШЛИ" if metrics["is_whale_active"] else "тишина"
            trend = "📈 РОСТ" if metrics["trend_24h_percent"] > 0 else "📉 ПАДЕНИЕ"
            
            print(f"[{metrics['symbol']}] Цена: {metrics['current_price']}$")
            print(f"   Тренд: {trend} ({metrics['trend_24h_percent']}%)")
            print(f"   Объемы: x{metrics['volume_multiplier']} ({whale_status})")
            print("-" * 30)
