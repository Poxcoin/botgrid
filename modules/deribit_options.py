"""
deribit_options.py — Deribit options flow monitor.

Безкоштовний публічний API Deribit, без ключа.

Що відстежуємо:
  - Put/Call ratio по об'єму (24h): >1.3 = ведмежий; <0.7 = бичачий
  - Великі угоди (notional >$500K): call = bullish flow, put = bearish flow
  - Options expiry наближення (скоро)

Сигнали в черзі:
  {"coin": "BTC", "action": "LONG", "confidence": 75, "source": "Deribit Options Flow",
   "title": "Unusual BTC call buying $2.1M", "total_score": 8.5, "is_options_flow": True}

Використання:
    from modules.deribit_options import start_deribit_monitor, options_queue, get_options_sentiment
    start_deribit_monitor()
    # main loop reads from options_queue
    sentiment, conf, reason = get_options_sentiment("BTC")  # ("bullish"|"bearish"|"neutral", 0-100, reason)
"""
import time
import queue
import threading
import requests
from datetime import datetime, timezone

_BASE = "https://www.deribit.com/api/v2/public"
_LARGE_TRADE_USD = 500_000   # поріг "великої угоди"
_POLL_SEC        = 900        # 15 хвилин
_LOCK = threading.Lock()

options_queue: queue.Queue = queue.Queue()

_sentiment_cache: dict[str, dict] = {}   # "BTC"|"ETH" → {pc_ratio, signal, ts}
_seen_trade_ids: set = set()


def _get_book_summary(currency: str) -> list[dict]:
    try:
        r = requests.get(
            f"{_BASE}/get_book_summary_by_currency",
            params={"currency": currency, "kind": "option"},
            timeout=12,
        )
        return r.json().get("result", [])
    except Exception:
        return []


def _get_last_trades(currency: str, count: int = 50) -> list[dict]:
    try:
        r = requests.get(
            f"{_BASE}/get_last_trades_by_currency",
            params={"currency": currency, "kind": "option", "count": count},
            timeout=12,
        )
        return r.json().get("result", {}).get("trades", [])
    except Exception:
        return []


def _calc_pc_ratio(summaries: list[dict]) -> tuple[float, float, float]:
    """Returns (pc_volume_ratio, put_vol, call_vol)."""
    put_vol = call_vol = 0.0
    for s in summaries:
        name = s.get("instrument_name", "")
        vol  = float(s.get("volume", 0) or 0)
        if name.endswith("-P"):
            put_vol += vol
        elif name.endswith("-C"):
            call_vol += vol
    if call_vol == 0:
        return 1.0, put_vol, call_vol
    return round(put_vol / call_vol, 3), put_vol, call_vol


def _process_large_trades(currency: str, trades: list[dict]) -> None:
    coin = currency.upper()
    for t in trades:
        trade_id = t.get("trade_id", "")
        if trade_id in _seen_trade_ids:
            continue
        _seen_trade_ids.add(trade_id)
        if len(_seen_trade_ids) > 5000:
            _seen_trade_ids.clear()

        amount     = float(t.get("amount", 0) or 0)
        mark_price = float(t.get("mark_price", 0) or 0)
        index_price = float(t.get("index_price", 1) or 1)
        notional   = amount * index_price
        if notional < _LARGE_TRADE_USD:
            continue

        instrument = t.get("instrument_name", "")
        is_call = instrument.endswith("-C")
        direction = "LONG" if is_call else "SHORT"
        side_str  = "call" if is_call else "put"
        notional_m = notional / 1_000_000

        score = 8.0 if notional > 2_000_000 else 7.0
        confidence = 72 if notional > 2_000_000 else 65

        signal = {
            "coin":             coin,
            "action":           direction,
            "total_score":      score,
            "confidence":       confidence,
            "source":           "Deribit Options Flow",
            "title":            f"Large {coin} {side_str} buy ${notional_m:.1f}M on Deribit",
            "news_title":       f"Large {coin} {side_str} buy ${notional_m:.1f}M on Deribit",
            "link":             f"deribit://options/{instrument}",
            "is_options_flow":  True,
            "timestamp":        datetime.now(timezone.utc).isoformat(),
        }
        options_queue.put(signal)
        print(f"[Deribit]  Large {side_str} ${notional_m:.1f}M on {coin} → {direction}")


def _update_sentiment(currency: str, pc_ratio: float, put_vol: float, call_vol: float) -> None:
    coin = currency.upper()
    if pc_ratio < 0.7:
        signal   = "bullish"
        reason   = f"P/C ratio {pc_ratio:.2f} (calls домінують, бичачий flow)"
    elif pc_ratio > 1.3:
        signal   = "bearish"
        reason   = f"P/C ratio {pc_ratio:.2f} (puts домінують, ведмежий hedge)"
    else:
        signal   = "neutral"
        reason   = f"P/C ratio {pc_ratio:.2f} (збалансований)"

    with _LOCK:
        _sentiment_cache[coin] = {
            "pc_ratio":  pc_ratio,
            "put_vol":   put_vol,
            "call_vol":  call_vol,
            "signal":    signal,
            "reason":    reason,
            "ts":        time.time(),
        }
    print(f"[Deribit] {coin}: {reason}")


def _poll_loop():
    while True:
        for currency in ("BTC", "ETH"):
            try:
                summaries = _get_book_summary(currency)
                if summaries:
                    pc_ratio, put_vol, call_vol = _calc_pc_ratio(summaries)
                    _update_sentiment(currency, pc_ratio, put_vol, call_vol)

                trades = _get_last_trades(currency, count=100)
                if trades:
                    _process_large_trades(currency, trades)

            except Exception as e:
                print(f"[Deribit] {currency} error: {e}")
            time.sleep(2)
        time.sleep(_POLL_SEC)


def start_deribit_monitor():
    t = threading.Thread(target=_poll_loop, name="deribit-options", daemon=True)
    t.start()
    print("[Deribit] Options flow monitor запущено (15хв оновлення)")


def get_options_sentiment(coin: str) -> tuple[str, int, str]:
    """Returns (signal, confidence_pct, reason). signal = 'bullish'|'bearish'|'neutral'."""
    with _LOCK:
        s = _sentiment_cache.get(coin.upper(), {})
    if not s or time.time() - s.get("ts", 0) > 3600:
        return "neutral", 0, ""
    signal = s.get("signal", "neutral")
    conf   = 70 if signal != "neutral" else 0
    return signal, conf, s.get("reason", "")
