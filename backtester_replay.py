"""
backtester_replay.py — Replay Backtester

Реальные новости (NewsAPI) + реальный Claude AI + реальные исторические цены Binance.
Точнее backtester.py: не симулирует AI, а прогоняет настоящие новости через бота.

Ограничения:
  - NewsAPI free tier: до 30 дней истории, 100 req/день
  - Fear&Greed + BTC Dominance: текущие значения (исторического API нет — норм)
  - Whale detector: отключён (исторических trade-данных нет)

Использование:
  python backtester_replay.py              # 7 дней
  python backtester_replay.py --days 14   # 14 дней
  python backtester_replay.py --days 30   # максимум для free tier
"""

import argparse
import json
import time
import httpx
import ccxt
from datetime import datetime, timezone, timedelta

from config.settings import (
    NEWSAPI_KEY, LEVERAGE, TRADE_PERCENT_SIZE,
    TAKE_PROFIT_PERCENT, STOP_LOSS_PERCENT,
)
from modules.news_parser import is_altcoin_news, check_panic_news
from modules.decision_maker import generate_signal

# ─── Config ───────────────────────────────────────────────────────────────────
DEFAULT_DAYS  = 7
BALANCE       = 10_000.0
MAX_ARTICLES  = 300      # лимит Claude API вызовов за сессию
CLAUDE_DELAY  = 0.35     # пауза между вызовами

# Поисковые запросы для NewsAPI (3 запроса × до 5 страниц = до 1500 статей)
_NEWSAPI_QUERIES = [
    "bitcoin OR ethereum OR solana OR crypto",
    "DeFi blockchain altcoin token",
    "crypto hack OR listing OR ETF OR mainnet",
]

_binance = ccxt.binance({"enableRateLimit": True})


# ─── NewsAPI ──────────────────────────────────────────────────────────────────

def fetch_newsapi(days: int) -> list[dict]:
    if not NEWSAPI_KEY:
        raise RuntimeError("NEWSAPI_KEY не задан в .env")

    since = datetime.now(timezone.utc) - timedelta(days=days)
    seen_urls: set[str] = set()
    raw: list[dict] = []

    for query in _NEWSAPI_QUERIES:
        for page in range(1, 6):  # до 5 страниц на запрос
            try:
                r = httpx.get(
                    "https://newsapi.org/v2/everything",
                    params={
                        "q":        query,
                        "from":     since.strftime("%Y-%m-%dT%H:%M:%SZ"),
                        "language": "en",
                        "sortBy":   "publishedAt",
                        "pageSize": 100,
                        "page":     page,
                        "apiKey":   NEWSAPI_KEY,
                    },
                    timeout=15,
                )
                data = r.json()

                if data.get("status") != "ok":
                    print(f"  [NewsAPI] {data.get('message', 'неизвестная ошибка')}")
                    break

                articles = data.get("articles", [])
                if not articles:
                    break

                for a in articles:
                    url = a.get("url", "")
                    if not url or url in seen_urls:
                        continue
                    seen_urls.add(url)

                    title = (a.get("title") or "").strip()
                    if not title or title == "[Removed]":
                        continue

                    published_at = a.get("publishedAt", "")
                    try:
                        pub_dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
                    except Exception:
                        continue

                    raw.append({
                        "title":        title,
                        "description":  (a.get("description") or "")[:300],
                        "link":         url,
                        "source":       a.get("source", {}).get("name", "NewsAPI"),
                        "source_url":   url,
                        "source_weight": 0.75,
                        "published_dt": pub_dt.isoformat(),
                        "published_ts": pub_dt.timestamp(),
                        "timestamp_ms": int(pub_dt.timestamp() * 1000),
                        "is_panic":     check_panic_news(title),
                    })

                if len(articles) < 100:
                    break
                time.sleep(0.4)

            except Exception as e:
                print(f"  [NewsAPI] ошибка запроса: {e}")
                break

    # Дедупликация по заголовку
    seen_titles: set[str] = set()
    dedup: list[dict] = []
    for a in raw:
        key = a["title"].lower()[:80]
        if key not in seen_titles:
            seen_titles.add(key)
            dedup.append(a)

    # Оставляем только крипто-новости
    crypto = [a for a in dedup if a["is_panic"] or is_altcoin_news(a["title"])]
    crypto.sort(key=lambda x: x["published_ts"])  # хронологически

    print(f"  NewsAPI: {len(seen_urls)} URL → {len(dedup)} уникальных → {len(crypto)} крипто-новостей")
    return crypto


# ─── Trade simulation ─────────────────────────────────────────────────────────

