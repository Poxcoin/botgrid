"""
backtest_funding_arb.py — Delta-Neutral Funding Rate Arbitrage Backtest

Strategy:
  Long spot BTC/ETH/SOL + Short equivalent perp → collect funding
  Entry: funding >= ENTRY_THRESHOLD
  Exit:  funding < EXIT_THRESHOLD or flipped negative

Data: Bybit public API (free, no keys needed)
Cache: funding_cache.json — re-uses downloaded data across runs
"""

import requests
import time
import json
import os
from datetime import datetime, timezone

SYMBOLS        = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT"]
CAPITAL_USDT   = 10_000
ALLOC_PER_PAIR = 0.25            # 25% per pair → $2,500
TAKER_FEE      = 0.00055         # 0.055% taker (entry + exit, 2 legs each)
BORROW_RATE_8H = 0.0             # own capital, no borrow cost
MIN_DAYS_IN    = 1               # minimum 1 day in position

CACHE_FILE = "funding_cache.json"
BASE_URL   = "https://api.bybit.com"

# ── Parameter sweep ───────────────────────────────────────────────────────────
SWEEP_ENTRY = [0.0001, 0.00015, 0.0002, 0.00025, 0.0003, 0.0004, 0.0005]
# Exit threshold = entry * EXIT_RATIO (e.g. 0.3 → exit when funding falls to 30% of entry)
EXIT_RATIO  = 0.3
# ─────────────────────────────────────────────────────────────────────────────


def fetch_funding_history(symbol: str, limit: int = 200) -> list:
    all_data = []
    end_time = None

    for _ in range(18):  # 18 requests × 200 = 3600 points ≈ 3 years
        params = {"category": "linear", "symbol": symbol, "limit": limit}
        if end_time:
            params["endTime"] = end_time

        try:
            r = requests.get(
                f"{BASE_URL}/v5/market/funding/history", params=params, timeout=15
            )
            data = r.json()
            rows = data.get("result", {}).get("list", [])
            if not rows:
                break
            all_data.extend(rows)
            end_time = int(rows[-1]["fundingRateTimestamp"]) - 1
            time.sleep(0.15)
        except Exception as e:
            print(f"    fetch error {symbol}: {e}")
            break

    parsed = [
        {"ts": int(row["fundingRateTimestamp"]) // 1000, "rate": float(row["fundingRate"])}
        for row in all_data
    ]
    parsed.sort(key=lambda x: x["ts"])
    return parsed


def load_or_fetch_all() -> dict:
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE) as f:
            cached = json.load(f)
        # Validate all symbols present
        if all(sym in cached for sym in SYMBOLS):
            ages = {sym: len(cached[sym]) for sym in SYMBOLS}
            print(f"   Cache hit ({CACHE_FILE}): {ages}")
            return cached

    print("  ↓ Downloading funding history (this takes ~1 min)…")
    all_data = {}
    for sym in SYMBOLS:
        print(f"    {sym}…", end="", flush=True)
        data = fetch_funding_history(sym)
        all_data[sym] = data
        print(f" {len(data)} records")

    with open(CACHE_FILE, "w") as f:
        json.dump(all_data, f)
    print(f"   Saved to {CACHE_FILE}\n")
    return all_data


