#!/usr/bin/env python3
"""One-time migration: add ref_code, referred_by_id to users; create referral_earnings."""
import sqlite3, os, random

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "saas_database.sqlite")

def run():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    for col_sql in [
        "ALTER TABLE users ADD COLUMN ref_code TEXT",
        "ALTER TABLE users ADD COLUMN referred_by_id INTEGER REFERENCES users(id)",
    ]:
        try:
            cur.execute(col_sql)
            print(f"✓ {col_sql}")
        except sqlite3.OperationalError as e:
            print(f"  skip (already exists): {e}")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS referral_earnings (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            referral_id INTEGER NOT NULL REFERENCES users(id),
            referred_id INTEGER NOT NULL REFERENCES users(id),
            week_start  DATETIME NOT NULL,
            fee_paid    REAL DEFAULT 0.0,
            earned      REAL DEFAULT 0.0,
            paid_out    INTEGER DEFAULT 0,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    """)
    print("✓ referral_earnings table ready")

    chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    users = cur.execute("SELECT id FROM users WHERE ref_code IS NULL").fetchall()
    for (uid,) in users:
        while True:
            code = 'KADO-' + ''.join(random.choices(chars, k=6))
            exists = cur.execute("SELECT 1 FROM users WHERE ref_code=?", (code,)).fetchone()
            if not exists:
                break
        cur.execute("UPDATE users SET ref_code=? WHERE id=?", (code, uid))
        print(f"  assigned {code} → user {uid}")

    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    run()
