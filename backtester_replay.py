"""
backtester_replay.py — Replay Backtester v3

Источники новостей (по приоритету):
  1. Локальная news.db — всё что бот собрал за время работы (основной)
  2. NewsAPI         — дополнение если нужно больше данных (--newsapi флаг)

Реальный Claude AI + реальные исторические цены Binance.

v3 improvements:
  - Per-coin params: BTC/ETH (2x, 5%TP, 2%SL, 5%size) vs Altcoins (3x, 10%TP, 4%SL, 3%size)
  - Dynamic leverage: score≥14→+2, score≥12→+1
  - BTC correlation filter: block LONG if BTC -2.5% last 2h at signal time
  - Partial TP simulation: 50% closes at TP, remaining 50% trails
  - Per-coin + monthly breakdown in results

Использование:
  python backtester_replay.py              # news.db, все дни
  python backtester_replay.py --days 14
  python backtester_replay.py --newsapi
  python backtester_replay.py --min-score 5
"""

import argparse
import json
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta

import ccxt

from config.settings import (
    NEWSAPI_KEY,
    LEVERAGE, TAKE_PROFIT_PERCENT, STOP_LOSS_PERCENT, TRADE_PERCENT_SIZE,
    ALT_LEVERAGE, ALT_TP, ALT_SL, ALT_SIZE,
)
from modules.news_parser import is_altcoin_news, check_panic_news
from modules.news_archive import get_news, init_db
from modules.decision_maker import generate_signal

# ─── Config ───────────────────────────────────────────────────────────────────
DEFAULT_DAYS      = 30
DEFAULT_MIN_SCORE = 6.0
BALANCE           = 10_000.0
MAX_ARTICLES      = 500
CLAUDE_DELAY      = 1.5   # Groq free tier rate limit: ~30 req/min

BTC_MAJORS        = {"BTC", "ETH"}
BTC_DUMP_THRESH   = -2.5   # % за 2h — блок LONG на альти

# Trailing stop params (activates after +1% move)
TRAIL_ACTIVATE_PCT = 1.0
TRAIL_BTC_ETH_PCT  = 2.5
TRAIL_ALT_PCT      = 3.0

_binance = ccxt.binance({"enableRateLimit": True})
_btc_cache: dict[int, float] = {}   # ts_bucket → btc_2h_change


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _coin_params(coin: str, score: float) -> tuple[float, float, float, int]:
    """Returns (tp_pct, sl_pct, size_pct, leverage) for coin+score."""
    if coin in BTC_MAJORS:
        base_lev = LEVERAGE
        tp, sl, size = TAKE_PROFIT_PERCENT, STOP_LOSS_PERCENT, TRADE_PERCENT_SIZE
    else:
        base_lev = ALT_LEVERAGE
        tp, sl, size = ALT_TP, ALT_SL, ALT_SIZE

    # Dynamic leverage
    if score >= 14:
        lev = base_lev + 2
    elif score >= 12:
        lev = base_lev + 1
    else:
        lev = base_lev

    return tp, sl, size, lev


def _btc_2h_change(signal_ts_ms: int) -> float:
    """BTC % change over 2h ending at signal_ts_ms. Cached per 15-min bucket."""
    bucket = signal_ts_ms // (15 * 60 * 1000)
    if bucket in _btc_cache:
        return _btc_cache[bucket]
    try:
        since = signal_ts_ms - 2 * 3600 * 1000
        ohlcv = _binance.fetch_ohlcv("BTC/USDT", "15m", since=since, limit=9)
        if len(ohlcv) >= 2:
            pct = (ohlcv[-1][4] - ohlcv[0][1]) / ohlcv[0][1] * 100
        else:
            pct = 0.0
    except Exception:
        pct = 0.0
    _btc_cache[bucket] = pct
    return pct


# ─── Trade simulation v3 ──────────────────────────────────────────────────────

