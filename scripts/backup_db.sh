#!/bin/bash
# Kado DB Backup — production-grade with rotation + Telegram alerts

set -euo pipefail

DB="/opt/botgrid/saas_database.sqlite"
BACKUP_DIR="/opt/botgrid/backups"
BOT_TOKEN="8656371987:AAHwY7Y1hrnibVW2U71VONxXgjFCsvBLPOA"
CHAT_ID="5363797490"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
HOUR=$(date +"%H")
DOW=$(date +"%u")   # 1=Mon 7=Sun
DOM=$(date +"%d")   # day of month

tg_notify() {
    curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
        -d chat_id="${CHAT_ID}" \
        -d parse_mode="HTML" \
        -d text="$1" > /dev/null
}

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"; }

# ── 1. Verify source DB exists ──────────────────────────────────────────────
if [ ! -f "$DB" ]; then
    tg_notify "🚨 <b>Kado Backup FAILED</b>
DB not found: $DB"
    exit 1
fi

# ── 2. Hourly backup (consistent snapshot via sqlite3 .backup) ──────────────
HOURLY_FILE="${BACKUP_DIR}/hourly/saas_${TIMESTAMP}.sqlite"
sqlite3 "$DB" ".backup '${HOURLY_FILE}'"

# ── 3. Verify backup integrity ───────────────────────────────────────────────
INTEGRITY=$(sqlite3 "${HOURLY_FILE}" "PRAGMA integrity_check;" 2>&1)
if [ "$INTEGRITY" != "ok" ]; then
    tg_notify "🚨 <b>Kado Backup CORRUPT</b>
File: ${HOURLY_FILE}
Check: ${INTEGRITY}"
    rm -f "${HOURLY_FILE}"
    exit 1
fi

# ── 4. Get backup size and row counts ────────────────────────────────────────
SIZE=$(du -sh "${HOURLY_FILE}" | cut -f1)
USERS=$(sqlite3 "${HOURLY_FILE}" "SELECT COUNT(*) FROM users;")
API_KEYS=$(sqlite3 "${HOURLY_FILE}" "SELECT COUNT(*) FROM user_api_keys;")
TRADES=$(sqlite3 "${HOURLY_FILE}" "SELECT COUNT(*) FROM user_trades;" 2>/dev/null || echo "n/a")

# ── 5. Daily backup (runs at 00:xx) ─────────────────────────────────────────
if [ "$HOUR" = "00" ]; then
    cp "${HOURLY_FILE}" "${BACKUP_DIR}/daily/saas_$(date +%Y-%m-%d).sqlite"
    log "Daily backup created"
fi

# ── 6. Weekly backup (Monday 00:xx) ─────────────────────────────────────────
if [ "$HOUR" = "00" ] && [ "$DOW" = "1" ]; then
    cp "${HOURLY_FILE}" "${BACKUP_DIR}/weekly/saas_week_$(date +%Y-W%V).sqlite"
    log "Weekly backup created"
fi

# ── 7. Monthly backup (1st of month 00:xx) ──────────────────────────────────
if [ "$HOUR" = "00" ] && [ "$DOM" = "01" ]; then
    cp "${HOURLY_FILE}" "${BACKUP_DIR}/monthly/saas_$(date +%Y-%m).sqlite"
    log "Monthly backup created"
fi

# ── 8. Rotation — delete old backups ────────────────────────────────────────
find "${BACKUP_DIR}/hourly"   -name "*.sqlite" -mmin +$((24*60))    -delete
find "${BACKUP_DIR}/daily"    -name "*.sqlite" -mtime +7             -delete
find "${BACKUP_DIR}/weekly"   -name "*.sqlite" -mtime +28            -delete
find "${BACKUP_DIR}/monthly"  -name "*.sqlite" -mtime +365           -delete

# ── 9. Count total backups ───────────────────────────────────────────────────
TOTAL=$(find "${BACKUP_DIR}" -name "*.sqlite" | wc -l)

# ── 10. Telegram success report (only at 00:00 daily, not every hour) ────────
if [ "$HOUR" = "00" ]; then
    tg_notify "✅ <b>Kado DB Backup</b> — $(date +%Y-%m-%d)
Size: ${SIZE} | Integrity: OK
Users: ${USERS} | API keys: ${API_KEYS} | Trades: ${TRADES}
Backups stored: ${TOTAL}"
fi

log "Backup OK: ${HOURLY_FILE} (${SIZE})"
