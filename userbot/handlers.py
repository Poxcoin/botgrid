"""
Aiogram 3 handlers for the public KADO bot.
Linking flow: /start <token> → matches TgLinkToken → links User.tg_chat_id + tg_username.
Menu: persistent reply keyboard with Account / Balance / Positions buttons.
WebApp: inline button to https://kadoclub.net/webapp under welcome messages.
"""
import asyncio
from datetime import datetime

from aiogram import F, Router
from aiogram.filters import Command, CommandObject, CommandStart
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    WebAppInfo,
)

from database import SessionLocal, TgLinkToken, User, UserApiKey, UserTrade
from userbot import texts
from userbot.exchange import bybit_balance, bybit_positions, init_user_exchange

WEBAPP_URL = "https://kadoclub.net/webapp"


def _webapp_kb() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(text="📊 Open App", web_app=WebAppInfo(url=WEBAPP_URL))
    ]])


def _menu_keyboard() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text=texts.BTN_ACCOUNT)],
            [KeyboardButton(text=texts.BTN_BALANCE), KeyboardButton(text=texts.BTN_POSITIONS)],
        ],
        resize_keyboard=True,
        is_persistent=True,
    )


def _fmt_dt(dt) -> str:
    return dt.strftime("%Y-%m-%d") if dt else "—"


def _linked_user(chat_id: str):
    """Return (User, db) or (None, db) for the given chat_id. Caller must close db."""
    db = SessionLocal()
    user = db.query(User).filter(User.tg_chat_id == chat_id).first()
    return user, db


router = Router()


# ── /start with deep-link token ──────────────────────────────────────────────
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
        if link is None or link.used_at is not None:
            await message.answer(texts.LINK_TOKEN_INVALID, parse_mode="HTML")
            return
        if link.expires_at < datetime.utcnow():
            await message.answer(texts.LINK_TOKEN_EXPIRED, parse_mode="HTML")
            return

        user = db.query(User).filter(User.id == link.user_id).first()
        if user is None or not user.is_active:
            await message.answer(texts.LINK_TOKEN_INVALID, parse_mode="HTML")
            return

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
        await message.answer("Меню готове 👇", reply_markup=_menu_keyboard())
    finally:
        db.close()


# ── /start (no token) ────────────────────────────────────────────────────────
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
            await message.answer("Меню 👇", reply_markup=_menu_keyboard())
        else:
            await message.answer(texts.START_NOT_LINKED, parse_mode="HTML")
    finally:
        db.close()


# ── /menu and /help ──────────────────────────────────────────────────────────
@router.message(Command("menu"))
@router.message(Command("help"))
async def cmd_menu(message: Message):
    await message.answer(texts.MENU, parse_mode="HTML", reply_markup=_menu_keyboard())


# ── Account: /account command + 👤 Акаунт button ─────────────────────────────
async def _send_account(message: Message):
    user, db = _linked_user(str(message.chat.id))
    try:
        if not user:
            await message.answer(texts.NOT_LINKED, parse_mode="HTML")
            return

        trial_line = ""
        if user.plan == "trial" and user.trial_ends_at:
            trial_line = f" (до {_fmt_dt(user.trial_ends_at)})"

        has_keys = db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit").count() > 0
        api_status = "✓ підключені" if has_keys else "— не підключені"
        status = "✓ активний" if user.is_active else "✗ заблокований"

        await message.answer(
            texts.ACCOUNT_INFO.format(
                email=user.email,
                username=user.username,
                plan=user.effective_plan.upper(),
                trial_line=trial_line,
                status=status,
                api_status=api_status,
                ref_code=user.ref_code or "—",
                created_at=_fmt_dt(user.created_at),
            ),
            parse_mode="HTML",
        )
    finally:
        db.close()


@router.message(Command("account"))
@router.message(F.text == texts.BTN_ACCOUNT)
async def cmd_account(message: Message):
    await _send_account(message)


# ── Balance: /balance command + 💰 Баланс button ─────────────────────────────
async def _send_balance(message: Message):
    user, db = _linked_user(str(message.chat.id))
    try:
        if not user:
            await message.answer(texts.NOT_LINKED, parse_mode="HTML")
            return

        key_row = db.query(UserApiKey).filter_by(user_id=user.id, exchange="bybit").first()
        if not key_row:
            await message.answer(texts.NO_API_KEYS, parse_mode="HTML")
            return

        ex = init_user_exchange(key_row)
        if not ex:
            await message.answer(texts.EXCHANGE_ERROR, parse_mode="HTML")
            return

        try:
            b = await asyncio.to_thread(bybit_balance, ex)
        except Exception:
            await message.answer(texts.EXCHANGE_ERROR, parse_mode="HTML")
            return

        upnl = b["unrealized_pnl"]
        await message.answer(
            texts.BALANCE_INFO.format(
                testnet_tag=" (testnet)" if key_row.is_testnet else "",
                wallet=b["wallet"],
                equity=b["equity"],
                free=b["usdt_free"],
                upnl=upnl,
                upnl_sign="+" if upnl >= 0 else "",
            ),
            parse_mode="HTML",
        )
    finally:
        db.close()


@router.message(Command("balance"))
@router.message(F.text == texts.BTN_BALANCE)
async def cmd_balance(message: Message):
    await _send_balance(message)


# ── Positions: /positions command + 📊 Позиції button (from UserTrade DB) ────
async def _send_positions(message: Message):
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


@router.message(Command("positions"))
@router.message(F.text == texts.BTN_POSITIONS)
async def cmd_positions(message: Message):
    await _send_positions(message)


# ── /pnl — closed-trade statistics ───────────────────────────────────────────
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
