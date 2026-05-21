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

_SOURCE_LABELS = {
    "news":        "Signal",
    "fr":          "Funding Rate",
    "grid":        "Grid",
    "liq_cascade": "Cascade",
    "listing":     "CEX Sniper",
    "altcoin":     "Altcoin",
}


def send_telegram_message(text, chat_id):
    """Send a message via @KADO_c_BOT to any chat_id."""
    if not USERBOT_TOKEN:
        print(" USERBOT_TOKEN не настроен — уведомление пропущено.")
        return False

    if not chat_id:
        print(" chat_id отсутствует — уведомление пропущено.")
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
        print(f" Ошибка отправки в TG: {response.text}")
        return False
    except requests.exceptions.RequestException as e:
        # Не логируем e напрямую — requests может включить URL (с токеном) в строку ошибки
        print(f" Ошибка сети при отправке в TG: {type(e).__name__}")
        return False


def send_telegram_photo_or_text(chat_id, caption: str, photo_url: str | None = None) -> bool:
    """Send photo with caption to a channel. Falls back to plain text if photo fails."""
    if not chat_id:
        return False
    if photo_url and USERBOT_TOKEN:
        url = f"https://api.telegram.org/bot{USERBOT_TOKEN}/sendPhoto"
        cap = caption[:1020] + "…" if len(caption) > 1024 else caption
        try:
            r = requests.post(url, json={
                "chat_id": chat_id, "photo": photo_url,
                "caption": cap, "parse_mode": "HTML",
            }, timeout=10)
            if r.status_code == 200:
                return True
        except Exception:
            pass
    return send_telegram_message(caption, chat_id)


def notify_user_trade(user_id: int, event: str, trade_data: dict) -> None:
    """
    Send a personal trade notification to the user's Telegram chat.

    event: "open" | "close"
    trade_data keys (open):  symbol, side, leverage, entry_price, source
    trade_data keys (close): symbol, side, pnl_usdt, exit_price, opened_at
    """
    try:
        from database import SessionLocal, User
        db = SessionLocal()
        try:
            user = db.query(User).filter(User.id == user_id).first()
            chat_id = user.tg_chat_id if user else None
        finally:
            db.close()

        if not chat_id:
            return

        symbol      = trade_data.get("symbol", "")
        coin        = symbol.split("/")[0].replace("USDT", "") or symbol
        side        = trade_data.get("side", "")
        side_emoji  = "🟢" if side == "LONG" else ""

        if event == "open":
            lev    = trade_data.get("leverage", "")
            price  = trade_data.get("entry_price", 0)
            source = trade_data.get("source", "")
            label  = _SOURCE_LABELS.get(source, source.capitalize())
            text = (
                f"{side_emoji} <b>{coin} {side} x{lev}</b> відкрито\n"
                f"@ {price} | {label}"
            )

        elif event == "close":
            pnl      = trade_data.get("pnl_usdt", 0) or 0
            exit_p   = trade_data.get("exit_price", 0)
            opened   = trade_data.get("opened_at")
            duration = ""
            if opened:
                from datetime import datetime, timezone
                now = datetime.now(timezone.utc)
                if not opened.tzinfo:
                    opened = opened.replace(tzinfo=timezone.utc)
                secs = int((now - opened).total_seconds())
                if secs >= 3600:
                    duration = f" | {secs // 3600}г {(secs % 3600) // 60}хв"
                else:
                    duration = f" | {secs // 60}хв"
            pnl_emoji = "" if pnl >= 0 else ""
            text = (
                f"{pnl_emoji} <b>{coin} {side}</b> закрито\n"
                f"PnL: <b>{pnl:+.2f} USDT</b>{duration}"
            )

        else:
            return

        send_telegram_message(text, chat_id)

    except Exception as e:
        print(f"[NOTIFIER] notify_user_trade error: {type(e).__name__}: {e}")


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
        print(f" Ошибка получения обновлений TG: {type(e).__name__}")
        return []
