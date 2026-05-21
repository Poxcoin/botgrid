"""
fr_arb_bot.py — FR Multi-Exchange Arbitrage Bot.

Strategy: enter SHORT (or LONG) when at least 2 venues show extreme funding
in the same direction. Capture funding payment + mean-reversion of the
over-crowded side.

Status: SKELETON 2026-05-21 — wired into systemd but FR_ARB_TRADING flag
defaults to False. Bot scans + logs signals but does NOT execute trades.
After 24-48h of "shadow" data we'll have a sample of detected signals.
Then enable trading after backtest validates the threshold setup.

See `project_fr_arb.md` for full design.
"""
import time
import threading
from datetime import datetime, timezone

from modules.funding_arb import find_extremes, oi_bybit_5min_delta
from modules.trader import _init_exchange, get_free_usdt, get_wallet_usdt
from modules.tg_notifier import send_telegram_message
from modules import daily_guard, position_monitor
from grid_bot import _calc_hurst
from config.settings import TG_CHAT_ID, IS_DEMO_TRADING

# ── Trading flag (env override) ──────────────────────────────────────────────
import os
FR_ARB_TRADING = os.getenv("FR_ARB_TRADING", "False").lower() == "true"

# ── Symbols to monitor across venues ─────────────────────────────────────────
SYMBOLS = [
    "BTC/USDT:USDT",
    "ETH/USDT:USDT",
    "SOL/USDT:USDT",
    "XRP/USDT:USDT",
    "DOGE/USDT:USDT",
    "LINK/USDT:USDT",
    "AVAX/USDT:USDT",
    "ARB/USDT:USDT",
]

# ── Entry parameters ─────────────────────────────────────────────────────────
FR_THRESHOLD_PCT      = 0.18    # |FR| ≥ 0.18% on multiple venues = extreme
MIN_CROSS_VENUES      = 2       # at least N venues showing extreme same direction
OI_CONFIRM_DELTA_PCT  = 5.0     # Bybit OI must change ≥5% in same direction
HURST_FILTER          = 0.90    # skip parabolic moves (same as orderflow)

# ── Trade parameters ─────────────────────────────────────────────────────────
LEVERAGE  = 5
TP_PCT    = 1.5
SL_PCT    = 1.0
SIZE_PCT  = 20.0
MAX_POS   = 2
COOLDOWN  = 4 * 3600    # 4h per symbol (funding cycle is 8h)
SCAN_SLEEP = 60         # scan every minute — funding rates change slowly


# ── Signal detection ─────────────────────────────────────────────────────────

def _detect_signals() -> list[dict]:
    """Find symbols with multi-venue extreme funding + OI confirmation."""
    candidates = find_extremes(SYMBOLS, threshold_pct=FR_THRESHOLD_PCT,
                                min_cross_venues=MIN_CROSS_VENUES)
    confirmed = []
    for c in candidates:
        # OI confirmation: if SHORT signal (high positive FR = longs piling),
        # we want OI rising (real money entering) before fading.
        try:
            oi_delta = oi_bybit_5min_delta(c["symbol"]) or 0.0
        except Exception:
            oi_delta = 0.0
        if c["direction"] == "SHORT" and oi_delta < OI_CONFIRM_DELTA_PCT:
            continue  # longs crowding but OI not growing → fade weaker
        if c["direction"] == "LONG" and oi_delta > -OI_CONFIRM_DELTA_PCT:
            continue
        c["oi_delta_pct"] = round(oi_delta, 2)
        confirmed.append(c)
    return confirmed


def _build_tg(sig: dict) -> str:
    v = sig["venues"]
    return (
        f"<b>[FR-ARB] {sig['direction']} {sig['symbol']}</b>\n"
        f"max FR: <code>{sig['max_fr']:+.3f}%</code> on <b>{sig['max_venue']}</b>\n"
        f"min FR: <code>{sig['min_fr']:+.3f}%</code> "
        f"(both side &gt; {FR_THRESHOLD_PCT}%)\n"
        f"OI delta: <code>{sig.get('oi_delta_pct', 0):+.2f}%</code>\n"
        f"Venues: " + " · ".join(f"{vn}={fr:+.3f}%" for vn, fr in v.items() if fr is not None) + "\n"
        f"TP={TP_PCT}%  SL={SL_PCT}%  x{LEVERAGE}"
    )


