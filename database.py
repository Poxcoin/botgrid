import glob
import os
import shutil
import sqlite3
from datetime import datetime, timezone
from sqlalchemy import (
    create_engine, Column, Integer, String, Float,
    Boolean, DateTime, ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

_DB_DIR  = os.path.dirname(os.path.abspath(__file__))
_DB_PATH = os.path.join(_DB_DIR, "saas_database.sqlite")
DATABASE_URL = f"sqlite:///{_DB_PATH}"


def _find_latest_backup() -> str | None:
    patterns = [
        os.path.join(_DB_DIR, "backups", "hourly",  "*.sqlite"),
        os.path.join(_DB_DIR, "backups", "daily",   "*.sqlite"),
        os.path.join(_DB_DIR, "backups", "weekly",  "*.sqlite"),
        os.path.join(_DB_DIR, "backups", "monthly", "*.sqlite"),
    ]
    candidates = []
    for pat in patterns:
        candidates.extend(glob.glob(pat))
    return max(candidates, key=os.path.getmtime) if candidates else None


def _ensure_db_healthy() -> None:
    """Check DB integrity on startup; auto-restore from backup if corrupted."""
    if not os.path.exists(_DB_PATH):
        return  # fresh install — SQLAlchemy will create it

    try:
        conn = sqlite3.connect(_DB_PATH, timeout=5)
        result = conn.execute("PRAGMA integrity_check").fetchone()
        if result and result[0] == "ok":
            # Main DB healthy — also checkpoint WAL to catch malformed WAL files
            try:
                conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                conn.close()
                return
            except sqlite3.DatabaseError as wal_err:
                conn.close()
                print(f"[DB] ⚠️  WAL malformed ({wal_err}) — clearing WAL files")
                for ext in ("-wal", "-shm"):
                    p = _DB_PATH + ext
                    if os.path.exists(p):
                        os.remove(p)
                return
        conn.close()
        print(f"[DB] ⚠️  integrity_check: {result[0] if result else '?'} — відновлення з бекапу...")
    except sqlite3.DatabaseError as e:
        print(f"[DB] ⚠️  DB corrupted ({e}) — відновлення з бекапу...")

    for ext in ("-wal", "-shm"):
        p = _DB_PATH + ext
        if os.path.exists(p):
            os.remove(p)

    backup = _find_latest_backup()
    if not backup:
        print("[DB] ❌ Бекапів не знайдено — стартуємо з порожньою DB")
        os.remove(_DB_PATH)
        return

    print(f"[DB] 🔄 Відновлення з {os.path.basename(backup)} ...")
    try:
        src = sqlite3.connect(backup, timeout=10)
        dst = sqlite3.connect(_DB_PATH, timeout=10)
        src.backup(dst)
        dst.close()
        src.close()
        print("[DB] ✅ DB відновлено успішно")
    except Exception as e:
        print(f"[DB] ❌ Відновлення не вдалося: {e} — видаляємо, SQLAlchemy відтворить схему")
        try:
            os.remove(_DB_PATH)
        except Exception:
            pass


_ensure_db_healthy()


def _enable_wal(dbapi_conn, _connection_record):
    dbapi_conn.execute("PRAGMA journal_mode=WAL")
    dbapi_conn.execute("PRAGMA synchronous=NORMAL")


from sqlalchemy import event as _sa_event

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False, "timeout": 30},
)
_sa_event.listen(engine, "connect", _enable_wal)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ── Waitlist ──────────────────────────────────────────────────────────────────
class WaitlistEntry(Base):
    __tablename__ = "waitlist"

    id         = Column(Integer, primary_key=True, index=True)
    email      = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


