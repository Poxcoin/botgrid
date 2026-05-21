"""
orderflow_bot.py — Orderflow Bot (BTC / ETH / SOL / XRP / LINK / INJ / ARB).

Three signal types:
  1. OF Classic:    price deviation from 8h VWAP + OI growth + CVD bias
  2. AVWAP Bounce:  price tests Anchored VWAP level (swing-anchored) + CVD confirms
  3. CVD Divergence: price new high/low not confirmed by CVD → reversal

TP = 2.0%  SL = 1.0%  Leverage = 3x  Size = 3% balance
Cooldown: 2h  |  Scan: 3 min  |  Max concurrent: 2
"""
import time
import threading
from datetime import datetime

from modules.orderflow_engine import get_orderflow_context
from modules.trader import execute_trade, get_free_usdt, get_wallet_usdt, _init_exchange
from modules.tg_notifier import send_telegram_message
from modules import daily_guard, position_monitor
from modules.cvd_realtime import (
    start_realtime_cvd,
    get_real_cvd_divergence,
    is_ready as cvd_is_ready,
    log_shadow as cvd_log_shadow,
)
from grid_bot import _calc_hurst
from config.settings import TG_CHAT_ID, IS_DEMO_TRADING, ORDERFLOW_TRADING

import ccxt as _ccxt_oh
_oh_pub = None
def _get_oh_pub():
    global _oh_pub
    if _oh_pub is None:
        _oh_pub = _ccxt_oh.bybit({"options":{"defaultType":"swap"},"enableRateLimit":True,"timeout":12000})
        _oh_pub.has["fetchCurrencies"] = False
    return _oh_pub

_HURST_FILTER = 0.90  # 0.58→0.90 (2026-05-21): backtest sweep on 90d ETH/BTC/SOL showed
                      # 0.58 blocks 100% of signals (Hurst on 60×4h is consistently 0.8-0.95).
                      # 0.90 filters only parabolic moves. Yields 10 trades / 60% WR / +1.95%/mo
                      # vs no-filter baseline 26 trades / 50% WR / +1.21%/mo.

def _hurst_for(symbol: str) -> float:
    """Fetch 4h closes, compute Hurst. Returns 0.5 (neutral) on error."""
    try:
        ohlcv = _get_oh_pub().fetch_ohlcv(symbol, "4h", limit=80, params={"category":"linear"})
        closes = [c[4] for c in ohlcv]
        return _calc_hurst(closes[-60:])
    except Exception:
        return 0.5

SYMBOLS = [
    "BTC/USDT:USDT",
    "ETH/USDT:USDT",
    "SOL/USDT:USDT",
    "XRP/USDT:USDT",
    "LINK/USDT:USDT",
    "INJ/USDT:USDT",
    "ARB/USDT:USDT",
]

LEVERAGE   = 5       # 10→5x (Council 2026-05-21): live WR 36% × 2:1 R:R + fees = -EV.
                     # Need n≥50 post-Hurst trades before re-bumping. Reverted today's bump.
TP_PCT     = 2.0
SL_PCT     = 1.0
SIZE_PCT   = 30.0
MAX_POS    = 1       # 2→1: cap concurrent exposure until forward-test validates Hurst 0.90 filter
                     # (n=10 backtest 95% CI on WR is 27-86% — sample too small to risk multi-pos)
COOLDOWN   = 2 * 3600
SCAN_SLEEP = 180

# ── Signal thresholds ─────────────────────────────────────────────────────────

# 1. OF Classic — VWAP + OI + CVD
_OI_MIN    = 0.5    # OI must grow ≥0.5% in 5 min
_CVD_LONG  = 68.0   # ≥68% net buying
_CVD_SHORT = 32.0   # ≤32% net selling
_VWAP_MIN  = 0.05   # price at least 0.05% from VWAP
_VWAP_MAX  = 0.7    # price not more than 0.7% from VWAP

# 2. AVWAP Bounce — price at anchored VWAP support/resistance
# Condition: ctx["at_bull_support"] or ctx["at_bear_resist"] already checks 0–0.35% proximity
_AVWAP_OI_MIN   = 0.3   # lower OI threshold — level-based signal needs less conviction
_AVWAP_CVD_LONG  = 60.0
_AVWAP_CVD_SHORT = 40.0

# 3. CVD Divergence
_CVD_DIV_OI_MIN = 0.0   # divergence signal doesn't require OI growth — price action enough


