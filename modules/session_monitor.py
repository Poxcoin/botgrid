"""
session_monitor.py — Market session opening analysis.

Three sessions per day:
  Asia   00:00 UTC (03:00 Kyiv) — Nikkei225, Hang Seng, BTC overnight, DXY
  London 08:00 UTC (11:00 Kyiv) — FTSE100, DAX, Gold, EUR/USD
  NY     13:30 UTC (16:30 Kyiv) — S&P500, NASDAQ, VIX, DXY

Posts a brief to TG channel and exports get_session_bias() for signal engine.
Bias affects signal scores: bullish→+0.5 on LONGs, bearish→-1.0 on LONGs.
"""

import threading
import time
import requests
from datetime import datetime, timezone, timedelta

# ─── Session schedule (UTC) ───────────────────────────────────────────────────

SESSIONS = [
    {
        "name":    "asia",
        "label":   "🌏 Азія",
        "utc_h":   0,
        "utc_m":   0,
        "kyiv":    "03:00",
        "symbols": {
            "^N225":    "Nikkei225",
            "^HSI":     "Hang Seng",
            "DX-Y.NYB": "DXY",
        },
        "btc": True,
    },
    {
        "name":    "london",
        "label":   "🇬🇧 Лондон",
        "utc_h":   8,
        "utc_m":   0,
        "kyiv":    "11:00",
        "symbols": {
            "^FTSE":    "FTSE 100",
            "^GDAXI":   "DAX",
            "GC=F":     "Gold",
            "EURUSD=X": "EUR/USD",
        },
        "btc": False,
    },
    {
        "name":    "ny",
        "label":   "🇺🇸 NYSE/NASDAQ",
        "utc_h":   13,
        "utc_m":   30,
        "kyiv":    "16:30",
        "symbols": {
            "^GSPC":    "S&P 500",
            "^IXIC":    "NASDAQ",
            "^VIX":     "VIX",
            "DX-Y.NYB": "DXY",
        },
        "btc": True,
    },
]

# ─── Shared bias state ────────────────────────────────────────────────────────

_bias_lock = threading.Lock()
_session_bias = {
    "value":      "neutral",   # "bullish" | "bearish" | "neutral"
    "score":      0.0,         # raw score: positive = bullish, negative = bearish
    "session":    "",
    "updated_at": 0.0,
}


def get_session_bias() -> dict:
    with _bias_lock:
        return _session_bias.copy()


def _set_bias(value: str, score: float, session: str) -> None:
    with _bias_lock:
        _session_bias.update({
            "value":      value,
            "score":      score,
            "session":    session,
            "updated_at": time.time(),
        })


# ─── Yahoo Finance fetch ──────────────────────────────────────────────────────

_YF_HEADERS = {"User-Agent": "Mozilla/5.0"}


def _fetch_change(symbol: str) -> float | None:
    """Returns % change vs previous close. None on error."""
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        r = requests.get(url, headers=_YF_HEADERS,
                         params={"range": "5d", "interval": "1d"}, timeout=8)
        data = r.json()
        closes = data["chart"]["result"][0]["indicators"]["quote"][0]["close"]
        closes = [c for c in closes if c is not None]
        if len(closes) < 2:
            return None
        prev, last = closes[-2], closes[-1]
        return round((last - prev) / prev * 100, 2)
    except Exception:
        return None


def _fetch_btc_change() -> float | None:
    """BTC 24h change from Bybit public ticker."""
    try:
        r = requests.get(
            "https://api.bybit.com/v5/market/tickers",
            params={"category": "linear", "symbol": "BTCUSDT"},
            timeout=6,
        )
        item = r.json()["result"]["list"][0]
        return round(float(item["price24hPcnt"]) * 100, 2)
    except Exception:
        return None


# ─── Bias calculation ─────────────────────────────────────────────────────────

_EQUITY_SYMBOLS = {"^GSPC", "^IXIC", "^N225", "^HSI", "^FTSE", "^GDAXI"}
_INVERSE_SYMBOLS = {"^VIX", "DX-Y.NYB"}  # up = bad for crypto


def _calc_bias(changes: dict) -> tuple[str, float]:
    """
    Returns (bias_label, raw_score).
    Equity up = +1 each, inverse up = -0.5 each.
    score > +1.0 → bullish, < -1.0 → bearish.
    """
    score = 0.0
    for sym, chg in changes.items():
        if chg is None:
            continue
        if sym in _EQUITY_SYMBOLS:
            score += chg  # +0.8% S&P = +0.8 pts
        elif sym in _INVERSE_SYMBOLS:
            score -= chg * 0.5
    if score > 1.0:
        return "bullish", score
    if score < -1.0:
        return "bearish", score
    return "neutral", score


