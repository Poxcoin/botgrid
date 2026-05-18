import os
import time
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
from modules import daily_guard, position_monitor
from modules.analytics_db import save_trade, mark_signal_executed
from typing import Dict, Any

# DRY_RUN=True — логирует сделки без отправки на биржу (для тестов без ключей)
DRY_RUN = os.getenv("DRY_RUN", "False").lower() == "true"

# Максимум одновременных открытых позиций (оба бота суммарно)
MAX_CONCURRENT_POSITIONS = 5

# Минимальный size_multiplier для входа (слабый сигнал → пропускаем)
MIN_SIZE_MULTIPLIER = 0.7

# Коды ошибок Bybit которые стоит повторить (транзитные сбои)
# 10010 = Unmatched IP (кратковременная смена маршрутизации)
# 10001 = Internal server timeout
_RETRYABLE_ERRORS = ("10010", "10001")
_RETRY_DELAY_SEC  = 4
_MAX_RETRIES      = 2


def _exchange_call(fn, *args, **kwargs):
    """
    Вызывает API биржи с авто-повтором при транзитных ошибках Bybit.
    При 10010 (IP mismatch) пересоздаёт соединение и повторяет.
    """
    for attempt in range(_MAX_RETRIES + 1):
        try:
            return fn(*args, **kwargs)
        except Exception as e:
            is_retryable = any(code in str(e) for code in _RETRYABLE_ERRORS)
            if is_retryable and attempt < _MAX_RETRIES:
                print(f"⚠️ Bybit транзитная ошибка ({e}) — повтор {attempt + 1}/{_MAX_RETRIES}...")
                time.sleep(_RETRY_DELAY_SEC)
            else:
                raise


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
    """Universal balance fetcher for Bybit V5 (Unified / Contract / Demo / per-user)."""
    def _parse_v5_wallet(account_type: str) -> float | None:
        try:
            r = exchange.private_get_v5_account_wallet_balance(params={'accountType': account_type})
            coins = r.get('result', {}).get('list', [{}])[0].get('coin', [])
            for c in coins:
                if c.get('coin') == 'USDT':
                    v = float(c.get('availableToWithdraw') or c.get('walletBalance') or 0)
                    if v > 0:
                        return v
        except Exception:
            pass
        return None

    try:
        # 1. Try UNIFIED (works for live + some demo accounts)
        v = _parse_v5_wallet('UNIFIED')
        if v is not None:
            return v

        # 2. Try CONTRACT (Bybit Demo Trading uses contract account)
        v = _parse_v5_wallet('CONTRACT')
        if v is not None:
            return v

        # 3. ccxt fallback chain
        for acct in ({'accountType': 'unified'}, {'accountType': 'contract'}, {}):
            try:
                balance = exchange.fetch_balance(acct) if acct else exchange.fetch_balance()
                if "USDT" in balance and balance["USDT"].get("total", 0) > 0:
                    return float(balance["USDT"].get("free", balance["USDT"]["total"]))
            except Exception:
                pass

        return 0.0
    except Exception as e:
        print(f"❌ Ошибка получения баланса: {e}")
        return 0.0


def _init_exchange() -> ccxt.Exchange:
    """Створює та налаштовує об'єкт біржі. Markets завантажуються одразу."""
    exchange = ccxt.bybit({
        "apiKey": BYBIT_API_KEY,
        "secret": BYBIT_SECRET,
        "enableRateLimit": True,
        "options": {
            "defaultType": "linear",
            "adjustForTimeDifference": True,
            "recvWindow": 10000,
        },
    })
    if IS_DEMO_TRADING:
        exchange.urls['api'] = exchange.urls['demotrading']
        exchange.options['defaultType'] = 'linear'
        # Bybit Demo не підтримує /v5/asset/coin/query-info → 10032 всередині load_markets()
        exchange.has['fetchCurrencies'] = False
    if USE_TESTNET:
        exchange.urls['api'] = {
            'public': 'https://api-testnet.bybit.com',
            'private': 'https://api-testnet.bybit.com',
        }
        exchange.set_sandbox_mode(True)
    # Markets потрібні для market_id() та інших symbol lookups.
    # fetchCurrencies вже відключено вище, тому load_markets() безпечний на Demo.
    exchange.load_markets()
    return exchange


