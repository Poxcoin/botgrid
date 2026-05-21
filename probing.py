import ccxt
import os
import sys
# Добавляем путь к конфигам
sys.path.append('/root/bot_grid')
from config.settings import BYBIT_API_KEY, BYBIT_SECRET

def probe():
    print(f"Ключ: {BYBIT_API_KEY[:5]}...{BYBIT_API_KEY[-3:]}")
    print(f"Секрет: {BYBIT_SECRET[:5]}...{BYBIT_SECRET[-3:]}")
    
    keys = {'apiKey': BYBIT_API_KEY, 'secret': BYBIT_SECRET}
    
    print('\n--- ТЕСТ 1: TESTNET (sandbox=True) ---')
    try:
        ex = ccxt.bybit(keys)
        ex.set_sandbox_mode(True)
        # Пробуем получить время сервера (это не требует подписи)
        server_time = ex.fetch_time()
        print(f" Связь с Testnet есть! Время: {server_time}")
        # Пробуем баланс (это требует подписи)
        bal = ex.fetch_balance({'accountType': 'unified'})
        print(f" ПОДПИСЬ ПРИНЯТА! Баланс: {bal.get('USDT', {}).get('total', 0)} USDT")
    except Exception as e:
        print(f" ТЕСТ 1 ПРОВАЛЕН: {e}")

    print('\n--- ТЕСТ 2: DEMO/MAINNET (sandbox=False) ---')
    try:
        ex = ccxt.bybit(keys)
        server_time = ex.fetch_time()
        print(f" Связь с Mainnet есть! Время: {server_time}")
        bal = ex.fetch_balance({'accountType': 'unified'})
        print(f" ПОДПИСЬ ПРИНЯТА! Баланс: {bal.get('USDT', {}).get('total', 0)} USDT")
    except Exception as e:
        print(f" ТЕСТ 2 ПРОВАЛЕН: {e}")

if __name__ == "__main__":
    probe()