# ── Users ─────────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id            = Column(Integer, primary_key=True, index=True)
    email         = Column(String, unique=True, index=True, nullable=False)
    username      = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)

    # Plan: trial | free | basic | pro | performance
    plan          = Column(String, default="trial")
    trial_ends_at = Column(DateTime, nullable=True)   # set on register; None = not a trial
    is_active     = Column(Boolean, default=True)

    # Telegram notifications — set automatically via deep-link /start (see userbot/)
    tg_chat_id    = Column(String, default="")
    tg_username   = Column(String, default="")

    # Email verification
    email_verified     = Column(Boolean, default=False)
    email_verify_token = Column(String, nullable=True)

    # Password reset
    password_reset_token   = Column(String, nullable=True, index=True)
    password_reset_expires = Column(DateTime, nullable=True)

    # 2FA (TOTP)
    totp_secret      = Column(String, nullable=True)
    totp_enabled     = Column(Boolean, default=False)
    recovery_codes   = Column(String, nullable=True)  # JSON array of bcrypt-hashed one-time codes

    created_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_login   = Column(DateTime, nullable=True)

    # Onboarding
    onboarding_completed = Column(Boolean, default=False)
    onboarding_step      = Column(Integer, default=0)

    # Legal consent
    terms_accepted_at = Column(DateTime, nullable=True)

    # Referral
    ref_code       = Column(String, unique=True, nullable=True, index=True)   # e.g. "KADO-X9KM2R"
    referred_by_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)

    # Relationships
    api_keys     = relationship("UserApiKey",      back_populates="user", cascade="all, delete-orphan")
    trades       = relationship("UserTrade",        back_populates="user", cascade="all, delete-orphan")
    monthly_pnls = relationship("MonthlyPnl",       back_populates="user", cascade="all, delete-orphan")
    weekly_pnls  = relationship("WeeklyPnl",        back_populates="user", cascade="all, delete-orphan")
    subscription = relationship("Subscription",     back_populates="user", uselist=False, cascade="all, delete-orphan")
    referral_earnings_given    = relationship("ReferralEarning", foreign_keys="ReferralEarning.referral_id", back_populates="referrer")
    referral_earnings_received = relationship("ReferralEarning", foreign_keys="ReferralEarning.referred_id", back_populates="referred")

    @staticmethod
    def generate_ref_code():
        import random
        chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        suffix = ''.join(random.choices(chars, k=6))
        return f"KADO-{suffix}"

    @property
    def is_pro(self) -> bool:
        if self.plan not in {"pro", "performance"}:
            return False
        if self.subscription is None:
            return False
        return self.subscription.is_active

    @property
    def effective_plan(self) -> str:
        """Returns actual usable plan, handling lazy trial expiry."""
        if self.plan == "trial":
            if self.trial_ends_at and datetime.utcnow() > self.trial_ends_at:
                return "free"
            return "trial"
        return self.plan

    @property
    def can_trade(self) -> bool:
        """Free users get grid only — checked at dispatcher level."""
        return self.is_active and self.api_keys != []


# ── Subscriptions ─────────────────────────────────────────────────────────────
class Subscription(Base):
    __tablename__ = "subscriptions"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True)
    plan            = Column(String, default="basic")   # basic | pro | performance
    status          = Column(String, default="active")       # active | cancelled | past_due
    base_fee_usd    = Column(Float, default=29.0)            # $29/mo base
    performance_pct = Column(Float, default=20.0)            # 20% of monthly profit
    started_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at      = Column(DateTime, nullable=True)        # None = lifetime/manual
    stripe_sub_id   = Column(String, nullable=True)          # Stripe subscription ID
    stripe_customer_id = Column(String, nullable=True)   # Stripe customer ID
    stripe_price_id    = Column(String, nullable=True)   # Stripe price ID (basic | pro; null for performance)
    hwm_usd            = Column(Float,  default=0.0)     # high-water mark for performance plan

    user = relationship("User", back_populates="subscription")

    @property
    def is_active(self) -> bool:
        if self.status != "active":
            return False
        if self.expires_at is None:
            return True
        return self.expires_at > datetime.utcnow()


# ── Telegram Link Tokens ───────────────────────────────────────────────────────
class TelegramLinkToken(Base):
    __tablename__ = "telegram_link_tokens"

    id         = Column(Integer, primary_key=True)
    token      = Column(String, unique=True, index=True, nullable=False)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=False)
    used       = Column(Boolean, default=False)

    user = relationship("User")


# ── API Keys (encrypted) ──────────────────────────────────────────────────────
class UserApiKey(Base):
    __tablename__ = "user_api_keys"

    id            = Column(Integer, primary_key=True, index=True)
    user_id       = Column(Integer, ForeignKey("users.id"), nullable=False)
    exchange      = Column(String, default="bybit")   # bybit
    api_key_enc   = Column(String, nullable=False)    # Fernet encrypted
    secret_enc    = Column(String, nullable=False)    # Fernet encrypted
    is_testnet    = Column(Boolean, default=False)
    last_verified = Column(DateTime, nullable=True)   # last successful ping
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (UniqueConstraint("user_id", "exchange", "is_testnet", name="uq_user_exchange_testnet"),)

    user = relationship("User", back_populates="api_keys")


# ── Trades (per user) ─────────────────────────────────────────────────────────
class UserTrade(Base):
    __tablename__ = "user_trades"

    id          = Column(Integer, primary_key=True, index=True)
    user_id     = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    signal_id   = Column(String, nullable=True)        # UUID of the signal
    source      = Column(String, default="news")       # news | fr | grid | listing | whale
    symbol      = Column(String, nullable=False)       # e.g. SOL/USDT:USDT
    side        = Column(String, nullable=False)       # LONG | SHORT
    leverage    = Column(Integer, default=3)
    entry_price = Column(Float, nullable=True)
    exit_price  = Column(Float, nullable=True)
    qty         = Column(Float, nullable=True)
    pnl_usdt    = Column(Float, nullable=True)         # realized PnL in USDT
    status      = Column(String, default="open", index=True)  # open | closed | failed | cancelled
    order_id    = Column(String, nullable=True)        # exchange order ID
    error_msg   = Column(String, nullable=True)        # if status=failed
    opened_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    closed_at   = Column(DateTime, nullable=True)

    user = relationship("User", back_populates="trades")


