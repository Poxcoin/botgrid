"""
tg_commander.py — Standalone Telegram command handler thread.
Polls every 2s independently of the main trading loop.
"""
import sqlite3
import subprocess
import threading
import time
import os
from datetime import datetime, timezone

import requests

from config.settings import TG_BOT_TOKEN, TG_CHAT_ID, BYBIT_API_KEY, BYBIT_SECRET, USE_TESTNET, IS_DEMO_TRADING

_BASE = f"https://api.telegram.org/bot{TG_BOT_TOKEN}"
_DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "analytics.db")


_KEYBOARD = {
    "keyboard": [
        [{"text": "/balance"}, {"text": "/pnl"}],
        [{"text": "/trades 10"}, {"text": "/signals"}],
        [{"text": "/open"}, {"text": "/status"}],
    ],
    "resize_keyboard": True,
    "persistent": True,
}


def _send(chat_id, text: str, with_keyboard: bool = False):
    if not TG_BOT_TOKEN:
        return
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if with_keyboard:
        payload["reply_markup"] = _KEYBOARD
    try:
        requests.post(f"{_BASE}/sendMessage", json=payload, timeout=8)
    except Exception as e:
        print(f"[tg_commander] send error: {e}")


def _get_updates(offset):
    if not TG_BOT_TOKEN:
        return []
    try:
        r = requests.get(f"{_BASE}/getUpdates",
                         params={"offset": offset, "limit": 10, "timeout": 2},
                         timeout=6)
        return r.json().get("result", []) if r.status_code == 200 else []
    except Exception:
        return []


# ─── Command handlers ────────────────────────────────────────────────────────

def _cmd_status(chat_id):
    svcs = ["crypto-web", "crypto-sniper", "crypto-grid", "crypto-bot"]
    lines = ["<b>Сервіси</b>"]
    for s in svcs:
        r = subprocess.run(["systemctl", "is-active", s], capture_output=True, text=True)
        st = r.stdout.strip()
        icon = "OK" if st == "active" else "FAIL"
        lines.append(f"[{icon}] {s}")
    lines.append(f"\n{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} UTC")
    _send(chat_id, "\n".join(lines))


def _cmd_balance(chat_id):
    try:
        import ccxt
        ex = ccxt.bybit({"apiKey": BYBIT_API_KEY, "secret": BYBIT_SECRET, "enableRateLimit": True})
        if IS_DEMO_TRADING:
            ex.urls["api"] = ex.urls["demotrading"]
        elif USE_TESTNET:
            ex.set_sandbox_mode(True)
        ex.options["adjustForTimeDifference"] = True
        bal = ex.fetch_balance()
        usdt = bal.get("USDT", {}).get("free", 0)
        total = bal.get("USDT", {}).get("total", 0)
        _send(chat_id, f"<b>Баланс Bybit</b>\nВільно: {usdt:.2f} USDT\nВсього: {total:.2f} USDT")
    except Exception as e:
        _send(chat_id, f"Помилка балансу: {e}")


def _cmd_pnl(chat_id):
    try:
        con = sqlite3.connect(_DB_PATH)
        con.row_factory = sqlite3.Row
        closed = con.execute("SELECT pnl_usdt, timestamp_open FROM trades WHERE result != 'OPEN'").fetchall()
        open_n = con.execute("SELECT COUNT(*) FROM trades WHERE result='OPEN'").fetchone()[0]
        con.close()

        total_pnl = sum((r["pnl_usdt"] or 0) for r in closed)
        today_pnl = sum(
            (r["pnl_usdt"] or 0) for r in closed
            if (r["timestamp_open"] or "") >= datetime.now(timezone.utc).strftime("%Y-%m-%d")
        )
        wins = sum(1 for r in closed if (r["pnl_usdt"] or 0) > 0)
        n = len(closed)
        wr = wins / max(n, 1) * 100

        _send(chat_id,
              f"<b>PnL</b>\n"
              f"Сьогодні: <b>{today_pnl:+.2f}$</b>\n"
              f"Всього: <b>{total_pnl:+.2f}$</b>\n"
              f"Угод: {n}  Win Rate: {wr:.0f}%\n"
              f"Зараз відкрито: {open_n}")
    except Exception as e:
        _send(chat_id, f"Помилка pnl: {e}")


