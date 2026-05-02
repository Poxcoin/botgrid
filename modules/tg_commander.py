"""
tg_commander.py — Telegram bot with inline keyboard navigation.
Standalone daemon thread, polls every 2s.
"""
import sqlite3
import subprocess
import threading
import time
import os
from datetime import datetime, timezone

import requests

from config.settings import (
    TG_BOT_TOKEN, TG_CHAT_ID,
    BYBIT_API_KEY, BYBIT_SECRET, USE_TESTNET, IS_DEMO_TRADING,
    LEVERAGE, TAKE_PROFIT_PERCENT, STOP_LOSS_PERCENT,
    ALT_LEVERAGE, ALT_TP, ALT_SL,
)

_BASE = f"https://api.telegram.org/bot{TG_BOT_TOKEN}"
_DB   = os.path.join(os.path.dirname(os.path.dirname(__file__)), "analytics.db")


# ─── Telegram API helpers ─────────────────────────────────────────────────────

def _post(method: str, **kwargs):
    if not TG_BOT_TOKEN:
        return
    try:
        requests.post(f"{_BASE}/{method}", json=kwargs, timeout=8)
    except Exception as e:
        print(f"[tg_cmd] {method} error: {e}")


def _send(chat_id, text: str, keyboard=None):
    payload = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if keyboard:
        payload["reply_markup"] = {"inline_keyboard": keyboard}
    _post("sendMessage", **payload)


def _edit(chat_id, msg_id, text: str, keyboard=None):
    payload = {"chat_id": chat_id, "message_id": msg_id, "text": text, "parse_mode": "HTML"}
    if keyboard:
        payload["reply_markup"] = {"inline_keyboard": keyboard}
    _post("editMessageText", **payload)


def _answer(callback_id):
    _post("answerCallbackQuery", callback_query_id=callback_id)


def _set_commands():
    _post("setMyCommands", commands=[
        {"command": "start",   "description": "Головне меню"},
        {"command": "balance", "description": "Баланс Bybit"},
        {"command": "pnl",     "description": "Прибуток / збиток"},
        {"command": "trades",  "description": "Останні угоди"},
        {"command": "signals", "description": "Сигнали бота"},
        {"command": "open",    "description": "Відкриті позиції"},
        {"command": "status",  "description": "Статус сервісів"},
    ])


# ─── Menus ────────────────────────────────────────────────────────────────────

_MENU_MAIN = [
    [{"text": "Акаунт",        "callback_data": "menu_account"},
     {"text": "Торгівля",      "callback_data": "menu_trading"}],
    [{"text": "Налаштування",  "callback_data": "menu_settings"},
     {"text": "Статус",        "callback_data": "menu_status"}],
]

_MENU_ACCOUNT = [
    [{"text": "Баланс",  "callback_data": "act_balance"},
     {"text": "PnL",     "callback_data": "act_pnl"}],
    [{"text": "< Назад", "callback_data": "menu_main"}],
]

_MENU_TRADING = [
    [{"text": "Відкриті",  "callback_data": "act_open"},
     {"text": "Угоди",     "callback_data": "act_trades"}],
    [{"text": "Сигнали",   "callback_data": "act_signals"}],
    [{"text": "< Назад",   "callback_data": "menu_main"}],
]

_MENU_SETTINGS = [
    [{"text": "Параметри BTC/ETH", "callback_data": "cfg_btceth"}],
    [{"text": "Параметри Альтів",  "callback_data": "cfg_alts"}],
    [{"text": "< Назад",           "callback_data": "menu_main"}],
]

_MENU_STATUS = [
    [{"text": "Сервіси",  "callback_data": "act_status"}],
    [{"text": "< Назад",  "callback_data": "menu_main"}],
]

_BACK = [[{"text": "< Назад до меню", "callback_data": "menu_main"}]]


# ─── Data fetchers ────────────────────────────────────────────────────────────

def _balance_text():
    try:
        import ccxt
        ex = ccxt.bybit({"apiKey": BYBIT_API_KEY, "secret": BYBIT_SECRET, "enableRateLimit": True})
        if IS_DEMO_TRADING:
            ex.urls["api"] = ex.urls["demotrading"]
        elif USE_TESTNET:
            ex.set_sandbox_mode(True)
        ex.options["adjustForTimeDifference"] = True
        bal = ex.fetch_balance()
        free  = bal.get("USDT", {}).get("free",  0)
        total = bal.get("USDT", {}).get("total", 0)
        return f"<b>Баланс Bybit</b>\nВільно: {free:.2f} USDT\nВсього: {total:.2f} USDT"
    except Exception as e:
        return f"Помилка балансу: {e}"