# ── Monthly PnL & Performance Fee ─────────────────────────────────────────────
class MonthlyPnl(Base):
    __tablename__ = "monthly_pnl"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    year            = Column(Integer, nullable=False)
    month           = Column(Integer, nullable=False)   # 1–12
    gross_pnl       = Column(Float, default=0.0)        # sum of closed trade PnL
    performance_fee = Column(Float, default=0.0)        # gross_pnl * 20% (only if > 0)
    net_pnl         = Column(Float, default=0.0)        # gross_pnl - performance_fee
    fee_paid             = Column(Boolean, default=False)
    settled_at           = Column(DateTime, nullable=True)
    payment_notified_at  = Column(DateTime, nullable=True)   # user clicked "I've Paid"
    tx_hash              = Column(String,   nullable=True)   # optional USDT tx hash

    __table_args__ = (UniqueConstraint("user_id", "year", "month", name="uq_user_month"),)

    user = relationship("User", back_populates="monthly_pnls")


# ── Weekly PnL & Performance Fee ──────────────────────────────────────────────
class WeeklyPnl(Base):
    __tablename__ = "weekly_pnl"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    year            = Column(Integer, nullable=False)
    week            = Column(Integer, nullable=False)   # ISO week 1–53
    gross_pnl       = Column(Float, default=0.0)
    performance_fee = Column(Float, default=0.0)        # gross_pnl * 20%
    net_pnl         = Column(Float, default=0.0)
    fee_paid             = Column(Boolean, default=False)
    settled_at           = Column(DateTime, nullable=True)
    payment_notified_at  = Column(DateTime, nullable=True)
    tx_hash              = Column(String,   nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "year", "week", name="uq_user_week"),)

    user = relationship("User", back_populates="weekly_pnls")


# ── Referral Earnings ─────────────────────────────────────────────────────────
class ReferralEarning(Base):
    __tablename__ = "referral_earnings"

    id          = Column(Integer, primary_key=True)
    referral_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    referred_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    week_start  = Column(DateTime, nullable=False)
    fee_paid    = Column(Float, default=0.0)
    earned      = Column(Float, default=0.0)
    paid_out    = Column(Boolean, default=False)
    created_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    referrer = relationship("User", foreign_keys=[referral_id], back_populates="referral_earnings_given")
    referred = relationship("User", foreign_keys=[referred_id], back_populates="referral_earnings_received")


# ── Telegram link tokens (one-time deep-link) ────────────────────────────────
class TgLinkToken(Base):
    __tablename__ = "tg_link_tokens"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token      = Column(String, unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    expires_at = Column(DateTime, nullable=False)
    used_at    = Column(DateTime, nullable=True)


# ── Audit Log (immutable) ─────────────────────────────────────────────────────
class AuditLog(Base):
    __tablename__ = "audit_log"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=True)
    action     = Column(String, nullable=False)   # trade_open | trade_close | api_key_added | login | etc.
    detail_enc = Column(String, nullable=True)    # Fernet-encrypted JSON string
    ip_address = Column(String, nullable=True)
    ts         = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


Base.metadata.create_all(bind=engine)


def _migrate_columns():
    """Add columns introduced after initial schema creation."""
    from sqlalchemy import text, inspect as sa_inspect
    inspector = sa_inspect(engine)
    monthly_cols = {c["name"] for c in inspector.get_columns("monthly_pnl")}
    user_cols = {c["name"] for c in inspector.get_columns("users")}
    with engine.begin() as conn:
        if "payment_notified_at" not in monthly_cols:
            conn.execute(text("ALTER TABLE monthly_pnl ADD COLUMN payment_notified_at DATETIME"))
        if "tx_hash" not in monthly_cols:
            conn.execute(text("ALTER TABLE monthly_pnl ADD COLUMN tx_hash VARCHAR"))
        if "password_reset_token" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN password_reset_token VARCHAR"))
        if "password_reset_expires" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN password_reset_expires DATETIME"))
        if "tg_username" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN tg_username VARCHAR DEFAULT ''"))
        if "plan" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN plan VARCHAR DEFAULT 'trial'"))
        if "recovery_codes" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN recovery_codes VARCHAR"))
        if "ref_code" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN ref_code VARCHAR"))
        if "referred_by_id" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN referred_by_id INTEGER"))
        if "onboarding_completed" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN onboarding_completed BOOLEAN DEFAULT 0"))
            # existing users with API keys are already onboarded
            conn.execute(text(
                "UPDATE users SET onboarding_completed = 1 "
                "WHERE id IN (SELECT DISTINCT user_id FROM api_keys)"
            ))
        if "onboarding_step" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN onboarding_step INTEGER DEFAULT 0"))
        if "terms_accepted_at" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN terms_accepted_at DATETIME"))


_migrate_columns()


def _migrate_indexes():
    """Create indexes on existing columns that were added after initial schema creation."""
    from sqlalchemy import text
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_users_ref_code "
            "ON users (ref_code)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_users_referred_by_id "
            "ON users (referred_by_id)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_users_password_reset_token "
            "ON users (password_reset_token)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_user_trades_status "
            "ON user_trades (status)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_referral_earnings_referral_id "
            "ON referral_earnings (referral_id)"
        ))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_referral_earnings_referred_id "
            "ON referral_earnings (referred_id)"
        ))


_migrate_indexes()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
