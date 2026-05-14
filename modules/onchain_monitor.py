"""
onchain_monitor.py — On-chain whale мониторинг через Alchemy WebSocket.

Отслеживает крупные переводы ETH/ERC-20 на/с известных биржевых адресов.
Перевод НА биржу = давление продажи (медвежий сигнал).
Перевод С биржи = накопление (бычий сигнал).
"""
import json
import threading
import time
from collections import deque
from datetime import datetime, timezone

from config.settings import ALCHEMY_API_KEY

# Минимальная сумма перевода для сигнала (в ETH)
_MIN_ETH = 500.0   # $1M+ при цене $2000/ETH

# Скользящее окно для агрегации (секунды)
_WINDOW_SEC = 600  # 10 минут

# ─── ETH-ecosystem alt coins ─────────────────────────────────────────────────
# Коли великий кит накопичує ETH → macro bullish для цих монет (корелюють з ETH)
_ETH_ECOSYSTEM = frozenset({"AAVE", "UNI", "LDO", "LINK", "CRV", "PENDLE", "RUNE", "ONDO"})

# Macro state: оновлюється при кожному значущому on-chain переміщенні
# Тримає сигнал 45 хвилин — достатньо для підтвердження через news/liq сигнали
_macro_state: dict = {"score": 0.0, "expires_at": 0.0, "reason": ""}
_macro_lock = threading.Lock()

# Известные биржевые горячие кошельки
_EXCHANGE_WALLETS = {
    # Binance
    "0x28c6c06298d514db089934071355e5743bf21d60": "Binance",
    "0x21a31ee1afc51d94c2efccaa2092ad1028285549": "Binance",
    "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": "Binance",
    # Bybit
    "0xf89d7b9c864f589bbf53a82105107622b35eaa40": "Bybit",
    # OKX
    "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b": "OKX",
    # Coinbase
    "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43": "Coinbase",
    # Kraken
    "0x2910543af39aba0cd09dbb2d50200b3e800a63d2": "Kraken",
}

_EXCHANGE_SET = set(_EXCHANGE_WALLETS.keys())

# {coin: deque[(timestamp, direction, eth_value, exchange)]}
# direction: "TO_EXCHANGE" или "FROM_EXCHANGE"
_flow_data: dict = {"ETH": deque()}
_lock = threading.Lock()
_running = False


def get_onchain_signal(coin: str = "ETH") -> dict:
    """
    Возвращает on-chain давление за последние 10 минут.

    Returns:
        {
          "to_exchange_eth":   float,  # ETH отправлено на биржи (медвежий)
          "from_exchange_eth": float,  # ETH выведено с бирж (бычий)
          "signal":            str,    # "BEARISH" / "BULLISH" / "NEUTRAL"
          "signal_score":      float,  # -2.0..+2.0
          "largest_tx_eth":    float,
          "largest_exchange":  str,
        }
    """
    now = datetime.now(timezone.utc).timestamp()

    with _lock:
        dq = _flow_data.get("ETH", deque())
        # Чистим старые
        while dq and now - dq[0][0] > _WINDOW_SEC:
            dq.popleft()
        entries = list(dq)

    to_ex = sum(v for _, d, v, _ in entries if d == "TO_EXCHANGE")
    from_ex = sum(v for _, d, v, _ in entries if d == "FROM_EXCHANGE")

    largest = max(entries, key=lambda x: x[2], default=None)
    largest_eth = largest[2] if largest else 0
    largest_ex = _EXCHANGE_WALLETS.get(largest[3], "Unknown") if largest else ""

    total = to_ex + from_ex
    if total < _MIN_ETH * 0.5:
        return {
            "to_exchange_eth": round(to_ex, 1),
            "from_exchange_eth": round(from_ex, 1),
            "signal": "NEUTRAL",
            "signal_score": 0.0,
            "largest_tx_eth": round(largest_eth, 1),
            "largest_exchange": largest_ex,
        }

    if to_ex > from_ex * 1.5:
        signal = "BEARISH"
        score = -min(to_ex / _MIN_ETH, 2.0)
    elif from_ex > to_ex * 1.5:
        signal = "BULLISH"
        score = min(from_ex / _MIN_ETH, 2.0)
    else:
        signal = "NEUTRAL"
        score = 0.0

    return {
        "to_exchange_eth": round(to_ex, 1),
        "from_exchange_eth": round(from_ex, 1),
        "signal": signal,
        "signal_score": round(score, 1),
        "largest_tx_eth": round(largest_eth, 1),
        "largest_exchange": largest_ex,
    }


def get_macro_onchain_boost(coin: str) -> float:
    """
    Macro on-chain boost для рішень сигнал-бота.

    Повертає значення від -2.0 до +2.0:
      +X → накопичення ETH (кити виводять з бірж) → bullish для ETH-ecosystem
      -X → розподіл ETH (кити депозитять на біржі) → bearish для ETH-ecosystem
      ±0.3 для монет поза ETH-ecosystem (загальний macro)
      0.0 → сигнал протермінувався або відсутній

    Використовується в decision_maker.py як Фактор Е2.
    """
    now = time.time()
    with _macro_lock:
        if now > _macro_state["expires_at"]:
            return 0.0
        score = _macro_state["score"]

    coin_upper = coin.upper()
    if coin_upper in _ETH_ECOSYSTEM:
        return score               # повний буст для ETH-ecosystem алтів
    return round(score * 0.2, 2)  # слабкий macro-буст для решти


