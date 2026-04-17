"""
backtester_replay.py — Replay Backtester

Источники новостей (по приоритету):
  1. Локальная news.db — всё что бот собрал за время работы (основной)
  2. NewsAPI         — дополнение если нужно больше данных (--newsapi флаг)

Реальный Claude AI + реальные исторические цены Binance.

Ограничения:
  - Fear&Greed + BTC Dominance: текущие значения (нет исторического API)
  - Whale detector: отключён (нет исторических trade-данных)
  - NewsAPI free: 100 статей max, до 30 дней

Использование:
  python backtester_replay.py              # news.db, все дни
  python backtester_replay.py --days 14   # news.db за 14 дней
  python backtester_replay.py --newsapi   # + добавить NewsAPI статьи
  python backtester_replay.py --min-score 5
"""

import argparse
import json
import time
import ccxt
from datetime import datetime, timezone, timedelta

from config.settings import (
    NEWSAPI_KEY, LEVERAGE, TRADE_PERCENT_SIZE,
    TAKE_PROFIT_PERCENT, STOP_LOSS_PERCENT,
)
from modules.news_parser import is_altcoin_news, check_panic_news
from modules.news_archive import get_news, init_db
from modules.decision_maker import generate_signal

# ─── Config ───────────────────────────────────────────────────────────────────
DEFAULT_DAYS      = 30
DEFAULT_MIN_SCORE = 6.0   # ниже боевых 8.0 (whale/OI/funding недоступны в replay)
BALANCE           = 10_000.0
MAX_ARTICLES      = 500
CLAUDE_DELAY      = 0.35

_binance = ccxt.binance({"enableRateLimit": True})


# ─── Источник 1: локальная news.db ───────────────────────────────────────────

def fetch_from_db(days: int) -> list[dict]:
    """Читает новости из локальной news.db (бот собирал их во время работы)."""
    init_db()
    rows = get_news(days=days, limit=MAX_ARTICLES)
    result = []
    for r in rows:
        published_str = r.get("published_at", "")
        try:
            pub_dt = datetime.fromisoformat(published_str.replace("Z", "+00:00"))
            if pub_dt.tzinfo is None:
                pub_dt = pub_dt.replace(tzinfo=timezone.utc)
        except Exception:
            pub_dt = datetime.now(timezone.utc)

        title = (r.get("title") or "").strip()
        if not title:
            continue

        result.append({
            "title":        title,
            "description":  (r.get("description") or "")[:300],
            "link":         r.get("link", ""),
            "source":       r.get("source", "archive"),
            "source_url":   r.get("link", ""),
            "source_weight": float(r.get("source_weight") or 0.75),
            "published_dt": pub_dt.isoformat(),
            "published_ts": pub_dt.timestamp(),
            "timestamp_ms": int(pub_dt.timestamp() * 1000),
            "is_panic":     check_panic_news(title),
        })

    result.sort(key=lambda x: x["published_ts"])
    print(f"  news.db: {len(result)} статей за {days} дней")
    return result


# ─── Источник 2: NewsAPI (дополнение) ────────────────────────────────────────

def fetch_from_newsapi(days: int) -> list[dict]:
    """Дополнительные статьи из NewsAPI (free: 100 max)."""
    try:
        import httpx
    except ImportError:
        print("  [NewsAPI] httpx не установлен, пропускаю")
        return []

    if not NEWSAPI_KEY:
        print("  [NewsAPI] ключ не задан, пропускаю")
        return []

    since = datetime.now(timezone.utc) - timedelta(days=days)
    queries = [
        "bitcoin OR ethereum OR solana OR crypto",
        "DeFi blockchain altcoin hack listing",
    ]
    seen: set[str] = set()
    raw: list[dict] = []

    for q in queries:
        try:
            r = httpx.get(
                "https://newsapi.org/v2/everything",
                params={
                    "q": q, "from": since.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "language": "en", "sortBy": "publishedAt",
                    "pageSize": 100, "page": 1, "apiKey": NEWSAPI_KEY,
                },
                timeout=15,
            )
            data = r.json()
            if data.get("status") != "ok":
                print(f"  [NewsAPI] {data.get('message', 'ошибка')}")
                continue
            for a in data.get("articles", []):
                url = a.get("url", "")
                if not url or url in seen:
                    continue
                seen.add(url)
                title = (a.get("title") or "").strip()
                if not title or title == "[Removed]":
                    continue
                try:
                    pub_dt = datetime.fromisoformat(
                        a.get("publishedAt", "").replace("Z", "+00:00"))
                except Exception:
                    continue
                raw.append({
                    "title": title,
                    "description": (a.get("description") or "")[:300],
                    "link": url, "source": a.get("source", {}).get("name", "NewsAPI"),
                    "source_url": url, "source_weight": 0.75,
                    "published_dt": pub_dt.isoformat(),
                    "published_ts": pub_dt.timestamp(),
                    "timestamp_ms": int(pub_dt.timestamp() * 1000),
                    "is_panic": check_panic_news(title),
                })
            time.sleep(0.5)
        except Exception as e:
            print(f"  [NewsAPI] {e}")

    crypto = [a for a in raw if a["is_panic"] or is_altcoin_news(a["title"])]
    print(f"  NewsAPI: {len(seen)} URL → {len(crypto)} крипто-новостей")
    return crypto