def _check_of_long(ctx: dict) -> bool:
    return (
        ctx["oi_delta_pct"] >= _OI_MIN
        and ctx["cvd_ratio_pct"] >= _CVD_LONG
        and _VWAP_MIN <= ctx["vwap_dev_pct"] <= _VWAP_MAX
    )


def _check_of_short(ctx: dict) -> bool:
    return (
        ctx["oi_delta_pct"] >= _OI_MIN
        and ctx["cvd_ratio_pct"] <= _CVD_SHORT
        and -_VWAP_MAX <= ctx["vwap_dev_pct"] <= -_VWAP_MIN
    )


def _check_avwap_long(ctx: dict) -> bool:
    """Price bouncing off AVWAP bull support with CVD confirmation."""
    return (
        ctx["at_bull_support"]
        and ctx["oi_delta_pct"] >= _AVWAP_OI_MIN
        and ctx["cvd_ratio_pct"] >= _AVWAP_CVD_LONG
    )


def _check_avwap_short(ctx: dict) -> bool:
    """Price rejecting at AVWAP bear resistance with CVD confirmation."""
    return (
        ctx["at_bear_resist"]
        and ctx["oi_delta_pct"] >= _AVWAP_OI_MIN
        and ctx["cvd_ratio_pct"] <= _AVWAP_CVD_SHORT
    )


def _check_cvd_div_long(ctx: dict) -> bool:
    """Price at new low + REAL CVD shows accumulation → LONG.
    Gated by cvd_source=='real' — proxy CVD divergence is disabled
    (35.9% WR in 90d backtest, net -42%)."""
    return ctx["cvd_bullish_div"] and ctx.get("cvd_source") == "real"


def _check_cvd_div_short(ctx: dict) -> bool:
    """Price at new high + REAL CVD shows distribution → SHORT."""
    return ctx["cvd_bearish_div"] and ctx.get("cvd_source") == "real"


def _detect_signal(ctx: dict) -> tuple[str | None, str | None]:
    """
    Check all signal types in priority order.
    Returns (direction, signal_type) or (None, None).
    Priority: AVWAP Bounce > CVD Divergence > OF Classic
    """
    # AVWAP Bounce (highest confidence — at a defined level)
    if _check_avwap_long(ctx):
        return "LONG", "AVWAP"
    if _check_avwap_short(ctx):
        return "SHORT", "AVWAP"

    # CVD Divergence — re-enabled 2026-05-21 but ONLY when real-time WS CVD is warm.
    # Proxy variant (OHLCV close>=open) stays disabled: 35.9% WR in 90d backtest, -42% net.
    if _check_cvd_div_long(ctx):
        return "LONG", "DIV"
    if _check_cvd_div_short(ctx):
        return "SHORT", "DIV"

    # OF Classic (momentum + flow signal)
    if _check_of_long(ctx):
        return "LONG", "OF"
    if _check_of_short(ctx):
        return "SHORT", "OF"

    return None, None


def _build_tg_msg(direction: str, sig_type: str, symbol: str, ctx: dict) -> str:
    """Build a readable Telegram notification per signal type."""
    price = ctx["price"]

    if sig_type == "AVWAP":
        avwap_level = ctx["avwap_bull"] if direction == "LONG" else ctx["avwap_bear"]
        dev_pct     = ctx["bull_dev_pct"] if direction == "LONG" else ctx["bear_dev_pct"]
        label       = "support" if direction == "LONG" else "resistance"
        return (
            f"<b>[OF/AVWAP] {direction} {symbol}</b>\n"
            f"Price: <code>{price:.4f}</code> | "
            f"AVWAP {label}: <code>{avwap_level:.4f}</code> "
            f"(<code>{dev_pct:+.3f}%</code>)\n"
            f"OI delta: <code>{ctx['oi_delta_pct']:+.3f}%</code> | "
            f"CVD bias: <code>{ctx['cvd_ratio_pct']:.1f}%</code>\n"
            f"TP={TP_PCT}%  SL={SL_PCT}%  x{LEVERAGE}"
        )

    if sig_type == "DIV":
        return (
            f"<b>[OF/DIV] {direction} {symbol}</b>\n"
            f"Price: <code>{price:.4f}</code> | "
            f"CVD ratio: <code>{ctx['cvd_div_ratio']:.1f}%</code> "
            f"({'bearish div' if direction == 'SHORT' else 'bullish div'})\n"
            f"OI delta: <code>{ctx['oi_delta_pct']:+.3f}%</code>\n"
            f"TP={TP_PCT}%  SL={SL_PCT}%  x{LEVERAGE}"
        )

    # OF Classic
    return (
        f"<b>[OF] {direction} {symbol}</b>\n"
        f"Price: <code>{price:.4f}</code> | "
        f"VWAP dev: <code>{ctx['vwap_dev_pct']:+.2f}%</code>\n"
        f"OI delta: <code>{ctx['oi_delta_pct']:+.3f}%</code> | "
        f"CVD bias: <code>{ctx['cvd_ratio_pct']:.1f}%</code>\n"
        f"TP={TP_PCT}%  SL={SL_PCT}%  x{LEVERAGE}"
    )


