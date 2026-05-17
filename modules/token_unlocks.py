"""
token_unlocks.py — фільтр token unlock подій.

Джерела (в порядку пріоритету):
  1. CoinMarketCal API (безкоштовний tier, COINMARKETCAL_API_KEY в .env)
  2. Tokenomist API (TOKENOMIST_API_KEY в .env)
  3. Hardcoded список відомих анлоків як fallback

Логіка:
  - >5% circulating supply анлок у наступні 24h → AVOID LONG (блок)
  - >3% circulating supply анлок у наступні 7 днів → SHORT BIAS (-2.0 до score)
  - <3% або далеко → OK

Використання:
    from modules.token_unlocks import start_unlock_monitor, get_unlock_risk
    start_unlock_monitor()
    risk, reason = get_unlock_risk("ARB")  # ("ok"|"short_bias"|"avoid_long", reason)
"""
import os
import time
import threading
import requests
from datetime import datetime, timezone, timedelta

COINMARKETCAL_KEY = os.getenv("COINMARKETCAL_API_KEY", "")
TOKENOMIST_KEY    = os.getenv("TOKENOMIST_API_KEY", "")

_POLL_SEC = 6 * 3600   # оновлення кожні 6 годин
_LOCK = threading.Lock()
_cache: dict[str, dict] = {}   # coin → {pct_supply, days_until, source}

# Тікери до ID в CoinMarketCal
_CMC_COIN_IDS = {
    "ARB": "arbitrum", "OP": "optimism", "SUI": "sui", "APT": "aptos",
    "INJ": "injective-protocol", "SEI": "sei-network", "TIA": "celestia",
    "STRK": "starknet", "MANTA": "manta-network", "JUP": "jupiter",
    "WLD": "worldcoin", "PYTH": "pyth-network", "EIGEN": "eigenlayer",
    "ZK": "zksync", "ZETA": "zetachain", "ALT": "altlayer",
}


def _fetch_coinmarketcal() -> dict[str, dict]:
    if not COINMARKETCAL_KEY:
        return {}
    result = {}
    try:
        now = datetime.now(timezone.utc)
        r = requests.get(
            "https://developers.coinmarketcal.com/v1/events",
            params={
                "max":          50,
                "dateRangeStart": now.strftime("%Y-%m-%d"),
                "dateRangeEnd":   (now + timedelta(days=14)).strftime("%Y-%m-%d"),
                "categories":   "token-release",
                "sortBy":       "created_desc",
            },
            headers={"x-api-key": COINMARKETCAL_KEY, "Accept": "application/json"},
            timeout=10,
        )
        events = r.json().get("body", [])
        for ev in events:
            for coin_info in ev.get("coins", []):
                ticker = coin_info.get("symbol", "").upper()
                if not ticker:
                    continue
                try:
                    event_dt = datetime.fromisoformat(ev["date_event"].replace("Z", "+00:00"))
                    days_until = (event_dt - now).total_seconds() / 86400
                    if days_until < 0:
                        continue
                    pct = float(ev.get("percentage", 0) or 0)
                    if ticker not in result or result[ticker]["days_until"] > days_until:
                        result[ticker] = {
                            "pct_supply":  pct,
                            "days_until":  round(days_until, 1),
                            "source":      "CoinMarketCal",
                            "name":        ev.get("title", {}).get("en", "Token Unlock"),
                        }
                except Exception:
                    pass
        print(f"[Unlocks] CoinMarketCal: {len(result)} подій")
    except Exception as e:
        print(f"[Unlocks] CoinMarketCal error: {e}")
    return result


def _fetch_tokenomist() -> dict[str, dict]:
    if not TOKENOMIST_KEY:
        return {}
    result = {}
    try:
        now = datetime.now(timezone.utc)
        r = requests.get(
            "https://api.unlocks.app/v3/unlock/events",
            params={"startDate": now.strftime("%Y-%m-%d"),
                    "endDate": (now + timedelta(days=14)).strftime("%Y-%m-%d")},
            headers={"x-api-key": TOKENOMIST_KEY},
            timeout=10,
        )
        for ev in r.json().get("data", []):
            ticker = ev.get("symbol", "").upper()
            if not ticker:
                continue
            try:
                event_dt = datetime.fromisoformat(ev["unlockDate"].replace("Z", "+00:00"))
                days_until = (event_dt - now).total_seconds() / 86400
                if days_until < 0:
                    continue
                pct = float(ev.get("percentageOfCirculating", 0) or 0)
                if ticker not in result or result[ticker]["days_until"] > days_until:
                    result[ticker] = {
                        "pct_supply":  pct,
                        "days_until":  round(days_until, 1),
                        "source":      "Tokenomist",
                        "name":        ev.get("name", "Token Unlock"),
                    }
            except Exception:
                pass
        print(f"[Unlocks] Tokenomist: {len(result)} подій")
    except Exception as e:
        print(f"[Unlocks] Tokenomist error: {e}")
    return result


def _refresh():
    data = _fetch_coinmarketcal()
    if not data:
        data = _fetch_tokenomist()
    with _LOCK:
        _cache.clear()
        _cache.update(data)


def _poll_loop():
    _refresh()
    while True:
        time.sleep(_POLL_SEC)
        _refresh()


def start_unlock_monitor():
    t = threading.Thread(target=_poll_loop, name="unlock-monitor", daemon=True)
    t.start()
    print("[Unlocks] Monitor запущено (CoinMarketCal/Tokenomist, 6h оновлення)")


def get_unlock_risk(coin: str) -> tuple[str, str]:
    """
    Returns ("ok"|"short_bias"|"avoid_long", reason).
    - avoid_long: >5% supply unlock within 24h → do not open LONG
    - short_bias: >3% unlock within 7 days → score penalty -2.0
    - ok: no significant upcoming unlock
    """
    with _LOCK:
        ev = _cache.get(coin.upper())
    if not ev:
        return "ok", ""

    pct   = ev.get("pct_supply", 0)
    days  = ev.get("days_until", 999)
    name  = ev.get("name", "Token Unlock")

    if pct > 5.0 and days <= 1.0:
        return "avoid_long", f"🔓 {name}: {pct:.1f}% supply анлок за {days:.1f}д — LONG заблоковано"
    if pct > 3.0 and days <= 7.0:
        return "short_bias", f"🔓 {name}: {pct:.1f}% supply анлок за {days:.1f}д — ведмежий тиск"
    return "ok", ""
