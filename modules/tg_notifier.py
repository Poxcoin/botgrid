"""
Telegram notification helpers.

Notifications (send_telegram_message) → @KADO_c_BOT (USERBOT_TOKEN)
   Used for client-facing alerts (trades, billing, system) AND admin alerts.
   Recipients must have /start-ed @KADO_c_BOT at least once.

Admin command polling (get_telegram_updates) → admin bot (TG_BOT_TOKEN)
   Used by main.py to poll for legacy /balance /pnl /trades commands.
"""
import requests
from config.settings import TG_BOT_TOKEN, USERBOT_TOKEN


def send_telegram_message(text, chat_id):
    """Send a message via @KADO_c_BOT to any chat_id."""
    if not USERBOT_TOKEN:
        print("⚠️ USERBOT_TOKEN не настроен — уведомление пропущено.")
        return False

    if not chat_id:
        print("⚠️ chat_id отсутствует — уведомление пропущено.")
        return False

    url = f"https://api.telegram.org/bot{USERBOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            return True
        print(f"❌ Ошибка отправки в TG: {response.text}")
        return False
    except requests.exceptions.RequestException as e:
        # Не логируем e напрямую — requests может включить URL (с токеном) в строку ошибки
        print(f"❌ Ошибка сети при отправке в TG: {type(e).__name__}")
        return False


def get_telegram_updates(offset: int = None):
    """
    Poll for updates from the admin bot (TG_BOT_TOKEN) — legacy command handling in main.py.
    Userbot uses aiogram polling separately, not this function.
    """
    if not TG_BOT_TOKEN:
        return []

    url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/getUpdates"
    params = {"limit": 10, "timeout": 5}
    if offset is not None:
        params["offset"] = offset

    try:
        response = requests.get(url, params=params, timeout=10)
        if response.status_code == 200:
            return response.json().get("result", [])
        return []
    except Exception as e:
        print(f"⚠️ Ошибка получения обновлений TG: {type(e).__name__}")
        return []
