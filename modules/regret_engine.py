"""
modules/regret_engine.py — Shadow-Filter Regret Arbitrage analyzer.

Reads counterfactual decisions from shadow_filter_log.jsonl and joins them with
actual trade outcomes in user_trades. Computes regret per (filter, decision)
combination:

    regret = avg_pnl(would_have_blocked) - avg_pnl(passed)

When regret is positive over a rolling window, the filter is TOO CONSERVATIVE —
the signals it rejected would have been profitable. Engine outputs recommendations
to relax or invert the filter. NO trade execution; recommendations only.

Council 2026-05-22 — novel meta-layer per user request "build something nobody does".
Pre-commit kill rules in memory/project_regret_engine.md.

Public API:
    from modules.regret_engine import compute_regret, summarize, recommend
    r = compute_regret(window_days=14)
    for rec in recommend(r):
        print(rec)

Read-only. Does not touch dispatcher, bots, or bot_filters.json.
"""
from __future__ import annotations

import json
import sqlite3
import time
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

SHADOW_LOG    = Path("/opt/botgrid/shadow_filter_log.jsonl")
DB_PATH       = "/opt/botgrid/saas_database.sqlite"
STATE_FILE    = Path("/opt/botgrid/regret_state.json")

# Significance thresholds — recommendations only fire when crossed.
MIN_SAMPLES_PER_BUCKET = 8     # n>=8 per side to be meaningful
SIG_REGRET_R           = 0.50  # regret_R >= 0.5R = relax recommendation
HARD_REGRET_R          = 1.20  # regret_R >= 1.2R = strong recommendation


def _load_decisions(window_days: int) -> list[dict]:
    """Read shadow decisions in last N days (UTC). Returns parsed jsonl rows."""
    if not SHADOW_LOG.exists():
        return []
    cutoff_ts = time.time() - window_days * 86400
    out = []
    with open(SHADOW_LOG) as f:
        for line in f:
            try:
                r = json.loads(line)
            except Exception:
                continue
            if r.get("ts", 0) >= cutoff_ts:
                out.append(r)
    return out


