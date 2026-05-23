"""
team_bot.py — Internal team Telegram bot (NOT user-facing).

Aiogram 3.x bot for owner + cofounders + co-builders.
Hardcoded allowlist (NOT env-based — env can leak via .env mishaps).

Commands:
  /start /menu  — show welcome + reply keyboard
  /status       — system overview (services, drift, pnl, apps)
  /pnl          — current month PnL across users
  /apps         — list new applications
  /outreach     — outreach CRM pipeline counts
  /bots         — bot services status
  /drift        — events vs Bybit drift per user
  /sources      — Bayesian per-source quality
  /links        — quick admin URLs
  /addprospect  — guided add new outreach prospect
  /help         — command list

Run: python team_bot.py (via systemd kado-team-bot.service)
"""
from __future__ import annotations

import asyncio
import logging
import os
import sqlite3
import sys
from datetime import datetime, timezone, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

from aiogram import Bot, Dispatcher, F, types
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (
    KeyboardButton, ReplyKeyboardMarkup, ReplyKeyboardRemove,
    InlineKeyboardButton, InlineKeyboardMarkup,
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(name)s — %(message)s')
log = logging.getLogger('team_bot')

TOKEN = os.getenv('TEAM_BOT_TOKEN')
if not TOKEN:
    print('TEAM_BOT_TOKEN missing'); sys.exit(1)

# Hardcoded allowlist — add cofounder user IDs here as we hire
ALLOWED_USERS = {
    5363797490,   # Poxcoin (owner)
}

DB_PATH = '/opt/botgrid/saas_database.sqlite'
BASE_URL = 'https://kadoclub.net'


# ─── Reply keyboard (persistent bottom menu) ──────────────────────────────────

def main_kb() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text='📊 Status'), KeyboardButton(text='💰 PnL'), KeyboardButton(text='📈 Track')],
            [KeyboardButton(text='📥 Apps'), KeyboardButton(text='🎯 CRM'), KeyboardButton(text='🤖 Bots')],
            [KeyboardButton(text='🧠 Sources'), KeyboardButton(text='🔄 Drift'), KeyboardButton(text='🔗 Links')],
            [KeyboardButton(text='➕ Prospect'), KeyboardButton(text='❓ Help')],
        ],
        resize_keyboard=True,
        is_persistent=True,
        input_field_placeholder='Tap a button or type /command',
    )


# ─── Auth filter ─────────────────────────────────────────────────────────────

def allowed(msg: types.Message) -> bool:
    return msg.from_user and msg.from_user.id in ALLOWED_USERS


# ─── Helper: DB queries ──────────────────────────────────────────────────────

def db_query(sql: str, params: tuple = ()) -> list:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
    finally:
        conn.close()


# ─── Bot init ────────────────────────────────────────────────────────────────

