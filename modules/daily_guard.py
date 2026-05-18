"""
daily_guard.py — Дневной лимит убытков.

Останавливает торговлю если за UTC-день потеряно > MAX_DAILY_LOSS_PCT% баланса.
Автоматически сбрасывается в UTC полночь.

Shared между main и alt ботом: оба пишут/читают один state файл.
Для защиты от race condition (два процесса одновременно) используется
атомарная запись через временный файл.

Использование:
    import modules.daily_guard as guard

    # При старте бота:
    guard.init(current_balance=free_usdt)

    # Перед каждой сделкой:
    if not guard.check(current_balance=free_usdt):
        print("Торговля остановлена — дневной лимит убытков")
        return
"""
import json
import os
import tempfile
from datetime import datetime, timezone

MAX_DAILY_LOSS_PCT = 5.0    # % потерь за UTC-день → стоп торговли
STATE_FILE = "daily_guard_state.json"

# Кэш текущего процесса (читаем файл только при изменениях)
_state: dict = {}


# ─── I/O ─────────────────────────────────────────────────────────────────────

def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _load() -> dict:
    if os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save(state: dict) -> None:
    """Атомарная запись через временный файл — защита от corruption."""
    try:
        dir_ = os.path.dirname(os.path.abspath(STATE_FILE)) or "."
        with tempfile.NamedTemporaryFile("w", dir=dir_, delete=False, suffix=".tmp") as tmp:
            json.dump(state, tmp, indent=2)
            tmp_path = tmp.name
        os.replace(tmp_path, STATE_FILE)
    except Exception as e:
        print(f"[daily_guard] Ошибка записи: {e}")


# ─── Public API ───────────────────────────────────────────────────────────────

def init(current_balance: float) -> None:
    """
    Вызвать ОДИН РАЗ при старте бота.
    Записывает начальный баланс дня если не записан, или сбрасывает если новый UTC-день.
    """
    global _state
    _state = _load()
    today = _today()

    if _state.get("date") != today:
        _state = {
            "date": today,
            "start_balance": round(current_balance, 4),
            "stopped": False,
        }
        _save(_state)
        print(f"[daily_guard] 📅 Новый день ({today}). Start balance: ${current_balance:.2f}  Лимит: -{MAX_DAILY_LOSS_PCT}%")
    else:
        # Защита от устаревшего баланса (смена testnet→demo или ручное пополнение)
        # Если текущий баланс отличается от сохранённого более чем в 3 раза — сброс
        saved_start = _state.get("start_balance", 0)
        if saved_start > 0 and current_balance > 0:
            ratio = current_balance / saved_start
            if ratio < 0.33 or ratio > 3.0:
                _state = {
                    "date": today,
                    "start_balance": round(current_balance, 4),
                    "stopped": False,
                }
                _save(_state)
                print(f"[daily_guard] ⚠️ Баланс изменился кардинально (${saved_start:.2f} → ${current_balance:.2f}) — сброс стартового баланса")
                return
        status = "🛑 СТОП" if _state.get("stopped") else "✅ ОК"
        print(f"[daily_guard] Сегодня ({today}). Start: ${_state.get('start_balance', 0):.2f}  Статус: {status}")


def check(current_balance: float) -> bool:
    """
    Проверяет, разрешена ли торговля.

    Returns:
        True  — торговать можно
        False — дневной лимит убытков исчерпан, торговлю остановить
    """
    if current_balance <= 0:
        return True  # balance fetch failed — don't treat as loss

    global _state

    # Перечитываем файл — другой бот мог обновить (main ↔ alt)
    fresh = _load()
    today = _today()

    # Новый UTC-день → автоматический сброс
    if fresh.get("date") != today:
        _state = {
            "date": today,
            "start_balance": round(current_balance, 4),
            "stopped": False,
        }
        _save(_state)
        return True

    _state = fresh  # синхронизируем кэш

    # Уже остановлены сегодня
    if _state.get("stopped"):
        return False

    start = _state.get("start_balance", current_balance)
    if start <= 0:
        return True

    loss_pct = (start - current_balance) / start * 100
    if loss_pct >= MAX_DAILY_LOSS_PCT:
        _state["stopped"] = True
        _save(_state)
        print(
            f"[daily_guard] 🛑 ДНЕВНОЙ ЛИМИТ! Потеряно {loss_pct:.1f}% "
            f"(лимит {MAX_DAILY_LOSS_PCT}%). Торговля остановлена до UTC 00:00."
        )
        return False

    return True


def get_status(current_balance: float) -> dict:
    """Для команды /status в Telegram."""
    state = _load()
    today = _today()
    if state.get("date") != today:
        return {"date": today, "stopped": False, "loss_pct": 0.0, "start_balance": current_balance}
    start = state.get("start_balance", current_balance)
    loss_pct = (start - current_balance) / start * 100 if start > 0 else 0.0
    return {
        "date": today,
        "stopped": state.get("stopped", False),
        "loss_pct": round(loss_pct, 2),
        "start_balance": start,
    }
