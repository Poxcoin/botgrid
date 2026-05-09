import asyncio
import threading
import queue
import re
from datetime import datetime, timezone
from telethon import TelegramClient, events
from telethon.sessions import StringSession
from config.settings import TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION
from modules.news_parser import is_altcoin_news, check_panic_news

# Очередь куда кладём новости — main.py читает из неё в основном цикле
tg_news_queue: queue.Queue = queue.Queue()
# Event: сигналізує main loop що є нові повідомлення — прокинутись негайно
tg_news_event: threading.Event = threading.Event()

# Каналы для мониторинга (публичные, проверенные)
# Добавляй/убирай по своему усмотрению — только username без @
MONITOR_CHANNELS = [
    # --- Найшвидші (breaking news) ---
    "WatcherGuru",           # Breaking crypto news, репостить топ твіти
    # --- On-chain / Whale ---
    "lookonchain",           # On-chain аналітика, whale рухи — WLD/ARB/JUP profits came from here
    # --- Crypto aggregator ---
    "crypto",                # Великий крипто агрегатор
    # Видалено (підтверджені збитки):
    # "whale_alert_io"       — 0% WR, -$9.18 (4 trades)
    # "cointelegraph"        — 14% WR, -$19.87 (7 trades, старі новини)
    # "wublockchainenglish"  — ZETA -$35.68, total -$54.88
]

_HTML_RE = re.compile(r"<[^>]+>")
_URL_RE  = re.compile(r"https?://\S+")

_EXCHANGES = {"binance", "coinbase", "kraken", "bybit", "okx", "huobi", "kucoin",
              "gemini", "bitfinex", "bitget", "gate", "mexc"}
_STABLECOINS = {"USDT", "USDC", "DAI", "BUSD", "TUSD", "FDUSD", "PYUSD", "USDE", "FRAX"}

# 🚨 500,000,000 XRP transferred from Binance to unknown wallet
_WHALE_RE = re.compile(
    r"[\d,\.]+\s+([A-Z]{2,10})\s+(?:transferred|moved|sent)"
    r".+?\bfrom\s+([a-zA-Z\s]+?)\s+to\s+([a-zA-Z\s]+)",
    re.IGNORECASE,
)


def _parse_whale_alert(text: str) -> dict | None:
    """Повертає {coin, action} якщо повідомлення — whale transfer з/до біржі."""
    m = _WHALE_RE.search(text)
    if not m:
        return None
    coin = m.group(1).upper()
    if coin in _STABLECOINS:
        return None
    src = m.group(2).lower().strip()
    dst = m.group(3).lower().strip()
    src_is_ex = any(ex in src for ex in _EXCHANGES)
    dst_is_ex = any(ex in dst for ex in _EXCHANGES)
    if src_is_ex and not dst_is_ex:
        return {"coin": coin, "action": "LONG"}   # виводять з біржі = тримають
    if dst_is_ex and not src_is_ex:
        return {"coin": coin, "action": "SHORT"}  # несуть на біржу = продають
    return None


def _clean(text: str) -> str:
    text = _HTML_RE.sub("", text)
    text = _URL_RE.sub("", text)
    return " ".join(text.split()).strip()


def _message_to_news_item(message, channel_name: str) -> dict | None:
    raw = message.text or message.message or ""
    if not raw or len(raw) < 15:
        return None

    raw = _clean(raw)
    lines = [l.strip() for l in raw.split("\n") if l.strip()]
    if not lines:
        return None

    title = lines[0][:220]
    description = " ".join(lines[1:])[:300] if len(lines) > 1 else ""

    is_panic = check_panic_news(title)

    # Whale Alert fast-path — @whale_alert_io pattern matching без Claude
    whale = None
    if channel_name == "whale_alert_io":
        whale = _parse_whale_alert(raw)

    if not whale and not is_panic and not is_altcoin_news(title):
        return None

    now = datetime.now(timezone.utc)
    # Используем реальный timestamp Telegram-поста (не момент обработки)
    msg_date = getattr(message, "date", None)
    if msg_date and hasattr(msg_date, "isoformat"):
        published_dt = msg_date.isoformat()
    else:
        published_dt = now.isoformat()
    item = {
        "title": title,
        "description": description,
        "link": f"tg://{channel_name}/{message.id}",
        "published": now.strftime("%a, %d %b %Y %H:%M:%S +0000"),
        "published_dt": published_dt,
        "source": f"Telegram @{channel_name}",
        "source_url": f"https://t.me/{channel_name}",
        "source_weight": 0.92,
        "is_panic": is_panic,
    }
    if whale:
        item["is_whale_alert"] = True
        item["whale_coin"]     = whale["coin"]
        item["whale_action"]   = whale["action"]
    return item


async def _run_client():
    session = StringSession(TELEGRAM_SESSION)
    client = TelegramClient(session, int(TELEGRAM_API_ID), TELEGRAM_API_HASH)

    await client.start()

    # Проверяем доступность каналов и фильтруем недоступные
    active_channels = []
    for ch in MONITOR_CHANNELS:
        try:
            await client.get_entity(ch)
            active_channels.append(ch)
        except Exception as e:
            print(f"[TG] ⚠️ Канал @{ch} недоступен (не подписан?): {type(e).__name__}")

    if not active_channels:
        print("[TG] ❌ Ни один канал недоступен — подпишись на каналы в Telegram")
        return

    print(f"[TG] ✅ Слушаем {len(active_channels)} каналов: {', '.join(active_channels)}")

    @client.on(events.NewMessage(chats=active_channels))
    async def _handler(event):
        try:
            channel = getattr(event.chat, "username", None) or str(event.chat_id)
            item = _message_to_news_item(event.message, channel)
            if item:
                tg_news_queue.put_nowait(item)
                tg_news_event.set()  # будимо main loop негайно
                print(f"[TG] 📨 @{channel}: {item['title'][:70]}")
        except Exception as e:
            print(f"[TG] Ошибка обработки сообщения: {e}")

    await client.run_until_disconnected()


def start_telegram_monitor() -> bool:
    """
    Запускает Telethon userbot в фоновом daemon-потоке.
    Возвращает True если запустился, False если нет ключей.
    """
    if not TELEGRAM_API_ID or not TELEGRAM_API_HASH or not TELEGRAM_SESSION:
        print("[TG] ⚠️  TELEGRAM_API_ID / HASH / SESSION не заданы — мониторинг каналов отключён")
        return False

    def _thread():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(_run_client())
        except Exception as e:
            print(f"[TG] ❌ Поток упал: {e}")

    t = threading.Thread(target=_thread, daemon=True, name="TelegramMonitor")
    t.start()
    return True
