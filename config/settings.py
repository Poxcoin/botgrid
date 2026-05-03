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
LEVERAGE = 2                # Плечо BTC/ETH (стабільні, менше шуму)

TAKE_PROFIT_PERCENT = 5.0   # TP для BTC/ETH — новинний рух 2-4%, 5% реально
STOP_LOSS_PERCENT = 2.0     # SL для BTC/ETH — якщо не пішло одразу, виходимо

# Параметри для альткоінів (будь-яка монета крім BTC/ETH)
ALT_LEVERAGE = 3            # Вищий потенціал руху у альтів
ALT_TP = 10.0               # Альти рухаються більше, але 20% це занадто довго чекати
ALT_SL = 4.0                # Тісніший SL — менше збитків на поганих угодах
ALT_SIZE = 3.0              # % балансу на угоду
MIN_ALTCOIN_VOLUME_USD = 5_000_000  # Мінімальний 24h об'єм щоб уникнути неліквіду

# Signal bot торгівля: False = збираємо сигнали для статистики але НЕ торгуємо
# Вмикати тільки після накопичення 100+ угод з WR > 35%
SIGNAL_BOT_TRADING = os.getenv("SIGNAL_BOT_TRADING", "False").lower() == "true"

# Параметри для нових лістингів (listing fast-path)
LISTING_LEVERAGE = 5        # Перші години після лістингу = великий памп
LISTING_TP = 20.0
LISTING_SL = 7.0            # 7% / 5x = 1.4% реального руху ціни — нормальний шум
LISTING_SIZE = 2.0          # Малий розмір бо ризик підвищений

# ==========================================
# DEX Sniper (BSC/PancakeSwap)
# ==========================================
BSC_WSS_URL = os.getenv("BSC_WSS_URL", "wss://bsc-ws-node.nariox.org:443")
SNIPER_PRIVATE_KEY = os.getenv("SNIPER_PRIVATE_KEY", "")
SNIPER_BUY_AMOUNT_BNB = float(os.getenv("SNIPER_BUY_AMOUNT_BNB", "0.05"))
SNIPER_TAKE_PROFIT_PCT = 100.0          # +100% = 2x
SNIPER_STOP_LOSS_PCT = 50.0             # -50%
SNIPER_MAX_TAX_PCT = 8.0                # max buy+sell tax
SNIPER_MIN_LIQUIDITY_BNB = 10.0         # min BNB in pool
SNIPER_TIME_LIMIT_MIN = 30              # exit after 30 min if no movement
SNIPER_TRAIL_ACTIVATE_PCT = 30.0        # activate trailing after +30%
SNIPER_TRAIL_DISTANCE_PCT = 15.0        # trail 15% below peak price
SNIPER_MIN_LP_LOCK_PCT = 50.0           # min locked LP % (0 = skip check)
SNIPER_MAX_DEPLOYER_CONTRACTS = 5       # block if creator deployed >N contracts in 30d
# JWT
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "")

# ==========================================
# EMAIL (SMTP) — для верификации email
# ==========================================
# Gmail: SMTP_HOST=smtp.gmail.com SMTP_PORT=587
# Оставь пустым — регистрация будет работать, но письма не отправятся
SMTP_HOST     = os.getenv("SMTP_HOST", "")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "")      # your@gmail.com
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")  # Gmail App Password (не основной пароль)
SMTP_FROM     = os.getenv("SMTP_FROM", SMTP_USER)
SITE_URL      = os.getenv("SITE_URL", "https://kadoclub.net")

# ==========================================
# BILLING — Manual USDT invoice (TRC-20)
# ==========================================
USDT_WALLET_TRC20 = os.getenv("USDT_WALLET_TRC20", "")