def _cmd_trades(chat_id, n: int = 7):
    try:
        con = sqlite3.connect(_DB_PATH)
        con.row_factory = sqlite3.Row
        rows = con.execute(
            "SELECT coin, action, pnl_usdt, result, timestamp_open FROM trades "
            "WHERE result != 'OPEN' ORDER BY rowid DESC LIMIT ?", (n,)
        ).fetchall()
        con.close()
        if not rows:
            _send(chat_id, "Немае закритих угод.")
            return
        lines = [f"<b>Останні угоди ({n})</b>"]
        for r in rows:
            pnl = r["pnl_usdt"] or 0
            ok = "WIN" if pnl > 0 else "LOSS"
            date = (r["timestamp_open"] or "")[:10]
            lines.append(f"[{ok}] {r['coin']} {r['action']} | {pnl:+.2f}$ | {date}")
        _send(chat_id, "\n".join(lines))
    except Exception as e:
        _send(chat_id, f"Помилка trades: {e}")


def _cmd_signals(chat_id):
    try:
        con = sqlite3.connect(_DB_PATH)
        con.row_factory = sqlite3.Row
        total = con.execute("SELECT COUNT(*) FROM signals").fetchone()[0]
        executed = con.execute("SELECT COUNT(*) FROM signals WHERE executed=1").fetchone()[0]
        rows = con.execute(
            "SELECT coin, action, total_score, confidence, timestamp FROM signals "
            "WHERE executed=1 ORDER BY rowid DESC LIMIT 5"
        ).fetchall()
        con.close()
        lines = [f"<b>Сигнали</b>  всього {total}, виконано {executed}"]
        for s in rows:
            sc = s["total_score"] or 0
            date = (s["timestamp"] or "")[:16]
            lines.append(f"{s['coin']} {s['action']} score={sc:+.1f} conf={s['confidence']}% | {date}")
        _send(chat_id, "\n".join(lines))
    except Exception as e:
        _send(chat_id, f"Помилка signals: {e}")


def _cmd_open(chat_id):
    try:
        con = sqlite3.connect(_DB_PATH)
        con.row_factory = sqlite3.Row
        rows = con.execute(
            "SELECT coin, action, entry_price, timestamp_open FROM trades WHERE result='OPEN'"
        ).fetchall()
        con.close()
        if not rows:
            _send(chat_id, "Вiдкритих позицiй немає.")
            return
        now = datetime.now(timezone.utc)
        lines = [f"<b>Вiдкрито ({len(rows)})</b>"]
        for r in rows:
            try:
                ts = datetime.fromisoformat((r["timestamp_open"] or "").replace("Z", "+00:00"))
                mins = int((now - ts).total_seconds() / 60)
                age = f"{mins}хв"
            except Exception:
                age = "?"
            lines.append(f"{r['coin']} {r['action']} вхiд={r['entry_price']} | {age}")
        _send(chat_id, "\n".join(lines))
    except Exception as e:
        _send(chat_id, f"Помилка open: {e}")


_HELP = (
    "<b>Trading Bot — команди</b>\n\n"
    "/status   — сервiси\n"
    "/balance  — баланс Bybit\n"
    "/pnl      — прибуток/збиток\n"
    "/trades N — останнi N угод\n"
    "/signals  — останнi сигнали\n"
    "/open     — вiдкритi позицiї"
)


def _dispatch(chat_id, text: str):
    if str(chat_id) != str(TG_CHAT_ID):
        return
    cmd = text.strip().lower().split()[0] if text.strip() else ""
    if cmd == "/status":
        _cmd_status(chat_id)
    elif cmd == "/balance":
        _cmd_balance(chat_id)
    elif cmd == "/pnl":
        _cmd_pnl(chat_id)
    elif cmd == "/trades":
        parts = text.strip().split()
        n = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 7
        _cmd_trades(chat_id, n)
    elif cmd == "/signals":
        _cmd_signals(chat_id)
    elif cmd == "/open":
        _cmd_open(chat_id)
    elif cmd in ("/start", "/help"):
        _send(chat_id, _HELP, with_keyboard=True)


# ─── Background thread ───────────────────────────────────────────────────────

def start_commander() -> threading.Thread:
    def _run():
        print("[tg_commander] Started")
        offset = None
        while True:
            try:
                updates = _get_updates(offset)
                for upd in updates:
                    offset = upd["update_id"] + 1
                    msg = upd.get("message", {})
                    chat_id = msg.get("chat", {}).get("id")
                    text = msg.get("text", "") or ""
                    if chat_id and text.startswith("/"):
                        _dispatch(chat_id, text)
            except Exception as e:
                print(f"[tg_commander] error: {e}")
            time.sleep(2)

    t = threading.Thread(target=_run, name="tg-commander", daemon=True)
    t.start()
    return t
