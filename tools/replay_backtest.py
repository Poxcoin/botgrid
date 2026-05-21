"""
replay_backtest.py — Replay бэктестер на реальных новостях + настоящем Claude.

Берёт новости из SQLite архива (news.db), прогоняет каждую через:
  1. Claude AI — реальный анализ тональности
  2. Исторические OHLCV — RSI и тренд на момент новости
  3. Упрощённая формула скоринга (AI + тренд + RSI)
  4. Симуляция PnL — ищем TP/SL на следующих 15m свечах

Результат: backtest_results/{run_id}.json

Запуск:
    python tools/replay_backtest.py                          # 30 дней, BTC+ETH+SOL
    python tools/replay_backtest.py --days 7                 # 7 дней
    python tools/replay_backtest.py --days 14 --coins BTC ETH  # конкретные монеты
    python tools/replay_backtest.py --balance 5000           # другой стартовый баланс

Примечание: факторы Funding Rate, OI, Whale, F&G, BTC Dom недоступны исторически
бесплатно — в replay используем нейтральные значения (не влияют на score).
"""
import os
import sys
import json
import time
import argparse
from datetime import datetime, timezone, timedelta

import ccxt

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from modules.news_archive import get_news, count as archive_count
from modules.ai_analyzer import analyze_sentiment
from config.settings import (
    TAKE_PROFIT_PERCENT, STOP_LOSS_PERCENT, LEVERAGE, TRADE_PERCENT_SIZE
)

# ─── Константы ────────────────────────────────────────────────────────────────
RESULTS_DIR = "backtest_results"
TIMEFRAME   = "15m"
RSI_PERIOD  = 14

_binance = ccxt.binance({"enableRateLimit": True})


# ─── Исторические OHLCV ───────────────────────────────────────────────────────

def _fetch_ohlcv_at(coin: str, ts_ms: int, bars_before: int = 60, bars_after: int = 100) -> tuple[list, list]:
    """
    Возвращает (candles_before, candles_after) относительно ts_ms.
    candles_before — для RSI и тренда.
    candles_after  — для симуляции TP/SL.
    """
    symbol = f"{coin.upper()}/USDT"
    interval_ms = 15 * 60 * 1000

    since_before = ts_ms - bars_before * interval_ms
    try:
        before = _binance.fetch_ohlcv(symbol, TIMEFRAME, since=since_before, limit=bars_before + 5)
        time.sleep(0.15)
        after = _binance.fetch_ohlcv(symbol, TIMEFRAME, since=ts_ms, limit=bars_after)
        time.sleep(0.15)
        return before, after
    except Exception as e:
        print(f"    OHLCV error {coin}: {e}")
        return [], []


def _calc_rsi(candles: list) -> float:
    closes = [c[4] for c in candles]
    if len(closes) < RSI_PERIOD + 1:
        return 50.0
    gains, losses = [], []
    for i in range(1, len(closes)):
        d = closes[i] - closes[i - 1]
        gains.append(max(d, 0))
        losses.append(max(-d, 0))
    avg_gain = sum(gains[-RSI_PERIOD:]) / RSI_PERIOD
    avg_loss = sum(losses[-RSI_PERIOD:]) / RSI_PERIOD
    if avg_loss == 0:
        return 100.0
    rs = avg_gain / avg_loss
    return round(100 - 100 / (1 + rs), 1)


def _calc_trend(candles: list) -> float:
    """24h тренд в % (96 баров × 15m = 24h)."""
    if len(candles) < 2:
        return 0.0
    price_now  = candles[-1][4]
    price_24h  = candles[max(0, len(candles) - 96)][4]
    if price_24h == 0:
        return 0.0
    return round((price_now - price_24h) / price_24h * 100, 2)


def _simulate_trade(action: str, entry_price: float, candles_after: list,
                    tp_pct: float, sl_pct: float) -> dict:
    """
    Симулирует сделку на последующих свечах.
    Возвращает result (WIN/LOSS/TIMEOUT), exit_price, bars_held.
    """
    if not candles_after or entry_price <= 0:
        return {"result": "TIMEOUT", "exit_price": entry_price, "bars_held": 0}

    if action == "LONG":
        tp = entry_price * (1 + tp_pct / 100)
        sl = entry_price * (1 - sl_pct / 100)
    else:
        tp = entry_price * (1 - tp_pct / 100)
        sl = entry_price * (1 + sl_pct / 100)

    for i, bar in enumerate(candles_after):
        _, _, high, low, close, _ = bar
        if action == "LONG":
            if low <= sl:
                return {"result": "LOSS", "exit_price": sl, "bars_held": i + 1}
            if high >= tp:
                return {"result": "WIN", "exit_price": tp, "bars_held": i + 1}
        else:  # SHORT
            if high >= sl:
                return {"result": "LOSS", "exit_price": sl, "bars_held": i + 1}
            if low <= tp:
                return {"result": "WIN", "exit_price": tp, "bars_held": i + 1}

    # Позиция не закрылась — закрываем по последней свече
    exit_price = candles_after[-1][4]
    return {"result": "TIMEOUT", "exit_price": exit_price, "bars_held": len(candles_after)}


