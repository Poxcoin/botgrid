#!/usr/bin/env python3
"""
marketing_poster.py — professional Telegram posting for @kadoclub07

Usage:
  python3 marketing_poster.py news      — post top 3 market news with images
  python3 marketing_poster.py briefing  — morning market briefing
  python3 marketing_poster.py stats     — bot performance update
  python3 marketing_poster.py update    — product/feature announcement (manual)

Timers (systemd):
  08:00 UTC → briefing
  12:00 UTC → news
  17:00 UTC → news
  21:00 UTC → stats (Mon only, others → news)
"""
import json, os, sys, sqlite3, re, textwrap, urllib.request, urllib.parse, urllib.error
from datetime import date, datetime, timezone, timedelta
from pathlib import Path

BOT_TOKEN  = os.getenv("USERBOT_TOKEN", "8661446608:AAFPOjnZ132Iq8qvhiQpA7bLwyEaFO5LSSM")
CHANNEL_ID = -1003883169889  # @kadoclub07
NEWS_DB    = Path(__file__).parent / "news.db"
SAAS_DB    = Path(__file__).parent / "saas_database.sqlite"
STATE_FILE = Path(__file__).parent / "marketing_state.json"

# Keywords that mark a news item as market-relevant
IMPORTANT_KEYWORDS = [
    "bitcoin", "btc", "ethereum", "eth", "crypto", "bybit", "binance",
    "sec", "fed", "federal reserve", "ecb", "rate", "inflation", "regulation",
    "etf", "institutional", "whale", "defi", "altcoin", "market", "rally",
    "crash", "bull", "bear", "liquidat", "стейкінг", "listing", "ipo",
    "solana", "sol", "bnb", "xrp", "ondo", "arb", "arbitrum", "jup",
    "trump", "tariff", "санкц", "нафт", "oil", "gold", "dollar", "usd",
]

SKIP_KEYWORDS = [
    "casino", "gambling", "forex broker", "forex trading platform",
]


def _tg_api(method: str, **kwargs) -> dict:
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/{method}"
    data = json.dumps(kwargs).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"ok": False, "description": e.read().decode()}


def send_text(text: str) -> dict:
    return _tg_api("sendMessage",
                   chat_id=CHANNEL_ID,
                   text=text,
                   parse_mode="HTML",
                   disable_web_page_preview=True)


def send_photo(image_url: str, caption: str) -> dict:
    result = _tg_api("sendPhoto",
                     chat_id=CHANNEL_ID,
                     photo=image_url,
                     caption=caption,
                     parse_mode="HTML")
    if not result.get("ok"):
        # fallback to text if image fails
        return send_text(caption)
    return result


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"posted_links": [], "last_stats_date": ""}


def save_state(s: dict):
    s["posted_links"] = s["posted_links"][-300:]
    STATE_FILE.write_text(json.dumps(s, indent=2))


def is_relevant(title: str, description: str = "") -> bool:
    text = (title + " " + description).lower()
    if any(k in text for k in SKIP_KEYWORDS):
        return False
    return any(k in text for k in IMPORTANT_KEYWORDS)


def get_top_news(limit: int = 3) -> list[dict]:
    if not NEWS_DB.exists():
        return []
    state = load_state()
    posted = set(state.get("posted_links", []))
    since = (datetime.now(timezone.utc) - timedelta(hours=12)).isoformat()
    try:
        con = sqlite3.connect(str(NEWS_DB))
        con.row_factory = sqlite3.Row
        # image_url added via migration — may not exist in older DBs
        try:
            con.execute("SELECT image_url FROM news LIMIT 1")
            img_col = "image_url"
        except sqlite3.OperationalError:
            img_col = "NULL as image_url"
        rows = con.execute(f"""
            SELECT title, description, link, source, {img_col}, published_at
            FROM news
            WHERE published_at >= ?
            ORDER BY published_at DESC
            LIMIT 200
        """, (since,)).fetchall()
        con.close()
        news = []
        for r in rows:
            d = dict(r)
            if d["link"] in posted:
                continue
            if is_relevant(d.get("title", ""), d.get("description", "")):
                news.append(d)
            if len(news) >= limit:
                break
        return news
    except Exception as e:
        print(f"[news] DB error: {e}", file=sys.stderr)
        return []