# ── Main engine ──────────────────────────────────────────────────────────────

def run_fr_arb_engine() -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [FR-ARB] BOT STARTED")
    print(f"   Symbols: {', '.join(SYMBOLS)}")
    print(f"   FR threshold: {FR_THRESHOLD_PCT}% on ≥{MIN_CROSS_VENUES} venues")
    print(f"   TP={TP_PCT}%  SL={SL_PCT}%  x{LEVERAGE}  Size={SIZE_PCT}%")
    print(f"   Trading={'ON' if FR_ARB_TRADING else 'SHADOW (signal-only)'}  "
          f"{'[DEMO]' if IS_DEMO_TRADING else '[LIVE]'}\n")

    try:
        ex_init = _init_exchange()
        start_bal = get_wallet_usdt(ex_init)
    except Exception:
        start_bal = 0.0
    daily_guard.init(current_balance=start_bal)

    send_telegram_message(
        f"<b>[FR-ARB] Bot started</b>\n"
        f"Threshold {FR_THRESHOLD_PCT}% × ≥{MIN_CROSS_VENUES} venues | "
        f"{'TRADING' if FR_ARB_TRADING else 'SHADOW (log signals only)'}",
        TG_CHAT_ID,
    )

    _cooldowns: dict[str, float] = {}

    while True:
        try:
            now = time.time()

            # Single-symbol scan
            signals = _detect_signals()

            if not signals:
                # log heartbeat
                if int(now) % 600 < SCAN_SLEEP:
                    print(f"[FR-ARB] no extremes — scanning {len(SYMBOLS)} symbols")
                time.sleep(SCAN_SLEEP)
                continue

            for sig in signals:
                sym = sig["symbol"]

                cooldown_left = COOLDOWN - (now - _cooldowns.get(sym, 0))
                if cooldown_left > 0:
                    print(f"[FR-ARB] {sym} cooldown {int(cooldown_left/60)}min")
                    continue

                # Hurst filter — skip parabolic moves (same as orderflow)
                try:
                    market_ex = _init_exchange()
                    ohlcv = market_ex.fetch_ohlcv(sym, "4h", limit=80, params={"category": "linear"})
                    closes = [c[4] for c in ohlcv]
                    h = _calc_hurst(closes[-60:]) if len(closes) >= 30 else 0.5
                    if h > HURST_FILTER:
                        print(f"[FR-ARB] {sym} Hurst={h:.2f} > {HURST_FILTER} — skip")
                        continue
                except Exception:
                    pass

                _cooldowns[sym] = now

                tg_body = _build_tg(sig)
                print(f"\n[FR-ARB] {'='*44}")
                print(f"[FR-ARB] SIGNAL  {sig['direction']}  {sym}")
                print(f"[FR-ARB] max FR={sig['max_fr']:+.3f}%  OI delta={sig.get('oi_delta_pct',0):+.2f}%")
                print(f"[FR-ARB] best venue: {sig['max_venue']}")
                print(f"[FR-ARB] {'='*44}\n")
                send_telegram_message(tg_body, TG_CHAT_ID)

                if not FR_ARB_TRADING:
                    print("[FR-ARB] SHADOW mode — no order placed")
                    continue

                # Real execution path — TODO once we have multi-venue position keeper
                # For now in shadow mode this is unreachable.
                # When ready: dispatch to saas_dispatcher with venue=sig['max_venue']
                try:
                    from modules.saas_dispatcher import dispatch as _saas_dispatch
                    _saas_dispatch({
                        "source":   "fr_arb",
                        "symbol":   sym,
                        "side":     sig["direction"],
                        "leverage": LEVERAGE,
                        "tp_pct":   TP_PCT,
                        "sl_pct":   SL_PCT,
                        "size_pct": SIZE_PCT,
                    })
                except Exception as e:
                    print(f"[FR-ARB] dispatch error: {e}")

            time.sleep(SCAN_SLEEP)

        except KeyboardInterrupt:
            print("\n[FR-ARB] Stopped by user")
            break
        except Exception as e:
            print(f"[FR-ARB] loop error: {type(e).__name__}: {e}")
            time.sleep(30)


if __name__ == "__main__":
    run_fr_arb_engine()
