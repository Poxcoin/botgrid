"""
funding_arb.py — Multi-venue Funding Rate fetcher for the FR Arbitrage bot.

Fetches current funding rate (% per 8h) from Binance, Bybit, and Hyperliquid.
Bybit caps funding at ±0.01% (useless for extreme detection); Binance and
Hyperliquid run uncapped funding. Cross-venue agreement on extreme funding
is the entry signal for fr_arb_bot.

Public API:
  - get_funding(symbol) → dict {venue: {fr, oi, next_funding_ts}, ...}
  - find_extremes(threshold_pct) → list of (symbol, max_fr, min_fr, venues)
  - get_oi_delta_bybit(symbol) → % change last 5min, for confirmation filter

Notes:
  - All venues return funding rate as a decimal fraction (e.g. 0.0018 = 0.18%)
    but Bybit returns string. Normalized to float % (0.18) here.
  - Caching: 30s TTL per venue to avoid hammering APIs.
  - No auth needed for funding rate endpoints (public market data).
"""
from __future__ import annotations
import time
import requests
from typing import Optional

# Cache: key=(venue, symbol) → {ts, data}
_cache: dict = {}
_TTL = 30  # seconds


def _cached(key: tuple, fn):
    c = _cache.get(key, {})
    if time.time() - c.get("ts", 0) < _TTL:
        return c["data"]
    try:
        result = fn()
    except Exception:
        return c.get("data")
    _cache[key] = {"ts": time.time(), "data": result}
    return result


# ─── Symbol normalization ──────────────────────────────────────────────────────
# Project uses ccxt-style symbols like "BTC/USDT:USDT". Each venue has own format.

def _binance_sym(symbol: str) -> str:
    """BTC/USDT:USDT → BTCUSDT (Binance perp)."""
    return symbol.split("/")[0] + "USDT"


def _bybit_sym(symbol: str) -> str:
    """BTC/USDT:USDT → BTCUSDT (Bybit linear)."""
    return symbol.split("/")[0] + "USDT"


def _hyperliquid_sym(symbol: str) -> str:
    """BTC/USDT:USDT → BTC (Hyperliquid uses bare coin)."""
    return symbol.split("/")[0]


# ─── Binance ──────────────────────────────────────────────────────────────────

