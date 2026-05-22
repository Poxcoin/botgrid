"""
orderblock_bot.py — Order Block (SMC) Bot.

Strategy: Smart Money Concepts — detect institutional order blocks, enter
when price retraces into the zone.

  OB LONG:  last bearish candle before a ≥1.5% bullish BOS (Break of Structure)
  OB SHORT: last bullish candle before a ≥1.5% bearish BOS

  Entry:  price retraces into OB zone (ob_low → ob_high)
  SL:     0.25% beyond OB far edge
  TP:     SL_distance × 2.0 (R:R 2:1)

  OB invalidated if any candle CLOSES beyond the SL edge after the BOS.

  Symbols:  BTC  |  TF: 4h  |  Scan: 15 min  (SOL removed: 20% WR backtest)
  Leverage: 3x  |  Size: 5%  |  Cooldown: 12h  |  Max concurrent: 2
"""
import time
import threading
from datetime import datetime
from typing import Optional

import ccxt

from modules.trader import execute_trade, get_free_usdt, get_wallet_usdt, _init_exchange
from modules.tg_notifier import send_telegram_message
from modules import daily_guard, position_monitor
from config.settings import TG_CHAT_ID, IS_DEMO_TRADING, OB_TRADING

SYMBOLS = [
    "BTC/USDT:USDT",
    "ETH/USDT:USDT",
    # SOL removed 2026-05-22: backtest WR 24-33% both variants, monthly -2.9% to -3.2%
    # ETH+BTC alone: +14.88%/mo on static SL (vs combined +89%/90d with SOL drag)
]

LEVERAGE    = 5        # 10→5x (Council 2026-05-21): SL 0.2% < BTC 4h ATR 1.5-2.5%, stop-hunt magnet.
                       # n=19 backtest 95% CI 31-53% WR. Need ATR-adaptive SL before re-bumping.
TP_RATIO    = 3.0      # TP = SL_distance × TP_RATIO (3:1 → break-even at 25% WR)
SL_BUFFER   = 0.002    # TODO: ATR-adaptive (Council #4 critique)
SIZE_PCT    = 40.0     # backtest validated
MAX_POS     = 1        # 2→1: BTC/ETH/SOL correlation 0.75-0.90 = 2 positions = ~1.5 effective
COOLDOWN    = 12 * 3600
SCAN_SLEEP  = 15 * 60

# OB detection parameters
TF              = "4h"
CANDLES         = 60       # total candles to fetch
OB_LOOKBACK     = 50       # candles to scan for OBs
BOS_MIN_PCT     = 0.025    # min move to confirm BOS: 2.5% (was 1.5% — too many weak signals)
BOS_WINDOW      = 5        # candles after candidate to look for BOS
MIN_OB_BODY_PCT = 0.003    # 0.2→0.3% (2026-05-21 backtest):
                            # at 0.002 → 24 trades, WR 41.7%, +2.48%/mo
                            # at 0.003 → 19 trades, WR 42.1%, +4.37%/mo (fewer but higher quality)
                            # Earlier "wider net" guess was wrong — sweep proves 0.3% is best.


# ── Market-data exchange (no auth needed for OHLCV) ──────────────────────────

def _make_market_exchange() -> ccxt.bybit:
    ex = ccxt.bybit({"options": {"defaultType": "linear"}, "enableRateLimit": True})
    return ex


# ── Order Block detection ─────────────────────────────────────────────────────