def _calc_pnl(action: str, entry: float, exit_p: float,
              balance: float, size_pct: float, leverage: int) -> float:
    usdt_risk  = balance * (size_pct / 100)
    position   = usdt_risk * leverage
    qty        = position / entry
    if action == "LONG":
        return round((exit_p - entry) * qty, 2)
    else:
        return round((entry - exit_p) * qty, 2)


# ─── Упрощённая формула скоринга для replay ──────────────────────────────────

def _score(ai_score: int, trend: float, rsi: float) -> float:
    total = float(ai_score)

    # Тренд
    if ai_score > 0:
        if trend > 1.5:
            total += 2.0
        elif trend < -1.5:
            total -= 2.0
    elif ai_score < 0:
        if trend < -1.5:
            total -= 2.0
        elif trend > 1.5:
            total += 2.0

    # RSI
    if ai_score > 0 and rsi > 70:
        total -= 3.0
    elif ai_score < 0 and rsi < 30:
        total += 3.0

    return round(total, 1)


# ─── Фильтр крипто-монет ─────────────────────────────────────────────────────

_KNOWN = {"BTC","ETH","SOL","BNB","XRP","ADA","DOT","LINK","UNI","AAVE","SUI",
          "APT","OP","NEAR","INJ","FET","AVAX","MATIC","ATOM","LTC","DOGE","SHIB"}

def _valid_coin(coin: str) -> bool:
    return coin.upper() in _KNOWN


# ─── Главный цикл ────────────────────────────────────────────────────────────

