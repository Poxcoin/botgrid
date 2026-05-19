import os
from dotenv import load_dotenv

load_dotenv()
# Получение API ключей из переменных окружения

CLAUDE_API_KEY = os.getenv("CLAUDE_API_KEY")
BYBIT_API_KEY = os.getenv("BYBIT_API_KEY")
BYBIT_SECRET = os.getenv("BYBIT_SECRET")
TG_BOT_TOKEN = os.getenv("TG_BOT_TOKEN")
TG_CHAT_ID = os.getenv("TG_CHAT_ID")

# Userbot — публічний бот для клієнтів SaaS (@KADO_c_BOT)
# Окремий токен від адмінського TG_BOT_TOKEN
USERBOT_TOKEN = os.getenv("USERBOT_TOKEN", "")
USERBOT_USERNAME = os.getenv("USERBOT_USERNAME", "KADO_c_BOT")

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
LEVERAGE = 2                # Плечо BTC/ETH (тепер тільки для Funding Rate/Grid, не news)

TAKE_PROFIT_PERCENT = 5.0   # TP для BTC/ETH (Funding Rate стратегія)
STOP_LOSS_PERCENT = 2.0     # SL для BTC/ETH

# Параметри для альткоінів — ТІЛЬКИ вони торгуються через news signal bot
# Статистика: alt-only 20 угод, 50% WR, +$7.65 (проти BTC/ETH/SOL 117 угод, 16% WR, -$86.70)
ALT_LEVERAGE = 2            # 3x→2x: зменшуємо ризик, alt-coin рухи без overshoot
ALT_TP = 5.0                # 12%→5%: TP 12% WR 14% < break-even 20%; 5% досяжніший
ALT_SL = 3.0                # 4%→3%: менше збитків при невірних сигналах
ALT_SIZE = 4.0              # 3%→4%: збільшуємо розмір оскільки кількість угод падає
MAX_TRADE_LOSS_USDT = 20.0  # Hard cap: примусово закрити якщо збиток > $20 (запобігає ZETA/STX катастрофам)
MIN_ALTCOIN_VOLUME_USD = 5_000_000  # Мінімальний 24h об'єм щоб уникнути неліквіду

# Signal bot торгівля: False = збираємо сигнали для статистики але НЕ торгуємо
# Вмикати тільки після накопичення 100+ угод з WR > 35%
SIGNAL_BOT_TRADING = os.getenv("SIGNAL_BOT_TRADING", "False").lower() == "true"

# FR Trading — незалежний від SIGNAL_BOT_TRADING
# Варіант А: чиста funding collection (вхід за 20хв, вихід через 3хв після funding)
FR_TRADING = os.getenv("FR_TRADING", "False").lower() == "true"

# ─── Cascade bot — незалежне управління ──────────────────────────────────────
# CASCADE_TRADING: вмикає реальне виконання угод каскадним ботом.
# Незалежний від SIGNAL_BOT_TRADING — можна вмикати/вимикати окремо.
CASCADE_TRADING = os.getenv("CASCADE_TRADING", "False").lower() == "true"

# CASCADE_LIVE_MODE=True → cascade bot використовує live Bybit ключі
# навіть якщо IS_DEMO_TRADING=True (для всіх інших ботів).
# Встановлювати тільки після підтвердженого WR ≥ 29% на 30+ демо-угодах.
CASCADE_LIVE_MODE      = os.getenv("CASCADE_LIVE_MODE", "False").lower() == "true"
CASCADE_LIVE_API_KEY   = os.getenv("CASCADE_LIVE_API_KEY", "")
CASCADE_LIVE_SECRET    = os.getenv("CASCADE_LIVE_SECRET", "")

# CASCADE_IS_DEMO: застаріло, залишено для сумісності
CASCADE_IS_DEMO      = os.getenv("CASCADE_IS_DEMO", "False").lower() == "true"
CASCADE_DEMO_API_KEY = os.getenv("CASCADE_DEMO_API_KEY", "")
CASCADE_DEMO_SECRET  = os.getenv("CASCADE_DEMO_SECRET", "")

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

# ==========================================
# TELEGRAM CHANNEL — public signal publishing
# ==========================================
# Channel ID (починається з -100...). Отримати: @userinfobot → forward з каналу
# Залишити порожнім щоб не публікувати сигнали в канал
TELEGRAM_CHANNEL_ID = os.getenv("TELEGRAM_CHANNEL_ID", "")

# User ID власника (Poxcoin) у saas_database.sqlite — для дублювання угод системного бота
# на user dashboard. Отримати: SELECT id FROM users WHERE email='...' у saas_database.sqlite
OWNER_USER_ID = int(os.getenv("OWNER_USER_ID", "0") or "0")

# ─── Pairs Trading (BTC/ETH spread mean-reversion) ────────────────────────────
PAIRS_TRADING = os.getenv("PAIRS_TRADING", "False").lower() == "true"


# ── Orderflow Bot (BTC/ETH/SOL) ───────────────────────────────────────────────
ORDERFLOW_TRADING = os.getenv("ORDERFLOW_TRADING", "False").lower() == "true"

# ── Liquidity Sweep Reversal Bot (ETH/SOL) ────────────────────────────────────
SWEEP_TRADING = os.getenv("SWEEP_TRADING", "True").lower() == "true"

# ── Order Block (SMC) Bot (BTC/ETH/SOL) ──────────────────────────────────────
OB_TRADING = os.getenv("OB_TRADING", "True").lower() == "true"

# ── Funding Rate Extreme Reversal Bot ─────────────────────────────────────────
FR_EXTREME_TRADING = os.getenv("FR_EXTREME_TRADING", "True").lower() == "true"
