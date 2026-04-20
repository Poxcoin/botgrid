"""
liquidation_monitor.py — Реалтайм мониторинг ликвидаций через Binance WebSocket.

Бесплатно, без API ключа. Слушает принудительные закрытия по всем монетам.
Данные хранятся в скользящем окне 5 минут.

Логика сигнала:
  SELL = ликвидирован LONG (медвежий сигнал — каскад продаж продолжится)
  BUY  = ликвидирован SHORT (бычий сигнал — шорт-сквиз продолжится)
"""
import json
import threading
import time
from collections import defaultdict, deque
from datetime import datetime, timezone

# Порог ликвидации в USD за 5 минут для сигнала
_THRESHOLD_BIG = {
    "BTC": 2_000_000,   # $2M для BTC
    "ETH": 1_000_000,   # $1M для ETH
    "DEFAULT": 300_000, # $300K для остальных
}

_WINDOW_SEC = 300  # 5 минут скользящее окно

# {coin: deque[(timestamp, side, usd_value)]}
_liq_data: dict = defaultdict(deque)
_lock = threading.Lock()
_running = False


def _get_threshold(coin: str) -> float:
    return _THRESHOLD_BIG.get(coin.upper(), _THRESHOLD_BIG["DEFAULT"])


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
