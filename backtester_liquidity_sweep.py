#!/usr/bin/env python3
"""
Liquidity Sweep Reversal Backtester
Strategy: detect stop-hunt sweeps above swing highs / below swing lows,
enter on reversal confirmation.
"""

import ccxt
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import time

# ─── Config ─────────────────────────────────────────────────────────────────
SYMBOLS        = ["ETH/USDT:USDT", "SOL/USDT:USDT"]
TIMEFRAME      = "4h"
DAYS_HISTORY   = 90
SWING_LOOKBACK = 3          # candles each side for pivot detection
SWING_MEMORY   = 20         # keep last N swing points
SWEEP_MIN_PCT  = 0.05 / 100 # minimum sweep above/below level
SWEEP_MAX_PCT  = 0.50 / 100 # maximum sweep (filter noise vs real sweeps)
REVERSAL_BARS  = 3          # candles to confirm reversal
SL_BUFFER_PCT  = 0.30 / 100 # SL = 0.3% beyond swept level
TP_MIN_PCT     = 1.50 / 100 # minimum TP = 1.5% from entry
TP_MULT        = 1.5        # TP = 1.5 × sweep distance (take larger)
MAX_HOLD       = 24         # max candles to hold

LEVERAGE   = 5
SIZE_PCT   = 0.25    # 25% per trade — best strategy gets more capital
TAKER_FEE  = 0.00055
FEE_COST   = TAKER_FEE * 2 * LEVERAGE  # 0.55% round-trip at 5x

# ─── Data Download ───────────────────────────────────────────────────────────
def fetch_ohlcv(symbol: str) -> pd.DataFrame:
    exchange = ccxt.bybit({"options": {"defaultType": "linear"}})
    since = exchange.parse8601(
        (datetime.utcnow() - timedelta(days=DAYS_HISTORY + 5)).strftime("%Y-%m-%dT00:00:00Z")
    )
    all_candles = []
    limit = 200
    while True:
        candles = exchange.fetch_ohlcv(symbol, TIMEFRAME, since=since, limit=limit)
        if not candles:
            break
        all_candles.extend(candles)
        if len(candles) < limit:
            break
        since = candles[-1][0] + 1
        time.sleep(0.3)
    df = pd.DataFrame(all_candles, columns=["ts", "open", "high", "low", "close", "volume"])
    df["ts"] = pd.to_datetime(df["ts"], unit="ms")
    df = df.drop_duplicates("ts").sort_values("ts").reset_index(drop=True)
    cutoff = datetime.utcnow() - timedelta(days=DAYS_HISTORY)
    df = df[df["ts"] >= cutoff].reset_index(drop=True)
    return df

# ─── Pivot Detection ─────────────────────────────────────────────────────────
def find_swings(df: pd.DataFrame, n: int = SWING_LOOKBACK):
    highs, lows = [], []
    for i in range(n, len(df) - n):
        h = df["high"].iloc[i]
        if h > df["high"].iloc[i-n:i].max() and h > df["high"].iloc[i+1:i+n+1].max():
            highs.append((i, df["ts"].iloc[i], h))
        l = df["low"].iloc[i]
        if l < df["low"].iloc[i-n:i].min() and l < df["low"].iloc[i+1:i+n+1].min():
            lows.append((i, df["ts"].iloc[i], l))
    return highs, lows

