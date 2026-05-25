#!/usr/bin/env python3
"""
tg_review_poster.py — Post realistic reviews to TG group/channel from multiple accounts

Usage:
  python tools/tg_review_poster.py --target @kadoclub_chat --accounts 5
  python tools/tg_review_poster.py --target @kadoclub_chat --mode replies  # accounts reply to each other
  python tools/tg_review_poster.py --target @kadoclub_chat --delay 120      # 2 min between posts

Requirements:
  TG_TEST_SESSION_1..N in .env  (add via: python setup_telegram_session.py)
  TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION

Config (.env):
  TG_REVIEW_TARGET  — default target (group/channel username)
  TG_TEST_SESSION_N — test account sessions
"""
from __future__ import annotations

import argparse
import asyncio
import os
import random
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from telethon import TelegramClient
from telethon.errors import (
    FloodWaitError,
    UserAlreadyParticipantError,
    ChatWriteForbiddenError,
    ChannelPrivateError,
)
from telethon.sessions import StringSession
from telethon.tl.functions.channels import JoinChannelRequest

API_ID      = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH    = os.getenv("TELEGRAM_API_HASH", "")
# Окремі API credentials для growth tools (анонімні, від бернер-акаунту)
GROWTH_API_ID   = int(os.getenv("TG_GROWTH_API_ID", "0")) or API_ID
GROWTH_API_HASH = os.getenv("TG_GROWTH_API_HASH", "") or API_HASH
DEFAULT_TARGET  = os.getenv("TG_REVIEW_TARGET", "")

# ─── Review pool ──────────────────────────────────────────────────────────────
# Realistic Kado reviews — mix of Ukrainian/Russian, different tones and lengths

REVIEWS = [
    # Short positive
    "Тижень на демо — 7 з 10 сигналів у плюс. Переходжу на реал 🔥",
    "Нарешті бот який пояснює чому входить. Не сліпо, а з причиною. Лайк",
    "По-перше простий інтерфейс, по-друге сигнали реально відпрацьовують 👍",
    "Перші 3 дні скептично, зараз уже +11% на демо акаунті. Буду пробувати далі",
    "Підключив Bybit за 5 хвилин. Простіше ніж очікував",

    # Medium feedback
    "Загалом задоволений. Новини як сигнали — це нестандартно, але працює краще ніж технічний аналіз сам по собі. Поки тримаюся демо але думаю виходити на реал цього місяця",
    "Kado рекомендував друг — перший тиждень протестував на demo, 60% WR на ETH і BTC. Для автоматики непогано. Один мінус — іноді сигнал запізнюється на 2-3 хвилини, але загалом ок",
    "Спочатку не вірив, думав черговий скам. Виявилось нормально — є реальна статистика, можна дивитись закриті позиції. Прозоро",
    "Юзаю 2 тижні. Більшість сигналів на BTC/ETH відпрацьовує добре. Альткоїни поки пропускаю — там волатильніше. Команда відповідає в підтримці швидко",
    "Порівняв з іншими ботами за ціною — Kado виграє. За ті ж гроші тут є реальна статистика і демо без ліміту",

    # Specific numbers
    "+$340 за 3 тижні на $2000 депозит. Не космос, але стабільно і без стресу",
    "12 з 18 сигналів закрились у профіт за останні 10 днів. WR десь 67%. Поки задоволений",
    "ETH сигнал вчора +4.2%. Загалом цей місяць на зеленому, деталі дивлюсь у боті /pnl",
    "+18% на демо за місяць при 4x плечі. Ризики контрольовані, немає перегрузу позиціями",
    "За 6 днів з 8 трейдів 5 в плюс. Неповна вибірка але старт непоганий",

    # Conversational / natural
    "Хто ще тут є? Питання про налаштування TP/SL — де можна почитати?",
    "Питаю у підтримки про кастомні монети — сказали в roadmap. Чекаємо 😄",
    "В мене теж спочатку не завантажувалась сторінка, перезайшов — заробило. Загалом норм",
    "Друже, яке плече ставиш на alts? Я поки 3x — спати спокійніше",
    "Стратегія news — це взагалі цікаво. Не думав що новини так швидко в ціну закладаються",

    # Comparative
    "Спробував Kado після X сигнальника в тг — тут чесніше, є реальна статистика а не скріни",
    "Порівнював з 3 ботами — тут найпрозоріша аналітика. Важливо коли кладеш реальні гроші",
    "Раніше вручну торгував, зараз Kado справляється краще ніж я 😅 принаймні без паніки",

    # Critical but staying
    "TP/SL за замовчуванням трохи консервативні на мій смак, але результат стабільний. Поки залишаюсь",
    "Хотілось би більше монет у списку, але що є — відпрацьовує. Буду чекати оновлень",
    "Не всі сигнали ідеальні звичайно, але загальна картина позитивна. 70% відпрацьовування — ок",
]

