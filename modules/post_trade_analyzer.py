"""
post_trade_analyzer.py — Анализ закрытых позиций и адаптация параметров.

Каждые 60 секунд проверяет открытые позиции.
Когда позиция закрывается (TP/SL/trailing), вычисляет приблизительный PnL,
диагностирует причину убытка, применяет временные параметры на уровне монеты,
отправляет отчёт в Telegram.

Публичный API:
  save_trade_context(symbol, context)  — вызывать из trader.py при открытии
  get_score_threshold_boost(coin)      — доп. порог скора из-за адаптации
  is_coin_paused(coin)                 — монета временно заблокирована
  start_analyzer(exchange_factory, send_tg, chat_id)
"""
import json
import os
import tempfile
import threading
import time
from datetime import datetime, timezone

_CONTEXT_FILE   = "trade_context.json"
_CHECK_INTERVAL = 60  # секунд между проверками

# {coin: {"score_boost": float, "paused": bool, "reason": str, "expires_at": float}}
_adaptations: dict = {}
_adapt_lock = threading.Lock()


# ─── Контекст сделки ─────────────────────────────────────────────────────────

def _load_context() -> dict:
    if os.path.exists(_CONTEXT_FILE):
        try:
            with open(_CONTEXT_FILE) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def _save_context(data: dict) -> None:
    try:
        dir_ = os.path.dirname(os.path.abspath(_CONTEXT_FILE)) or "."
        with tempfile.NamedTemporaryFile("w", dir=dir_, delete=False, suffix=".tmp") as tmp:
            json.dump(data, tmp, indent=2)
        os.replace(tmp.name, _CONTEXT_FILE)
    except Exception as e:
        print(f"[analyzer] Ошибка сохранения контекста: {e}")


def save_trade_context(symbol: str, context: dict) -> None:
    """Сохранить рыночный контекст при открытии позиции."""
    data = _load_context()
    data[symbol] = context
    _save_context(data)


def _remove_context(symbol: str) -> dict:
    """Убрать и вернуть контекст закрытой позиции."""
    data = _load_context()
    ctx = data.pop(symbol, {})
    _save_context(data)
    return ctx


# ─── Адаптивные параметры ────────────────────────────────────────────────────

def get_score_threshold_boost(coin: str) -> float:
    """Дополнительный порог к min_score для монеты (из-за прошлых потерь)."""
    now = time.time()
    with _adapt_lock:
        a = _adaptations.get(coin.upper())
        if a and now < a.get("expires_at", 0):
            return a.get("score_boost", 0.0)
    return 0.0


def is_coin_paused(coin: str) -> bool:
    """True если монета временно заблокирована после серии потерь."""
    now = time.time()
    with _adapt_lock:
        a = _adaptations.get(coin.upper())
        if a and now < a.get("expires_at", 0):
            return a.get("paused", False)
    return False


def _apply_adaptation(coin: str, score_boost: float, paused: bool, hours: float, reason: str) -> None:
    expires = time.time() + hours * 3600
    with _adapt_lock:
        _adaptations[coin.upper()] = {
            "score_boost": score_boost,
            "paused":      paused,
            "reason":      reason,
            "expires_at":  expires,
        }
    exp_str = datetime.fromtimestamp(expires, tz=timezone.utc).strftime("%H:%M UTC")
    print(f"[analyzer] ⚙️ {coin}: {reason} (до {exp_str})")


# ─── Диагностика ─────────────────────────────────────────────────────────────

def _diagnose(coin: str, action: str, ctx: dict, pnl_pct: float) -> list[tuple[str, str]]:
    """Возвращает список (reason_code, description) найденных причин."""
    reasons = []
    btc_2h      = ctx.get("btc_2h_pct", 0.0)
    rsi         = ctx.get("rsi", 50.0)
    funding     = ctx.get("funding_rate", 0.0)
    news_age    = ctx.get("news_age_min")
    score       = abs(ctx.get("signal_score", 0.0))
    losses_6h   = ctx.get("losses_6h", 0)

    if action == "LONG":
        if btc_2h < -2.0:
            reasons.append(("BTC_DUMP", f"BTC упал {btc_2h:.1f}% за 2ч до входа"))
        if rsi > 68:
            reasons.append(("RSI_HIGH", f"RSI был {rsi:.0f} (перекупленность при входе)"))
        if funding > 0.06:
            reasons.append(("FUNDING_HIGH", f"Funding rate {funding:.3f}% (рынок перегрет лонгами)"))
    elif action == "SHORT":
        if btc_2h > 2.0:
            reasons.append(("BTC_PUMP", f"BTC вырос {btc_2h:+.1f}% за 2ч до входа"))
        if rsi < 32:
            reasons.append(("RSI_LOW", f"RSI был {rsi:.0f} (перепроданность при входе)"))
        if funding < -0.06:
            reasons.append(("FUNDING_LOW", f"Funding rate {funding:.3f}% (рынок перегрет шортами)"))

    if news_age and news_age > 25:
        reasons.append(("OLD_NEWS", f"Новость была {news_age} мин (рынок уже отреагировал)"))

    if score < 9.5:
        reasons.append(("WEAK_SIGNAL", f"Скор был {score:.1f} (пограничный сигнал)"))

    if losses_6h >= 2:
        reasons.append(("STREAK", f"Убыточная серия: {losses_6h} потери за 6ч"))

    return reasons


