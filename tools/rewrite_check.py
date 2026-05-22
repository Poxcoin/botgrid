"""
rewrite_check.py — 2026-06-21 forcing function.

Council 2026-05-22: if Sweep/OB/Orderflow do NOT achieve WR > 50% on n > 30
post-TP/SL-fix by 2026-06-21, force REWRITE decision (no more tuning band-aids).

Runs daily; on 2026-06-21+ emits TG alert with verdict.
"""
import sys, os, sqlite3
from datetime import datetime, timezone, date

sys.path.insert(0, '/opt/botgrid')
os.chdir('/opt/botgrid')
from dotenv import load_dotenv
load_dotenv('/opt/botgrid/.env')

from modules.tg_notifier import send_telegram_message
from config.settings import TG_CHAT_ID

DEADLINE = date(2026, 6, 21)
TPSL_FIX_DATETIME = "2026-05-19 21:06:00"
TRACKED = ("sweep", "orderblock")
WR_TARGET = 50.0
N_TARGET = 30


def main():
    today = date.today()
    if today < DEADLINE:
        days_left = (DEADLINE - today).days
        print(f"[rewrite_check] {days_left} days until deadline {DEADLINE}")
        return

    conn = sqlite3.connect('/opt/botgrid/saas_database.sqlite')
    cur = conn.cursor()
    verdicts = []
    for source in TRACKED:
        cur.execute("""
            SELECT COUNT(*),
                   SUM(CASE WHEN pnl_usdt > 0 THEN 1 ELSE 0 END),
                   ROUND(SUM(pnl_usdt), 2)
            FROM user_trades
            WHERE source = ? AND status = 'closed' AND pnl_usdt IS NOT NULL
              AND closed_at >= ?
        """, (source, TPSL_FIX_DATETIME))
        n, wins, pnl = cur.fetchone()
        n = n or 0
        wins = wins or 0
        pnl = pnl or 0.0
        wr = (wins * 100.0 / n) if n else 0.0
        if n < N_TARGET:
            verdict = f"INSUFFICIENT DATA (n={n}<{N_TARGET})"
        elif wr < WR_TARGET:
            verdict = f"REWRITE REQUIRED (WR {wr:.1f}% < {WR_TARGET}%)"
        else:
            verdict = f"PASS (WR {wr:.1f}% on n={n})"
        verdicts.append((source, n, wr, pnl, verdict))
    conn.close()

    lines = [
        f"📋 <b>30-day rewrite check ({today})</b>",
        f"<i>Sample: post-TP/SL fix ({TPSL_FIX_DATETIME})</i>",
        "",
    ]
    for source, n, wr, pnl, verdict in verdicts:
        lines.append(f"<b>{source.upper()}</b>: n={n}  WR={wr:.1f}%  PnL=${pnl:+.2f}")
        lines.append(f"  → {verdict}")
        lines.append("")
    lines.append("Action: rewrite any source with REWRITE REQUIRED verdict.")
    msg = "\n".join(lines)
    print(msg)
    if TG_CHAT_ID:
        send_telegram_message(msg, TG_CHAT_ID)


if __name__ == "__main__":
    main()
