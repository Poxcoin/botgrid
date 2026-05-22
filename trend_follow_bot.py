"""
trend_follow_bot.py — EMA cross trend-follow on 4h candles.

Strategy (backtest 2026-05-22):
  Signal: EMA9 crosses EMA50
  Direction: cross-up → LONG; cross-down → SHORT
  SL: 2 × ATR(14) from entry
  TP: 3 × ATR(14) from entry  (R:R 1.5:1)
  Max hold: 30 candles (5 days at 4h)
  Symbols: BTC, ETH, SOL
  Backtest 90d: WR 58.5% n=82 PF 1.74
  Backtest 30d: WR 75% n=12 (small)

Service: crypto-trend.service
Env flag: TREND_TRADING (default False → paper-only mode)
"""
import os
import sys
import time
from datetime import datetime, timezone

import ccxt

sys.path.insert(0, '/opt/botgrid')
os.chdir('/opt/botgrid')

from dotenv import load_dotenv
load_dotenv('/opt/botgrid/.env')

from modules.tg_notifier import send_telegram_message
from config.settings import TG_CHAT_ID

# ─── Config ──────────────────────────────────────────────────────────────────

SYMBOLS = ["BTC/USDT:USDT", "ETH/USDT:USDT", "SOL/USDT:USDT"]
TF = "4h"
CANDLES = 200  # enough for EMA50 + warmup

FAST_PERIOD = 9
SLOW_PERIOD = 50
ATR_PERIOD  = 14
ATR_K_SL    = 2.0
ATR_K_TP    = 3.0
MAX_HOLD_BARS = 30   # 5 days @ 4h

LEVERAGE   = 3
SIZE_PCT   = 20.0
SCAN_SLEEP = 15 * 60   # 15 min
COOLDOWN   = 8 * 3600  # 8h per symbol after entry

TREND_TRADING = os.getenv("TREND_TRADING", "False").lower() == "true"

_cooldowns: dict[str, float] = {}
_open_symbols: set[str] = set()


def _make_ex() -> ccxt.bybit:
    ex = ccxt.bybit({"enableRateLimit": True})
    ex.has["fetchCurrencies"] = False
    return ex


def _ema(values, period):
    if len(values) < period:
        return [values[-1]] * len(values)
    k = 2 / (period + 1)
    out = [sum(values[:period]) / period]
    for v in values[period:]:
        out.append(v * k + out[-1] * (1 - k))
    return [out[0]] * (len(values) - len(out)) + out


def _atr(highs, lows, closes, i, period=14):
    if i < period:
        return (highs[i] - lows[i]) if i < len(highs) else 0.0
    trs = []
    for j in range(i - period + 1, i + 1):
        if j == 0:
            tr = highs[j] - lows[j]
        else:
            tr = max(highs[j] - lows[j],
                     abs(highs[j] - closes[j - 1]),
                     abs(lows[j]  - closes[j - 1]))
        trs.append(tr)
    return sum(trs) / period


def _detect_cross(closes) -> str | None:
    """Returns 'LONG'/'SHORT'/None based on EMA9/50 last-bar cross."""
    if len(closes) < SLOW_PERIOD + 2:
        return None
    fast = _ema(closes, FAST_PERIOD)
    slow = _ema(closes, SLOW_PERIOD)
    if fast[-2] <= slow[-2] and fast[-1] > slow[-1]:
        return "LONG"
    if fast[-2] >= slow[-2] and fast[-1] < slow[-1]:
        return "SHORT"
    return None


def run_trend_engine():
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [TREND] BOT START")
    print(f"  Symbols: {', '.join(SYMBOLS)}")
    print(f"  EMA {FAST_PERIOD}/{SLOW_PERIOD}, ATR×{ATR_K_SL} SL / ATR×{ATR_K_TP} TP, "
          f"x{LEVERAGE}, Size={SIZE_PCT}%")
    print(f"  Trading={'ON' if TREND_TRADING else 'OFF (paper only)'}\n")

    ex = _make_ex()

    while True:
        now = time.time()
        try:
            for symbol in SYMBOLS:
                cd = _cooldowns.get(symbol, 0)
                if now < cd:
                    continue
                if symbol in _open_symbols:
                    continue

                try:
                    bars = ex.fetch_ohlcv(symbol, TF, limit=CANDLES,
                                          params={"category": "linear"})
                except Exception as e:
                    print(f"[TREND]  OHLCV fail {symbol}: {e}")
                    continue
                if len(bars) < SLOW_PERIOD + 5:
                    continue

                opens  = [b[1] for b in bars]
                highs  = [b[2] for b in bars]
                lows   = [b[3] for b in bars]
                closes = [b[4] for b in bars]

                direction = _detect_cross(closes)
                if direction is None:
                    continue

                price = closes[-1]
                atr = _atr(highs, lows, closes, len(closes) - 1, ATR_PERIOD)
                if atr <= 0:
                    continue

                sl_dist = ATR_K_SL * atr
                tp_dist = ATR_K_TP * atr
                sl_pct = sl_dist / price * 100
                tp_pct = tp_dist / price * 100

                if direction == "LONG":
                    sl_price = price - sl_dist
                    tp_price = price + tp_dist
                else:
                    sl_price = price + sl_dist
                    tp_price = price - tp_dist

                print(f"\n[TREND] {'=' * 44}")
                print(f"[TREND] SIGNAL {direction} {symbol}  price={price:.4f}")
                print(f"[TREND]   ATR={atr:.4f}  SL_pct={sl_pct:.2f}%  TP_pct={tp_pct:.2f}%")

                tg_body = (
                    f"<b>[TREND] {direction} {symbol}</b>\n"
                    f"Entry: <code>{price:.4f}</code>\n"
                    f"ATR: <code>{atr:.4f}</code> ({atr/price*100:.2f}%)\n"
                    f"SL: <code>{sl_pct:.2f}%</code>  TP: <code>{tp_pct:.2f}%</code>  "
                    f"x{LEVERAGE}\n"
                    f"EMA{FAST_PERIOD}/{SLOW_PERIOD} cross"
                )

                _cooldowns[symbol] = now + COOLDOWN

                # Paper-trade hook always (per Council 2026-05-22)
                try:
                    from modules.paper_trader import paper_open
                    paper_open("trend", symbol, direction, LEVERAGE, price,
                               sl_pct=sl_pct, tp_pct=tp_pct, variant="normal")
                except Exception as _pe:
                    print(f"[TREND] paper_open err: {_pe}")

                if TREND_TRADING:
                    try:
                        from modules.saas_dispatcher import dispatch as _saas_dispatch
                        _saas_dispatch({
                            "source":   "trend",
                            "symbol":   symbol,
                            "side":     direction,
                            "leverage": LEVERAGE,
                            "tp_pct":   tp_pct,
                            "sl_pct":   sl_pct,
                            "size_pct": SIZE_PCT,
                        })
                        _open_symbols.add(symbol)
                        send_telegram_message(tg_body, TG_CHAT_ID)
                    except Exception as e:
                        print(f"[TREND]  dispatch err {symbol}: {e}")
                else:
                    print(f"[TREND] DRY-RUN paper only")
                    send_telegram_message(f"[TREND] DRY-RUN\n{tg_body}", TG_CHAT_ID)

            time.sleep(SCAN_SLEEP)

        except KeyboardInterrupt:
            print("\n[TREND] stopped")
            break
        except Exception as e:
            print(f"[TREND]  loop err: {e}")
            time.sleep(60)


if __name__ == "__main__":
    run_trend_engine()
