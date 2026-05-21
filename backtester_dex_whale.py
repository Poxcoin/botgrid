"""
backtester_dex_whale.py — Backtest: do large Uniswap V3 swaps correlate with Bybit ETH price?

Method:
  1. Fetch Uniswap V3 ETH/USDC Swap events via Alchemy eth_getLogs
  2. Filter: USDC notional > $500K (whale-level)
  3. Decode direction: amount1<0 = bought ETH (bullish), amount1>0 = sold ETH (bearish)
  4. Fetch Bybit ETH/USDT OHLCV at swap time
  5. Check price 1h and 4h after swap — did it move in the expected direction?
  6. Report: WR, avg move, signal frequency

Pool:  0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640 (USDC/WETH 0.05% — highest volume)
       token0 = USDC (6 decimals), token1 = WETH (18 decimals)

Swap event:
  topic0 = keccak256("Swap(address,address,int256,int256,uint160,uint128,int24)")
         = 0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67
  data layout (non-indexed, each 32 bytes):
    [0:32]   amount0  — int256 (USDC, 6 dec)  negative = USDC leaving pool
    [32:64]  amount1  — int256 (WETH, 18 dec) negative = WETH leaving pool = user BOUGHT ETH

Usage: python backtester_dex_whale.py [--days 7] [--min-usd 500000] [--verbose]
"""
import argparse
import os
import sys
import time
from datetime import datetime, timedelta, timezone

import ccxt
import requests
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────

POOL         = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640"
SWAP_TOPIC   = "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67"
BLOCKS_PER_DAY  = 7_200          # ~12s avg block time
CHUNK_BLOCKS    = 10             # Alchemy free tier hard limit on eth_getLogs range
RPC_DELAY       = 0.05           # seconds between RPC calls (~20 cps)

_ex = ccxt.bybit({
    "options": {"defaultType": "swap"},
    "enableRateLimit": True,
    "timeout": 15000,
})
_ex.has["fetchCurrencies"] = False


# ── Alchemy RPC helpers ───────────────────────────────────────────────────────

def _rpc(method: str, params: list, api_key: str) -> dict:
    url = f"https://eth-mainnet.g.alchemy.com/v2/{api_key}"
    resp = requests.post(url, json={"jsonrpc": "2.0", "id": 1, "method": method, "params": params}, timeout=15)
    return resp.json()


def _get_block_number(api_key: str) -> int:
    res = _rpc("eth_blockNumber", [], api_key)
    return int(res["result"], 16)


def _get_block_timestamp(block_hex: str, api_key: str) -> int:
    res = _rpc("eth_getBlockByNumber", [block_hex, False], api_key)
    return int(res["result"]["timestamp"], 16)


def _interp_ts(block_num: int, anchor_block: int, anchor_ts: int) -> int:
    """Approximate timestamp via linear interpolation (12s avg block time).
    Drift over a 7-day window is ~minutes — fine for 1h/4h price-after-event checks."""
    return anchor_ts - (anchor_block - block_num) * 12


def _decode_int256(hex32: str) -> int:
    val = int(hex32, 16)
    if val >= (1 << 255):
        val -= (1 << 256)
    return val


# ── Swap event fetching ───────────────────────────────────────────────────────

