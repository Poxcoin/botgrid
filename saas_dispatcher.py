"""
saas_dispatcher.py — Multi-user bot engine.

Читає активних юзерів з БД, запускає grid bot на їх API ключах.
Синхронізується кожну хвилину: нові юзери → старт, видалені ключі → стоп.
"""
import threading
import time
import logging
from datetime import datetime, timezone

from database import SessionLocal, User, UserApiKey
from utils.crypto import decrypt_field
from grid_bot import run_grid_engine_for_user

logger = logging.getLogger("saas_dispatcher")

# user_id → {"thread": Thread, "stop_event": Event, "started_at": datetime}
_instances: dict[int, dict] = {}
_lock = threading.Lock()


def _start_user(user_id: int, api_key: str, secret: str) -> None:
    stop_event = threading.Event()
    t = threading.Thread(
        target=run_grid_engine_for_user,
        args=(user_id, api_key, secret, stop_event),
        name=f"grid-u{user_id}",
        daemon=True,
    )
    t.start()
    with _lock:
        _instances[user_id] = {
            "thread": t,
            "stop_event": stop_event,
            "started_at": datetime.now(timezone.utc),
        }
    logger.info(f"[DISPATCHER] ▶️ Started bots for user {user_id}")


def stop_user(user_id: int) -> None:
    with _lock:
        inst = _instances.pop(user_id, None)
    if inst:
        inst["stop_event"].set()
        logger.info(f"[DISPATCHER] ⏹️ Stopped bots for user {user_id}")


def get_status() -> list[dict]:
    """Возвращает список активных инстансов для /api/dispatcher/status."""
    with _lock:
        return [
            {
                "user_id": uid,
                "alive": inst["thread"].is_alive(),
                "started_at": inst["started_at"].isoformat(),
            }
            for uid, inst in _instances.items()
        ]


def _sync() -> None:
    """Синхронизирует запущенные инстансы с состоянием БД."""
    db = SessionLocal()
    try:
        rows = (
            db.query(User, UserApiKey)
            .join(UserApiKey, User.id == UserApiKey.user_id)
            .filter(User.is_active == True, User.email_verified == True)
            .all()
        )

        active_ids: set[int] = set()
        for user, key_row in rows:
            active_ids.add(user.id)
            with _lock:
                already_running = user.id in _instances and _instances[user.id]["thread"].is_alive()
            if not already_running:
                try:
                    ak  = decrypt_field(key_row.api_key_enc)
                    sec = decrypt_field(key_row.secret_enc)
                    _start_user(user.id, ak, sec)
                except Exception as e:
                    logger.error(f"[DISPATCHER] Failed to start user {user.id}: {e}")

        # Stop bots for users who removed their API key or deactivated
        with _lock:
            stale = [uid for uid in _instances if uid not in active_ids]
        for uid in stale:
            stop_user(uid)

    except Exception as e:
        logger.error(f"[DISPATCHER] Sync error: {e}")
    finally:
        db.close()


def dispatcher_loop() -> None:
    """Главный цикл диспатчера. Запускать в отдельном daemon-потоке."""
    logger.info("[DISPATCHER] Started")
    while True:
        try:
            _sync()
        except Exception as e:
            logger.error(f"[DISPATCHER] Loop error: {e}")
        time.sleep(60)


def sync_user(user_id: int) -> None:
    """Немедленно запускает/перезапускает боты для конкретного пользователя.
    Вызывать после сохранения API ключей юзера.
    """
    db = SessionLocal()
    try:
        key_row = db.query(UserApiKey).filter_by(user_id=user_id, exchange="bybit").first()
        user = db.query(User).filter_by(id=user_id).first()
        if not key_row or not user or not user.is_active or not user.email_verified:
            stop_user(user_id)
            return
        # Останавливаем старый инстанс если есть (ключи могли смениться)
        with _lock:
            already = user_id in _instances
        if already:
            stop_user(user_id)
            time.sleep(1)
        ak  = decrypt_field(key_row.api_key_enc)
        sec = decrypt_field(key_row.secret_enc)
        _start_user(user_id, ak, sec)
    except Exception as e:
        logger.error(f"[DISPATCHER] sync_user({user_id}) error: {e}")
    finally:
        db.close()


def start_dispatcher() -> threading.Thread:
    """Запускает диспатчер в фоновом daemon-потоке. Вызывать при старте web_server."""
    t = threading.Thread(target=dispatcher_loop, name="saas-dispatcher", daemon=True)
    t.start()
    return t
