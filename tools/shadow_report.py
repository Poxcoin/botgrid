"""
tools/shadow_report.py — daily aggregator over shadow_filter_log.jsonl.

For each shadow filter (score_threshold, tod_asia_blackout):
  - Count signals that WOULD have been blocked
  - Calculate hypothetical PnL of would-blocked subset (via signal_id → user_trades match)
  - Calculate hypothetical PnL of would-passed subset
  - Print WR + PF comparison

If filtered subset shows WR ≥ unfiltered + 5pp AND PF > 1.5 → recommend enforce.

Run via cron daily at 23:59 UTC after daily_pnl_report.
"""
import json
import os
import sqlite3
import sys
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from pathlib import Path

sys.path.insert(0, '/opt/botgrid')
os.chdir('/opt/botgrid')
from dotenv import load_dotenv
load_dotenv('/opt/botgrid/.env')

from modules.tg_notifier import send_telegram_message
from config.settings import TG_CHAT_ID

LOG_FILE = Path('/opt/botgrid/shadow_filter_log.jsonl')
DB_PATH  = '/opt/botgrid/saas_database.sqlite'


def _load_decisions(window_days: int = 14) -> list:
    if not LOG_FILE.exists():
        return []
    cutoff = (datetime.now(timezone.utc) - timedelta(days=window_days)).timestamp()
    out = []
    with open(LOG_FILE) as f:
        for line in f:
            try:
                r = json.loads(line)
                if r.get('ts', 0) >= cutoff:
                    out.append(r)
            except Exception:
                continue
    return out


def _pnl_by_signal_id() -> dict:
    """Map signal_id → list of (user_id, pnl) for closed trades."""
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    cur.execute("""
        SELECT signal_id, user_id, pnl_usdt
        FROM user_trades
        WHERE status='closed' AND signal_id IS NOT NULL AND pnl_usdt IS NOT NULL
    """)
    m = defaultdict(list)
    for sig, uid, pnl in cur.fetchall():
        m[sig].append((uid, pnl))
    conn.close()
    return m


def _stats(pnls: list) -> dict:
    if not pnls:
        return {'n': 0, 'wr': 0, 'pf': 0, 'total': 0, 'avg': 0}
    n = len(pnls)
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    total = sum(pnls)
    wr = len(wins) * 100.0 / n if n else 0
    pf = sum(wins) / abs(sum(losses)) if losses else (999 if wins else 0)
    return {'n': n, 'wr': wr, 'pf': pf, 'total': total, 'avg': total / n if n else 0}


def main():
    decisions = _load_decisions(14)
    if not decisions:
        print('No shadow decisions logged yet.')
        return

    pnl_map = _pnl_by_signal_id()

    # Group by (filter, decision)
    by_filter = defaultdict(lambda: {'would_block': [], 'pass': []})
    for d in decisions:
        f = d.get('filter')
        if f not in ('score_threshold', 'tod_asia_blackout'):
            continue
        sid = d.get('signal_id')
        pnls = [p for _uid, p in pnl_map.get(sid, [])]
        if not pnls:
            continue
        by_filter[f][d['decision']].extend(pnls)

    lines = ['📊 <b>Shadow filter — 14d report</b>', '']

    enforce_recs = []
    for fname, buckets in by_filter.items():
        blocked = _stats(buckets['would_block'])
        passed = _stats(buckets['pass'])
        lines.append(f'<b>{fname}</b>')
        lines.append(f'  Would-block: n={blocked["n"]}  WR={blocked["wr"]:.0f}%  PnL=${blocked["total"]:+.2f}  PF={blocked["pf"]:.2f}')
        lines.append(f'  Pass:        n={passed["n"]}  WR={passed["wr"]:.0f}%  PnL=${passed["total"]:+.2f}  PF={passed["pf"]:.2f}')

        # Decision criteria: filtered (passed) subset WR ≥ unfiltered + 5pp AND PF > 1.5
        # Where "unfiltered" = blocked + passed combined
        all_pnls = buckets['would_block'] + buckets['pass']
        unfiltered = _stats(all_pnls)
        delta_wr = passed['wr'] - unfiltered['wr']

        if passed['n'] >= 20:
            if delta_wr >= 5 and passed['pf'] > 1.5:
                rec = f"✅ RECOMMEND ENFORCE ({fname})"
                enforce_recs.append(fname)
            else:
                rec = f"⚠️ keep shadow (Δ WR {delta_wr:+.1f}pp, PF {passed['pf']:.2f})"
        else:
            rec = f"⏳ need n≥20 passed (have {passed['n']})"
        lines.append(f'  → {rec}')
        lines.append('')

    if enforce_recs:
        lines.append(f'<b>Action items:</b> flip these to enforced in bot_filters.json:')
        for n in enforce_recs:
            lines.append(f'  • {n}')

    msg = '\n'.join(lines)
    print(msg)
    if TG_CHAT_ID:
        send_telegram_message(msg, TG_CHAT_ID)


if __name__ == '__main__':
    main()
