import aiohttp
import logging
from typing import Optional

log = logging.getLogger("macro.notifier")


async def send_telegram(token: str, chat_id: str, text: str) -> None:
    if not token or not chat_id:
        return
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    try:
        async with aiohttp.ClientSession() as s:
            await s.post(url, json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "HTML",
            })
    except Exception as e:
        log.warning("Telegram send failed: %s", e)


def fmt_signal(event, actual, forecast, direction, units, deviation) -> str:
    sign = "📈" if direction == "LONG" else "📉"
    side = "BUY" if direction == "LONG" else "SELL"
    return (
        f"{sign} <b>MACRO TRADE</b>\n"
        f"Event: <b>{event}</b>\n"
        f"Actual: <b>{actual}</b> | Forecast: {forecast}\n"
        f"Deviation: {deviation:+.2f}σ\n"
        f"→ {side} EUR/USD | {abs(units):.2f} lots"
    )


def fmt_close(event, pnl, reason) -> str:
    emoji = "✅" if pnl > 0 else "❌"
    return (
        f"{emoji} <b>CLOSED</b> — {event}\n"
        f"PnL: <b>{pnl:+.2f} USD</b>\n"
        f"Reason: {reason}"
    )
