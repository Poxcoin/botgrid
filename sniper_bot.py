"""
sniper_bot.py — DEX Sniper Service (BSC / PancakeSwap V2).

Запускається як окремий сервіс:
    python sniper_bot.py
    # або через systemd:
    # crypto-sniper.service

Вимоги:
    pip install web3

Налаштування (.env):
    BSC_WSS_URL          — BSC WebSocket RPC (за замовчуванням nariox free node)
    SNIPER_PRIVATE_KEY   — приватний ключ ОКРЕМОГО гаманця (не основного!)
    SNIPER_BUY_AMOUNT_BNB — сума BNB на одну угоду (за замовч. 0.05)
"""

from modules.dex_sniper import run_sniper

if __name__ == "__main__":
    run_sniper()
