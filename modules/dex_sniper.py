"""
DEX Sniper — автоматичний вхід в нові токени на PancakeSwap (BSC).
Окремий гаманець! СНАЙПЕР_ГАМАНЕЦЬ != ОСНОВНИЙ ГАМАНЕЦЬ.

Потік:
  1. Підписується на PairCreated events (polling) на PancakeSwap V2 Factory
  2. GoPlus API перевірка безпеки токена (honeypot, tax, blacklist)
  3. Перевірка ліквідності (min BNB in pool)
  4. Купівля через Router swapExactETHForTokens
  5. Моніторинг ціни кожні 30 сек → продаж при TP/SL або таймауті
  6. TG нотифікації про кожну операцію
"""

import time
import logging
from datetime import datetime

try:
    from web3 import Web3
    from web3.exceptions import ContractLogicError
    WEB3_AVAILABLE = True
except ImportError:
    WEB3_AVAILABLE = False
    print(
        "WARNING: web3 не встановлено. "
        "Встановіть через: pip install web3\n"
        "DEX Sniper не буде працювати без web3."
    )

import requests

from config.settings import (
    BSC_WSS_URL,
    SNIPER_PRIVATE_KEY,
    SNIPER_BUY_AMOUNT_BNB,
    SNIPER_TAKE_PROFIT_PCT,
    SNIPER_STOP_LOSS_PCT,
    SNIPER_MAX_TAX_PCT,
    SNIPER_MIN_LIQUIDITY_BNB,
    SNIPER_TIME_LIMIT_MIN,
    TG_CHAT_ID,
)
from modules.tg_notifier import send_telegram_message

logger = logging.getLogger("dex_sniper")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)

# ─── Addresses ────────────────────────────────────────────────────────────────

PANCAKE_FACTORY_V2 = "0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73"
PANCAKE_ROUTER_V2  = "0x10ED43C718714eb63d5aA57B78B54704E256024E"
WBNB               = "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c"

# ─── Minimal ABIs ─────────────────────────────────────────────────────────────

FACTORY_ABI = [
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True,  "internalType": "address", "name": "token0",  "type": "address"},
            {"indexed": True,  "internalType": "address", "name": "token1",  "type": "address"},
            {"indexed": False, "internalType": "address", "name": "pair",    "type": "address"},
            {"indexed": False, "internalType": "uint256", "name": "",        "type": "uint256"},
        ],
        "name": "PairCreated",
        "type": "event",
    }
]

ROUTER_ABI = [
    {
        "inputs": [
            {"internalType": "uint256",  "name": "amountOutMin", "type": "uint256"},
            {"internalType": "address[]","name": "path",         "type": "address[]"},
            {"internalType": "address",  "name": "to",           "type": "address"},
            {"internalType": "uint256",  "name": "deadline",     "type": "uint256"},
        ],
        "name": "swapExactETHForTokens",
        "outputs": [{"internalType": "uint256[]", "name": "amounts", "type": "uint256[]"}],
        "stateMutability": "payable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "uint256",  "name": "amountIn",     "type": "uint256"},
            {"internalType": "uint256",  "name": "amountOutMin", "type": "uint256"},
            {"internalType": "address[]","name": "path",         "type": "address[]"},
            {"internalType": "address",  "name": "to",           "type": "address"},
            {"internalType": "uint256",  "name": "deadline",     "type": "uint256"},
        ],
        "name": "swapExactTokensForETH",
        "outputs": [{"internalType": "uint256[]", "name": "amounts", "type": "uint256[]"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
]

ERC20_ABI = [
    {
        "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
        "name": "balanceOf",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "address", "name": "spender", "type": "address"},
            {"internalType": "uint256", "name": "amount",  "type": "uint256"},
        ],
        "name": "approve",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "address", "name": "owner",   "type": "address"},
            {"internalType": "address", "name": "spender", "type": "address"},
        ],
        "name": "allowance",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    },
]