# ─── Trade simulation ─────────────────────────────────────────────────────────

def simulate_trade(coin: str, action: str, signal_ts_ms: int, balance: float) -> dict | None:
    symbol = f"{coin}/USDT"
    try:
        _binance.load_markets()
        if symbol not in _binance.markets:
            return None

        ohlcv = _binance.fetch_ohlcv(symbol, "15m", since=signal_ts_ms, limit=302)
        if len(ohlcv) < 2:
            return None

        entry_price = ohlcv[1][1]
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
                if lo <= sl: result, exit_price, exit_ts = "LOSS", sl, c[0]; break
                if hi >= tp: result, exit_price, exit_ts = "WIN",  tp, c[0]; break
            else:
                if hi >= sl: result, exit_price, exit_ts = "LOSS", sl, c[0]; break
                if lo <= tp: result, exit_price, exit_ts = "WIN",  tp, c[0]; break

        if result is None:
            exit_price = ohlcv[-1][4]
            exit_ts    = ohlcv[-1][0]
            chg = (exit_price - entry_price) / entry_price
            if action == "SHORT": chg = -chg
            result = "WIN" if chg > 0 else "LOSS"
            pnl = usdt_risk * LEVERAGE * chg
        else:
            pnl = (usdt_risk * LEVERAGE * TAKE_PROFIT_PERCENT / 100) if result == "WIN" \
                  else -(usdt_risk * LEVERAGE * STOP_LOSS_PERCENT / 100)

        def fmt(ms): return datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M")
        return {
            "result": result, "pnl": round(pnl, 4),
            "entry_price": round(entry_price, 6), "exit_price": round(exit_price, 6),
            "entry_time": fmt(ohlcv[1][0]), "exit_time": fmt(exit_ts),
        }
    except Exception as e:
        print(f"  [sim] {coin}: {e}")
        return None


# ─── Main ─────────────────────────────────────────────────────────────────────

