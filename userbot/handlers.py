"""
Aiogram 3 handlers for the public KADO bot.
Linking flow: /start <token> → matches TgLinkToken → links User.tg_chat_id + tg_username.
"""
from datetime import datetime

from aiogram import Router
from aiogram.filters import CommandStart, Command, CommandObject
from aiogram.types import Message

from database import SessionLocal, User, TgLinkToken
from userbot import texts

router = Router()


@router.message(CommandStart(deep_link=True))
async def cmd_start_with_token(message: Message, command: CommandObject):
    """Handles /start <token> — the deep-link entry from the dashboard."""
    token = (command.args or "").strip()
    if not token:
        await message.answer(texts.START_NOT_LINKED, parse_mode="HTML")
        return

    chat_id  = str(message.chat.id)
    username = (message.from_user.username or "").strip()

    db = SessionLocal()
    try:
        link = db.query(TgLinkToken).filter(TgLinkToken.token == token).first()
        if link is None:
            await message.answer(texts.LINK_TOKEN_INVALID, parse_mode="HTML")
            return
        if link.used_at is not None:
            await message.answer(texts.LINK_TOKEN_INVALID, parse_mode="HTML")
            return
        if link.expires_at < datetime.utcnow():
            await message.answer(texts.LINK_TOKEN_EXPIRED, parse_mode="HTML")
            return

        user = db.query(User).filter(User.id == link.user_id).first()
        if user is None or not user.is_active:
            await message.answer(texts.LINK_TOKEN_INVALID, parse_mode="HTML")
            return

        # Link the account
        user.tg_chat_id  = chat_id
        user.tg_username = username
        link.used_at     = datetime.utcnow()
        db.commit()

        display_name = f"@{username}" if username else (message.from_user.first_name or "trader")
        await message.answer(
            texts.WELCOME_LINKED.format(name=display_name, plan=user.effective_plan.upper()),
            parse_mode="HTML",
        )
    finally:
        db.close()


@router.message(CommandStart())
async def cmd_start_plain(message: Message):
    """Handles bare /start — show status based on whether the chat is already linked."""
    chat_id = str(message.chat.id)

    db = SessionLocal()
    try:
        user = db.query(User).filter(User.tg_chat_id == chat_id).first()
        if user:
            await message.answer(
                texts.WELCOME_ALREADY_LINKED.format(email=user.email),
                parse_mode="HTML",
            )
        else:
            await message.answer(texts.START_NOT_LINKED, parse_mode="HTML")
    finally:
        db.close()


@router.message(Command("menu"))
async def cmd_menu(message: Message):
    await message.answer(texts.MENU_PLACEHOLDER, parse_mode="HTML")


@router.message(Command("help"))
async def cmd_help(message: Message):
    await message.answer(texts.MENU_PLACEHOLDER, parse_mode="HTML")