def simulate_trade(coin: str, action: str, signal_ts_ms: int,
                   balance: float, score: float) -> dict | None:
    symbol = f"{coin}/USDT"
    try:
        _binance.load_markets()
        if symbol not in _binance.markets:
            return None

        ohlcv = _binance.fetch_ohlcv(symbol, "15m", since=signal_ts_ms, limit=302)
        if len(ohlcv) < 2:
            return None

        tp_pct, sl_pct, size_pct, leverage = _coin_params(coin, abs(score))
        trail_pct = TRAIL_BTC_ETH_PCT if coin in BTC_MAJORS else TRAIL_ALT_PCT

        entry_price = ohlcv[1][1]
        usdt_risk   = balance * (size_pct / 100)

        if action == "LONG":
            tp1 = entry_price * (1 + tp_pct / 100)
            sl_p = entry_price * (1 - sl_pct / 100)
            trail_activate = entry_price * (1 + TRAIL_ACTIVATE_PCT / 100)
        else:
            tp1 = entry_price * (1 - tp_pct / 100)
            sl_p = entry_price * (1 + sl_pct / 100)
            trail_activate = entry_price * (1 - TRAIL_ACTIVATE_PCT / 100)

        # Phase 1: find TP1 or SL
        tp1_hit = False
        tp1_ts  = None
        result  = None
        exit_price = entry_price
        exit_ts    = ohlcv[1][0]
        half_pnl   = 0.0

        for idx1, c in enumerate(ohlcv[1:], 1):
            hi, lo = c[2], c[3]
            if action == "LONG":
                if lo <= sl_p:
                    result = "LOSS"
                    exit_price = sl_p
                    exit_ts = c[0]
                    break
                if hi >= tp1:
                    tp1_hit = True
                    tp1_ts  = c[0]
                    half_pnl = usdt_risk * leverage * (tp_pct / 100)
                    # Phase 2: trailing stop on remaining 50%, start from current candle
                    trail_high   = tp1
                    trail_stop   = tp1 * (1 - trail_pct / 100)
                    trail_active = False
                    rem_exit     = tp1
                    rem_ts       = c[0]

                    for c2 in ohlcv[idx1:]:
                        h2, l2 = c2[2], c2[3]
                        if h2 > trail_high:
                            trail_high = h2
                            if trail_high >= trail_activate:
                                trail_active = True
                            if trail_active:
                                trail_stop = trail_high * (1 - trail_pct / 100)
                        if trail_active and l2 <= trail_stop:
                            rem_exit = trail_stop
                            rem_ts   = c2[0]
                            break
                    else:
                        rem_exit = ohlcv[-1][4]
                        rem_ts   = ohlcv[-1][0]

                    rem_chg = (rem_exit - tp1) / tp1
                    rem_pnl = (usdt_risk / 2) * leverage * rem_chg
                    total_pnl = (half_pnl / 2) + rem_pnl
                    exit_price = rem_exit
                    exit_ts = rem_ts
                    result = "WIN"
                    break
            else:  # SHORT
                if hi >= sl_p:
                    result = "LOSS"
                    exit_price = sl_p
                    exit_ts = c[0]
                    break
                if lo <= tp1:
                    tp1_hit = True
                    tp1_ts  = c[0]
                    half_pnl = usdt_risk * leverage * (tp_pct / 100)
                    trail_low    = tp1
                    trail_stop   = tp1 * (1 + trail_pct / 100)
                    trail_active = False
                    rem_exit     = tp1
                    rem_ts       = c[0]

                    for c2 in ohlcv[idx1:]:
                        h2, l2 = c2[2], c2[3]
                        if l2 < trail_low:
                            trail_low = l2
                            if trail_active:
                                trail_stop = trail_low * (1 + trail_pct / 100)
                        if not trail_active and trail_low <= tp1 * (1 - TRAIL_ACTIVATE_PCT / 100):
                            trail_active = True
                        if trail_active and h2 >= trail_stop:
                            rem_exit = trail_stop
                            rem_ts   = c2[0]
                            break
                    else:
                        rem_exit = ohlcv[-1][4]
                        rem_ts   = ohlcv[-1][0]

                    rem_chg = (tp1 - rem_exit) / tp1
                    rem_pnl = (usdt_risk / 2) * leverage * rem_chg
                    total_pnl = (half_pnl / 2) + rem_pnl
                    exit_price = rem_exit
                    exit_ts = rem_ts
                    result = "WIN"
                    break

        if result is None:
            exit_price = ohlcv[-1][4]
            exit_ts    = ohlcv[-1][0]
            chg = (exit_price - entry_price) / entry_price
            if action == "SHORT":
                chg = -chg
            result     = "WIN" if chg > 0 else "LOSS"
            total_pnl  = usdt_risk * leverage * chg
        elif result == "LOSS":
            total_pnl = -(usdt_risk * leverage * sl_pct / 100)
        elif not tp1_hit:
            total_pnl = usdt_risk * leverage * (tp_pct / 100)

        def fmt(ms):
            return datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%Y-%m-%d %H:%M")

        return {
            "result":      result,
            "pnl":         round(total_pnl, 4),
            "entry_price": round(entry_price, 6),
            "exit_price":  round(exit_price, 6),
            "entry_time":  fmt(ohlcv[1][0]),
            "exit_time":   fmt(exit_ts),
            "leverage":    leverage,
            "tp_pct":      tp_pct,
            "sl_pct":      sl_pct,
            "partial_tp":  tp1_hit,
        }
    except Exception as e:
        print(f"  [sim] {coin}: {e}")
        return None


