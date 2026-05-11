"""
User-facing message templates for @KADO_c_BOT.
Mostly RU/UA — matches dashboard tone.
"""

WELCOME_LINKED = (
    "✓ <b>Аккаунт подключён</b>\n\n"
    "Привет, {name}! Твой KADO-аккаунт привязан к этому чату.\n"
    "Сюда будут приходить уведомления о сделках, прибыли и счетах.\n\n"
    "План: <b>{plan}</b>"
)

WELCOME_ALREADY_LINKED = (
    "Ты уже подключён к KADO как <b>{email}</b>.\n"
    "Если хочешь сменить аккаунт — отвяжи в настройках на сайте."
)

LINK_TOKEN_INVALID = (
    "❌ Ссылка недействительна или уже была использована.\n\n"
    "Зайди в личный кабинет на kadoclub.net → Settings → Telegram → нажми "
    "<b>«Подключить Telegram»</b>, чтобы получить новую ссылку."
)

LINK_TOKEN_EXPIRED = (
    "⏱ Срок действия ссылки истёк.\n\n"
    "Сгенерируй новую: kadoclub.net → Settings → Telegram → <b>«Подключить Telegram»</b>."
)

START_NOT_LINKED = (
    "Привет!\n\n"
    "Это бот для клиентов <b>KADO</b>. Чтобы получать уведомления о торговле:\n"
    "1. Зарегистрируйся на kadoclub.net\n"
    "2. Открой Settings → Telegram\n"
    "3. Нажми <b>«Подключить Telegram»</b>\n\n"
    "Бот сам тебя узнает и пришлёт приветствие."
)

UNKNOWN_COMMAND = (
    "Не знаю такой команды. Используй /menu, чтобы посмотреть что я умею."
)

BTN_START   = "🚀 Старт"
BTN_MENU    = "📋 Меню"
BTN_ACCOUNT = "👤 Аккаунт"

MENU = (
    "📊 <b>Команды</b>\n\n"
    "/balance — баланс и нереализованный PnL\n"
    "/positions — открытые позиции\n"
    "/pnl — статистика прибыли\n"
    "/account — твой аккаунт\n"
    "/help — справка"
)

ACCOUNT_TPL = (
    "👤 <b>Аккаунт</b>\n\n"
    "Email: <b>{email}</b>\n"
    "План: <b>{plan}</b>{trial_line}\n"
    "API-ключ: {api_status}\n"
    "Реферальный код: <code>{ref_code}</code>"
)

NOT_LINKED = (
    "Этот чат ещё не привязан к аккаунту KADO.\n"
    "Зайди на kadoclub.net → Settings → Telegram и нажми <b>«Подключить Telegram»</b>."
)

NO_API_KEY = (
    "🔑 API-ключ не подключён.\n"
    "Добавь Bybit-ключ в Settings → API Keys на kadoclub.net — после этого станут доступны "
    "/balance, /positions и автоторговля."
)

EXCHANGE_ERROR = (
    "⚠️ Не удалось получить данные с биржи. Попробуй через минуту.\n"
    "Если повторяется — проверь, что API-ключ активен в Settings → API Keys."
)

BALANCE_TPL = (
    "💼 <b>Bybit (USDT)</b>\n\n"
    "Wallet: <b>{wallet}</b>\n"
    "Equity: <b>{equity}</b>\n"
    "Unrealized PnL: <b>{upnl}</b>"
)

POSITIONS_EMPTY = "📭 Открытых позиций нет."

POSITIONS_HEADER = "📈 <b>Открытые позиции ({n})</b>\n\n"

PNL_TPL = (
    "📊 <b>PnL</b>\n\n"
    "Сегодня: <b>{today_pnl}</b> ({today_n} сделок, WR {today_wr}%)\n"
    "7 дней: <b>{week_pnl}</b> ({week_n} сделок, WR {week_wr}%)\n"
    "30 дней: <b>{month_pnl}</b> ({month_n} сделок, WR {month_wr}%)\n"
    "Всё время: <b>{all_pnl}</b> ({all_n} сделок, WR {all_wr}%)"
)

DB_TEMP_ERROR = (
    "⚠️ Временная ошибка базы данных. Попробуй ещё раз через минуту.\n"
    "Если повторяется — напиши в поддержку."
)
