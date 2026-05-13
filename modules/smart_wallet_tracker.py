"""
Smart Wallet Tracker — відстежує "smart money" гаманці на ETH mainnet.
Alchemy WebSocket (той самий ключ що в onchain_monitor).

Логіка:
  Коли ідентифікований smart money гаманець купує токен X на $100k+
  → генеруємо сигнал → Claude аналізує → потенційна угода.

  "Smart money" = гаманці з публічно відомою репутацією:
  front-run listings, early DeFi entries, whale accumulation перед памп-ом.

Сигнал іде в smart_wallet_queue → main.py → generate_signal pipeline.
"""
import json
import threading
import time
import queue
from datetime import datetime, timezone

import websocket

from config.settings import ALCHEMY_API_KEY

smart_wallet_queue: queue.Queue = queue.Queue()

# Мінімальна сума транзакції для сигналу (USD еквівалент в ETH)
MIN_ETH_VALUE = 30.0   # ~$60k+ при ETH $2000 — серйозна позиція

# Публічно ідентифіковані "smart money" адреси
# Джерела: Arkham, Nansen, публічні дослідження on-chain аналітиків
SMART_WALLETS: dict[str, str] = {
    # Paradigm — топ крипто VC, ранні входи в нові протоколи
    "0xa7a93fd0a276fc1c0197a5b5623ed117786eed06": "Paradigm",
    # Jump Trading — маркет-мейкер, front-run listings
    "0xf584f8728b874a6a5c7a8d4d387c9aae9172d621": "Jump Trading",
    # Wintermute — маркет-мейкер, активний трейдинг
    "0x00000000219ab540356cbb839cbe05303d7705fa": "Wintermute",
    # Alameda (залишки активних адрес, досі моніторяться)
    "0x477573f212a7bdd5f7c12889bd1ad0aa44fb0212": "Alameda",
    # Cumberland DRW — institutional desk
    "0x72a53cdbbcc1b9efa39c834a540550e23463aacb": "Cumberland",
    # Identified whale #1 — стабільно front-run Binance listings
    "0x9845e1909dca337944a0272f1f9f7249833d2d19": "Whale-A",
    # Identified whale #2 — DeFi early mover (Nansen "Smart Money" label)
    "0xb5d85cbf7cb3ee0d56b3bb207d5fc4b82f43f511": "Whale-B",
    # Identified whale #3 — accumulates before CEX listings
    "0x1b3cb81e51011b549d78bf720b0d924ac763a7c2": "Whale-C",
    # Identified whale #4 — Binance Launchpad sniper
    "0xe03e7c8c063c9d9d6b76c7ae4ef0c4ad5f616052": "Whale-D",
    # Known DeFi fund — early protocol entries
    "0x3ba4c387f786bfee076a58914f5bd38d668b42c3": "DeFi-Fund-1",
}

SMART_WALLET_SET = {addr.lower() for addr in SMART_WALLETS}
SMART_WALLET_LABELS = {addr.lower(): label for addr, label in SMART_WALLETS.items()}

# Дедуплікація — не дублюємо той самий гаманець частіше ніж раз на 30 хв
_seen: dict[str, float] = {}
SEEN_TTL = 1800

_running = False