def run_orderflow_engine() -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [OF] ORDERFLOW BOT ЗАПУЩЕН!")
    print(f"   Symbols: {', '.join(SYMBOLS)}")
    print(f"   TP={TP_PCT}%  SL={SL_PCT}%  x{LEVERAGE}  Size={SIZE_PCT}%")
    print(f"   Signals: OF Classic | AVWAP Bounce | CVD Divergence")
    print(f"   Trading={'ON' if ORDERFLOW_TRADING else 'OFF (dry-run)'}  "
          f"{'[DEMO]' if IS_DEMO_TRADING else '[LIVE]'}\n")

    try:
        ex_init = _init_exchange()
        start_bal = get_wallet_usdt(ex_init)
    except Exception:
        start_bal = 0.0

    daily_guard.init(current_balance=start_bal)

    try:
        start_realtime_cvd()
    except Exception as _e:
        print(f"[OF] CVD realtime start failed (non-fatal): {_e}")

    if not any(t.name == "position-monitor" for t in threading.enumerate()):
        position_monitor.start_monitor(
            exchange_factory=_init_exchange,
            send_tg=send_telegram_message,
            chat_id=TG_CHAT_ID,
        )

    send_telegram_message(
        f"<b>[OF] Orderflow Bot запущен</b>\n"
        f"BTC / ETH / SOL | TP={TP_PCT}% SL={SL_PCT}% x{LEVERAGE}\n"
        f"Signals: OF | AVWAP Bounce | CVD Divergence\n"
        f"{'Demo режим' if IS_DEMO_TRADING else 'Live режим'} | "
        f"Торгівля: {'ON' if ORDERFLOW_TRADING else 'OFF (dry-run)'}",
        TG_CHAT_ID,
    )

    _cooldowns: dict[str, float] = {}
    _open_symbols: set = set()
    last_error_tg = 0.0

    while True:
        try:
            now = time.time()

            try:
                exchange = _init_exchange()
                balance  = get_free_usdt(exchange)
                wallet   = get_wallet_usdt(exchange)
            except Exception as e:
                print(f"[OF]  Balance fetch failed: {e}")
                time.sleep(SCAN_SLEEP)
                continue

            if not daily_guard.check(wallet):
                print(f"[OF] Daily loss limit hit — skipping scan")
                time.sleep(SCAN_SLEEP)
                continue

            try:
                real_pos = {
                    p["symbol"].replace("USDT", "/USDT:USDT")
                    for p in exchange.fetch_positions(params={"category": "linear"})
                    if float(p.get("contracts", 0) or 0) > 0
                }
                if _open_symbols:
                    _open_symbols &= real_pos
                else:
                    _open_symbols = {s for s in real_pos if s in SYMBOLS}
            except Exception:
                pass

            if len(_open_symbols) >= MAX_POS:
                print(f"[OF] Max positions ({MAX_POS}) reached — skipping scan")
                time.sleep(SCAN_SLEEP)
                continue

            for symbol in SYMBOLS:
                if len(_open_symbols) >= MAX_POS:
                    print(f"[OF] Max positions reached mid-scan — stopping")
                    break

                cooldown_remaining = COOLDOWN - (now - _cooldowns.get(symbol, 0))
                if cooldown_remaining > 0:
                    print(f"[OF] Cooldown {symbol}: {int(cooldown_remaining / 60)} хв")
                    continue

                if symbol in _open_symbols:
                    print(f"[OF] {symbol} already open — skip")
                    continue

                # Hurst trend filter — orderflow signals are mean-reversion;
                # in strong trends (H>0.58) bot SHORTs the rally → SL spam.
                # 2026-05-21 added after orderflow bled $48 in 22 trades during ETH/BTC uptrend.
                _hurst = _hurst_for(symbol)
                if _hurst > _HURST_FILTER:
                    print(f"[OF] {symbol} Hurst={_hurst:.2f} > {_HURST_FILTER} — trending, skip")
                    continue

                try:
                    ctx = get_orderflow_context(symbol)
                except Exception as e:
                    print(f"[OF]  Context fetch failed for {symbol}: {e}")
                    continue

                try:
                    if cvd_is_ready(symbol):
                        real_div = get_real_cvd_divergence(symbol, lookback=2000)
                        real_ratio = real_div["cvd_ratio"]
                        cvd_log_shadow(
                            symbol,
                            proxy_ratio=ctx["cvd_ratio_pct"],
                            real_ratio=real_ratio,
                            proxy_bearish=ctx["cvd_bearish_div"],
                            proxy_bullish=ctx["cvd_bullish_div"],
                            real_bearish=real_ratio < 40.0,
                            real_bullish=real_ratio > 60.0,
                        )
                except Exception:
                    pass

                direction, sig_type = _detect_signal(ctx)

                if direction is None:
                    print(
                        f"[OF] {symbol} | VWAP={ctx['vwap_dev_pct']:+.2f}% "
                        f"OI={ctx['oi_delta_pct']:+.3f}% CVD={ctx['cvd_ratio_pct']:.0f}% "
                        f"AVWAP_B={ctx['bull_dev_pct']:+.2f}% AVWAP_R={ctx['bear_dev_pct']:+.2f}% "
                        f"div={'B' if ctx['cvd_bearish_div'] else ''}{'L' if ctx['cvd_bullish_div'] else ''}"
                    )
                    continue

                print(f"\n[OF] {'='*44}")
                print(f"[OF] SIGNAL  {direction}  {symbol}  [{sig_type}]")
                print(f"[OF] VWAP_dev={ctx['vwap_dev_pct']:+.2f}%  "
                      f"OI={ctx['oi_delta_pct']:+.3f}%  CVD={ctx['cvd_ratio_pct']:.1f}%")
                if sig_type == "AVWAP":
                    print(f"[OF] AVWAP_bull={ctx['avwap_bull']:.4f}  "
                          f"AVWAP_bear={ctx['avwap_bear']:.4f}")
                if sig_type == "DIV":
                    print(f"[OF] CVD div_ratio={ctx['cvd_div_ratio']:.1f}%")
                print(f"[OF] {'='*44}\n")

                tg_body = _build_tg_msg(direction, sig_type, symbol, ctx)
                _cooldowns[symbol] = now

                # Publish market view to shared state
                try:
                    from modules.market_state import set_state, MarketCondition
                    ms = MarketCondition.BULL if direction == "LONG" else MarketCondition.BEAR
                    set_state(symbol, ms, "orderflow", confidence=0.8,
                              reason=f"orderflow {direction} {sig_type}")
                except Exception:
                    pass

                if ORDERFLOW_TRADING:
                    # All trading goes through dispatcher — handles owner + all subscribers.
                    # Earlier we ALSO called execute_trade() which used config keys = owner's,
                    # doubling owner positions on Bybit (sync drift 2-17×). Removed 2026-05-21.
                    try:
                        from modules.saas_dispatcher import dispatch as _saas_dispatch
                        _saas_dispatch({
                            "source":   "orderflow",
                            "symbol":   symbol,
                            "side":     direction,
                            "leverage": LEVERAGE,
                            "tp_pct":   TP_PCT,
                            "sl_pct":   SL_PCT,
                            "size_pct": SIZE_PCT,
                        })
                        _open_symbols.add(symbol)
                        send_telegram_message(tg_body, TG_CHAT_ID)
                    except Exception as e:
                        print(f"[OF]  dispatch error {symbol}: {e}")
                else:
                    print(f"[OF] DRY-RUN — trading disabled, no order placed")
                    send_telegram_message(f"[OF] DRY-RUN\n{tg_body}", TG_CHAT_ID)

            time.sleep(SCAN_SLEEP)

        except KeyboardInterrupt:
            print("\n[OF] Orderflow бот зупинено.")
            break
        except Exception as e:
            print(f"[OF]  {e}")
            now_ts = time.time()
            if now_ts - last_error_tg > 300:
                last_error_tg = now_ts
                send_telegram_message(
                    f" <b>[OF] Orderflow Bot — помилка</b>\n<code>{str(e)[:300]}</code>",
                    TG_CHAT_ID,
                )
            time.sleep(10)


if __name__ == "__main__":
    run_orderflow_engine()
