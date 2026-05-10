#!/usr/bin/env python3
"""
cascade_backtest.py — Backtest каскадної стратегії на Binance Futures 1-хв OHLCV.

Proxy для ліквідаційного каскаду (реальних архівів Binance !forceOrder немає):
  тіло 1-хв свічки > MOVE_THRESHOLD%  +  об'єм > VOLUME_MULT × rolling avg
  Бичача свічка → LONG  |  Ведмежа свічка → SHORT

Консервативно: вхід на open НАСТУПНОЇ свічки (~60с після каскаду).
У реалтаймі WebSocket дає <500ms → live результати мають бути кращими.

Відповідність cascade_bot.py:
  TP 1.5% | SL 0.6% | 5x | TimeStop 20хв | Cooldown 30хв
"""

import sys
import time
from datetime import datetime, timezone
import requests

# ─── Параметри стратегії (відповідають cascade_bot.py) ───────────────────────
TP_PCT        = 1.5
SL_PCT        = 0.6
LEVERAGE      = 5
TAKER_FEE     = 0.00055
TIME_STOP_MIN = 20
COOLDOWN_MIN  = 30

# ─── Параметри бектесту ────────────────────────────────────────────────────────
MOVE_THRESHOLD = 0.5     # % тіло свічки для сигналу (мін рух за 1 хв)
VOLUME_MULT    = 3.0     # об'єм свічки > N × rolling avg
VOLUME_WINDOW  = 60      # свічок для rolling avg об'єму
LOOKBACK_DAYS  = 90      # скільки днів тестуємо

COINS = ["BTC", "ETH", "SOL"]
BINANCE_FUTURES = "https://fapi.binance.com/fapi/v1/klines"


# ─── Завантаження даних ───────────────────────────────────────────────────────

def fetch_klines(symbol: str, days: int) -> list[tuple]:
    """Завантажує 1-хв ф'ючерсні свічки з Binance (безкоштовно, без ключа)."""
    end_ms   = int(datetime.now(timezone.utc).timestamp() * 1000)
    start_ms = end_ms - days * 86_400_000
    result: list[tuple] = []
    cur = start_ms

    print(f"  [{symbol}] Завантаження {days}д 1-хв даних...", end=" ", flush=True)
    while cur < end_ms:
        try:
            r = requests.get(BINANCE_FUTURES, params={
                "symbol": symbol, "interval": "1m",
                "startTime": cur,
                "endTime": min(cur + 1500 * 60_000, end_ms),
                "limit": 1500,
            }, timeout=20)
            data = r.json()
            if not data or not isinstance(data, list):
                break
            for k in data:
                result.append((int(k[0]), float(k[1]), float(k[2]),
                                float(k[3]), float(k[4]), float(k[5])))
            cur = data[-1][0] + 60_000
        except Exception as e:
            print(f"\n  ⚠️  Помилка fetch: {e}")
            break
        time.sleep(0.08)

    print(f"{len(result):,} свічок")
    return result


# ─── Симуляція однієї угоди ───────────────────────────────────────────────────

def _simulate(candles: list[tuple], entry_idx: int, action: str) -> tuple[str, float, float]:
    """Повертає (result, exit_price, pnl_pct)."""
    entry_price = candles[entry_idx][1]   # open наступної свічки після сигналу
    n = len(candles)

    if action == "LONG":
        tp_price = entry_price * (1 + TP_PCT / 100)
        sl_price = entry_price * (1 - SL_PCT / 100)
    else:
        tp_price = entry_price * (1 - TP_PCT / 100)
        sl_price = entry_price * (1 + SL_PCT / 100)

    result     = "TIME"
    exit_price = candles[min(entry_idx + TIME_STOP_MIN, n - 1)][4]

    for j in range(entry_idx + 1, min(entry_idx + TIME_STOP_MIN + 1, n)):
        _, c_open, c_high, c_low, _, _ = candles[j]

        tp_hit = (action == "LONG" and c_high >= tp_price) or \
                 (action == "SHORT" and c_low  <= tp_price)
        sl_hit = (action == "LONG" and c_low  <= sl_price) or \
                 (action == "SHORT" and c_high >= sl_price)

        if tp_hit and sl_hit:
            # Обидва в одній свічці — що ближче до open
            result     = "TP" if abs(c_open - tp_price) < abs(c_open - sl_price) else "SL"
            exit_price = tp_price if result == "TP" else sl_price
            break
        elif tp_hit:
            result, exit_price = "TP", tp_price
            break
        elif sl_hit:
            result, exit_price = "SL", sl_price
            break

    # PnL % від депозиту (з плечем)
    if action == "LONG":
        gross_pct = (exit_price / entry_price - 1) * 100 * LEVERAGE
    else:
        gross_pct = (1 - exit_price / entry_price) * 100 * LEVERAGE
    fees_pct = 2 * TAKER_FEE * 100 * LEVERAGE
    pnl_pct  = round(gross_pct - fees_pct, 3)

    return result, exit_price, pnl_pct