def _update_macro_state(direction: str, eth_value: float, exchange: str) -> None:
    """Оновлює macro_state при значущому on-chain русі."""
    # score: від 0.5 (500 ETH) до 2.0 (2000+ ETH)
    score = min(eth_value / _MIN_ETH, 2.0)
    signed = score if direction == "BULLISH" else -score
    expires = time.time() + 45 * 60  # сигнал живе 45 хвилин
    reason = (
        f"Whale withdrew {eth_value:.0f} ETH from {exchange} — macro bullish"
        if direction == "BULLISH" else
        f"Whale deposited {eth_value:.0f} ETH to {exchange} — macro bearish"
    )
    with _macro_lock:
        _macro_state["score"]      = round(signed, 2)
        _macro_state["expires_at"] = expires
        _macro_state["reason"]     = reason
    print(f"[ONCHAIN] 📡 Macro state: {signed:+.1f} ({reason[:60]})")


def _process_tx(tx: dict):
    """Обрабатывает одну транзакцию из Alchemy."""
    try:
        from_addr = (tx.get("from") or "").lower()
        to_addr = (tx.get("to") or "").lower()
        value_hex = tx.get("value", "0x0")
        value_eth = int(value_hex, 16) / 1e18

        if value_eth < 10:  # игнорируем < 10 ETH
            return

        now = datetime.now(timezone.utc).timestamp()

        with _lock:
            if to_addr in _EXCHANGE_SET and value_eth >= _MIN_ETH:
                _flow_data["ETH"].append((now, "TO_EXCHANGE", value_eth, to_addr))
                exchange_name = _EXCHANGE_WALLETS[to_addr]
                print(f"[ONCHAIN] 🐋 → {exchange_name}: {value_eth:.0f} ETH (продажа?)")
                _update_macro_state("BEARISH", value_eth, exchange_name)
            elif from_addr in _EXCHANGE_SET and value_eth >= _MIN_ETH:
                _flow_data["ETH"].append((now, "FROM_EXCHANGE", value_eth, from_addr))
                exchange_name = _EXCHANGE_WALLETS[from_addr]
                print(f"[ONCHAIN] 🐋 ← {exchange_name}: {value_eth:.0f} ETH (накопление?)")
                _update_macro_state("BULLISH", value_eth, exchange_name)

    except Exception:
        pass


def _ws_thread():
    global _running
    if not ALCHEMY_API_KEY:
        print("[ONCHAIN] ⚠️ ALCHEMY_API_KEY не задан — on-chain мониторинг отключён")
        return

    try:
        import websocket
    except ImportError:
        print("[ONCHAIN] ❌ websocket-client не установлен")
        return

    ws_url = f"wss://eth-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}"

    subscribe_msg = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_subscribe",
        "params": ["alchemy_pendingTransactions", {
            "toAddress": list(_EXCHANGE_SET),
            "hashesOnly": True,
        }]
    })

    def on_open(ws):
        ws.send(subscribe_msg)
        # Подписка на исходящие транзакции с бирж
        ws.send(json.dumps({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "eth_subscribe",
            "params": ["alchemy_pendingTransactions", {
                "fromAddress": list(_EXCHANGE_SET),
                "hashesOnly": True,
            }]
        }))
        print("[ONCHAIN] ✅ Ethereum on-chain мониторинг запущен (Alchemy WebSocket)")

    def on_message(ws, msg):
        try:
            data   = json.loads(msg)
            result = data.get("params", {}).get("result")
            if not result:
                return
            if isinstance(result, str):
                import requests as _req
                r = _req.post(
                    f"https://eth-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
                    json={"jsonrpc": "2.0", "id": 1, "method": "eth_getTransactionByHash", "params": [result]},
                    timeout=5,
                )
                tx = r.json().get("result") or {}
            else:
                tx = result
            if tx:
                _process_tx(tx)
        except Exception:
            pass

    _onchain_backoff = [600]  # list для мутабельності в closure

    def on_error(ws, err):
        err_str = str(err)
        if "429" in err_str:
            _onchain_backoff[0] = 3600
            print("[ONCHAIN] WebSocket 429 capacity exceeded — reconnect in 60 min")
        else:
            _onchain_backoff[0] = 600
            print(f"[ONCHAIN] WebSocket ошибка: {type(err).__name__}")

    def on_close(ws, *args):
        backoff = _onchain_backoff[0]
        _onchain_backoff[0] = 600
        print(f"[ONCHAIN] WebSocket закрыт — reconnect через {backoff//60} хв")
        time.sleep(backoff)
        if _running:
            _connect()

    def _connect():
        ws = websocket.WebSocketApp(
            ws_url,
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close,
        )
        ws.run_forever(ping_interval=120, ping_timeout=15)

    _connect()


def start_onchain_monitor() -> bool:
    """Запускает on-chain мониторинг в фоновом daemon-потоке."""
    global _running
    if not ALCHEMY_API_KEY:
        print("[ONCHAIN] ⚠️ ALCHEMY_API_KEY не задан — мониторинг отключён")
        return False

    _running = True
    t = threading.Thread(target=_ws_thread, daemon=True, name="OnchainMonitor")
    t.start()
    return True