def fr_binance(symbol: str) -> Optional[dict]:
    """Binance current FR + next funding time. No auth needed."""
    def _fetch():
        sym = _binance_sym(symbol)
        r = requests.get(
            "https://fapi.binance.com/fapi/v1/premiumIndex",
            params={"symbol": sym}, timeout=8,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        if r.status_code != 200:
            raise ValueError(f"HTTP {r.status_code}")
        d = r.json()
        # lastFundingRate is per-funding-period (8h); normalize to %
        return {
            "venue":            "binance",
            "fr_pct":           float(d.get("lastFundingRate", 0)) * 100,
            "next_funding_ts":  int(d.get("nextFundingTime", 0)),
            "mark_price":       float(d.get("markPrice", 0)),
        }
    return _cached(("binance", symbol), _fetch)


def oi_binance(symbol: str) -> Optional[float]:
    """Binance OI in contracts (last)."""
    def _fetch():
        sym = _binance_sym(symbol)
        r = requests.get(
            "https://fapi.binance.com/fapi/v1/openInterest",
            params={"symbol": sym}, timeout=6,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        if r.status_code != 200:
            raise ValueError(f"HTTP {r.status_code}")
        return float(r.json().get("openInterest", 0))
    return _cached(("oi_binance", symbol), _fetch)


# ─── Bybit (already have ccxt elsewhere but raw is faster + auth-free) ────────

def fr_bybit(symbol: str) -> Optional[dict]:
    def _fetch():
        sym = _bybit_sym(symbol)
        r = requests.get(
            "https://api.bybit.com/v5/market/funding/history",
            params={"category": "linear", "symbol": sym, "limit": 1},
            timeout=6,
        )
        if r.status_code != 200:
            raise ValueError(f"HTTP {r.status_code}")
        items = (r.json().get("result") or {}).get("list") or []
        if not items:
            return None
        last = items[0]
        return {
            "venue":            "bybit",
            "fr_pct":           float(last.get("fundingRate", 0)) * 100,
            "next_funding_ts":  int(last.get("fundingRateTimestamp", 0)),
        }
    return _cached(("bybit", symbol), _fetch)


def oi_bybit_5min_delta(symbol: str) -> Optional[float]:
    """Bybit OI % change over last 5-min interval (2 buckets)."""
    def _fetch():
        sym = _bybit_sym(symbol)
        r = requests.get(
            "https://api.bybit.com/v5/market/open-interest",
            params={"category": "linear", "symbol": sym, "intervalTime": "5min", "limit": 3},
            timeout=6,
        )
        if r.status_code != 200:
            raise ValueError(f"HTTP {r.status_code}")
        items = (r.json().get("result") or {}).get("list") or []
        if len(items) < 2:
            return 0.0
        new_oi = float(items[0].get("openInterest", 0))
        old_oi = float(items[-1].get("openInterest", 0))
        if old_oi == 0:
            return 0.0
        return (new_oi - old_oi) / old_oi * 100.0
    return _cached(("oi_bybit_d", symbol), _fetch)


# ─── Hyperliquid (no auth needed for public mids/funding) ─────────────────────

def fr_hyperliquid(symbol: str) -> Optional[dict]:
    """Hyperliquid metaAndAssetCtxs endpoint."""
    def _fetch():
        sym = _hyperliquid_sym(symbol)
        r = requests.post(
            "https://api.hyperliquid.xyz/info",
            json={"type": "metaAndAssetCtxs"},
            timeout=8,
        )
        if r.status_code != 200:
            raise ValueError(f"HTTP {r.status_code}")
        data = r.json()
        # response: [meta, assetCtxs]; find our coin by index
        if not isinstance(data, list) or len(data) != 2:
            return None
        meta, ctxs = data
        universe = meta.get("universe", [])
        idx = next((i for i, u in enumerate(universe) if u.get("name") == sym), None)
        if idx is None:
            return None
        ctx = ctxs[idx]
        return {
            "venue":            "hyperliquid",
            # HL returns funding as decimal fraction per HOUR (not 8h) — normalize
            "fr_pct":           float(ctx.get("funding", 0)) * 100 * 8,
            "mark_price":       float(ctx.get("markPx", 0)),
        }
    return _cached(("hyperliquid", symbol), _fetch)


# ─── Unified entry ────────────────────────────────────────────────────────────

VENUES = ("binance", "bybit", "hyperliquid")


def get_funding(symbol: str) -> dict:
    """Returns funding data for all three venues. Missing venues = None.
    Output:
      {"binance": {fr_pct, ...} | None,
       "bybit":   {fr_pct, ...} | None,
       "hyperliquid": {fr_pct, ...} | None}
    """
    return {
        "binance":     fr_binance(symbol),
        "bybit":       fr_bybit(symbol),
        "hyperliquid": fr_hyperliquid(symbol),
    }


def find_extremes(symbols: list[str], threshold_pct: float = 0.18,
                  min_cross_venues: int = 2) -> list[dict]:
    """
    For each symbol, check if at least `min_cross_venues` venues show |FR|
    above threshold AND in the same direction.

    Returns list of signal dicts ranked by max(|fr|):
      {symbol, direction, max_fr, min_fr, max_venue, venues: {...}}
    """
    signals = []
    for sym in symbols:
        venues_data = get_funding(sym)
        # Filter non-None venues with extreme FR
        candidates = [(v, d["fr_pct"]) for v, d in venues_data.items()
                      if d and abs(d.get("fr_pct", 0)) >= threshold_pct]
        if len(candidates) < min_cross_venues:
            continue
        # All must agree on sign
        positives = [c for c in candidates if c[1] > 0]
        negatives = [c for c in candidates if c[1] < 0]
        if len(positives) >= min_cross_venues:
            direction = "SHORT"  # high positive FR → longs paying → fade longs
            agreeing = positives
        elif len(negatives) >= min_cross_venues:
            direction = "LONG"   # high negative FR → shorts paying → fade shorts
            agreeing = negatives
        else:
            continue
        max_fr  = max(c[1] for c in agreeing)
        min_fr  = min(c[1] for c in agreeing)
        max_venue = max(agreeing, key=lambda c: abs(c[1]))[0]
        signals.append({
            "symbol":    sym,
            "direction": direction,
            "max_fr":    round(max_fr, 4),
            "min_fr":    round(min_fr, 4),
            "max_venue": max_venue,
            "venues":    {v: d.get("fr_pct") if d else None for v, d in venues_data.items()},
        })
    signals.sort(key=lambda s: abs(s["max_fr"]), reverse=True)
    return signals


# ─── Smoke test ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    test_symbols = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
    print("=== Multi-venue FR snapshot ===")
    for sym in test_symbols:
        d = get_funding(sym)
        print(f"\n{sym}")
        for v, info in d.items():
            if info is None:
                print(f"  {v:11s}: N/A")
            else:
                print(f"  {v:11s}: fr={info['fr_pct']:+.4f}%")
    print("\n=== Extremes at threshold 0.05% (loose for demo) ===")
    sigs = find_extremes(test_symbols, threshold_pct=0.05, min_cross_venues=2)
    for s in sigs:
        print(f"  {s['symbol']:18s} {s['direction']:5s} max={s['max_fr']:+.4f}% min={s['min_fr']:+.4f}% best_venue={s['max_venue']}")
    if not sigs:
        print("  (no extremes — normal during calm market)")