def _pnl_text():
    try:
        con = sqlite3.connect(_DB)
        con.row_factory = sqlite3.Row
        closed = con.execute("SELECT pnl_usdt, timestamp_open FROM trades WHERE result != 'OPEN'").fetchall()
        open_n = con.execute("SELECT COUNT(*) FROM trades WHERE result='OPEN'").fetchone()[0]
        con.close()
        total = sum((r["pnl_usdt"] or 0) for r in closed)
        today = sum(
            (r["pnl_usdt"] or 0) for r in closed
            if (r["timestamp_open"] or "") >= datetime.now(timezone.utc).strftime("%Y-%m-%d")
        )
        wins = sum(1 for r in closed if (r["pnl_usdt"] or 0) > 0)
        n    = len(closed)
        wr   = wins / max(n, 1) * 100
        return (
            f"<b>PnL</b>\n"
            f"Сьогодні:  {today:+.2f} USDT\n"
            f"Всього:    {total:+.2f} USDT\n"
            f"Угод: {n}   Win Rate: {wr:.0f}%\n"
            f"Відкрито: {open_n}"
        )
    except Exception as e:
        return f"Помилка: {e}"


def _trades_text(n=10):
    try:
        con = sqlite3.connect(_DB)
        con.row_factory = sqlite3.Row
        rows = con.execute(
            "SELECT coin, action, pnl_usdt, timestamp_open FROM trades "
            "WHERE result != 'OPEN' ORDER BY rowid DESC LIMIT ?", (n,)
        ).fetchall()
        con.close()
        if not rows:
            return "Закритих угод немає."
        lines = [f"<b>Останні {n} угод</b>"]
        for r in rows:
            pnl  = r["pnl_usdt"] or 0
            ok   = "WIN " if pnl > 0 else "LOSS"
            date = (r["timestamp_open"] or "")[:10]
            lines.append(f"[{ok}] {r['coin']} {r['action']}  {pnl:+.2f}$  {date}")
        return "\n".join(lines)
    except Exception as e:
        return f"Помилка: {e}"


def _signals_text():
    try:
        con = sqlite3.connect(_DB)
        con.row_factory = sqlite3.Row
        total    = con.execute("SELECT COUNT(*) FROM signals").fetchone()[0]
        executed = con.execute("SELECT COUNT(*) FROM signals WHERE executed=1").fetchone()[0]
        rows     = con.execute(
            "SELECT coin, action, total_score, confidence, timestamp FROM signals "
            "WHERE executed=1 ORDER BY rowid DESC LIMIT 5"
        ).fetchall()
        con.close()
        lines = [f"<b>Сигнали</b>  всього {total}, виконано {executed}"]
        for s in rows:
            sc   = s["total_score"] or 0
            date = (s["timestamp"] or "")[:16]
            lines.append(f"{s['coin']} {s['action']}  score={sc:+.1f}  conf={s['confidence']}%  {date}")
        return "\n".join(lines)
    except Exception as e:
        return f"Помилка: {e}"


def _open_text():
    try:
        con = sqlite3.connect(_DB)
        con.row_factory = sqlite3.Row
        rows = con.execute(
            "SELECT coin, action, entry_price, timestamp_open FROM trades WHERE result='OPEN'"
        ).fetchall()
        con.close()
        if not rows:
            return "Відкритих позицій немає."
        now   = datetime.now(timezone.utc)
        lines = [f"<b>Відкрито ({len(rows)})</b>"]
        for r in rows:
            try:
                ts   = datetime.fromisoformat((r["timestamp_open"] or "").replace("Z", "+00:00"))
                mins = int((now - ts).total_seconds() / 60)
                age  = f"{mins}хв"
            except Exception:
                age = "?"
            lines.append(f"{r['coin']} {r['action']}  вхід={r['entry_price']}  {age}")
        return "\n".join(lines)
    except Exception as e:
        return f"Помилка: {e}"


def _status_text():
    svcs  = ["crypto-web", "crypto-sniper", "crypto-grid", "crypto-bot"]
    lines = ["<b>Сервіси</b>"]
    for s in svcs:
        r  = subprocess.run(["systemctl", "is-active", s], capture_output=True, text=True)
        st = r.stdout.strip()
        lines.append(f"[{'OK  ' if st == 'active' else 'FAIL'}] {s}")
    lines.append(f"\n{datetime.now().strftime('%Y-%m-%d %H:%M')} UTC")
    return "\n".join(lines)


