from datetime import datetime, timezone
from sqlalchemy import (
    create_engine, Column, Integer, String, Float,
    Boolean, DateTime, ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

DATABASE_URL = "sqlite:///./saas_database.sqlite"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
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

    # Telegram notifications
    tg_chat_id    = Column(String, default="")

    # Email verification
    email_verified     = Column(Boolean, default=False)
    email_verify_token = Column(String, nullable=True)

    # 2FA (TOTP)
    totp_secret      = Column(String, nullable=True)
    totp_enabled     = Column(Boolean, default=False)
    recovery_codes   = Column(String, nullable=True)  # JSON array of bcrypt-hashed one-time codes

    created_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_login   = Column(DateTime, nullable=True)

    # Relationships
    api_keys     = relationship("UserApiKey",      back_populates="user", cascade="all, delete-orphan")
    trades       = relationship("UserTrade",        back_populates="user", cascade="all, delete-orphan")
    monthly_pnls = relationship("MonthlyPnl",       back_populates="user", cascade="all, delete-orphan")
    subscription = relationship("Subscription",     back_populates="user", uselist=False, cascade="all, delete-orphan")

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
            if self.trial_ends_at and datetime.now(timezone.utc) > self.trial_ends_at:
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
    stripe_price_id    = Column(String, nullable=True)   # Stripe price ID (basic/pro)
    hwm_usd            = Column(Float,  default=0.0)     # high-water mark for performance plan

    user = relationship("User", back_populates="subscription")

    @property
    def is_active(self) -> bool:
        if self.status != "active":
            return False
        if self.expires_at is None:
            return True
        return self.expires_at > datetime.now(timezone.utc)


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

    __table_args__ = (UniqueConstraint("user_id", "exchange", name="uq_user_exchange"),)

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
    status      = Column(String, default="open")       # open | closed | failed | cancelled
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
    fee_paid        = Column(Boolean, default=False)
    settled_at      = Column(DateTime, nullable=True)

    __table_args__ = (UniqueConstraint("user_id", "year", "month", name="uq_user_month"),)

    user = relationship("User", back_populates="monthly_pnls")


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


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
