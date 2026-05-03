#!/usr/bin/env python3
"""Run once on VPS to add billing columns to existing SQLite DB."""
import sqlite3, os, sys

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "saas_database.sqlite")

MIGRATIONS = [
    # Users table
    "ALTER TABLE users ADD COLUMN trial_ends_at DATETIME",
    # Subscriptions table
    "ALTER TABLE subscriptions ADD COLUMN stripe_customer_id TEXT",
    "ALTER TABLE subscriptions ADD COLUMN stripe_price_id TEXT",
    "ALTER TABLE subscriptions ADD COLUMN hwm_usd REAL DEFAULT 0.0",
]

def run():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    for sql in MIGRATIONS:
        col = sql.split("ADD COLUMN")[1].strip().split()[0]
        table = sql.split("ALTER TABLE")[1].strip().split()[0]
        cur.execute(f"PRAGMA table_info({table})")
        existing = {row[1] for row in cur.fetchall()}
        if col in existing:
            print(f"  skip {table}.{col} — already exists")
            continue
        cur.execute(sql)
        print(f"  added {table}.{col}")
    conn.commit()
    conn.close()
    print("Migration complete.")

if __name__ == "__main__":
    run()
