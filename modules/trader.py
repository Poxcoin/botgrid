import ccxt
from config.settings import (
    BYBIT_API_KEY,
    BYBIT_SECRET,
    USE_TESTNET,
    TRADE_PERCENT_SIZE,
    LEVERAGE,
    TAKE_PROFIT_PERCENT,
    STOP_LOSS_PERCENT,
    TG_CHAT_ID,
    IS_DEMO_TRADING,
)
from modules.tg_notifier import send_telegram_message
from typing import Dict, Any


def resolve_market_symbol(exchange: ccxt.Exchange, coin: str) -> str:
    """Find the correct market symbol for a coin on the exchange.
    
    Prefers Linear Perpetuals (Swap) and handles different naming conventions.
    Returns None if no matching USDT market is found.
    """
    exchange.load_markets()
    coin = coin.upper()
    
    # 1. Standard Linear Perpetual format (highly recommended for Bybit/ccxt)
    symbol_perp = f"{coin}/USDT:USDT"
    if symbol_perp in exchange.markets:
        return symbol_perp
        
    # 2. Standard Spot/Future format
    symbol_standard = f"{coin}/USDT"
    if symbol_standard in exchange.markets:
        return symbol_standard
        
    # 3. Fuzzy search by base currency
    for symbol, market in exchange.markets.items():
        if market.get("base") == coin and market.get("quote") == "USDT":
            # Prefer active markets
            if market.get("active", True):
                return symbol
    
    return None


def get_free_usdt(exchange: ccxt.Exchange) -> float:
    """Universal balance fetcher for Bybit V5.
    Scans all account types to find USDT.
    """
    try:
        # 1. Пробуем Unified (самый частый вариант)
        try:
            balance = exchange.fetch_balance({'accountType': 'unified'})
            if "USDT" in balance and balance["USDT"].get("total", 0) > 0:
                return float(balance["USDT"].get("free", balance["USDT"]["total"]))
        except:
            pass

        # 2. Пробуем Contract/Regular
        try:
            balance = exchange.fetch_balance({'accountType': 'contract'})
            if "USDT" in balance and balance["USDT"].get("total", 0) > 0:
                return float(balance["USDT"].get("free", balance["USDT"]["total"]))
        except:
            pass

        # 3. Крайний вариант - стандартный запрос
        balance = exchange.fetch_balance()
        if "USDT" in balance:
            return float(balance["USDT"].get("free", balance["USDT"].get("total", 0.0)))

        return 0.0
    except Exception as e:
        print(f"❌ Ошибка получения баланса: {e}")
        return 0.0


def execute_trade(signal: Dict[str, Any]) -> None:
    """Execute a market order on Bybit based on the provided signal.

    Parameters
    ----------
    signal: dict
        Expected keys: ``coin``, ``action`` (LONG/SHORT), ``total_score``.
    """
    coin = signal["coin"]
    action = signal["action"]
    score = signal["total_score"]

    print(f"\n⚡ ИСПОЛНЯЕМ СДЕЛКУ: {action} {coin} (Оценка: {score})")

    # Initialise Bybit client with time sync options
    exchange = ccxt.bybit({
        "apiKey": BYBIT_API_KEY,
        "secret": BYBIT_SECRET,
        "enableRateLimit": True,
        "options": {
            "defaultType": "swap",
            "adjustForTimeDifference": True, # Авто-синхронизация времени
            "recvWindow": 10000             # Окно задержки 10 секунд
        },
    })

    # Redirect to Demo Trading host if enabled
    if IS_DEMO_TRADING:
        exchange.urls['api'] = {
            'public': 'https://api-demo.bybit.com',
            'private': 'https://api-demo.bybit.com',
        }

    # Use sandbox mode for development if enabled
    if USE_TESTNET:
        exchange.set_sandbox_mode(True)

    # -------------------------------------------------
    # 0️⃣ Resolve and validate market symbol
    # -------------------------------------------------
    symbol = resolve_market_symbol(exchange, coin)
    if not symbol:
        print(f"⚠️ ПРОПУСК: Монета {coin} не найдена на бирже (USDT маркет).")
        return

    try:
        # Current market price
        ticker = exchange.fetch_ticker(symbol)
        current_price = ticker["last"]

        # -------------------------------------------------
        # 1️⃣ Set leverage
        # -------------------------------------------------
        try:
            exchange.set_leverage(LEVERAGE, symbol, params={'category': 'linear'})
        except Exception as e:
            print(f"⚠️ Плечо: {e}")

        # -------------------------------------------------
        # 2️⃣ Calculate position size
        # -------------------------------------------------
        free_usdt = get_free_usdt(exchange)
        if free_usdt <= 0:
            print("❌ Нет средств на балансе!")
            return

        # Use size multiplier from signal if available
        size_mult = signal.get("size_multiplier", 1.0)
        usdt_to_risk = free_usdt * (TRADE_PERCENT_SIZE / 100.0) * size_mult
        position_usd = usdt_to_risk * LEVERAGE

        # Load market data before precision calculations
        exchange.load_markets()
        amount = float(
            exchange.amount_to_precision(symbol, position_usd / current_price)
        )

        # -------------------------------------------------
        # 3️⃣ Compute TP and SL prices
        # -------------------------------------------------
        if action.upper() == "LONG":
            side = "buy"
            tp_price = current_price * (1 + TAKE_PROFIT_PERCENT / 100)
            sl_price = current_price * (1 - STOP_LOSS_PERCENT / 100)
        else:  # SHORT
            side = "sell"
            tp_price = current_price * (1 - TAKE_PROFIT_PERCENT / 100)
            sl_price = current_price * (1 + STOP_LOSS_PERCENT / 100)

        # Apply exchange‑specific precision
        tp_price = float(exchange.price_to_precision(symbol, tp_price))
        sl_price = float(exchange.price_to_precision(symbol, sl_price))

        # -------------------------------------------------
        # 4️⃣ Place market order with TP / SL
        # -------------------------------------------------
        order = exchange.create_order(
            symbol,
            "market",
            side,
            amount,
            params={
                "takeProfit": tp_price, 
                "stopLoss": sl_price,
                "category": "linear"
            },
        )

        print(f"✅ ОРДЕР ИСПОЛНЕН! ID: {order.get('id', 'unknown')}")

        # -------------------------------------------------
        # 5️⃣ Send Telegram notification
        # -------------------------------------------------
        msg = (
            f"🚀 <b>СИГНАЛ ИСПОЛНЕН!</b>\n"
            f"<b>Монета:</b> #{coin}\n"
            f"<b>Тип:</b> {action} (Плечо x{LEVERAGE})\n"
            f"<b>Оценка ИИ:</b> {score} баллов\n"
            f"<b>Вход:</b> {current_price}$\n"
            f"<b>Take Profit:</b> {tp_price}$\n"
            f"<b>Stop Loss:</b> {sl_price}$"
        )
        send_telegram_message(msg, TG_CHAT_ID)

    except Exception as e:
        print(f"❌ ОШИБКА СДЕЛКИ: {e}")
        error_msg = (
            f"🚨 <b>ОШИБКА!</b>\n"
            f"Монета: {coin}\n"
            f"Ошибка: {e}"
        )
        send_telegram_message(error_msg, TG_CHAT_ID)
