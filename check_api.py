import ccxt
from config.settings import BYBIT_API_KEY, BYBIT_SECRET, USE_TESTNET

def test_api():
    print(f"Testing Bybit API (Testnet: {USE_TESTNET})...")
    
    exchange = ccxt.bybit({
        'apiKey': BYBIT_API_KEY,
        'secret': BYBIT_SECRET,
        'enableRateLimit': True,
        'options': {'defaultType': 'swap'},
    })
    
    if USE_TESTNET:
        exchange.set_sandbox_mode(True)
    
    try:
        balance = exchange.fetch_balance()
        print("✅ Connection Successful!")
        print(f"Total USDT: {balance.get('USDT', {}).get('total', 'N/A')}")
        print(f"Free USDT: {balance.get('USDT', {}).get('free', 'N/A')}")
    except Exception as e:
        print(f"❌ Connection Failed: {e}")

if __name__ == "__main__":
    test_api()
