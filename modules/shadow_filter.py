"""
modules/shadow_filter.py — log "would-have-filtered" decisions WITHOUT enforcement.

Council 2026-05-22: A (score threshold raise) + D (time-of-day filter) need 14d data
before enforcement to avoid overfitting on small n.

Records each filter decision into shadow_filter_log.jsonl. Daily report aggregates:
  - n filtered vs n unfiltered
  - hypothetical PnL of filtered subset (set later by sync hook)
  - WR / PF comparison

Format per line:
  {"ts": 1234567890, "source": "news", "signal_id": "abc", "filter": "score_threshold",
   "decision": "would_block" | "pass", "context": {"score": 6.5, "threshold": 7.0}}
"""
from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

_LOG_FILE = Path("/opt/botgrid/shadow_filter_log.jsonl")

# Score thresholds (shadow) — what we'd enforce if we trusted small-n data
_SCORE_THRESHOLDS = {
    "news":      7.0,   # current min 6.0
    "dex":       7.0,
    "sweep":     6.5,
    "orderblock": 6.5,
}

# Time-of-day blackout (shadow) — Asia low-liquidity 03-07 UTC
_TOD_BLOCK_HOURS = {3, 4, 5, 6}
_TOD_APPLIES_TO  = {"sweep", "orderblock"}


def _append(entry: dict) -> None:
    try:
        with open(_LOG_FILE, "a") as f:
            f.write(json.dumps(entry) + "\n")
    except Exception:
        pass


def shadow_score_check(source: str, score: Optional[float], signal_id: str) -> dict:
    """Returns {would_block, threshold, score}. Always non-enforcing."""
    threshold = _SCORE_THRESHOLDS.get(source)
    if threshold is None or score is None:
        return {"would_block": False, "threshold": threshold, "score": score}
    would_block = abs(score) < threshold
    _append({
        "ts":        time.time(),
        "source":    source,
        "signal_id": signal_id,
        "filter":    "score_threshold",
        "decision":  "would_block" if would_block else "pass",
        "context":   {"score": score, "threshold": threshold},
    })
    return {"would_block": would_block, "threshold": threshold, "score": score}


def shadow_tod_check(source: str, signal_id: str) -> dict:
    """Returns {would_block, hour_utc}. Non-enforcing."""
    if source not in _TOD_APPLIES_TO:
        return {"would_block": False, "hour_utc": None}
    hour = datetime.now(timezone.utc).hour
    would_block = hour in _TOD_BLOCK_HOURS
    _append({
        "ts":        time.time(),
        "source":    source,
        "signal_id": signal_id,
        "filter":    "tod_asia_blackout",
        "decision":  "would_block" if would_block else "pass",
        "context":   {"hour_utc": hour, "block_hours": sorted(_TOD_BLOCK_HOURS)},
    })
    return {"would_block": would_block, "hour_utc": hour}


def record_outcome(signal_id: str, pnl: float) -> None:
    """Hook: when a trade closes, record actual PnL against its shadow filter decision.

    This is what lets us later compute 'WR of would-have-been-blocked subset'.
    Append-only ledger; aggregator script reads + correlates by signal_id.
    """
    _append({
        "ts":        time.time(),
        "signal_id": signal_id,
        "filter":    "outcome",
        "pnl":       pnl,
    })
