#!/bin/bash
# 1. Создаем правильную ссылку без пробелов
sudo ln -sf "/home/minus/Desktop/bot grid" /home/minus/bot_grid

# 2. Создаем unit-файл от имени пользователя minus (вместо trader, так как папка принадлежит minus)
cat > /tmp/crypto-bot.service <<EOF
[Unit]
Description=AI Crypto Trading Bot Engine
After=network.target

[Service]
Type=simple
User=minus
WorkingDirectory=/home/minus/bot_grid
Environment=PATH=/home/minus/bot_grid/venv/bin
ExecStart=/home/minus/bot_grid/venv/bin/python /home/minus/bot_grid/main.py
Restart=on-failure
RestartSec=10
StandardOutput=append:/home/minus/bot_grid/bot.log
StandardError=append:/home/minus/bot_grid/bot_error.log

[Install]
WantedBy=multi-user.target
EOF

sudo mv /tmp/crypto-bot.service /etc/systemd/system/crypto-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now crypto-bot.service
systemctl status crypto-bot.service
