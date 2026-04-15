"""
backtester.py — Тест торговой формулы на исторических данных Bybit Testnet.

Логика:
  - Фактор 2: 24h тренд цены  → +2 / -2 pts
  - Фактор 3: Спайк объёма     → +4 pts (если текущий 15min vol > 2.5x avg за 4h)
  - ИИ (симуляция): когда оба технических фактора сильные, предполагаем
    что ИИ тоже нашёл бы релевантную новость и дал +4 pts
  - Порог входа: итоговый score >= 8

  TP = +10%, SL = -3%, Плечо = 3x, Размер позиции = 5% баланса
"""

import ccxt
import time
import json
from datetime import datetime, timedelta, timezone
from config.settings import (
    BYBIT_API_KEY, BYBIT_SECRET, USE_TESTNET,
    LEVERAGE, TRADE_PERCENT_SIZE,
    TAKE_PROFIT_PERCENT, STOP_LOSS_PERCENT,
)

# ─────────────────────────────────────────────
SYMBOLS   = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
DAYS      = 60          # глубина истории
BALANCE   = 10_000.0    # стартовый баланс USDT
TIMEFRAME = "15m"
# ─────────────────────────────────────────────


def init_exchange() -> ccxt.Exchange:
    ex = ccxt.bybit({
        "apiKey": BYBIT_API_KEY,
        "secret": BYBIT_SECRET,
        "enableRateLimit": True,
        "options": {"defaultType": "swap", "adjustForTimeDifference": True},
    })
    if USE_TESTNET:
        ex.set_sandbox_mode(True)
    return ex


def fetch_ohlcv(ex: ccxt.Exchange, symbol: str, days: int) -> list:
    """Скачивает 15m свечи за последние N дней."""
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


def vol_spike(ohlcv: list, i: int, window: int = 16) -> tuple[bool, float]:
    """True если текущий объём > 2.5x среднего за последние 4h (16 свечей по 15m)."""
    if i < window:
        return False, 0.0
    cur_vol = ohlcv[i][5]
    avg_vol = sum(c[5] for c in ohlcv[i - window:i]) / window
    ratio = cur_vol / avg_vol if avg_vol > 0 else 0
    return ratio >= 2.5, round(ratio, 2)


def price_trend(ohlcv: list, i: int, lookback: int = 96) -> tuple[int, float]:
    """Сравнивает цену сейчас и 24h назад (96 свечей по 15m)."""
    if i < lookback:
        return 0, 0.0
    cur  = ohlcv[i][4]
    past = ohlcv[i - lookback][4]
    pct  = (cur - past) / past * 100
    if pct > 1.5:
        return 2, round(pct, 2)
    if pct < -1.5:
        return -2, round(pct, 2)
    return 0, round(pct, 2)


def simulate_trade(ohlcv: list, entry_idx: int, action: str,
                   balance: float) -> tuple[str, float, float, int]:
    """
    Имитирует сделку начиная со следующей свечи.
    Возвращает: (result, pnl, exit_price, exit_idx)
    """
    usdt_risk    = balance * (TRADE_PERCENT_SIZE / 100)
    position_usd = usdt_risk * LEVERAGE
    entry_price  = ohlcv[entry_idx][1]  # open следующей свечи

    if action == "LONG":
        tp = entry_price * (1 + TAKE_PROFIT_PERCENT / 100)
        sl = entry_price * (1 - STOP_LOSS_PERCENT  / 100)
    else:
        tp = entry_price * (1 - TAKE_PROFIT_PERCENT / 100)
        sl = entry_price * (1 + STOP_LOSS_PERCENT  / 100)

    result      = None
    exit_price  = entry_price
    exit_idx    = entry_idx

    for j in range(entry_idx, min(entry_idx + 300, len(ohlcv))):
        hi, lo = ohlcv[j][2], ohlcv[j][3]
        if action == "LONG":
            if lo <= sl:
                result, exit_price, exit_idx = "LOSS", sl, j; break
            if hi >= tp:
                result, exit_price, exit_idx = "WIN",  tp, j; break
        else:
            if hi >= sl:
                result, exit_price, exit_idx = "LOSS", sl, j; break
            if lo <= tp:
                result, exit_price, exit_idx = "WIN",  tp, j; break

    if result is None:
        # Сделка не достигла TP/SL за 300 свечей — считаем реальный PnL по факту.
        # БАГ-ФИX: раньше таймаутные WIN считались как +TP%, что завышало прибыль.
        exit_idx   = min(entry_idx + 299, len(ohlcv) - 1)
        exit_price = ohlcv[exit_idx][4]
        chg = (exit_price - entry_price) / entry_price
        if action == "SHORT":
            chg = -chg
        result = "WIN" if chg > 0 else "LOSS"
        pnl = usdt_risk * LEVERAGE * chg  # реальное изменение, не фиксированный TP
    else:
        pnl = (usdt_risk * LEVERAGE * TAKE_PROFIT_PERCENT / 100) if result == "WIN" \
              else -(usdt_risk * LEVERAGE * STOP_LOSS_PERCENT / 100)

    return result, round(pnl, 4), round(exit_price, 6), exit_idx


