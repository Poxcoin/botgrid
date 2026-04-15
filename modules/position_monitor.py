"""
position_monitor.py — Фоновый мониторинг открытых позиций.

Запускается как daemon-thread при старте бота.
Каждые CHECK_INTERVAL_SEC проверяет позиции старше MAX_AGE_HOURS и
принудительно закрывает их рыночным ордером (reduceOnly=True).

Зачем:
  TP/SL на бирже обычно срабатывают надёжно, но при сетевых сбоях,
  проблемах с биржей или неправильных параметрах — позиция может
  зависнуть. Лучше закрыть по рынку через 4 часа, чем держать вечно.

Использование:
    from modules.position_monitor import start_monitor, track_open, untrack

    # Когда бот открыл сделку — сохраняем:
    track_open(symbol="BTC/USDT:USDT", action="LONG", entry_price=65000.0)

    # Запускаем поток (один раз при старте):
    start_monitor(exchange_factory=_init_exchange, send_tg=send_telegram_message, chat_id=TG_CHAT_ID)
"""
import json
import os
import tempfile
import threading
import time
from datetime import datetime, timezone, timedelta
from typing import Callable

MAX_AGE_HOURS       = 4     # Позиция старше 4h → принудительно закрываем
CHECK_INTERVAL_SEC  = 300   # Проверяем каждые 5 минут
TRACK_FILE          = "open_positions.json"


# ─── Файловый трекер открытых позиций ────────────────────────────────────────

def _load_tracked() -> dict:
    if os.path.exists(TRACK_FILE):
        try:
            with open(TRACK_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_tracked(data: dict) -> None:
    try:
        dir_ = os.path.dirname(os.path.abspath(TRACK_FILE)) or "."
        with tempfile.NamedTemporaryFile("w", dir=dir_, delete=False, suffix=".tmp") as tmp:
            json.dump(data, tmp, indent=2)
            tmp_path = tmp.name
        os.replace(tmp_path, TRACK_FILE)
    except Exception as e:
        print(f"[monitor] Ошибка записи трекера: {e}")


def track_open(symbol: str, action: str, entry_price: float) -> None:
    """Записать позицию при открытии. Вызывается из trader.py."""
    data = _load_tracked()
    data[symbol] = {
        "opened_at": datetime.now(timezone.utc).isoformat(),
        "action":    action,
        "entry":     entry_price,
    }
    _save_tracked(data)


def untrack(symbol: str) -> None:
    """Убрать позицию из трекера (TP/SL сработали или ручное закрытие)."""
    data = _load_tracked()
    data.pop(symbol, None)
    _save_tracked(data)


def get_tracked_count() -> int:
    """Количество позиций в трекере (для лимита параллельных позиций)."""
    return len(_load_tracked())


# ─── Фоновый поток ───────────────────────────────────────────────────────────

def _monitor_loop(
    exchange_factory: Callable,
    send_tg: Callable,
    chat_id: str,
) -> None:
    print(f"[monitor] 🔍 Position monitor запущен (MAX_AGE={MAX_AGE_HOURS}h, интервал={CHECK_INTERVAL_SEC}s)")

    while True:
        try:
            time.sleep(CHECK_INTERVAL_SEC)

            tracked = _load_tracked()
            if not tracked:
                continue

            now   = datetime.now(timezone.utc)
            stale = {
                sym: info for sym, info in tracked.items()
                if (now - datetime.fromisoformat(info["opened_at"])) > timedelta(hours=MAX_AGE_HOURS)
            }

            if not stale:
                continue

            print(f"[monitor] ⚠️ Найдено {len(stale)} зависших позиций — пытаюсь закрыть")
            exchange = exchange_factory()

            for symbol, info in stale.items():
                age_h = (now - datetime.fromisoformat(info["opened_at"])).total_seconds() / 3600
                try:
                    live = exchange.fetch_positions([symbol], params={"category": "linear"})
                    active = [p for p in live if abs(float(p.get("contracts") or 0)) > 0]

                    if not active:
                        # TP/SL уже сработали — просто убираем из трекера
                        untrack(symbol)
                        print(f"[monitor] ✅ {symbol} — позиция уже закрыта (TP/SL), убираем из трекера")
                        continue

                    pos      = active[0]
                    contracts = abs(float(pos["contracts"]))
                    side     = "sell" if pos["side"] == "long" else "buy"

                    exchange.create_order(
                        symbol, "market", side, contracts,
                        params={"category": "linear", "reduceOnly": True},
                    )
                    untrack(symbol)
                    print(f"[monitor] 🔴 {symbol} принудительно закрыта ({age_h:.1f}ч)")
                    send_tg(
                        f"⏱ <b>Позиция закрыта по таймауту</b>\n"
                        f"<b>Монета:</b> <code>{symbol}</code>\n"
                        f"<b>Направление:</b> {info.get('action', '?')}\n"
                        f"<b>Вход:</b> {info.get('entry', '?')}$\n"
                        f"<b>Открыта:</b> {info['opened_at'][:16]} UTC\n"
                        f"<b>Возраст:</b> {age_h:.1f}ч (лимит {MAX_AGE_HOURS}ч)",
                        chat_id,
                    )

                except Exception as e:
                    print(f"[monitor] ❌ Ошибка закрытия {symbol}: {e}")

        except Exception as e:
            print(f"[monitor] ❌ Ошибка цикла: {e}")


def start_monitor(
    exchange_factory: Callable,
    send_tg: Callable,
    chat_id: str,
) -> threading.Thread:
    """
    Запускает daemon-поток мониторинга позиций.
    Вызвать ОДИН РАЗ при старте бота.
    """
    t = threading.Thread(
        target=_monitor_loop,
        args=(exchange_factory, send_tg, chat_id),
        daemon=True,
        name="position-monitor",
    )
    t.start()
    return t