PAIR_ABI = [
    {
        "inputs": [],
        "name": "getReserves",
        "outputs": [
            {"internalType": "uint112", "name": "_reserve0",           "type": "uint112"},
            {"internalType": "uint112", "name": "_reserve1",           "type": "uint112"},
            {"internalType": "uint32",  "name": "_blockTimestampLast", "type": "uint32"},
        ],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "token0",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "token1",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    },
]

# ─── Active positions ──────────────────────────────────────────────────────────
# key: token_address (checksummed)
# value: {
#   "pair": str,
#   "buy_price": float,       price in BNB at buy time
#   "token_amount": int,      raw token units
#   "bought_at": float,       unix timestamp
#   "token_is_token0": bool,
# }
_active_snipes: dict = {}

# ─── GoPlus Safety ────────────────────────────────────────────────────────────

def check_token_safety(token_address: str, chain_id: int = 56) -> dict:
    """
    GoPlus API — безкоштовно, без ключа.
    GET https://api.gopluslabs.io/api/v1/token_security/{chain_id}?contract_addresses={addr}
    Повертає: {"is_safe": bool, "reason": str, "buy_tax": float, "sell_tax": float}
    """
    url = (
        f"https://api.gopluslabs.io/api/v1/token_security/{chain_id}"
        f"?contract_addresses={token_address.lower()}"
    )
    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("GoPlus API error for %s: %s", token_address, exc)
        return {"is_safe": False, "reason": f"API error: {exc}", "buy_tax": 0.0, "sell_tax": 0.0}

    result = data.get("result", {})
    info = result.get(token_address.lower(), {})

    if not info:
        return {"is_safe": False, "reason": "No data from GoPlus", "buy_tax": 0.0, "sell_tax": 0.0}

    # Honeypot
    if info.get("is_honeypot") == "1":
        return {"is_safe": False, "reason": "honeypot", "buy_tax": 0.0, "sell_tax": 0.0}

    # Blacklist
    if info.get("is_blacklisted") == "1":
        return {"is_safe": False, "reason": "blacklisted", "buy_tax": 0.0, "sell_tax": 0.0}

    # Tax
    try:
        buy_tax = float(info.get("buy_tax", 0)) * 100
    except (TypeError, ValueError):
        buy_tax = 0.0
    try:
        sell_tax = float(info.get("sell_tax", 0)) * 100
    except (TypeError, ValueError):
        sell_tax = 0.0

    if buy_tax > SNIPER_MAX_TAX_PCT:
        return {
            "is_safe": False,
            "reason": f"buy_tax too high ({buy_tax:.1f}%)",
            "buy_tax": buy_tax,
            "sell_tax": sell_tax,
        }
    if sell_tax > SNIPER_MAX_TAX_PCT:
        return {
            "is_safe": False,
            "reason": f"sell_tax too high ({sell_tax:.1f}%)",
            "buy_tax": buy_tax,
            "sell_tax": sell_tax,
        }

    return {"is_safe": True, "reason": "passed", "buy_tax": buy_tax, "sell_tax": sell_tax}


# ─── Liquidity ────────────────────────────────────────────────────────────────

def get_liquidity_bnb(w3, pair_address: str) -> float:
    """Отримує кількість WBNB в пулі через getReserves."""
    try:
        pair = w3.eth.contract(
            address=Web3.to_checksum_address(pair_address),
            abi=PAIR_ABI,
        )
        t0 = pair.functions.token0().call()
        r0, r1, _ = pair.functions.getReserves().call()

        wbnb_cs = Web3.to_checksum_address(WBNB)
        if Web3.to_checksum_address(t0) == wbnb_cs:
            wbnb_reserve = r0
        else:
            wbnb_reserve = r1

        return w3.from_wei(wbnb_reserve, "ether")
    except Exception as exc:
        logger.warning("get_liquidity_bnb failed for %s: %s", pair_address, exc)
        return 0.0


# ─── Price ────────────────────────────────────────────────────────────────────

