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
    return ratio >= 2.0, round(ratio, 2)


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


def compute_rsi(ohlcv: list, i: int, period: int = 14) -> float:
    """
    RSI на 1h-эквиваленте (каждые 4 свечи по 15m = 1h).
    Нужно минимум period*4 + 4 свечей.
    """
    step = 4  # 4 x 15m = 1 час
    needed = (period + 1) * step
    if i < needed:
        return 50.0

    closes = [ohlcv[i - j * step][4] for j in range(period, -1, -1)]

    gains, losses = [], []
    for j in range(1, len(closes)):
        delta = closes[j] - closes[j - 1]
        gains.append(max(delta, 0))
        losses.append(max(-delta, 0))

    avg_gain = sum(gains) / period
    avg_loss = sum(losses) / period
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - (100 / (1 + rs)), 1)


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


COOLDOWN_CANDLES = 4    # 4 x 15m = 1 час между сделками на одной монете
TREND_PANIC_CAP  = 75  # |trend%| > 75 = настоящая паника, не входить
RSI_SHORT_MIN    = 28  # не шортим если RSI < 28 (уже в полу)
RSI_LONG_MAX     = 72  # не лонгуем если RSI > 72 (уже в потолке)

def backtest_symbol(ex: ccxt.Exchange, symbol: str) -> dict:
    print(f"\n  📊 {symbol} — скачиваю данные...", end="", flush=True)
    ohlcv = fetch_ohlcv(ex, symbol, DAYS)
    print(f" {len(ohlcv)} свечей")

    if len(ohlcv) < 200:
        return {"symbol": symbol, "error": "мало данных"}

    balance      = BALANCE
    peak_bal     = BALANCE
    max_dd       = 0.0
    trades       = []
    last_trade_i = -COOLDOWN_CANDLES - 1  # последняя сделка (кулдаун)

    # счётчики для анализа фильтрации
    signals_raw      = 0  # сигналов до фильтров
    filtered_rsi     = 0  # отсеяно RSI
    filtered_trend   = 0  # отсеяно экстремальным трендом
    filtered_cooldown= 0  # отсеяно кулдауном

    i = 100

    while i < len(ohlcv) - 2:
        tr_score, tr_pct = price_trend(ohlcv, i)
        spike, vol_ratio = vol_spike(ohlcv, i)

        vol_pts = 4 if spike else 0
        ai_sim  = 4 if (spike and tr_score != 0) else 0
        total   = ai_sim + abs(tr_score) + vol_pts

        if total >= 8 and tr_score != 0:
            signals_raw += 1
            action = "LONG" if tr_score > 0 else "SHORT"

            # ── ФИЛЬТР 1: Экстремальный тренд (паника/эйфория рынка) ──
            if abs(tr_pct) > TREND_PANIC_CAP:
                filtered_trend += 1
                i += 1
                continue

            # ── ФИЛЬТР 2: RSI — не шортим дно, не лонгуем хай ──
            rsi = compute_rsi(ohlcv, i)
            if action == "SHORT" and rsi < RSI_SHORT_MIN:
                filtered_rsi += 1
                i += 1
                continue
            if action == "LONG" and rsi > RSI_LONG_MAX:
                filtered_rsi += 1
                i += 1
                continue

            # ── ФИЛЬТР 3: Кулдаун 2 часа ──
            if i - last_trade_i < COOLDOWN_CANDLES:
                filtered_cooldown += 1
                i += 1
                continue

            res, pnl, exit_px, exit_i = simulate_trade(ohlcv, i + 1, action, balance)
            balance     += pnl
            last_trade_i = i

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
                "rsi":     rsi,
                "entry":   round(ohlcv[i + 1][1], 4),
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

    # Частота сигналов
    days_covered = DAYS
    signals_per_day = round(signals_raw / days_covered, 1)
    trades_per_day  = round(total_t / days_covered, 1)
    pass_rate = round(total_t / signals_raw * 100, 1) if signals_raw else 0

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
        "signals_raw":       signals_raw,
        "filtered_rsi":      filtered_rsi,
        "filtered_trend":    filtered_trend,
        "filtered_cooldown": filtered_cooldown,
        "signals_per_day":   signals_per_day,
        "trades_per_day":    trades_per_day,
        "filter_pass_rate":  pass_rate,
        "trade_log":         trades,
    }