def fetch_large_swaps(min_usd: float, days: int, api_key: str) -> list[dict]:
    current_block = _get_block_number(api_key)
    anchor_ts     = _get_block_timestamp(hex(current_block), api_key)
    start_block   = current_block - days * BLOCKS_PER_DAY
    print(f"[WHALE-BT] Fetching Uniswap V3 swaps >${min_usd/1e3:.0f}K "
          f"| blocks {start_block}–{current_block} (~{days}d)")

    min_usdc_raw = int(min_usd * 1e6)
    all_swaps = []
    chunks = list(range(start_block, current_block, CHUNK_BLOCKS))
    print(f"[WHALE-BT] {len(chunks)} block chunks ({CHUNK_BLOCKS} blocks each) — "
          f"~{len(chunks) * RPC_DELAY:.0f}s of RPC time")

    progress_step = max(50, len(chunks) // 20)
    err_count = 0

    for i, from_blk in enumerate(chunks):
        to_blk = min(from_blk + CHUNK_BLOCKS - 1, current_block)
        try:
            res = _rpc("eth_getLogs", [{
                "address": POOL,
                "topics":  [SWAP_TOPIC],
                "fromBlock": hex(from_blk),
                "toBlock":   hex(to_blk),
            }], api_key)
            logs = res.get("result", [])
            if not isinstance(logs, list):
                err_count += 1
                if err_count <= 3:
                    print(f"  chunk {i+1}/{len(chunks)}: RPC error — {res.get('error', 'unknown')}")
                time.sleep(0.5)
                continue
        except Exception as e:
            err_count += 1
            if err_count <= 3:
                print(f"  chunk {i+1}/{len(chunks)}: request error — {e}")
            time.sleep(0.5)
            continue

        for log in logs:
            data = log.get("data", "0x")[2:]
            if len(data) < 128:
                continue
            amount0 = _decode_int256(data[0:64])
            amount1 = _decode_int256(data[64:128])
            usdc_notional = abs(amount0)
            if usdc_notional < min_usdc_raw:
                continue

            block_num = int(log["blockNumber"], 16)
            ts = _interp_ts(block_num, current_block, anchor_ts)
            all_swaps.append({
                "timestamp": ts,
                "amount0":   amount0,
                "amount1":   amount1,
                "amountUSD": usdc_notional / 1e6,
            })

        if (i + 1) % progress_step == 0 or i == len(chunks) - 1:
            print(f"  chunk {i+1}/{len(chunks)}: {len(all_swaps)} large swaps so far "
                  f"(errors={err_count})")
        time.sleep(RPC_DELAY)

    all_swaps.sort(key=lambda x: x["timestamp"])
    print(f"[WHALE-BT] Got {len(all_swaps)} large swaps (>{min_usd/1e3:.0f}K USDC) "
          f"| {err_count} RPC errors")
    return all_swaps


def parse_direction(swap: dict) -> str:
    """amount1 < 0 → WETH leaving pool → user bought ETH → BUY."""
    return "BUY" if swap["amount1"] < 0 else "SELL"


# ── Bybit price lookup ────────────────────────────────────────────────────────

_ohlcv_cache: dict = {}

def _fetch_ohlcv_around(ts: int) -> list:
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
    candles = _fetch_ohlcv_around(ts)
    ts_ms = ts * 1000
    for c in reversed(candles):
        if c[0] <= ts_ms:
            return float(c[4])
    return None


def get_price_after(ts: int, hours: int) -> float | None:
    target_ts = ts + hours * 3600
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
    buy_count = sell_count = 0

    for swap in swaps:
        ts        = int(swap["timestamp"])
        direction = parse_direction(swap)
        usd       = float(swap["amountUSD"])

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
                    f"({move_pct:+.2f}%) | {'OK' if win else '--'}"
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

        if wr >= 60:
            verdict = "Strong alpha — worth building"
        elif wr >= 53:
            verdict = "Weak edge — marginal, needs more data"
        elif wr <= 45:
            verdict = "Anti-predictive — consider inverse signal"
        else:
            verdict = "No edge — random"
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
    parser.add_argument("--days",    type=int,   default=3,       help="Days to look back (default 3 — Alchemy free tier ≈ 5 min per day)")
    parser.add_argument("--min-usd", type=float, default=250_000, help="Min swap USD (default 250000 — relaxed because 0.05%% pool has many medium swaps)")
    parser.add_argument("--verbose", action="store_true",         help="Print each trade")
    args = parser.parse_args()

    api_key = os.getenv("ALCHEMY_API_KEY", "")
    if not api_key:
        print("ERROR: ALCHEMY_API_KEY not set in .env")
        sys.exit(1)

    print(f"[WHALE-BT] Loading Bybit markets...")
    try:
        _ex.load_markets()
    except Exception as e:
        print(f"Failed to load markets: {e}")
        sys.exit(1)

    swaps = fetch_large_swaps(min_usd=args.min_usd, days=args.days, api_key=api_key)
    if not swaps:
        print("[WHALE-BT] No swaps found. Check ALCHEMY_API_KEY or increase --days")
        sys.exit(1)

    print(f"[WHALE-BT] Analyzing {len(swaps)} swaps vs Bybit price...")
    stats = analyze(swaps, verbose=args.verbose)
    print_report(stats, min_usd=args.min_usd, days=args.days)
