import ccxt
import os
import sys
from config.settings import BYBIT_API_KEY, BYBIT_SECRET, IS_DEMO_TRADING

def test_trade_permissions():
    mode = "Demo" if IS_DEMO_TRADING else "Live"
    print(f"--- Тест торговых прав ({mode}) ---")

    exchange = ccxt.bybit({
        'apiKey': BYBIT_API_KEY,
        'secret': BYBIT_SECRET,
        'options': {'defaultType': 'swap'}
    })

    if IS_DEMO_TRADING:
        exchange.urls['api'] = exchange.urls['demotrading']

    symbol = "BTC/USDT:USDT"

    try:
        print(f"1. Пробую выставить плечо x3 для {symbol}...")
        try:
            exchange.set_leverage(3, symbol)
            print("✅ Плечо успешно установлено!")
        except Exception as e:
            print(f"⚠️ Плечо (може бути вже встановлено): {e}")

        print(f"\n2. Пробую создать тестовый ордер (Buy Market)...")
        order = exchange.create_order(
            symbol=symbol,
            type='market',
            side='buy',
            amount=0.001,
            params={'category': 'linear'}
        )
        print(f"✅ УСПЕХ! Ордер создан, ID: {order.get('id')}")

        print(f"\n3. Закрываю тестовый ордер...")
        close_order = exchange.create_order(
            symbol=symbol,
            type='market',
            side='sell',
            amount=0.001,
            params={'category': 'linear'}
        )
        print(f"✅ УСПЕХ! Тестовая позиция закрыта.")

    except Exception as e:
        print(f"\n❌ КРИТИЧЕСКАЯ ОШИБКА ПРАВ: {e}")
        print("\nЧто делать?")
        if "Permission denied" in str(e) or "API key" in str(e):
            print("- Проверьте IP Whitelist в настройках Bybit (добавьте 159.69.110.239)")
            print("- Включите галочки 'Trade' и 'Orders' в настройках API ключа")
        elif "balance" in str(e).lower():
            print("- Недостаточно средств на аккаунте Unified!")

if __name__ == "__main__":
    test_trade_permissions()
