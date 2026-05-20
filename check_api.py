import ccxt
from config.settings import BYBIT_API_KEY, BYBIT_SECRET, IS_DEMO_TRADING

def test_api():
    mode = "Demo" if IS_DEMO_TRADING else "Live"
    print(f"Testing Bybit API ({mode})...")

    exchange = ccxt.bybit({
        'apiKey': BYBIT_API_KEY,
        'secret': BYBIT_SECRET,
        'enableRateLimit': True,
        'options': {'defaultType': 'swap'},
    })

    if IS_DEMO_TRADING:
        exchange.urls['api'] = exchange.urls['demotrading']

    try:
        balance = exchange.fetch_balance()
        print("✅ Connection Successful!")
        print(f"Total USDT: {balance.get('USDT', {}).get('total', 'N/A')}")
        print(f"Free USDT: {balance.get('USDT', {}).get('free', 'N/A')}")
    except Exception as e:
        print(f"❌ Connection Failed: {e}")

if __name__ == "__main__":
    test_api()