# ─── Backtest Core ───────────────────────────────────────────────────────────
def backtest(symbol: str, df: pd.DataFrame):
    swing_highs, swing_lows = find_swings(df)

    # Index by candle position for fast lookup
    sh_by_idx = {s[0]: s[2] for s in swing_highs}
    sl_by_idx = {s[0]: s[2] for s in swing_lows}

    trades = []
    active_trade = None

    # Build rolling window of known swing levels (only use levels already formed)
    known_sh = []  # list of (pivot_idx, level)
    known_sl = []

    sh_ptr = 0
    sl_ptr = 0

    for i in range(SWING_LOOKBACK + SWING_LOOKBACK + 1, len(df)):
        # Update known swing lists with pivots whose right side is fully confirmed by bar i
        while sh_ptr < len(swing_highs) and swing_highs[sh_ptr][0] + SWING_LOOKBACK < i:
            known_sh.append(swing_highs[sh_ptr])
            known_sh = known_sh[-SWING_MEMORY:]
            sh_ptr += 1
        while sl_ptr < len(swing_lows) and swing_lows[sl_ptr][0] + SWING_LOOKBACK < i:
            known_sl.append(swing_lows[sl_ptr])
            known_sl = known_sl[-SWING_MEMORY:]
            sl_ptr += 1

        if active_trade:
            # Manage open trade
            row = df.iloc[i]
            t = active_trade
            pnl_pct = None

            if t["dir"] == "SHORT":
                if row["low"] <= t["tp"]:
                    pnl_pct = (t["entry"] - t["tp"]) / t["entry"]
                    result = "TP"
                elif row["high"] >= t["sl"]:
                    pnl_pct = (t["entry"] - t["sl"]) / t["entry"]
                    result = "SL"
            else:  # LONG
                if row["high"] >= t["tp"]:
                    pnl_pct = (t["tp"] - t["entry"]) / t["entry"]
                    result = "TP"
                elif row["low"] <= t["sl"]:
                    pnl_pct = (t["sl"] - t["entry"]) / t["entry"]
                    result = "SL"

            hold = i - t["entry_idx"]
            if pnl_pct is not None:
                net = (pnl_pct * LEVERAGE - FEE_COST) * 100
                t.update({"result": result, "pnl_pct": net, "hold": hold,
                          "exit_ts": row["ts"]})
                trades.append(t)
                active_trade = None
            elif hold >= MAX_HOLD:
                close_price = row["close"]
                if t["dir"] == "SHORT":
                    pnl_pct = (t["entry"] - close_price) / t["entry"]
                else:
                    pnl_pct = (close_price - t["entry"]) / t["entry"]
                net = (pnl_pct * LEVERAGE - FEE_COST) * 100
                t.update({"result": "TIMEOUT", "pnl_pct": net, "hold": hold,
                          "exit_ts": row["ts"]})
                trades.append(t)
                active_trade = None
            continue

        row = df.iloc[i]
        high_i = row["high"]
        low_i  = row["low"]
        close_i = row["close"]

        # ── SHORT setup: sweep above a swing high, then reverse ──
        for _, _, level in known_sh:
            sweep_pct = (high_i - level) / level
            if SWEEP_MIN_PCT <= sweep_pct <= SWEEP_MAX_PCT:
                # Check if close is back below level (reversal within same or next REVERSAL_BARS candles)
                # Use close of current candle or look ahead 1-2 bars
                for j in range(i, min(i + REVERSAL_BARS, len(df))):
                    if df["close"].iloc[j] < level:
                        entry = df["close"].iloc[j]
                        sweep_dist = high_i - level
                        sl = high_i * (1 + SL_BUFFER_PCT)
                        tp_from_dist = entry - TP_MULT * sweep_dist
                        tp_from_pct  = entry * (1 - TP_MIN_PCT)
                        tp = min(tp_from_dist, tp_from_pct)  # lower price = better TP for short

                        active_trade = {
                            "symbol": symbol,
                            "dir": "SHORT",
                            "entry_ts": df["ts"].iloc[j],
                            "entry_idx": j,
                            "entry": entry,
                            "sl": sl,
                            "tp": tp,
                            "swept_level": level,
                            "sweep_pct": sweep_pct * 100,
                        }
                        break
                if active_trade:
                    break

        if active_trade:
            continue

        # ── LONG setup: sweep below a swing low, then reverse ──
        for _, _, level in known_sl:
            sweep_pct = (level - low_i) / level
            if SWEEP_MIN_PCT <= sweep_pct <= SWEEP_MAX_PCT:
                for j in range(i, min(i + REVERSAL_BARS, len(df))):
                    if df["close"].iloc[j] > level:
                        entry = df["close"].iloc[j]
                        sweep_dist = level - low_i
                        sl = low_i * (1 - SL_BUFFER_PCT)
                        tp_from_dist = entry + TP_MULT * sweep_dist
                        tp_from_pct  = entry * (1 + TP_MIN_PCT)
                        tp = max(tp_from_dist, tp_from_pct)

                        active_trade = {
                            "symbol": symbol,
                            "dir": "LONG",
                            "entry_ts": df["ts"].iloc[j],
                            "entry_idx": j,
                            "entry": entry,
                            "sl": sl,
                            "tp": tp,
                            "swept_level": level,
                            "sweep_pct": sweep_pct * 100,
                        }
                        break
                if active_trade:
                    break

    return trades

# ─── ASCII Equity Curve ───────────────────────────────────────────────────────
def ascii_equity(trades: list, width: int = 70, height: int = 15):
    if not trades:
        return "(no trades)"
    equity = [0.0]
    for t in trades:
        equity.append(equity[-1] + t["pnl_pct"])

    mn, mx = min(equity), max(equity)
    rng = mx - mn if mx != mn else 1
    rows = []
    for r in range(height - 1, -1, -1):
        threshold = mn + rng * r / (height - 1)
        row = ""
        for v in equity:
            row += "*" if abs(v - threshold) <= rng / (height - 1) / 2 else " "
        rows.append(f"{threshold:+6.1f}% |{row}")
    rows.append("        +" + "-" * len(equity))
    rows.append(f"         0{'trade #':>{len(equity)-1}}")
    return "\n".join(rows)

