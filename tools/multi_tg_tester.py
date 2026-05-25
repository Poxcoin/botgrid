#!/usr/bin/env python3
"""
multi_tg_tester.py — Multi-account Telegram tester for @KADO_c_BOT + group/channel

Tests (per account):
  1. Bot commands: /start /status /balance /positions /pnl /help
  2. Channel join + verify subscription
  3. Group join + send test message
  4. Moderation check: send promo text → verify bot/admin deletes it
  5. Review/feedback simulation (send message to designated feedback chat)

Setup:
  1. Create extra TG sessions via setup_telegram_session.py
  2. Add to .env:
       TG_TEST_SESSION_1=<string session>
       TG_TEST_SESSION_2=<string session>
       ...
  3. Or put .session files in sessions/ dir

Usage:
  python tools/multi_tg_tester.py --accounts 3 --tests bot,join,spam
  python tools/multi_tg_tester.py --accounts all --tests all
  python tools/multi_tg_tester.py --report               # show last results

Config (.env):
  TG_TEST_SESSION_N     — test account sessions
  TG_TEST_BOT_USERNAME  — bot to test (default: KADO_c_BOT)
  TG_TEST_CHANNEL       — channel to join (default: @kadoclub07)
  TG_TEST_GROUP         — group to test (required for group/spam tests)
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from telethon import TelegramClient, events
from telethon.errors import FloodWaitError, UserAlreadyParticipantError
from telethon.sessions import StringSession
from telethon.tl.functions.channels import JoinChannelRequest, LeaveChannelRequest

API_ID      = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH    = os.getenv("TELEGRAM_API_HASH", "")
BOT_USERNAME = os.getenv("TG_TEST_BOT_USERNAME", "KADO_c_BOT")
TEST_CHANNEL = os.getenv("TG_TEST_CHANNEL", "@kadoclub07")
TEST_GROUP   = os.getenv("TG_TEST_GROUP", "")

SPAM_MESSAGES = [
    "🔥 Earn 300% daily! Visit t.me/scam123",
    "💰 FREE SIGNAL CHANNEL: @fakesignals",
    "📈 PROMO CODE KADO50 — get 50% off VIP!",
    "🤑 Referral: https://example.com/ref?id=999",
]

BOT_COMMANDS = ["/start", "/status", "/balance", "/positions", "/pnl", "/help"]
REPORT_FILE  = Path(__file__).resolve().parent.parent / "multi_tg_test_results.json"


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


async def test_bot(client: TelegramClient, account_label: str) -> dict:
    result = {"test": "bot_commands", "account": account_label, "passed": [], "failed": []}
    try:
        bot = await client.get_entity(BOT_USERNAME)
    except Exception as e:
        result["error"] = str(e)
        return result

    for cmd in BOT_COMMANDS:
        try:
            await client.send_message(bot, cmd)
            await asyncio.sleep(2.5)
            msgs = await client.get_messages(bot, limit=1)
            if msgs and msgs[0].out is False:
                result["passed"].append(cmd)
            else:
                result["failed"].append(f"{cmd} (no response)")
        except FloodWaitError as e:
            await asyncio.sleep(e.seconds)
        except Exception as e:
            result["failed"].append(f"{cmd} ({e})")
        await asyncio.sleep(1.5)

    return result


async def test_channel_join(client: TelegramClient, account_label: str) -> dict:
    result = {"test": "channel_join", "account": account_label, "status": ""}
    try:
        entity = await client.get_entity(TEST_CHANNEL)
        await client(JoinChannelRequest(entity))
        result["status"] = "joined"
    except UserAlreadyParticipantError:
        result["status"] = "already_member"
    except Exception as e:
        result["status"] = f"error: {e}"
    return result


async def test_spam_moderation(client: TelegramClient, account_label: str) -> dict:
    result = {"test": "spam_moderation", "account": account_label, "status": ""}
    if not TEST_GROUP:
        result["status"] = "skipped (TG_TEST_GROUP not set)"
        return result

    try:
        group = await client.get_entity(TEST_GROUP)
        spam_text = random.choice(SPAM_MESSAGES)
        msg = await client.send_message(group, spam_text)
        sent_id = msg.id
        await asyncio.sleep(8)
        msgs = await client.get_messages(group, ids=[sent_id])
        if not msgs or msgs[0] is None:
            result["status"] = "DELETED (moderation working)"
        else:
            result["status"] = "NOT DELETED — check moderation bot"
        try:
            await client.delete_messages(group, [sent_id])
        except Exception:
            pass
    except Exception as e:
        result["status"] = f"error: {e}"
    return result


async def test_review(client: TelegramClient, account_label: str) -> dict:
    result = {"test": "review_message", "account": account_label, "status": ""}
    if not TEST_GROUP:
        result["status"] = "skipped (TG_TEST_GROUP not set)"
        return result

    reviews = [
        "Користуюсь Kado вже місяць — стабільні сигнали, зручний інтерфейс 👍",
        "Хороший бот, але хотілось би більше монет",
        "Результат за 2 тижні: +18% на демо. Переходжу на лайв",
        "Підтримка відповідає швидко, дякую команді",
    ]
    try:
        group = await client.get_entity(TEST_GROUP)
        await client.send_message(group, random.choice(reviews))
        result["status"] = "sent"
    except Exception as e:
        result["status"] = f"error: {e}"
    return result


async def run_account_tests(session_str: str, account_idx: int, tests: list[str]) -> list[dict]:
    label = f"account_{account_idx}"
    results = []

    async with TelegramClient(StringSession(session_str), API_ID, API_HASH) as client:
        me = await client.get_me()
        label = f"@{me.username or me.id}"
        print(f"\n[{label}] Connected")

        if "bot" in tests or "all" in tests:
            r = await test_bot(client, label)
            results.append(r)
            print(f"  Bot: {len(r['passed'])} passed, {len(r['failed'])} failed")

        if "join" in tests or "all" in tests:
            r = await test_channel_join(client, label)
            results.append(r)
            print(f"  Channel join: {r['status']}")

        if "spam" in tests or "all" in tests:
            r = await test_spam_moderation(client, label)
            results.append(r)
            print(f"  Spam moderation: {r['status']}")

        if "review" in tests or "all" in tests:
            r = await test_review(client, label)
            results.append(r)
            print(f"  Review: {r['status']}")

    return results


async def run_all(n_accounts: int | str, tests: list[str]):
    sessions = load_sessions()
    if not sessions:
        print("[error] No test sessions found. Set TG_TEST_SESSION_1..N in .env")
        print("        or put .session_str files in sessions/ directory")
        print("        Create sessions with: python setup_telegram_session.py")
        return

    if n_accounts == "all":
        selected = sessions
    else:
        selected = sessions[:int(n_accounts)]

    if not selected:
        print(f"[error] Only {len(sessions)} sessions available")
        return

    print(f"Running tests [{','.join(tests)}] on {len(selected)} accounts...")

    all_results = []
    for i, sess in enumerate(selected, 1):
        results = await run_account_tests(sess, i, tests)
        all_results.extend(results)
        await asyncio.sleep(3)

    timestamp = datetime.now(timezone.utc).isoformat()
    report = {"timestamp": timestamp, "tests": all_results}
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\nReport saved to {REPORT_FILE}")
    _print_summary(all_results)


def _print_summary(results: list[dict]):
    passed = sum(1 for r in results if "failed" not in r or not r.get("failed"))
    print(f"\n{'─'*40}")
    print(f"Total tests: {len(results)}")
    for r in results:
        name  = r.get("test", "?")
        acct  = r.get("account", "?")
        status = r.get("status") or (
            f"✓{len(r.get('passed',[]))} ✗{len(r.get('failed',[]))}" if "passed" in r else "?"
        )
        print(f"  [{acct}] {name}: {status}")
    print(f"{'─'*40}\n")


def show_report():
    if not REPORT_FILE.exists():
        print("No report file found. Run tests first.")
        return
    data = json.loads(REPORT_FILE.read_text())
    print(f"Report from: {data['timestamp']}")
    _print_summary(data["tests"])


def main():
    parser = argparse.ArgumentParser(description="Multi-account TG tester")
    parser.add_argument("--accounts", default="all", help="Number of accounts or 'all'")
    parser.add_argument("--tests", default="all", help="Comma-separated: bot,join,spam,review,all")
    parser.add_argument("--report", action="store_true", help="Show last test report")
    args = parser.parse_args()

    if args.report:
        show_report()
        return

    tests = [t.strip() for t in args.tests.split(",")]
    asyncio.run(run_all(args.accounts, tests))


if __name__ == "__main__":
    main()