# ─── News sources ─────────────────────────────────────────────────────────────

def fetch_from_db(days: int) -> list[dict]:
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
            "title":         title,
            "description":   (r.get("description") or "")[:300],
            "link":          r.get("link", ""),
            "source":        r.get("source", "archive"),
            "source_url":    r.get("link", ""),
            "source_weight": float(r.get("source_weight") or 0.75),
            "published_dt":  pub_dt.isoformat(),
            "published_ts":  pub_dt.timestamp(),
            "timestamp_ms":  int(pub_dt.timestamp() * 1000),
            "is_panic":      check_panic_news(title),
            "is_replay":     True,
        })

    result.sort(key=lambda x: x["published_ts"])
    print(f"  news.db: {len(result)} статей за {days} дней")
    return result


def fetch_from_newsapi(days: int) -> list[dict]:
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
                    "title":         title,
                    "description":   (a.get("description") or "")[:300],
                    "link":          url,
                    "source":        a.get("source", {}).get("name", "NewsAPI"),
                    "source_url":    url,
                    "source_weight": 0.75,
                    "published_dt":  pub_dt.isoformat(),
                    "published_ts":  pub_dt.timestamp(),
                    "timestamp_ms":  int(pub_dt.timestamp() * 1000),
                    "is_panic":      check_panic_news(title),
                    "is_replay":     True,
                })
            time.sleep(0.5)
        except Exception as e:
            print(f"  [NewsAPI] {e}")

    crypto = [a for a in raw if a["is_panic"] or is_altcoin_news(a["title"])]
    print(f"  NewsAPI: {len(seen)} URL → {len(crypto)} крипто-новостей")
    return crypto


# ─── Main ─────────────────────────────────────────────────────────────────────