def _handle_close(coin: str, action: str, ctx: dict, pnl_pct: float,
                  send_tg, chat_id: str) -> None:
    """Диагностика + адаптация + TG-отчёт при закрытии позиции."""
    is_loss = pnl_pct < 0

    # Считаем потери за последние 6 часов (простой счётчик в ctx)
    ctx["losses_6h"] = ctx.get("losses_6h", 0)

    if is_loss:
        reasons = _diagnose(coin, action, ctx, pnl_pct)

        # Применяем адаптацию по найденным причинам
        if reasons:
            reason_codes = [r[0] for r in reasons]

            if "STREAK" in reason_codes:
                _apply_adaptation(coin, score_boost=0, paused=True, hours=6,
                                   reason="Серия потерь: монета приостановлена на 6h")
            elif len(reasons) >= 2:
                _apply_adaptation(coin, score_boost=1.5, paused=False, hours=4,
                                   reason=f"2+ причин потери: порог +1.5 на 4h")
            elif "WEAK_SIGNAL" in reason_codes:
                _apply_adaptation(coin, score_boost=1.0, paused=False, hours=4,
                                   reason="Слабый сигнал: порог +1.0 на 4h")
            elif "OLD_NEWS" in reason_codes or "FUNDING_HIGH" in reason_codes or "FUNDING_LOW" in reason_codes:
                _apply_adaptation(coin, score_boost=0.5, paused=False, hours=3,
                                   reason="Рыночный контекст против: порог +0.5 на 3h")

        # TG отчёт (только при потере)
        reasons_text = "\n".join(f"  • {desc}" for _, desc in reasons) if reasons else "  • Причина не установлена"
        adaptation_line = ""
        with _adapt_lock:
            a = _adaptations.get(coin.upper())
            if a:
                if a.get("paused"):
                    adaptation_line = f"\n⛔ <b>Монета приостановлена</b> на 6h"
                else:
                    adaptation_line = f"\n⚙️ <b>Адаптация:</b> порог скора +{a['score_boost']:.1f} на ~{a['reason'].split('на ')[1] if 'на ' in a['reason'] else '?'}"

        msg = (
            f"🔬 <b>Post-trade анализ: {coin} {action}</b>\n"
            f"<b>PnL:</b> {pnl_pct:+.1f}% (убыток)\n"
            f"<b>Причины:</b>\n{reasons_text}"
            f"{adaptation_line}"
        )
        try:
            send_tg(msg, chat_id)
        except Exception:
            pass
    else:
        # Прибыльная сделка — очищаем адаптации если были
        with _adapt_lock:
            if coin.upper() in _adaptations:
                del _adaptations[coin.upper()]
                print(f"[analyzer] ✅ {coin}: прибыльная сделка — адаптации сняты")


# ─── Daemon-поток ─────────────────────────────────────────────────────────────

def _analyzer_loop(exchange_factory, send_tg, chat_id):
    """Каждые 60 сек проверяет закрылись ли отслеживаемые позиции."""
    from modules.position_monitor import _load_tracked, untrack

    print("[analyzer] 🔬 Post-trade analyzer запущен")
    # {symbol: {"losses_6h": int, "window_start": float}}
    _loss_counters: dict = {}

    while True:
        try:
            time.sleep(_CHECK_INTERVAL)
            tracked = _load_tracked()
            if not tracked:
                continue

            exchange = exchange_factory()

            for symbol, info in list(tracked.items()):
                try:
                    live = exchange.fetch_positions([symbol], params={"category": "linear"})
                    active = [p for p in live if abs(float(p.get("contracts") or 0)) > 0]
                    if active:
                        continue  # позиция ещё открыта

                    # Позиция закрылась
                    ctx = _remove_context(symbol)
                    coin   = info.get("coin", symbol.split("/")[0])
                    action = info.get("action", ctx.get("action", "?"))
                    entry  = float(info.get("entry") or ctx.get("entry_price") or 0)

                    # Приблизительный PnL через текущую цену
                    pnl_pct = 0.0
                    try:
                        ticker = exchange.fetch_ticker(symbol)
                        cur = ticker["last"]
                        if entry > 0 and cur > 0:
                            raw_pct = (cur - entry) / entry * 100
                            leverage = ctx.get("leverage", 2)
                            pnl_pct = raw_pct * leverage if action == "LONG" else -raw_pct * leverage
                    except Exception:
                        pass

                    # Обновляем счётчик потерь за 6 часов
                    now = time.time()
                    lc = _loss_counters.get(coin, {"count": 0, "window_start": now})
                    if now - lc["window_start"] > 6 * 3600:
                        lc = {"count": 0, "window_start": now}
                    if pnl_pct < 0:
                        lc["count"] += 1
                    _loss_counters[coin] = lc
                    ctx["losses_6h"] = lc["count"]

                    untrack(symbol)
                    _handle_close(coin, action, ctx, pnl_pct, send_tg, chat_id)
                    print(f"[analyzer] 📊 {coin} {action} закрыта: PnL ≈ {pnl_pct:+.1f}%")

                except Exception as e:
                    print(f"[analyzer] ⚠️ Ошибка проверки {symbol}: {e}")

        except Exception as e:
            print(f"[analyzer] ❌ Ошибка цикла: {e}")


def start_analyzer(exchange_factory, send_tg, chat_id) -> None:
    """Запустить daemon-поток анализатора. Вызвать один раз при старте."""
    t = threading.Thread(
        target=_analyzer_loop,
        args=(exchange_factory, send_tg, chat_id),
        daemon=True,
        name="post-trade-analyzer",
    )
    t.start()
