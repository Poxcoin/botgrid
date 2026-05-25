#!/usr/bin/env python3
"""
tg_parser_inviter.py — TG member scraper + inviter for @kadoclub07

Usage:
  python tools/tg_parser_inviter.py scrape @cryptoua @forexua_chat   # scrape members
  python tools/tg_parser_inviter.py invite --target channel           # invite to channel
  python tools/tg_parser_inviter.py invite --target group             # invite to group
  python tools/tg_parser_inviter.py invite --target both --limit 30   # both, max 30
  python tools/tg_parser_inviter.py stats                             # show DB stats

Config (.env):
  TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION
  TG_OUR_CHANNEL  — username or id of our channel  (default: @kadoclub07)
  TG_OUR_GROUP    — username or id of our group     (required for group invites)

Notes:
  - Max ~40 invites per session run to avoid PeerFloodError
  - Waits 15–25s between invites
  - Stores all scraped users + invite status in saas_database.sqlite
"""
from __future__ import annotations

import argparse
import asyncio
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

from telethon import TelegramClient
from telethon.errors import (
    ChannelPrivateError,
    ChatAdminRequiredError,
    FloodWaitError,
    PeerFloodError,
    UserAlreadyParticipantError,
    UserNotMutualContactError,
    UserPrivacyRestrictedError,
)
from telethon.sessions import StringSession
from telethon.tl.functions.channels import InviteToChannelRequest
from telethon.tl.types import ChannelParticipantsSearch, User

API_ID      = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH    = os.getenv("TELEGRAM_API_HASH", "")
SESSION_STR = os.getenv("TELEGRAM_SESSION", "")
DB_PATH     = Path(__file__).resolve().parent.parent / "saas_database.sqlite"

OUR_CHANNEL = os.getenv("TG_OUR_CHANNEL", "@kadoclub07")
OUR_GROUP   = os.getenv("TG_OUR_GROUP", "")

INVITE_DELAY_MIN = 15
INVITE_DELAY_MAX = 25


# ── DB helpers ────────────────────────────────────────────────────────────────

def _db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=10000")
    return conn