def _find_order_blocks(
    ohlcv: list,
) -> tuple[Optional[dict], Optional[dict]]:
    """
    Scan OHLCV candles and return (ob_long, ob_short) — most recent unbroken OBs.

    ob_long:  last bearish candle before a ≥BOS_MIN_PCT upward BOS.
              Valid if no subsequent close went below ob_low.
    ob_short: last bullish candle before a ≥BOS_MIN_PCT downward BOS.
              Valid if no subsequent close went above ob_high.

    Each OB dict: {ob_high, ob_low, ob_mid, bos_pct, candle_idx}
    """
    # Use only the lookback window
    candles = ohlcv[-OB_LOOKBACK:] if len(ohlcv) >= OB_LOOKBACK else ohlcv
    n = len(candles)
    if n < BOS_WINDOW + 2:
        return None, None

    ob_long  = None
    ob_short = None

    for i in range(n - BOS_WINDOW - 1):
        o = candles[i][1]
        h = candles[i][2]
        l = candles[i][3]
        c = candles[i][4]

        # Filter doji candles
        body_pct = abs(c - o) / o
        if body_pct < MIN_OB_BODY_PCT:
            continue

        future_closes = [candles[j][4] for j in range(i + 1, min(i + 1 + BOS_WINDOW, n))]
        if not future_closes:
            continue

        # ── OB LONG: bearish candle (c < o) followed by BOS upward ──────────
        if c < o:
            max_close = max(future_closes)
            bos_pct = (max_close - h) / h
            if bos_pct >= BOS_MIN_PCT:
                # Check OB is still unbroken: no close below ob_low after BOS
                subsequent_closes = [candles[j][4] for j in range(i + 1, n)]
                if all(cl >= l for cl in subsequent_closes):
                    ob_long = {
                        "ob_high":    h,
                        "ob_low":     l,
                        "ob_mid":     (h + l) / 2.0,
                        "bos_pct":    round(bos_pct * 100, 2),
                        "candle_idx": i,
                    }
                    # Continue scanning — overwrite with more recent valid OB

        # ── OB SHORT: bullish candle (c > o) followed by BOS downward ───────
        if c > o:
            min_close = min(future_closes)
            bos_pct = (l - min_close) / l
            if bos_pct >= BOS_MIN_PCT:
                subsequent_closes = [candles[j][4] for j in range(i + 1, n)]
                if all(cl <= h for cl in subsequent_closes):
                    ob_short = {
                        "ob_high":    h,
                        "ob_low":     l,
                        "ob_mid":     (h + l) / 2.0,
                        "bos_pct":    round(bos_pct * 100, 2),
                        "candle_idx": i,
                    }

    return ob_long, ob_short


def _get_current_price(symbol: str) -> Optional[float]:
    try:
        ex = _make_market_exchange()
        ticker = ex.fetch_ticker(symbol)
        return float(ticker["last"])
    except Exception as e:
        print(f"[OB]  Price fetch failed {symbol}: {e}")
        return None


# ATR floor REVERTED 2026-05-22: backtest_orderblock.py 90d showed
# static SL 0.2% +14.88%/mo vs ATR-floor +5.83%/mo. ATR widens TP (TP_RATIO=3x),
# making TP harder to hit. OB zone-edge SL is already structural — fine as-is.

# ATR VOL SKIP-GUARD (Council 2026-05-22 — Critic concern):
# Static 0.2% SL is fine in normal vol but gets stop-hunted on news wicks.
# Skip new OB entries when 1m ATR > 0.4% (news spike in progress).
_VOL_SKIP_ATR_PCT = 0.4
_VOL_SKIP_PERIOD  = 14
_VOL_SKIP_TF      = "1m"
_VOL_SKIP_LIMIT   = 30  # last 30 1m candles for ATR calc


def _fetch_1m_atr_pct(market_ex, symbol: str) -> float:
    """Fetch 1m candles + return ATR as % of last close. 0 on failure."""
    try:
        bars = market_ex.fetch_ohlcv(symbol, _VOL_SKIP_TF,
                                     limit=_VOL_SKIP_LIMIT,
                                     params={"category": "linear"})
        if not bars or len(bars) < _VOL_SKIP_PERIOD + 1:
            return 0.0
        trs = []
        for i in range(1, len(bars)):
            h, l, pc = bars[i][2], bars[i][3], bars[i - 1][4]
            trs.append(max(h - l, abs(h - pc), abs(l - pc)))
        atr = sum(trs[-_VOL_SKIP_PERIOD:]) / _VOL_SKIP_PERIOD
        last_close = bars[-1][4]
        return (atr / last_close) * 100 if last_close > 0 else 0.0
    except Exception:
        return 0.0


