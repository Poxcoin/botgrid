from datetime import datetime, timezone
from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///./saas_database.sqlite"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class WaitlistEntry(Base):
    __tablename__ = "waitlist"

    id         = Column(Integer, primary_key=True, index=True)
    email      = Column(String, unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class User(Base):
    __tablename__ = "users"

    id                  = Column(Integer, primary_key=True, index=True)
    email               = Column(String, unique=True, index=True, nullable=False)
    username            = Column(String, unique=True, index=True, nullable=False)
    password_hash       = Column(String, nullable=False)

    # Підписка
    subscription_plan    = Column(String, default="free")   # free | basic | pro
    subscription_expires = Column(DateTime, nullable=True)  # None = немає активної підписки
    is_active           = Column(Boolean, default=True)

    # Bybit API ключі
    bybit_api_key       = Column(String, default="")
    bybit_secret        = Column(String, default="")

    # Telegram
    tg_chat_id          = Column(String, default="")

    # Торгові налаштування
    leverage            = Column(Integer, default=3)
    trade_size_percent  = Column(Float, default=5.0)

    # Реферал
    referral_source     = Column(String, default="")  # bybit_ref | direct | other

    # Мета
    created_at          = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    last_login          = Column(DateTime, nullable=True)

    @property
    def is_subscribed(self) -> bool:
        if self.subscription_plan == "free":
            return False
        if self.subscription_expires is None:
            return False
        return self.subscription_expires > datetime.now(timezone.utc)


Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
