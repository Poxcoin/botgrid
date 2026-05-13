#!/bin/bash
# Called by systemd ExecStartPost= on service (re)start.
# Sends a Telegram alert to admin when any botgrid service restarts.
# Env vars read from /opt/botgrid/.env via EnvironmentFile= in unit files.

SERVICE="${1:-unknown}"
MSG="⚠️ <b>KADO service restarted</b>%0A%0AService: <code>${SERVICE}</code>%0ATime: $(date '+%Y-%m-%d %H:%M:%S UTC')"

if [ -z "${TG_BOT_TOKEN}" ] || [ -z "${TG_CHAT_ID}" ]; then
    echo "[notify_restart] TG_BOT_TOKEN or TG_CHAT_ID not set — skipping alert"
    exit 0
fi

curl -s -X POST "https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TG_CHAT_ID}" \
    --data-urlencode "text=⚠️ KADO service restarted

Service: ${SERVICE}
Time: $(date '+%Y-%m-%d %H:%M UTC')" \
    --data "parse_mode=HTML" \
    --max-time 10 \
    > /dev/null
