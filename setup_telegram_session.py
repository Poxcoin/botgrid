"""
Запускается ОДИН РАЗ локально (не на VPS).
Telegram попросит номер телефона и код подтверждения.
Полученную строку TELEGRAM_SESSION добавь в .env на локалке и на VPS.

Запуск:
    python setup_telegram_session.py
"""
import asyncio
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID   = input("Введи TELEGRAM_API_ID : ").strip()
API_HASH = input("Введи TELEGRAM_API_HASH: ").strip()


async def main():
    async with TelegramClient(StringSession(), int(API_ID), API_HASH) as client:
        session_str = client.session.save()
        print("\n" + "=" * 60)
        print(" Сессия создана! Добавь в .env:")
        print(f"\nTELEGRAM_SESSION={session_str}\n")
        print("=" * 60)
        print("  Никому не передавай эту строку — она даёт доступ к аккаунту!")


asyncio.run(main())