def get_token_price_in_bnb(w3, pair_address: str, token_is_token0: bool) -> float:
    """
    Розраховує ціну токена в BNB через getReserves.
    Ціна = BNB_reserve / token_reserve  (BNB за 1 token)
    """
    try:
        pair = w3.eth.contract(
            address=Web3.to_checksum_address(pair_address),
            abi=PAIR_ABI,
        )
        r0, r1, _ = pair.functions.getReserves().call()
        if r0 == 0 or r1 == 0:
            return 0.0

        if token_is_token0:
            # token = reserve0, BNB = reserve1
            return r1 / r0
        else:
            # token = reserve1, BNB = reserve0
            return r0 / r1
    except Exception as exc:
        logger.warning("get_token_price_in_bnb failed for %s: %s", pair_address, exc)
        return 0.0


# ─── Buy ──────────────────────────────────────────────────────────────────────

def buy_token(w3, account, token_address: str, amount_bnb: float) -> dict | None:
    """
    swapExactETHForTokens через PancakeSwap V2 Router.
    Повертає: {"tx_hash": str, "amount_in": float, "token_amount": int} або None
    """
    try:
        router = w3.eth.contract(
            address=Web3.to_checksum_address(PANCAKE_ROUTER_V2),
            abi=ROUTER_ABI,
        )
        amount_in_wei = w3.to_wei(amount_bnb, "ether")
        path = [
            Web3.to_checksum_address(WBNB),
            Web3.to_checksum_address(token_address),
        ]
        deadline = int(time.time()) + 120  # 2 хв

        gas_price = w3.eth.gas_price
        nonce = w3.eth.get_transaction_count(account.address, "latest")

        tx = router.functions.swapExactETHForTokens(
            0,       # amountOutMin = 0 (сніпер, хочемо будь-яку кількість)
            path,
            account.address,
            deadline,
        ).build_transaction({
            "from":     account.address,
            "value":    amount_in_wei,
            "gas":      300_000,
            "gasPrice": int(gas_price * 1.2),  # +20% пріоритет
            "nonce":    nonce,
            "chainId":  56,
        })

        signed = account.sign_transaction(tx)
        tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

        if receipt.status != 1:
            logger.error("buy_token: tx reverted. hash=%s", tx_hash.hex())
            return None

        # Отримуємо баланс токена після покупки
        token_contract = w3.eth.contract(
            address=Web3.to_checksum_address(token_address),
            abi=ERC20_ABI,
        )
        token_balance = token_contract.functions.balanceOf(account.address).call()

        logger.info(
            "BUY OK: %s | spent=%.4f BNB | tokens=%d | tx=%s",
            token_address, amount_bnb, token_balance, tx_hash.hex(),
        )
        return {
            "tx_hash":      tx_hash.hex(),
            "amount_in":    amount_bnb,
            "token_amount": token_balance,
        }

    except ContractLogicError as exc:
        logger.error("buy_token ContractLogicError: %s", exc)
        return None
    except Exception as exc:
        logger.error("buy_token failed for %s: %s", token_address, exc)
        return None


# ─── Sell ─────────────────────────────────────────────────────────────────────

