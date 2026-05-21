"""
backtester_fr_arb.py — Backtest for FR Multi-Exchange Arb strategy.

Pulls 90 days of historical funding rate from Binance and Bybit (Hyperliquid
funding history is harder — skipped for backtest, included as future ext).
For each funding window where BOTH venues show |FR| > threshold same
direction, simulate the trade: enter at fr timestamp, exit at TP/SL/time-stop.

Tests parameters:
  - FR_THRESHOLD: 0.05% / 0.10% / 0.18% / 0.30%
  - MIN_CROSS_VENUES: 2 (since we have Binance + Bybit data)
  - TP_PCT: 1.5
  - SL_PCT: 1.0
  - SIZE_PCT: 20

Symbols: BTC, ETH, SOL, XRP, DOGE, LINK, AVAX, ARB.

Usage: python backtester_fr_arb.py
"""
import time
import requests
from datetime import datetime, timezone
from collections import defaultdict

SYMBOLS = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT",
           "XRP/USDT:USDT", "DOGE/USDT:USDT", "LINK/USDT:USDT",
           "AVAX/USDT:USDT", "ARB/USDT:USDT"]
DAYS = 90

LEVERAGE = 5
SIZE_PCT = 0.20
TP_PCT   = 0.015     # 1.5%
SL_PCT   = 0.010     # 1.0%
MAX_HOLD_HOURS = 8   # one funding cycle
TAKER_FEE = 0.00055
FEE_COST = TAKER_FEE * 2 * LEVERAGE


# ─── Historical funding rate fetchers ─────────────────────────────────────────

def _binance_history(symbol_short: str, limit: int = 1000) -> list[dict]:
    """Binance fundingRate history. Returns [{fundingTime ms, fundingRate}]."""
    items = []
    end_time = int(time.time() * 1000)
    while True:
        r = requests.get(
            "https://fapi.binance.com/fapi/v1/fundingRate",
            params={"symbol": symbol_short, "endTime": end_time, "limit": 1000},
            timeout=10,
        )
        if r.status_code != 200:
            break
        chunk = r.json()
        if not chunk:
            break
        items = chunk + items  # prepend (older comes back at chunk start)
        oldest_ts = chunk[0]["fundingTime"]
        if oldest_ts < int(time.time() * 1000) - DAYS * 86400 * 1000:
            break
        end_time = oldest_ts - 1
        time.sleep(0.2)
        if len(items) >= limit:
            break
    # Dedup + sort
    seen = set()
    out = []
    for it in sorted(items, key=lambda x: x["fundingTime"]):
        ts = int(it["fundingTime"])
        if ts in seen:
            continue
        seen.add(ts)
        out.append({"ts": ts, "fr_pct": float(it["fundingRate"]) * 100})
    cutoff = int(time.time() * 1000) - DAYS * 86400 * 1000
    return [x for x in out if x["ts"] >= cutoff]


def _bybit_history(symbol_short: str) -> list[dict]:
    """Bybit funding/history. ~200 records max per call, so paginate."""
    items = []
    end_time = int(time.time() * 1000)
    cutoff = end_time - DAYS * 86400 * 1000
    for _ in range(20):
        r = requests.get(
            "https://api.bybit.com/v5/market/funding/history",
            params={"category": "linear", "symbol": symbol_short,
                    "endTime": end_time, "limit": 200},
            timeout=10,
        )
        if r.status_code != 200:
            break
        rows = (r.json().get("result") or {}).get("list") or []
        if not rows:
            break
        items.extend({
            "ts": int(x["fundingRateTimestamp"]),
            "fr_pct": float(x["fundingRate"]) * 100,
        } for x in rows)
        oldest = min(int(x["fundingRateTimestamp"]) for x in rows)
        if oldest <= cutoff:
            break
        end_time = oldest - 1
        time.sleep(0.2)
    seen = set()
    out = []
    for it in sorted(items, key=lambda x: x["ts"]):
        if it["ts"] in seen or it["ts"] < cutoff:
            continue
        seen.add(it["ts"])
        out.append(it)
    return out


def _bybit_ohlcv(symbol_short: str, since_ms: int) -> list[list]:
    """1h candles from Bybit for price-after-signal lookup. Up to 1000 per call."""
    out = []
    end = int(time.time() * 1000)
    while since_ms < end:
        r = requests.get(
            "https://api.bybit.com/v5/market/kline",
            params={"category": "linear", "symbol": symbol_short, "interval": "60",
                    "start": since_ms, "limit": 1000},
            timeout=10,
        )
        if r.status_code != 200:
            break
        rows = (r.json().get("result") or {}).get("list") or []
        if not rows:
            break
        rows.reverse()  # Bybit returns newest first
        for c in rows:
            ts = int(c[0])
            if ts < since_ms:
                continue
            out.append([ts, float(c[1]), float(c[2]), float(c[3]), float(c[4])])
        last = int(rows[-1][0])
        if last <= since_ms:
            break
        since_ms = last + 3_600_000
        time.sleep(0.2)
    return out


# ─── Cross-venue signal alignment ─────────────────────────────────────────────