def _calc_trade_params(
    ob: dict,
    direction: str,
    price: float,
    atr_pct: float = 0.0,  # kept for signature compat with call sites; ignored
) -> Optional[dict]:
    """Calculate entry zone check + sl_pct / tp_pct. Static SL only."""
    if direction == "LONG":
        if not (ob["ob_low"] <= price <= ob["ob_high"]):
            return None
        sl_price = ob["ob_low"] * (1.0 - SL_BUFFER)
        sl_dist  = price - sl_price
        tp_price = price + sl_dist * TP_RATIO
    else:
        if not (ob["ob_low"] <= price <= ob["ob_high"]):
            return None
        sl_price = ob["ob_high"] * (1.0 + SL_BUFFER)
        sl_dist  = sl_price - price
        tp_price = price - sl_dist * TP_RATIO

    if sl_dist <= 0:
        return None

    sl_pct = round(sl_dist / price * 100, 3)
    tp_pct = round(abs(tp_price - price) / price * 100, 3)

    if tp_pct < 0.5:
        return None

    return {
        "sl_pct":   sl_pct,
        "tp_pct":   tp_pct,
        "sl_price": round(sl_price, 6),
        "tp_price": round(tp_price, 6),
    }


# ── Main engine ───────────────────────────────────────────────────────────────

