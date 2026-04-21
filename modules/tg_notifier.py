import requests
from config.settings import TG_BOT_TOKEN

def send_telegram_message(text, chat_id):
    """
    Отправляет текстовое сообщение в указанный Telegram чат через Bot API.
    """
    if not TG_BOT_TOKEN or "7XXXXXX" in TG_BOT_TOKEN:
        print("⚠️ Токен Telegram не настроен.")
        return False
        
    if not chat_id:
        print("⚠️ У юзера не настроен Chat ID. Уведомление пропущено.")
        return False
        
    url = f"https://api.telegram.org/bot{TG_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 200:
            print("📨 Уведомление успешно отправлено в Telegram.")
            return True
        else:
            print(f"❌ Ошибка отправки в TG: {response.text}")
            return False
            
    except requests.exceptions.RequestException as e:
        # Не логируем e напрямую — requests может включить URL (с токеном) в строку ошибки
        print(f"❌ Ошибка сети при отправке в TG: {type(e).__name__}")
        return False


def get_telegram_updates(offset: int = None):
    """
    Получает последние сообщения от пользователя для обработки команд.
    offset — ID последнего обработанного update + 1 (Telegram удалит старые).
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