def get_bot_stats(days: int = 7) -> dict:
    stats = {"signal": {}, "grid": {}, "altcoin": {}, "total_pnl": 0, "total_trades": 0, "total_wr": 0}
    if not SAAS_DB.exists():
        return stats
    try:
        con = sqlite3.connect(str(SAAS_DB))
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        rows = con.execute("""
            SELECT bot_type,
                   COUNT(*) as trades,
                   SUM(CASE WHEN pnl_usdt > 0 THEN 1 ELSE 0 END) as wins,
                   ROUND(SUM(pnl_usdt), 2) as pnl
            FROM user_trades
            WHERE status='closed' AND closed_at >= ?
            GROUP BY bot_type
        """, (since,)).fetchall()
        con.close()
        total_t, total_w, total_p = 0, 0, 0.0
        for r in rows:
            bt, t, w, p = r
            wr = round(w / t * 100) if t else 0
            stats[bt.lower()] = {"trades": t, "wins": w, "wr": wr, "pnl": p or 0}
            total_t += t; total_w += w; total_p += (p or 0)
        stats["total_trades"] = total_t
        stats["total_pnl"]   = round(total_p, 2)
        stats["total_wr"]    = round(total_w / total_t * 100) if total_t else 71
    except Exception:
        pass
    return stats


def _is_real_url(link: str) -> bool:
    """True only for real http(s) URLs. Pseudo-URLs (cg://, sw://, etc.) NOT clickable in TG."""
    return bool(link) and link.startswith(('http://', 'https://'))


def _esc(s) -> str:
    """HTML-escape dynamic content for TG parse_mode='HTML'."""
    import html as _html
    return _html.escape(str(s) if s is not None else '')


_TG_FOOTER = (
    "\n\n─────────────────\n"
    "🤖 <a href=\"https://kadoclub.net\">KADO</a> · "
    "<a href=\"https://t.me/KADO_c_BOT\">Try the bot →</a>"
)
_BRAND_IMAGE_URL = "https://kadoclub.net/og-image.png"  # fallback if news has no image


def format_news_post(item: dict) -> str:
    title  = item.get("title", "").strip()
    link   = item.get("link", "").strip()
    desc   = (item.get("description") or "").strip()

    # Trim description to 2 sentences max
    sentences = re.split(r'(?<=[.!?])\s+', desc)
    short_desc = " ".join(sentences[:2])
    if len(short_desc) > 280:
        short_desc = short_desc[:277] + "…"

    # Headline: clickable if real article URL, plain text otherwise
    if _is_real_url(link):
        text = f"<b><a href=\"{_esc(link)}\">{_esc(title)}</a></b>"
    else:
        text = f"<b>{_esc(title)}</b>"
    if short_desc:
        text += f"\n\n{_esc(short_desc)}"
    text += _TG_FOOTER
    return text


def post_news():
    """Post top 3 relevant news items with images."""
    items = get_top_news(limit=3)
    if not items:
        print("[news] No relevant new items found.")
        return

    state = load_state()
    posted = 0
    for item in items:
        caption = format_news_post(item)
        img = (item.get("image_url") or "").strip()
        if not (img and img.startswith("http")):
            img = _BRAND_IMAGE_URL  # fallback to KADO brand image
        result = send_photo(img, caption)
        if not result.get("ok"):
            result = send_text(caption)  # final fallback if even brand image fails

        if result.get("ok"):
            state["posted_links"].append(item["link"])
            posted += 1
            print(f"[news] Posted: {item['title'][:70]}")
        else:
            print(f"[news] FAILED: {result.get('description')}", file=sys.stderr)

    save_state(state)
    print(f"[news] Done: {posted}/{len(items)} posted.")