def run_orderblock_engine() -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] [OB] ORDER BLOCK BOT ЗАПУЩЕН!")
    print(f"   Symbols: {', '.join(SYMBOLS)}")
    print(f"   x{LEVERAGE}  Size={SIZE_PCT}%  Cooldown={COOLDOWN // 3600}h")
    print(f"   Trading={'ON' if OB_TRADING else 'OFF (dry-run)'}  "
          f"{'[DEMO]' if IS_DEMO_TRADING else '[LIVE]'}\n")

    try:
        ex_init = _init_exchange()
        start_bal = get_wallet_usdt(ex_init)
    except Exception:
        start_bal = 0.0

    daily_guard.init(current_balance=start_bal)

    if not any(t.name == "position-monitor" for t in threading.enumerate()):
        position_monitor.start_monitor(
            exchange_factory=_init_exchange,
            send_tg=send_telegram_message,
            chat_id=TG_CHAT_ID,
        )

    send_telegram_message(
        f"<b>[OB] Order Block Bot запущен</b>\n"
        f"BTC / ETH / SOL | x{LEVERAGE}  Size={SIZE_PCT}%  TF=4h  R:R 2:1\n"
        f"{'Demo режим' if IS_DEMO_TRADING else 'Live режим'} | "
        f"Торгівля: {'ON' if OB_TRADING else 'OFF (dry-run)'}",
        TG_CHAT_ID,
    )

    market_ex = _make_market_exchange()

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
                print(f"[OB]  Balance fetch failed: {e}")
                time.sleep(SCAN_SLEEP)
                continue

            if not daily_guard.check(wallet):
                print(f"[OB] Daily loss limit hit — skipping scan")
                time.sleep(SCAN_SLEEP)
                continue

            # Sync open positions against exchange
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
                print(f"[OB] Max positions ({MAX_POS}) reached — skipping scan")
                time.sleep(SCAN_SLEEP)
                continue

            for symbol in SYMBOLS:
                if len(_open_symbols) >= MAX_POS:
                    break

                cooldown_remaining = COOLDOWN - (now - _cooldowns.get(symbol, 0))
                if cooldown_remaining > 0:
                    print(f"[OB] Cooldown {symbol}: "
                          f"{int(cooldown_remaining // 3600)}h "
                          f"{int((cooldown_remaining % 3600) // 60)}m")
                    continue

                if symbol in _open_symbols:
                    print(f"[OB] {symbol} already open — skip")
                    continue

                # ── Fetch 4h OHLCV ───────────────────────────────────────────
                try:
                    ohlcv = market_ex.fetch_ohlcv(
                        symbol, timeframe=TF, limit=CANDLES,
                        params={"category": "linear"},
                    )
                except Exception as e:
                    print(f"[OB]  OHLCV fetch failed {symbol}: {e}")
                    continue

                if len(ohlcv) < 20:
                    print(f"[OB] Not enough candles for {symbol} ({len(ohlcv)})")
                    continue

                # ── Detect Order Blocks ───────────────────────────────────────
                ob_long, ob_short = _find_order_blocks(ohlcv)

                # ── Get current price ─────────────────────────────────────────
                price = _get_current_price(symbol)
                if price is None:
                    continue

                # ── ATR vol skip-guard ───────────────────────────────────────
                # Skip entries during news-driven vol spikes (1m ATR > 0.4%)
                # Static SL 0.2% gets hunted on big wicks; better to wait calm.
                if ob_long is not None or ob_short is not None:
                    vol_atr = _fetch_1m_atr_pct(market_ex, symbol)
                    if vol_atr > _VOL_SKIP_ATR_PCT:
                        print(f"[OB] {symbol} skip — 1m ATR {vol_atr:.2f}% > "
                              f"{_VOL_SKIP_ATR_PCT}% (vol spike, wait calm)")
                        continue

                signal_found = False

                for direction, ob in (("LONG", ob_long), ("SHORT", ob_short)):
                    if ob is None:
                        continue

                    params = _calc_trade_params(ob, direction, price)
                    if params is None:
                        continue

                    # Price is in OB zone — fire signal
                    signal_found = True

                    print(f"\n[OB] {'='*44}")
                    print(f"[OB] SIGNAL  {direction}  {symbol}")
                    print(f"[OB] OB zone: {ob['ob_low']:.4f} – {ob['ob_high']:.4f}  "
                          f"(BOS={ob['bos_pct']:.2f}%)")
                    print(f"[OB] Price={price:.4f}  "
                          f"TP={params['tp_pct']:.2f}%  SL={params['sl_pct']:.2f}%")
                    print(f"[OB] {'='*44}\n")

                    tg_body = (
                        f"<b>[OB] {direction} {symbol}</b>\n"
                        f"Entry: <code>{price:.4f}</code>\n"
                        f"OB zone: <code>{ob['ob_low']:.4f} – {ob['ob_high']:.4f}</code> "
                        f"(BOS +{ob['bos_pct']:.2f}%)\n"
                        f"TP: <code>{params['tp_pct']:.2f}%</code> ({params['tp_price']:.4f})  "
                        f"SL: <code>{params['sl_pct']:.2f}%</code> ({params['sl_price']:.4f})  "
                        f"x{LEVERAGE}"
                    )

                    _cooldowns[symbol] = now

                    # Paper-trade hook (Council 2026-05-22): capture every OB signal
                    # in simulation so we accumulate WR data even before bot validates live.
                    try:
                        from modules.paper_trader import paper_open
                        paper_open("orderblock", symbol, direction, LEVERAGE, price,
                                   sl_pct=params["sl_pct"], tp_pct=params["tp_pct"],
                                   variant="normal")
                    except Exception as _pe:
                        print(f"[OB] paper_open err: {_pe}")

                    if OB_TRADING:
                        # execute_trade removed 2026-05-21 — owner double-position bug
                        try:
                            from modules.saas_dispatcher import dispatch as _saas_dispatch
                            _saas_dispatch({
                                "source":   "orderblock",
                                "symbol":   symbol,
                                "side":     direction,
                                "leverage": LEVERAGE,
                                "tp_pct":   params["tp_pct"],
                                "sl_pct":   params["sl_pct"],
                                "size_pct": SIZE_PCT,
                            })
                            _open_symbols.add(symbol)
                            send_telegram_message(tg_body, TG_CHAT_ID)
                        except Exception as e:
                            print(f"[OB]  dispatch error {symbol}: {e}")
                    else:
                        print(f"[OB] DRY-RUN — no order placed")
                        send_telegram_message(f"[OB] DRY-RUN\n{tg_body}", TG_CHAT_ID)

                    # One trade per symbol per scan
                    break

                if not signal_found:
                    ob_l_str = f"LONG OB: {ob_long['ob_low']:.2f}–{ob_long['ob_high']:.2f}" if ob_long else "no OB_LONG"
                    ob_s_str = f"SHORT OB: {ob_short['ob_low']:.2f}–{ob_short['ob_high']:.2f}" if ob_short else "no OB_SHORT"
                    print(f"[OB] {symbol} @ {price:.2f} | {ob_l_str} | {ob_s_str}")

            time.sleep(SCAN_SLEEP)

        except KeyboardInterrupt:
            print("\n[OB] Order Block бот зупинено.")
            break
        except Exception as e:
            print(f"[OB]  {e}")
            now_ts = time.time()
            if now_ts - last_error_tg > 300:
                last_error_tg = now_ts
                send_telegram_message(
                    f" <b>[OB] Order Block Bot — помилка</b>\n<code>{str(e)[:300]}</code>",
                    TG_CHAT_ID,
                )
            time.sleep(10)


if __name__ == "__main__":
    run_orderblock_engine()
