import sqlite3
from datetime import datetime

db = sqlite3.connect("bot_data.db")
db.row_factory = sqlite3.Row

rows = db.execute(
    "SELECT coin,direction,leverage,entry_price,exit_price,pnl_usdt,pnl_pct,status,created_at "
    "FROM trades WHERE created_at >= datetime('now','-7 days') ORDER BY created_at DESC"
).fetchall()

wins   = sum(1 for r in rows if (r["pnl_usdt"] or 0) > 0)
losses = sum(1 for r in rows if (r["pnl_usdt"] or 0) < 0)
open_  = sum(1 for r in rows if r["status"] == "open")
total  = sum((r["pnl_usdt"] or 0) for r in rows)
wr     = wins / max(wins + losses, 1) * 100

print(f"\n=== TRADES LAST 7 DAYS ===")
print(f"Total: {len(rows)}  |  WIN:{wins}  LOSS:{losses}  OPEN:{open_}")
print(f"Win Rate: {wr:.0f}%  |  PnL: {total:+.2f}$\n")

for r in rows:
    pnl = r["pnl_usdt"] or 0
    icon = "✅" if pnl > 0 else ("🔄" if r["status"] == "open" else "❌")
    print(f"{icon} {r['coin']:<6} {r['direction']:<5} x{r['leverage']} | "
          f"in={r['entry_price']} | {pnl:+.2f}$ ({(r['pnl_pct'] or 0):+.1f}%) | "
          f"{r['status']:<6} | {r['created_at'][:16]}")

# Grid stats if table exists
try:
    grid = db.execute("SELECT * FROM grid_stats ORDER BY updated_at DESC LIMIT 5").fetchall()
    if grid:
        print("\n=== GRID BOT ===")
        for g in grid:
            print(dict(g))
except Exception:
    pass

db.close()
