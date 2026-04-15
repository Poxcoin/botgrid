import ccxt

# Подключаемся к Binance для получения технической статистики (Без API ключей - только публичные данные)
exchange = ccxt.binance({
    'enableRateLimit': True,
})

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
            
        return {
            "symbol": symbol,
            "trend_24h_percent": round(price_change_percent, 2) if price_change_percent else 0,
            "volume_multiplier": round(volume_multiplier, 2),
            "is_whale_active": volume_multiplier >= 2.5,
            "current_price": current_price,
            "rsi": round(rsi_value, 2)
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
