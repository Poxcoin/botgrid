"""
backtester_dex_whale.py — Backtest: do large Uniswap V3 swaps correlate with Bybit ETH price?

Method:
  1. Query Uniswap V3 ETH/USDC pool swaps via The Graph (free API, no key needed)
  2. Filter: USD notional > $500K (whale-level)
  3. Decode direction: amount1<0 = bought ETH (bullish), amount1>0 = sold ETH (bearish)
  4. Fetch Bybit ETH/USDT OHLCV at swap time
  5. Check price 1h and 4h after swap — did it move in the expected direction?
  6. Report: WR, avg move, signal frequency

Pool:  0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 (USDC/WETH 0.05% — highest volume)
Usage: python backtester_dex_whale.py [--days 7] [--min-usd 500000] [--verbose]
"""
import argparse
import sys
import time
from datetime import datetime, timedelta, timezone

import ccxt
import requests

# ── Config ────────────────────────────────────────────────────────────────────

GRAPH_URL  = "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3"
ETH_USDC_POOL = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640"

_ex = ccxt.bybit({
    "options": {"defaultType": "swap"},
    "enableRateLimit": True,
    "timeout": 15000,
})
_ex.has["fetchCurrencies"] = False


# ── Uniswap data via The Graph ─────────────────────────────────────────────────

def fetch_large_swaps(min_usd: float, days: int) -> list[dict]:
    """Fetch large ETH/USDC swaps from The Graph for the last N days."""
    since_ts = int((datetime.now(timezone.utc) - timedelta(days=days)).timestamp())
    print(f"[WHALE-BT] Fetching Uniswap V3 swaps >${min_usd/1e3:.0f}K since {datetime.fromtimestamp(since_ts).strftime('%Y-%m-%d')}...")

    query = """
    query($pool: String!, $minUSD: String!, $since: Int!, $skip: Int!) {
      swaps(
        first: 1000
        skip: $skip
        where: {
          pool: $pool
          amountUSD_gt: $minUSD
          timestamp_gt: $since
        }
        orderBy: timestamp
        orderDirection: asc
      ) {
        timestamp
        amount0
        amount1
        amountUSD
        origin
      }
    }
    """

    all_swaps = []
    skip = 0
    while True:
        try:
            resp = requests.post(
                GRAPH_URL,
                json={
                    "query": query,
                    "variables": {
                        "pool":   ETH_USDC_POOL,
                        "minUSD": str(int(min_usd)),
                        "since":  since_ts,
                        "skip":   skip,
                    }
                },
                timeout=15,
            )
            data = resp.json()
            if "errors" in data:
                print(f"[WHALE-BT] Graph error: {data['errors']}")
                break
            swaps = data.get("data", {}).get("swaps", [])
            if not swaps:
                break
            all_swaps.extend(swaps)
            if len(swaps) < 1000:
                break
            skip += 1000
            time.sleep(0.5)
        except Exception as e:
            print(f"[WHALE-BT] Graph fetch error: {e}")
            break

    print(f"[WHALE-BT] Got {len(all_swaps)} large swaps")
    return all_swaps


def parse_direction(swap: dict) -> str:
    """
    Uniswap V3 USDC/WETH pool:
      token0 = USDC, token1 = WETH
      amount1 < 0 → WETH leaving pool → user got ETH → BUY
      amount1 > 0 → WETH entering pool → user sold ETH → SELL
    """
    amount1 = float(swap.get("amount1", 0))
    return "BUY" if amount1 < 0 else "SELL"


# ── Bybit price lookup ────────────────────────────────────────────────────────

_ohlcv_cache: dict = {}

