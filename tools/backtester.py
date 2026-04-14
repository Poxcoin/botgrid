import os
import sys
import datetime
import time

# Инициализируем пути, чтобы Python видел модули
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from modules.decision_maker import generate_signal
from config.settings import TAKE_PROFIT_PERCENT, STOP_LOSS_PERCENT
import ccxt

exchange = ccxt.binance({
    'enableRateLimit': True,
})

# Хардкодим самые яркие события для тестирования (Event-Driven Simulation)
HISTORICAL_EVENTS = [
    {
        "title": "US Judge rules XRP is not a security in landmark SEC case against Ripple.",
        "date_str": "2023-07-13T14:30:00Z", # Огромный памп XRP
        "source": "Historical News",
        "is_panic": False
    },
    {
        "title": "SEC sues Binance and CEO CZ for operating unregistered securities exchange.",
        "date_str": "2023-06-05T15:00:00Z", # Огромный обвал BNB и рынка
        "source": "Historical News",
        "is_panic": False
    },
    {
        "title": "Binance CEO CZ steps down, pleads guilty to charges. Exchange fine is $4.3B.",
        "date_str": "2023-11-21T20:00:00Z", # Волатильность BNB
        "source": "Historical News",
        "is_panic": False
    }
]

def calculate_pnl(symbol, action, entry_price, timestamp_ms):
    """
    Эмулятор проверки профита на исторических графиках в будущем.
    Скачивает свечи за 24 часа ПОСЛЕ новости и ищет касания SL и TP.
    """
    print(f"   ⏱️ Эмуляция виртуальной сделки {action} по цене {entry_price}$...")
    
    # Расчет TP и SL
    if action == 'LONG':
        tp_price = entry_price * (1 + (TAKE_PROFIT_PERCENT / 100.0))
        sl_price = entry_price * (1 - (STOP_LOSS_PERCENT / 100.0))
    elif action == 'SHORT':
        tp_price = entry_price * (1 - (TAKE_PROFIT_PERCENT / 100.0))
        sl_price = entry_price * (1 + (STOP_LOSS_PERCENT / 100.0))
    else:
        return {"status": "IGNORED", "pnl": 0}

    # Скачиваем 96 свечей по 15м = ровно 24 часа в будущее
    try:
        future_candles = exchange.fetch_ohlcv(symbol, '15m', since=timestamp_ms, limit=96)
    except Exception as e:
        print(f"ОШИБКА загрузки истории будущего: {e}")
        return {"status": "ERROR", "pnl": 0}
        
    for candle in future_candles:
        # candle format: [timestamp, open, high, low, close, volume]
        high = candle[2]
        low = candle[3]
        
        if action == 'LONG':
            # Логика Лонга: сперва проверяем лоу (не выбило ли по стопу)
            if low <= sl_price:
                return {"status": "STOP_LOSS", "pnl": -STOP_LOSS_PERCENT}
            if high >= tp_price:
                return {"status": "TAKE_PROFIT", "pnl": TAKE_PROFIT_PERCENT}
                
        elif action == 'SHORT':
            # Логика Шорта: проверяем хай (не выбило ли по стопу вверх)
            if high >= sl_price:
                return {"status": "STOP_LOSS", "pnl": -STOP_LOSS_PERCENT}
            if low <= tp_price:
                return {"status": "TAKE_PROFIT", "pnl": TAKE_PROFIT_PERCENT}

    # Если за 24 часа не сработал ни TP, ни SL, закрываем сделку в ноль или по рынку
    last_close = future_candles[-1][4]
    if action == 'LONG':
        pnl = ((last_close - entry_price) / entry_price) * 100
    else:
        pnl = ((entry_price - last_close) / entry_price) * 100
        
    return {"status": "TIMEOUT_24H", "pnl": round(pnl, 2)}

def run_backtest():
    print("==============================================")
    print("🚀 ВАШ ИСТОРИЧЕСКИЙ БЭКТЕСТ ЗАПУЩЕН")
    print("==============================================\n")
    
    total_trades = 0
    winning_trades = 0
    total_pnl = 0.0
    
    for event in HISTORICAL_EVENTS:
        print(f"\n📰 Событие: {event['title']}")
        print(f"📅 Дата: {event['date_str']}")
        
        # Переводим дату в миллисекунды (Timestamp)
        dt = datetime.datetime.strptime(event['date_str'], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
        timestamp_ms = int(dt.timestamp() * 1000)
        
        # Инжектируем время в новость, чтобы decision_maker искал китов именно в тот день
        event['timestamp_ms'] = timestamp_ms
        
        print("🤖 Анализ Клода и Проверка Биржи...")
        signal = generate_signal(event)
        
        if signal and signal['action'] in ["LONG", "SHORT"]:
            total_trades += 1
            coin = signal['coin']
            symbol = f"{coin}/USDT"
            action = signal['action']
            score = signal['total_score']
            
            print(f"   🔥 СИГНАЛ БОТА: {action} {coin} (Оценка: {score} баллов)")
            
            # Чтобы узнать цену входа, скачаем одну историческую свечку на тот момент
            ohlcv = exchange.fetch_ohlcv(symbol, '1m', params={'endTime': timestamp_ms}, limit=1)
            entry_price = ohlcv[0][4]
            
            result = calculate_pnl(symbol, action, entry_price, timestamp_ms)
            
            pnl = result['pnl']
            total_pnl += pnl
            
            if pnl > 0:
                winning_trades += 1
                color = "✅"
            else:
                color = "❌"
                
            print(f"   {color} ИТОГ СДЕЛКИ: {result['status']} | Прибыль: {pnl}%")
            
        else:
            print("   💤 Итог: Сигнал отклонен (Алгоритм спас нас от плохой/слабой сделки).")
            
        # Пауза, чтобы не дудосить API Binance
        time.sleep(1)
        
    print("\n==============================================")
    print("📊 ИТОГОВЫЙ ОТЧЕТ БЭКТЕСТА")
    print(f"Количество сделок: {total_trades}")
    if total_trades > 0:
        winrate = (winning_trades / total_trades) * 100
        print(f"Winrate: {winrate:.1f}%")
        print(f"Чистый PnL: {total_pnl:.2f}% (без учета плеча)")
        print(f"Чистый PnL с твоим плечом (x3): {total_pnl * 3:.2f}%")
    print("==============================================")

if __name__ == "__main__":
    run_backtest()