def _init_exchange_for_user(api_key: str, secret: str, is_demo: bool = False) -> ccxt.Exchange:
    """Exchange для конкретного користувача з його API ключами."""
    exchange = ccxt.bybit({
        "apiKey": api_key,
        "secret": secret,
        "enableRateLimit": True,
        "options": {
            "defaultType": "linear",
            "adjustForTimeDifference": True,
            "recvWindow": 10000,
        },
    })
    exchange.has['fetchCurrencies'] = False
    if is_demo:
        exchange.urls['api'] = exchange.urls['demotrading']
    exchange.load_markets()
    return exchange


def has_open_position(exchange: ccxt.Exchange, symbol: str) -> bool:
    """Перевіряє наявність відкритої позиції по символу (живий API-запит).

    Fallback-ієрархія при помилці API:
      1. Перевіряємо локальний position_monitor tracker (файл на диску)
      2. Якщо і tracker недоступний — дозволяємо вхід з попередженням
         (дубль-позиція краще ніж пропущений сигнал; дублі фільтруються TP/SL)
    """
    try:
        market_id = exchange.market_id(symbol)  # безпечно: markets завантажено в _init_exchange
        r = exchange.private_get_v5_position_list(params={
            'category': 'linear',
            'symbol': market_id,
        })
        for pos in r.get('result', {}).get('list', []):
            if abs(float(pos.get('size') or 0)) > 0:
                return True
        return False

    except Exception as api_err:
        print(f"[has_open_position] ⚠️ Живий API-запит не вдався для {symbol}: {api_err}")
        # Fallback 1: перевіряємо локальний tracker
        try:
            from modules.position_monitor import _load_tracked
            tracked = _load_tracked()
            is_tracked = symbol in tracked
            print(
                f"[has_open_position] Tracker fallback: {symbol} "
                f"{'знайдено — блокуємо' if is_tracked else 'не знайдено — дозволяємо'}"
            )
            return is_tracked
        except Exception as tracker_err:
            # Fallback 2: дозволяємо вхід — дубль менш шкідливий ніж заблокований сигнал
            print(
                f"[has_open_position] ⚠️ Tracker також недоступний ({tracker_err}) "
                f"— дозволяємо вхід для {symbol}"
            )
            return False


def close_all_positions(signal: Dict[str, Any] = None) -> None:
    """
    Экстренное закрытие ВСЕХ открытых позиций.
    Вызывается при сигнале SELL_ALL (глобальная паника).
    """
    print("\n🚨 ЭКСТРЕННОЕ ЗАКРЫТИЕ ВСЕХ ПОЗИЦИЙ...")
    exchange = _init_exchange()

    try:
        positions = exchange.fetch_positions(params={'category': 'linear'})
        active = [p for p in positions if abs(float(p.get('contracts') or 0)) > 0]

        if not active:
            print("   ℹ️ Открытых позиций нет.")
            return

        for pos in active:
            coin_symbol = pos['symbol']
            contracts = abs(float(pos['contracts']))
            side = 'sell' if pos['side'] == 'long' else 'buy'

            print(f"   🔴 Закрываю {pos['side'].upper()} {coin_symbol} ({contracts} контрактов)...")
            try:
                exchange.create_order(
                    coin_symbol, 'market', side, contracts,
                    params={'category': 'linear', 'reduceOnly': True}
                )
                print(f"   ✅ {coin_symbol} закрыта!")
            except Exception as e:
                print(f"   ❌ Ошибка при закрытии {coin_symbol}: {e}")

        msg = "🚨 <b>ПАНИКА! Все позиции закрыты!</b>"
        if signal:
            msg += f"\n<b>Причина:</b> {signal.get('news_title', 'Макро-кризис')}"
        send_telegram_message(msg, TG_CHAT_ID)

    except Exception as e:
        print(f"❌ Ошибка SELL_ALL: {e}")