def _fetch_ohlcv_around(ts: int) -> list:
    """Fetch 1h candles for ETH around timestamp ts (±6 hours). Cached."""
    # Round to nearest 6h bucket for cache efficiency
    bucket = (ts // (6 * 3600)) * (6 * 3600)
    if bucket in _ohlcv_cache:
        return _ohlcv_cache[bucket]
    try:
        since_ms = (bucket - 6 * 3600) * 1000
        candles = _ex.fetch_ohlcv(
            "ETH/USDT:USDT", "1h",
            since=since_ms,
            limit=12,
            params={"category": "linear"},
        )
        _ohlcv_cache[bucket] = candles
        time.sleep(0.2)
        return candles
    except Exception:
        return []


def get_price_at(ts: int) -> float | None:
    """Get ETH close price at the 1h candle containing timestamp ts."""
    candles = _fetch_ohlcv_around(ts)
    ts_ms = ts * 1000
    for c in reversed(candles):
        if c[0] <= ts_ms:
            return float(c[4])
    return None


def get_price_after(ts: int, hours: int) -> float | None:
    """Get ETH price approximately N hours after ts."""
    target_ts = ts + hours * 3600
    # Expand search window if needed
    bucket = (target_ts // (6 * 3600)) * (6 * 3600)
    if bucket not in _ohlcv_cache:
        try:
            since_ms = (bucket - 6 * 3600) * 1000
            candles = _ex.fetch_ohlcv(
                "ETH/USDT:USDT", "1h",
                since=since_ms,
                limit=12,
                params={"category": "linear"},
            )
            _ohlcv_cache[bucket] = candles
            time.sleep(0.2)
        except Exception:
            return None
    return get_price_at(target_ts)


# ── Analysis ──────────────────────────────────────────────────────────────────

def analyze(swaps: list[dict], verbose: bool = False) -> dict:
    results_1h = {"wins": 0, "total": 0, "moves": []}
    results_4h = {"wins": 0, "total": 0, "moves": []}

    buy_count  = 0
    sell_count = 0

    for swap in swaps:
        ts        = int(swap["timestamp"])
        direction = parse_direction(swap)
        usd       = float(swap.get("amountUSD", 0))

        if direction == "BUY":
            buy_count += 1
        else:
            sell_count += 1

        price_now = get_price_at(ts)
        if price_now is None:
            continue

        for hours, res in [(1, results_1h), (4, results_4h)]:
            price_later = get_price_after(ts, hours)
            if price_later is None:
                continue

            move_pct = (price_later - price_now) / price_now * 100.0
            expected_up = direction == "BUY"
            win = (expected_up and move_pct > 0) or (not expected_up and move_pct < 0)

            res["total"] += 1
            if win:
                res["wins"] += 1
            res["moves"].append(move_pct if expected_up else -move_pct)

            if verbose:
                ts_str = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")
                print(
                    f"  {ts_str} | {direction:4s} ${usd/1e6:.1f}M | "
                    f"price={price_now:.2f} | +{hours}h={price_later:.2f} "
                    f"({move_pct:+.2f}%) | {'✅' if win else '❌'}"
                )

    return {
        "buy_count":  buy_count,
        "sell_count": sell_count,
        "1h": results_1h,
        "4h": results_4h,
    }


# ── Report ────────────────────────────────────────────────────────────────────

def print_report(stats: dict, min_usd: float, days: int):
    print("\n" + "=" * 60)
    print(f"DEX WHALE BACKTEST — Uniswap V3 ETH/USDC ${min_usd/1e3:.0f}K+ swaps | last {days}d")
    print("=" * 60)
    print(f"Total swaps: {stats['buy_count'] + stats['sell_count']} "
          f"(BUY={stats['buy_count']}, SELL={stats['sell_count']})")

    for window, key in [("1h", "1h"), ("4h", "4h")]:
        r = stats[key]
        if r["total"] == 0:
            print(f"\n{window}: no data")
            continue
        wr = r["wins"] / r["total"] * 100
        avg_move = sum(r["moves"]) / len(r["moves"]) if r["moves"] else 0
        print(f"\n{window} after swap:")
        print(f"  WR:       {wr:.1f}%  ({r['wins']}/{r['total']})")
        print(f"  Avg move: {avg_move:+.3f}%")

        verdict = ""
        if wr >= 60:
            verdict = "✅ Strong alpha — worth building"
        elif wr >= 53:
            verdict = "🟡 Weak edge — marginal, needs more data"
        elif wr <= 45:
            verdict = "❌ Anti-predictive — consider inverse signal"
        else:
            verdict = "⚪ No edge — random"
        print(f"  Verdict:  {verdict}")

    print("\n" + "=" * 60)
    overall_1h = stats["1h"]
    if overall_1h["total"] > 0:
        wr_1h = overall_1h["wins"] / overall_1h["total"] * 100
        if wr_1h >= 58:
            print("COUNCIL VERDICT: PROCEED — DEX whale signal has edge, build the tracker")
        elif wr_1h >= 52:
            print("COUNCIL VERDICT: RECONSIDER — marginal edge, validate with 30+ days")
        else:
            print("COUNCIL VERDICT: REJECT — no reliable edge, don't rebuild whale tracker")
    print("=" * 60 + "\n")


# ── Entry ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DEX whale swap backtest")
    parser.add_argument("--days",    type=int,   default=7,       help="Days to look back (default 7)")
    parser.add_argument("--min-usd", type=float, default=500_000, help="Min swap USD (default 500000)")
    parser.add_argument("--verbose", action="store_true",         help="Print each trade")
    args = parser.parse_args()

    print(f"[WHALE-BT] Loading Bybit markets...")
    try:
        _ex.load_markets()
    except Exception as e:
        print(f"Failed to load markets: {e}")
        sys.exit(1)

    swaps = fetch_large_swaps(min_usd=args.min_usd, days=args.days)
    if not swaps:
        print("[WHALE-BT] No swaps found. Check The Graph API or increase --days")
        sys.exit(1)

    print(f"[WHALE-BT] Analyzing {len(swaps)} swaps vs Bybit price...")
    stats = analyze(swaps, verbose=args.verbose)
    print_report(stats, min_usd=args.min_usd, days=args.days)