# ─── TG message builder ───────────────────────────────────────────────────────

_BIAS_EMOJI = {"bullish": "✅", "bearish": "🔴", "neutral": "⚪"}
_BIAS_LABEL = {
    "bullish": "Bullish — ризик-он, сприятливо для лонгів",
    "bearish": "Bearish — ризик-оф, тиск на крипту",
    "neutral": "Нейтрально — змішані сигнали",
}


def _build_message(session: dict, changes: dict, btc_chg: float | None,
                   bias: str, score: float) -> str:
    now_kyiv = datetime.now(timezone.utc) + timedelta(hours=3)
    lines = [
        f"{session['label']} · Відкриття ринку",
        f"{now_kyiv.strftime('%d.%m.%Y')} | {session['kyiv']} Kyiv\n",
    ]

    for sym, label in session["symbols"].items():
        chg = changes.get(sym)
        if chg is None:
            continue
        arrow = "📈" if chg > 0 else ("📉" if chg < 0 else "➡️")
        sign  = "+" if chg > 0 else ""
        # VIX: don't show arrow direction as bullish
        if sym == "^VIX":
            arrow = "📊"
        lines.append(f"{arrow} <b>{label}</b>: {sign}{chg:.2f}%")

    if btc_chg is not None:
        arrow = "📈" if btc_chg > 0 else ("📉" if btc_chg < 0 else "➡️")
        sign  = "+" if btc_chg > 0 else ""
        lines.append(f"{arrow} <b>BTC 24h</b>: {sign}{btc_chg:.2f}%")

    emoji = _BIAS_EMOJI[bias]
    lines.append(f"\n{emoji} <b>{_BIAS_LABEL[bias]}</b>")

    # Crypto implication
    if bias == "bullish":
        lines.append("→ Позитивний фон для альткоїнів")
    elif bias == "bearish":
        lines.append("→ Обережно з новими лонгами")

    lines.append("\n🤖 <b>KADO</b> · kadoclub.net")
    return "\n".join(lines)


# ─── Session runner ───────────────────────────────────────────────────────────

def _run_session(session: dict, send_tg, chat_id: str) -> None:
    print(f"[SESSION] ▶ {session['label']} відкриття")

    changes = {}
    for sym in session["symbols"]:
        changes[sym] = _fetch_change(sym)

    btc_chg = _fetch_btc_change() if session["btc"] else None

    bias, score = _calc_bias(changes)
    _set_bias(bias, score, session["name"])

    msg = _build_message(session, changes, btc_chg, bias, score)
    try:
        send_tg(msg, chat_id)
    except Exception as e:
        print(f"[SESSION] TG error: {e}")

    print(f"[SESSION] {session['name']} bias={bias} score={score:+.2f}")


# ─── Background thread ────────────────────────────────────────────────────────

def _seconds_to_next(h: int, m: int) -> float:
    now = datetime.now(timezone.utc)
    target = now.replace(hour=h, minute=m, second=0, microsecond=0)
    if target <= now:
        target += timedelta(days=1)
    return (target - now).total_seconds()


def _monitor_loop(send_tg, chat_id: str) -> None:
    """Sleeps until next session open, fires, repeats."""
    while True:
        now = datetime.now(timezone.utc)
        now_min = now.hour * 60 + now.minute

        # Find next session (sorted by time)
        upcoming = []
        for s in SESSIONS:
            target_min = s["utc_h"] * 60 + s["utc_m"]
            secs = _seconds_to_next(s["utc_h"], s["utc_m"])
            upcoming.append((secs, s))

        upcoming.sort(key=lambda x: x[0])
        wait_secs, next_session = upcoming[0]

        print(f"[SESSION] Наступна сесія: {next_session['label']} через {wait_secs/3600:.1f}h")
        time.sleep(max(wait_secs - 30, 60))  # wake up 30s early

        # Busy-wait for exact time
        target = datetime.now(timezone.utc).replace(
            hour=next_session["utc_h"],
            minute=next_session["utc_m"],
            second=0, microsecond=0,
        )
        while datetime.now(timezone.utc) < target:
            time.sleep(5)

        try:
            _run_session(next_session, send_tg, chat_id)
        except Exception as e:
            print(f"[SESSION] Error in {next_session['name']}: {e}")

        time.sleep(120)  # cooldown before looking for next session


def start_session_monitor(send_tg, chat_id: str) -> None:
    t = threading.Thread(
        target=_monitor_loop,
        args=(send_tg, chat_id),
        name="session-monitor",
        daemon=True,
    )
    t.start()
    print("[SESSION] Session monitor started (Asia 0:00, London 8:00, NY 13:30 UTC)")