def post_briefing():
    """Morning market briefing — headline format."""
    items = get_top_news(limit=5)
    state = load_state()
    now_kyiv = datetime.now(timezone.utc) + timedelta(hours=3)

    header = (
        f" <b>Ранковий огляд ринку</b>\n"
        f"{now_kyiv.strftime('%d %B %Y · %H:%M')} (Kyiv)\n\n"
    )

    if not items:
        body = "Ринок відносно спокійний. Значних новин за останні 12 годин не зафіксовано."
        result = send_text(header + body + _TG_FOOTER)
        return

    lines = []
    for i, item in enumerate(items, 1):
        t = _esc(item["title"].strip())
        link = item.get("link", "")
        if _is_real_url(link):
            lines.append(f"{i}. <a href=\"{_esc(link)}\">{t}</a>")
        else:
            lines.append(f"{i}. {t}")
        if link:
            state.setdefault("posted_links", []).append(link)

    body = "\n".join(lines)
    footer = "\n\n─────────────────\n🤖 <a href=\"https://kadoclub.net\">KADO</a> — AI trading bots · <a href=\"https://t.me/KADO_c_BOT\">Try the bot →</a>"
    full = header + body + footer

    # Use image from first item if available, else brand fallback
    img = (items[0].get("image_url") or "").strip() if items else ""
    if not (img and img.startswith("http")):
        img = _BRAND_IMAGE_URL
    result = send_photo(img, full)
    if not result.get("ok"):
        result = send_text(full)

    save_state(state)
    if result.get("ok"):
        print(f"[briefing] Morning briefing posted with {len(items)} items.")
    else:
        print(f"[briefing] FAILED: {result.get('description')}", file=sys.stderr)


def post_stats():
    """Weekly bot performance stats — professional report."""
    s = get_bot_stats(days=7)
    now_kyiv = datetime.now(timezone.utc) + timedelta(hours=3)
    week = now_kyiv.strftime("Тиждень %V · %Y")

    sig = s.get("signal", {})
    grd = s.get("grid", {})
    alt = s.get("altcoin", {})

    def fmt_bot(name: str, data: dict) -> str:
        if not data or not data.get("trades"):
            return f"  • {name}: дані відсутні"
        return (
            f"  • {name}: {data['trades']} угод · "
            f"WR {data['wr']}% · "
            f"PnL {'+'if data['pnl']>=0 else ''}{data['pnl']:.2f} USDT"
        )

    if s["total_trades"] == 0:
        # No trades yet — post benchmark
        text = (
            f" <b>Звіт платформи KADO</b>\n"
            f"<i>{week}</i>\n\n"
            f"Платформа активна. Боти в режимі очікування сигналів.\n\n"
            f"<b>Поточні налаштування:</b>\n"
            f"  • Signal Bot: поріг score ≥ 13.0, WLD/ARB/JUP boost ×1.5\n"
            f"  • Grid Bot: BTC/ETH/SOL, 5–8 рівнів, плечо ×2\n"
            f"  • Altcoin Bot: топ-15 монет по об'єму\n\n"
            f"<b>Модель оплати:</b> 20% тільки від прибутку.\n"
            f"Немає прибутку — немає комісії."
            f"{_TG_FOOTER}"
        )
    else:
        text = (
            f" <b>Звіт платформи KADO</b>\n"
            f"<i>{week}</i>\n\n"
            f"<b>Результати за 7 днів:</b>\n"
            f"{fmt_bot('Signal Bot', sig)}\n"
            f"{fmt_bot('Grid Bot', grd)}\n"
            f"{fmt_bot('Altcoin Bot', alt)}\n\n"
            f"<b>Загалом:</b> {s['total_trades']} угод · "
            f"WR {s['total_wr']}% · "
            f"PnL {'+'if s['total_pnl']>=0 else ''}{s['total_pnl']:.2f} USDT\n\n"
            f"<b>Комісія:</b> 20% від прибутку · 0% якщо в мінусі"
            f"{_TG_FOOTER}"
        )

    result = send_text(text)
    if result.get("ok"):
        print(f"[stats] Performance report posted.")
    else:
        print(f"[stats] FAILED: {result.get('description')}", file=sys.stderr)


def post_update(title: str, body: str):
    """Manual product/feature announcement."""
    now_kyiv = datetime.now(timezone.utc) + timedelta(hours=3)
    text = (
        f" <b>{_esc(title)}</b>\n"
        f"<i>{now_kyiv.strftime('%d.%m.%Y')}</i>\n\n"
        f"{body}"
        f"{_TG_FOOTER}"
    )
    result = send_text(text)
    if result.get("ok"):
        print(f"[update] Announcement posted.")
    else:
        print(f"[update] FAILED: {result.get('description')}", file=sys.stderr)


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "news"

    if cmd == "news":
        post_news()
    elif cmd == "briefing":
        post_briefing()
    elif cmd == "stats":
        post_stats()
    elif cmd == "update":
        title = sys.argv[2] if len(sys.argv) > 2 else "Оновлення платформи"
        body  = sys.argv[3] if len(sys.argv) > 3 else ""
        post_update(title, body)
    else:
        print(f"Unknown command: {cmd}. Use: news | briefing | stats | update")
        sys.exit(1)
