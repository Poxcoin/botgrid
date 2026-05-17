"""
bot_analyzer.py — Comprehensive status & performance analyzer for all Kado bots.

Usage:
    python bot_analyzer.py          # full report
    python bot_analyzer.py --json   # machine-readable JSON output
"""
import json
import os
import sqlite3
import sys
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT   = Path(__file__).parent
DB     = ROOT / "analytics.db"
SAAS   = ROOT / "saas_database.sqlite"
MACRO_DB = ROOT / "macro_bot" / "macro_trades.db"
LIVE_INTEL = ROOT / "live_intel.json"
SIGNALS_LOG = ROOT / "signals_log.json"
BOT_LOG = ROOT / "bot_engine.log"
MACRO_LOG = ROOT / "macro_bot" / "macro_bot.log"

BYBIT_PUBLIC = "https://api.bybit.com/v5/market/tickers?category=linear"


# ─── Colours ────────────────────────────────────────────────────────────────

C = {
    "reset":  "\033[0m",
    "bold":   "\033[1m",
    "green":  "\033[92m",
    "red":    "\033[91m",
    "yellow": "\033[93m",
    "cyan":   "\033[96m",
    "grey":   "\033[90m",
    "white":  "\033[97m",
}

def clr(text, *codes): return "".join(C[c] for c in codes) + str(text) + C["reset"]
def ok(t):  return clr(t, "green")
def bad(t): return clr(t, "red")
def dim(t): return clr(t, "grey")
def hl(t):  return clr(t, "cyan", "bold")
def pnl_clr(v: float) -> str:
    return ok(f"+${v:.2f}") if v >= 0 else bad(f"-${abs(v):.2f}")


# ─── Data fetchers ───────────────────────────────────────────────────────────

def bybit_tickers(*symbols: str) -> dict:
    """Fetch ticker data for given symbols from Bybit public API."""
    result = {}
    try:
        with urllib.request.urlopen(BYBIT_PUBLIC, timeout=5) as r:
            data = json.loads(r.read())
        if data.get("retCode") != 0:
            return {}
        for item in data["result"]["list"]:
            sym = item["symbol"].replace("USDT", "")
            if sym in symbols or not symbols:
                result[sym] = {
                    "price":      float(item.get("lastPrice", 0)),
                    "change24h":  float(item.get("price24hPcnt", 0)) * 100,
                    "volume24h":  float(item.get("volume24h", 0)),
                    "funding":    float(item.get("fundingRate", 0)) * 100,
                    "oi":         float(item.get("openInterest", 0)),
                }
    except Exception:
        pass
    return result


def load_live_intel() -> dict:
    try:
        return json.loads(LIVE_INTEL.read_text())
    except Exception:
        return {}


def load_signals_log() -> list:
    try:
        return json.loads(SIGNALS_LOG.read_text())
    except Exception:
        return []


def tail_log(path: Path, n: int = 100) -> list[str]:
    try:
        lines = path.read_text(errors="replace").splitlines()
        return lines[-n:]
    except Exception:
        return []


def _conn(path: Path):
    if not path.exists():
        return None
    c = sqlite3.connect(path)
    c.row_factory = sqlite3.Row
    return c


# ─── Per-bot stats ───────────────────────────────────────────────────────────

