"""
User-facing message templates for @KADO_c_BOT.
Mostly RU/UA — matches dashboard tone.
"""

# ── Reply-keyboard button labels (used as F.text filters in handlers) ────────
BTN_ACCOUNT   = "👤 Акаунт"
BTN_BALANCE   = "💰 Баланс"
BTN_POSITIONS = "📊 Позиції"


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
    "Не знаю такой команды. Используй /menu или кнопки ниже."
)

MENU = (
    "📊 <b>KADO Bot</b>\n\n"
    "👤 Акаунт — твій план, статус, реф-код\n"
    "💰 Баланс — депозит і нереалізований PnL на Bybit\n"
    "📊 Позиції — відкриті угоди\n\n"
    "Команди:\n"
    "/account — акаунт\n"
    "/balance — баланс Bybit\n"
    "/positions — відкриті позиції\n"
    "/pnl — статистика по закритих угодах\n"
    "/help — ця довідка\n\n"
    "Сайт: kadoclub.net"
)

NOT_LINKED = (
    "❌ Цей чат не прив'язаний до KADO-акаунту.\n"
    "Відкрий kadoclub.net → Settings → Telegram."
)

PNL_STATS = (
    "📈 <b>PnL — всього</b>\n\n"
    "Угод: {total}  ✅ {wins}W  ❌ {losses}L  WR {win_rate}%\n"
    "Сумарно: <b>{total_pnl:+.2f} USDT</b>"
)

POSITIONS_EMPTY = "Відкритих позицій немає."

POSITIONS_LIST = (
    "📋 <b>Відкриті позиції ({count})</b>\n\n"
    "{items}"
)


# ── Account view (new) ────────────────────────────────────────────────────────
ACCOUNT_INFO = (
    "👤 <b>Акаунт</b>\n\n"
    "Email: <code>{email}</code>\n"
    "Username: <code>{username}</code>\n"
    "План: <b>{plan}</b>{trial_line}\n"
    "Статус: {status}\n"
    "API-ключі Bybit: {api_status}\n"
    "Реф-код: <code>{ref_code}</code>\n"
    "Реєстрація: {created_at}"
)


# ── Balance view (new) ───────────────────────────────────────────────────────
BALANCE_INFO = (
    "💰 <b>Баланс Bybit</b>{testnet_tag}\n\n"
    "Wallet:      <b>{wallet:.2f}</b> USDT\n"
    "Equity:      <b>{equity:.2f}</b> USDT\n"
    "Available:   <b>{free:.2f}</b> USDT\n"
    "Нереал. PnL: <b>{upnl_sign}{upnl:.2f}</b> USDT"
)

NO_API_KEYS = (
    "🔑 У тебе ще не підключені API-ключі Bybit.\n\n"
    "Зайди на kadoclub.net → Settings → Bybit API і підключи ключі — тоді я зможу показувати баланс."
)

EXCHANGE_ERROR = (
    "⚠️ Не вдалося отримати дані з Bybit зараз.\n"
    "Спробуй за хвилину. Якщо повторюється — перевір ключі в особистому кабінеті."
)
