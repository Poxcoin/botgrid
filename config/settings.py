import os
from dotenv import load_dotenv

load_dotenv()
# Получение API ключей из переменных окружения

CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY")
BYBIT_API_KEY = os.getenv("BYBIT_API_KEY")
BYBIT_SECRET = os.getenv("BYBIT_SECRET")
TG_BOT_TOKEN = os.getenv("TG_BOT_TOKEN")
TG_CHAT_ID = os.getenv("TG_CHAT_ID")

# Dashboard auth — set a strong password in .env
DASHBOARD_PASSWORD = os.getenv("DASHBOARD_PASSWORD", "changeme123")

# NewsAPI — для бутстрапа архива новостей (replay backtester)
NEWSAPI_KEY = os.getenv("NEWSAPI_KEY", "")

# ==========================================
# ТОРГОВЫЕ НАСТРОЙКИ (РИСК-МЕНЕДЖМЕНТ)
# ==========================================
# Настройки сети (Testnet или Demo/Mainnet)
# По умолчанию True (Testnet). Установите False в .env для Demo или Real.
USE_TESTNET = os.getenv("USE_TESTNET", "True").lower() == "true"
IS_DEMO_TRADING = os.getenv("IS_DEMO_TRADING", "False").lower() == "true"
TRADE_PERCENT_SIZE = 5      # Мы заходим на 5% от свободного баланса USDT
LEVERAGE = 3                # Кредитное плечо x3

TAKE_PROFIT_PERCENT = 10.0  # Целевая прибыль: закрываем позицию в плюс при +10% роста/падения
STOP_LOSS_PERCENT = 3.0     # Защита от потери: фиксируем убыток, если цена ушла против нас на 3%