def simulate_trade(coin: str, action: str, signal_ts_ms: int, balance: float) -> dict | None:
    symbol = f"{coin}/USDT"
    try:
        _binance.load_markets()
        if symbol not in _binance.markets:
            return None

        # 300 свечей × 15m = 75 часов вперёд
        ohlcv = _binance.fetch_ohlcv(symbol, "15m", since=signal_ts_ms, limit=302)
        if len(ohlcv) < 2:
            return None

        entry_price = ohlcv[1][1]  # open следующей свечи
        usdt_risk   = balance * (TRADE_PERCENT_SIZE / 100)

        tp = entry_price * (1 + TAKE_PROFIT_PERCENT / 100) if action == "LONG" \
             else entry_price * (1 - TAKE_PROFIT_PERCENT / 100)
        sl = entry_price * (1 - STOP_LOSS_PERCENT / 100) if action == "LONG" \
             else entry_price * (1 + STOP_LOSS_PERCENT / 100)

        result = None
        exit_price = entry_price
        exit_ts    = ohlcv[1][0]

        for c in ohlcv[1:]:
            hi, lo = c[2], c[3]
            if action == "LONG":
                if lo <= sl:
                    result, exit_price, exit_ts = "LOSS", sl, c[0]; break
                if hi >= tp:
                    result, exit_price, exit_ts = "WIN",  tp, c[0]; break
            else:
                if hi >= sl:
                    result, exit_price, exit_ts = "LOSS", sl, c[0]; break
                if lo <= tp:
                    result, exit_price, exit_ts = "WIN",  tp, c[0]; break

        if result is None:
            exit_price = ohlcv[-1][4]
            exit_ts    = ohlcv[-1][0]
            chg = (exit_price - entry_price) / entry_price
            if action == "SHORT":
                chg = -chg
            result = "WIN" if chg > 0 else "LOSS"
            pnl = usdt_risk * LEVERAGE * chg
        else:
            pnl = (usdt_risk * LEVERAGE * TAKE_PROFIT_PERCENT / 100) if result == "WIN" \
                  else -(usdt_risk * LEVERAGE * STOP_LOSS_PERCENT / 100)

        def fmt_ts(ms):
            return datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M")

        return {
            "result":      result,
            "pnl":         round(pnl, 4),
            "entry_price": round(entry_price, 6),
            "exit_price":  round(exit_price, 6),
            "entry_time":  fmt_ts(ohlcv[1][0]),
            "exit_time":   fmt_ts(exit_ts),
        }

    except Exception as e:
        print(f"  [sim] {coin}: {e}")
        return None


# ─── Main ─────────────────────────────────────────────────────────────────────

