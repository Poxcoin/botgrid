"""
liquidation_monitor.py — Реалтайм мониторинг ликвидаций через Binance WebSocket.

Бесплатно, без API ключа. Слушает принудительные закрытия по всем монетам.
Данные хранятся в скользящем окне 5 минут.

Логика сигнала:
  SELL = ликвидирован LONG (медвежий сигнал — каскад продаж продолжится)
  BUY  = ликвидирован SHORT (бычий сигнал — шорт-сквиз продолжится)
"""
import json
import queue
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

# ─── Standalone cascade signal queue ─────────────────────────────────────────
liquidation_signal_queue: queue.Queue = queue.Queue()

# Cooldown: не генеруємо більше одного сигналу з монети за 30 хв
_last_liq_signal: dict[str, float] = {}
_LIQ_COOLDOWN_SEC = 1800

# Тільки алти — BTC/ETH/SOL/BNB покриваються Grid/Funding, конфлікт небажаний
_LIQ_CASCADE_WATCHLIST = frozenset({
    "XRP", "ADA", "DOGE", "AVAX", "DOT", "LINK",
    "INJ", "SUI", "APT", "OP", "ARB", "NEAR", "TON",
    "AAVE", "UNI", "LDO", "CRV", "RUNE", "JUP", "PENDLE", "ONDO", "WLD",
})

# Порог ликвидации в USD за 5 минут для сигнала
_THRESHOLD_BIG = {
    "BTC": 2_000_000,   # $2M для BTC
    "ETH": 1_000_000,   # $1M для ETH
    "DEFAULT": 300_000, # $300K для остальных
}

_WINDOW_SEC = 300   # 5 минут скользящее окно
_WINDOW_1H  = 3600  # 1 час для boost-сигнала

# {coin: deque[(timestamp, side, usd_value)]}
_liq_data:    dict = defaultdict(deque)
_liq_data_1h: dict = defaultdict(deque)  # часовой аккумулятор
_lock = threading.Lock()
_running = False


def _get_threshold(coin: str) -> float:
    return _THRESHOLD_BIG.get(coin.upper(), _THRESHOLD_BIG["DEFAULT"])


def _check_cascade(coin: str) -> None:
    """Якщо ліквідаційний каскад перетнув поріг — пушимо сигнал у черги."""
    if coin not in _LIQ_CASCADE_WATCHLIST:
        return

    now = datetime.now(timezone.utc).timestamp()
    if now - _last_liq_signal.get(coin, 0) < _LIQ_COOLDOWN_SEC:
        return

    threshold = _get_threshold(coin)

    with _lock:
        _cleanup_old(coin, now)
        entries = list(_liq_data.get(coin, []))

    long_liq  = sum(v for _, s, v in entries if s == "SELL")
    short_liq = sum(v for _, s, v in entries if s == "BUY")

    action      = None
    cascade_usd = 0.0

    if short_liq >= threshold and short_liq >= long_liq * 2.5:
        action, cascade_usd = "LONG", short_liq    # шорти ліквідуються → памп продовжується
    elif long_liq >= threshold and long_liq >= short_liq * 2.5:
        action, cascade_usd = "SHORT", long_liq    # лонги ліквідуються → дамп продовжується

    if not action:
        return

    _last_liq_signal[coin] = now

    # score: 11.0 при мінімальному каскаді, до ~17.0 при 4× порозі
    scale = min(cascade_usd / threshold, 4.0)
    score = round(9.0 + scale * 2.0, 1)
    signed_score = score if action == "LONG" else -score

    title = (
        f"Short squeeze {coin}: ${cascade_usd/1e6:.2f}M shorts liquidated in 5min"
        if action == "LONG" else
        f"Long cascade {coin}: ${cascade_usd/1e6:.2f}M longs liquidated in 5min"
    )

    liquidation_signal_queue.put_nowait({
        "coin":           coin,
        "action":         action,
        "source":         "LiqCascade",
        "total_score":    signed_score,
        "confidence":     65,
        "size_multiplier": 1.0,
        "reason":         title,
        "news_title":     title,
        "title":          title,
        "cascade_usd":    round(cascade_usd),
        "link":           f"liq://{coin}/{int(now)}",
        "published_dt":   datetime.fromtimestamp(now, tz=timezone.utc).isoformat(),
        "is_liq_cascade": True,
    })
    emoji = "🚀" if action == "LONG" else "🔴"
    print(f"[LIQ] {emoji} CASCADE SIGNAL {coin}: ${cascade_usd/1e6:.2f}M → {action} (score={score})")


def _process_message(raw: str):
    try:
        msg = json.loads(raw)
        order = msg.get("o", {})
        symbol = order.get("s", "")
        if not symbol.endswith("USDT"):
            return

        coin = symbol.replace("USDT", "")
        side = order.get("S", "")      # SELL=long liq, BUY=short liq
        avg_price = float(order.get("ap", 0) or 0)
        qty = float(order.get("l", 0) or order.get("z", 0) or 0)
        usd_value = avg_price * qty

        if usd_value < 10_000:  # игнорируем мелкие (<$10K)
            return

        now = datetime.now(timezone.utc).timestamp()
        with _lock:
            _liq_data[coin].append((now, side, usd_value))
            _liq_data_1h[coin].append((now, side, usd_value))

        _check_cascade(coin)

    except Exception:
        pass


