import sqlite3
import subprocess
from datetime import datetime, timezone

# 1. Services
print("=== SERVICES ===")
for svc in ["crypto-web", "crypto-sniper", "crypto-grid", "crypto-bot"]:
    r = subprocess.run(["systemctl", "is-active", svc], capture_output=True, text=True)
    status = r.stdout.strip()
    print(f"  {'✅' if status == 'active' else '❌'} {svc}: {status}")

print()

# 2. Trades from analytics.db
db = sqlite3.connect("analytics.db")
db.row_factory = sqlite3.Row

trades = db.execute("SELECT * FROM trades ORDER BY rowid DESC").fetchall()
open_t = [t for t in trades if t["result"] == "OPEN"]
closed = [t for t in trades if t["result"] != "OPEN"]

wins   = [t for t in closed if (t["pnl_usdt"] or 0) > 0]
losses = [t for t in closed if (t["pnl_usdt"] or 0) <= 0]
total_pnl = sum((t["pnl_usdt"] or 0) for t in closed)
wr = len(wins) / max(len(closed), 1) * 100

print(f"=== TRADES (total {len(trades)}) ===")
print(f"  Closed: {len(closed)}  |  WIN:{len(wins)}  LOSS:{len(losses)}  WR:{wr:.0f}%")
print(f"  Open:   {len(open_t)}")
print(f"  PnL closed: {total_pnl:+.2f}$")
print()

print("  --- OPEN positions ---")
for t in open_t:
    age = ""
    if t["timestamp_open"]:
        try:
            ts = datetime.fromisoformat(t["timestamp_open"].replace("Z", "+00:00"))
            mins = int((datetime.now(timezone.utc) - ts).total_seconds() / 60)
            age = f"{mins}min open"
        except Exception:
            pass
    print(f"  🔄 {t['coin']:<6} {t['action']:<5} | entry={t['entry_price']} | {age}")

print()
print("  --- CLOSED trades (last 10) ---")
for t in list(closed)[:10]:
    pnl = t["pnl_usdt"] or 0
    icon = "✅" if pnl > 0 else "❌"
    dur = f"{t['duration_minutes']}min" if t["duration_minutes"] else "?"
    print(f"  {icon} {t['coin']:<6} {t['action']:<5} | {pnl:+.2f}$ | {dur} | {(t['timestamp_open'] or '')[:16]}")

# 3. Signals summary
sigs = db.execute(
    "SELECT action, COUNT(*) as cnt FROM signals GROUP BY action"
).fetchall()
exec_count = db.execute("SELECT COUNT(*) FROM signals WHERE executed=1").fetchone()[0]
total_sigs  = db.execute("SELECT COUNT(*) FROM signals").fetchone()[0]

print()
print(f"=== SIGNALS (total {total_sigs}) ===")
for s in sigs:
    print(f"  {s['action']}: {s['cnt']}")
print(f"  Executed: {exec_count}")

# Recent executed
recent = db.execute(
    "SELECT coin, action, total_score, confidence, timestamp, executed FROM signals "
    "WHERE executed=1 ORDER BY rowid DESC LIMIT 5"
).fetchall()
print()
print("  --- Last 5 executed signals ---")
for s in recent:
    print(f"  {s['coin']:<6} {s['action']:<6} score={s['total_score']:+.1f} conf={s['confidence']}% | {(s['timestamp'] or '')[:16]}")

db.close()
