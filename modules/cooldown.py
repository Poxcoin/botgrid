"""
modules/cooldown.py — per-source consecutive-loss cooldown.

Defensive circuit-breaker per Council 2026-05-22:
  After N=3 SL hits of the same source within W=4h window → block source for D=6h.
  Auto-resume after D expires.

State persisted in /opt/botgrid/loss_cooldown_state.json so it survives restarts.

Usage:
    from modules.cooldown import is_in_cooldown, register_sl, check_and_expire

    # At dispatcher entry
    blocked, until = is_in_cooldown('orderflow')
    if blocked:
        return  # skip dispatch

    # When a trade closes with PnL < 0 (bybit_sync hook)
    register_sl('sweep', send_tg=lambda msg: send_telegram_message(msg, TG_CHAT_ID))

    # Periodically (e.g., loss_monitor cron) to emit "resumed" alert
    check_and_expire('sweep', send_tg=...)
"""
from __future__ import annotations

import json
import time
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

_STATE_FILE   = Path("/opt/botgrid/loss_cooldown_state.json")
THRESHOLD_SL  = 3
WINDOW_SEC    = 4 * 3600          # 4h rolling window for counting SLs
DURATION_SEC  = 6 * 3600          # 6h block once triggered (default)
# Per-source overrides for stricter sources (Council 2026-05-25 live news enable: 24h pause)
_DURATION_PER_SOURCE = {"news": 24 * 3600}


def _duration_for(source: str) -> int:
    return _DURATION_PER_SOURCE.get(source, DURATION_SEC)

_lock = threading.Lock()


def _load_state() -> dict:
    if _STATE_FILE.exists():
        try:
            return json.loads(_STATE_FILE.read_text())
        except Exception:
            return {}
    return {}


def _save_state(s: dict) -> None:
    tmp = _STATE_FILE.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(s, indent=2))
    tmp.replace(_STATE_FILE)


def is_in_cooldown(source: str) -> tuple[bool, float]:
    """Returns (is_blocked, cooldown_until_ts)."""
    with _lock:
        s = _load_state()
    src = s.get(source, {})
    until = float(src.get("cooldown_until", 0) or 0)
    if until > time.time():
        return True, until
    return False, 0.0


def register_sl(source: str, send_tg: Optional[Callable[[str], None]] = None) -> bool:
    """Record an SL for `source`. Returns True if cooldown was just triggered.

    `send_tg` (optional): callable that takes a message string. Used for TG alerts.
    """
    with _lock:
        s = _load_state()
        now = time.time()
        src = s.setdefault(source, {"recent_sl_ts": [], "cooldown_until": 0})

        # Already in cooldown — don't accumulate more
        if src.get("cooldown_until", 0) > now:
            _save_state(s)
            return False

        src["recent_sl_ts"].append(now)
        # Prune SLs outside window
        cutoff = now - WINDOW_SEC
        src["recent_sl_ts"] = [ts for ts in src["recent_sl_ts"] if ts >= cutoff]

        triggered = False
        dur = _duration_for(source)
        if len(src["recent_sl_ts"]) >= THRESHOLD_SL:
            src["cooldown_until"] = now + dur
            src["recent_sl_ts"] = []
            src.pop("alerted_expired", None)
            triggered = True
        _save_state(s)

    if triggered and send_tg:
        until_str = datetime.fromtimestamp(
            time.time() + dur, timezone.utc
        ).strftime("%H:%M UTC")
        try:
            send_tg(
                f"🥶 <b>{source.upper()} в cooldown</b>\n"
                f"{THRESHOLD_SL} SL за останні {WINDOW_SEC // 3600}h → блок до {until_str}"
            )
        except Exception:
            pass
    return triggered


def check_and_expire(source: str, send_tg: Optional[Callable[[str], None]] = None) -> bool:
    """Detect expiry transition. Returns True if cooldown just expired (and emits TG)."""
    with _lock:
        s = _load_state()
        src = s.get(source, {})
        until = float(src.get("cooldown_until", 0) or 0)
        just_expired = False
        if until and until <= time.time():
            if not src.get("alerted_expired"):
                src["alerted_expired"] = True
                src["cooldown_until"] = 0
                s[source] = src
                _save_state(s)
                just_expired = True

    if just_expired and send_tg:
        try:
            send_tg(f"✅ <b>{source.upper()}</b> знову активний (cooldown закінчено)")
        except Exception:
            pass
    return just_expired


def status_summary() -> dict:
    """Get current cooldown status for all sources (for monitoring/debugging)."""
    with _lock:
        s = _load_state()
    now = time.time()
    out = {}
    for source, src in s.items():
        until = float(src.get("cooldown_until", 0) or 0)
        recent = src.get("recent_sl_ts", [])
        out[source] = {
            "in_cooldown":      until > now,
            "cooldown_until":   until,
            "remaining_min":    max(0, (until - now) / 60) if until > now else 0,
            "recent_sl_count":  len([t for t in recent if t >= now - WINDOW_SEC]),
        }
    return out
