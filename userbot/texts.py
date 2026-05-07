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

MENU_PLACEHOLDER = (
    "📊 <b>Меню</b>\n\n"
    "Скоро здесь будут команды для проверки баланса, PnL и позиций.\n"
    "Пока что бот шлёт уведомления — следи за чатом."
)
