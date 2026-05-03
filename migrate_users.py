#!/usr/bin/env python3
"""One-time migration: add missing columns to users table."""
from sqlalchemy import text, inspect, create_engine

engine = create_engine("sqlite:///./saas_database.sqlite", connect_args={"check_same_thread": False})
insp = inspect(engine)
cols = {c["name"] for c in insp.get_columns("users")}
print("Existing columns:", cols)

migrations = [
    ("plan",               "ALTER TABLE users ADD COLUMN plan VARCHAR DEFAULT 'trial'"),
    ("trial_ends_at",      "ALTER TABLE users ADD COLUMN trial_ends_at DATETIME"),
    ("tg_chat_id",         "ALTER TABLE users ADD COLUMN tg_chat_id VARCHAR DEFAULT ''"),
    ("email_verified",     "ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 0"),
    ("email_verify_token", "ALTER TABLE users ADD COLUMN email_verify_token VARCHAR"),
    ("totp_secret",        "ALTER TABLE users ADD COLUMN totp_secret VARCHAR"),
    ("totp_enabled",       "ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN DEFAULT 0"),
    ("recovery_codes",     "ALTER TABLE users ADD COLUMN recovery_codes VARCHAR"),
    ("last_login",         "ALTER TABLE users ADD COLUMN last_login DATETIME"),
    ("is_active",          "ALTER TABLE users ADD COLUMN is_active BOOLEAN DEFAULT 1"),
]

with engine.begin() as conn:
    for col, sql in migrations:
        if col not in cols:
            conn.execute(text(sql))
            print(f"Added:  {col}")
        else:
            print(f"Skip:   {col}")

print("Done")