def backtest_symbol(ex: ccxt.Exchange, symbol: str) -> dict:
    print(f"\n  📊 {symbol} — скачиваю данные...", end="", flush=True)
    ohlcv = fetch_ohlcv(ex, symbol, DAYS)
    print(f" {len(ohlcv)} свечей")

    if len(ohlcv) < 200:
        return {"symbol": symbol, "error": "мало данных"}

    balance  = BALANCE
    peak_bal = BALANCE
    max_dd   = 0.0
    trades   = []
    i        = 100

    while i < len(ohlcv) - 2:
        tr_score, tr_pct   = price_trend(ohlcv, i)
        spike, vol_ratio   = vol_spike(ohlcv, i)

        vol_pts  = 4 if spike else 0
        # Симуляция ИИ: сильные тех. сигналы → предполагаем AI score ~4
        ai_sim   = 4 if (spike and tr_score != 0) else 0
        total    = ai_sim + abs(tr_score) + vol_pts

        if total >= 8 and tr_score != 0:
            action = "LONG" if tr_score > 0 else "SHORT"
            res, pnl, exit_px, exit_i = simulate_trade(ohlcv, i + 1, action, balance)
            balance += pnl

            # max drawdown
            if balance > peak_bal:
                peak_bal = balance
            dd = (peak_bal - balance) / peak_bal * 100
            if dd > max_dd:
                max_dd = dd

            trades.append({
                "time":    datetime.fromtimestamp(ohlcv[i][0] / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M"),
                "action":  action,
                "score":   total,
                "trend%":  tr_pct,
                "vol_x":   vol_ratio,
                "entry":   round(ohlcv[i + 1][1], 4),
                "exit":    exit_px,
                "result":  res,
                "pnl":     pnl,
                "balance": round(balance, 2),
            })
            i = exit_i + 1
        else:
            i += 1

    wins   = sum(1 for t in trades if t["result"] == "WIN")
    losses = sum(1 for t in trades if t["result"] == "LOSS")
    total_t = wins + losses

    return {
        "symbol":       symbol,
        "candles":      len(ohlcv),
        "trades":       total_t,
        "wins":         wins,
        "losses":       losses,
        "win_rate":     round(wins / total_t * 100, 1) if total_t else 0,
        "initial":      BALANCE,
        "final":        round(balance, 2),
        "profit":       round(balance - BALANCE, 2),
        "roi%":         round((balance - BALANCE) / BALANCE * 100, 2),
        "max_drawdown%": round(max_dd, 2),
        "trade_log":    trades,
    }


def print_report(results: list[dict]) -> None:
    print("\n" + "=" * 65)
    print("  РЕЗУЛЬТАТЫ БЭКТЕСТА — последние 60 дней")
    print("=" * 65)
    print(f"  {'Монета':<18} {'Сделок':>7} {'WinRate':>8} {'Профит':>10} {'ROI':>7} {'MaxDD':>7}")
    print("-" * 65)

    total_profit = 0
    for r in results:
        if "error" in r:
            print(f"  {r['symbol']:<18} {'ОШИБКА':>7} {r['error']}")
            continue
        total_profit += r["profit"]
        profit_str = f"+${r['profit']:.2f}" if r["profit"] >= 0 else f"-${abs(r['profit']):.2f}"
        roi_str    = f"+{r['roi%']}%" if r["roi%"] >= 0 else f"{r['roi%']}%"
        win_str    = f"{r['win_rate']}%"
        dd_str     = f"{r['max_drawdown%']}%"
        print(f"  {r['symbol']:<18} {r['trades']:>7} {win_str:>8} {profit_str:>10} {roi_str:>7} {dd_str:>7}")

    print("=" * 65)

    profitable = [r for r in results if "error" not in r and r["profit"] > 0]
    all_valid  = [r for r in results if "error" not in r]

    if all_valid:
        avg_wr = sum(r["win_rate"] for r in all_valid) / len(all_valid)
        print(f"\n  Средний Win Rate:   {avg_wr:.1f}%")
        print(f"  Прибыльных монет:   {len(profitable)}/{len(all_valid)}")
        print(f"  Суммарный профит:   ${total_profit:+.2f}")

        # Breakeven win rate при нашем R:R = SL / (TP + SL) = 3 / 13 = 23%
        breakeven_wr = STOP_LOSS_PERCENT / (TAKE_PROFIT_PERCENT + STOP_LOSS_PERCENT) * 100
        ev_per_trade = (avg_wr / 100 * TAKE_PROFIT_PERCENT * LEVERAGE) \
                     - ((100 - avg_wr) / 100 * STOP_LOSS_PERCENT * LEVERAGE)
        verdict = f"✅ СТРАТЕГИЯ ПРИБЫЛЬНА — EV на сделку: +{ev_per_trade:.2f}% | Breakeven WR: {breakeven_wr:.0f}% | Можно идти на Testnet!" \
                  if total_profit > 0 and avg_wr > breakeven_wr \
                  else "⚠️  Стратегия требует доработки перед Testnet."
        print(f"\n  {verdict}")
    print("=" * 65)


if __name__ == "__main__":
    print("🔁 Запуск бэктеста...")
    print(f"   Монеты: {SYMBOLS}")
    print(f"   Период: {DAYS} дней  |  TP={TAKE_PROFIT_PERCENT}%  SL={STOP_LOSS_PERCENT}%  x{LEVERAGE}  Size={TRADE_PERCENT_SIZE}%")

    ex = init_exchange()
    results = []

    for sym in SYMBOLS:
        r = backtest_symbol(ex, sym)
        results.append(r)

    print_report(results)

    # Сохраняем детальный лог
    with open("backtest_results.json", "w") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    print("\n  Детальный лог → backtest_results.json")