def _cleanup_old(coin: str, now: float):
    dq = _liq_data[coin]
    while dq and now - dq[0][0] > _WINDOW_SEC:
        dq.popleft()


def get_liquidation_signal(coin: str) -> dict:
    """
    Возвращает суммарные ликвидации за последние 5 минут для монеты.

    Returns:
        {
          "long_liq_usd":  float,  # USD ликвидированных лонгов (SELL)
          "short_liq_usd": float,  # USD ликвидированных шортов (BUY)
          "signal":        str,    # "BEARISH" / "BULLISH" / "NEUTRAL"
          "signal_score":  float,  # -3.0..+3.0 для добавления в total_score
          "above_threshold": bool,
        }
    """
    coin = coin.upper()
    now = datetime.now(timezone.utc).timestamp()
    threshold = _get_threshold(coin)

    with _lock:
        _cleanup_old(coin, now)
        entries = list(_liq_data.get(coin, []))

    long_liq = sum(v for _, s, v in entries if s == "SELL")
    short_liq = sum(v for _, s, v in entries if s == "BUY")
    total = long_liq + short_liq

    if total < threshold * 0.3:
        return {
            "long_liq_usd": long_liq,
            "short_liq_usd": short_liq,
            "signal": "NEUTRAL",
            "signal_score": 0.0,
            "above_threshold": False,
        }

    above = total >= threshold

    # Определяем направление давления
    if long_liq > short_liq * 2:
        signal = "BEARISH"   # лонги ликвидируются → каскад вниз
        # score: от -1.5 до -3.0 в зависимости от размера
        raw = min(long_liq / threshold, 3.0)
        score = -(1.5 + raw * 0.5) if above else -0.5
    elif short_liq > long_liq * 2:
        signal = "BULLISH"   # шорты ликвидируются → сквиз вверх
        raw = min(short_liq / threshold, 3.0)
        score = (1.5 + raw * 0.5) if above else 0.5
    else:
        signal = "NEUTRAL"
        score = 0.0

    return {
        "long_liq_usd": round(long_liq),
        "short_liq_usd": round(short_liq),
        "signal": signal,
        "signal_score": round(score, 1),
        "above_threshold": above,
    }


def get_liquidation_1h_boost(coin: str) -> float:
    """Дополнительный буст к total_score на основе ликвидаций за последний час.

    Пороги (USD за 1 час):
      шортов > $5M  → +1.5  (масштабный шорт-сквиз, momentum сильный)
      шортов > $20M → +3.0  (каскадный сквиз, очень бычий сигнал)
      лонгов > $5M  → -1.5  (масштабный cascade вниз, опасно для лонга)
      лонгов > $20M → -3.0  (обвал, очень медвежий сигнал)

    Возвращает float от -3.0 до +3.0. 0.0 = нет значимого сигнала.
    """
    coin = coin.upper()
    now  = datetime.now(timezone.utc).timestamp()

    with _lock:
        dq = _liq_data_1h[coin]
        # очищаем старые записи
        while dq and now - dq[0][0] > _WINDOW_1H:
            dq.popleft()
        entries = list(dq)

    long_liq  = sum(v for _, s, v in entries if s == "SELL")  # лонги ликвидированы
    short_liq = sum(v for _, s, v in entries if s == "BUY")   # шорты ликвидированы

    # Применяем буст только когда одна сторона явно доминирует (2:1)
    if short_liq > long_liq * 2:
        if short_liq >= 20_000_000:
            return 3.0
        if short_liq >= 5_000_000:
            return 1.5
    elif long_liq > short_liq * 2:
        if long_liq >= 20_000_000:
            return -3.0
        if long_liq >= 5_000_000:
            return -1.5

    return 0.0


def _ws_thread():
    global _running
    try:
        import websocket
    except ImportError:
        print("[LIQ] ❌ websocket-client не установлен: pip install websocket-client")
        return

    url = "wss://fstream.binance.com/ws/!forceOrder@arr"

    def on_message(ws, msg):
        _process_message(msg)

    def on_error(ws, err):
        print(f"[LIQ] WebSocket ошибка: {err}")

    def on_close(ws, *args):
        print("[LIQ] WebSocket закрыт — переподключение через 10 сек...")
        time.sleep(10)
        if _running:
            _connect()

    def on_open(ws):
        print("[LIQ] ✅ Binance ликвидации подключены (реалтайм, без API ключа)")

    def _connect():
        ws = websocket.WebSocketApp(
            url,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
            on_open=on_open,
        )
        ws.run_forever(ping_interval=30, ping_timeout=10)

    _connect()


def start_liquidation_monitor() -> bool:
    """Запускает мониторинг ликвидаций в фоновом daemon-потоке."""
    global _running
    try:
        import websocket  # noqa
    except ImportError:
        print("[LIQ] ⚠️ websocket-client не установлен — мониторинг ликвидаций отключён")
        return False

    _running = True
    t = threading.Thread(target=_ws_thread, daemon=True, name="LiquidationMonitor")
    t.start()
    return True