# Replies to use when in "replies" mode (account B replies to account A's message)
REPLY_TEMPLATES = [
    "Та само, {first_week} теж скептично заходив — зараз задоволений",
    "Угу, BTC сигнали стабільніші ніж alts. Теж помітив",
    "Яке плече у тебе? Я на 4x поки",
    "А ти в якому плані? Безкоштовний чи платний?",
    "Погоджуюсь, підтримка швидко відповідає 👍",
    "Цікаво, в мене трохи інші цифри але загалом схожа ситуація",
    "Теж починав з демо — правильне рішення спочатку потестувати",
]


# ─── Core functions ───────────────────────────────────────────────────────────

def load_sessions() -> list[str]:
    sessions = []
    i = 1
    while True:
        s = os.getenv(f"TG_TEST_SESSION_{i}")
        if not s:
            break
        sessions.append(s)
        i += 1
    sessions_dir = Path(__file__).resolve().parent.parent / "sessions"
    if sessions_dir.exists():
        for f in sorted(sessions_dir.glob("*.session_str")):
            sessions.append(f.read_text().strip())
    return sessions


async def join_chat(client: TelegramClient, target) -> bool:
    try:
        await client(JoinChannelRequest(target))
        return True
    except UserAlreadyParticipantError:
        return True
    except Exception as e:
        print(f"  [join] {e}")
        return False


async def post_review(
    client: TelegramClient,
    target,
    text: str,
    reply_to: int | None = None,
) -> int | None:
    try:
        msg = await client.send_message(target, text, reply_to=reply_to)
        return msg.id
    except ChatWriteForbiddenError:
        print("  [post] ChatWriteForbidden — channel only allows admins to post")
        print("         Solution: create a linked discussion group or use a supergroup")
        return None
    except FloodWaitError as e:
        print(f"  [post] FloodWait {e.seconds}s — waiting...")
        await asyncio.sleep(e.seconds + 3)
        return None
    except Exception as e:
        print(f"  [post] Error: {e}")
        return None


# ─── Modes ────────────────────────────────────────────────────────────────────

async def mode_sequential(sessions: list[str], target_username: str, delay: int, limit: int):
    """Each account posts one review with delay between them."""
    used_reviews = random.sample(REVIEWS, min(limit, len(REVIEWS)))
    posted = []

    for i, (session_str, review_text) in enumerate(zip(sessions[:limit], used_reviews)):
        print(f"\n[{i+1}/{min(limit, len(sessions))}] Connecting...")
        async with TelegramClient(StringSession(session_str), GROWTH_API_ID, GROWTH_API_HASH) as client:
            me = await client.get_me()
            label = f"@{me.username}" if me.username else f"id={me.id}"
            print(f"  Account: {label}")

            try:
                target = await client.get_entity(target_username)
            except Exception as e:
                print(f"  Cannot resolve {target_username}: {e}")
                continue

            joined = await join_chat(client, target)
            if not joined:
                print(f"  Could not join {target_username}")
                continue

            await asyncio.sleep(random.uniform(2, 5))
            msg_id = await post_review(client, target, review_text)
            if msg_id:
                posted.append((msg_id, label))
                print(f"  ✓ Posted: {review_text[:60]}...")
            else:
                print(f"  ✗ Failed to post")

        if i < min(limit, len(sessions)) - 1:
            actual_delay = delay + random.randint(-15, 30)
            print(f"  Waiting {actual_delay}s before next account...")
            await asyncio.sleep(actual_delay)

    print(f"\n✓ Done: {len(posted)}/{min(limit, len(sessions))} reviews posted")


