"""
DB migration: upgrades existing saas_database.sqlite to the new SaaS schema.

Safe to run multiple times — skips already-done steps.

Run:
    /opt/botgrid/venv/bin/python scripts/migrate_db.py
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

import sqlite3
from database import engine, Base, SessionLocal, User, UserApiKey, Subscription
from utils.crypto import encrypt_field

DB_PATH = "saas_database.sqlite"
conn = sqlite3.connect(DB_PATH)
cur  = conn.cursor()

def columns(table):
    cur.execute(f"PRAGMA table_info({table})")
    return {row[1] for row in cur.fetchall()}

def tables():
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return {row[0] for row in cur.fetchall()}

print("── Step 1: create new tables (if missing) ──────────────────────────────")
Base.metadata.create_all(bind=engine)
print("   done")

print("── Step 2: add missing columns to users ────────────────────────────────")
existing = columns("users")
adds = [
    ("plan",               "TEXT    DEFAULT 'free'"),
    ("is_active",          "BOOLEAN DEFAULT 1"),
    ("tg_chat_id",         "TEXT    DEFAULT ''"),
    ("email_verified",     "BOOLEAN DEFAULT 0"),
    ("email_verify_token", "TEXT"),
    ("totp_secret",        "TEXT"),
    ("totp_enabled",       "BOOLEAN DEFAULT 0"),
    ("last_login",         "DATETIME"),
]
for col, typedef in adds:
    if col not in existing:
        cur.execute(f"ALTER TABLE users ADD COLUMN {col} {typedef}")
        print(f"   + users.{col}")
conn.commit()

print("── Step 3: migrate plan from old subscription_plan column ──────────────")
existing = columns("users")
if "subscription_plan" in existing:
    cur.execute("""
        UPDATE users SET plan = subscription_plan
        WHERE subscription_plan IS NOT NULL AND subscription_plan != ''
    """)
    conn.commit()
    print(f"   migrated {cur.rowcount} rows")
else:
    print("   subscription_plan column not found — skipping")

print("── Step 4: migrate Bybit API keys → user_api_keys table ────────────────")
existing = columns("users")
if "bybit_api_key" in existing and "bybit_secret" in existing:
    cur.execute("SELECT id, bybit_api_key, bybit_secret FROM users WHERE bybit_api_key IS NOT NULL AND bybit_api_key != ''")
    rows = cur.fetchall()
    db = SessionLocal()
    migrated = 0
    for uid, raw_key, raw_secret in rows:
        # Keys might already be Fernet-encrypted from old code, try to use as-is
        exists = db.query(UserApiKey).filter_by(user_id=uid, exchange="bybit").first()
        if exists:
            continue
        # Encrypt with new Fernet key
        try:
            from utils.crypto import decrypt_field
            # Try to decrypt (old Fernet) — if works, re-encrypt with current key
            dk = decrypt_field(raw_key)
            ds = decrypt_field(raw_secret)
            if dk and ds:
                enc_key = encrypt_field(dk)
                enc_sec = encrypt_field(ds)
            else:
                enc_key = encrypt_field(raw_key)
                enc_sec = encrypt_field(raw_secret)
        except Exception:
            enc_key = encrypt_field(raw_key)
            enc_sec = encrypt_field(raw_secret)
        key_row = UserApiKey(user_id=uid, exchange="bybit", api_key_enc=enc_key, secret_enc=enc_sec, is_testnet=False)
        db.add(key_row)
        migrated += 1
    db.commit()
    db.close()
    print(f"   migrated {migrated} API key rows")
else:
    print("   bybit_api_key column not found — skipping")

print("── Step 5: create Subscription rows for existing pro users ─────────────")
db = SessionLocal()
cur.execute("SELECT id FROM users WHERE plan = 'pro'")
pro_users = [r[0] for r in cur.fetchall()]
created = 0
for uid in pro_users:
    exists = db.query(Subscription).filter_by(user_id=uid).first()
    if not exists:
        sub = Subscription(user_id=uid, plan="pro", status="active", expires_at=None)
        db.add(sub)
        created += 1
db.commit()
db.close()
print(f"   created {created} subscription rows")

conn.close()
print("\n✅ Migration complete. Now run: python scripts/seed_owner.py")
