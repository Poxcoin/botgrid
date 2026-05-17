"""
backtest_pairs_trading.py — BTC/ETH Statistical Arbitrage (Pairs Trading)

Strategy: z-score of BTC/ETH price ratio mean-reversion
  Long ETH + Short BTC when z-score > +ENTRY_Z  (ETH cheap vs BTC)
  Long BTC + Short ETH when z-score < -ENTRY_Z  (BTC cheap vs ETH)
  Exit: z-score crosses 0  OR  z-score > SL_Z (stop loss)

Data: Bybit daily OHLCV (free, no keys)
Leverage: 2x per leg (4x total notional), capital split 50/50
"""

import requests
import time
import json
import os
import math
from datetime import datetime, timezone

CAPITAL_USDT  = 10_000
LEVERAGE      = 2             # per leg
TAKER_FEE     = 0.00055       # 0.055% per leg
WINDOW        = 30            # rolling z-score window (days)
ENTRY_Z       = 2.0           # enter when |z| > 2.0
EXIT_Z        = 0.3           # exit when |z| < 0.3 (near mean)
SL_Z          = 3.5           # stop loss — spread diverging, cut loss
MAX_HOLD_DAYS = 20            # force exit if held too long
INTERVAL      = "D"           # candle timeframe (Bybit: D=daily, 60=1h)

CACHE_FILE = "pairs_cache.json"
BASE_URL   = "https://api.bybit.com"
SYMBOLS    = ["BTCUSDT", "ETHUSDT"]

# ── Sweep parameters ──────────────────────────────────────────────────────────
SWEEP_ENTRY_Z = [1.5, 2.0, 2.5, 3.0]
SWEEP_WINDOW  = [20, 30, 45]
# ─────────────────────────────────────────────────────────────────────────────


