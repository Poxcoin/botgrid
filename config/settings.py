import os
from dotenv import load_dotenv

load_dotenv()
# Получение API ключей из переменных окружения

CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY")
BYBIT_API_KEY = os.getenv("BYBIT_API_KEY")
BYBIT_SECRET = os.getenv("BYBIT_SECRET")
TG_BOT_TOKEN = os.getenv("TG_BOT_TOKEN")
TG_CHAT_ID = os.getenv("TG_CHAT_ID")

# Telegram Userbot (Telethon) — для чтения крипто-каналов в реальном времени
# Получить: my.telegram.org → API development tools
TELEGRAM_API_ID = os.getenv("TELEGRAM_API_ID", "")
TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH", "")
# Сессия генерируется один раз через setup_telegram_session.py
TELEGRAM_SESSION = os.getenv("TELEGRAM_SESSION", "")

# Gemini API (Google AI Studio)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
# Groq API (бесплатно 14400 req/day, LLaMA-3.1) — фильтр новостей
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
# Alchemy API — on-chain whale мониторинг (Ethereum)
ALCHEMY_API_KEY = os.getenv("ALCHEMY_API_KEY", "")

# Dashboard auth — MUST be set in .env, no insecure default
DASHBOARD_PASSWORD = os.getenv("DASHBOARD_PASSWORD", "")
if not DASHBOARD_PASSWORD:
    raise RuntimeError("DASHBOARD_PASSWORD is not set in .env — refusing to start with no auth")

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
LEVERAGE = 2                # Кредитное плечо x2 (снижено с 3x — меньше случайных SL)

TAKE_PROFIT_PERCENT = 10.0  # Целевая прибыль: закрываем позицию в плюс при +10% роста/падения
STOP_LOSS_PERCENT = 3.0     # Защита от потери: фиксируем убыток, если цена ушла против нас на 3%