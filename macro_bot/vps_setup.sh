#!/bin/bash
# VPS setup script for Macro Bot (run once on fresh VPS)
# ssh root@159.69.110.239
# bash /opt/botgrid/macro_bot/vps_setup.sh

set -e
echo "=== Macro Bot VPS Setup ==="

# --- Wine + Xvfb ---
dpkg --add-architecture i386
apt-get update -q
apt-get install -y wine wine32 wine64 xvfb xdotool wget cabextract

# --- Winetricks (для шрифтів MT5) ---
wget -q https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks -O /usr/local/bin/winetricks
chmod +x /usr/local/bin/winetricks

# --- Wine prefix ---
export WINEPREFIX=/root/.wine
export WINEARCH=win64
export DISPLAY=:99

Xvfb :99 -screen 0 1024x768x16 &
XVFB_PID=$!
sleep 2

wineboot --init
sleep 3

# --- Завантажити MT5 ---
echo "Завантажуємо MetaTrader 5..."
wget -q "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe" \
     -O /tmp/mt5setup.exe

# --- Встановити MT5 ---
echo "Встановлюємо MT5 (це займе ~2 хв)..."
wine /tmp/mt5setup.exe /auto
sleep 60

# --- Скопіювати EA ---
EA_SRC="/opt/botgrid/macro_bot/MacroBridgeEA.mq5"
EA_DST="/root/.wine/drive_c/Program Files/MetaTrader 5/MQL5/Experts/MacroBridgeEA.mq5"
cp "$EA_SRC" "$EA_DST"
echo "EA скопійовано"

# --- Python venv + залежності ---
cd /opt/botgrid
source venv/bin/activate
pip install -q -r macro_bot/requirements.txt

# --- Systemd сервіси ---
cp /opt/botgrid/macro_bot/kado-macro-mt5.service /etc/systemd/system/
cp /opt/botgrid/macro_bot/kado-macro.service      /etc/systemd/system/
cp /opt/botgrid/macro_bot/kado-macro.timer        /etc/systemd/system/
cp /opt/botgrid/macro_bot/kado-macro-stop.timer   /etc/systemd/system/

systemctl daemon-reload
systemctl enable kado-macro-mt5.service
systemctl enable kado-macro.service
systemctl enable kado-macro.timer
systemctl enable kado-macro-stop.timer

kill $XVFB_PID 2>/dev/null

echo ""
echo "✅ Setup завершено!"
echo ""
echo "ВАЖЛИВО: Тепер потрібно вручну відкрити MT5 і налаштувати демо рахунок:"
echo "  DISPLAY=:99 Xvfb :99 -screen 0 1024x768x16 &"
echo "  DISPLAY=:99 wine '/root/.wine/drive_c/Program Files/MetaTrader 5/terminal64.exe'"
echo ""
echo "Після налаштування рахунку і EA:"
echo "  systemctl start kado-macro-mt5"
echo "  systemctl start kado-macro"
echo ""
echo "Автостарт по неділях о 22:00 UTC вже налаштовано (kado-macro.timer)"