def run_replay(days: int, min_score: float, use_newsapi: bool,
               max_articles: int = MAX_ARTICLES) -> str | None:
    print(f"\n{'='*65}")
    print(f"  REPLAY BACKTESTER v3 — реальные новости + Claude AI")
    print(f"  Период: {days} дней  |  min_score={min_score}")
    print(f"  BTC/ETH: {LEVERAGE}x {TAKE_PROFIT_PERCENT}%TP {STOP_LOSS_PERCENT}%SL {TRADE_PERCENT_SIZE}%size")
    print(f"  Alts:    {ALT_LEVERAGE}x {ALT_TP}%TP {ALT_SL}%SL {ALT_SIZE}%size")
    print(f"  Dynamic lev: score≥12→+1, score≥14→+2  |  Partial TP: 50%+trailing")
    print(f"{'='*65}\n")

    print("1. Загружаем новости...")
    articles = fetch_from_db(days)

    if use_newsapi:
        extra = fetch_from_newsapi(days)
        existing = {a["title"].lower()[:80] for a in articles}
        added = [a for a in extra if a["title"].lower()[:80] not in existing]
        articles.extend(added)
        if added:
            print(f"  NewsAPI добавил {len(added)} новых статей")

    articles.sort(key=lambda x: x["published_ts"])
    total_avail = len(articles)
    if total_avail > max_articles:
        print(f"  Ограничено до {max_articles} из {total_avail}")
        articles = articles[-max_articles:]

    print(f"  Итого: {len(articles)} статей для анализа\n")

    if not articles:
        print("  Нет данных. Бот ещё не набрал историю — запусти на VPS и подожди.")
        return None

    print("2. Анализирую через Claude + 8-факторную формулу...\n")

    run_id    = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    balance   = BALANCE
    peak_bal  = BALANCE
    max_dd    = 0.0
    trades    = []
    equity    = [[int(datetime.now(timezone.utc).timestamp() * 1000), balance]]
    open_pos  = {}
    n_signals = 0
    n_hold    = 0
    n_btc_filtered = 0

    coin_stats: dict[str, dict] = defaultdict(lambda: {"wins": 0, "losses": 0, "pnl": 0.0})
    month_stats: dict[str, dict] = defaultdict(lambda: {"wins": 0, "losses": 0, "pnl": 0.0})

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

        if abs(sc) < min_score or cf < 35:
            if abs(sc) >= min_score * 0.7:
                print(f"  HOLD  {signal['coin']:<5} score={sc:+.1f} conf={cf}%  "
                      f"«{article['title'][:55]}»")
            n_hold += 1
            continue

        action = "LONG" if sc > 0 else "SHORT"
        coin   = signal["coin"]

        if open_pos.get(coin):
            continue

        # BTC correlation filter
        if action == "LONG" and coin not in BTC_MAJORS:
            btc_chg = _btc_2h_change(article["timestamp_ms"])
            if btc_chg < BTC_DUMP_THRESH:
                print(f"  🚫 BTC_FILTER {coin:<5} BTC={btc_chg:+.1f}%  «{article['title'][:45]}»")
                n_btc_filtered += 1
                continue

        trade = simulate_trade(coin, action, article["timestamp_ms"], balance, abs(sc))
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

        equity.append([article["timestamp_ms"], round(balance, 2)])

        month_key = article["published_dt"][:7]
        for d in (coin_stats[coin], month_stats[month_key]):
            if trade["result"] == "WIN":
                d["wins"] += 1
            else:
                d["losses"] += 1
            d["pnl"] += trade["pnl"]

        icon  = "✅" if trade["result"] == "WIN" else "❌"
        ptag  = "½TP" if trade["partial_tp"] else "   "
        pnl_s = f"+${trade['pnl']:.2f}" if trade["pnl"] >= 0 else f"-${abs(trade['pnl']):.2f}"
        lev_s = f"{trade['leverage']}x"
        print(f"  {icon} {ptag} {action:<5} {coin:<5} {sc:+.1f} {lev_s} {pnl_s}  "
              f"«{article['title'][:42]}»")

        trades.append({
            "timestamp":  article["published_dt"],
            "coin":       coin,
            "action":     action,
            "score":      sc,
            "confidence": cf,
            "leverage":   trade["leverage"],
            "tp_pct":     trade["tp_pct"],
            "sl_pct":     trade["sl_pct"],
            "partial_tp": trade["partial_tp"],
            "entry_time": trade["entry_time"],
            "exit_time":  trade["exit_time"],
            "entry_price": trade["entry_price"],
            "exit_price":  trade["exit_price"],
            "result":     trade["result"],
            "pnl_usdt":   trade["pnl"],
            "balance":    round(balance, 2),
            "news_title": article["title"][:80],
            "source":     article["source"],
        })

    wins   = sum(1 for t in trades if t["result"] == "WIN")
    losses = sum(1 for t in trades if t["result"] == "LOSS")
    total  = wins + losses
    profit = balance - BALANCE

    print(f"\n{'='*65}")
    print(f"  РЕЗУЛЬТАТЫ — {days} дней")
    print(f"{'='*65}")
    print(f"  Статей: {len(articles)}  Сигналов: {n_signals}  HOLD: {n_hold}  "
          f"BTC_filtered: {n_btc_filtered}  Сделок: {total}")

    if total > 0:
        wr  = wins / total * 100
        roi = profit / BALANCE * 100
        # Breakeven with mixed TP/SL (approx avg)
        avg_tp = sum(t["tp_pct"] for t in trades) / total
        avg_sl = sum(t["sl_pct"] for t in trades) / total
        bew    = avg_sl / (avg_tp + avg_sl) * 100

        print(f"\n  WIN: {wins}  LOSS: {losses}  WinRate: {wr:.1f}%  (breakeven: {bew:.0f}%)")
        pstr = f"+${profit:,.2f}" if profit >= 0 else f"-${abs(profit):,.2f}"
        rstr = f"+{roi:.2f}%" if roi >= 0 else f"{roi:.2f}%"
        print(f"  Баланс: ${BALANCE:,.0f} → ${balance:,.2f}  ({pstr}  {rstr})")
        print(f"  Max DD: {max_dd:.1f}%")

        # Per-coin breakdown
        if coin_stats:
            print(f"\n  ── По монетах ──")
            for c, s in sorted(coin_stats.items(), key=lambda x: -x[1]["pnl"]):
                t2 = s["wins"] + s["losses"]
                wr2 = s["wins"] / t2 * 100 if t2 else 0
                ps = f"+${s['pnl']:.2f}" if s["pnl"] >= 0 else f"-${abs(s['pnl']):.2f}"
                print(f"    {c:<6} {t2:2d} trades  WR={wr2:.0f}%  PnL={ps}")

        # Monthly breakdown
        if month_stats:
            print(f"\n  ── По місяцях ──")
            for m, s in sorted(month_stats.items()):
                t2 = s["wins"] + s["losses"]
                wr2 = s["wins"] / t2 * 100 if t2 else 0
                ps = f"+${s['pnl']:.2f}" if s["pnl"] >= 0 else f"-${abs(s['pnl']):.2f}"
                print(f"    {m}  {t2:2d} trades  WR={wr2:.0f}%  PnL={ps}")

        verdict = "✅ СТРАТЕГІЯ ПРИБУТКОВА" if profit > 0 and wr > bew \
                  else "⚠️  Потребує доопрацювання"
        print(f"\n  {verdict}")
    else:
        print(f"\n  Сделок нет — score не достиг {min_score} ни разу.")
        print(f"  Попробуй: --min-score 4  или  подожди больше данных в news.db")

    print(f"{'='*65}")

    import os
    out = {
        "run_id": run_id,
        "params": {
            "days": days, "min_score": min_score,
            "newsapi": use_newsapi,
            "tp": TAKE_PROFIT_PERCENT, "sl": STOP_LOSS_PERCENT,
        },
        "summary": {
            "trades": total, "wins": wins, "losses": losses,
            "win_rate": round(wins / total * 100, 1) if total else 0,
            "initial": BALANCE, "final": round(balance, 2),
            "total_pnl": round(profit, 2),
            "roi_pct": round(profit / BALANCE * 100, 2),
            "max_dd_pct": round(max_dd, 2),
        },
        "equity_curve": equity,
        "coin_stats":   {c: {**s, "pnl": round(s["pnl"], 2)} for c, s in coin_stats.items()},
        "month_stats":  {m: {**s, "pnl": round(s["pnl"], 2)} for m, s in month_stats.items()},
        "meta": {
            "version": 3, "articles": len(articles),
            "signals": n_signals, "hold": n_hold, "btc_filtered": n_btc_filtered,
        },
        "trades": trades,
    }
    os.makedirs("backtest_results", exist_ok=True)
    out_path = os.path.join("backtest_results", f"{run_id}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    print(f"\n  Результат сохранён → {out_path}")
    return out_path


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--days",      type=int,   default=DEFAULT_DAYS)
    p.add_argument("--min-score", type=float, default=DEFAULT_MIN_SCORE, dest="min_score")
    p.add_argument("--limit",     type=int,   default=MAX_ARTICLES,
                   help="Max articles to process (default 500)")
    p.add_argument("--newsapi",   action="store_true",
                   help="Дополнить локальный архив статьями из NewsAPI")
    args = p.parse_args()
    run_replay(days=args.days, min_score=args.min_score,
               use_newsapi=args.newsapi, max_articles=args.limit)