def find_cross_signals(symbol: str, threshold_pct: float) -> list[dict]:
    """Returns list of timestamps where Binance + Bybit FR both extreme same direction."""
    short = symbol.split("/")[0] + "USDT"
    bnb = _binance_history(short)
    bb = _bybit_history(short)
    # Index Bybit by closest 8h funding window (Binance uses same 00/08/16 UTC schedule)
    bb_map = {x["ts"] // (8 * 3600_000): x["fr_pct"] for x in bb}
    signals = []
    for x in bnb:
        bucket = x["ts"] // (8 * 3600_000)
        bb_fr = bb_map.get(bucket)
        if bb_fr is None:
            continue
        # Both above threshold + same sign
        if abs(x["fr_pct"]) >= threshold_pct and abs(bb_fr) >= threshold_pct \
                and (x["fr_pct"] > 0) == (bb_fr > 0):
            signals.append({
                "ts": x["ts"],
                "binance_fr": x["fr_pct"],
                "bybit_fr": bb_fr,
                "direction": "SHORT" if x["fr_pct"] > 0 else "LONG",
            })
    return signals


# ─── Trade simulation ────────────────────────────────────────────────────────

def simulate_trades(symbol: str, signals: list[dict]) -> list[dict]:
    """For each signal, look up Bybit 1h candles after the funding ts and
    determine TP/SL/timeout outcome at LEVERAGE."""
    if not signals:
        return []
    short = symbol.split("/")[0] + "USDT"
    earliest = min(s["ts"] for s in signals)
    candles = _bybit_ohlcv(short, earliest)
    trades = []
    for sig in signals:
        # find first candle >= ts
        idx = next((i for i, c in enumerate(candles) if c[0] >= sig["ts"]), None)
        if idx is None:
            continue
        entry = candles[idx][4]  # close of trigger candle
        tp_price = entry * (1 + TP_PCT) if sig["direction"] == "LONG" else entry * (1 - TP_PCT)
        sl_price = entry * (1 - SL_PCT) if sig["direction"] == "LONG" else entry * (1 + SL_PCT)
        result = None
        for c in candles[idx + 1: idx + 1 + MAX_HOLD_HOURS]:
            hi, lo = c[2], c[3]
            if sig["direction"] == "LONG":
                if lo <= sl_price:
                    result = ("SL", -SL_PCT)
                    break
                if hi >= tp_price:
                    result = ("TP", TP_PCT)
                    break
            else:
                if hi >= sl_price:
                    result = ("SL", -SL_PCT)
                    break
                if lo <= tp_price:
                    result = ("TP", TP_PCT)
                    break
        if result is None and len(candles) > idx + MAX_HOLD_HOURS:
            cl = candles[idx + MAX_HOLD_HOURS][4]
            pnl_raw = (cl - entry) / entry if sig["direction"] == "LONG" else (entry - cl) / entry
            result = ("TIMEOUT", pnl_raw)
        if result is None:
            continue
        outcome, pnl_pct = result
        pnl = pnl_pct * LEVERAGE - FEE_COST
        trades.append({
            "symbol":    symbol,
            "ts":        sig["ts"],
            "direction": sig["direction"],
            "binance_fr": sig["binance_fr"],
            "bybit_fr":   sig["bybit_fr"],
            "entry":     entry,
            "outcome":   outcome,
            "pnl":       pnl,
        })
    return trades


# ─── Run ──────────────────────────────────────────────────────────────────────

def run(threshold_pct: float):
    print(f"\n=== threshold = {threshold_pct}% (both venues, same direction) ===")
    all_trades = []
    for sym in SYMBOLS:
        sigs = find_cross_signals(sym, threshold_pct)
        trades = simulate_trades(sym, sigs)
        wins = sum(1 for t in trades if t["pnl"] > 0)
        pnl_total = sum(t["pnl"] for t in trades)
        print(f"  {sym:18s}  signals={len(sigs):3d}  trades={len(trades):3d}  "
              f"WR={(wins/len(trades)*100 if trades else 0):4.0f}%  "
              f"pnl(raw lev)={pnl_total * 100:+.2f}%")
        all_trades.extend(trades)
    if not all_trades:
        print("  COMBINED: 0 trades")
        return
    n = len(all_trades)
    wins = sum(1 for t in all_trades if t["pnl"] > 0)
    wr = wins / n * 100
    total_raw = sum(t["pnl"] for t in all_trades) * 100
    account = total_raw * SIZE_PCT
    monthly = account / 3
    print(f"  COMBINED: {n} trades  WR={wr:.0f}%  "
          f"raw_pnl={total_raw:+.2f}%  account@{int(SIZE_PCT*100)}%={account:+.2f}%  "
          f"monthly={monthly:+.2f}%")


if __name__ == "__main__":
    print(f"Backtesting FR Arb on {DAYS}d historical data (Binance + Bybit)")
    print(f"Symbols: {len(SYMBOLS)} | TP={TP_PCT*100}% | SL={SL_PCT*100}% | "
          f"lev={LEVERAGE}x | size={SIZE_PCT*100}% | max_hold={MAX_HOLD_HOURS}h")
    for thr in [0.05, 0.10, 0.18, 0.30, 0.50]:
        run(thr)
