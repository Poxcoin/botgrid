#!/bin/bash
# Запускає MT5 + MacroBot автоматично

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MT5_EXE="/home/minus/.wine/drive_c/Program Files/MetaTrader 5/terminal64.exe"
LOGFILE="$SCRIPT_DIR/macro_bot.log"

export DISPLAY="${DISPLAY:-:0.0}"
export WINEPREFIX="/home/minus/.wine"

echo "=== Macro Bot Startup ==="
echo "$(date)"

# --- Зупинити старі процеси ---
pkill -f "terminal64.exe" 2>/dev/null && echo "Зупинено старий MT5" && sleep 2
pkill -f "python3 bot.py"  2>/dev/null && echo "Зупинено старий бот"

# --- Запустити MT5 ---
echo "Запускаємо MetaTrader 5..."
wine "$MT5_EXE" &
MT5_PID=$!
echo "MT5 PID: $MT5_PID"

# --- Чекаємо поки EA запуститься (макс 60 сек) ---
echo "Чекаємо на EA (до 60 сек)..."
for i in $(seq 1 30); do
    sleep 2
    RESULT=$(python3 -c "
import sys
sys.path.insert(0, '$SCRIPT_DIR')
from mt5_client import MT5Client
c = MT5Client()
p = c.ping()
print('ok' if p and p.get('status') == 'pong' else 'wait')
" 2>/dev/null)
    if [ "$RESULT" = "ok" ]; then
        echo "✅ MT5 EA готовий (${i}x2 сек)"
        break
    fi
    echo "  Спроба $i/30..."
done

if [ "$RESULT" != "ok" ]; then
    echo "❌ EA не відповів за 60 сек. Перевір MT5 і EA вручну."
    exit 1
fi

# --- Запустити бот ---
echo "Запускаємо MacroBot..."
cd "$SCRIPT_DIR"
nohup python3 bot.py >> "$LOGFILE" 2>&1 &
BOT_PID=$!
echo "✅ Бот запущено (PID: $BOT_PID)"
echo "$BOT_PID" > "$SCRIPT_DIR/bot.pid"

echo ""
echo "Логи: tail -f $LOGFILE"
echo "Зупинити: kill \$(cat $SCRIPT_DIR/bot.pid)"