def run_backtest(symbol: str, funding_data: list, capital: float,
                 entry_thr: float, exit_thr: float) -> dict:
    if not funding_data:
        return {}

    equity         = capital
    in_position    = False
    entry_ts       = None

    total_funding  = 0.0
    total_fees     = 0.0
    equity_curve   = []
    n_entries      = 0
    n_exits        = 0
    days_in_trade  = 0.0

    for row in funding_data:
        rate = row["rate"]
        ts   = row["ts"]
        dt   = datetime.fromtimestamp(ts, tz=timezone.utc)

        if not in_position:
            if rate >= entry_thr:
                cost        = equity * 2 * TAKER_FEE
                equity     -= cost
                total_fees += cost
                in_position = True
                entry_ts    = ts
                n_entries  += 1
        else:
            days_held = (ts - entry_ts) / 86400

            # Collect funding
            earned         = equity * rate
            equity        += earned
            total_funding += earned
            days_in_trade += 1.0 / 3  # 3 events per day

            should_exit = (
                rate < exit_thr
                or rate < 0
                or (days_held >= MIN_DAYS_IN and rate < entry_thr * 0.5)
            )

            if should_exit:
                cost        = equity * 2 * TAKER_FEE
                equity     -= cost
                total_fees += cost
                in_position = False
                n_exits    += 1

        equity_curve.append({"ts": ts, "equity": equity, "rate": rate})

    if in_position:
        cost        = equity * 2 * TAKER_FEE
        equity     -= cost
        total_fees += cost

    n_months = len(funding_data) / (3 * 30)
    total_ret = (equity - capital) / capital * 100
    monthly   = total_ret / n_months if n_months > 0 else 0

    # Max drawdown
    peak = capital
    max_dd = 0.0
    for row in equity_curve:
        e = row["equity"]
        if e > peak:
            peak = e
        dd = (peak - e) / peak * 100
        if dd > max_dd:
            max_dd = dd

    return {
        "symbol":           symbol,
        "entry_thr":        entry_thr,
        "final_equity":     round(equity, 2),
        "total_return_pct": round(total_ret, 2),
        "monthly_avg_pct":  round(monthly, 4),
        "n_months":         round(n_months, 1),
        "total_funding":    round(total_funding, 2),
        "total_fees":       round(total_fees, 2),
        "n_entries":        n_entries,
        "n_exits":          n_exits,
        "max_drawdown_pct": round(max_dd, 2),
        "days_in_trade":    round(days_in_trade, 0),
        "equity_curve":     equity_curve,
    }


def sweep(all_funding: dict, capital: float):
    alloc = capital * ALLOC_PER_PAIR

    print("\n" + "=" * 78)
    print(f"  PARAMETER SWEEP  |  Capital ${capital:,}  |  {len(SYMBOLS)} pairs × {alloc:,.0f}$")
    print(f"  Borrow cost: {BORROW_RATE_8H*100:.4f}%/8h  |  Taker fee: {TAKER_FEE*100:.3f}%")
    print("=" * 78)
    print(f"  {'Entry':>8}  {'Exit':>7}  {'Return':>8}  {'Mon%':>6}  {'Funding':>9}  {'Fees':>8}  {'MaxDD':>6}  {'Trades':>7}")
    print(f"  {'─'*75}")

    best_monthly = -999
    best_row = None
    sweep_results = []

    for entry_thr in SWEEP_ENTRY:
        exit_thr = entry_thr * EXIT_RATIO

        port_equity   = 0.0
        port_funding  = 0.0
        port_fees     = 0.0
        total_entries = 0
        max_dd_port   = 0.0

        for sym in SYMBOLS:
            data = all_funding[sym]
            res  = run_backtest(sym, data, alloc, entry_thr, exit_thr)
            if not res:
                continue
            port_equity  += res["final_equity"]
            port_funding += res["total_funding"]
            port_fees    += res["total_fees"]
            total_entries += res["n_entries"]
            if res["max_drawdown_pct"] > max_dd_port:
                max_dd_port = res["max_drawdown_pct"]

        n_months   = len(all_funding[SYMBOLS[0]]) / (3 * 30)
        total_ret  = (port_equity - capital) / capital * 100
        monthly    = total_ret / n_months if n_months > 0 else 0

        row = {
            "entry_pct": entry_thr * 100,
            "exit_pct":  exit_thr  * 100,
            "total_ret": total_ret,
            "monthly":   monthly,
            "funding":   port_funding,
            "fees":      port_fees,
            "max_dd":    max_dd_port,
            "trades":    total_entries,
        }
        sweep_results.append(row)

        marker = " ◄" if monthly == max(r.get("monthly", -999) for r in sweep_results) else ""
        print(
            f"  {entry_thr*100:>7.3f}%  {exit_thr*100:>6.4f}%  "
            f"{total_ret:>+7.2f}%  {monthly:>+5.3f}%  "
            f"${port_funding:>8,.0f}  ${port_fees:>7,.0f}  "
            f"{max_dd_port:>5.2f}%  {total_entries:>7}{marker}"
        )

    # Best row
    best = max(sweep_results, key=lambda r: r["monthly"])
    print(f"\n   Best: entry={best['entry_pct']:.3f}%  monthly={best['monthly']:+.3f}%  "
          f"return={best['total_ret']:+.2f}%  funding=${best['funding']:,.0f}  fees=${best['fees']:,.0f}")

    return sweep_results, best


