#!/bin/bash
# Зупиняє бот і MT5

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -f "$SCRIPT_DIR/bot.pid" ]; then
    PID=$(cat "$SCRIPT_DIR/bot.pid")
    kill "$PID" 2>/dev/null && echo "✅ Бот зупинено (PID: $PID)" || echo "Бот вже не працює"
    rm -f "$SCRIPT_DIR/bot.pid"
fi

pkill -f "terminal64.exe" 2>/dev/null && echo "✅ MT5 зупинено" || echo "MT5 вже не працює"