# ─── Бектест однієї монети ────────────────────────────────────────────────────

def backtest_coin(coin: str, candles: list[tuple]) -> dict:
    n = len(candles)
    trades: list[dict] = []
    cooldown_until_ms  = 0
    need = TIME_STOP_MIN + 2

    for i in range(VOLUME_WINDOW, n - need):
        ts, open_, high, low, close, vol = candles[i]

        if ts < cooldown_until_ms:
            continue

        body_pct = abs(close - open_) / open_ * 100
        if body_pct < MOVE_THRESHOLD:
            continue

        avg_vol = sum(candles[j][5] for j in range(i - VOLUME_WINDOW, i)) / VOLUME_WINDOW
        if vol < avg_vol * VOLUME_MULT:
            continue

        action = "LONG" if close > open_ else "SHORT"
        result, exit_price, pnl_pct = _simulate(candles, i + 1, action)

        dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
        trades.append({
            "ts":       dt.strftime("%Y-%m-%d %H:%M"),
            "month":    dt.strftime("%Y-%m"),
            "action":   action,
            "result":   result,
            "entry":    round(candles[i + 1][1], 4),
            "exit":     round(exit_price, 4),
            "body_pct": round(body_pct, 3),
            "pnl_pct":  pnl_pct,
        })

        cooldown_until_ms = ts + COOLDOWN_MIN * 60_000

    return {"coin": coin, "trades": trades}


# ─── Звіт ─────────────────────────────────────────────────────────────────────

def print_report(results: list[dict]) -> None:
    print(f"\n{'═'*65}")
    print(f"  CASCADE BACKTEST  |  {LOOKBACK_DAYS}д  |  Move>{MOVE_THRESHOLD}%  Vol>{VOLUME_MULT}×avg")
    print(f"  TP {TP_PCT}% | SL {SL_PCT}% | {LEVERAGE}x | "
          f"Cooldown {COOLDOWN_MIN}хв | TimeStop {TIME_STOP_MIN}хв")
    print(f"{'═'*65}")

    all_trades: list[dict] = []

    for r in results:
        coin   = r["coin"]
        trades = r["trades"]
        if not trades:
            print(f"\n  {coin}: 0 сигналів — спробуй знизити MOVE_THRESHOLD або VOLUME_MULT")
            continue

        all_trades.extend(trades)
        tp_n  = sum(1 for t in trades if t["result"] == "TP")
        sl_n  = sum(1 for t in trades if t["result"] == "SL")
        ts_n  = sum(1 for t in trades if t["result"] == "TIME")
        wr    = tp_n / len(trades) * 100
        total = sum(t["pnl_pct"] for t in trades)
        avg   = total / len(trades)

        print(f"\n{'─'*65}")
        print(f"  {coin}  |  {len(trades)} угод  |  WR {wr:.1f}%  |  "
              f"PnL {total:+.1f}%  |  Avg {avg:+.2f}%/угоду")
        print(f"  TP: {tp_n} ({tp_n/len(trades)*100:.0f}%)  "
              f"SL: {sl_n} ({sl_n/len(trades)*100:.0f}%)  "
              f"TimeStop: {ts_n} ({ts_n/len(trades)*100:.0f}%)")

        months = sorted(set(t["month"] for t in trades))
        if len(months) > 1:
            print(f"\n  {'Місяць':<10} {'Угоди':>6}  {'WR':>6}  {'PnL':>9}")
            for m in months:
                mt    = [t for t in trades if t["month"] == m]
                m_tp  = sum(1 for t in mt if t["result"] == "TP")
                m_pnl = sum(t["pnl_pct"] for t in mt)
                print(f"  {m:<10} {len(mt):>6}  "
                      f"{m_tp/len(mt)*100:>5.0f}%  {m_pnl:>+9.1f}%")

    if not all_trades:
        print("\n  Немає угод. Знизь MOVE_THRESHOLD або VOLUME_MULT.")
        return

    # Загальна статистика
    total_n  = len(all_trades)
    tp_all   = sum(1 for t in all_trades if t["result"] == "TP")
    sl_all   = sum(1 for t in all_trades if t["result"] == "SL")
    ts_all   = sum(1 for t in all_trades if t["result"] == "TIME")
    total_pnl = sum(t["pnl_pct"] for t in all_trades)

    # Max drawdown по equity curve
    equity = 100.0
    peak   = 100.0
    max_dd = 0.0
    for t in sorted(all_trades, key=lambda x: x["ts"]):
        equity += t["pnl_pct"]
        if equity > peak:
            peak = equity
        dd = (peak - equity) / peak * 100
        if dd > max_dd:
            max_dd = dd

    worst = min(all_trades, key=lambda t: t["pnl_pct"])
    best  = max(all_trades, key=lambda t: t["pnl_pct"])

    print(f"\n{'═'*65}")
    print(f"  ЗАГАЛОМ  |  {total_n} угод  |  WR {tp_all/total_n*100:.1f}%  |  PnL {total_pnl:+.1f}%")
    print(f"  TP: {tp_all} ({tp_all/total_n*100:.0f}%)  "
          f"SL: {sl_all} ({sl_all/total_n*100:.0f}%)  "
          f"TimeStop: {ts_all} ({ts_all/total_n*100:.0f}%)")
    print(f"  Max Drawdown: {max_dd:.1f}%")
    print(f"  Найкраща:  {best['ts']}  {best['action']} {best['result']}  {best['pnl_pct']:+.2f}%")
    print(f"  Найгірша:  {worst['ts']}  {worst['action']} {worst['result']}  {worst['pnl_pct']:+.2f}%")
    print(f"\n  Break-even WR (теоретичний): ~29%")
    print(f"  {'✅ Стратегія профітна' if total_pnl > 0 else '❌ Стратегія збиткова'} "
          f"за {LOOKBACK_DAYS} днів")
    print(f"{'═'*65}")
    print()
    print("⚠️  Примітки:")
    print("  • Proxy (OHLCV) ≠ реальні ліквідації — очікуй розбіжність із live")
    print("  • Вхід на +1 свічку консервативніший ніж live (<500ms)")
    print("  • Funding rate фільтр не враховано (зменшить кількість угод)")
    print("  • Спробуй: MOVE_THRESHOLD 0.3–1.0, VOLUME_MULT 2.0–4.0")