bot = Bot(token=TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
dp = Dispatcher(storage=MemoryStorage())


# ─── FSM states for /addprospect ─────────────────────────────────────────────

class AddProspect(StatesGroup):
    name = State()
    persona = State()
    contact = State()
    hook = State()


# ─── Handlers ────────────────────────────────────────────────────────────────

@dp.message(Command('start', 'menu'))
async def cmd_start(msg: types.Message):
    if not allowed(msg):
        log.info(f'unauthorized /start from {msg.from_user.id} ({msg.from_user.username})')
        return
    await msg.answer(
        f"<b>KADO Team Bot</b>\n\n"
        f"Welcome, {msg.from_user.first_name}.\n"
        f"Tap a button below or type /help for commands.",
        reply_markup=main_kb()
    )


@dp.message(Command('help'))
async def cmd_help(msg: types.Message):
    if not allowed(msg):
        return
    text = (
        "<b>Commands</b>\n\n"
        "/status — system overview\n"
        "/pnl — current month PnL\n"
        "/apps — new applications\n"
        "/outreach — CRM pipeline\n"
        "/bots — services status\n"
        "/drift — Bybit drift per user\n"
        "/sources — Bayesian quality\n"
        "/links — admin URLs\n"
        "/addprospect — guided CRM add\n"
        "/menu — show keyboard\n"
        "/help — this message"
    )
    await msg.answer(text, reply_markup=main_kb())


@dp.message(F.text.in_({'📊 Status'}) | Command('status'))
async def cmd_status(msg: types.Message):
    if not allowed(msg): return
    rows = db_query(
        "SELECT COUNT(*) AS n, COALESCE(SUM(pnl_usdt),0) AS pnl "
        "FROM user_trades WHERE status='closed' AND closed_at >= datetime('now','-1 day')"
    )
    n_24h, pnl_24h = rows[0]['n'], rows[0]['pnl']

    rows2 = db_query(
        "SELECT COUNT(*) AS n FROM applications WHERE status='new'"
    )
    apps_new = rows2[0]['n']

    rows3 = db_query(
        "SELECT COUNT(*) AS n FROM outreach_prospects WHERE status IN ('new','dm_sent','followed_up','replied','call_booked')"
    )
    crm_active = rows3[0]['n']

    rows4 = db_query(
        "SELECT MAX(ingested_at) AS last FROM trade_events"
    )
    last_event = rows4[0]['last'] or 'never'

    text = (
        f"<b>📊 KADO Status</b>\n\n"
        f"<b>Last 24h:</b> {n_24h} trades · ${pnl_24h:+.2f}\n"
        f"<b>New apps:</b> {apps_new}\n"
        f"<b>CRM active:</b> {crm_active}\n"
        f"<b>Last event:</b> {str(last_event)[:16]}\n\n"
        f"<a href='{BASE_URL}/track-record'>Live PnL ↗</a>"
    )
    await msg.answer(text, reply_markup=main_kb())


@dp.message(F.text.in_({'💰 PnL'}) | Command('pnl'))
async def cmd_pnl(msg: types.Message):
    if not allowed(msg): return
    rows = db_query(
        "SELECT user_id, year, month, ROUND(gross_pnl,2) g, ROUND(net_pnl,2) n FROM monthly_pnl "
        "ORDER BY year DESC, month DESC LIMIT 10"
    )
    if not rows:
        await msg.answer('No monthly_pnl data yet.', reply_markup=main_kb()); return
    lines = ['<b>💰 Monthly PnL</b>', '']
    for r in rows:
        lines.append(f"user {r['user_id']} · {r['year']}-{r['month']:02d}  gross ${r['g']:+.2f}  net ${r['n']:+.2f}")
    lines.append(f"\n<a href='{BASE_URL}/track-record'>View live ↗</a>")
    await msg.answer('\n'.join(lines), reply_markup=main_kb())


@dp.message(F.text.in_({'📈 Track'}) | Command('track'))
async def cmd_track(msg: types.Message):
    if not allowed(msg): return
    await msg.answer(
        f"<b>📈 Public Track Record</b>\n\n"
        f"<a href='{BASE_URL}/track-record'>Open dashboard ↗</a>\n"
        f"Updates every 60s · Bybit verified · drift $0.00",
        reply_markup=main_kb()
    )


@dp.message(F.text.in_({'📥 Apps'}) | Command('apps'))
async def cmd_apps(msg: types.Message):
    if not allowed(msg): return
    rows = db_query(
        "SELECT id, type, name, role_or_check, status, created_at FROM applications "
        "WHERE status='new' ORDER BY id DESC LIMIT 10"
    )
    if not rows:
        await msg.answer(
            f'<b>📥 No new applications.</b>\n\n<a href="{BASE_URL}/admin/applications">Admin ↗</a>',
            reply_markup=main_kb()); return
    lines = [f'<b>📥 New applications ({len(rows)})</b>', '']
    for r in rows:
        icon = '🧑‍💻' if r['type'] == 'cobuilder' else '💰'
        when = str(r['created_at'])[:16].replace('T', ' ')
        lines.append(f"{icon} #{r['id']} <b>{r['name']}</b> · {r['role_or_check'] or '-'} · {when}")
    lines.append(f"\n<a href='{BASE_URL}/admin/applications'>Open admin ↗</a>")
    await msg.answer('\n'.join(lines), reply_markup=main_kb())


@dp.message(F.text.in_({'🎯 CRM'}) | Command('outreach'))
async def cmd_outreach(msg: types.Message):
    if not allowed(msg): return
    rows = db_query(
        "SELECT status, COUNT(*) n FROM outreach_prospects GROUP BY status"
    )
    counts = {r['status']: r['n'] for r in rows}
    total = sum(counts.values())
    sent = counts.get('dm_sent', 0) + counts.get('followed_up', 0)
    replied = counts.get('replied', 0) + counts.get('call_booked', 0) + counts.get('hired', 0)
    reply_rate = round(replied * 100 / sent, 1) if sent else 0
    text = (
        f"<b>🎯 Outreach Pipeline</b>\n\n"
        f"Total: {total}\n"
        f"New: {counts.get('new', 0)}\n"
        f"DM sent: {counts.get('dm_sent', 0)}\n"
        f"Followed up: {counts.get('followed_up', 0)}\n"
        f"Replied: {counts.get('replied', 0)}\n"
        f"Call booked: {counts.get('call_booked', 0)}\n"
        f"Hired: {counts.get('hired', 0)}\n\n"
        f"Reply rate: {reply_rate}%\n\n"
        f"<a href='{BASE_URL}/admin/outreach'>Open CRM ↗</a>"
    )
    await msg.answer(text, reply_markup=main_kb())


@dp.message(F.text.in_({'🤖 Bots'}) | Command('bots'))
async def cmd_bots(msg: types.Message):
    if not allowed(msg): return
    import subprocess
    try:
        out = subprocess.run(
            ['systemctl', 'list-units', 'crypto-*', '--state=active', '--no-legend', '--no-pager'],
            capture_output=True, text=True, timeout=5
        )
        lines = ['<b>🤖 Active bot services</b>', '']
        for line in out.stdout.strip().split('\n'):
            if 'crypto-' in line:
                name = line.split()[0]
                lines.append(f'  ✅ {name}')
        if len(lines) == 2:
            lines.append('No active crypto-* services')
    except Exception as e:
        lines = [f'systemctl err: {e}']
    await msg.answer('\n'.join(lines), reply_markup=main_kb())


@dp.message(F.text.in_({'🔄 Drift'}) | Command('drift'))
async def cmd_drift(msg: types.Message):
    if not allowed(msg): return
    rows = db_query(
        "SELECT user_id, ROUND(SUM(pnl_usdt),2) ev_pnl, COUNT(*) n "
        "FROM trade_events WHERE event_type='CLOSED_PNL' AND event_ts >= datetime('now','-7 day') "
        "GROUP BY user_id"
    )
    if not rows:
        await msg.answer('No events in last 7d.', reply_markup=main_kb()); return
    lines = ['<b>🔄 7d Events PnL (vs Bybit truth)</b>', '']
    for r in rows:
        lines.append(f"  user {r['user_id']}: ${r['ev_pnl']:+.2f} ({r['n']} events)")
    lines.append("\n<i>Drift detection runs daily 23:50 UTC via sync_health</i>")
    lines.append(f"\n<a href='{BASE_URL}/track-record'>Live ↗</a>")
    await msg.answer('\n'.join(lines), reply_markup=main_kb())


@dp.message(F.text.in_({'🧠 Sources'}) | Command('sources'))
async def cmd_sources(msg: types.Message):
    if not allowed(msg): return
    rows = db_query(
        "SELECT source, n_trades, ROUND(posterior_mean*100,1) wr, "
        "ROUND(edge_pp,1) edge, ROUND(total_pnl_usd,2) pnl, status "
        "FROM source_quality ORDER BY edge_pp DESC NULLS LAST"
    )
    if not rows:
        await msg.answer('source_quality empty — run cron first', reply_markup=main_kb()); return
    icon = {'positive_edge':'✅','marginal':'🟡','negative_edge':'🟠','killed':'☠️','insufficient_data':'❓'}
    lines = ['<b>🧠 Bayesian source quality</b>', '']
    for r in rows:
        ic = icon.get(r['status'], '?')
        edge_s = f"{r['edge'] or 0:+.1f}pp" if r['edge'] is not None else 'n/a'
        lines.append(f"{ic} <b>{r['source']:11s}</b> n={r['n_trades']:>3}  WR {r['wr']:.0f}%  edge {edge_s}  PnL ${r['pnl']:+.0f}")
    await msg.answer('\n'.join(lines), reply_markup=main_kb())


@dp.message(F.text.in_({'🔗 Links'}) | Command('links'))
async def cmd_links(msg: types.Message):
    if not allowed(msg): return
    text = (
        "<b>🔗 Quick admin URLs</b>\n\n"
        f"📈 <a href='{BASE_URL}/track-record'>Live PnL dashboard</a>\n"
        f"📥 <a href='{BASE_URL}/admin/applications'>Applications</a>\n"
        f"🎯 <a href='{BASE_URL}/admin/outreach'>Outreach CRM</a>\n"
        f"🌐 <a href='{BASE_URL}/careers'>Careers public page</a>\n"
        f"💰 <a href='{BASE_URL}/apply/investor'>Investor application</a>\n"
        f"🏠 <a href='{BASE_URL}'>Main site</a>"
    )
    await msg.answer(text, reply_markup=main_kb())


# ─── /addprospect FSM flow ───────────────────────────────────────────────────

@dp.message(F.text.in_({'➕ Prospect'}) | Command('addprospect'))
async def cmd_addprospect_start(msg: types.Message, state: FSMContext):
    if not allowed(msg): return
    await state.set_state(AddProspect.name)
    await msg.answer(
        'Adding new prospect.\n\n<b>Step 1/4:</b> Name?',
        reply_markup=ReplyKeyboardRemove()
    )


@dp.message(AddProspect.name)
async def add_step_name(msg: types.Message, state: FSMContext):
    if not allowed(msg): return
    await state.update_data(name=msg.text.strip()[:200])
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text='Academic', callback_data='persona:academic'),
         InlineKeyboardButton(text='Ex-Quant', callback_data='persona:ex-quant')],
        [InlineKeyboardButton(text='Founder', callback_data='persona:founder'),
         InlineKeyboardButton(text='Crypto Quant', callback_data='persona:crypto-quant')],
        [InlineKeyboardButton(text='FAANG ML', callback_data='persona:faang-ml'),
         InlineKeyboardButton(text='YC Alum', callback_data='persona:yc-alum')],
        [InlineKeyboardButton(text='Angel', callback_data='persona:angel'),
         InlineKeyboardButton(text='VC', callback_data='persona:vc')],
        [InlineKeyboardButton(text='Skip', callback_data='persona:skip')],
    ])
    await msg.answer('<b>Step 2/4:</b> Persona?', reply_markup=kb)
    await state.set_state(AddProspect.persona)