def run(days: int = 30, coins_filter: list[str] | None = None,
        balance: float = 10_000.0, tp: float = None, sl: float = None,
        progress_cb=None) -> str:

    tp = tp or TAKE_PROFIT_PERCENT
    sl = sl or STOP_LOSS_PERCENT

    print(f"\n{'='*60}")
    print(f" Kado Replay Backtester")
    print(f" Период: {days} дней | Баланс: ${balance:,.0f}")
    print(f" TP: +{tp}% | SL: -{sl}% | Плечо: x{LEVERAGE}")
    print(f"{'='*60}\n")

    if archive_count() == 0:
        print(" Архив пустой. Сначала запусти:")
        print("   python tools/newsapi_fetch.py")
        print("   или подожди пока main.py накопит новости из RSS")
        sys.exit(1)

    news_items = get_news(days=days)
    print(f"Загружено из архива: {len(news_items)} новостей за {days} дней\n")

    run_id    = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    cur_bal   = balance
    trades    = []
    equity    = [[int(datetime.now(timezone.utc).timestamp() * 1000), cur_bal]]
    seen_links = set()

    processed = skipped_ai = skipped_score = skipped_coin = 0

    total_items = len(news_items)
    for idx, item in enumerate(news_items, 1):
        title = item.get("title", "")
        link  = item.get("link", "")
        if not title or link in seen_links:
            continue
        seen_links.add(link)
        if progress_cb:
            progress_cb(idx, total_items, run_id)

        print(f"[{idx}/{len(news_items)}] {title[:70]}...")

        # 1. Claude AI
        try:
            ai = analyze_sentiment(title, item.get("description", ""))
        except Exception as e:
            print(f"    Claude error: {e}")
            skipped_ai += 1
            continue

        ai_score = ai.get("score", 0)
        coin     = ai.get("coin", "BTC")
        ai_conf  = ai.get("confidence", 0)

        if abs(ai_score) < 4 or ai_conf < 3:
            skipped_ai += 1
            continue

        if not _valid_coin(coin):
            skipped_coin += 1
            continue

        if coins_filter and coin.upper() not in [c.upper() for c in coins_filter]:
            skipped_coin += 1
            continue

        # 2. Дата новости → timestamp_ms
        pub = item.get("published_at", "")
        try:
            pub_dt = datetime.fromisoformat(pub.replace("Z", "+00:00"))
            ts_ms  = int(pub_dt.timestamp() * 1000)
        except Exception:
            skipped_score += 1
            continue

        # 3. Исторические OHLCV
        candles_before, candles_after = _fetch_ohlcv_at(coin, ts_ms)
        if not candles_before or not candles_after:
            skipped_score += 1
            continue

        entry_price = candles_after[0][4]   # close первой свечи после новости
        rsi         = _calc_rsi(candles_before)
        trend       = _calc_trend(candles_before)

        # 4. Скоринг
        total_score = _score(ai_score, trend, rsi)

        if abs(total_score) < 8:
            skipped_score += 1
            processed += 1
            continue

        action = "LONG" if total_score >= 8 else "SHORT"
        processed += 1

        # 5. Симуляция PnL
        sim = _simulate_trade(action, entry_price, candles_after, tp, sl)
        pnl = _calc_pnl(action, entry_price, sim["exit_price"], cur_bal, TRADE_PERCENT_SIZE, LEVERAGE)

        cur_bal = round(cur_bal + pnl, 2)
        ts_equity = int(pub_dt.timestamp() * 1000)
        equity.append([ts_equity, cur_bal])

        trade = {
            "timestamp":   pub,
            "coin":        coin,
            "action":      action,
            "score":       total_score,
            "ai_score":    ai_score,
            "rsi":         rsi,
            "trend_24h":   trend,
            "entry_price": entry_price,
            "exit_price":  sim["exit_price"],
            "bars_held":   sim["bars_held"],
            "result":      sim["result"],
            "pnl_usdt":    pnl,
            "balance":     cur_bal,
            "news_title":  title,
            "source":      item.get("source", ""),
        }
        trades.append(trade)

        icon = "" if pnl > 0 else "" if pnl < 0 else ""
        print(f"  → {action} {coin} | score={total_score} | {sim['result']} {icon} | PnL: ${pnl:+.2f} | Bal: ${cur_bal:,.2f}")

        time.sleep(0.3)  # не спамим Binance

    # ─── Итоги ───────────────────────────────────────────────────────────────

    wins    = sum(1 for t in trades if t["result"] == "WIN")
    losses  = sum(1 for t in trades if t["result"] == "LOSS")
    timeout = sum(1 for t in trades if t["result"] == "TIMEOUT")
    total_pnl = round(cur_bal - balance, 2)
    roi_pct   = round(total_pnl / balance * 100, 2)
    wr        = round(wins / len(trades) * 100, 1) if trades else 0.0

    summary = {
        "trades":      len(trades),
        "wins":        wins,
        "losses":      losses,
        "timeout":     timeout,
        "win_rate":    wr,
        "total_pnl":   total_pnl,
        "roi_pct":     roi_pct,
        "initial":     balance,
        "final":       cur_bal,
        "skipped_ai":    skipped_ai,
        "skipped_score": skipped_score,
        "skipped_coin":  skipped_coin,
        "processed":     processed,
    }

    result = {
        "run_id":       run_id,
        "params":       {"days": days, "coins": coins_filter, "balance": balance, "tp": tp, "sl": sl},
        "summary":      summary,
        "equity_curve": equity,
        "trades":       trades,
    }

    # ─── Сохраняем ───────────────────────────────────────────────────────────
    os.makedirs(RESULTS_DIR, exist_ok=True)
    out_path = os.path.join(RESULTS_DIR, f"{run_id}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"\n{'='*60}")
    print(f" РЕЗУЛЬТАТЫ")
    print(f"{'='*60}")
    print(f" Сделок: {len(trades)}  |  Win Rate: {wr}%")
    print(f" WIN: {wins}  LOSS: {losses}  TIMEOUT: {timeout}")
    print(f" Итоговый PnL: ${total_pnl:+,.2f}  |  ROI: {roi_pct:+.1f}%")
    print(f" Баланс: ${balance:,.2f} → ${cur_bal:,.2f}")
    print(f"{'='*60}")
    print(f"\n Результат сохранён: {out_path}\n")

    return out_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Kado Replay Backtester")
    parser.add_argument("--days",    type=int,   default=30,          help="Глубина истории (дней)")
    parser.add_argument("--coins",   nargs="+",  default=None,        help="Монеты (напр. BTC ETH SOL)")
    parser.add_argument("--balance", type=float, default=10_000.0,    help="Стартовый баланс USDT")
    parser.add_argument("--tp",      type=float, default=None,        help="Take Profit %%")
    parser.add_argument("--sl",      type=float, default=None,        help="Stop Loss %%")
    args = parser.parse_args()

    run(days=args.days, coins_filter=args.coins, balance=args.balance, tp=args.tp, sl=args.sl)
