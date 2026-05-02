import sqlite3
from datetime import datetime, timezone

con = sqlite3.connect("analytics.db")

total_sig = con.execute("SELECT COUNT(*) FROM signals").fetchone()[0]
recent_sig = con.execute(
    "SELECT COUNT(*) FROM signals WHERE timestamp >= datetime('now','-3 days')"
).fetchone()[0]

closed = con.execute(
    "SELECT COUNT(*), SUM(pnl_usdt), SUM(CASE WHEN pnl_usdt>0 THEN 1 ELSE 0 END)"
    " FROM trades WHERE result!='OPEN'"
).fetchone()
opened = con.execute("SELECT COUNT(*) FROM trades WHERE result='OPEN'").fetchone()[0]

grid_coins = ("SOL", "BTC", "ETH")
g = con.execute(
    "SELECT COUNT(*), SUM(pnl_usdt), SUM(CASE WHEN pnl_usdt>0 THEN 1 ELSE 0 END)"
    " FROM trades WHERE result!='OPEN' AND coin IN ('SOL','BTC','ETH')"
).fetchone()
s = con.execute(
    "SELECT COUNT(*), SUM(pnl_usdt), SUM(CASE WHEN pnl_usdt>0 THEN 1 ELSE 0 END)"
    " FROM trades WHERE result!='OPEN' AND coin NOT IN ('SOL','BTC','ETH')"
).fetchone()

con.close()

def wr(wins, total):
    return wins / max(total, 1) * 100

print("=" * 40)
print(f"  Сигналов:  всего {total_sig}  (за 3 дня: {recent_sig})")
print("=" * 40)
print(f"  Grid бот   ({g[0]} угод  WR {wr(g[2] or 0, g[0] or 1):.0f}%)")
print(f"    PnL: {g[1] or 0:+.2f}$")
print(f"  Signal бот ({s[0]} угод  WR {wr(s[2] or 0, s[0] or 1):.0f}%)")
print(f"    PnL: {s[1] or 0:+.2f}$")
print("=" * 40)
total_pnl = (g[1] or 0) + (s[1] or 0)
print(f"  ИТОГО PnL: {total_pnl:+.2f}$  |  Открыто: {opened}")
print("=" * 40)