def signal_bot_stats() -> dict:
    con = _conn(DB)
    if not con:
        return {}

    total = con.execute("SELECT COUNT(*) n FROM signals").fetchone()["n"]
    executed = con.execute("SELECT COUNT(*) n FROM signals WHERE executed=1").fetchone()["n"]
    today = datetime.now(timezone.utc).date().isoformat()
    today_n = con.execute(
        "SELECT COUNT(*) n FROM signals WHERE timestamp >= ?", (today,)
    ).fetchone()["n"]

    # Executed signals today
    today_exec = con.execute(
        "SELECT COUNT(*) n FROM signals WHERE executed=1 AND timestamp >= ?", (today,)
    ).fetchone()["n"]

    # Trade results from signals
    trade = con.execute("""
        SELECT COUNT(*) total,
               SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) wins,
               SUM(CASE WHEN result='LOSS' THEN 1 ELSE 0 END) losses,
               SUM(pnl_usdt) pnl
        FROM trades WHERE result IN ('WIN','LOSS')
    """).fetchone()

    # Top 5 coins by executed signal count
    top_coins = con.execute("""
        SELECT coin, COUNT(*) n FROM signals WHERE executed=1
        GROUP BY coin ORDER BY n DESC LIMIT 5
    """).fetchall()

    # Top sources
    top_sources = con.execute("""
        SELECT news_source, COUNT(*) n FROM signals WHERE executed=1 AND news_source != ''
        GROUP BY news_source ORDER BY n DESC LIMIT 3
    """).fetchall()

    # Last 5 signals
    recent = con.execute("""
        SELECT timestamp, coin, action, confidence, news_source, groq_impact, executed
        FROM signals ORDER BY id DESC LIMIT 5
    """).fetchall()

    # Groq impact breakdown
    groq = con.execute("""
        SELECT groq_impact, COUNT(*) n,
               SUM(CASE WHEN executed=1 THEN 1 ELSE 0 END) exec
        FROM signals WHERE groq_impact IS NOT NULL
        GROUP BY groq_impact ORDER BY n DESC
    """).fetchall()

    # Active coins (signals in last 24h)
    active = con.execute("""
        SELECT DISTINCT coin FROM signals
        WHERE timestamp >= datetime('now', '-1 day')
    """).fetchall()

    con.close()
    return {
        "total_signals":  total,
        "executed":       executed,
        "today_signals":  today_n,
        "today_executed": today_exec,
        "trade_total":    trade["total"],
        "trade_wins":     trade["wins"] or 0,
        "trade_losses":   trade["losses"] or 0,
        "trade_pnl":      trade["pnl"] or 0.0,
        "top_coins":      [(r["coin"], r["n"]) for r in top_coins],
        "top_sources":    [(r["news_source"], r["n"]) for r in top_sources],
        "recent":         [dict(r) for r in recent],
        "groq_breakdown": [(r["groq_impact"], r["n"], r["exec"]) for r in groq],
        "active_coins_24h": [r["coin"] for r in active],
    }


def grid_bot_stats() -> dict:
    con = _conn(DB)
    if not con:
        return {}

    overall = con.execute("""
        SELECT COUNT(*) total,
               SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) wins,
               SUM(CASE WHEN result='LOSS' THEN 1 ELSE 0 END) losses,
               SUM(pnl_usdt) pnl,
               MIN(timestamp_open) first_ts,
               MAX(timestamp_open) last_ts
        FROM all_trades WHERE bot_source='grid'
    """).fetchone()

    today = datetime.now(timezone.utc).date().isoformat()
    today_stats = con.execute("""
        SELECT COUNT(*) total, SUM(pnl_usdt) pnl
        FROM all_trades WHERE bot_source='grid' AND timestamp_open >= ?
    """, (today,)).fetchone()

    per_coin = con.execute("""
        SELECT coin,
               COUNT(*) total,
               SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) wins,
               SUM(pnl_usdt) pnl
        FROM all_trades WHERE bot_source='grid'
        GROUP BY coin ORDER BY pnl DESC
    """).fetchall()

    per_week = con.execute("""
        SELECT strftime('%Y-W%W', timestamp_open) week,
               COUNT(*) n,
               SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) wins,
               SUM(pnl_usdt) pnl
        FROM all_trades WHERE bot_source='grid'
        GROUP BY week ORDER BY week DESC LIMIT 6
    """).fetchall()

    recent = con.execute("""
        SELECT coin, action, pnl_usdt, result, timestamp_open
        FROM all_trades WHERE bot_source='grid'
        ORDER BY id DESC LIMIT 8
    """).fetchall()

    con.close()
    return {
        "total":      overall["total"] or 0,
        "wins":       overall["wins"] or 0,
        "losses":     overall["losses"] or 0,
        "pnl":        overall["pnl"] or 0.0,
        "first_ts":   overall["first_ts"] or "",
        "last_ts":    overall["last_ts"] or "",
        "today_total": today_stats["total"] or 0,
        "today_pnl":   today_stats["pnl"] or 0.0,
        "per_coin":   [(r["coin"], r["total"], r["wins"], r["pnl"]) for r in per_coin],
        "per_week":   [(r["week"], r["n"], r["wins"], r["pnl"]) for r in per_week],
        "recent":     [dict(r) for r in recent],
    }