def sell_token(w3, account, token_address: str, token_amount: int) -> dict | None:
    """
    Спочатку approve, потім swapExactTokensForETH.
    Повертає: {"tx_hash": str, "bnb_received": float} або None
    """
    try:
        token_contract = w3.eth.contract(
            address=Web3.to_checksum_address(token_address),
            abi=ERC20_ABI,
        )
        router_addr = Web3.to_checksum_address(PANCAKE_ROUTER_V2)
        gas_price = w3.eth.gas_price

        # — approve —
        allowance = token_contract.functions.allowance(account.address, router_addr).call()
        if allowance < token_amount:
            nonce = w3.eth.get_transaction_count(account.address, "latest")
            approve_tx = token_contract.functions.approve(
                router_addr,
                2**256 - 1,  # max approve
            ).build_transaction({
                "from":     account.address,
                "gas":      100_000,
                "gasPrice": int(gas_price * 1.2),
                "nonce":    nonce,
                "chainId":  56,
            })
            signed_approve = account.sign_transaction(approve_tx)
            approve_hash = w3.eth.send_raw_transaction(signed_approve.rawTransaction)
            w3.eth.wait_for_transaction_receipt(approve_hash, timeout=60)
            logger.info("approve OK for %s", token_address)

        # — swap —
        router = w3.eth.contract(
            address=router_addr,
            abi=ROUTER_ABI,
        )
        path = [
            Web3.to_checksum_address(token_address),
            Web3.to_checksum_address(WBNB),
        ]
        deadline = int(time.time()) + 120

        nonce = w3.eth.get_transaction_count(account.address, "latest")
        bnb_before = w3.from_wei(w3.eth.get_balance(account.address), "ether")

        sell_tx = router.functions.swapExactTokensForETH(
            token_amount,
            0,           # amountOutMin = 0
            path,
            account.address,
            deadline,
        ).build_transaction({
            "from":     account.address,
            "gas":      300_000,
            "gasPrice": int(gas_price * 1.2),
            "nonce":    nonce,
            "chainId":  56,
        })

        signed_sell = account.sign_transaction(sell_tx)
        tx_hash = w3.eth.send_raw_transaction(signed_sell.rawTransaction)
        receipt = w3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)

        if receipt.status != 1:
            logger.error("sell_token: tx reverted. hash=%s", tx_hash.hex())
            return None

        bnb_after = w3.from_wei(w3.eth.get_balance(account.address), "ether")
        bnb_received = float(bnb_after) - float(bnb_before)

        logger.info(
            "SELL OK: %s | received=%.4f BNB | tx=%s",
            token_address, bnb_received, tx_hash.hex(),
        )
        return {"tx_hash": tx_hash.hex(), "bnb_received": bnb_received}

    except ContractLogicError as exc:
        logger.error("sell_token ContractLogicError: %s", exc)
        return None
    except Exception as exc:
        logger.error("sell_token failed for %s: %s", token_address, exc)
        return None


# ─── Position monitor thread ──────────────────────────────────────────────────

def _monitor_position(w3, account, token_address: str):
    """
    Блокуючий цикл моніторингу для однієї позиції.
    Запускається в окремому потоці.
    Продає при TP/SL або таймауті SNIPER_TIME_LIMIT_MIN хвилин.
    """
    info = _active_snipes.get(token_address)
    if not info:
        return

    pair_address   = info["pair"]
    buy_price      = info["buy_price"]
    token_amount   = info["token_amount"]
    bought_at      = info["bought_at"]
    token_is_token0 = info["token_is_token0"]

    logger.info("Monitoring position: %s | buy_price=%.8f BNB", token_address, buy_price)

    while True:
        try:
            elapsed_min = (time.time() - bought_at) / 60.0
            current_price = get_token_price_in_bnb(w3, pair_address, token_is_token0)

            if buy_price > 0 and current_price > 0:
                pnl_pct = (current_price - buy_price) / buy_price * 100
            else:
                pnl_pct = 0.0

            logger.info(
                "%s | price=%.8f | PnL=%.1f%% | elapsed=%.1fmin",
                token_address[:10], current_price, pnl_pct, elapsed_min,
            )

            should_sell = False
            reason = ""

            if pnl_pct >= SNIPER_TAKE_PROFIT_PCT:
                should_sell = True
                reason = f"TP +{pnl_pct:.1f}%"
            elif pnl_pct <= -SNIPER_STOP_LOSS_PCT:
                should_sell = True
                reason = f"SL {pnl_pct:.1f}%"
            elif elapsed_min >= SNIPER_TIME_LIMIT_MIN:
                should_sell = True
                reason = f"timeout {elapsed_min:.0f}min (PnL {pnl_pct:.1f}%)"

            if should_sell:
                logger.info("Selling %s — %s", token_address, reason)
                result = sell_token(w3, account, token_address, token_amount)

                duration_min = int((time.time() - bought_at) / 60)
                bnb_received = result["bnb_received"] if result else 0.0
                pnl_bnb = bnb_received - info.get("amount_in_bnb", SNIPER_BUY_AMOUNT_BNB)
                icon = "📈" if pnl_bnb >= 0 else "📉"

                msg = (
                    f"{'🔴' if pnl_bnb < 0 else '🟢'} <b>SNIPER SELL:</b> <code>{token_address}</code>\n"
                    f"{icon} PnL: {pnl_bnb:+.4f} BNB ({pnl_pct:+.1f}%)\n"
                    f"⏱ Тривалість: {duration_min} хв\n"
                    f"Причина: {reason}"
                )
                send_telegram_message(msg, TG_CHAT_ID)
                _active_snipes.pop(token_address, None)
                return

        except Exception as exc:
            logger.error("_monitor_position error for %s: %s", token_address, exc)

        time.sleep(30)


