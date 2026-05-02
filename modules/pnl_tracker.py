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
MATCH_WINDOW_MS = 5 * 60 * 1000   # 5 минут — окно для сопоставления JSON-журнала
GHOST_THRESHOLD_HOURS = 24         # позиции старше 24h без Bybit-записи = ghost


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

            # Mutable pool — each Bybit close entry matches at most one signal
            available = list(closed)

            for idx, sig in items:
                sig_ms = _sig_ts_ms(sig)
                if sig_ms == 0:
                    continue

                for i, entry in enumerate(available):
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
                    available.pop(i)  # consume — prevent duplicate matching
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

        now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

        # Sort trades oldest-first; each Bybit entry consumed at most once
        trades.sort(key=lambda t: t["timestamp_open"] or "")
        available = list(closed)

        for trade in trades:
            try:
                trade_open_ms = int(datetime.fromisoformat(
                    (trade["timestamp_open"] or "").replace("Z", "+00:00")
                ).timestamp() * 1000)
            except Exception:
                continue

            # Find first unconsumed Bybit close event that happened AFTER trade opened
            matched = None
            matched_idx = -1
            for i, entry in enumerate(available):
                entry_ms = int(entry.get("createdTime") or 0)
                if entry_ms >= trade_open_ms:
                    matched = entry
                    matched_idx = i
                    break

            if matched and matched_idx >= 0:
                available.pop(matched_idx)  # consume — prevent duplicate matching
                pnl = float(matched.get("closedPnl") or 0)
                exit_price = float(matched.get("avgExitPrice") or 0)
                entry_price = trade["entry_price"] or float(matched.get("avgEntryPrice") or 1)
                pnl_pct = round((exit_price / entry_price - 1) * 100, 2) if entry_price else 0
                if trade.get("action") == "SHORT":
                    pnl_pct = -pnl_pct
                close_ms = int(matched.get("updatedTime") or int(matched.get("createdTime") or now_ms))
                duration = max(0, round((close_ms - trade_open_ms) / 60000))

                try:
                    close_trade(trade["id"], exit_price, pnl, pnl_pct, duration)
                    print(f"[pnl_tracker] DB закрита угода #{trade['id']} {coin} pnl={pnl:+.2f} USDT")
                    updated += 1
                except Exception as e:
                    print(f"[pnl_tracker] close_trade error: {e}")

            else:
                # No Bybit close record — mark as ghost if older than threshold
                age_hours = (now_ms - trade_open_ms) / 3_600_000
                if age_hours > GHOST_THRESHOLD_HOURS:
                    try:
                        close_trade(trade["id"], trade["entry_price"] or 0, 0.0, 0.0, round(age_hours * 60))
                        print(f"[pnl_tracker] Ghost #{trade['id']} {coin} ({age_hours:.0f}h) — закрито з pnl=0")
                        updated += 1
                    except Exception as e:
                        print(f"[pnl_tracker] ghost close error: {e}")

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
