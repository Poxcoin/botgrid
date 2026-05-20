"""
repair_pnl.py — one-shot script to fix LOSS trades with pnl_usdt=0.0.

Fetches Bybit closed PnL history and recalculates PnL from price × size
for the 34 trades where closedPnl was incorrectly 0 (demo account quirk).

Run once on VPS: python3 repair_pnl.py
"""
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

import ccxt

DB_PATH = "analytics.db"


def _conn():
    c = sqlite3.connect(DB_PATH, timeout=30)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    return c


def _init_exchange():
    exchange = ccxt.bybit({
        "apiKey":  os.getenv("BYBIT_API_KEY", ""),
        "secret":  os.getenv("BYBIT_SECRET", ""),
        "options": {"defaultType": "linear", "adjustForTimeDifference": True},
        "enableRateLimit": True,
    })
    if os.getenv("IS_DEMO_TRADING", "False").lower() == "true":
        exchange.urls["api"] = exchange.urls["demotrading"]
        exchange.has["fetchCurrencies"] = False
    exchange.load_markets()
    return exchange


def _fetch_closed(exchange, symbol: str, since_ms: int) -> list:
    try:
        resp = exchange.private_get_v5_position_closed_pnl({
            "category":  "linear",
            "symbol":    symbol,
            "limit":     200,
            "startTime": since_ms,
        })
        return resp.get("result", {}).get("list", [])
    except Exception as e:
        print(f"  ⚠️  Bybit fetch {symbol}: {e}")
        return []


def main():
    con = _conn()
    broken = con.execute(
        "SELECT id, coin, action, entry_price, timestamp_open "
        "FROM trades WHERE result='LOSS' AND (pnl_usdt IS NULL OR pnl_usdt=0.0) "
        "ORDER BY timestamp_open"
    ).fetchall()

    if not broken:
        print("✅ No broken trades found.")
        return

    print(f"Found {len(broken)} LOSS trades with pnl=0. Fetching Bybit data...\n")

    exchange = _init_exchange()

    # Group by coin to minimise API calls
    by_coin: dict[str, list] = {}
    for row in broken:
        by_coin.setdefault(row["coin"], []).append(dict(row))

    fixed = 0
    for coin, trades in by_coin.items():
        symbol = f"{coin}USDT"
        oldest_ts = min(t["timestamp_open"] or "" for t in trades)
        try:
            oldest_ms = int(datetime.fromisoformat(
                oldest_ts.replace("Z", "+00:00")
            ).timestamp() * 1000) - 60_000  # 1 min buffer
        except Exception:
            continue

        closed = _fetch_closed(exchange, symbol, oldest_ms)
        if not closed:
            print(f"  [{coin}] No Bybit data found, skipping.")
            continue

        trades.sort(key=lambda t: t["timestamp_open"] or "")
        available = list(closed)

        for trade in trades:
            try:
                trade_open_ms = int(datetime.fromisoformat(
                    (trade["timestamp_open"] or "").replace("Z", "+00:00")
                ).timestamp() * 1000)
            except Exception:
                continue

            matched = None
            for i, entry in enumerate(available):
                entry_ms = int(entry.get("createdTime") or 0)
                if entry_ms >= trade_open_ms - 30_000:
                    matched = entry
                    available.pop(i)
                    break

            if not matched:
                print(f"  [{coin} #{trade['id']}] No Bybit match found.")
                continue

            raw_pnl = float(matched.get("closedPnl") or 0)

            if raw_pnl != 0:
                pnl = raw_pnl
            else:
                # Recalculate from prices (demo quirk: closedPnl=0)
                closed_size = float(matched.get("closedSize") or matched.get("qty") or 0)
                avg_entry   = float(matched.get("avgEntryPrice") or trade["entry_price"] or 0)
                avg_exit    = float(matched.get("avgExitPrice") or 0)
                bybit_side  = (matched.get("side") or "").lower()

                if closed_size > 0 and avg_exit > 0 and avg_entry > 0:
                    if bybit_side == "sell":   # closing a LONG
                        pnl = round((avg_exit - avg_entry) * closed_size, 4)
                    elif bybit_side == "buy":  # closing a SHORT
                        pnl = round((avg_entry - avg_exit) * closed_size, 4)
                    else:
                        action = (trade["action"] or "").upper()
                        if action in ("LONG", "BUY"):
                            pnl = round((avg_exit - avg_entry) * closed_size, 4)
                        else:
                            pnl = round((avg_entry - avg_exit) * closed_size, 4)
                else:
                    print(f"  [{coin} #{trade['id']}] Cannot recalculate — missing qty/price data.")
                    continue

            result = "WIN" if pnl > 0 else "LOSS"
            exit_price = float(matched.get("avgExitPrice") or 0)
            entry_price = trade["entry_price"] or float(matched.get("avgEntryPrice") or 1)
            pnl_pct = round((exit_price / entry_price - 1) * 100, 2) if entry_price else 0
            action = (trade["action"] or "").upper()
            if action in ("SHORT", "SELL"):
                pnl_pct = -pnl_pct
            close_ms  = int(matched.get("updatedTime") or matched.get("createdTime") or trade_open_ms)
            duration  = max(0, round((close_ms - trade_open_ms) / 60000))

            con.execute(
                "UPDATE trades SET pnl_usdt=?, pnl_pct=?, result=?, exit_price=?, duration_minutes=? WHERE id=?",
                (pnl, pnl_pct, result, exit_price, duration, trade["id"])
            )
            con.commit()
            print(f"  ✅ #{trade['id']} {coin} {trade['action']} → pnl={pnl:+.4f} ({result})")
            fixed += 1

    print(f"\n✅ Done. Fixed {fixed}/{len(broken)} trades.")
    con.close()


if __name__ == "__main__":
    main()