def ensure_tables():
    with _db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS tg_target_channels (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                username        TEXT    NOT NULL UNIQUE,
                title           TEXT,
                member_count    INTEGER DEFAULT 0,
                last_scraped_at TEXT,
                is_active       INTEGER DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS tg_scraped_users (
                id                      INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id                 INTEGER NOT NULL UNIQUE,
                username                TEXT,
                first_name              TEXT,
                last_name               TEXT,
                is_bot                  INTEGER DEFAULT 0,
                is_restricted           INTEGER DEFAULT 0,
                scraped_from            TEXT,
                scraped_at              TEXT    DEFAULT (datetime('now')),
                invited_to_channel      INTEGER DEFAULT 0,
                invited_to_channel_at   TEXT,
                channel_invite_status   TEXT    DEFAULT 'pending',
                invited_to_group        INTEGER DEFAULT 0,
                invited_to_group_at     TEXT,
                group_invite_status     TEXT    DEFAULT 'pending',
                last_error              TEXT
            );
        """)


def upsert_user(conn: sqlite3.Connection, u: User, scraped_from: str):
    conn.execute("""
        INSERT INTO tg_scraped_users
            (user_id, username, first_name, last_name, is_bot, is_restricted, scraped_from)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO NOTHING
    """, (
        u.id,
        u.username or "",
        u.first_name or "",
        u.last_name or "",
        int(bool(u.bot)),
        int(bool(getattr(u, "restricted", False))),
        scraped_from,
    ))


def mark_invited(conn: sqlite3.Connection, user_id: int, target: str, status: str, err: str = ""):
    now = datetime.now(timezone.utc).isoformat()
    if target == "channel":
        conn.execute("""
            UPDATE tg_scraped_users
            SET invited_to_channel=1, invited_to_channel_at=?, channel_invite_status=?, last_error=?
            WHERE user_id=?
        """, (now, status, err, user_id))
    else:
        conn.execute("""
            UPDATE tg_scraped_users
            SET invited_to_group=1, invited_to_group_at=?, group_invite_status=?, last_error=?
            WHERE user_id=?
        """, (now, status, err, user_id))


def get_pending(conn: sqlite3.Connection, target: str, limit: int) -> list[sqlite3.Row]:
    if target == "channel":
        return conn.execute("""
            SELECT * FROM tg_scraped_users
            WHERE is_bot=0 AND is_restricted=0
              AND channel_invite_status IN ('pending', 'retry')
            ORDER BY scraped_at
            LIMIT ?
        """, (limit,)).fetchall()
    else:
        return conn.execute("""
            SELECT * FROM tg_scraped_users
            WHERE is_bot=0 AND is_restricted=0
              AND group_invite_status IN ('pending', 'retry')
            ORDER BY scraped_at
            LIMIT ?
        """, (limit,)).fetchall()


# ── Scraper ───────────────────────────────────────────────────────────────────

async def scrape_channel(client: TelegramClient, channel_username: str):
    ensure_tables()
    print(f"[scrape] Connecting to {channel_username}...")
    try:
        entity = await client.get_entity(channel_username)
    except Exception as e:
        print(f"[scrape] Cannot resolve {channel_username}: {e}")
        return

    participants = []
    try:
        async for user in client.iter_participants(entity, aggressive=True):
            if isinstance(user, User):
                participants.append(user)
    except ChannelPrivateError:
        print(f"[scrape] {channel_username} is private — skipping")
        return
    except FloodWaitError as e:
        print(f"[scrape] FloodWait {e.seconds}s — stopping")
        return

    with _db() as conn:
        inserted = 0
        for u in participants:
            before = conn.execute("SELECT id FROM tg_scraped_users WHERE user_id=?", (u.id,)).fetchone()
            upsert_user(conn, u, channel_username)
            if not before:
                inserted += 1

        title = getattr(entity, "title", channel_username)
        conn.execute("""
            INSERT INTO tg_target_channels (username, title, member_count, last_scraped_at)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(username) DO UPDATE SET
                title=excluded.title,
                member_count=excluded.member_count,
                last_scraped_at=excluded.last_scraped_at
        """, (channel_username, title, len(participants)))

    print(f"[scrape] {channel_username}: {len(participants)} members, {inserted} new saved")


# ── Inviter ───────────────────────────────────────────────────────────────────

async def invite_users(client: TelegramClient, target: str, limit: int):
    ensure_tables()

    targets = []
    if target in ("channel", "both"):
        if not OUR_CHANNEL:
            print("[invite] TG_OUR_CHANNEL not set")
        else:
            try:
                ch_entity = await client.get_entity(OUR_CHANNEL)
                targets.append(("channel", ch_entity))
            except Exception as e:
                print(f"[invite] Cannot resolve channel {OUR_CHANNEL}: {e}")

    if target in ("group", "both"):
        if not OUR_GROUP:
            print("[invite] TG_OUR_GROUP not set — skipping group invites")
        else:
            try:
                gr_entity = await client.get_entity(OUR_GROUP)
                targets.append(("group", gr_entity))
            except Exception as e:
                print(f"[invite] Cannot resolve group {OUR_GROUP}: {e}")

    if not targets:
        print("[invite] Nothing to invite to — check TG_OUR_CHANNEL / TG_OUR_GROUP")
        return

    for (tgt_name, tgt_entity) in targets:
        print(f"\n[invite] Target: {tgt_name} ({OUR_CHANNEL if tgt_name=='channel' else OUR_GROUP})")
        with _db() as conn:
            rows = get_pending(conn, tgt_name, limit)

        if not rows:
            print(f"[invite] No pending users for {tgt_name}")
            continue

        print(f"[invite] {len(rows)} users queued")
        success = failed = skipped = 0

        for row in rows:
            user_id = row["user_id"]
            uname   = row["username"] or str(user_id)

            try:
                user_entity = await client.get_entity(user_id)
            except Exception as e:
                with _db() as conn:
                    mark_invited(conn, user_id, tgt_name, "error", str(e))
                skipped += 1
                continue

            try:
                await client(InviteToChannelRequest(tgt_entity, [user_entity]))
                with _db() as conn:
                    mark_invited(conn, user_id, tgt_name, "success")
                success += 1
                print(f"  ✓ @{uname}")

            except UserAlreadyParticipantError:
                with _db() as conn:
                    mark_invited(conn, user_id, tgt_name, "already_member")
                skipped += 1

            except (UserPrivacyRestrictedError, UserNotMutualContactError) as e:
                with _db() as conn:
                    mark_invited(conn, user_id, tgt_name, "privacy_skip", type(e).__name__)
                skipped += 1
                print(f"  – @{uname} (privacy)")

            except PeerFloodError:
                print(f"\n[invite] ⚠ PeerFloodError — daily limit reached, stopping")
                with _db() as conn:
                    mark_invited(conn, user_id, tgt_name, "flood_stop")
                break

            except FloodWaitError as e:
                print(f"\n[invite] FloodWait {e.seconds}s...")
                await asyncio.sleep(e.seconds + 5)
                with _db() as conn:
                    mark_invited(conn, user_id, tgt_name, "retry")

            except ChatAdminRequiredError:
                print(f"[invite] Need admin rights in {tgt_name} — stopping")
                break

            except Exception as e:
                with _db() as conn:
                    mark_invited(conn, user_id, tgt_name, "error", str(e))
                failed += 1
                print(f"  ✗ @{uname}: {e}")

            delay = random.randint(INVITE_DELAY_MIN, INVITE_DELAY_MAX)
            await asyncio.sleep(delay)

        print(f"\n[invite] {tgt_name} done: ✓{success} skip={skipped} err={failed}")


# ── Stats ─────────────────────────────────────────────────────────────────────

def show_stats():
    ensure_tables()
    with _db() as conn:
        total   = conn.execute("SELECT COUNT(*) FROM tg_scraped_users").fetchone()[0]
        bots    = conn.execute("SELECT COUNT(*) FROM tg_scraped_users WHERE is_bot=1").fetchone()[0]
        ch_ok   = conn.execute("SELECT COUNT(*) FROM tg_scraped_users WHERE channel_invite_status='success'").fetchone()[0]
        gr_ok   = conn.execute("SELECT COUNT(*) FROM tg_scraped_users WHERE group_invite_status='success'").fetchone()[0]
        pending = conn.execute("SELECT COUNT(*) FROM tg_scraped_users WHERE channel_invite_status='pending'").fetchone()[0]
        channels = conn.execute("SELECT username, title, member_count, last_scraped_at FROM tg_target_channels ORDER BY last_scraped_at DESC").fetchall()

    print(f"\n{'─'*45}")
    print(f"  Scraped users : {total} ({bots} bots excluded)")
    print(f"  → channel     : {ch_ok} invited")
    print(f"  → group       : {gr_ok} invited")
    print(f"  Pending       : {pending}")
    print(f"\n  Source channels ({len(channels)}):")
    for ch in channels:
        print(f"   @{ch['username']:30s}  {ch['member_count']:>6} members  scraped {ch['last_scraped_at']}")
    print(f"{'─'*45}\n")


# ── Main ──────────────────────────────────────────────────────────────────────

async def run(args):
    if not API_ID or not API_HASH or not SESSION_STR:
        sys.exit("[error] TELEGRAM_API_ID / TELEGRAM_API_HASH / TELEGRAM_SESSION missing in .env")

    async with TelegramClient(StringSession(SESSION_STR), API_ID, API_HASH) as client:
        if args.command == "scrape":
            for ch in args.channels:
                await scrape_channel(client, ch)

        elif args.command == "invite":
            await invite_users(client, args.target, args.limit)

        elif args.command == "stats":
            show_stats()


def main():
    parser = argparse.ArgumentParser(description="TG channel scraper + inviter")
    sub = parser.add_subparsers(dest="command", required=True)

    sp = sub.add_parser("scrape", help="Scrape members from channels")
    sp.add_argument("channels", nargs="+", help="@channel usernames to scrape")

    ip = sub.add_parser("invite", help="Invite scraped users")
    ip.add_argument("--target", choices=["channel", "group", "both"], default="channel")
    ip.add_argument("--limit", type=int, default=40, help="Max invites per run (default 40)")

    sub.add_parser("stats", help="Show DB statistics")

    args = parser.parse_args()
    if args.command == "stats":
        show_stats()
    else:
        asyncio.run(run(args))


if __name__ == "__main__":
    main()
