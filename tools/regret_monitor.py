"""
tools/regret_monitor.py — daily cron at 22:00 UTC.

Runs Shadow-Filter Regret Engine, sends TG report with recommendations.

Per pre-commit kill rules (memory/project_regret_engine.md):
- READ-ONLY: no auto-apply of recommendations
- Manual approval required before any filter change
- Time-boxed kill: 2026-06-22 (4 weeks from build)
"""
import os
import sys
from datetime import datetime, timezone, date

sys.path.insert(0, '/opt/botgrid')
os.chdir('/opt/botgrid')
from dotenv import load_dotenv
load_dotenv('/opt/botgrid/.env')

from modules.regret_engine import compute_regret, recommend, save_state, summarize
from modules.tg_notifier import send_telegram_message
from config.settings import TG_CHAT_ID

KILL_DATE = date(2026, 6, 22)


def main():
    if date.today() > KILL_DATE:
        print(f"[regret_monitor] kill date {KILL_DATE} passed — skipping")
        return

    # Compute on 14d window primary, 7d window secondary for trend
    r14 = compute_regret(window_days=14)
    recs14 = recommend(r14)
    save_state(r14, recs14)

    msg = summarize(r14, recs14)
    print(msg)

    if TG_CHAT_ID and recs14:
        # Only send if at least one non-info recommendation
        has_action = any(rec["action"] not in ("hold", "wait") for rec in recs14)
        if has_action or r14.get("n_decisions", 0) >= 50:
            try:
                from modules.tg_notifier import tg_footer
                send_telegram_message(msg + tg_footer('admin'), TG_CHAT_ID)
            except Exception as e:
                print(f"TG err: {e}")


if __name__ == "__main__":
    main()
