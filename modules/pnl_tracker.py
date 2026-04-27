"""
pnl_tracker.py — Background thread.

Каждые 5 минут забирает закрытые позиции с Bybit и дописывает
в signals_log.json реальный PnL по каждой сделке:
  result    — WIN / LOSS / BE
  pnl_usdt  — прибыль/убыток в USDT
  avg_entry — средняя цена входа
  avg_exit  — средняя цена выхода
  closed_at — время закрытия (ms timestamp)
"""

import time
import json
import threading
import sqlite3
from datetime import datetime, timezone
from modules.analytics_db import close_trade, DB_PATH

LEDGER_FILES = ["signals_log.json", "signals_log_alt.json"]
MATCH_WINDOW_MS = 5 * 60 * 1000   # 5 минут — окно для сопоставления


def _load(path: str) -> list:
    try:
        with open(path) as f:
            return json.load(f)
    except Exception:
        return []


def _save(path: str, data: list) -> None:
    try:
        with open(path, "w") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    except Exception as e:
        print(f"[pnl_tracker] save error {path}: {e}")


def _sig_ts_ms(sig: dict) -> int:
    """Конвертируем timestamp сигнала в миллисекунды."""
    try:
        ts = sig["timestamp"]
        # Поддержка форматов: с Z, с +00:00, без суффикса
        ts = ts.replace("Z", "+00:00")
        if "+" not in ts and ts.count("-") <= 2:
            ts += "+00:00"
        dt = datetime.fromisoformat(ts)
        return int(dt.timestamp() * 1000)
    except Exception:
        return 0


def _fetch_closed_pnl(exchange, symbol: str, since_ms: int) -> list:
    """Запрашивает закрытые позиции для символа начиная с since_ms."""
    try:
        resp = exchange.private_get_v5_position_closed_pnl({
            "category":  "linear",
            "symbol":    symbol,
            "limit":     100,
            "startTime": since_ms,
        })
        return resp.get("result", {}).get("list", [])
    except Exception as e:
        print(f"[pnl_tracker] fetch {symbol}: {e}")
        return []


def update_pnl(exchange) -> int:
    """
    Обновляет оба журнала сигналов PnL данными с Bybit.
    Возвращает количество обновлённых записей.
    """
    total_updated = 0

    for path in LEDGER_FILES:
        signals = _load(path)
        if not signals:
            continue

        # Только исполненные сделки без результата
        untracked = [
            (i, s) for i, s in enumerate(signals)
            if s.get("action") in ("LONG", "SHORT") and "result" not in s
        ]
        if not untracked:
            continue

        # Группируем по монете
        by_coin: dict[str, list] = {}
        for idx, sig in untracked:
            coin = sig.get("coin", "")
            by_coin.setdefault(coin, []).append((idx, sig))

        changed = False
        for coin, items in by_coin.items():
            symbol = f"{coin}USDT"
            oldest_ms = min(_sig_ts_ms(s) for _, s in items)
            if oldest_ms == 0:
                continue

            closed = _fetch_closed_pnl(exchange, symbol, oldest_ms)
            if not closed:
                continue

            for idx, sig in items:
                sig_ms = _sig_ts_ms(sig)
                if sig_ms == 0:
                    continue

                for entry in closed:
                    entry_ms = int(entry.get("createdTime") or 0)
                    if abs(entry_ms - sig_ms) > MATCH_WINDOW_MS:
                        continue

                    pnl = float(entry.get("closedPnl") or 0)
                    signals[idx].update({
                        "result":     "WIN" if pnl > 0 else ("LOSS" if pnl < 0 else "BE"),
                        "pnl_usdt":  round(pnl, 4),
                        "avg_entry": float(entry.get("avgEntryPrice") or 0),
                        "avg_exit":  float(entry.get("avgExitPrice")  or 0),
                        "closed_at": entry.get("updatedTime", ""),
                    })
                    changed = True
                    total_updated += 1
                    break

        if changed:
            _save(path, signals)
            print(f"[pnl_tracker] {path} — обновлено записей: {total_updated}")

    return total_updated


def update_pnl_db(exchange) -> int:
    """Закриває OPEN угоди в analytics.db даними з Bybit."""
    try:
        con = sqlite3.connect(DB_PATH)
        con.row_factory = sqlite3.Row
        open_trades = con.execute(
            "SELECT id, coin, action, entry_price, timestamp_open FROM trades WHERE result='OPEN'"
        ).fetchall()
    except Exception as e:
        print(f"[pnl_tracker] db read error: {e}")
        return 0

    if not open_trades:
        con.close()
        return 0

    # Групуємо по монеті
    by_coin: dict[str, list] = {}
    for row in open_trades:
        by_coin.setdefault(row["coin"], []).append(dict(row))

    updated = 0
    for coin, trades in by_coin.items():
        symbol = f"{coin}USDT"
        oldest_ts = min(t["timestamp_open"] or "" for t in trades)
        try:
            oldest_ms = int(datetime.fromisoformat(
                oldest_ts.replace("Z", "+00:00")
            ).timestamp() * 1000)
        except Exception:
            continue

        closed = _fetch_closed_pnl(exchange, symbol, oldest_ms)
        if not closed:
            continue

        for trade in trades:
            try:
                trade_open_ms = int(datetime.fromisoformat(
                    (trade["timestamp_open"] or "").replace("Z", "+00:00")
                ).timestamp() * 1000)
            except Exception:
                continue

            for entry in closed:
                entry_ms = int(entry.get("createdTime") or 0)
                if abs(entry_ms - trade_open_ms) > MATCH_WINDOW_MS:
                    continue

                pnl = float(entry.get("closedPnl") or 0)
                exit_price = float(entry.get("avgExitPrice") or 0)
                entry_price = trade["entry_price"] or float(entry.get("avgEntryPrice") or 1)
                pnl_pct = round((exit_price - entry_price) / entry_price * 100, 2) if entry_price else 0
                close_ms = int(entry.get("updatedTime") or entry_ms)
                duration = round((close_ms - trade_open_ms) / 60000)

                try:
                    close_trade(trade["id"], exit_price, pnl, pnl_pct, duration)
                    print(f"[pnl_tracker] DB закрита угода #{trade['id']} {coin} pnl={pnl:.2f} USDT")
                    updated += 1
                except Exception as e:
                    print(f"[pnl_tracker] close_trade error: {e}")
                break

    con.close()
    return updated


def start_pnl_tracker(exchange_factory, interval_sec: int = 300) -> threading.Thread:
    """
    Запускает PnL tracker как daemon-поток.
    exchange_factory — функция без аргументов, возвращающая инициализированный exchange.
    """
    def _run():
        print("[pnl_tracker] Запущен (интервал 5 мин)")
        while True:
            try:
                ex = exchange_factory()
                n = update_pnl(ex)
                m = update_pnl_db(ex)
                if n or m:
                    print(f"[pnl_tracker] JSON={n} DB={m} угод закрито")
            except Exception as e:
                print(f"[pnl_tracker] Ошибка: {e}")
            time.sleep(interval_sec)

    t = threading.Thread(target=_run, name="pnl-tracker", daemon=True)
    t.start()
    return t