def cascade_bot_stats() -> dict:
    con = _conn(DB)
    if not con:
        return {"trades": 0}

    r = con.execute("""
        SELECT COUNT(*) total,
               SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) wins,
               SUM(pnl_usdt) pnl
        FROM all_trades WHERE bot_source='cascade'
    """).fetchone()
    con.close()
    return {
        "total": r["total"] or 0,
        "wins":  r["wins"] or 0,
        "pnl":   r["pnl"] or 0.0,
    }


def listing_bot_stats() -> dict:
    con = _conn(DB)
    if not con:
        return {"trades": 0}
    r = con.execute("""
        SELECT COUNT(*) total,
               SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) wins,
               SUM(pnl_usdt) pnl
        FROM all_trades WHERE bot_source='listing'
    """).fetchone()
    con.close()
    return {
        "total": r["total"] or 0,
        "wins":  r["wins"] or 0,
        "pnl":   r["pnl"] or 0.0,
    }


def metals_bot_stats() -> dict:
    con = _conn(DB)
    if not con:
        return {"trades": 0}
    r = con.execute("""
        SELECT COUNT(*) total,
               SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) wins,
               SUM(pnl_usdt) pnl
        FROM all_trades WHERE bot_source='metals'
    """).fetchone()
    con.close()

    # Also check metals_macro_state.json
    state_file = ROOT / "metals_macro_state.json"
    macro_state = {}
    if state_file.exists():
        try:
            macro_state = json.loads(state_file.read_text())
        except Exception:
            pass

    return {
        "total":       r["total"] or 0,
        "wins":        r["wins"] or 0,
        "pnl":         r["pnl"] or 0.0,
        "macro_state": macro_state,
    }


def macro_bot_stats() -> dict:
    con = _conn(MACRO_DB)
    if not con:
        return {"trades": 0, "status": "no DB yet"}

    total = con.execute("SELECT COUNT(*) n FROM trades").fetchone()["n"]
    open_trades = con.execute(
        "SELECT COUNT(*) n FROM trades WHERE status='open'"
    ).fetchone()["n"]
    closed = con.execute("""
        SELECT COUNT(*) total,
               SUM(CASE WHEN profit_usd > 0 THEN 1 ELSE 0 END) wins,
               SUM(profit_usd) pnl,
               AVG(profit_pips) avg_pips
        FROM trades WHERE status='closed'
    """).fetchone()

    recent = con.execute("""
        SELECT event, direction, profit_usd, profit_pips, close_reason, open_time
        FROM trades WHERE status='closed'
        ORDER BY id DESC LIMIT 5
    """).fetchall()

    open_pos = con.execute("""
        SELECT event, symbol, direction, open_price, open_time
        FROM trades WHERE status='open'
    """).fetchall()

    con.close()
    return {
        "total":       total,
        "open":        open_trades,
        "closed_total": closed["total"] or 0,
        "wins":        closed["wins"] or 0,
        "pnl":         closed["pnl"] or 0.0,
        "avg_pips":    closed["avg_pips"] or 0.0,
        "recent":      [dict(r) for r in recent],
        "open_positions": [dict(r) for r in open_pos],
    }