# ─── New pair handler ─────────────────────────────────────────────────────────

def _handle_new_pair(w3, account, event):
    """Обробляє одну нову пару: safety → liquidity → buy → monitor."""
    import threading

    token0 = event["args"]["token0"]
    token1 = event["args"]["token1"]
    pair   = event["args"]["pair"]

    wbnb_cs = Web3.to_checksum_address(WBNB)

    # Визначаємо який токен це новий (не WBNB)
    if Web3.to_checksum_address(token0) == wbnb_cs:
        token_address   = Web3.to_checksum_address(token1)
        token_is_token0 = False
    elif Web3.to_checksum_address(token1) == wbnb_cs:
        token_address   = Web3.to_checksum_address(token0)
        token_is_token0 = True
    else:
        # Пара без WBNB — пропускаємо
        logger.info("Pair %s: no WBNB — skip", pair)
        return

    if token_address in _active_snipes:
        logger.info("Already sniping %s — skip", token_address)
        return

    logger.info("New pair: %s | token=%s", pair, token_address)

    # ── Safety check ──
    safety = check_token_safety(token_address)
    if not safety["is_safe"]:
        logger.info("UNSAFE %s: %s", token_address, safety["reason"])
        return

    # ── Liquidity check ──
    liquidity_bnb = get_liquidity_bnb(w3, pair)
    if float(liquidity_bnb) < SNIPER_MIN_LIQUIDITY_BNB:
        logger.info(
            "Low liquidity %s: %.2f BNB < %.2f BNB min",
            token_address, liquidity_bnb, SNIPER_MIN_LIQUIDITY_BNB,
        )
        return

    # ── Buy ──
    buy_result = buy_token(w3, account, token_address, SNIPER_BUY_AMOUNT_BNB)
    if not buy_result:
        logger.warning("BUY FAILED for %s", token_address)
        send_telegram_message(
            f"❌ <b>SNIPER BUY FAILED:</b> <code>{token_address}</code>",
            TG_CHAT_ID,
        )
        return

    buy_price = get_token_price_in_bnb(w3, pair, token_is_token0)

    _active_snipes[token_address] = {
        "pair":           pair,
        "buy_price":      buy_price,
        "token_amount":   buy_result["token_amount"],
        "bought_at":      time.time(),
        "token_is_token0": token_is_token0,
        "amount_in_bnb":  buy_result["amount_in"],
    }

    msg = (
        f"🎯 <b>SNIPER BUY:</b> <code>{token_address}</code>\n"
        f"💰 Витрачено: {buy_result['amount_in']:.4f} BNB\n"
        f"📊 Ліквідність: {float(liquidity_bnb):.1f} BNB\n"
        f"✅ Safety: {safety['reason']} "
        f"(buy {safety['buy_tax']:.1f}% / sell {safety['sell_tax']:.1f}%)\n"
        f"Pair: <code>{pair}</code>"
    )
    send_telegram_message(msg, TG_CHAT_ID)

    # Запускаємо моніторинг позиції в окремому потоці
    t = threading.Thread(
        target=_monitor_position,
        args=(w3, account, token_address),
        name=f"snipe-{token_address[:8]}",
        daemon=True,
    )
    t.start()


# ─── Main sniper loop ─────────────────────────────────────────────────────────

