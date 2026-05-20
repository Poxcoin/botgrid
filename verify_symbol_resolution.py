import ccxt
from modules.trader import resolve_market_symbol
from config.settings import BYBIT_API_KEY, BYBIT_SECRET, IS_DEMO_TRADING

def test_resolution():
    mode = "Demo" if IS_DEMO_TRADING else "Live"
    print(f"Testing Symbol Resolution ({mode})...")

    exchange = ccxt.bybit({
        'apiKey': BYBIT_API_KEY,
        'secret': BYBIT_SECRET,
        'enableRateLimit': True,
        'options': {'defaultType': 'swap'},
    })

    if IS_DEMO_TRADING:
        exchange.urls['api'] = exchange.urls['demotrading']

    test_cases = ["BTC", "TAO", "WLFI", "NONEXISTENT"]

    for coin in test_cases:
        resolved = resolve_market_symbol(exchange, coin)
        print(f"Coin: {coin:12} -> Resolved Symbol: {resolved}")

if __name__ == "__main__":
    test_resolution()