# ─── Log parsers ────────────────────────────────────────────────────────────

def parse_bot_log_status() -> dict:
    """Extract recent state from bot_engine.log."""
    lines = tail_log(BOT_LOG, 300)
    status = {
        "scanning": False,
        "smart_ws":  "unknown",
        "alchemy":   "ok",
        "last_scan": "",
        "errors":    [],
    }
    for line in reversed(lines):
        if "Сканування" in line and not status["last_scan"]:
            status["last_scan"] = line.strip()
            status["scanning"]  = True
        if "Monthly capacity limit exceeded" in line:
            status["alchemy"] = "LIMIT_EXCEEDED"
        if "WebSocket closed" in line and status["smart_ws"] == "unknown":
            status["smart_ws"] = "reconnecting"
        if "WebSocket connected" in line and status["smart_ws"] == "unknown":
            status["smart_ws"] = "connected"
        if "ERROR" in line or "Exception" in line:
            if len(status["errors"]) < 3:
                status["errors"].append(line.strip()[:120])
    return status


def parse_macro_log_status() -> dict:
    lines = tail_log(MACRO_LOG, 50)
    status = {"last_line": "", "mt5_ok": False, "blocker": ""}
    for line in reversed(lines):
        if not status["last_line"]:
            status["last_line"] = line.strip()
        if "pong" in line or "MT5 connected" in line:
            status["mt5_ok"] = True
        if "balance" in line.lower() and "0.00" in line:
            status["blocker"] = "balance=0 (MetaQuotes-Demo blocks VPS IP)"
        if "Invalid account" in line:
            status["blocker"] = "MetaQuotes-Demo: Invalid account"
    return status


# ─── Liquidations from live_intel ───────────────────────────────────────────

def liq_summary(intel: dict) -> str:
    liqs = intel.get("liquidations", {})
    parts = []
    for coin, v in liqs.items():
        lo = v.get("long_liq_usd", 0)
        so = v.get("short_liq_usd", 0)
        sig = v.get("signal", "NEUTRAL")
        if lo > 50_000 or so > 50_000:
            parts.append(f"{coin} {sig} (L${lo/1e6:.1f}M/S${so/1e6:.1f}M)")
    return ", ".join(parts) if parts else "NEUTRAL — no significant liquidations"


# ─── Formatting helpers ──────────────────────────────────────────────────────

def wr_str(wins, total) -> str:
    if not total:
        return dim("N/A")
    wr = wins / total * 100
    s = f"{wr:.1f}%"
    return ok(s) if wr >= 50 else (dim(s) if wr >= 35 else bad(s))


def sep(char="─", n=60): return dim(char * n)

def section(title: str):
    print()
    print(clr("┌" + "─" * 58 + "┐", "grey"))
    print(clr("│", "grey") + f"  {clr(title, 'cyan', 'bold')}")
    print(clr("└" + "─" * 58 + "┘", "grey"))


def bot_header(name: str, file: str, service: str, strategy: str, trading_on: bool, demo: bool):
    status_str = ok("▶ ACTIVE") + dim(f" ({'DEMO' if demo else 'LIVE'})")
    trade_str  = ok("✅ ON") if trading_on else bad("❌ OFF")
    print(f"  File:     {dim(file)}  [{dim(service)}]")
    print(f"  Strategy: {dim(strategy)}")
    print(f"  Status:   {status_str}  |  Trading: {trade_str}")


# ─── Main report ────────────────────────────────────────────────────────────