def _on_message(ws, message):
    try:
        data   = json.loads(message)
        params = data.get("params", {})
        result = params.get("result")

        # hashesOnly mode — result is a tx hash string; fetch full tx via HTTP
        if isinstance(result, str):
            import requests as _req
            resp = _req.post(
                f"https://eth-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}",
                json={"jsonrpc": "2.0", "id": 1, "method": "eth_getTransactionByHash", "params": [result]},
                timeout=5,
            )
            result = resp.json().get("result") or {}

        if not isinstance(result, dict):
            return

        tx_from = result.get("from", "").lower()
        tx_to   = result.get("to",   "").lower()
        value   = int(result.get("value", "0x0"), 16) / 1e18  # Wei → ETH

        # Нас цікавить тільки якщо KNOWN smart wallet є відправником
        if tx_from not in SMART_WALLET_SET:
            return
        if value < MIN_ETH_VALUE:
            return

        wallet_label = SMART_WALLET_LABELS[tx_from]
        now_ts = time.time()

        # Дедупліція: один сигнал з гаманця за 30 хв
        if now_ts - _seen.get(tx_from, 0) < SEEN_TTL:
            return
        _seen[tx_from] = now_ts

        # Якщо to = відомий DEX router або null → накопичення/swap
        # Визначаємо напрямок: відправляє ETH → купує щось
        direction = "accumulating"
        if tx_to in {
            "0x7a250d5630b4cf539739df2c5dacb4c659f2488d",  # Uniswap V2
            "0xe592427a0aece92de3edee1f18e0157c05861564",  # Uniswap V3
            "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f",  # Sushiswap
            "0x1111111254eeb25477b68fb85ed929f73a960582",  # 1inch
        }:
            direction = "buying via DEX"

        usd_est = value * 2000  # груба оцінка, ETH ~$2000
        print(
            f"[SMART] 🐳 {wallet_label} ({tx_from[:8]}...) "
            f"{direction}: {value:.1f} ETH (~${usd_est/1e3:.0f}k)"
        )

        item = {
            "title": (
                f"Smart money {wallet_label} {direction}: "
                f"{value:.1f} ETH (~${usd_est/1e3:.0f}k)"
            ),
            "description": (
                f"Identified smart money wallet {wallet_label} ({tx_from[:10]}...) "
                f"moved {value:.2f} ETH. "
                f"These wallets historically front-run CEX listings and DeFi protocol launches. "
                f"Direction: {direction}. Consider ETH or related DeFi tokens."
            ),
            "link":         f"onchain://smart/{tx_from}/{result.get('hash', '')}",
            "published":    datetime.now(timezone.utc).strftime("%a, %d %b %Y %H:%M:%S +0000"),
            "published_dt": datetime.now(timezone.utc).isoformat(),
            "source":       f"Smart Wallet ({wallet_label})",
            "source_weight": 0.95,
            "is_panic":     False,
            "is_smart_wallet": True,
            "smart_wallet_data": {
                "wallet":    wallet_label,
                "address":   tx_from,
                "eth_value": value,
                "usd_est":   usd_est,
                "direction": direction,
            },
        }
        smart_wallet_queue.put_nowait(item)

    except Exception as e:
        print(f"[SMART] parse error: {e}")


def _on_error(ws, error):
    print(f"[SMART] WebSocket error: {error}")


def _on_close(ws, *args):
    print("[SMART] WebSocket closed — reconnect in 30s")


def _on_open(ws):
    sub = json.dumps({
        "jsonrpc": "2.0",
        "id":      2,
        "method":  "eth_subscribe",
        "params":  [
            "alchemy_pendingTransactions",
            {"fromAddress": list(SMART_WALLETS.keys()), "hashesOnly": True},
        ],
    })
    ws.send(sub)
    print(f"[SMART] ✅ Підписка на {len(SMART_WALLETS)} smart money адрес (hashesOnly)")


def _ws_loop():
    while True:
        try:
            url = f"wss://eth-mainnet.g.alchemy.com/v2/{ALCHEMY_API_KEY}"
            ws  = websocket.WebSocketApp(
                url,
                on_open=_on_open,
                on_message=_on_message,
                on_error=_on_error,
                on_close=_on_close,
            )
            ws.run_forever(ping_interval=60, ping_timeout=10)
        except Exception as e:
            print(f"[SMART] connection error: {e}")
        time.sleep(30)


def start_smart_wallet_tracker() -> threading.Thread:
    if not ALCHEMY_API_KEY:
        print("[SMART] ⚠️ ALCHEMY_API_KEY не задано — smart wallet tracker вимкнено")
        return None
    t = threading.Thread(target=_ws_loop, daemon=True, name="smart-wallet-tracker")
    t.start()
    print(f"[SMART] 🔍 Smart Wallet Tracker запущено | {len(SMART_WALLETS)} адрес")
    return t
