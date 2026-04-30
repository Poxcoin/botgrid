"""
One-time script: seeds the owner as the first Pro user in saas_database.sqlite.

Run once from the project root:
    python scripts/seed_owner.py

What it does:
  1. Generates FIELD_ENCRYPTION_KEY and appends it to .env (if absent)
  2. Creates the owner User row (plan=pro, is_active=True)
  3. Creates a Subscription row (status=active, no expiry)
  4. Encrypts BYBIT_API_KEY + BYBIT_SECRET and stores them in UserApiKey
"""

import os
import sys

# Ensure we can import from project root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

# ── Step 1: ensure FIELD_ENCRYPTION_KEY exists ────────────────────────────────
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")

if not os.getenv("FIELD_ENCRYPTION_KEY"):
    from cryptography.fernet import Fernet
    new_key = Fernet.generate_key().decode()
    with open(env_path, "a") as f:
        f.write(f"\nFIELD_ENCRYPTION_KEY={new_key}\n")
    os.environ["FIELD_ENCRYPTION_KEY"] = new_key
    print(f"✅ Generated FIELD_ENCRYPTION_KEY → .env")
else:
    print("✅ FIELD_ENCRYPTION_KEY already set")

# ── Step 2: collect owner credentials ─────────────────────────────────────────
api_key = os.getenv("BYBIT_API_KEY", "")
secret  = os.getenv("BYBIT_SECRET", "")
is_demo = os.getenv("IS_DEMO_TRADING", "false").lower() == "true"

if not api_key or not secret:
    print("❌ BYBIT_API_KEY or BYBIT_SECRET missing in .env — aborting")
    sys.exit(1)

owner_email    = "glorimanunited@gmail.com"
owner_username = "owner"
owner_password = os.getenv("DASHBOARD_PASSWORD", "changeme123")

# ── Step 3: create DB records ──────────────────────────────────────────────────
from database import SessionLocal, User, UserApiKey, Subscription, Base, engine
from utils.crypto import encrypt_field
from passlib.context import CryptContext

Base.metadata.create_all(bind=engine)

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
db = SessionLocal()

try:
    existing = db.query(User).filter(User.email == owner_email).first()
    if existing:
        print(f"ℹ️  User {owner_email} already exists (id={existing.id}) — skipping")
        sys.exit(0)

    user = User(
        email          = owner_email,
        username       = owner_username,
        password_hash  = pwd_ctx.hash(owner_password),
        plan           = "pro",
        is_active      = True,
        email_verified = True,
        tg_chat_id     = os.getenv("TG_CHAT_ID", ""),
    )
    db.add(user)
    db.flush()  # get user.id

    sub = Subscription(
        user_id      = user.id,
        plan         = "pro",
        status       = "active",
        base_fee_usd = 29.0,
        expires_at   = None,  # lifetime / manual management
    )
    db.add(sub)

    api_row = UserApiKey(
        user_id      = user.id,
        exchange     = "bybit",
        api_key_enc  = encrypt_field(api_key),
        secret_enc   = encrypt_field(secret),
        is_testnet   = is_demo,
    )
    db.add(api_row)
    db.commit()

    print(f"✅ Owner created: id={user.id} email={owner_email} plan=pro testnet={is_demo}")
    print(f"   Login password = {owner_password!r}")
    print("   Change it immediately via the web dashboard!")

except Exception as e:
    db.rollback()
    print(f"❌ Error: {e}")
    raise
finally:
    db.close()
