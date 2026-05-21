#!/usr/bin/env python3
"""Add User.risk_multiplier column. Default 1.0 (full size). 0.5 = half size for kinder.

Per-user risk override applied by saas_dispatcher to scale SIZE_PCT.
Allows different position sizes for accounts with different balances/risk tolerance.
"""
import sqlite3, os

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "saas_database.sqlite")


def run():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    try:
        cur.execute("ALTER TABLE users ADD COLUMN risk_multiplier REAL DEFAULT 1.0")
        print("OK: added users.risk_multiplier (default 1.0)")
    except sqlite3.OperationalError as e:
        if "duplicate column" in str(e).lower():
            print("skip: risk_multiplier already exists")
        else:
            raise

    # Default all existing users to 1.0
    cur.execute("UPDATE users SET risk_multiplier = 1.0 WHERE risk_multiplier IS NULL")

    # Kinder (user_id=2) gets 0.5 — half size due to bigger absolute balance
    cur.execute("UPDATE users SET risk_multiplier = 0.5 WHERE id = 2")
    print(f"OK: kinder (user=2) risk_multiplier = 0.5")

    conn.commit()
    print("\nFinal state:")
    for row in cur.execute("SELECT id, email, risk_multiplier FROM users ORDER BY id"):
        print(f"  user_id={row[0]} {row[1]} risk_multiplier={row[2]}")
    conn.close()


if __name__ == "__main__":
    run()
