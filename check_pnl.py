import sqlite3
from datetime import datetime

db = sqlite3.connect("bot_data.db")
db.row_factory = sqlite3.Row

# Show all tables first
tables = db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").fetchall()
print("Tables:", [t["name"] for t in tables])
for t in tables:
    count = db.execute(f"SELECT COUNT(*) FROM [{t['name']}]").fetchone()[0]
    cols  = [c[1] for c in db.execute(f"PRAGMA table_info([{t['name']}])").fetchall()]
    print(f"  {t['name']}: {count} rows | cols: {cols}")
print()

trade_table = None
for candidate in ["trades", "trade_log", "positions", "orders", "signal_trades"]:
    if any(t["name"] == candidate for t in tables):
        trade_table = candidate
        break

if not trade_table:
    print("No trades table found — showing raw last 10 rows from each table:")
    for t in tables:
        rows = db.execute(f"SELECT * FROM [{t['name']}] ORDER BY rowid DESC LIMIT 5").fetchall()
        if rows:
            print(f"\n--- {t['name']} (last 5) ---")
            for r in rows:
                print(dict(r))
    db.close()
    exit()

rows = db.execute(
    f"SELECT * FROM {trade_table} ORDER BY rowid DESC LIMIT 50"
).fetchall()

print(f"\n=== {trade_table.upper()} (last 50) ===")
for r in rows:
    print(dict(r))

db.close()