def report(as_json: bool = False):
    now = datetime.now(timezone.utc)

    # Fetch all data
    tickers    = bybit_tickers("BTC", "ETH", "SOL", "XRP", "DOGE", "XAUUSD")
    intel      = load_live_intel()
    sig_stats  = signal_bot_stats()
    grid_stats = grid_bot_stats()
    casc_stats = cascade_bot_stats()
    list_stats = listing_bot_stats()
    met_stats  = metals_bot_stats()
    macro_stats = macro_bot_stats()
    log_status = parse_bot_log_status()
    macro_status = parse_macro_log_status()

    # ─── Try to read .env for trading flags ─────────────────────────────────
    env = {}
    try:
        for line in (ROOT / ".env").read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
    except Exception:
        pass

    signal_on   = env.get("SIGNAL_BOT_TRADING", "False").lower() == "true"
    cascade_on  = env.get("CASCADE_TRADING", "False").lower() == "true"
    metals_on   = env.get("METALS_TRADING", "False").lower() == "true"
    is_demo     = env.get("IS_DEMO_TRADING", "True").lower() == "true"
    fr_on       = env.get("FR_TRADING", "False").lower() == "true"

    if as_json:
        print(json.dumps({
            "generated_at": now.isoformat(),
            "tickers": tickers,
            "signal_bot": sig_stats,
            "grid_bot": grid_stats,
            "cascade_bot": casc_stats,
            "listing_bot": list_stats,
            "metals_bot": met_stats,
            "macro_bot": macro_stats,
        }, default=str, indent=2))
        return

    # ═══════════════════════════════════════════════════════
    #  HEADER
    # ═══════════════════════════════════════════════════════
    print()
    print(clr("═" * 60, "cyan"))
    print(hl(f"  KADO BOT GRID ANALYZER  —  {now.strftime('%Y-%m-%d %H:%M UTC')}"))
    print(clr("═" * 60, "cyan"))

    # ─── MARKET CONTEXT ─────────────────────────────────────────────────────
    section("📊 MARKET CONTEXT")
    pairs = [("BTC", "₿"), ("ETH", "Ξ"), ("SOL", "◎"), ("XRP", "✕"), ("XAUUSD", "🥇 XAU")]
    for sym, icon in pairs:
        t = tickers.get(sym, {})
        if not t:
            continue
        price = f"${t['price']:>10,.2f}"
        chg   = t['change24h']
        chg_s = (ok(f"+{chg:.2f}%") if chg >= 0 else bad(f"{chg:.2f}%"))
        fr    = t.get('funding', 0)
        fr_s  = (ok(f"+{fr:.4f}%") if fr >= 0 else bad(f"{fr:.4f}%")) if sym != "XAUUSD" else ""
        fr_label = f"  FR:{fr_s}" if fr_s else ""
        print(f"  {icon:<8} {clr(price, 'white', 'bold')}  {chg_s:>14}{fr_label}")

    # Data sources
    sources = intel.get("sources", {})
    src_parts = []
    for k, v in sources.items():
        src_parts.append(ok(k.upper()) if v else bad(k.upper()))
    if log_status["alchemy"] == "LIMIT_EXCEEDED":
        src_parts = [bad("ALCHEMY:LIMIT")] + src_parts
    print(f"\n  Data sources: {' '.join(src_parts)}")

    # Liquidations
    print(f"  Liquidations: {liq_summary(intel)}")

    # Intel timestamp
    updated = intel.get("updated_at", "")
    if updated:
        try:
            dt = datetime.fromisoformat(updated)
            age = (now - dt).total_seconds() / 60
            print(f"  Intel age:    {dim(f'{age:.0f} min ago — {updated[:16]} UTC')}")
        except Exception:
            pass

    # ─── 1. SIGNAL BOT ──────────────────────────────────────────────────────
    section("1.  SIGNAL BOT  (main.py / crypto-bot.service)")
    bot_header(
        "Signal Bot", "main.py", "crypto-bot.service",
        "AI+News signals → altcoins (5% SL, 5% TP, 2x leverage)",
        trading_on=signal_on, demo=is_demo,
    )
    print()
    s = sig_stats
    if s:
        exec_pct = s["executed"] / s["total_signals"] * 100 if s["total_signals"] else 0
        print(f"  Signals total:   {s['total_signals']}  |  executed: {s['executed']} ({exec_pct:.1f}%)")
        print(f"  Today:           {s['today_signals']} signals, {s['today_executed']} executed")
        t = s["trade_total"]
        w = s["trade_wins"]
        if t:
            print(f"  Trades:          {w}W / {s['trade_losses']}L  WR={wr_str(w, t)}  PnL={pnl_clr(s['trade_pnl'])}")
        else:
            print(f"  Trades:          {dim('no closed trades yet')}")
        if s["active_coins_24h"]:
            print(f"  Active 24h:      {', '.join(s['active_coins_24h'][:8])}")
        if s["top_sources"]:
            src = "  |  ".join(f"{dim(n)}: {k}" for n, k in s["top_sources"])
            print(f"  Top sources:     {src}")
        if s["groq_breakdown"]:
            gb = "  ".join(f"{imp}: {n}sig/{ex}exec" for imp, n, ex in s["groq_breakdown"])
            print(f"  Groq breakdown:  {gb}")
        print()
        print(f"  {dim('Recent signals:')}")
        for r in s["recent"]:
            ts  = r["timestamp"][:16]
            act = ok(r["action"]) if r["action"] in ("LONG","SHORT") else dim(r["action"])
            ex  = ok("✓exec") if r["executed"] else dim("held")
            imp = r.get("groq_impact") or "—"
            src = (r.get("news_source") or "")[:30]
            print(f"    {dim(ts)}  {r['coin']:<6}  {act:<6}  conf={r['confidence']}%  {imp:<7}  {ex}  {dim(src)}")

    if log_status["last_scan"]:
        print(f"\n  Last scan: {dim(log_status['last_scan'][-60:])}")
    if log_status["alchemy"] == "LIMIT_EXCEEDED":
        print(f"  {bad('⚠ Alchemy WebSocket: monthly limit exceeded — on-chain signals offline')}")

    # ─── 2. GRID BOT ────────────────────────────────────────────────────────
    section("2.  GRID BOT  (grid_bot.py / crypto-grid.service)")
    bot_header(
        "Grid Bot", "grid_bot.py", "crypto-grid.service",
        "EMA-adaptive grid on BTC/ETH/SOL/XRP/DOGE  (5x leverage)",
        trading_on=True, demo=is_demo,
    )
    print()
    g = grid_stats
    if g and g["total"]:
        print(f"  All-time:  {g['total']} trades  WR={wr_str(g['wins'], g['total'])}  PnL={pnl_clr(g['pnl'])}")
        if g["today_total"]:
            print(f"  Today:     {g['today_total']} trades  PnL={pnl_clr(g['today_pnl'])}")
        else:
            print(f"  Today:     {dim('0 trades')}")
        if g["first_ts"]:
            print(f"  Period:    {g['first_ts'][:10]} → {g['last_ts'][:10]}")
        print()
        print(f"  {dim('Per coin:')}")
        for coin, total, wins, pnl in g["per_coin"]:
            bar_w  = int(wins / total * 20) if total else 0
            bar    = ok("█" * bar_w) + dim("░" * (20 - bar_w))
            wr_val = f"{wins/total*100:.0f}%" if total else "—"
            print(f"    {coin:<6}  {total:>4}tr  WR={wr_val:>5}  {bar}  {pnl_clr(pnl)}")
        print()
        print(f"  {dim('Weekly PnL:')}")
        for week, n, wins, pnl in g["per_week"]:
            print(f"    {week}  {n:>4}tr  WR={wr_str(wins, n)}  {pnl_clr(pnl)}")
        print()
        print(f"  {dim('Last 8 trades:')}")
        for r in g["recent"]:
            ts  = r["timestamp_open"][:16]
            res = ok("WIN") if r["result"] == "WIN" else bad("LOSS")
            print(f"    {dim(ts)}  {r['coin']:<5}  {r['action']:<6}  {res}  {pnl_clr(r['pnl_usdt'])}")
    else:
        print(f"  {dim('No trade history yet')}")

    # ─── 3. CASCADE BOT ─────────────────────────────────────────────────────
    section("3.  CASCADE BOT  (cascade_bot.py / crypto-cascade.service)")
    bot_header(
        "Cascade Bot", "cascade_bot.py", "crypto-cascade.service",
        "Liquidation cascade: BTC/ETH/SOL/XRP/DOGE/LINK  (5x, TP 2%, SL 0.6%)",
        trading_on=cascade_on, demo=is_demo,
    )
    print()
    c = casc_stats
    if c["total"]:
        print(f"  All-time:  {c['total']} trades  WR={wr_str(c['wins'], c['total'])}  PnL={pnl_clr(c['pnl'])}")
    else:
        print(f"  Trades:    {dim('0 — no history recorded yet')}")
        print(f"  {dim('Note: cascade fires on $1.5M+ BTC / $700K+ ETH / $175K+ SOL liquidation in 60s')}")

    # ─── 4. LISTING BOT ─────────────────────────────────────────────────────
    section("4.  LISTING BOT  (altcoin_bot.py / crypto-alt.service)")
    bot_header(
        "Listing Bot", "altcoin_bot.py", "crypto-alt.service",
        "Exchange listings pump  (5x, TP 20%, SL 7%, 2% balance)",
        trading_on=True, demo=is_demo,
    )
    print()
    li = list_stats
    if li["total"]:
        print(f"  All-time:  {li['total']} trades  WR={wr_str(li['wins'], li['total'])}  PnL={pnl_clr(li['pnl'])}")
    else:
        print(f"  Trades:    {dim('0 — waiting for next exchange listing announcement')}")
        print(f"  {dim('Note: triggers on Binance/Bybit announcement monitor (ann_queue)')}")

    # ─── 5. METALS BOT ──────────────────────────────────────────────────────
    section("5.  METALS BOT  (metals_bot.py / crypto-metals.service)")
    xau = tickers.get("XAUUSD", {})
    bot_header(
        "Metals Bot", "metals_bot.py", "crypto-metals.service",
        f"XAU/USDT momentum  (5x, TP 1.5%, SL 1.0%, 3% balance)",
        trading_on=metals_on, demo=is_demo,
    )
    print()
    m = met_stats
    if xau:
        xau_chg = xau['change24h']
        print(f"  XAU/USDT:  ${xau['price']:,.2f}  {ok(f'+{xau_chg:.2f}%') if xau_chg>=0 else bad(f'{xau_chg:.2f}%')} 24h")
    if m["total"]:
        print(f"  All-time:  {m['total']} trades  WR={wr_str(m['wins'], m['total'])}  PnL={pnl_clr(m['pnl'])}")
    else:
        print(f"  Trades:    {dim('0 — price momentum signals not yet triggered')}")
        print(f"  {dim('Note: also writes metals_macro_state.json → +20% boost to alt-signals')}")
    if m["macro_state"]:
        ms = m["macro_state"]
        print(f"  Macro state: {json.dumps(ms, ensure_ascii=False)[:100]}")

    # ─── 6. MACRO BOT ───────────────────────────────────────────────────────
    section("6.  MACRO BOT  (macro_bot/ / kado-macro.service)")
    bot_header(
        "Macro Bot", "macro_bot/bot.py", "kado-macro.service",
        "CPI/NFP/PCE/PPI/GDP/FOMC on EUR/USD via MT5 File IPC",
        trading_on=True, demo=False,
    )
    print()
    mac = macro_stats
    if mac.get("total", 0):
        print(f"  All-time:  {mac['closed_total']} closed trades  WR={wr_str(mac['wins'], mac['closed_total'])}  PnL={pnl_clr(mac['pnl'])}")
        print(f"  Avg pips:  {mac['avg_pips']:.1f}")
        if mac["open_positions"]:
            print(f"  Open now:  {len(mac['open_positions'])}")
            for pos in mac["open_positions"]:
                print(f"    {pos['event']:<25}  {pos['direction']}  @ {pos['open_price']}")
        if mac["recent"]:
            print(f"\n  {dim('Recent trades:')}")
            for r in mac["recent"]:
                res = ok("WIN") if (r.get("profit_usd") or 0) > 0 else bad("LOSS")
                print(f"    {dim(str(r.get('open_time',''))[:16])}  {r.get('event',''):<22}  "
                      f"{r.get('direction',''):<5}  {res}  {pnl_clr(r.get('profit_usd') or 0)}")
    else:
        print(f"  Trades:    {dim('0 — no trades recorded yet')}")

    if macro_status["blocker"]:
        print(f"\n  {bad('⚠ BLOCKER: ' + macro_status['blocker'])}")
        print(f"  {dim('Fix: register IC Markets demo account, connect via VNC (port 5901)')}")

    mt5_ok = macro_status["mt5_ok"]
    print(f"  MT5 EA:    {'🟢 responding (ping OK)' if mt5_ok else dim('⚪ no recent ping in log')}")

    # Timer info
    print(f"  Schedule:  {dim('▶ Sun 22:05 UTC  |  ■ Fri 22:00 UTC  (timers active)')}")

    # Monitored events
    events = [
        "CPI m/m", "Core CPI m/m", "CPI y/y",
        "NFP", "PCE m/m", "Core PCE m/m",
        "PPI m/m", "GDP q/q", "Federal Funds Rate",
    ]
    print(f"  Events:    {dim(', '.join(events))}")

    # ─── SUMMARY ────────────────────────────────────────────────────────────
    section("SUMMARY")
    total_pnl = (
        (grid_stats.get("pnl") or 0) +
        (sig_stats.get("trade_pnl") or 0) +
        (casc_stats.get("pnl") or 0) +
        (list_stats.get("pnl") or 0) +
        (met_stats.get("pnl") or 0) +
        (macro_stats.get("pnl") or 0)
    )

    rows = [
        ("Signal Bot",   signal_on,  sig_stats.get("trade_total",0),  sig_stats.get("trade_wins",0),  sig_stats.get("trade_pnl", 0)),
        ("Grid Bot",     True,       grid_stats.get("total",0),        grid_stats.get("wins",0),        grid_stats.get("pnl",0)),
        ("Cascade Bot",  cascade_on, casc_stats.get("total",0),        casc_stats.get("wins",0),        casc_stats.get("pnl",0)),
        ("Listing Bot",  True,       list_stats.get("total",0),        list_stats.get("wins",0),        list_stats.get("pnl",0)),
        ("Metals Bot",   metals_on,  met_stats.get("total",0),         met_stats.get("wins",0),         met_stats.get("pnl",0)),
        ("Macro Bot",    True,       macro_stats.get("closed_total",0), macro_stats.get("wins",0),       macro_stats.get("pnl",0)),
    ]
    print(f"\n  {'Bot':<14} {'Trade':>6} {'On':>5} {'WR':>8}  {'PnL':>12}")
    print(f"  {sep('─', 52)}")
    for name, on, total, wins, pnl in rows:
        on_s  = ok("✅") if on else bad("❌")
        wr_s  = wr_str(wins, total) if total else dim("—")
        pnl_s = pnl_clr(pnl) if total else dim("—")
        print(f"  {name:<14} {total:>6}  {on_s}   {wr_s:>8}  {pnl_s:>12}")
    print(f"  {sep('─', 52)}")
    print(f"  {'TOTAL':<14} {'':>6}  {'':>5}  {'':>8}  {pnl_clr(total_pnl):>12}")

    print()
    print(clr("═" * 60, "cyan"))
    print()


if __name__ == "__main__":
    report(as_json="--json" in sys.argv)