def execute_trade(
    signal: Dict[str, Any],
    tp_pct: float = None,
    sl_pct: float = None,
    leverage_override: int = None,
    size_pct: float = None,
    signal_id: int = None,
    bot_source: str = "news",
    use_maker: bool = False,
    close_after_min: int | None = None,
) -> None:
    """Execute a market order on Bybit based on the provided signal.

    Parameters
    ----------
    signal: dict
        Expected keys: ``coin``, ``action`` (LONG/SHORT), ``total_score``.
    tp_pct, sl_pct, leverage_override, size_pct:
        Опциональные переопределения параметров (для рискового бота).
    """
    coin = signal["coin"]
    action = signal["action"]
    score = signal["total_score"]

    _tp  = tp_pct          if tp_pct          is not None else TAKE_PROFIT_PERCENT
    _sl  = sl_pct          if sl_pct          is not None else STOP_LOSS_PERCENT
    _lev = leverage_override if leverage_override is not None else LEVERAGE
    _sz  = size_pct        if size_pct        is not None else TRADE_PERCENT_SIZE

    print(f"\n⚡ ИСПОЛНЯЕМ СДЕЛКУ: {action} {coin} (Оценка: {score})")

    # ─── Проверка 1: size_multiplier — слабый сигнал не торгуем ─────────────
    size_mult_check = signal.get("size_multiplier", 1.0)
    if size_mult_check < MIN_SIZE_MULTIPLIER:
        print(f"⚠️ ПРОПУСК: size_multiplier={size_mult_check} < {MIN_SIZE_MULTIPLIER} — сигнал слишком слабый")
        return

    # ─── Проверка 2: лимит параллельных позиций ──────────────────────────────
    open_count = position_monitor.get_tracked_count()
    if open_count >= MAX_CONCURRENT_POSITIONS:
        print(f"⚠️ ПРОПУСК: {open_count} открытых позиций — достигнут лимит {MAX_CONCURRENT_POSITIONS}")
        return

    # DRY_RUN — симулируем сделку без отправки на биржу
    if DRY_RUN:
        print(f"🧪 DRY_RUN режим — сделка симулирована, на биржу не отправлена")
        signal["simulated"] = True
        msg = (
            f"🧪 <b>DRY RUN — СИГНАЛ СИМУЛИРОВАН</b>\n"
            f"<b>Монета:</b> #{coin}\n"
            f"<b>Тип:</b> {action}\n"
            f"<b>Оценка:</b> {score}"
        )
        send_telegram_message(msg, TG_CHAT_ID)
        return

    exchange = _init_exchange()

    # ─── Проверка 3: дневной лимит убытков ───────────────────────────────────
    free_check = get_free_usdt(exchange)
    if not daily_guard.check(free_check):
        dg = daily_guard.get_status(free_check)
        msg = (
            f"🛑 <b>Торговля остановлена — дневной лимит убытков</b>\n"
            f"Потеряно {dg['loss_pct']:.1f}% за сегодня (лимит {daily_guard.MAX_DAILY_LOSS_PCT}%)\n"
            f"Возобновится в UTC 00:00"
        )
        print(f"⚠️ ПРОПУСК: дневной лимит убытков исчерпан ({dg['loss_pct']:.1f}%)")
        send_telegram_message(msg, TG_CHAT_ID)
        return

    try:
        # -------------------------------------------------
        # 0️⃣ Resolve and validate market symbol
        # -------------------------------------------------
        symbol = resolve_market_symbol(exchange, coin)
        if not symbol:
            print(f"⚠️ ПРОПУСК: Монета {coin} не найдена на бирже (USDT маркет).")
            return

        # -------------------------------------------------
        # 0.5️⃣ Проверяем — нет ли уже открытой позиции по этой монете
        # -------------------------------------------------
        if has_open_position(exchange, symbol):
            print(f"⚠️ ПРОПУСК: Позиция по {coin} уже открыта. Дубль заблокирован.")
            return

        # Current market price
        ticker = exchange.fetch_ticker(symbol)
        current_price = ticker["last"]

        # -------------------------------------------------
        # 1️⃣ Set leverage
        # -------------------------------------------------
        try:
            _exchange_call(exchange.set_leverage, _lev, symbol, params={'category': 'linear'})
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
        usdt_to_risk = free_usdt * (_sz / 100.0) * size_mult
        position_usd = usdt_to_risk * _lev

        # Load market data before precision calculations
        exchange.load_markets()
        amount = float(
            exchange.amount_to_precision(symbol, position_usd / current_price)
        )

        # Половина позиции для Partial TP (50% фиксируем на TP, остаток на trailing)
        _min_qty = (exchange.markets.get(symbol) or {}).get("limits", {}).get("amount", {}).get("min") or 0
        half_amount = float(exchange.amount_to_precision(symbol, amount * 0.5))
        use_partial_tp = not IS_DEMO_TRADING and half_amount >= _min_qty and half_amount > 0

        # -------------------------------------------------
        # 3️⃣ Compute TP and SL prices
        # -------------------------------------------------
        if action.upper() == "LONG":
            side = "buy"
            tp_price = current_price * (1 + _tp / 100)
            sl_price = current_price * (1 - _sl / 100)
        else:  # SHORT
            side = "sell"
            tp_price = current_price * (1 - _tp / 100)
            sl_price = current_price * (1 + _sl / 100)

        # Apply exchange‑specific precision
        tp_price = float(exchange.price_to_precision(symbol, tp_price))
        sl_price = float(exchange.price_to_precision(symbol, sl_price))

        # -------------------------------------------------
        # 4️⃣ Place market order (без TP/SL — Demo не підтримує inline)
        # -------------------------------------------------
        if use_maker and not IS_DEMO_TRADING:
            # Try PostOnly limit at current price — saves ~0.035% taker fee
            try:
                limit_price = float(exchange.price_to_precision(symbol, current_price))
                maker_ord = _exchange_call(
                    exchange.create_order,
                    symbol, "limit", side, amount, limit_price,
                    params={"category": "linear", "positionIdx": 0, "timeInForce": "PostOnly"},
                )
                # Wait up to 3s for fill
                order = None
                for _ in range(6):
                    time.sleep(0.5)
                    o = exchange.fetch_order(maker_ord["id"], symbol, params={"category": "linear"})
                    if float(o.get("filled") or 0) >= amount * 0.99:
                        order = o
                        print(f"✅ Maker fill @ {o.get('average', limit_price)} (saved taker fee)")
                        break
                if order is None:
                    try:
                        exchange.cancel_order(maker_ord["id"], symbol, params={"category": "linear"})
                    except Exception:
                        pass
                    print(f"⚠️ Maker not filled in 3s — falling back to market")
                    order = _exchange_call(
                        exchange.create_order, symbol, "market", side, amount,
                        params={"category": "linear", "positionIdx": 0},
                    )
            except Exception as _me:
                print(f"⚠️ Maker order failed ({_me}) — using market")
                order = _exchange_call(
                    exchange.create_order, symbol, "market", side, amount,
                    params={"category": "linear", "positionIdx": 0},
                )
        else:
            order = _exchange_call(
                exchange.create_order,
                symbol,
                "market",
                side,
                amount,
                params={
                    "category": "linear",
                    "positionIdx": 0,
                },
            )

        real_order_id = order.get('id', 'unknown')
        print(f"✅ ОРДЕР ИСПОЛНЕН! ID: {real_order_id}")

        # -------------------------------------------------
        # 4.5️⃣ Set TP/SL separately (сумісно з Demo та Live)
        # -------------------------------------------------
        # Перераховуємо TP/SL від реальної ціни виконання (не стейл ticker)
        fill_price = float(order.get('average') or order.get('price') or current_price)

        # Зберігаємо відкриту угоду в analytics.db + позначаємо сигнал виконаним
        try:
            from datetime import datetime, timezone
            ts_open = datetime.now(timezone.utc).isoformat()
            save_trade(signal_id, coin, action, fill_price, ts_open, bot_source=bot_source)
            if signal_id:
                mark_signal_executed(signal_id, str(real_order_id))
        except Exception as e:
            print(f"[analytics] save_trade error: {e}")

        if action.upper() == "LONG":
            tp_price = float(exchange.price_to_precision(symbol, fill_price * (1 + _tp / 100)))
            sl_price = float(exchange.price_to_precision(symbol, fill_price * (1 - _sl / 100)))
        else:
            tp_price = float(exchange.price_to_precision(symbol, fill_price * (1 - _tp / 100)))
            sl_price = float(exchange.price_to_precision(symbol, fill_price * (1 + _sl / 100)))

        market_id = exchange.market_id(symbol)

        _tp_params = {
            "category": "linear",
            "symbol": market_id,
            "positionIdx": 0,
            "takeProfit": str(tp_price),
            "stopLoss": str(sl_price),
            "tpTriggerBy": "LastPrice",
            "slTriggerBy": "MarkPrice",   # MarkPrice стабільніший — менше слiпажу при різких рухах
        }
        if use_partial_tp:
            _tp_params["tpslMode"] = "Partial"
            _tp_params["tpSize"]   = str(half_amount)
            _tp_label = f"50% ({half_amount}) при {tp_price}$"
        else:
            _tp_label = f"100% при {tp_price}$"

        _tp_sl_set = False
        try:
            exchange.private_post_v5_position_trading_stop(_tp_params)
            print(f"✅ TP/SL встановлено: TP={_tp_label} SL={sl_price} (fill={fill_price})")
            _tp_sl_set = True
        except Exception as e:
            _err = str(e)
            # 30208/30206 = TP ціна виходить за допустимий діапазон Bybit
            if "30208" in _err or "30206" in _err:
                # Retry 1: без partial TP (може проблема в tpslMode/tpSize)
                _plain_params = {
                    "category": "linear",
                    "symbol": market_id,
                    "positionIdx": 0,
                    "takeProfit": str(tp_price),
                    "stopLoss": str(sl_price),
                    "tpTriggerBy": "LastPrice",
                    "slTriggerBy": "MarkPrice",
                }
                try:
                    exchange.private_post_v5_position_trading_stop(_plain_params)
                    print(f"✅ TP/SL встановлено (без partial): TP={tp_price} SL={sl_price}")
                    _tp_sl_set = True
                except Exception as e2:
                    if "30208" in str(e2) or "30206" in str(e2):
                        # Retry 2: тільки SL — TP виходить за межу, але позиція має бути захищена
                        try:
                            exchange.private_post_v5_position_trading_stop({
                                "category": "linear",
                                "symbol": market_id,
                                "positionIdx": 0,
                                "takeProfit": "0",
                                "stopLoss": str(sl_price),
                                "slTriggerBy": "MarkPrice",
                            })
                            print(f"⚠️ TP скіпнуто (30208 — ціна поза межею), SL={sl_price} встановлено")
                            _tp_sl_set = True
                        except Exception as e3:
                            print(f"❌ TP/SL не вдалося навіть SL-only: {e3}")
                    else:
                        print(f"⚠️ TP/SL retry failed: {e2}")
            else:
                print(f"⚠️ TP/SL не вдалося встановити: {e}")

        # Якщо SL не вдалося встановити — закриваємо позицію ринковим ордером.
        # Краще зафіксувати невеликий слiпаж при відкритті, ніж тримати без захисту.
        if not _tp_sl_set:
            print(f"🚨 SL не встановлено для {coin} — аварійне закриття позиції")
            try:
                close_side = "sell" if action.upper() == "LONG" else "buy"
                exchange.create_order(
                    symbol, "market", close_side, amount,
                    params={"category": "linear", "reduceOnly": True},
                )
                print(f"✅ {coin} аварійно закрито (SL fail → immediate close)")
                send_telegram_message(
                    f"⚠️ <b>{coin} {action} — аварійне закриття</b>\n"
                    f"SL не вдалося встановити. Позиція закрита щоб уникнути великого збитку.",
                    TG_CHAT_ID
                )
                return
            except Exception as close_err:
                print(f"❌ Аварійне закриття {coin} провалилось: {close_err}")
                send_telegram_message(
                    f"🚨 <b>КРИТИЧНО: {coin} без SL!</b>\n"
                    f"TP/SL не встановлено і аварійне закриття провалилось.\n"
                    f"Закрий позицію вручну на Bybit.",
                    TG_CHAT_ID
                )

        # -------------------------------------------------
        # 4.6️⃣ Trailing stop (нативный Bybit)
        # Активируется после +1% движения в нашу сторону.
        # До активации позицию защищает обычный SL выше.
        # Demo не поддерживает trailingStop — пропускаем.
        # -------------------------------------------------
        if not IS_DEMO_TRADING:
            try:
                _btc_eth_coins = {"BTC", "ETH", "BITCOIN", "ETHEREUM"}
                trail_pct = 2.5 if coin.upper() in _btc_eth_coins else 3.0
                trail_dist = float(
                    exchange.price_to_precision(symbol, fill_price * trail_pct / 100.0)
                )
                if action.upper() == "LONG":
                    active_price = float(
                        exchange.price_to_precision(symbol, fill_price * 1.01)
                    )
                else:
                    active_price = float(
                        exchange.price_to_precision(symbol, fill_price * 0.99)
                    )
                exchange.private_post_v5_position_trading_stop({
                    "category": "linear",
                    "symbol": market_id,
                    "positionIdx": 0,
                    "trailingStop": str(trail_dist),
                    "activePrice": str(active_price),
                })
                print(f"✅ Trailing stop: {trail_pct}% дистанция, активируется при {active_price}")
            except Exception as e:
                print(f"⚠️ Trailing stop не установлен: {e}")

        # -------------------------------------------------
        # 4.5️⃣ Track position for position monitor
        # -------------------------------------------------
        position_monitor.track_open(symbol=symbol, action=action, entry_price=fill_price,
                                    close_after_min=close_after_min)

        # Сохраняем рыночный контекст для post-trade анализатора
        try:
            from modules.post_trade_analyzer import save_trade_context
            from modules.market_data import get_btc_2h_change
            _ctx = {
                "coin":         coin,
                "action":       action,
                "entry_price":  fill_price,
                "leverage":     _lev,
                "signal_score": score,
                "rsi":          signal.get("components", {}).get("rsi", 50),
                "funding_rate": signal.get("components", {}).get("funding_rate", 0.0),
                "news_age_min": signal.get("news_age_minutes"),
                "btc_2h_pct":   get_btc_2h_change(),
                "opened_at":    datetime.now(timezone.utc).isoformat(),
            }
            save_trade_context(symbol, _ctx)
        except Exception as _e:
            print(f"[analyzer] ⚠️ save_trade_context error: {_e}")

        # -------------------------------------------------
        # 5️⃣ Send Telegram notification
        # -------------------------------------------------
        confidence = signal.get("confidence", "?")
        tag = signal.get("bot_tag", "🚀")
        _btc_eth_coins_msg = {"BTC", "ETH", "BITCOIN", "ETHEREUM"}
        _trail_pct_msg = 2.5 if coin.upper() in _btc_eth_coins_msg else 3.0
        _trail_active_msg = fill_price * (1.01 if action.upper() == "LONG" else 0.99)
        _tp_line = (
            f"<b>TP1 (50%):</b> {tp_price}$ (+{_tp}%) → trailing {_trail_pct_msg}% на остаток"
            if use_partial_tp else
            f"<b>Take Profit:</b> {tp_price}$ (+{_tp}%)"
        )
        msg = (
            f"{tag} <b>СИГНАЛ ИСПОЛНЕН!</b>\n"
            f"<b>Монета:</b> #{coin}\n"
            f"<b>Тип:</b> {action} (Плечо x{_lev})\n"
            f"<b>Оценка ИИ:</b> {score} баллов\n"
            f"<b>Уверенность:</b> {confidence}%\n"
            f"<b>Вход:</b> {fill_price}$\n"
            f"{_tp_line}\n"
            f"<b>Stop Loss:</b> {sl_price}$ (-{_sl}%)"
            + (f"\n<b>Trailing:</b> активируется при {_trail_active_msg:.2f}$" if not IS_DEMO_TRADING else "")
        )
        age = signal.get("news_age_minutes")
        if age is not None:
            msg += f"\n⏰ <b>Возраст новости:</b> {age} мин"
        if signal.get("macro_event"):
            msg += f"\n{signal['macro_event']}"
        if signal.get("funding_event"):
            msg += f"\n⏱ {signal['funding_event']}"
        send_telegram_message(msg, TG_CHAT_ID)

    except Exception as e:
        print(f"❌ ОШИБКА СДЕЛКИ: {e}")
        error_msg = (
            f"🚨 <b>ОШИБКА!</b>\n"
            f"Монета: {coin}\n"
            f"Ошибка: {e}"
        )
        send_telegram_message(error_msg, TG_CHAT_ID)
