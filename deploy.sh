#!/bin/bash
# Deploy: sync /root/bot_grid/ → /opt/botgrid/ and restart services
set -e

SRC=/root/bot_grid
DST=/opt/botgrid

echo "=== Syncing $SRC → $DST ==="
cp -r $SRC/modules $DST/
cp -r $SRC/config $DST/
cp $SRC/grid_bot.py $DST/
cp $SRC/main.py $DST/
cp $SRC/fix_sol.py $DST/ 2>/dev/null || true

echo "=== Removing state files ==="
rm -f $DST/grid_state_*.json

echo "=== Restarting services ==="
systemctl restart crypto-grid
systemctl restart crypto-bot

echo "=== Done! Logs: ==="
sleep 3
tail -20 /opt/botgrid/grid_bot.log