# ─── Main ─────────────────────────────────────────────────────────────────────
def main():
    print(f"\n{'='*65}")
    print(" LIQUIDITY SWEEP REVERSAL BACKTESTER  |  4h  |  90 days")
    print(f"{'='*65}\n")

    all_trades = []

    for sym in SYMBOLS:
        print(f"Downloading {sym} ...")
        df = fetch_ohlcv(sym)
        print(f"  {len(df)} candles loaded ({df['ts'].iloc[0].date()} → {df['ts'].iloc[-1].date()})")

        sh, sl = find_swings(df)
        print(f"  Swing highs: {len(sh)}  |  Swing lows: {len(sl)}")

        trades = backtest(sym, df)
        all_trades.extend(trades)

        tp_trades = [t for t in trades if t["result"] == "TP"]
        sl_trades = [t for t in trades if t["result"] == "SL"]
        to_trades = [t for t in trades if t["result"] == "TIMEOUT"]
        wr = len(tp_trades) / len(trades) * 100 if trades else 0
        avg_pnl = np.mean([t["pnl_pct"] for t in trades]) if trades else 0
        total_pnl = sum(t["pnl_pct"] for t in trades)

        print(f"\n  ── {sym} Results ──")
        print(f"  Trades: {len(trades)}  |  TP: {len(tp_trades)}  SL: {len(sl_trades)}  TO: {len(to_trades)}")
        print(f"  Win Rate: {wr:.1f}%  |  Avg PnL: {avg_pnl:+.2f}%  |  Total PnL: {total_pnl:+.2f}%")

        if trades:
            print(f"\n  {'Date':<20} {'Dir':<6} {'Entry':>10} {'SL':>10} {'TP':>10} {'Result':<8} {'PnL%':>7} {'Hold':>5}")
            print(f"  {'-'*20} {'-'*6} {'-'*10} {'-'*10} {'-'*10} {'-'*8} {'-'*7} {'-'*5}")
            for t in trades:
                print(f"  {str(t['entry_ts']):<20} {t['dir']:<6} {t['entry']:>10.2f} "
                      f"{t['sl']:>10.2f} {t['tp']:>10.2f} {t['result']:<8} "
                      f"{t['pnl_pct']:>+7.2f}% {t['hold']:>4}c")
        print()

    # ─── Summary ────────────────────────────────────────────────────────────
    print(f"\n{'='*65}")
    print(" SUMMARY")
    print(f"{'='*65}")

    if not all_trades:
        print("No trades found across all symbols.")
        return

    total = len(all_trades)
    wins  = sum(1 for t in all_trades if t["result"] == "TP")
    losses = sum(1 for t in all_trades if t["result"] == "SL")
    timeouts = sum(1 for t in all_trades if t["result"] == "TIMEOUT")
    wr    = wins / total * 100
    avg   = np.mean([t["pnl_pct"] for t in all_trades])
    total_pnl = sum(t["pnl_pct"] for t in all_trades)

    pnls = [t["pnl_pct"] for t in all_trades]
    wins_pnl  = [p for p in pnls if p > 0]
    loss_pnl  = [p for p in pnls if p < 0]
    avg_win  = np.mean(wins_pnl) if wins_pnl else 0
    avg_loss = np.mean(loss_pnl) if loss_pnl else 0
    rr       = abs(avg_win / avg_loss) if avg_loss != 0 else float("inf")

    # Per-symbol breakdown
    print(f"\n {'Symbol':<22} {'Trades':>6} {'WR%':>6} {'AvgPnL%':>8} {'TotalPnL%':>10}")
    print(f" {'-'*22} {'-'*6} {'-'*6} {'-'*8} {'-'*10}")
    for sym in SYMBOLS:
        st = [t for t in all_trades if t["symbol"] == sym]
        if not st:
            print(f" {sym:<22} {'0':>6}")
            continue
        w = sum(1 for t in st if t["result"] == "TP")
        print(f" {sym:<22} {len(st):>6} {w/len(st)*100:>6.1f}% "
              f"{np.mean([t['pnl_pct'] for t in st]):>+8.2f}% "
              f"{sum(t['pnl_pct'] for t in st):>+10.2f}%")

    # total_pnl is sum of pnl_pct values (each already in %, e.g. 4.17)
    # account_pnl = total_leveraged_% × size_fraction = total_pnl × SIZE_PCT
    account_pnl = total_pnl * SIZE_PCT
    monthly_pnl = account_pnl / 3  # 90 days ≈ 3 months

    print(f"\n All Symbols Combined  (5x lev, 25% size, fees inc)")
    print(f"   Total trades  : {total}")
    print(f"   TP / SL / TO  : {wins} / {losses} / {timeouts}")
    print(f"   Win Rate       : {wr:.1f}%")
    print(f"   Avg PnL/trade  : {avg:+.2f}% (leveraged, fee-net)")
    print(f"   Total PnL      : {total_pnl:+.2f}% leveraged  →  account {account_pnl:+.2f}%")
    print(f"   Monthly avg    : {monthly_pnl:+.2f}%")
    print(f"   Avg Win        : {avg_win:+.2f}%")
    print(f"   Avg Loss       : {avg_loss:+.2f}%")
    print(f"   Reward/Risk    : {rr:.2f}")

    # Max drawdown
    equity = [0.0]
    for t in all_trades:
        equity.append(equity[-1] + t["pnl_pct"])
    peak = equity[0]
    max_dd = 0
    for e in equity:
        if e > peak:
            peak = e
        dd = peak - e
        if dd > max_dd:
            max_dd = dd
    print(f"   Max Drawdown   : -{max_dd:.2f}%")

    print(f"\n Equity Curve (cumulative PnL %):\n")
    print(ascii_equity(all_trades))
    print()

if __name__ == "__main__":
    main()
