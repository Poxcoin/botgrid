#!/usr/bin/env bash
# install_bot_service.sh – creates and enables crypto-bot.service
# Requires sudo privileges

SERVICE_PATH="/etc/systemd/system/crypto-bot.service"

cat > /tmp/crypto-bot.service <<'EOF'
[Unit]
Description=AI Crypto Trading Bot Engine
After=network.target

[Service]
Type=simple
User=trader
WorkingDirectory="/home/trader/bot grid"
Environment="PATH=/home/trader/bot grid/venv/bin"
ExecStart=/home/trader/bot\ grid/venv/bin/python main.py
Restart=on-failure
RestartSec=10
StandardOutput=append:/home/trader/bot\ grid/bot.log
StandardError=append:/home/trader/bot\ grid/bot_error.log

[Install]
WantedBy=multi-user.target
EOF

# Move the service file with sudo
sudo mv /tmp/crypto-bot.service "$SERVICE_PATH"

# Reload systemd, enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable --now crypto-bot.service

echo "crypto-bot.service installed, enabled and started."
