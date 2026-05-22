"""
tools/bot_health.py — bot liveness monitor.

Per-bot check: is the bot scanning recently?
- crypto-bot:    log file /opt/botgrid/bot_engine.log
- crypto-sweep:  /opt/botgrid/sweep.log
- crypto-cascade: /opt/botgrid/cascade.log
- crypto-ob:     /opt/botgrid/orderblock.log
- crypto-trend:  journal (no log file)

If last log entry > MAX_STALE_MIN minutes ago → TG alert (with cooldown to
avoid spam).

Cron: every 10 min.
"""
import os
import sys
import json
import time
import subprocess
import re
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, '/opt/botgrid')
os.chdir('/opt/botgrid')
from dotenv import load_dotenv
load_dotenv('/opt/botgrid/.env')

from modules.tg_notifier import send_telegram_message
from config.settings import TG_CHAT_ID

MAX_STALE_MIN = 30          # bot must log within this window
ALERT_COOLDOWN_MIN = 120    # don't re-alert same bot within 2h
STATE_FILE = Path('/opt/botgrid/bot_health_state.json')

# (service, source_type, log_path or None for journal, expected_keyword)
BOTS = [
    ("crypto-bot",     "Signal",     "/opt/botgrid/bot_engine.log",  "Сканування"),
    ("crypto-sweep",   "Sweep",      "/opt/botgrid/sweep.log",       "[SW]"),
    ("crypto-cascade", "Cascade",    "/opt/botgrid/cascade.log",     "[CASCADE"),
    ("crypto-ob",      "OrderBlock", "/opt/botgrid/orderblock.log",  "[OB]"),
    ("crypto-trend",   "TrendFollow", None,                            "[TREND]"),
]

# Pattern: "[HH:MM:SS] ..." or "[BB] ..." — extract any timestamp [HH:MM:SS]
_TS_RE = re.compile(r'\[(\d{1,2}):(\d{2}):(\d{2})\]')


def _load_state():
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            return {}
    return {}


def _save_state(s):
    tmp = STATE_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(s, indent=2))
    tmp.replace(STATE_FILE)


def _file_mtime_age_min(path):
    try:
        return (time.time() - os.path.getmtime(path)) / 60
    except Exception:
        return None


def _journal_last_entry_age_min(service):
    """Get age of last entry from systemd journal for a service."""
    try:
        out = subprocess.run(
            ["journalctl", "-u", f"{service}.service", "-n", "1",
             "--no-pager", "-o", "short-iso"],
            capture_output=True, text=True, timeout=10,
        ).stdout.strip()
        # Format: "2026-05-22T19:21:03+0000 grid python[..."
        if not out:
            return None
        ts_str = out.split()[0]
        ts = datetime.fromisoformat(ts_str)
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - ts).total_seconds() / 60
    except Exception:
        return None


def _service_active(service):
    try:
        out = subprocess.run(
            ["systemctl", "is-active", f"{service}.service"],
            capture_output=True, text=True, timeout=5,
        ).stdout.strip()
        return out == "active"
    except Exception:
        return False


def check_bot(service, source_type, log_path, keyword, state, now):
    active = _service_active(service)
    if not active:
        return _maybe_alert(service, source_type, "service inactive",
                            None, state, now, severity="🚨")

    if log_path:
        age = _file_mtime_age_min(log_path)
    else:
        age = _journal_last_entry_age_min(service)

    if age is None:
        return None  # no data, skip

    if age > MAX_STALE_MIN:
        return _maybe_alert(service, source_type,
                            f"no activity for {age:.0f} min (threshold {MAX_STALE_MIN})",
                            age, state, now, severity="⚠️")
    return None


def _maybe_alert(service, source_type, reason, age, state, now, severity="⚠️"):
    bot_state = state.setdefault(service, {})
    last_alert = bot_state.get("last_alert_ts", 0)
    if now - last_alert < ALERT_COOLDOWN_MIN * 60:
        return None  # in cooldown
    bot_state["last_alert_ts"] = now
    bot_state["last_reason"] = reason
    msg = (
        f"{severity} <b>Bot health</b>\n"
        f"<b>{source_type}</b> (<code>{service}</code>)\n"
        f"{reason}"
    )
    if age:
        msg += f"\nLast log: {age:.0f} min ago"
    try:
        send_telegram_message(msg, TG_CHAT_ID)
        return service
    except Exception:
        return None


def main():
    state = _load_state()
    now = time.time()
    alerted = []
    for service, source_type, log_path, keyword in BOTS:
        result = check_bot(service, source_type, log_path, keyword, state, now)
        if result:
            alerted.append(result)
    _save_state(state)
    if alerted:
        print(f"alerted: {alerted}")


if __name__ == "__main__":
    main()
