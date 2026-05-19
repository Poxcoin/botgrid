"""
backtester_alt.py — Signal bot backtest (live watchlist, live params).

Live bot params (altcoin_bot.py):
  TP = 20%  SL = 5%  Leverage = 5x  Size = 2%
  Breakeven WR = 5 / (20+5) = 20.0%

Symbols: live watchlist from dashboard (WLD/JUP/XRP/RUNE/ONDO/PENDLE)
Logic: volume spike (3x avg) + price trend scoring → entry
"""

import ccxt
import time
import json
from datetime import datetime, timedelta, timezone
pass  # no config imports needed for public-only exchange

# ─── Параметры ───────────────────────────────────────────────────────────────
SYMBOLS = [
    "WLD/USDT:USDT",
    "JUP/USDT:USDT",
    "XRP/USDT:USDT",
    "RUNE/USDT:USDT",
    "ONDO/USDT:USDT",
    "PENDLE/USDT:USDT",
]

DAYS              = 90
BALANCE           = 10_000.0
TIMEFRAME         = "15m"

ALT_TP            = 20.0    # % — live bot param
ALT_SL            = 5.0     # % — live bot param
ALT_LEVERAGE      = 5       # live bot param
ALT_SIZE          = 2.0     # % баланса

VOL_SPIKE_X       = 3.0     # кратность объёма
TREND_PANIC_CAP   = 80      # отсекаем если |trend%| > 80
RSI_SHORT_MIN     = 20      # шортим если RSI > 20 (почти не ограничиваем)
RSI_LONG_MAX      = 80      # лонгуем если RSI < 80
COOLDOWN_CANDLES  = 4       # 1 час
SCORE_THRESHOLD   = 8       # сумма баллов для входа

BREAKEVEN_WR = round(ALT_SL / (ALT_TP + ALT_SL) * 100, 1)

# ─── Exchange ─────────────────────────────────────────────────────────────────

def init_exchange():
    return ccxt.bybit({
        "enableRateLimit": True,
        "options": {"defaultType": "linear"},
    })


# ─── Технические индикаторы ──────────────────────────────────────────────────