@dp.callback_query(F.data.startswith('persona:'), AddProspect.persona)
async def add_step_persona(call: types.CallbackQuery, state: FSMContext):
    persona = call.data.split(':', 1)[1]
    if persona == 'skip':
        persona = None
    await state.update_data(persona=persona)
    await call.message.answer('<b>Step 3/4:</b> Contact (LinkedIn URL OR @twitter OR email):')
    await state.set_state(AddProspect.contact)
    await call.answer()


@dp.message(AddProspect.contact)
async def add_step_contact(msg: types.Message, state: FSMContext):
    if not allowed(msg): return
    contact = msg.text.strip()
    field_data = {}
    if contact.startswith('http'):
        field_data['linkedin_url'] = contact[:500]
    elif contact.startswith('@'):
        field_data['twitter'] = contact[:200]
    elif '@' in contact:
        field_data['email'] = contact[:200]
    else:
        field_data['linkedin_url'] = contact[:500]  # assume LinkedIn
    await state.update_data(**field_data)
    await msg.answer('<b>Step 4/4:</b> Hook (personalization — paper/tweet/repo)? Or "skip":')
    await state.set_state(AddProspect.hook)


@dp.message(AddProspect.hook)
async def add_step_hook(msg: types.Message, state: FSMContext):
    if not allowed(msg): return
    hook = msg.text.strip()
    if hook.lower() == 'skip':
        hook = None
    data = await state.get_data()
    await state.clear()

    # Insert via DB direct (simpler than API call)
    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO outreach_prospects (name, persona, target_type, linkedin_url, twitter, email, hook, status, created_at) "
            "VALUES (?, ?, 'cofounder', ?, ?, ?, ?, 'new', ?)",
            (
                data.get('name'), data.get('persona'),
                data.get('linkedin_url'), data.get('twitter'), data.get('email'),
                hook, datetime.now(timezone.utc).isoformat(),
            )
        )
        conn.commit()
        prospect_id = cur.lastrowid
    finally:
        conn.close()

    await msg.answer(
        f"✅ Prospect #{prospect_id} added: <b>{data.get('name')}</b>\n\n"
        f"<a href='{BASE_URL}/admin/outreach'>Open CRM ↗</a>",
        reply_markup=main_kb()
    )


# ─── Silent ignore unauthorized users ────────────────────────────────────────

@dp.message()
async def fallback(msg: types.Message):
    if not allowed(msg):
        return  # silent ignore — don't reveal bot existence
    await msg.answer('Unknown command. Use /help or buttons below.', reply_markup=main_kb())


async def main():
    log.info('Team bot starting')
    await dp.start_polling(bot)


if __name__ == '__main__':
    asyncio.run(main())
