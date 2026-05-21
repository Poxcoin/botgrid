#!/opt/botgrid/venv/bin/python
import sys, os, requests, subprocess

service = sys.argv[1] if len(sys.argv) > 1 else "unknown"
token   = os.getenv("USERBOT_TOKEN", "")
chat_id = os.getenv("TG_CHAT_ID", "")

if not token or not chat_id:
    print(f"[watchdog] no token/chat_id, cannot notify for {service}")
    sys.exit(0)

try:
    log = subprocess.check_output(
        ["journalctl", "-u", service, "-n", "10", "--no-pager", "--output=short"],
        timeout=5, text=True,
    )
except Exception:
    log = "(log unavailable)"

text = f" <b>{service} crashed</b>\n<pre>{log[-800:]}</pre>"

try:
    r = requests.post(
        f"https://api.telegram.org/bot{token}/sendMessage",
        json={"chat_id": chat_id, "text": text, "parse_mode": "HTML"},
        timeout=10,
    )
    print(f"[watchdog] TG response: {r.status_code}")
except Exception as e:
    print(f"[watchdog] failed: {e}")
