#!/usr/bin/env python3
"""
daily_report.py — щоденний P&L звіт по всіх ботах.
Надсилає в Telegram зведення за поточний день та з початку тижня.
Запуск: python daily_report.py
Або через cron: 0 21 * * * cd /opt/botgrid && venv/bin/python daily_report.py
"""
import sqlite3
from datetime import datetime, timezone, timedelta
from collections import defaultdict

from modules.tg_notifier import send_telegram_message
from modules.trader import _init_exchange, get_free_usdt
from config.settings import TG_CHAT_ID

DB_PATH = "saas_database.sqlite"
OWNER_USER_ID = 1

BOT_EMOJIS = {
    "sweep":       "",
    "fr_extreme":  "",
    "orderblock":  "",
    "orderflow":   "",
    "cascade":     "",
    "altcoin":     "",
    "signal":      "",
}


def run_report():
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start  = today_start - timedelta(days=now.weekday())  # Monday

    try:
        ex = _init_exchange()
        balance = get_free_usdt(ex)
    except Exception:
        balance = None

    db = sqlite3.connect(DB_PATH)

    def fetch_pnl(since_dt: datetime) -> list:
        return db.execute("""
            SELECT source, symbol, side, pnl_usdt, status, opened_at
            FROM user_trades
            WHERE user_id = ?
              AND opened_at >= ?
              AND status = 'closed'
            ORDER BY opened_at
        """, (OWNER_USER_ID, since_dt.strftime("%Y-%m-%d %H:%M:%S"))).fetchall()

    day_trades  = fetch_pnl(today_start)
    week_trades = fetch_pnl(week_start)

    def summarize(trades):
        by_bot = defaultdict(lambda: {"wins": 0, "losses": 0, "pnl": 0.0})
        total = 0.0
        for t in trades:
            src = t[0] or "unknown"
            pnl = t[3] or 0.0
            total += pnl
            by_bot[src]["pnl"] += pnl
            if pnl >= 0:
                by_bot[src]["wins"] += 1
            else:
                by_bot[src]["losses"] += 1
        return total, dict(by_bot)

    day_total,  day_by_bot  = summarize(day_trades)
    week_total, week_by_bot = summarize(week_trades)

    # Open positions count
    open_count = db.execute("""
        SELECT COUNT(*) FROM user_trades
        WHERE user_id = ? AND status = 'open'
    """, (OWNER_USER_ID,)).fetchone()[0]

    db.close()

    # Build message
    sign = lambda x: f"+${x:.2f}" if x >= 0 else f"-${abs(x):.2f}"

    lines = [
        f"<b> Щоденний звіт — {now.strftime('%d.%m.%Y %H:%M')} UTC</b>",
        "",
    ]

    if balance is not None:
        lines.append(f" <b>Баланс:</b> <code>${balance:,.2f}</code>")

    lines += [
        f" <b>Відкриті позиції:</b> {open_count}",
        "",
        f"<b>Сьогодні ({len(day_trades)} угод):</b> <code>{sign(day_total)}</code>",
    ]

    for bot, s in sorted(day_by_bot.items(), key=lambda x: -x[1]["pnl"]):
        em = BOT_EMOJIS.get(bot, "")
        wr = s["wins"] / (s["wins"] + s["losses"]) * 100 if (s["wins"] + s["losses"]) > 0 else 0
        lines.append(
            f"  {em} {bot}: <code>{sign(s['pnl'])}</code>  "
            f"{s['wins']}W/{s['losses']}L  WR={wr:.0f}%"
        )

    lines += [
        "",
        f"<b>Цей тиждень ({len(week_trades)} угод):</b> <code>{sign(week_total)}</code>",
    ]

    for bot, s in sorted(week_by_bot.items(), key=lambda x: -x[1]["pnl"]):
        em = BOT_EMOJIS.get(bot, "")
        wr = s["wins"] / (s["wins"] + s["losses"]) * 100 if (s["wins"] + s["losses"]) > 0 else 0
        lines.append(
            f"  {em} {bot}: <code>{sign(s['pnl'])}</code>  "
            f"{s['wins']}W/{s['losses']}L  WR={wr:.0f}%"
        )

    msg = "\n".join(lines)
    print(msg.replace("<b>", "").replace("</b>", "").replace("<code>", "").replace("</code>", ""))
    send_telegram_message(msg, TG_CHAT_ID)
    return msg


if __name__ == "__main__":
    run_report()