def run_replay(days: int, min_score: float, use_newsapi: bool) -> None:
    print(f"\n{'='*65}")
    print(f"  REPLAY BACKTESTER — реальные новости + Claude AI")
    print(f"  Период: {days} дней  |  TP={TAKE_PROFIT_PERCENT}%  SL={STOP_LOSS_PERCENT}%  "
          f"x{LEVERAGE}  Size={TRADE_PERCENT_SIZE}%  min_score={min_score}")
    print(f"{'='*65}\n")

    print("1. Загружаем новости...")
    articles = fetch_from_db(days)

    if use_newsapi:
        extra = fetch_from_newsapi(days)
        # Объединяем, убираем дубли по заголовку
        existing = {a["title"].lower()[:80] for a in articles}
        added = [a for a in extra if a["title"].lower()[:80] not in existing]
        articles.extend(added)
        if added:
            print(f"  NewsAPI добавил {len(added)} новых статей")

    articles.sort(key=lambda x: x["published_ts"])

    total_avail = len(articles)
    if total_avail > MAX_ARTICLES:
        print(f"  Ограничено до {MAX_ARTICLES} из {total_avail}")
        articles = articles[-MAX_ARTICLES:]

    print(f"  Итого: {len(articles)} статей для анализа\n")

    if not articles:
        print("  Нет данных. Бот ещё не набрал историю — запусти его на VPS и подожди.")
        return

    print(f"2. Анализирую через Claude Haiku + 8-факторную формулу...\n")

    balance    = BALANCE
    peak_bal   = BALANCE
    max_dd     = 0.0
    trades     = []
    open_pos   = {}
    n_signals  = 0
    n_hold     = 0

    for idx, article in enumerate(articles):
        if idx > 0 and idx % 25 == 0:
            print(f"  [{idx}/{len(articles)}] баланс=${balance:,.0f}  сделок={len(trades)}")

        try:
            signal = generate_signal(article)
            time.sleep(CLAUDE_DELAY)
        except Exception as e:
            print(f"  [!] {e}")
            continue

        if not signal:
            continue

        n_signals += 1
        sc = signal["total_score"]
        cf = signal["confidence"]

        if signal["action"] == "SELL_ALL":
            open_pos.clear()
            continue

        # В replay режиме переопределяем action из score (generate_signal использует порог 8.0,
        # но в replay нет whale/OI/funding → реальный эффективный порог должен быть ниже)
        if abs(sc) >= min_score and cf >= 35:
            action = "LONG" if sc > 0 else "SHORT"
        else:
            if abs(sc) >= min_score * 0.7:
                print(f"  HOLD  {signal['coin']:<5} score={sc:+.1f} conf={cf}%  "
                      f"«{article['title'][:55]}»")
            n_hold += 1
            continue

        coin = signal["coin"]
        if open_pos.get(coin):
            continue

        trade = simulate_trade(coin, action, article["timestamp_ms"], balance)
        if not trade:
            continue

        open_pos[coin] = True
        balance += trade["pnl"]
        open_pos[coin] = False

        if balance > peak_bal: peak_bal = balance
        dd = (peak_bal - balance) / peak_bal * 100
        if dd > max_dd: max_dd = dd

        icon = "✅" if trade["result"] == "WIN" else "❌"
        pnl_s = f"+${trade['pnl']:.2f}" if trade["pnl"] >= 0 else f"-${abs(trade['pnl']):.2f}"
        print(f"  {icon} {action:<5} {coin:<5} {sc:+.1f} conf={cf}%  {pnl_s}  "
              f"«{article['title'][:45]}»")

        trades.append({
            "news_time":  article["published_dt"][:16],
            "coin": coin, "action": action,
            "score": sc, "confidence": cf,
            "entry_time": trade["entry_time"], "exit_time": trade["exit_time"],
            "entry": trade["entry_price"],      "exit": trade["exit_price"],
            "result": trade["result"],          "pnl": trade["pnl"],
            "balance": round(balance, 2),
            "news": article["title"][:80],      "source": article["source"],
        })

    wins   = sum(1 for t in trades if t["result"] == "WIN")
    losses = sum(1 for t in trades if t["result"] == "LOSS")
    total  = wins + losses
    profit = balance - BALANCE

    print(f"\n{'='*65}")
    print(f"  РЕЗУЛЬТАТЫ — {days} дней")
    print(f"{'='*65}")
    print(f"  Статей: {len(articles)}  |  Сигналов: {n_signals}  |  HOLD: {n_hold}  |  Сделок: {total}")

    if total > 0:
        wr  = wins / total * 100
        bew = STOP_LOSS_PERCENT / (TAKE_PROFIT_PERCENT + STOP_LOSS_PERCENT) * 100
        ev  = (wr / 100 * TAKE_PROFIT_PERCENT * LEVERAGE) \
            - ((100 - wr) / 100 * STOP_LOSS_PERCENT * LEVERAGE)
        roi = profit / BALANCE * 100

        print(f"\n  WIN: {wins}  LOSS: {losses}  WinRate: {wr:.1f}%  (breakeven: {bew:.0f}%)")
        pstr = f"+${profit:,.2f}" if profit >= 0 else f"-${abs(profit):,.2f}"
        rstr = f"+{roi:.2f}%" if roi >= 0 else f"{roi:.2f}%"
        print(f"  Баланс: ${BALANCE:,.0f} → ${balance:,.2f}  ({pstr}  {rstr})")
        print(f"  EV на сделку: {ev:+.2f}%   |   Max DD: {max_dd:.1f}%")

        verdict = "✅ СТРАТЕГИЯ ПРИБЫЛЬНА" if profit > 0 and wr > bew \
                  else "⚠️  Требует доработки"
        print(f"\n  {verdict}")
    else:
        print(f"\n  Сделок нет — score не достиг {min_score} ни разу.")
        print(f"  Попробуй: --min-score 4  или  подожди больше данных в news.db")

    print(f"{'='*65}")

    out = {
        "meta": {"days": days, "min_score": min_score, "articles": len(articles),
                 "signals": n_signals, "hold": n_hold},
        "stats": {"trades": total, "wins": wins, "losses": losses,
                  "win_rate": round(wins / total * 100, 1) if total else 0,
                  "initial": BALANCE, "final": round(balance, 2),
                  "profit": round(profit, 2), "roi_pct": round(profit / BALANCE * 100, 2),
                  "max_dd_pct": round(max_dd, 2)},
        "trades": trades,
    }
    with open("backtest_replay_results.json", "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"\n  Лог → backtest_replay_results.json")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--days",      type=int,   default=DEFAULT_DAYS)
    p.add_argument("--min-score", type=float, default=DEFAULT_MIN_SCORE,
                   dest="min_score")
    p.add_argument("--newsapi",   action="store_true",
                   help="Дополнить локальный архив статьями из NewsAPI")
    args = p.parse_args()
    run_replay(days=args.days, min_score=args.min_score, use_newsapi=args.newsapi)