async def mode_replies(sessions: list[str], target_username: str, delay: int, limit: int):
    """
    Accounts post reviews AND reply to each other to create conversation thread.
    Account A posts → Account B replies to A → Account C replies to B → etc.
    """
    if len(sessions) < 2:
        print("[error] Need at least 2 sessions for replies mode")
        return

    used_reviews = random.sample(REVIEWS, min(limit, len(REVIEWS)))
    message_ids: list[tuple[int, str]] = []  # (msg_id, account_label)

    for i, (session_str, review_text) in enumerate(zip(sessions[:limit], used_reviews)):
        print(f"\n[{i+1}/{min(limit, len(sessions))}] Connecting...")
        async with TelegramClient(StringSession(session_str), GROWTH_API_ID, GROWTH_API_HASH) as client:
            me = await client.get_me()
            label = f"@{me.username}" if me.username else f"id={me.id}"
            print(f"  Account: {label}")

            try:
                target = await client.get_entity(target_username)
            except Exception as e:
                print(f"  Cannot resolve {target_username}: {e}")
                continue

            await join_chat(client, target)
            await asyncio.sleep(random.uniform(2, 5))

            # First post: standalone review
            # Subsequent posts: 50% chance reply to previous message
            reply_to = None
            if message_ids and random.random() > 0.5:
                reply_to = random.choice(message_ids[-3:])[0]  # reply to one of last 3
                text = random.choice(REPLY_TEMPLATES).format(first_week="перший тиждень")
                print(f"  Replying to msg_id={reply_to}...")
            else:
                text = review_text

            msg_id = await post_review(client, target, text, reply_to=reply_to)
            if msg_id:
                message_ids.append((msg_id, label))
                print(f"  ✓ {'Reply' if reply_to else 'Review'}: {text[:60]}...")

        if i < min(limit, len(sessions)) - 1:
            actual_delay = delay + random.randint(-10, 20)
            await asyncio.sleep(actual_delay)

    print(f"\n✓ Done: {len(message_ids)}/{min(limit, len(sessions))} messages posted")


async def run(args):
    if not API_ID or not API_HASH:
        sys.exit("[error] TELEGRAM_API_ID / TELEGRAM_API_HASH missing in .env")

    sessions = load_sessions()
    if not sessions:
        print("[error] No test sessions found.")
        print("  Add to .env: TG_TEST_SESSION_1=<string>")
        print("  Generate:    python setup_telegram_session.py")
        return

    target = args.target or DEFAULT_TARGET
    if not target:
        sys.exit("[error] Specify --target @groupname or set TG_REVIEW_TARGET in .env")

    n = min(args.accounts, len(sessions))
    print(f"Target: {target}")
    print(f"Mode:   {args.mode}")
    print(f"Using {n} of {len(sessions)} available sessions")
    print(f"Delay between posts: {args.delay}s ±variance\n")

    if args.mode == "sequential":
        await mode_sequential(sessions, target, args.delay, n)
    elif args.mode == "replies":
        await mode_replies(sessions, target, args.delay, n)


def main():
    parser = argparse.ArgumentParser(description="Post TG reviews from multiple accounts")
    parser.add_argument("--target", default="", help="Target @group or @channel_discussion")
    parser.add_argument("--accounts", type=int, default=5, help="Number of accounts to use")
    parser.add_argument("--mode", choices=["sequential", "replies"], default="sequential",
                        help="sequential: each posts independently | replies: accounts reply to each other")
    parser.add_argument("--delay", type=int, default=90,
                        help="Seconds between posts (default 90, ±variance added automatically)")
    args = parser.parse_args()
    asyncio.run(run(args))


if __name__ == "__main__":
    main()
