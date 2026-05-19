"""
Aiogram 3 handlers for the public KADO bot.
Linking flow: /start <token> → matches TgLinkToken → links User.tg_chat_id + tg_username.
"""
from datetime import datetime

from aiogram import Router
from aiogram.filters import CommandStart, Command, CommandObject
from aiogram.types import (
    Message, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo,
)

from database import SessionLocal, User, TgLinkToken, UserTrade
from userbot import texts

WEBAPP_URL = "https://kadoclub.net/webapp"

def _webapp_kb():
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="📊 Open App", web_app=WebAppInfo(url=WEBAPP_URL))
    ]])

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
            reply_markup=_webapp_kb(),
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
                reply_markup=_webapp_kb(),
            )
        else:
            await message.answer(texts.START_NOT_LINKED, parse_mode="HTML")
    finally:
        db.close()


def _linked_user(chat_id: str):
    """Return (User, db) or (None, db) for the given chat_id."""
    db = SessionLocal()
    user = db.query(User).filter(User.tg_chat_id == chat_id).first()
    return user, db


@router.message(Command("menu"))
@router.message(Command("help"))
async def cmd_menu(message: Message):
    await message.answer(texts.MENU, parse_mode="HTML")


@router.message(Command("pnl"))
async def cmd_pnl(message: Message):
    user, db = _linked_user(str(message.chat.id))
    try:
        if not user:
            await message.answer(texts.NOT_LINKED, parse_mode="HTML")
            return

        trades = (
            db.query(UserTrade)
            .filter(UserTrade.user_id == user.id, UserTrade.status == "closed")
            .all()
        )
        # Exclude ghost closes (pnl=0, exit≈entry)
        trades = [
            t for t in trades
            if not (
                float(t.pnl_usdt or 0) == 0
                and float(t.exit_price or 0) > 0
                and float(t.entry_price or 0) > 0
                and abs(float(t.exit_price) - float(t.entry_price)) / float(t.entry_price) < 0.0001
            )
        ]

        total     = len(trades)
        total_pnl = sum(float(t.pnl_usdt or 0) for t in trades)
        wins      = sum(1 for t in trades if float(t.pnl_usdt or 0) > 0)
        losses    = total - wins
        win_rate  = round(wins / total * 100, 1) if total else 0.0

        await message.answer(
            texts.PNL_STATS.format(
                total=total, wins=wins, losses=losses,
                win_rate=win_rate, total_pnl=total_pnl,
            ),
            parse_mode="HTML",
        )
    finally:
        db.close()


@router.message(Command("positions"))
async def cmd_positions(message: Message):
    user, db = _linked_user(str(message.chat.id))
    try:
        if not user:
            await message.answer(texts.NOT_LINKED, parse_mode="HTML")
            return

        trades = (
            db.query(UserTrade)
            .filter(UserTrade.user_id == user.id, UserTrade.status == "open")
            .order_by(UserTrade.opened_at.desc())
            .all()
        )

        if not trades:
            await message.answer(texts.POSITIONS_EMPTY, parse_mode="HTML")
            return

        lines = []
        for t in trades:
            coin = (t.symbol or "").split("/")[0].replace("USDT", "") or "?"
            icon = "🟢" if t.side == "LONG" else "🔴"
            lev  = f"x{t.leverage}" if t.leverage else ""
            ep   = f"@ {float(t.entry_price):.4f}" if t.entry_price else ""
            lines.append(f"{icon} <b>{coin}</b> {t.side} {lev} {ep}  [{t.source}]")

        await message.answer(
            texts.POSITIONS_LIST.format(count=len(trades), items="\n".join(lines)),
            parse_mode="HTML",
        )
    finally:
        db.close()