def _settings_btceth():
    return (
        f"<b>BTC / ETH</b>\n"
        f"Плече:      x{LEVERAGE}\n"
        f"Take Profit: {TAKE_PROFIT_PERCENT}%\n"
        f"Stop Loss:   {STOP_LOSS_PERCENT}%"
    )


def _settings_alts():
    return (
        f"<b>Альткоїни</b>\n"
        f"Плече:      x{ALT_LEVERAGE}\n"
        f"Take Profit: {ALT_TP}%\n"
        f"Stop Loss:   {ALT_SL}%"
    )


# ─── Dispatcher ──────────────────────────────────────────────────────────────

def _handle_message(chat_id, text: str):
    if str(chat_id) != str(TG_CHAT_ID):
        return
    cmd = text.strip().lower().split()[0]
    if cmd in ("/start", "/help"):
        _send(chat_id, "<b>Trading Bot</b>\nОберіть розділ:", _MENU_MAIN)
    elif cmd == "/balance":
        _send(chat_id, _balance_text(), _BACK)
    elif cmd == "/pnl":
        _send(chat_id, _pnl_text(), _BACK)
    elif cmd == "/trades":
        parts = text.strip().split()
        n = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 10
        _send(chat_id, _trades_text(n), _BACK)
    elif cmd == "/signals":
        _send(chat_id, _signals_text(), _BACK)
    elif cmd == "/open":
        _send(chat_id, _open_text(), _BACK)
    elif cmd == "/status":
        _send(chat_id, _status_text(), _BACK)


def _handle_callback(chat_id, msg_id, cb_id, data: str):
    if str(chat_id) != str(TG_CHAT_ID):
        return
    _answer(cb_id)

    if data == "menu_main":
        _edit(chat_id, msg_id, "<b>Trading Bot</b>\nОберіть розділ:", _MENU_MAIN)
    elif data == "menu_account":
        _edit(chat_id, msg_id, "<b>Акаунт</b>", _MENU_ACCOUNT)
    elif data == "menu_trading":
        _edit(chat_id, msg_id, "<b>Торгівля</b>", _MENU_TRADING)
    elif data == "menu_settings":
        _edit(chat_id, msg_id, "<b>Налаштування</b>", _MENU_SETTINGS)
    elif data == "menu_status":
        _edit(chat_id, msg_id, "<b>Статус</b>", _MENU_STATUS)
    elif data == "act_balance":
        _edit(chat_id, msg_id, _balance_text(), _BACK)
    elif data == "act_pnl":
        _edit(chat_id, msg_id, _pnl_text(), _BACK)
    elif data == "act_trades":
        _edit(chat_id, msg_id, _trades_text(), _BACK)
    elif data == "act_signals":
        _edit(chat_id, msg_id, _signals_text(), _BACK)
    elif data == "act_open":
        _edit(chat_id, msg_id, _open_text(), _BACK)
    elif data == "act_status":
        _edit(chat_id, msg_id, _status_text(), _BACK)
    elif data == "cfg_btceth":
        _edit(chat_id, msg_id, _settings_btceth(), _BACK)
    elif data == "cfg_alts":
        _edit(chat_id, msg_id, _settings_alts(), _BACK)


# ─── Background thread ────────────────────────────────────────────────────────

def _get_updates(offset):
    if not TG_BOT_TOKEN:
        return []
    try:
        r = requests.get(f"{_BASE}/getUpdates",
                         params={"offset": offset, "limit": 20, "timeout": 2},
                         timeout=6)
        return r.json().get("result", []) if r.status_code == 200 else []
    except Exception:
        return []


def start_commander() -> threading.Thread:
    def _run():
        _set_commands()
        print("[tg_commander] Started")
        offset = None
        while True:
            try:
                updates = _get_updates(offset)
                for upd in updates:
                    offset = upd["update_id"] + 1

                    if "message" in upd:
                        msg     = upd["message"]
                        chat_id = msg.get("chat", {}).get("id")
                        text    = (msg.get("text") or "").strip()
                        if chat_id and text.startswith("/"):
                            _handle_message(chat_id, text)

                    elif "callback_query" in upd:
                        cq      = upd["callback_query"]
                        chat_id = cq.get("message", {}).get("chat", {}).get("id")
                        msg_id  = cq.get("message", {}).get("message_id")
                        cb_id   = cq.get("id")
                        data    = cq.get("data", "")
                        if chat_id and msg_id:
                            _handle_callback(chat_id, msg_id, cb_id, data)

            except Exception as e:
                print(f"[tg_commander] error: {e}")
            time.sleep(2)

    t = threading.Thread(target=_run, name="tg-commander", daemon=True)
    t.start()
    return t
