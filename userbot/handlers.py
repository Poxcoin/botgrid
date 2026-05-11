"""
Aiogram 3 handlers for the public KADO bot.
Linking flow: /start <token> → matches TgLinkToken → links User.tg_chat_id + tg_username.
"""
import logging
from datetime import datetime

from aiogram import Router
from aiogram.filters import CommandStart, Command, CommandObject
from aiogram.types import Message
from sqlalchemy.exc import SQLAlchemyError

from database import SessionLocal, User, TgLinkToken
from userbot import data, texts

log = logging.getLogger("userbot")

router = Router()


def _fmt_usd(v: float) -> str:
    """+12.34 / -5.67 / 0.00 — short signed USD."""
    return f"{v:+,.2f}" if v else "0.00"


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
    except SQLAlchemyError:
        db.rollback()
        log.exception("DB error in cmd_start_with_token (chat_id=%s)", chat_id)
        await message.answer(texts.DB_TEMP_ERROR, parse_mode="HTML")
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
    except SQLAlchemyError:
        db.rollback()
        log.exception("DB error in cmd_start_plain (chat_id=%s)", chat_id)
        await message.answer(texts.DB_TEMP_ERROR, parse_mode="HTML")
    finally:
        db.close()


@router.message(Command("menu"))
async def cmd_menu(message: Message):
    await message.answer(texts.MENU, parse_mode="HTML")


@router.message(Command("help"))
async def cmd_help(message: Message):
    await message.answer(texts.MENU, parse_mode="HTML")


@router.message(Command("balance"))
async def cmd_balance(message: Message):
    chat_id = str(message.chat.id)
    db = SessionLocal()
    try:
        user = data.get_user_by_chat(db, chat_id)
        if not user:
            await message.answer(texts.NOT_LINKED, parse_mode="HTML")
            return
        bal = data.get_bybit_balance(user, db)
        if bal is None:
            # Distinguish "no key" from "exchange error"
            has_key = any(k.exchange == "bybit" for k in user.api_keys)
            await message.answer(
                texts.EXCHANGE_ERROR if has_key else texts.NO_API_KEY,
                parse_mode="HTML",
            )
            return
        await message.answer(
            texts.BALANCE_TPL.format(
                wallet=f"{bal['wallet']:,.2f}",
                equity=f"{bal['equity']:,.2f}",
                upnl=_fmt_usd(bal["unrealized_pnl"]),
            ),
            parse_mode="HTML",
        )
    except SQLAlchemyError:
        db.rollback()
        log.exception("DB error in cmd_balance (chat_id=%s)", chat_id)
        await message.answer(texts.DB_TEMP_ERROR, parse_mode="HTML")
    finally:
        db.close()


@router.message(Command("positions"))
async def cmd_positions(message: Message):
    chat_id = str(message.chat.id)
    db = SessionLocal()
    try:
        user = data.get_user_by_chat(db, chat_id)
        if not user:
            await message.answer(texts.NOT_LINKED, parse_mode="HTML")
            return
        positions = data.get_bybit_positions(user, db)
        if positions is None:
            has_key = any(k.exchange == "bybit" for k in user.api_keys)
            await message.answer(
                texts.EXCHANGE_ERROR if has_key else texts.NO_API_KEY,
                parse_mode="HTML",
            )
            return
        if not positions:
            await message.answer(texts.POSITIONS_EMPTY, parse_mode="HTML")
            return

        lines = [texts.POSITIONS_HEADER.format(n=len(positions))]
        for p in positions:
            arrow = "🟢" if p["side"] == "LONG" else "🔴"
            lines.append(
                f"{arrow} <b>{p['symbol']}</b> {p['side']} ×{p['leverage']}\n"
                f"   entry {p['entry_price']:g} → mark {p['mark_price']:g}\n"
                f"   uPnL <b>{_fmt_usd(p['unrealized_pnl'])}</b> ({p['pnl_pct']:+.2f}%)"
            )
        await message.answer("\n\n".join(lines), parse_mode="HTML")
    except SQLAlchemyError:
        db.rollback()
        log.exception("DB error in cmd_positions (chat_id=%s)", chat_id)
        await message.answer(texts.DB_TEMP_ERROR, parse_mode="HTML")
    finally:
        db.close()


@router.message(Command("pnl"))
async def cmd_pnl(message: Message):
    chat_id = str(message.chat.id)
    db = SessionLocal()
    try:
        user = data.get_user_by_chat(db, chat_id)
        if not user:
            await message.answer(texts.NOT_LINKED, parse_mode="HTML")
            return
        s = data.get_user_pnl_stats(user, db)
        await message.answer(
            texts.PNL_TPL.format(
                today_pnl=_fmt_usd(s["today"]["pnl"]), today_n=s["today"]["trades"], today_wr=s["today"]["wr"],
                week_pnl =_fmt_usd(s["week"]["pnl"]),  week_n =s["week"]["trades"],  week_wr =s["week"]["wr"],
                month_pnl=_fmt_usd(s["month"]["pnl"]), month_n=s["month"]["trades"], month_wr=s["month"]["wr"],
                all_pnl  =_fmt_usd(s["all"]["pnl"]),   all_n  =s["all"]["trades"],   all_wr  =s["all"]["wr"],
            ),
            parse_mode="HTML",
        )
    except SQLAlchemyError:
        db.rollback()
        log.exception("DB error in cmd_pnl (chat_id=%s)", chat_id)
        await message.answer(texts.DB_TEMP_ERROR, parse_mode="HTML")
    finally:
        db.close()