def _load_outcomes_by_signal_id(min_ts: float) -> dict[str, dict]:
    """For every signal_id with a closed trade, return aggregated outcome.

    Returns: {signal_id: {n: int, pnl: float, wins: int, avg_pnl: float}}
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute("""
        SELECT signal_id, pnl_usdt
        FROM user_trades
        WHERE status='closed' AND signal_id IS NOT NULL
          AND pnl_usdt IS NOT NULL
          AND strftime('%s', closed_at) >= ?
    """, (str(int(min_ts - 7 * 86400)),))  # extra 7d buffer for late closes
    groups: dict[str, list[float]] = defaultdict(list)
    for r in cur.fetchall():
        groups[r["signal_id"]].append(float(r["pnl_usdt"]))
    conn.close()
    out: dict[str, dict] = {}
    for sid, pnls in groups.items():
        n = len(pnls)
        total = sum(pnls)
        wins = sum(1 for p in pnls if p > 0)
        out[sid] = {
            "n":       n,
            "pnl":     total,
            "wins":    wins,
            "avg_pnl": total / n if n else 0.0,
        }
    return out


def _avg_loss_for_normalization(outcomes: dict[str, dict]) -> float:
    """Avg loss magnitude across all trades — used to express regret in R-units."""
    losses = []
    for v in outcomes.values():
        if v["avg_pnl"] < 0:
            losses.append(-v["avg_pnl"])
    if not losses:
        return 1.0
    return sum(losses) / len(losses)


def compute_regret(window_days: int = 14) -> dict:
    """Core analysis: per filter, compare PnL of 'would_block' vs 'pass' decisions.

    Returns a dict keyed by filter name with stats per decision bucket and an
    aggregate 'regret' delta.
    """
    cutoff_ts = time.time() - window_days * 86400
    decisions = _load_decisions(window_days)
    if not decisions:
        return {"window_days": window_days, "n_decisions": 0, "filters": {}}

    outcomes = _load_outcomes_by_signal_id(cutoff_ts)
    R = _avg_loss_for_normalization(outcomes) or 1.0

    # Group decisions: filter -> decision -> list of pnls
    grp: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    for d in decisions:
        f = d.get("filter")
        if f not in ("score_threshold", "tod_asia_blackout"):
            continue
        sid = d.get("signal_id")
        if not sid:
            continue
        outcome = outcomes.get(sid)
        if not outcome:
            continue
        bucket = d.get("decision")  # 'would_block' or 'pass'
        if bucket not in ("would_block", "pass"):
            continue
        grp[f][bucket].append(outcome["avg_pnl"])

    filters_out: dict[str, dict] = {}
    for fname, buckets in grp.items():
        blk_pnls = buckets.get("would_block", [])
        pass_pnls = buckets.get("pass", [])
        n_blk = len(blk_pnls)
        n_pass = len(pass_pnls)
        avg_blk = sum(blk_pnls) / n_blk if n_blk else 0.0
        avg_pass = sum(pass_pnls) / n_pass if n_pass else 0.0
        wr_blk = (100.0 * sum(1 for p in blk_pnls if p > 0) / n_blk) if n_blk else 0.0
        wr_pass = (100.0 * sum(1 for p in pass_pnls if p > 0) / n_pass) if n_pass else 0.0

        regret_usd = avg_blk - avg_pass        # would_block beats pass → positive
        regret_R   = regret_usd / R if R else 0.0

        filters_out[fname] = {
            "n_blocked":   n_blk,
            "n_passed":    n_pass,
            "avg_pnl_blocked": round(avg_blk, 3),
            "avg_pnl_passed":  round(avg_pass, 3),
            "wr_blocked":  round(wr_blk, 1),
            "wr_passed":   round(wr_pass, 1),
            "regret_usd":  round(regret_usd, 3),
            "regret_R":    round(regret_R, 3),
            "R_unit":      round(R, 3),
        }

    return {
        "window_days":  window_days,
        "n_decisions":  len(decisions),
        "n_outcomes":   len(outcomes),
        "computed_at":  datetime.now(timezone.utc).isoformat(),
        "filters":      filters_out,
    }


def recommend(regret_data: dict) -> list[dict]:
    """Generate human-readable recommendations from regret data.

    Each rec: {filter, action, severity, reasoning, suggested_change}
    """
    recs: list[dict] = []
    for fname, f in regret_data.get("filters", {}).items():
        n_blk = f["n_blocked"]
        n_pass = f["n_passed"]
        r_R = f["regret_R"]
        if n_blk < MIN_SAMPLES_PER_BUCKET or n_pass < MIN_SAMPLES_PER_BUCKET:
            recs.append({
                "filter":    fname,
                "action":    "wait",
                "severity":  "info",
                "reasoning": f"Insufficient samples (n_blocked={n_blk}, n_passed={n_pass}, need {MIN_SAMPLES_PER_BUCKET}+)",
                "suggested_change": None,
            })
            continue
        if r_R >= HARD_REGRET_R:
            recs.append({
                "filter":    fname,
                "action":    "relax",
                "severity":  "strong",
                "reasoning": f"Blocked signals avg PnL {f['avg_pnl_blocked']:+.2f} vs passed {f['avg_pnl_passed']:+.2f} → regret {r_R:+.2f}R (>{HARD_REGRET_R}R hard threshold). Filter overly conservative.",
                "suggested_change": f"Lower threshold (e.g., for score_threshold: -1.0; for tod_asia_blackout: shorter window)",
            })
        elif r_R >= SIG_REGRET_R:
            recs.append({
                "filter":    fname,
                "action":    "relax_partial",
                "severity":  "soft",
                "reasoning": f"Blocked +{r_R:.2f}R better than passed; filter slightly conservative.",
                "suggested_change": "Consider partial relax (50% threshold reduction)",
            })
        elif r_R <= -HARD_REGRET_R:
            recs.append({
                "filter":    fname,
                "action":    "tighten",
                "severity":  "strong",
                "reasoning": f"Blocked signals were rightly blocked: avg PnL {f['avg_pnl_blocked']:+.2f} vs passed {f['avg_pnl_passed']:+.2f} → regret {r_R:+.2f}R. Filter could be MORE restrictive.",
                "suggested_change": "Raise threshold to filter even more",
            })
        else:
            recs.append({
                "filter":    fname,
                "action":    "hold",
                "severity":  "info",
                "reasoning": f"Regret {r_R:+.2f}R within noise band ±{SIG_REGRET_R}R; filter calibration OK.",
                "suggested_change": None,
            })
    return recs


def save_state(regret_data: dict, recs: list[dict]) -> None:
    """Append computed state to history JSON."""
    state = {"history": []}
    if STATE_FILE.exists():
        try:
            state = json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    state["history"].append({
        "ts":           time.time(),
        "computed_at":  regret_data.get("computed_at"),
        "window_days":  regret_data.get("window_days"),
        "n_decisions":  regret_data.get("n_decisions"),
        "filters":      regret_data.get("filters"),
        "recommendations": recs,
    })
    # Keep only last 90 entries
    state["history"] = state["history"][-90:]
    tmp = STATE_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, indent=2))
    tmp.replace(STATE_FILE)


def summarize(regret_data: dict, recs: list[dict]) -> str:
    """Plain-text summary for TG / console."""
    lines = [
        f"📊 <b>Regret Engine — {regret_data.get('window_days')}d</b>",
        f"<i>{regret_data.get('n_decisions', 0)} decisions, "
        f"{regret_data.get('n_outcomes', 0)} closed trades joined</i>",
        "",
    ]
    if not regret_data.get("filters"):
        lines.append("(no joined outcomes yet — need more closed trades)")
        return "\n".join(lines)

    for rec in recs:
        f = rec["filter"]
        sev_emoji = {"strong": "🟥", "soft": "🟡", "info": "·"}.get(rec["severity"], "·")
        lines.append(f"{sev_emoji} <b>{f}</b> → {rec['action'].upper()}")
        lines.append(f"  {rec['reasoning']}")
        if rec.get("suggested_change"):
            lines.append(f"  💡 {rec['suggested_change']}")
        lines.append("")
    return "\n".join(lines)