def run_sniper():
    """
    - Підключається до BSC WebSocket
    - Підписується на PairCreated events (polling кожні 2 сек)
    - При новій парі: check_safety -> check_liquidity -> buy
    - Після покупки: моніторить ціну кожні 30 сек
    - Продає при TP/SL або після SNIPER_TIME_LIMIT_MIN хвилин
    - TG нотифікації про кожну операцію
    """
    if not WEB3_AVAILABLE:
        print("ERROR: web3 не встановлено. Встановіть: pip install web3")
        return

    if not SNIPER_PRIVATE_KEY:
        print(
            "WARNING: SNIPER_PRIVATE_KEY не встановлено в .env\n"
            "DEX Sniper вимагає окремого гаманця тільки для снайпінгу.\n"
            "Додайте SNIPER_PRIVATE_KEY=0x... в .env та перезапустіть."
        )
        return

    logger.info("DEX Sniper стартує...")
    logger.info(
        "Параметри: BNB=%.3f | TP=+%.0f%% | SL=-%.0f%% | MaxTax=%.1f%% | MinLiq=%.1fBNB | Timeout=%dmin",
        SNIPER_BUY_AMOUNT_BNB,
        SNIPER_TAKE_PROFIT_PCT,
        SNIPER_STOP_LOSS_PCT,
        SNIPER_MAX_TAX_PCT,
        SNIPER_MIN_LIQUIDITY_BNB,
        SNIPER_TIME_LIMIT_MIN,
    )

    while True:
        w3 = None
        try:
            logger.info("Підключення до BSC: %s", BSC_WSS_URL)
            w3 = Web3(Web3.WebsocketProvider(BSC_WSS_URL))

            if not w3.is_connected():
                raise ConnectionError("WebSocket не підключено")

            logger.info("BSC підключено. Chain ID: %d", w3.eth.chain_id)

            account = w3.eth.account.from_key(SNIPER_PRIVATE_KEY)
            logger.info("Sniper wallet: %s", account.address)

            bnb_balance = w3.from_wei(w3.eth.get_balance(account.address), "ether")
            logger.info("Wallet balance: %.4f BNB", float(bnb_balance))

            if float(bnb_balance) < SNIPER_BUY_AMOUNT_BNB:
                logger.warning(
                    "Недостатньо BNB! Баланс=%.4f, потрібно=%.4f",
                    float(bnb_balance), SNIPER_BUY_AMOUNT_BNB,
                )

            send_telegram_message(
                f"🎯 <b>DEX Sniper запущено</b>\n"
                f"Wallet: <code>{account.address}</code>\n"
                f"Balance: {float(bnb_balance):.4f} BNB\n"
                f"Buy: {SNIPER_BUY_AMOUNT_BNB} BNB | TP: +{SNIPER_TAKE_PROFIT_PCT:.0f}% | "
                f"SL: -{SNIPER_STOP_LOSS_PCT:.0f}%",
                TG_CHAT_ID,
            )

            factory = w3.eth.contract(
                address=Web3.to_checksum_address(PANCAKE_FACTORY_V2),
                abi=FACTORY_ABI,
            )

            event_filter = factory.events.PairCreated.create_filter(fromBlock="latest")
            logger.info("Слухаємо PairCreated на PancakeSwap V2 Factory...")

            while True:
                try:
                    new_entries = event_filter.get_new_entries()
                    for event in new_entries:
                        try:
                            _handle_new_pair(w3, account, event)
                        except Exception as exc:
                            logger.error("_handle_new_pair error: %s", exc)

                    if len(_active_snipes) > 0:
                        logger.debug("Активні позиції: %d", len(_active_snipes))

                except Exception as exc:
                    logger.warning("Помилка polling: %s", exc)

                time.sleep(2)

        except KeyboardInterrupt:
            logger.info("DEX Sniper зупинено користувачем.")
            send_telegram_message("🛑 <b>DEX Sniper зупинено</b>", TG_CHAT_ID)
            break

        except Exception as exc:
            logger.error("DEX Sniper помилка з'єднання: %s", exc)
            ts = datetime.now().strftime("%H:%M:%S")
            send_telegram_message(
                f"❌ <b>DEX Sniper — помилка з'єднання</b>\n"
                f"<code>{str(exc)[:300]}</code>\n"
                f"Повтор через 30 сек...",
                TG_CHAT_ID,
            )

        finally:
            if w3 is not None:
                try:
                    w3.provider.disconnect()
                except Exception:
                    pass

        logger.info("Повтор підключення через 30 секунд...")
        time.sleep(30)