def run_replay(days: int) -> None:
    print(f"\n{'='*65}")
    print(f"  REPLAY BACKTESTER — реальные новости NewsAPI + Claude AI")
    print(f"  Период: {days} дней  |  TP={TAKE_PROFIT_PERCENT}%  SL={STOP_LOSS_PERCENT}%  "
          f"x{LEVERAGE}  Size={TRADE_PERCENT_SIZE}%")
    print(f"{'='*65}\n")

    # 1. Загружаем новости
    print("1. Загружаем новости из NewsAPI...")
    articles = fetch_newsapi(days)
    print()

    if not articles:
        print("  Новостей не найдено. Проверь NEWSAPI_KEY и количество дней.")
        return

    if len(articles) > MAX_ARTICLES:
        print(f"  Ограничено до {MAX_ARTICLES} из {len(articles)} (бюджет Claude API).")
        articles = articles[-MAX_ARTICLES:]  # самые свежие

    # 2. Прогоняем через AI + 8-факторную формулу
    print(f"2. Анализирую {len(articles)} статей (Claude Haiku + формула)...\n")

    balance       = BALANCE
    peak_bal      = BALANCE
    max_dd        = 0.0
    trades: list  = []
    open_pos: dict = {}  # coin -> True = занята

    n_signals = 0
    n_hold    = 0

    for idx, article in enumerate(articles):
        if idx > 0 and idx % 25 == 0:
            print(f"  [{idx}/{len(articles)}] баланс=${balance:,.0f}  сделок={len(trades)}")

        try:
            signal = generate_signal(article)
            time.sleep(CLAUDE_DELAY)
        except Exception as e:
            print(f"  [!] signal error: {e}")
            continue

        if not signal:
            continue

        n_signals += 1
        action = signal["action"]

        if action == "SELL_ALL":
            open_pos.clear()
            continue

        if action == "HOLD":
            n_hold += 1
            continue

        coin = signal["coin"]
        if open_pos.get(coin):
            continue  # позиция уже открыта

        trade = simulate_trade(coin, action, article["timestamp_ms"], balance)
        if not trade:
            continue

        open_pos[coin] = True
        balance += trade["pnl"]
        open_pos[coin] = False

        if balance > peak_bal:
            peak_bal = balance
        dd = (peak_bal - balance) / peak_bal * 100
        if dd > max_dd:
            max_dd = dd

        trades.append({
            "news_time":   article["published_dt"][:16],
            "coin":        coin,
            "action":      action,
            "score":       signal["total_score"],
            "confidence":  signal["confidence"],
            "entry_time":  trade["entry_time"],
            "exit_time":   trade["exit_time"],
            "entry":       trade["entry_price"],
            "exit":        trade["exit_price"],
            "result":      trade["result"],
            "pnl":         trade["pnl"],
            "balance":     round(balance, 2),
            "news":        article["title"][:80],
            "source":      article["source"],
        })

    # 3. Отчёт
    wins   = sum(1 for t in trades if t["result"] == "WIN")
    losses = sum(1 for t in trades if t["result"] == "LOSS")
    total  = wins + losses
    profit = balance - BALANCE

    print(f"\n{'='*65}")
    print(f"  РЕЗУЛЬТАТЫ — {days} дней")
    print(f"{'='*65}")
    print(f"  Статей обработано:     {len(articles)}")
    print(f"  Сигналов всего:        {n_signals}")
    print(f"  HOLD (отфильтровано):  {n_hold}")
    print(f"  Сделок совершено:      {total}")

    if total > 0:
        wr   = wins / total * 100
        bew  = STOP_LOSS_PERCENT / (TAKE_PROFIT_PERCENT + STOP_LOSS_PERCENT) * 100
        ev   = (wr / 100 * TAKE_PROFIT_PERCENT * LEVERAGE) \
             - ((100 - wr) / 100 * STOP_LOSS_PERCENT * LEVERAGE)
        roi  = profit / BALANCE * 100

        print(f"\n  WIN: {wins}  |  LOSS: {losses}  |  WinRate: {wr:.1f}%  "
              f"(breakeven: {bew:.0f}%)")
        print(f"  Начало: ${BALANCE:,.2f}   →   Конец: ${balance:,.2f}")
        pstr = f"+${profit:,.2f}" if profit >= 0 else f"-${abs(profit):,.2f}"
        rstr = f"+{roi:.2f}%" if roi >= 0 else f"{roi:.2f}%"
        print(f"  Профит: {pstr}  ({rstr})")
        print(f"  EV на сделку: {ev:+.2f}%   |   Max Drawdown: {max_dd:.1f}%")

        verdict = "✅ СТРАТЕГИЯ ПРИБЫЛЬНА" if profit > 0 and wr > bew \
                  else "⚠️  Стратегия требует доработки"
        print(f"\n  {verdict}")

        print(f"\n  ── СДЕЛКИ ───────────────────────────────────────────────────")
        print(f"  {'Новость':<17}  {'Монета':<6} {'Акция':<6} {'Score':>6} "
              f"{'Conf':>5} {'PnL':>9}  Итог")
        print(f"  {'-'*67}")
        for t in trades:
            pnl_s = f"+${t['pnl']:.2f}" if t["pnl"] >= 0 else f"-${abs(t['pnl']):.2f}"
            icon  = "✅" if t["result"] == "WIN" else "❌"
            print(f"  {t['news_time']:<17}  {t['coin']:<6} {t['action']:<6} "
                  f"{t['score']:>6.1f} {t['confidence']:>5}% {pnl_s:>9}  {icon}")

    else:
        print(f"\n  Сделок нет. Вероятные причины:")
        print(f"    — за {days} дней мало событий с score ≥ 8")
        print(f"    — попробуй --days 14 или --days 30")

    print(f"{'='*65}")

    output = {
        "meta": {
            "days": days,
            "articles": len(articles),
            "signals": n_signals,
            "hold_filtered": n_hold,
        },
        "stats": {
            "trades": total,
            "wins": wins,
            "losses": losses,
            "win_rate": round(wins / total * 100, 1) if total else 0,
            "initial": BALANCE,
            "final": round(balance, 2),
            "profit": round(profit, 2),
            "roi_pct": round(profit / BALANCE * 100, 2),
            "max_drawdown_pct": round(max_dd, 2),
        },
        "trades": trades,
    }

    with open("backtest_replay_results.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print(f"\n  Детальный лог → backtest_replay_results.json")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS,
                        help="Глубина истории в днях (по умолчанию 7, max 30 для free tier)")
    args = parser.parse_args()
    run_replay(days=args.days)
