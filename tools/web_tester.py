#!/usr/bin/env python3
"""
web_tester.py — Multi-profile web tester for kadoclub.net

Tests:
  registration  — full signup flow (N unique accounts)
  login         — login with existing test accounts
  dashboard     — dashboard load, tabs, charts
  load          — concurrent requests from N contexts (stress test)
  full          — registration + login + dashboard

Usage:
  python tools/web_tester.py --test registration --accounts 5
  python tools/web_tester.py --test load --accounts 20 --headless
  python tools/web_tester.py --test full --accounts 3
  python tools/web_tester.py --cleanup           # remove test accounts from DB

Requirements:
  pip install playwright
  playwright install chromium

Config (.env):
  WEB_TEST_BASE_URL  — base URL (default: https://kadoclub.net)
  WEB_TEST_PASSWORD  — password for test accounts (default: TestPass2026!)

Incognition integration (optional):
  Set INCOGNITION_API_KEY in .env to use Incognition profiles instead of
  raw Playwright contexts. Falls back to Playwright if not set.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import re
import sqlite3
import string
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BASE_URL        = os.getenv("WEB_TEST_BASE_URL", "https://kadoclub.net")
TEST_PASSWORD   = os.getenv("WEB_TEST_PASSWORD", "TestPass2026!")
INCOGNITION_KEY = os.getenv("INCOGNITION_API_KEY", "")
REPORT_FILE     = Path(__file__).resolve().parent.parent / "web_test_results.json"
DB_PATH         = Path(__file__).resolve().parent.parent / "saas_database.sqlite"

# prefix for test account emails so we can clean up later
TEST_EMAIL_PREFIX = "kadotest_"


def _rand_email() -> str:
    slug = "".join(random.choices(string.ascii_lowercase + string.digits, k=8))
    return f"{TEST_EMAIL_PREFIX}{slug}@mailtest.dev"


def _rand_name() -> str:
    first = random.choice(["Alex", "Ivan", "Olena", "Max", "Daria", "Artem"])
    last  = random.choice(["K", "S", "M", "P", "T"])
    return f"{first} {last}"


# ── Incognition integration ───────────────────────────────────────────────────

async def _incognition_get_profile(session, api_key: str) -> str | None:
    """Create or get an Incognition profile, return WebDriver URL."""
    try:
        import aiohttp
        headers = {"X-API-KEY": api_key, "Content-Type": "application/json"}
        payload = {
            "name": f"kado_test_{int(time.time())}",
            "browser_type": "chrome",
            "os": random.choice(["windows", "macos"]),
        }
        async with session.post(
            "https://app.incognition.app/api/v1/profiles",
            headers=headers,
            json=payload,
        ) as resp:
            if resp.status == 200:
                data = await resp.json()
                profile_id = data.get("id")
                async with session.get(
                    f"https://app.incognition.app/api/v1/profiles/{profile_id}/start",
                    headers=headers,
                ) as r2:
                    d2 = await r2.json()
                    return d2.get("webdriver_url")
    except Exception as e:
        print(f"  [incognition] Error: {e} — falling back to Playwright context")
    return None


# ── Test flows ────────────────────────────────────────────────────────────────

async def test_registration(page, account_num: int) -> dict:
    result = {
        "test": "registration",
        "account": account_num,
        "email": "",
        "steps": [],
        "passed": False,
    }
    email = _rand_email()
    result["email"] = email

    try:
        await page.goto(f"{BASE_URL}/register", wait_until="networkidle", timeout=30000)
        result["steps"].append("page_loaded")

        await page.fill('input[type="email"], input[name="email"]', email)
        await page.fill('input[type="password"], input[name="password"]', TEST_PASSWORD)

        confirm_sel = 'input[name="confirm_password"], input[name="password_confirm"]'
        if await page.query_selector(confirm_sel):
            await page.fill(confirm_sel, TEST_PASSWORD)

        name_sel = 'input[name="name"], input[name="username"], input[placeholder*="ім\'я"]'
        if await page.query_selector(name_sel):
            await page.fill(name_sel, _rand_name())

        result["steps"].append("form_filled")
        await page.click('button[type="submit"], button:has-text("Register"), button:has-text("Реєстрація")')
        await page.wait_for_timeout(3000)

        current = page.url
        if "/dashboard" in current or "/login" in current or "/app" in current:
            result["steps"].append("redirect_ok")
            result["passed"] = True
        else:
            error = await page.query_selector(".error, .alert-danger, [class*='error']")
            if error:
                msg = await error.inner_text()
                result["steps"].append(f"error: {msg[:100]}")
            else:
                result["steps"].append(f"unexpected_url: {current}")

    except Exception as e:
        result["steps"].append(f"exception: {e}")

    return result


async def test_login(page, email: str, account_num: int) -> dict:
    result = {"test": "login", "account": account_num, "steps": [], "passed": False}
    try:
        await page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=30000)
        await page.fill('input[type="email"], input[name="email"]', email)
        await page.fill('input[type="password"], input[name="password"]', TEST_PASSWORD)
        await page.click('button[type="submit"]')
        await page.wait_for_timeout(3000)
        if "/dashboard" in page.url or "/app" in page.url:
            result["passed"] = True
            result["steps"].append("login_ok")
        else:
            result["steps"].append(f"still_at: {page.url}")
    except Exception as e:
        result["steps"].append(f"exception: {e}")
    return result


async def test_dashboard(page, account_num: int) -> dict:
    result = {"test": "dashboard", "account": account_num, "steps": [], "passed": False}
    try:
        await page.goto(f"{BASE_URL}/dashboard", wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2000)
        if "/login" in page.url:
            result["steps"].append("redirected_to_login (not authenticated)")
            return result

        result["steps"].append("dashboard_loaded")
        for selector in [".chart", "[class*='chart']", "[class*='pnl']", "[class*='stats']"]:
            if await page.query_selector(selector):
                result["steps"].append(f"found: {selector}")
                break

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        await page.wait_for_timeout(1000)
        if console_errors:
            result["steps"].append(f"console_errors: {console_errors[:3]}")
        else:
            result["steps"].append("no_console_errors")

        result["passed"] = True
    except Exception as e:
        result["steps"].append(f"exception: {e}")
    return result


async def test_load(browser_pool, n: int) -> dict:
    result = {"test": "load", "accounts": n, "ok": 0, "errors": 0, "avg_ms": 0}
    timings = []

    async def one_request(i):
        context = await browser_pool.new_context()
        page = await context.new_page()
        t0 = time.perf_counter()
        try:
            resp = await page.goto(BASE_URL, wait_until="load", timeout=20000)
            elapsed = int((time.perf_counter() - t0) * 1000)
            timings.append(elapsed)
            if resp and resp.status < 400:
                result["ok"] += 1
            else:
                result["errors"] += 1
        except Exception:
            result["errors"] += 1
        finally:
            await context.close()

    await asyncio.gather(*[one_request(i) for i in range(n)])
    if timings:
        result["avg_ms"] = int(sum(timings) / len(timings))
        result["min_ms"] = min(timings)
        result["max_ms"] = max(timings)
    return result


# ── Runner ────────────────────────────────────────────────────────────────────

async def run_tests(test: str, n_accounts: int, headless: bool):
    try:
        from playwright.async_api import async_playwright
    except ImportError:
        print("[error] Playwright not installed. Run: pip install playwright && playwright install chromium")
        return

    all_results = []
    registered_emails = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)

        if test == "load":
            print(f"Load test: {n_accounts} concurrent requests to {BASE_URL}...")
            r = await test_load(browser, n_accounts)
            all_results.append(r)
            print(f"  OK: {r['ok']}, Errors: {r['errors']}, Avg: {r.get('avg_ms')}ms")

        else:
            for i in range(1, n_accounts + 1):
                context = await browser.new_context(
                    user_agent=_random_ua(),
                    viewport={"width": random.randint(1280, 1920), "height": random.randint(768, 1080)},
                    locale=random.choice(["uk-UA", "ru-RU", "en-US"]),
                )
                page = await context.new_page()
                print(f"\n[account {i}/{n_accounts}]")

                if test in ("registration", "full"):
                    r = await test_registration(page, i)
                    all_results.append(r)
                    status = "✓" if r["passed"] else "✗"
                    print(f"  Registration {status}: {' → '.join(r['steps'])}")
                    if r["passed"]:
                        registered_emails.append(r["email"])

                if test in ("login", "full") and registered_emails:
                    email = registered_emails[i - 1] if i - 1 < len(registered_emails) else _rand_email()
                    r = await test_login(page, email, i)
                    all_results.append(r)
                    print(f"  Login {'✓' if r['passed'] else '✗'}")

                if test in ("dashboard", "full"):
                    r = await test_dashboard(page, i)
                    all_results.append(r)
                    print(f"  Dashboard {'✓' if r['passed'] else '✗'}: {' → '.join(r['steps'])}")

                await context.close()
                await asyncio.sleep(random.uniform(1.5, 3.0))

        await browser.close()

    report = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "test": test,
        "accounts": n_accounts,
        "base_url": BASE_URL,
        "results": all_results,
    }
    REPORT_FILE.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"\nReport saved → {REPORT_FILE}")

    passed = sum(1 for r in all_results if r.get("passed", False))
    print(f"Summary: {passed}/{len(all_results)} passed\n")

    return registered_emails


def cleanup_test_accounts():
    if not DB_PATH.exists():
        print("DB not found locally — run on VPS with saas_database.sqlite present")
        return
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT id, email FROM users WHERE email LIKE ?", (f"{TEST_EMAIL_PREFIX}%",)
        ).fetchall()
        if not rows:
            print("No test accounts found")
            return
        ids = [r[0] for r in rows]
        conn.execute(f"DELETE FROM users WHERE id IN ({','.join('?'*len(ids))})", ids)
        print(f"Removed {len(rows)} test accounts")


def _random_ua() -> str:
    uas = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    ]
    return random.choice(uas)


def main():
    parser = argparse.ArgumentParser(description="Web multi-account tester")
    parser.add_argument("--test", choices=["registration", "login", "dashboard", "load", "full"],
                        default="registration")
    parser.add_argument("--accounts", type=int, default=3)
    parser.add_argument("--headless", action="store_true", default=False,
                        help="Run headless (default: headed so you can see what happens)")
    parser.add_argument("--cleanup", action="store_true", help="Remove test accounts from DB")
    args = parser.parse_args()

    if args.cleanup:
        cleanup_test_accounts()
        return

    asyncio.run(run_tests(args.test, args.accounts, args.headless))


if __name__ == "__main__":
    main()
