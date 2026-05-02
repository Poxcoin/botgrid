import sqlite3
import os
import subprocess

# 1. Service status
print("=== SERVICES ===")
for svc in ["crypto-web", "crypto-sniper", "crypto-grid", "crypto-bot"]:
    r = subprocess.run(["systemctl", "is-active", svc], capture_output=True, text=True)
    status = r.stdout.strip()
    icon = "✅" if status == "active" else "❌"
    print(f"  {icon} {svc}: {status}")

print()

# 2. Scan all .db files
db_files = []
for f in os.listdir("."):
    if f.endswith(".db"):
        db_files.append(f)

for dbf in sorted(db_files):
    size = os.path.getsize(dbf)
    db = sqlite3.connect(dbf)
    db.row_factory = sqlite3.Row
    tables = [r[0] for r in db.execute(
        "SELECT name FROM sqlite_master WHERE type='table'"
    ).fetchall()]
    print(f"=== {dbf} ({size//1024}KB) — tables: {tables} ===")

    for t in tables:
        count = db.execute(f"SELECT COUNT(*) FROM [{t}]").fetchone()[0]
        cols  = [c[1] for c in db.execute(f"PRAGMA table_info([{t}])").fetchall()]
        print(f"  {t}: {count} rows | {cols}")

        # Show last 5 rows of interesting tables
        if any(k in t.lower() for k in ["trade", "order", "pnl", "position", "deal", "grid", "signal"]):
            rows = db.execute(f"SELECT * FROM [{t}] ORDER BY rowid DESC LIMIT 5").fetchall()
            for r in rows:
                print(f"    {dict(r)}")
    db.close()
    print()
