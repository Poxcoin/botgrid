"""
session_monitor.py — Market session opening analysis.

Three sessions per day:
  Asia   00:00 UTC (03:00 Kyiv) — Nikkei225, Hang Seng, BTC overnight, DXY
  London 08:00 UTC (11:00 Kyiv) — FTSE100, DAX, Gold, EUR/USD
  NY     13:30 UTC (16:30 Kyiv) — S&P500, NASDAQ, VIX, DXY

Posts a brief to TG channel and exports get_session_bias() for signal engine.
Bias affects signal scores: bullish→+0.5 on LONGs, bearish→-1.0 on LONGs.

Patterns detected:
  - VIX level check (NY): complacency / normal / elevated / high fear
  - Multi-session confluence: triple bearish / triple bullish warning
  - London Kill Zone reversal: Asia bearish + London flat/positive
  - NY Opening Range: S&P gap + VIX direction
  - BTC overnight (Asia): overbought / oversold at open
  - DXY divergence: equity vs USD direction mismatch
"""

import threading
import time
import requests
from datetime import datetime, timezone, timedelta

# ─── Session schedule (UTC) ───────────────────────────────────────────────────

SESSIONS = [
    {
        "name":    "asia",
        "label":   " Азія",
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
        "label":   " Лондон",
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
        "label":   " NYSE/NASDAQ",
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
    "patterns":   [],          # list of detected pattern strings
}

# Per-day session tracking for multi-session confluence
_daily_biases: dict = {"asia": None, "london": None, "ny": None}
_daily_biases_date: str = ""   # YYYY-MM-DD — reset when date changes

# VIX absolute level cached from last NY session
_vix_level: float | None = None
_vix_level_lock = threading.Lock()


def get_session_bias() -> dict:
    with _bias_lock:
        return _session_bias.copy()


def _set_bias(value: str, score: float, session: str, patterns: list[str]) -> None:
    with _bias_lock:
        _session_bias.update({
            "value":      value,
            "score":      score,
            "session":    session,
            "updated_at": time.time(),
            "patterns":   patterns,
        })


def _reset_daily_biases_if_new_day() -> None:
    global _daily_biases_date
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if today != _daily_biases_date:
        _daily_biases["asia"] = None
        _daily_biases["london"] = None
        _daily_biases["ny"] = None
        _daily_biases_date = today


def _record_daily_bias(session_name: str, bias: str) -> None:
    _reset_daily_biases_if_new_day()
    if session_name in _daily_biases:
        _daily_biases[session_name] = bias


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


def _fetch_ohlc(symbol: str) -> dict | None:
    """
    Returns OHLC summary for gap/opening range analysis.
    Keys: prev_close, today_open, today_close, gap_pct, change_pct
    """
    try:
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        r = requests.get(url, headers=_YF_HEADERS,
                         params={"range": "5d", "interval": "1d"}, timeout=8)
        data = r.json()
        result = data["chart"]["result"][0]
        closes = result["indicators"]["quote"][0]["close"]
        opens  = result["indicators"]["quote"][0]["open"]
        closes = [c for c in closes if c is not None]
        opens  = [o for o in opens  if o is not None]
        if len(closes) < 2 or len(opens) < 1:
            return None
        return {
            "prev_close":  closes[-2],
            "today_open":  opens[-1],
            "today_close": closes[-1],
            "gap_pct":     round((opens[-1] - closes[-2]) / closes[-2] * 100, 2),
            "change_pct":  round((closes[-1] - closes[-2]) / closes[-2] * 100, 2),
        }
    except Exception:
        return None


def _fetch_vix_level() -> float | None:
    """Returns absolute VIX close level (not % change)."""
    try:
        url = "https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX"
        r = requests.get(url, headers=_YF_HEADERS,
                         params={"range": "5d", "interval": "1d"}, timeout=8)
        data = r.json()
        closes = data["chart"]["result"][0]["indicators"]["quote"][0]["close"]
        closes = [c for c in closes if c is not None]
        if not closes:
            return None
        return round(closes[-1], 2)
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


def _calc_bias(changes: dict, vix_level: float | None = None) -> tuple[str, float]:
    """
    Returns (bias_label, raw_score).
    Equity up = +1 each, inverse up = -0.5 each.
    VIX level adds a modifier to the score at NY session.
    score > +1.0 → bullish, < -1.0 → bearish.
    """
    score = 0.0
    for sym, chg in changes.items():
        if chg is None:
            continue
        if sym in _EQUITY_SYMBOLS:
            score += chg
        elif sym in _INVERSE_SYMBOLS:
            score -= chg * 0.5

    # VIX level modifier (applied only when vix_level is provided)
    if vix_level is not None:
        if vix_level < 15:
            score += 1.0    # complacency → risk-on boost
        elif vix_level <= 20:
            pass             # normal — no modifier
        elif vix_level <= 25:
            score -= 0.8    # elevated fear → dampen
        else:
            score -= 2.0    # high fear → strong bearish push

    if score > 1.0:
        return "bullish", score
    if score < -1.0:
        return "bearish", score
    return "neutral", score


# ─── Pattern detection ────────────────────────────────────────────────────────

def _detect_patterns_asia(changes: dict, btc_chg: float | None) -> list[str]:
    patterns = []

    # BTC overnight pattern
    if btc_chg is not None:
        if btc_chg > 3.0:
            patterns.append(
                " BTC +{:.1f}% за ніч — перекупленість на відкритті Азії, можлива корекція".format(btc_chg)
            )
        elif btc_chg < -3.0:
            patterns.append(
                " BTC {:.1f}% за ніч — перепроданість, стежити за відскоком у Лондоні".format(btc_chg)
            )

    # DXY divergence with Asian equities
    dxy_chg  = changes.get("DX-Y.NYB")
    nk_chg   = changes.get("^N225")
    hsi_chg  = changes.get("^HSI")
    equity_changes = [c for c in [nk_chg, hsi_chg] if c is not None]
    if equity_changes and dxy_chg is not None:
        avg_equity = sum(equity_changes) / len(equity_changes)
        if avg_equity > 0.3 and dxy_chg > 0.3:
            patterns.append(
                " Незвичний ризик-он: акції та USD ростуть одночасно — можливий розворот"
            )
        elif avg_equity < -0.3 and dxy_chg < -0.3:
            patterns.append(
                " Ризик-оф з слабким USD — крипта може тримати краще за традиційні ринки"
            )

    return patterns


def _detect_patterns_london(changes: dict) -> list[str]:
    patterns = []

    # London Kill Zone reversal: Asia was bearish + London opens flat/positive
    asia_bias = _daily_biases.get("asia")
    london_equity = [
        changes.get("^FTSE"),
        changes.get("^GDAXI"),
    ]
    london_equity = [c for c in london_equity if c is not None]
    if london_equity:
        avg_london = sum(london_equity) / len(london_equity)
        if asia_bias == "bearish" and avg_london > -0.3:
            patterns.append(
                " London відкрився проти азійського руху → можливий відскок (London Kill Zone reversal)"
            )

    # DXY divergence with London equities
    dxy_chg = changes.get("DX-Y.NYB") or changes.get("EURUSD=X")
    ftse_chg = changes.get("^FTSE")
    dax_chg  = changes.get("^GDAXI")
    equity_vals = [c for c in [ftse_chg, dax_chg] if c is not None]
    if equity_vals and dxy_chg is not None:
        avg_eq = sum(equity_vals) / len(equity_vals)
        if avg_eq > 0.3 and dxy_chg > 0.3:
            patterns.append(
                " Незвичний ризик-он (Лондон): акції та USD ростуть — стежити за розворотом"
            )
        elif avg_eq < -0.3 and dxy_chg < -0.3:
            patterns.append(
                " Ризик-оф з слабким USD (Лондон) — крипта може тримати краще"
            )

    return patterns


def _detect_patterns_ny(changes: dict, vix_level: float | None,
                        sp500_ohlc: dict | None, vix_chg: float | None) -> list[str]:
    patterns = []

    # VIX level check
    if vix_level is not None:
        if vix_level < 15:
            patterns.append(
                f" VIX {vix_level:.1f} — комплейсенсі, сильний ризик-он, бик-модифікатор активний"
            )
        elif vix_level <= 20:
            patterns.append(f" VIX {vix_level:.1f} — нормальний рівень волатильності")
        elif vix_level <= 25:
            patterns.append(
                f" VIX {vix_level:.1f} — підвищений страх, знижено скор сесії"
            )
        else:
            patterns.append(
                f" VIX {vix_level:.1f} — висока волатильність! Ризик-оф режим, уникати лонгів"
            )

    # NY Opening Range: S&P gap + VIX direction
    if sp500_ohlc is not None and vix_chg is not None:
        gap = sp500_ohlc["gap_pct"]
        if gap > 0.5 and vix_chg < 0:
            patterns.append(
                f" S&P гепнув +{gap:.2f}% та VIX падає → сильний бичачий день (Opening Range)"
            )
        elif gap < -0.5 and vix_chg > 0:
            patterns.append(
                f" S&P гепнув {gap:.2f}% та VIX росте → висока ймовірність продовження спаду"
            )

    # DXY divergence at NY
    dxy_chg  = changes.get("DX-Y.NYB")
    sp_chg   = changes.get("^GSPC")
    nq_chg   = changes.get("^IXIC")
    eq_vals  = [c for c in [sp_chg, nq_chg] if c is not None]
    if eq_vals and dxy_chg is not None:
        avg_eq = sum(eq_vals) / len(eq_vals)
        if avg_eq > 0.3 and dxy_chg > 0.3:
            patterns.append(
                " Незвичний ризик-он: S&P та USD ростуть одночасно — стежити за розворотом"
            )
        elif avg_eq < -0.3 and dxy_chg < -0.3:
            patterns.append(
                " Ризик-оф з слабким USD — крипта може тримати краще за акції"
            )

    # Multi-session confluence check (only after recording ny bias is done — checked later)
    # We do a preliminary check here based on asia + london; ny will be confirmed after bias is set
    asia_bias   = _daily_biases.get("asia")
    london_bias = _daily_biases.get("london")

    # If asia and london both bearish, warn pre-emptively
    if asia_bias == "bearish" and london_bias == "bearish":
        patterns.append(
            " Азія та Лондон обидва медвежачі — якщо NY підтвердить: Triple bearish"
        )

    return patterns


def _check_triple_confluence(ny_bias: str) -> str | None:
    """
    Call AFTER recording ny bias. Returns warning string or None.
    """
    asia_bias   = _daily_biases.get("asia")
    london_bias = _daily_biases.get("london")
    if asia_bias == "bearish" and london_bias == "bearish" and ny_bias == "bearish":
        return " Triple bearish — сильний ризик-оф! Уникати лонгів протягом усього дня"
    if asia_bias == "bullish" and london_bias == "bullish" and ny_bias == "bullish":
        return "🟢 Triple bullish — повний ризик-он! Сприятливий фон для лонгів"
    return None


# ─── TG message builder ───────────────────────────────────────────────────────

_BIAS_EMOJI = {"bullish": "", "bearish": "", "neutral": ""}
_BIAS_LABEL = {
    "bullish": "Bullish — ризик-он, сприятливо для лонгів",
    "bearish": "Bearish — ризик-оф, тиск на крипту",
    "neutral": "Нейтрально — змішані сигнали",
}


def _build_message(session: dict, changes: dict, btc_chg: float | None,
                   bias: str, score: float, patterns: list[str]) -> str:
    now_kyiv = datetime.now(timezone.utc) + timedelta(hours=3)
    lines = [
        f"{session['label']} · Відкриття ринку",
        f"{now_kyiv.strftime('%d.%m.%Y')} | {session['kyiv']} Kyiv\n",
    ]

    for sym, label in session["symbols"].items():
        chg = changes.get(sym)
        if chg is None:
            continue
        arrow = "" if chg > 0 else ("" if chg < 0 else "")
        sign  = "+" if chg > 0 else ""
        if sym == "^VIX":
            arrow = ""
        lines.append(f"{arrow} <b>{label}</b>: {sign}{chg:.2f}%")

    if btc_chg is not None:
        arrow = "" if btc_chg > 0 else ("" if btc_chg < 0 else "")
        sign  = "+" if btc_chg > 0 else ""
        lines.append(f"{arrow} <b>BTC 24h</b>: {sign}{btc_chg:.2f}%")

    emoji = _BIAS_EMOJI[bias]
    lines.append(f"\n{emoji} <b>{_BIAS_LABEL[bias]}</b>")

    if bias == "bullish":
        lines.append("→ Позитивний фон для альткоїнів")
    elif bias == "bearish":
        lines.append("→ Обережно з новими лонгами")

    if patterns:
        lines.append("\n <b>Патерни:</b>")
        for p in patterns:
            lines.append(f"  {p}")

    lines.append("\n <b>KADO</b> · kadoclub.net")
    return "\n".join(lines)


# ─── Session runner ───────────────────────────────────────────────────────────

def _run_session(session: dict, send_tg, chat_id: str) -> None:
    global _vix_level

    print(f"[SESSION] ▶ {session['label']} відкриття")

    changes: dict = {}
    for sym in session["symbols"]:
        changes[sym] = _fetch_change(sym)

    btc_chg = _fetch_btc_change() if session["btc"] else None

    # Session-specific enrichment and pattern detection
    session_name = session["name"]
    extra_patterns: list[str] = []
    current_vix_level: float | None = None
    sp500_ohlc: dict | None = None

    if session_name == "asia":
        extra_patterns = _detect_patterns_asia(changes, btc_chg)
        bias, score = _calc_bias(changes)

    elif session_name == "london":
        extra_patterns = _detect_patterns_london(changes)
        bias, score = _calc_bias(changes)

    elif session_name == "ny":
        # Fetch VIX absolute level and S&P OHLC for opening range
        current_vix_level = _fetch_vix_level()
        with _vix_level_lock:
            _vix_level = current_vix_level

        sp500_ohlc = _fetch_ohlc("^GSPC")
        vix_chg    = changes.get("^VIX")

        extra_patterns = _detect_patterns_ny(
            changes, current_vix_level, sp500_ohlc, vix_chg
        )
        bias, score = _calc_bias(changes, vix_level=current_vix_level)

    else:
        bias, score = _calc_bias(changes)

    # Record bias for confluence tracking
    _record_daily_bias(session_name, bias)

    # Triple confluence check (meaningful only at NY, but check every session for completeness)
    triple_msg = _check_triple_confluence(bias)
    if triple_msg:
        extra_patterns.append(triple_msg)

    _set_bias(bias, score, session_name, extra_patterns)

    msg = _build_message(session, changes, btc_chg, bias, score, extra_patterns)
    try:
        send_tg(msg, chat_id)
    except Exception as e:
        print(f"[SESSION] TG error: {e}")

    print(f"[SESSION] {session_name} bias={bias} score={score:+.2f} patterns={len(extra_patterns)}")


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
        # Reset daily biases at midnight if date rolled over
        _reset_daily_biases_if_new_day()

        now = datetime.now(timezone.utc)

        upcoming = []
        for s in SESSIONS:
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