def fetch_ohlcv(symbol: str, interval: str = "1d", limit: int = 1000) -> list:
    """Returns list of [ts_ms, open, high, low, close, volume]."""
    all_candles = []
    end_time    = None

    for _ in range(5):  # 5 × 1000 = 5000 candles ≈ 13.7 years of daily
        params = {
            "category": "linear",
            "symbol":   symbol,
            "interval": interval,
            "limit":    limit,
        }
        if end_time:
            params["end"] = end_time

        try:
            r = requests.get(f"{BASE_URL}/v5/market/kline", params=params, timeout=15)
            rows = r.json().get("result", {}).get("list", [])
            if not rows:
                break
            all_candles.extend(rows)
            end_time = int(rows[-1][0]) - 1
            time.sleep(0.15)
        except Exception as e:
            print(f"  ⚠️  kline error {symbol}: {e}")
            break

    # rows: [ts_ms_str, open, high, low, close, volume, turnover]
    parsed = [
        {"ts": int(r[0]) // 1000, "close": float(r[4])}
        for r in all_candles
    ]
    parsed.sort(key=lambda x: x["ts"])
    return parsed


def load_or_fetch_pairs() -> dict:
    if os.path.exists(CACHE_FILE):
        with open(CACHE_FILE) as f:
            cached = json.load(f)
        if all(sym in cached for sym in SYMBOLS):
            ages = {sym: len(cached[sym]) for sym in SYMBOLS}
            print(f"  ✓ Cache hit ({CACHE_FILE}): {ages}")
            return cached

    print("  ↓ Downloading OHLCV data…")
    all_data = {}
    for sym in SYMBOLS:
        print(f"    {sym}…", end="", flush=True)
        data = fetch_ohlcv(sym, INTERVAL)
        all_data[sym] = data
        print(f" {len(data)} candles")

    with open(CACHE_FILE, "w") as f:
        json.dump(all_data, f)
    print(f"  ✓ Saved to {CACHE_FILE}\n")
    return all_data


def _rolling_zscore(series: list, window: int) -> list:
    """Returns z-scores aligned with series (NaN as None for first window-1 entries)."""
    zscores = []
    for i in range(len(series)):
        if i < window - 1:
            zscores.append(None)
            continue
        window_vals = series[i - window + 1 : i + 1]
        mean = sum(window_vals) / window
        var  = sum((x - mean) ** 2 for x in window_vals) / window
        std  = math.sqrt(var) if var > 0 else 1e-10
        zscores.append((series[i] - mean) / std)
    return zscores


def align_series(btc_data: list, eth_data: list) -> tuple:
    """Align two time series to same timestamps."""
    btc_map = {r["ts"]: r["close"] for r in btc_data}
    eth_map = {r["ts"]: r["close"] for r in eth_data}
    common  = sorted(set(btc_map) & set(eth_map))
    btc_closes = [btc_map[ts] for ts in common]
    eth_closes = [eth_map[ts] for ts in common]
    return common, btc_closes, eth_closes


def run_pairs_backtest(
    common_ts: list,
    btc_prices: list,
    eth_prices: list,
    capital: float,
    entry_z: float,
    exit_z: float,
    sl_z: float,
    window: int,
    max_hold: int,
) -> dict:
    # Ratio: ETH_price / BTC_price
    ratio = [e / b for b, e in zip(btc_prices, eth_prices)]
    zscores = _rolling_zscore(ratio, window)

    equity      = capital
    in_position = False
    direction   = None   # "long_eth" or "long_btc"
    entry_ts    = None
    entry_btc   = None
    entry_eth   = None
    entry_z_val = None

    trades      = []
    equity_curve = []
    total_fees  = 0.0
    n_wins = n_losses = 0

    half = capital / 2  # allocate 50% to each leg

    for i in range(len(common_ts)):
        z  = zscores[i]
        ts = common_ts[i]
        btc_p = btc_prices[i]
        eth_p = eth_prices[i]

        if z is None:
            equity_curve.append({"ts": ts, "equity": equity})
            continue

        if not in_position:
            if z > entry_z:
                # ETH expensive vs BTC → Short ETH, Long BTC
                direction   = "long_btc"
                entry_ts    = ts
                entry_btc   = btc_p
                entry_eth   = eth_p
                entry_z_val = z
                fee_cost    = half * LEVERAGE * 2 * TAKER_FEE  # both legs
                equity     -= fee_cost
                total_fees += fee_cost
                in_position = True
            elif z < -entry_z:
                # ETH cheap vs BTC → Long ETH, Short BTC
                direction   = "long_eth"
                entry_ts    = ts
                entry_btc   = btc_p
                entry_eth   = eth_p
                entry_z_val = z
                fee_cost    = half * LEVERAGE * 2 * TAKER_FEE
                equity     -= fee_cost
                total_fees += fee_cost
                in_position = True
        else:
            days_held = (ts - entry_ts) / 86400

            # Calculate unrealised P&L
            # Each leg: size = half * leverage / entry_price → pnl per price unit
            if direction == "long_btc":
                # Long BTC: +pct BTC, Short ETH: -pct ETH
                btc_ret = (btc_p - entry_btc) / entry_btc
                eth_ret = (eth_p - entry_eth) / entry_eth
                upnl    = half * LEVERAGE * (btc_ret - eth_ret)
            else:
                # Long ETH: +pct ETH, Short BTC: -pct BTC
                btc_ret = (btc_p - entry_btc) / entry_btc
                eth_ret = (eth_p - entry_eth) / entry_eth
                upnl    = half * LEVERAGE * (eth_ret - btc_ret)

            should_exit = (
                abs(z) < exit_z
                or abs(z) > sl_z
                or days_held >= max_hold
            )

            if should_exit:
                fee_cost    = (equity + upnl) * 2 * TAKER_FEE
                realized    = upnl - fee_cost
                equity     += realized
                total_fees += fee_cost
                exit_reason = (
                    "TP" if abs(z) < exit_z else
                    "SL" if abs(z) > sl_z else
                    "TIMEOUT"
                )
                trades.append({
                    "entry_dt": datetime.fromtimestamp(entry_ts).strftime("%Y-%m-%d"),
                    "exit_dt":  datetime.fromtimestamp(ts).strftime("%Y-%m-%d"),
                    "dir":      direction,
                    "days":     round(days_held, 1),
                    "entry_z":  round(entry_z_val, 2),
                    "exit_z":   round(z, 2),
                    "pnl":      round(realized, 2),
                    "reason":   exit_reason,
                })
                if realized > 0:
                    n_wins += 1
                else:
                    n_losses += 1
                in_position = False

        equity_curve.append({"ts": ts, "equity": equity})

    if in_position:
        # Close at last price
        fee_cost = equity * 2 * TAKER_FEE
        equity  -= fee_cost
        total_fees += fee_cost

    n_months    = len(common_ts) / 30
    total_ret   = (equity - capital) / capital * 100
    monthly     = total_ret / n_months if n_months > 0 else 0
    n_trades    = n_wins + n_losses
    win_rate    = n_wins / n_trades * 100 if n_trades > 0 else 0

    # Sharpe (monthly returns)
    monthly_eq  = {}
    for row in equity_curve:
        m = datetime.fromtimestamp(row["ts"]).strftime("%Y-%m")
        monthly_eq[m] = row["equity"]
    months_sorted = sorted(monthly_eq.keys())
    monthly_rets  = []
    for j in range(1, len(months_sorted)):
        prev_e = monthly_eq[months_sorted[j-1]]
        curr_e = monthly_eq[months_sorted[j]]
        if prev_e > 0:
            monthly_rets.append((curr_e - prev_e) / prev_e * 100)

    if len(monthly_rets) > 1:
        mean_r  = sum(monthly_rets) / len(monthly_rets)
        std_r   = math.sqrt(sum((r - mean_r)**2 for r in monthly_rets) / len(monthly_rets))
        sharpe  = (mean_r / std_r * math.sqrt(12)) if std_r > 0 else 0
    else:
        sharpe = 0

    # Max drawdown
    peak   = capital
    max_dd = 0.0
    for row in equity_curve:
        e = row["equity"]
        if e > peak:
            peak = e
        dd = (peak - e) / peak * 100
        if dd > max_dd:
            max_dd = dd

    return {
        "entry_z":          entry_z,
        "window":           window,
        "final_equity":     round(equity, 2),
        "total_return_pct": round(total_ret, 2),
        "monthly_avg_pct":  round(monthly, 3),
        "n_months":         round(n_months, 1),
        "total_fees":       round(total_fees, 2),
        "n_trades":         n_trades,
        "n_wins":           n_wins,
        "win_rate":         round(win_rate, 1),
        "max_drawdown_pct": round(max_dd, 2),
        "sharpe":           round(sharpe, 2),
        "trades":           trades[-30:],
        "equity_curve":     equity_curve,
        "monthly_eq":       monthly_eq,
    }


def sweep(common_ts, btc_prices, eth_prices, capital):
    print("\n" + "=" * 88)
    print(f"  PAIRS TRADING SWEEP  BTC/ETH  |  Capital ${capital:,}  x{LEVERAGE}/leg")
    print(f"  SL_Z={SL_Z}  MaxHold={MAX_HOLD_DAYS}d  TakerFee={TAKER_FEE*100:.3f}%")
    print("=" * 88)
    print(f"  {'EntZ':>5}  {'Win':>6}  {'Return':>8}  {'Mon%':>6}  {'Sharpe':>7}  "
          f"{'MaxDD':>6}  {'Trades':>7}  {'W30d':>5}")
    print(f"  {'─'*80}")

    best_row = None
    all_rows = []

    for window in SWEEP_WINDOW:
        for entry_z in SWEEP_ENTRY_Z:
            res = run_pairs_backtest(
                common_ts, btc_prices, eth_prices, capital,
                entry_z=entry_z, exit_z=EXIT_Z, sl_z=SL_Z,
                window=window, max_hold=MAX_HOLD_DAYS,
            )
            all_rows.append({"window": window, **res})

            # Rolling 30-day win rate (last 30 trades)
            recent   = res["trades"][-30:]
            w30      = sum(1 for t in recent if t["pnl"] > 0)
            w30_pct  = w30 / len(recent) * 100 if recent else 0

            label = f"W{window}"
            print(
                f"  {label:<5} {entry_z:.1f}  {res['win_rate']:>5.1f}%  "
                f"{res['total_return_pct']:>+7.1f}%  {res['monthly_avg_pct']:>+5.2f}%  "
                f"{res['sharpe']:>6.2f}  {res['max_drawdown_pct']:>5.1f}%  "
                f"{res['n_trades']:>7}  {w30_pct:>4.0f}%"
            )

        print()

    best = max(all_rows, key=lambda r: r["sharpe"])
    print(f"  ★ Best Sharpe: W={best['window']} Z={best['entry_z']:.1f}  "
          f"Sharpe={best['sharpe']:.2f}  monthly={best['monthly_avg_pct']:+.2f}%  "
          f"WR={best['win_rate']:.1f}%  MaxDD={best['max_drawdown_pct']:.1f}%")

    return all_rows, best


def print_monthly_detail(res: dict, window: int, entry_z: float, capital: float):
    monthly_eq = res["monthly_eq"]
    months     = sorted(monthly_eq.keys())
    if len(months) < 2:
        return

    print(f"\n  Monthly breakdown — W={window}, EntryZ={entry_z:.1f}")
    print(f"  {'Month':<10} {'Equity':>12} {'Δ':>10} {'%':>7}")
    print(f"  {'─'*45}")
    prev = None
    for m in months:
        eq = monthly_eq[m]
        if prev is not None:
            delta = eq - prev
            pct   = delta / prev * 100
            sign  = "+" if delta >= 0 else ""
            print(f"  {m:<10} ${eq:>11,.2f} {sign}{delta:>8.2f} {sign}{pct:>5.2f}%")
        prev = eq


def print_recent_trades(res: dict, n: int = 20):
    trades = res["trades"][-n:]
    if not trades:
        return
    print(f"\n  Recent trades ({len(trades)}):")
    print(f"  {'Date':>10}  {'Dir':>8}  {'Days':>5}  {'EnZ':>5}  {'ExZ':>5}  {'PnL':>8}  {'Why'}")
    print(f"  {'─'*65}")
    for t in trades:
        sign = "+" if t["pnl"] >= 0 else ""
        print(f"  {t['entry_dt']}  {t['dir']:>8}  {t['days']:>5.1f}  "
              f"{t['entry_z']:>+4.2f}  {t['exit_z']:>+4.2f}  "
              f"{sign}{t['pnl']:>7.2f}  {t['reason']}")


def main():
    print("=" * 65)
    print("  PAIRS TRADING — BTC/ETH Z-SCORE BACKTEST")
    print(f"  Capital: ${CAPITAL_USDT:,}  |  Leverage: {LEVERAGE}x per leg")
    print(f"  Entry Z: {ENTRY_Z}  |  Exit Z: {EXIT_Z}  |  SL Z: {SL_Z}")
    print(f"  Window: {WINDOW}d  |  MaxHold: {MAX_HOLD_DAYS}d")
    print(f"  Taker fee: {TAKER_FEE*100:.3f}%")
    print("=" * 65 + "\n")

    all_data = load_or_fetch_pairs()

    btc_raw = all_data["BTCUSDT"]
    eth_raw = all_data["ETHUSDT"]

    common_ts, btc_prices, eth_prices = align_series(btc_raw, eth_raw)
    start = datetime.fromtimestamp(common_ts[0]).strftime("%Y-%m-%d")
    end   = datetime.fromtimestamp(common_ts[-1]).strftime("%Y-%m-%d")
    print(f"  Aligned: {len(common_ts)} days  {start} → {end}")

    all_rows, best = sweep(common_ts, btc_prices, eth_prices, CAPITAL_USDT)

    # Detailed view of best config
    print_monthly_detail(best, best["window"], best["entry_z"], CAPITAL_USDT)
    print_recent_trades(best, n=25)

    # Save
    save = {
        "run_at":   datetime.now().isoformat(),
        "params":   {
            "capital": CAPITAL_USDT, "leverage": LEVERAGE,
            "taker_fee": TAKER_FEE, "sl_z": SL_Z,
            "exit_z": EXIT_Z, "max_hold_days": MAX_HOLD_DAYS,
        },
        "best": {
            k: v for k, v in best.items()
            if k not in ("equity_curve", "trades", "monthly_eq")
        },
        "all_configs": [
            {k: v for k, v in r.items() if k not in ("equity_curve", "trades", "monthly_eq")}
            for r in all_rows
        ],
    }
    with open("backtest_pairs_results.json", "w") as f:
        json.dump(save, f, indent=2)
    print(f"\n  Saved: backtest_pairs_results.json")


if __name__ == "__main__":
    main()
