import ccxt
from modules.trader import resolve_market_symbol
from config.settings import BYBIT_API_KEY, BYBIT_SECRET, USE_TESTNET

def test_resolution():
    print(f"Testing Symbol Resolution (Testnet: {USE_TESTNET})...")
    
    exchange = ccxt.bybit({
        'apiKey': BYBIT_API_KEY,
        'secret': BYBIT_SECRET,
        'enableRateLimit': True,
        'options': {'defaultType': 'swap'},
    })
    
    if USE_TESTNET:
        exchange.set_sandbox_mode(True)
    
    test_cases = ["BTC", "TAO", "WLFI", "NONEXISTENT"]
    
    for coin in test_cases:
        resolved = resolve_market_symbol(exchange, coin)
        print(f"Coin: {coin:12} -> Resolved Symbol: {resolved}")

if __name__ == "__main__":
    test_resolution()