def fetch_ohlcv(ex, symbol, days):
    since = ex.parse8601(
        (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    )
    result = []
    while True:
        batch = ex.fetch_ohlcv(symbol, TIMEFRAME, since=since, limit=1000)
        if not batch:
            break
        result.extend(batch)
        since = batch[-1][0] + 1
        if len(batch) < 1000:
            break
        time.sleep(0.3)
    return result


def vol_spike(ohlcv, i, window=16):
    if i < window:
        return False, 0.0
    cur = ohlcv[i][5]
    avg = sum(c[5] for c in ohlcv[i - window:i]) / window
    ratio = cur / avg if avg > 0 else 0
    return ratio >= VOL_SPIKE_X, round(ratio, 2)


def price_trend(ohlcv, i, lookback=96):
    if i < lookback:
        return 0, 0.0
    cur  = ohlcv[i][4]
    past = ohlcv[i - lookback][4]
    pct  = (cur - past) / past * 100
    if pct > 2.0:   return  2, round(pct, 2)
    if pct < -2.0:  return -2, round(pct, 2)
    return 0, round(pct, 2)


def compute_rsi(ohlcv, i, period=14):
    step = 4
    needed = (period + 1) * step
    if i < needed:
        return 50.0
    closes = [ohlcv[i - j * step][4] for j in range(period, -1, -1)]
    gains  = [max(closes[j] - closes[j-1], 0) for j in range(1, len(closes))]
    losses = [max(closes[j-1] - closes[j], 0) for j in range(1, len(closes))]
    ag = sum(gains) / period
    al = sum(losses) / period
    if al == 0:
        return 100.0
    return round(100 - (100 / (1 + ag / al)), 1)


# ─── Симуляция сделки ────────────────────────────────────────────────────────

def simulate_trade(ohlcv, entry_idx, action, balance):
    usdt_risk    = balance * (ALT_SIZE / 100)
    position_usd = usdt_risk * ALT_LEVERAGE
    entry_price  = ohlcv[entry_idx][1]  # open следующей свечи

    if action == "LONG":
        tp = entry_price * (1 + ALT_TP / 100)
        sl = entry_price * (1 - ALT_SL / 100)
    else:
        tp = entry_price * (1 - ALT_TP / 100)
        sl = entry_price * (1 + ALT_SL / 100)

    result = None
    exit_price = entry_price
    exit_idx   = entry_idx

    for j in range(entry_idx, min(entry_idx + 300, len(ohlcv))):
        hi, lo = ohlcv[j][2], ohlcv[j][3]
        if action == "LONG":
            if lo <= sl:   result, exit_price, exit_idx = "LOSS", sl, j;  break
            if hi >= tp:   result, exit_price, exit_idx = "WIN",  tp, j;  break
        else:
            if hi >= sl:   result, exit_price, exit_idx = "LOSS", sl, j;  break
            if lo <= tp:   result, exit_price, exit_idx = "WIN",  tp, j;  break

    if result is None:
        exit_idx   = min(entry_idx + 299, len(ohlcv) - 1)
        exit_price = ohlcv[exit_idx][4]
        chg = (exit_price - entry_price) / entry_price
        if action == "SHORT":
            chg = -chg
        result = "WIN" if chg > 0 else "LOSS"
        pnl = usdt_risk * ALT_LEVERAGE * chg
    else:
        pnl = (usdt_risk * ALT_LEVERAGE * ALT_TP / 100) if result == "WIN" \
              else -(usdt_risk * ALT_LEVERAGE * ALT_SL / 100)

    return result, round(pnl, 4), round(exit_price, 6), exit_idx


# ─── Бэктест одной монеты ─────────────────────────────────────────────────────

def backtest_symbol(ex, symbol):
    print(f"\n  📊 {symbol} — скачиваю данные...", end="", flush=True)
    ohlcv = fetch_ohlcv(ex, symbol, DAYS)
    print(f" {len(ohlcv)} свечей")

    if len(ohlcv) < 200:
        return {"symbol": symbol, "error": "мало данных"}

    balance       = BALANCE
    peak_bal      = BALANCE
    max_dd        = 0.0
    trades        = []
    last_trade_i  = -COOLDOWN_CANDLES - 1

    sig_raw  = 0
    filt_rsi = 0
    filt_tr  = 0
    filt_cd  = 0

    i = 100
    while i < len(ohlcv) - 2:
        tr_score, tr_pct = price_trend(ohlcv, i)
        spike, vol_ratio = vol_spike(ohlcv, i)

        vol_pts = 4 if spike else 0
        ai_sim  = 4 if (spike and tr_score != 0) else 0
        total   = ai_sim + abs(tr_score) + vol_pts

        if total >= SCORE_THRESHOLD and tr_score != 0:
            sig_raw += 1
            action = "LONG" if tr_score > 0 else "SHORT"

            if abs(tr_pct) > TREND_PANIC_CAP:
                filt_tr += 1; i += 1; continue

            rsi = compute_rsi(ohlcv, i)
            if action == "SHORT" and rsi < RSI_SHORT_MIN:
                filt_rsi += 1; i += 1; continue
            if action == "LONG"  and rsi > RSI_LONG_MAX:
                filt_rsi += 1; i += 1; continue

            if i - last_trade_i < COOLDOWN_CANDLES:
                filt_cd += 1; i += 1; continue

            res, pnl, exit_px, exit_i = simulate_trade(ohlcv, i + 1, action, balance)
            balance      += pnl
            last_trade_i  = i

            if balance > peak_bal: peak_bal = balance
            dd = (peak_bal - balance) / peak_bal * 100
            if dd > max_dd: max_dd = dd

            trades.append({
                "time":    datetime.fromtimestamp(ohlcv[i][0] / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M"),
                "action":  action,
                "score":   total,
                "trend%":  tr_pct,
                "vol_x":   vol_ratio,
                "rsi":     rsi,
                "entry":   round(ohlcv[i + 1][1], 6),
                "exit":    exit_px,
                "result":  res,
                "pnl":     pnl,
                "balance": round(balance, 2),
            })
            i = exit_i + 1
        else:
            i += 1

    wins    = sum(1 for t in trades if t["result"] == "WIN")
    losses  = sum(1 for t in trades if t["result"] == "LOSS")
    total_t = wins + losses

    return {
        "symbol":            symbol,
        "candles":           len(ohlcv),
        "trades":            total_t,
        "wins":              wins,
        "losses":            losses,
        "win_rate":          round(wins / total_t * 100, 1) if total_t else 0,
        "initial":           BALANCE,
        "final":             round(balance, 2),
        "profit":            round(balance - BALANCE, 2),
        "roi%":              round((balance - BALANCE) / BALANCE * 100, 2),
        "max_drawdown%":     round(max_dd, 2),
        "signals_raw":       sig_raw,
        "filtered_rsi":      filt_rsi,
        "filtered_trend":    filt_tr,
        "filtered_cooldown": filt_cd,
        "trades_per_day":    round(total_t / DAYS, 1),
        "trade_log":         trades,
    }


# ─── Отчёт ───────────────────────────────────────────────────────────────────

def print_report(results):
    print("\n" + "=" * 70)
    print(f"  ALT БЭКТЕСТ — {DAYS} дней  |  TP={ALT_TP}%  SL={ALT_SL}%  x{ALT_LEVERAGE}  Size={ALT_SIZE}%")
    print(f"  Breakeven WR: {BREAKEVEN_WR}%  (нужно выигрывать 1 из {round(100/BREAKEVEN_WR):.0f})")
    print("=" * 70)
    print(f"  {'Монета':<22} {'Сделок':>7} {'WinRate':>8} {'Профит':>11} {'ROI':>7} {'MaxDD':>7}")
    print("-" * 70)

    total_profit = 0
    total_sig    = 0
    total_trades = 0
    total_fr, total_ft, total_fc = 0, 0, 0

    for r in results:
        if "error" in r:
            print(f"  {r['symbol']:<22} {'ОШИБКА':>7}  {r['error']}")
            continue
        total_profit += r["profit"]
        total_sig    += r.get("signals_raw", 0)
        total_trades += r["trades"]
        total_fr     += r.get("filtered_rsi", 0)
        total_ft     += r.get("filtered_trend", 0)
        total_fc     += r.get("filtered_cooldown", 0)

        p_str = f"+${r['profit']:.2f}" if r["profit"] >= 0 else f"-${abs(r['profit']):.2f}"
        r_str = f"+{r['roi%']}%" if r["roi%"] >= 0 else f"{r['roi%']}%"
        print(f"  {r['symbol']:<22} {r['trades']:>7} {r['win_rate']:>7}% {p_str:>11} {r_str:>7} {r['max_drawdown%']:>6}%")

    print("=" * 70)

    valid = [r for r in results if "error" not in r]
    if valid:
        avg_wr = sum(r["win_rate"] for r in valid) / len(valid)
        profitable = [r for r in valid if r["profit"] > 0]
        ev = (avg_wr / 100 * ALT_TP * ALT_LEVERAGE) \
           - ((100 - avg_wr) / 100 * ALT_SL * ALT_LEVERAGE)

        print(f"\n  Средний Win Rate:    {avg_wr:.1f}%   (Breakeven: {BREAKEVEN_WR}%)")
        print(f"  Прибыльных монет:    {len(profitable)}/{len(valid)}")
        print(f"  Суммарный профит:    ${total_profit:+.2f}")
        print(f"  EV на сделку:        {ev:+.2f}%")

        if total_sig > 0:
            pr = round(total_trades / total_sig * 100, 1)
            print(f"\n  ── ФИЛЬТРАЦИЯ ─────────────────────────────────────")
            print(f"  Сигналов/день:       {round(total_sig/DAYS, 1)}")
            print(f"  Отсеяно RSI:         {total_fr}  ({round(total_fr/total_sig*100,1)}%)")
            print(f"  Отсеяно тренд >80%:  {total_ft}  ({round(total_ft/total_sig*100,1)}%)")
            print(f"  Отсеяно кулдаун:     {total_fc}  ({round(total_fc/total_sig*100,1)}%)")
            print(f"  Реальных сделок/день: {round(total_trades/DAYS,1)}  (pass: {pr}%)")

        verdict = "✅ ПРИБЫЛЬНО" if total_profit > 0 and avg_wr > BREAKEVEN_WR \
                  else f"⚠️  Win Rate {avg_wr:.1f}% < Breakeven {BREAKEVEN_WR}% — убыточно"
        print(f"\n  {verdict}")

    print("=" * 70)


# ─── Запуск ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("🎯 Запуск ALT бэктеста...")
    print(f"   Монеты: {SYMBOLS}")
    print(f"   TP={ALT_TP}%  SL={ALT_SL}%  x{ALT_LEVERAGE}  Size={ALT_SIZE}%  Breakeven WR={BREAKEVEN_WR}%")

    ex = init_exchange()
    results = []

    for sym in SYMBOLS:
        r = backtest_symbol(ex, sym)
        results.append(r)

    print_report(results)

    with open("backtest_results_alt.json", "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print("\n  Детальный лог → backtest_results_alt.json")