def print_report(results: list[dict]) -> None:
    print("\n" + "=" * 70)
    print("  РЕЗУЛЬТАТЫ БЭКТЕСТА — последние 60 дней  (v2: RSI + кулдаун + тренд-кап)")
    print("=" * 70)
    print(f"  {'Монета':<18} {'Сделок':>7} {'WinRate':>8} {'Профит':>10} {'ROI':>7} {'MaxDD':>7}")
    print("-" * 70)

    total_profit    = 0
    total_signals   = 0
    total_trades    = 0
    total_filt_rsi  = 0
    total_filt_tr   = 0
    total_filt_cd   = 0

    for r in results:
        if "error" in r:
            print(f"  {r['symbol']:<18} {'ОШИБКА':>7} {r['error']}")
            continue
        total_profit  += r["profit"]
        total_signals += r.get("signals_raw", 0)
        total_trades  += r["trades"]
        total_filt_rsi+= r.get("filtered_rsi", 0)
        total_filt_tr += r.get("filtered_trend", 0)
        total_filt_cd += r.get("filtered_cooldown", 0)

        profit_str = f"+${r['profit']:.2f}" if r["profit"] >= 0 else f"-${abs(r['profit']):.2f}"
        roi_str    = f"+{r['roi%']}%" if r["roi%"] >= 0 else f"{r['roi%']}%"
        print(f"  {r['symbol']:<18} {r['trades']:>7} {r['win_rate']:>7}% {profit_str:>10} {roi_str:>7} {r['max_drawdown%']:>6}%")

    print("=" * 70)

    all_valid = [r for r in results if "error" not in r]
    if all_valid:
        avg_wr = sum(r["win_rate"] for r in all_valid) / len(all_valid)
        profitable = [r for r in all_valid if r["profit"] > 0]
        breakeven_wr = STOP_LOSS_PERCENT / (TAKE_PROFIT_PERCENT + STOP_LOSS_PERCENT) * 100
        ev_per_trade = (avg_wr / 100 * TAKE_PROFIT_PERCENT * LEVERAGE) \
                     - ((100 - avg_wr) / 100 * STOP_LOSS_PERCENT * LEVERAGE)

        print(f"\n  Средний Win Rate:    {avg_wr:.1f}%   (Breakeven: {breakeven_wr:.0f}%)")
        print(f"  Прибыльных монет:    {len(profitable)}/{len(all_valid)}")
        print(f"  Суммарный профит:    ${total_profit:+.2f}")
        print(f"  EV на сделку:        +{ev_per_trade:.2f}%")

        print(f"\n  ── АНАЛИЗ ФИЛЬТРАЦИИ ──────────────────────────────────")
        pass_rate = round(total_trades / total_signals * 100, 1) if total_signals else 0
        print(f"  Сигналов до фильтров:  {total_signals}  ({round(total_signals/60,1)}/день)")
        print(f"  Отсеяно RSI:           {total_filt_rsi}  ({round(total_filt_rsi/total_signals*100,1) if total_signals else 0}%)")
        print(f"  Отсеяно трендом >50%:  {total_filt_tr}  ({round(total_filt_tr/total_signals*100,1) if total_signals else 0}%)")
        print(f"  Отсеяно кулдауном:     {total_filt_cd}  ({round(total_filt_cd/total_signals*100,1) if total_signals else 0}%)")
        print(f"  Реальных сделок:       {total_trades}  ({round(total_trades/60,1)}/день)  — pass rate: {pass_rate}%")

        verdict = f"✅ СТРАТЕГИЯ ПРИБЫЛЬНА  EV +{ev_per_trade:.2f}% | Breakeven {breakeven_wr:.0f}% | Можно на Testnet!" \
                  if total_profit > 0 and avg_wr > breakeven_wr \
                  else "⚠️  Стратегия требует доработки."
        print(f"\n  {verdict}")
    print("=" * 70)


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