# ─── Параметр-свіп (опційно) ──────────────────────────────────────────────────

def param_sweep(candles_map: dict[str, list]) -> None:
    """Коротка таблиця WR/PnL для різних порогів."""
    thresholds   = [0.3, 0.5, 0.8, 1.0]
    volume_mults = [2.0, 3.0]

    print(f"\n{'─'*65}")
    print("  ПАРАМЕТР-СВІП (BTC+ETH+SOL загалом)")
    print(f"  {'Move':>6}  {'Vol':>5}  {'Угоди':>6}  {'WR':>6}  {'PnL':>9}  {'DD':>7}")
    print(f"  {'─'*55}")

    for vm in volume_mults:
        for mt in thresholds:
            all_t: list[dict] = []
            for coin, candles in candles_map.items():
                orig_mt, orig_vm = MOVE_THRESHOLD, VOLUME_MULT
                # Локальна заміна глобалів (простий підхід для скрипту)
                import builtins
                r = _sweep_single(coin, candles, mt, vm)
                all_t.extend(r)

            if not all_t:
                print(f"  {mt:>5.1f}%  {vm:>4.1f}×  {'—':>6}  {'—':>6}  {'—':>9}  {'—':>7}")
                continue

            tp_n  = sum(1 for t in all_t if t["result"] == "TP")
            wr    = tp_n / len(all_t) * 100
            pnl   = sum(t["pnl_pct"] for t in all_t)

            eq    = 100.0; pk = 100.0; dd = 0.0
            for t in sorted(all_t, key=lambda x: x["ts"]):
                eq += t["pnl_pct"]
                pk  = max(pk, eq)
                dd  = max(dd, (pk - eq) / pk * 100)

            print(f"  {mt:>5.1f}%  {vm:>4.1f}×  {len(all_t):>6}  {wr:>5.1f}%  {pnl:>+9.1f}%  {dd:>6.1f}%")


def _sweep_single(coin: str, candles: list, move_thr: float, vol_mult: float) -> list:
    n = len(candles)
    trades = []
    cooldown_ms = 0
    need = TIME_STOP_MIN + 2

    for i in range(VOLUME_WINDOW, n - need):
        ts, open_, high, low, close, vol = candles[i]
        if ts < cooldown_ms:
            continue
        body_pct = abs(close - open_) / open_ * 100
        if body_pct < move_thr:
            continue
        avg_vol = sum(candles[j][5] for j in range(i - VOLUME_WINDOW, i)) / VOLUME_WINDOW
        if vol < avg_vol * vol_mult:
            continue

        action = "LONG" if close > open_ else "SHORT"
        result, exit_price, pnl_pct = _simulate(candles, i + 1, action)
        dt = datetime.fromtimestamp(ts / 1000, tz=timezone.utc)
        trades.append({
            "ts": dt.strftime("%Y-%m-%d %H:%M"),
            "result": result,
            "pnl_pct": pnl_pct,
        })
        cooldown_ms = ts + COOLDOWN_MIN * 60_000

    return trades


# ─── Main ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    sweep_mode = "--sweep" in sys.argv

    print(f"CASCADE BACKTEST — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')} UTC")
    print(f"Монети: {', '.join(COINS)}  |  {LOOKBACK_DAYS} днів  |  1-хв свічки\n")

    candles_map: dict[str, list] = {}
    for coin in COINS:
        data = fetch_klines(f"{coin}USDT", LOOKBACK_DAYS)
        if len(data) < VOLUME_WINDOW + 200:
            print(f"  [{coin}] Недостатньо даних, пропускаємо")
            continue
        candles_map[coin] = data

    results = [backtest_coin(coin, candles) for coin, candles in candles_map.items()]
    print_report(results)

    if sweep_mode:
        param_sweep(candles_map)
