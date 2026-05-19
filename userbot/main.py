"""
@KADO_c_BOT — public Telegram bot for KADO SaaS clients.
Run as a standalone process (systemd unit kado-userbot.service).

Entrypoint:
    python -m userbot.main
"""
import asyncio
import logging
import sys

from aiogram import Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.types import MenuButtonWebApp, WebAppInfo

from config.settings import USERBOT_TOKEN
from userbot.handlers import router, WEBAPP_URL

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [userbot] %(levelname)s: %(message)s",
)
log = logging.getLogger("userbot")


async def main():
    if not USERBOT_TOKEN:
        log.error("USERBOT_TOKEN is not set — refusing to start")
        sys.exit(1)

    bot = Bot(
        token=USERBOT_TOKEN,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dp = Dispatcher()
    dp.include_router(router)

    me = await bot.get_me()
    log.info("Bot online as @%s (id=%s)", me.username, me.id)

    await bot.set_my_commands([
        {"command": "menu", "description": "Главное меню"},
        {"command": "help", "description": "Помощь"},
    ])

    await bot.set_chat_menu_button(
        menu_button=MenuButtonWebApp(text="Dashboard", web_app=WebAppInfo(url=WEBAPP_URL))
    )

    try:
        await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())
    finally:
        await bot.session.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        log.info("Shutting down")
