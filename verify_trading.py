import ccxt
import os
import sys
from config.settings import BYBIT_API_KEY, BYBIT_SECRET, USE_TESTNET

def test_trade_permissions():
    print(f"--- Тест торговых прав (Testnet={USE_TESTNET}) ---")
    
    exchange = ccxt.bybit({
        'apiKey': BYBIT_API_KEY,
        'secret': BYBIT_SECRET,
        'options': {'defaultType': 'swap'}
    })
    
    if USE_TESTNET:
        exchange.set_sandbox_mode(True)
    
    symbol = "BTC/USDT:USDT"
    
    try:
        # 1. Пробуем изменить плечо (это требует прав на торговлю)
        print(f"1. Пробую выставить плечо x3 для {symbol}...")
        try:
            exchange.set_leverage(3, symbol)
            print("✅ Плечо успешно установлено!")
        except Exception as e:
            print(f"⚠️ Плечо (может быть уже установлено): {e}")

        # 2. Пробуем создать тестовый мини-ордер (Market)
        # Мы используем минимально возможный объем
        print(f"\n2. Пробую создать тестовый ордер (Buy Market)...")
        # Для BTC минималка обычно 0.001 или 0.01
        order = exchange.create_order(
            symbol=symbol,
            type='market',
            side='buy',
            amount=0.001,
            params={'category': 'linear'}
        )
        print(f"✅ УСПЕХ! Ордер создан, ID: {order.get('id')}")
        
        # 3. Сразу закрываем его (продаем обратно)
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
