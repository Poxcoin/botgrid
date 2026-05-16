"""
Trade analyzer — виводить статистику і відправляє в Telegram.
Запускати вручну або через cron щодня:
  python3 analyzer.py
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from trade_logger import get_stats
from notifier import send_telegram
from config import TG_BOT_TOKEN, TG_CHAT_ID


def fmt_stats(stats: dict, days: int = 30) -> str:
    if stats.get("trades", 0) == 0:
        return f"📊 <b>Macro Bot — останні {days} днів</b>\n\nУгод ще немає."

    wr = stats["win_rate"]
    wr_emoji = "🟢" if wr >= 55 else "🟡" if wr >= 45 else "🔴"
    pnl_emoji = "✅" if stats["net_pnl"] > 0 else "❌"

    lines = [
        f"📊 <b>Macro Bot — останні {days} днів</b>",
        "",
        f"Угод: <b>{stats['trades']}</b>  ({stats['wins']}W / {stats['losses']}L)",
        f"Win Rate: {wr_emoji} <b>{wr}%</b>",
        f"Profit Factor: <b>{stats['profit_factor']}</b>",
        f"{pnl_emoji} Net PnL: <b>${stats['net_pnl']:+.2f}</b>",
        "",
        f"Середній профіт: +${stats['avg_win']:.2f}",
        f"Середній збиток: ${stats['avg_loss']:.2f}",
        f"Краща угода: +${stats['best_trade']:.2f}",
        f"Гірша угода: ${stats['worst_trade']:.2f}",
        f"Сер. пункти: {stats['avg_pips']:+.1f} pips",
    ]

    if stats.get("recent_trades"):
        lines.append("")
        lines.append("📋 <b>Останні угоди:</b>")
        for t in stats["recent_trades"][:5]:
            sign = "📈" if t["direction"] == "LONG" else "📉"
            p = t["profit"]
            emoji = "✅" if p > 0 else "❌"
            lines.append(
                f"{emoji}{sign} {t['event'][:15]} | {p:+.2f}$ ({t['pips']:+.1f}p)"
            )

    return "\n".join(lines)


async def main():
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    stats = get_stats(days)
    text  = fmt_stats(stats, days)
    print(text.replace("<b>", "").replace("</b>", ""))

    if TG_BOT_TOKEN and TG_CHAT_ID:
        await send_telegram(TG_BOT_TOKEN, TG_CHAT_ID, text)
        print("\nВідправлено в Telegram")


if __name__ == "__main__":
    asyncio.run(main())
