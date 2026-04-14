from sqlalchemy import create_engine, Column, Integer, String, Float, Boolean
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = "sqlite:///./saas_database.sqlite"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    
    # Биржевые ключи (пока в открытом виде для MVP, в реальности нужно шифровать)
    bybit_api_key = Column(String, default="")
    bybit_secret = Column(String, default="")
    
    # Telegram Уведомления
    tg_chat_id = Column(String, default="")
    
    # Торговые Настройки
    leverage = Column(Integer, default=3)
    trade_size_percent = Column(Float, default=5.0)
    
    # Активен ли пользователь (можно отключать подписку)
    is_active = Column(Boolean, default=True)

# Создаем все таблицы, если их нет
Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
