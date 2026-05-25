#!/usr/bin/env python3
"""
tg_account_factory.py — Bulk Telegram account creator via SMS-Activate API

Flow per account:
  1. Buy virtual number on SMS-Activate (country: UA/RU/KZ/PL etc.)
  2. Register Telegram account with Telethon
  3. Receive SMS code via SMS-Activate API
  4. Save StringSession to sessions/ directory + append to .env

Usage:
  python tools/tg_account_factory.py --count 10 --country ua
  python tools/tg_account_factory.py --count 5  --country ru --service 5sim
  python tools/tg_account_factory.py --list-sessions   # show saved sessions

Config (.env):
  SMS_ACTIVATE_KEY   — API key from sms-activate.org
  FIVESIM_KEY        — API key from 5sim.net (alternative)
  TELEGRAM_API_ID, TELEGRAM_API_HASH

Notes:
  - Cost: ~$0.10-0.30 per UA/RU number on SMS-Activate
  - Telegram may require phone verification later if account looks suspicious
  - Space creation: default 45s delay between accounts
  - Sessions saved to: sessions/account_N.session_str + sessions/accounts.json
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import string
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

import aiohttp
from telethon import TelegramClient
from telethon.errors import (
    FloodWaitError,
    PhoneCodeExpiredError,
    PhoneCodeInvalidError,
    PhoneNumberBannedError,
    PhoneNumberInvalidError,
    SessionPasswordNeededError,
)
from telethon.sessions import StringSession

API_ID      = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH    = os.getenv("TELEGRAM_API_HASH", "")
SMS_KEY     = os.getenv("SMS_ACTIVATE_KEY", "")
FIVESIM_KEY = os.getenv("FIVESIM_KEY", "")

SESSIONS_DIR = Path(__file__).resolve().parent.parent / "sessions"
ACCOUNTS_FILE = SESSIONS_DIR / "accounts.json"
ENV_FILE      = Path(__file__).resolve().parent.parent / ".env"

FIRST_NAMES = ["Alex", "Ivan", "Olena", "Max", "Daria", "Artem", "Natalia", "Dmytro",
               "Sofiia", "Bohdan", "Oksana", "Mykola", "Iryna", "Andrii", "Viktoria"]
LAST_NAMES  = ["K", "S", "M", "P", "V", "B", "H", "L", "R", "T"]

# SMS-Activate country codes for Telegram
COUNTRY_CODES = {
    "ua": "1",    # Ukraine
    "ru": "0",    # Russia
    "kz": "57",   # Kazakhstan
    "pl": "15",   # Poland
    "id": "6",    # Indonesia (cheap)
    "ph": "63",   # Philippines (cheap)
    "in": "22",   # India (cheapest)
}


# ── SMS-Activate API ──────────────────────────────────────────────────────────

class SmsActivate:
    BASE = "https://api.sms-activate.org/stubs/handler_api.php"

    def __init__(self, api_key: str, session: aiohttp.ClientSession):
        self.key = api_key
        self.session = session

    async def _get(self, **params) -> str:
        params["api_key"] = self.key
        async with self.session.get(self.BASE, params=params) as r:
            return (await r.text()).strip()

    async def get_balance(self) -> float:
        resp = await self._get(action="getBalance")
        if resp.startswith("ACCESS_BALANCE:"):
            return float(resp.split(":")[1])
        raise RuntimeError(f"Balance error: {resp}")

    async def get_number(self, country: str) -> tuple[str, str]:
        """Returns (activation_id, phone_number)"""
        country_id = COUNTRY_CODES.get(country, COUNTRY_CODES["ua"])
        resp = await self._get(action="getNumberV2", service="tg", country=country_id)
        # Response: ACCESS_NUMBER:12345:79001234567
        if not resp.startswith("ACCESS_NUMBER:"):
            raise RuntimeError(f"get_number failed: {resp}")
        parts = resp.split(":")
        return parts[1], parts[2]

    async def get_status(self, activation_id: str) -> str | None:
        """Poll for SMS code. Returns code string or None if not yet received."""
        resp = await self._get(action="getStatus", id=activation_id)
        if resp.startswith("STATUS_OK:"):
            return resp.split(":")[1]
        return None

    async def set_status(self, activation_id: str, status: int):
        await self._get(action="setStatus", id=activation_id, status=status)

    async def wait_for_code(self, activation_id: str, timeout: int = 120) -> str | None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            code = await self.get_status(activation_id)
            if code:
                return code
            await asyncio.sleep(5)
        return None


# ── 5sim API ──────────────────────────────────────────────────────────────────

class FiveSim:
    BASE = "https://5sim.net/v1"

    def __init__(self, api_key: str, session: aiohttp.ClientSession):
        self.key = api_key
        self.session = session
        self.headers = {"Authorization": f"Bearer {api_key}", "Accept": "application/json"}

    async def get_balance(self) -> float:
        async with self.session.get(f"{self.BASE}/user/profile", headers=self.headers) as r:
            data = await r.json()
            return float(data.get("balance", 0))

    async def get_number(self, country: str) -> tuple[str, str]:
        url = f"{self.BASE}/user/buy/activation/{country}/any/telegram"
        async with self.session.get(url, headers=self.headers) as r:
            data = await r.json()
            if "id" not in data:
                raise RuntimeError(f"5sim get_number failed: {data}")
            phone = data["phone"].lstrip("+")
            return str(data["id"]), phone

    async def wait_for_code(self, activation_id: str, timeout: int = 120) -> str | None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            async with self.session.get(
                f"{self.BASE}/user/check/{activation_id}", headers=self.headers
            ) as r:
                data = await r.json()
                sms_list = data.get("sms", [])
                if sms_list:
                    text = sms_list[0].get("text", "")
                    import re
                    m = re.search(r"\b(\d{5,6})\b", text)
                    if m:
                        return m.group(1)
            await asyncio.sleep(5)
        return None

    async def finish(self, activation_id: str):
        async with self.session.get(
            f"{self.BASE}/user/finish/{activation_id}", headers=self.headers
        ) as r:
            pass


# ── Session management ────────────────────────────────────────────────────────

def load_accounts() -> list[dict]:
    if ACCOUNTS_FILE.exists():
        return json.loads(ACCOUNTS_FILE.read_text())
    return []


def save_account(phone: str, session_str: str, first_name: str):
    SESSIONS_DIR.mkdir(exist_ok=True)
    accounts = load_accounts()
    idx = len(accounts) + 1
    entry = {
        "idx": idx,
        "phone": phone,
        "first_name": first_name,
        "session_file": f"account_{idx}.session_str",
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    accounts.append(entry)
    ACCOUNTS_FILE.write_text(json.dumps(accounts, indent=2))

    # Save session string to file
    session_path = SESSIONS_DIR / f"account_{idx}.session_str"
    session_path.write_text(session_str)

    # Append to .env as TG_TEST_SESSION_N
    env_line = f"TG_TEST_SESSION_{idx}={session_str}\n"
    with open(ENV_FILE, "a") as f:
        f.write(env_line)

    print(f"  ✓ Saved: sessions/account_{idx}.session_str + TG_TEST_SESSION_{idx} in .env")
    return idx


# ── Account creation ──────────────────────────────────────────────────────────

async def create_one_account(
    sms: SmsActivate | FiveSim,
    country: str,
    idx: int,
) -> bool:
    first_name = random.choice(FIRST_NAMES)
    last_name  = random.choice(LAST_NAMES)
    print(f"\n[{idx}] Creating account: {first_name} {last_name}")

    # Get number
    try:
        activation_id, phone = await sms.get_number(country)
        print(f"  Number: +{phone} (activation {activation_id})")
    except Exception as e:
        print(f"  ✗ get_number: {e}")
        return False

    # Confirm number obtained (status 1)
    if hasattr(sms, "set_status"):
        await sms.set_status(activation_id, 1)

    # Register with Telethon
    async with TelegramClient(StringSession(), API_ID, API_HASH) as client:
        try:
            sent = await client.send_code_request(f"+{phone}")
            print(f"  Code sent (type={sent.type}), waiting for SMS...")
        except PhoneNumberBannedError:
            print(f"  ✗ Number banned by Telegram")
            if hasattr(sms, "set_status"):
                await sms.set_status(activation_id, 8)
            return False
        except PhoneNumberInvalidError:
            print(f"  ✗ Invalid number")
            return False
        except FloodWaitError as e:
            print(f"  ✗ FloodWait {e.seconds}s")
            await asyncio.sleep(e.seconds)
            return False

        code = await sms.wait_for_code(activation_id)
        if not code:
            print(f"  ✗ No SMS received within 120s")
            if hasattr(sms, "set_status"):
                await sms.set_status(activation_id, 8)  # cancel
            return False

        print(f"  SMS received: {code}")

        try:
            await client.sign_in(f"+{phone}", code)
        except PhoneCodeInvalidError:
            print(f"  ✗ Wrong code: {code}")
            return False
        except PhoneCodeExpiredError:
            print(f"  ✗ Code expired")
            return False
        except SessionPasswordNeededError:
            print(f"  ✗ 2FA required (number already had TG account)")
            return False
        except Exception as e:
            # May need to sign up as new user
            if "PHONE_NUMBER_UNOCCUPIED" in str(e) or "sign_up" in str(e).lower():
                try:
                    await client.sign_up(code, first_name, last_name)
                    print(f"  New account registered")
                except Exception as e2:
                    print(f"  ✗ sign_up: {e2}")
                    return False
            else:
                print(f"  ✗ sign_in: {e}")
                return False

        # Confirm SMS used
        if hasattr(sms, "set_status"):
            await sms.set_status(activation_id, 6)
        elif hasattr(sms, "finish"):
            await sms.finish(activation_id)

        session_str = client.session.save()
        me = await client.get_me()
        actual_name = f"{me.first_name or ''} {me.last_name or ''}".strip() or str(me.id)
        print(f"  Account: {actual_name} (@{me.username or 'no_username'})")

        save_account(f"+{phone}", session_str, actual_name)
        return True


async def run_factory(count: int, country: str, service: str, delay: int):
    if not API_ID or not API_HASH:
        sys.exit("[error] TELEGRAM_API_ID / TELEGRAM_API_HASH missing")

    if service == "5sim":
        if not FIVESIM_KEY:
            sys.exit("[error] FIVESIM_KEY missing in .env")
    else:
        if not SMS_KEY:
            sys.exit("[error] SMS_ACTIVATE_KEY missing in .env")

    SESSIONS_DIR.mkdir(exist_ok=True)

    async with aiohttp.ClientSession() as http:
        if service == "5sim":
            sms_provider = FiveSim(FIVESIM_KEY, http)
        else:
            sms_provider = SmsActivate(SMS_KEY, http)

        # Check balance
        try:
            balance = await sms_provider.get_balance()
            print(f"Balance: ${balance:.2f}")
            if balance < 1.0:
                print(f"⚠ Low balance — may not be enough for {count} numbers (~$0.15-0.30 each)")
        except Exception as e:
            print(f"⚠ Cannot check balance: {e}")

        ok = failed = 0
        for i in range(1, count + 1):
            success = await create_one_account(sms_provider, country, i)
            if success:
                ok += 1
            else:
                failed += 1

            if i < count:
                jitter = random.randint(-10, 20)
                wait = delay + jitter
                print(f"  Waiting {wait}s before next account...")
                await asyncio.sleep(wait)

    existing = load_accounts()
    print(f"\n{'─'*45}")
    print(f"Created: {ok}/{count}  Failed: {failed}")
    print(f"Total sessions available: {len(existing)}")
    print(f"Sessions: {SESSIONS_DIR}/")
    print(f"{'─'*45}")


def list_sessions():
    accounts = load_accounts()
    if not accounts:
        print("No sessions found. Run: python tools/tg_account_factory.py --count 5")
        return
    print(f"\n{'─'*50}")
    print(f"{'#':>3}  {'Name':20}  {'Phone':15}  {'Created'}")
    print(f"{'─'*50}")
    for a in accounts:
        path = SESSIONS_DIR / a["session_file"]
        exists = "✓" if path.exists() else "✗ missing"
        print(f"{a['idx']:>3}  {a['first_name']:20}  {a['phone']:15}  {a['created_at'][:10]}  {exists}")
    print(f"{'─'*50}")
    print(f"Total: {len(accounts)} accounts\n")


def main():
    parser = argparse.ArgumentParser(description="Bulk TG account creator")
    parser.add_argument("--count",   type=int, default=5,    help="Number of accounts to create")
    parser.add_argument("--country", default="ua",           help="Country code: ua/ru/kz/pl/in/ph")
    parser.add_argument("--service", choices=["sms-activate", "5sim"], default="sms-activate")
    parser.add_argument("--delay",   type=int, default=45,   help="Seconds between accounts (default 45)")
    parser.add_argument("--list-sessions", action="store_true", help="Show existing sessions")
    args = parser.parse_args()

    if args.list_sessions:
        list_sessions()
        return

    asyncio.run(run_factory(args.count, args.country, args.service, args.delay))


if __name__ == "__main__":
    main()