def print_monthly_detail(all_funding: dict, entry_thr: float, capital: float):
    exit_thr = entry_thr * EXIT_RATIO
    alloc    = capital * ALLOC_PER_PAIR

    # For each symbol: last equity value per month
    monthly_by_sym: dict = {}
    for sym in SYMBOLS:
        data = all_funding[sym]
        res  = run_backtest(sym, data, alloc, entry_thr, exit_thr)
        sym_m: dict = {}
        for row in res.get("equity_curve", []):
            m = datetime.fromtimestamp(row["ts"], tz=timezone.utc).strftime("%Y-%m")
            sym_m[m] = row["equity"]   # overwrite → last point of month wins
        monthly_by_sym[sym] = sym_m

    all_months = sorted({m for sm in monthly_by_sym.values() for m in sm})
    if len(all_months) < 2:
        return

    # Portfolio = sum of each symbol's end-of-month equity
    monthly_port = {
        m: sum(monthly_by_sym[sym].get(m, 0) for sym in SYMBOLS)
        for m in all_months
    }

    print(f"\n  Monthly breakdown — entry={entry_thr*100:.3f}%/8h")
    print(f"  {'Month':<10} {'Portfolio':>12} {'Δ':>10} {'%':>7}")
    print(f"  {'─'*45}")
    prev = None
    for m in all_months:
        eq = monthly_port[m]
        if prev is not None:
            delta = eq - prev
            pct   = delta / prev * 100
            sign  = "+" if delta >= 0 else ""
            print(f"  {m:<10} ${eq:>11,.2f} {sign}{delta:>8.2f} {sign}{pct:>5.2f}%")
        prev = eq


def main():
    print("=" * 65)
    print("  DELTA-NEUTRAL FUNDING RATE ARBITRAGE — BACKTEST v2")
    print(f"  Capital: ${CAPITAL_USDT:,}  |  {len(SYMBOLS)} pairs × {CAPITAL_USDT*ALLOC_PER_PAIR:.0f}$")
    print(f"  Taker fee: {TAKER_FEE*100:.3f}%  |  Borrow: {BORROW_RATE_8H*100:.4f}%/8h")
    print("=" * 65 + "\n")

    all_funding = load_or_fetch_all()

    # Show date range
    for sym in SYMBOLS:
        d = all_funding[sym]
        if d:
            start = datetime.fromtimestamp(d[0]["ts"]).strftime("%Y-%m-%d")
            end   = datetime.fromtimestamp(d[-1]["ts"]).strftime("%Y-%m-%d")
            print(f"  {sym}: {len(d)} records  {start} → {end}")

    sweep_results, best = sweep(all_funding, CAPITAL_USDT)

    # Detailed monthly breakdown for the best threshold
    print_monthly_detail(all_funding, best["entry_pct"] / 100, CAPITAL_USDT)

    # Save results
    save = {
        "run_at": datetime.now().isoformat(),
        "params": {
            "capital": CAPITAL_USDT,
            "alloc_per_pair": ALLOC_PER_PAIR,
            "taker_fee": TAKER_FEE,
            "borrow_rate_8h": BORROW_RATE_8H,
        },
        "sweep": sweep_results,
        "best_entry_pct": best["entry_pct"],
    }
    with open("backtest_funding_arb_sweep.json", "w") as f:
        json.dump(save, f, indent=2)
    print(f"\n  Saved: backtest_funding_arb_sweep.json")


if __name__ == "__main__":
    main()
