"""
One-shot: closes stale OPEN trades in analytics.db.
Fetches real PnL from Bybit where possible; marks ghost (>24h, no Bybit data) as LOSS/0.
Run: python3 fix_stale_trades.py
"""
import sqlite3
import sys
import os
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))

from config.settings import BYBIT_API_KEY, BYBIT_SECRET, USE_TESTNET, IS_DEMO_TRADING
import ccxt

GHOST_HOURS = 24

def build_exchange():
    ex = ccxt.bybit({"apiKey": BYBIT_API_KEY, "secret": BYBIT_SECRET, "enableRateLimit": True})
    if USE_TESTNET:
        ex.set_sandbox_mode(True)
    elif IS_DEMO_TRADING:
        ex.urls["api"] = ex.urls["demotrading"]
    return ex

def close_trade_db(con, trade_id, exit_price, pnl_usdt, pnl_pct, duration_minutes):
    result = "WIN" if pnl_usdt > 0 else ("LOSS" if pnl_usdt < 0 else "BE")
    con.execute(
        "UPDATE trades SET exit_price=?, pnl_usdt=?, pnl_pct=?, result=?, "
        "duration_minutes=?, timestamp_close=? WHERE id=?",
        (exit_price, pnl_usdt, pnl_pct, result,
         duration_minutes, datetime.now(timezone.utc).isoformat(), trade_id)
    )
    con.commit()

def main():
    con = sqlite3.connect("analytics.db")
    con.row_factory = sqlite3.Row

    open_trades = con.execute(
        "SELECT id, coin, action, entry_price, timestamp_open FROM trades WHERE result='OPEN'"
    ).fetchall()

    if not open_trades:
        print("Нет открытых позиций.")
        con.close()
        return

    print(f"Найдено {len(open_trades)} открытых позиций. Подключаюсь к Bybit...")

    try:
        ex = build_exchange()
        ex.load_markets()
    except Exception as e:
        print(f"Bybit недоступен: {e}")
        ex = None

    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    # Get currently open positions on Bybit
    open_on_bybit = set()
    if ex:
        try:
            positions = ex.fetch_positions()
            open_on_bybit = {
                p["symbol"].replace("/", "").replace(":USDT", "").replace("USDT", "")
                for p in positions
                if float(p.get("contracts") or 0) > 0
            }
            print(f"Открыто на Bybit: {open_on_bybit or 'ничего'}")
        except Exception as e:
            print(f"fetch_positions error: {e}")

    # Group by coin
    by_coin = {}
    for t in open_trades:
        by_coin.setdefault(t["coin"], []).append(dict(t))

    total_closed = 0

    for coin, trades in by_coin.items():
        # Skip if position is currently open on Bybit
        if coin in open_on_bybit:
            print(f"  ⏭ {coin}: позиция ещё открыта на Bybit — пропускаю")
            continue

        symbol = f"{coin}USDT"
        closed_pnl_list = []

        if ex:
            try:
                oldest_ts = min(t["timestamp_open"] or "" for t in trades)
                oldest_ms = int(datetime.fromisoformat(
                    oldest_ts.replace("Z", "+00:00")
                ).timestamp() * 1000)

                resp = ex.private_get_v5_position_closed_pnl({
                    "category": "linear",
                    "symbol": symbol,
                    "limit": 50,
                    "startTime": oldest_ms,
                })
                closed_pnl_list = resp.get("result", {}).get("list", [])
            except Exception as e:
                print(f"  [{coin}] Bybit API error: {e}")

        for trade in trades:
            trade_id = trade["id"]
            entry_price = trade["entry_price"] or 0

            try:
                trade_open_ms = int(datetime.fromisoformat(
                    (trade["timestamp_open"] or "").replace("Z", "+00:00")
                ).timestamp() * 1000)
            except Exception:
                trade_open_ms = 0

            age_hours = (now_ms - trade_open_ms) / 3_600_000 if trade_open_ms else 999

            # Find first Bybit close entry after trade was opened
            matched = None
            for entry in closed_pnl_list:
                entry_ms = int(entry.get("createdTime") or 0)
                if entry_ms >= trade_open_ms:
                    matched = entry
                    break

            if matched:
                pnl = float(matched.get("closedPnl") or 0)
                exit_price = float(matched.get("avgExitPrice") or entry_price)
                ep = entry_price or float(matched.get("avgEntryPrice") or 1)
                pnl_pct = round((exit_price / ep - 1) * 100, 2) if ep else 0
                if trade["action"] == "SHORT":
                    pnl_pct = -pnl_pct
                close_ms = int(matched.get("updatedTime") or matched.get("createdTime") or now_ms)
                duration = max(0, round((close_ms - trade_open_ms) / 60000))

                close_trade_db(con, trade_id, exit_price, pnl, pnl_pct, duration)
                icon = "✅" if pnl > 0 else "❌"
                print(f"  {icon} #{trade_id} {coin} {trade['action']} | exit={exit_price} | pnl={pnl:+.2f}$ | {duration}min")
                total_closed += 1

            elif age_hours > GHOST_HOURS:
                # Ghost: no Bybit record after 24h — mark BE
                duration = round(age_hours * 60)
                close_trade_db(con, trade_id, entry_price, 0.0, 0.0, duration)
                print(f"  👻 #{trade_id} {coin} {trade['action']} | ghost ({age_hours:.0f}h) → закрыто pnl=0")
                total_closed += 1

            else:
                print(f"  ⏳ #{trade_id} {coin} {trade['action']} | {age_hours:.1f}h open — ждём")

    con.close()
    print(f"\nГотово. Закрыто {total_closed} позиций.")

if __name__ == "__main__":
    main()
