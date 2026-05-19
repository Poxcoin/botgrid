"""
fr_extreme_bot.py — Funding Rate Extreme Reversal Bot.

Strategy: When the market is over-leveraged (FR near Bybit's cap),
fade the crowd — enter against the prevailing direction.

  FR > +FR_BULL_THRESHOLD → longs over-leveraged → SHORT signal
  FR < -FR_BEAR_THRESHOLD → shorts over-leveraged → LONG  signal

OI confirmation: OI grew ≥ OI_CONFIRM_PCT while FR is extreme →
  fresh money piling in at extremes → size_multiplier 1.3x

Bybit USDT perp FR range: normal ≈ ±0.001–0.005%; cap ≈ ±0.01% for BTC/ETH
Extreme signals at: >0.009% (90% of cap) or < -0.006%

TP: 2.5%  SL: 1.0%  R:R 2.5:1
Leverage: 3x  Size: 10%  Cooldown: 24h  Scan: 30 min
Max concurrent positions: 2
"""
import time
import threading
from datetime import datetime, timezone
from typing import Optional

from modules.market_data import get_funding_rate, get_open_interest
from modules.trader import execute_trade, get_free_usdt, get_wallet_usdt, _init_exchange
from modules.tg_notifier import send_telegram_message
from modules import daily_guard, position_monitor
from config.settings import TG_CHAT_ID, IS_DEMO_TRADING, FR_EXTREME_TRADING
from grid_bot import _calc_hurst

# ── Watchlist ──────────────────────────────────────────────────────────────────
# Tier 1 — largest perp markets on Bybit (clear FR signals)
SYMBOLS_MAJOR = [
    "BTC/USDT:USDT",
    "ETH/USDT:USDT",
]

ALL_SYMBOLS = SYMBOLS_MAJOR

# ── Trade parameters ───────────────────────────────────────────────────────────
LEVERAGE     = 5
TP_PCT       = 2.5     # 2.5% — bigger move needed for true FR extremes
SL_PCT       = 1.5     # 1.5% — wider SL to survive noise in trending markets
SIZE_PCT     = 15.0    # 15% per trade (was 20% — reduced risk per signal)
MAX_POS      = 2
COOLDOWN     = 24 * 3600   # 24h — prevents firing on consecutive 8h events
SCAN_SLEEP   = 30 * 60
COIN_SLEEP   = 1.0

# ── FR thresholds (Bybit USDT perps) ──────────────────────────────────────────
# Normal range: ±0.001–0.005%.  Cap for BTC/ETH: ±0.01%.
# Extreme = ≥90% of cap. get_funding_rate() returns value in percent (0.009 = 0.009%)
FR_BULL_MAJOR  = 0.009    # >0.009% (90% of BTC/ETH hard cap) → SHORT
FR_BEAR_MAJOR  = 0.006    # <-0.006% (unusually negative) → LONG

OI_CONFIRM_PCT  = 1.0     # OI grew ≥1% in last 4h → size_mult 1.3x
HURST_MAX       = 0.65    # H > 0.65 = strong trend → skip FR signals (mean-reversion fails in trends)


def _get_thresholds(symbol: str) -> tuple[float, float]:
    return FR_BULL_MAJOR, FR_BEAR_MAJOR


def _check_signal(
    symbol: str,
    fr: float,
    oi_change_pct: float,
) -> Optional[dict]:
    """
    Return signal dict or None.

    Bull extreme (FR > threshold) → SHORT
    Bear extreme (FR < -threshold) → LONG
    """
    bull_thr, bear_thr = _get_thresholds(symbol)

    if fr >= bull_thr:
        direction     = "SHORT"
        fr_extreme_pct = fr / bull_thr * 100
    elif fr <= -bear_thr:
        direction     = "LONG"
        fr_extreme_pct = abs(fr) / bear_thr * 100
    else:
        return None

    size_mult = 1.3 if oi_change_pct >= OI_CONFIRM_PCT else 1.0

    return {
        "direction":      direction,
        "fr":             fr,
        "oi_change_pct":  oi_change_pct,
        "fr_extreme_pct": round(fr_extreme_pct, 0),
        "size_mult":      size_mult,
    }


def run_fr_extreme_engine() -> None:
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] [FRE] FR EXTREME BOT ЗАПУЩЕН!")
    print(f"   Symbols: {', '.join(s.replace('/USDT:USDT','') for s in SYMBOLS_MAJOR)}")
    print(f"   Thresholds: SHORT≥{FR_BULL_MAJOR}%  LONG≤-{FR_BEAR_MAJOR}%")
    print(f"   TP={TP_PCT}%  SL={SL_PCT}%  x{LEVERAGE}  Size={SIZE_PCT}%")
    print(f"   Trading={'ON' if FR_EXTREME_TRADING else 'OFF (dry-run)'}  "
          f"{'[DEMO]' if IS_DEMO_TRADING else '[LIVE]'}\n")

    try:
        ex_init   = _init_exchange()
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
        f"<b>[FRE] FR Extreme Bot запущен</b>\n"
        f"{len(ALL_SYMBOLS)} монет | TP={TP_PCT}% SL={SL_PCT}% x{LEVERAGE}\n"
        f"{'Demo режим' if IS_DEMO_TRADING else 'Live режим'} | "
        f"Торгівля: {'ON' if FR_EXTREME_TRADING else 'OFF (dry-run)'}",
        TG_CHAT_ID,
    )

    _cooldowns: dict[str, float] = {}
    _open_symbols: set = set()
    last_error_tg = 0.0

    while True:
        try:
            now = time.time()
            now_dt = datetime.now(timezone.utc)

            try:
                exchange = _init_exchange()
                balance  = get_free_usdt(exchange)
                wallet   = get_wallet_usdt(exchange)
            except Exception as e:
                print(f"[FRE] ❌ Balance fetch failed: {e}")
                time.sleep(SCAN_SLEEP)
                continue

            if not daily_guard.check(wallet):
                print(f"[FRE] Daily loss limit hit — skipping scan")
                time.sleep(SCAN_SLEEP)
                continue

            # Sync open positions
            try:
                real_pos = {
                    p["symbol"].replace("USDT", "/USDT:USDT")
                    for p in exchange.fetch_positions(params={"category": "linear"})
                    if float(p.get("contracts", 0) or 0) > 0
                }
                if _open_symbols:
                    _open_symbols &= real_pos
                else:
                    _open_symbols = {s for s in real_pos if s in ALL_SYMBOLS}
            except Exception:
                pass

            if len(_open_symbols) >= MAX_POS:
                print(f"[FRE] Max positions ({MAX_POS}) — skipping scan")
                time.sleep(SCAN_SLEEP)
                continue

            print(f"\n[FRE] === Scan {now_dt.strftime('%H:%M UTC')} ===")

            for symbol in ALL_SYMBOLS:
                if len(_open_symbols) >= MAX_POS:
                    break

                cooldown_remaining = COOLDOWN - (now - _cooldowns.get(symbol, 0))
                if cooldown_remaining > 0:
                    time.sleep(COIN_SLEEP)
                    continue

                if symbol in _open_symbols:
                    time.sleep(COIN_SLEEP)
                    continue

                coin = symbol.replace("/USDT:USDT", "")

                # ── Fetch FR and OI ──────────────────────────────────────────
                try:
                    fr         = get_funding_rate(coin)
                    oi_data    = get_open_interest(coin)
                    oi_change  = oi_data.get("oi_change_pct", 0.0)
                except Exception as e:
                    print(f"[FRE] ❌ Data fetch failed {coin}: {e}")
                    time.sleep(COIN_SLEEP)
                    continue

                bull_thr, bear_thr = _get_thresholds(symbol)
                print(f"[FRE] {coin:8s}  FR={fr:+.5f}%  "
                      f"OI={oi_change:+.2f}%  "
                      f"thr±{bull_thr}/{bear_thr}%")

                sig = _check_signal(symbol, fr, oi_change)
                if sig is None:
                    time.sleep(COIN_SLEEP)
                    continue

                # Hurst filter: skip if market is strongly trending (mean-reversion unreliable)
                try:
                    klines = exchange.fetch_ohlcv(symbol, "4h", limit=64)
                    closes = [k[4] for k in klines if k[4]]
                    hurst  = _calc_hurst(closes[-60:]) if len(closes) >= 60 else 0.5
                    if hurst > HURST_MAX:
                        print(f"[FRE] ⏭ {coin} — Hurst={hurst:.3f} > {HURST_MAX} (strong trend) — skip")
                        time.sleep(COIN_SLEEP)
                        continue
                except Exception:
                    pass  # if hurst check fails, proceed anyway

                direction  = sig["direction"]
                size_mult  = sig["size_mult"]
                oi_tag     = f" OI+{oi_change:.1f}% ✓" if oi_change >= OI_CONFIRM_PCT else ""

                print(f"\n[FRE] {'='*44}")
                print(f"[FRE] SIGNAL  {direction}  {symbol}")
                print(f"[FRE] FR={fr:+.5f}% ({sig['fr_extreme_pct']:.0f}% of threshold){oi_tag}")
                print(f"[FRE] TP={TP_PCT}%  SL={SL_PCT}%  x{LEVERAGE}  mult={size_mult}x")
                print(f"[FRE] {'='*44}\n")

                tg_body = (
                    f"<b>[FRE] {direction} {coin}</b>\n"
                    f"FR: <code>{fr:+.5f}%</code> "
                    f"({sig['fr_extreme_pct']:.0f}% від порогу){oi_tag}\n"
                    f"OI 4h: <code>{oi_change:+.2f}%</code>\n"
                    f"TP: <code>{TP_PCT}%</code>  "
                    f"SL: <code>{SL_PCT}%</code>  "
                    f"x{LEVERAGE}  size×{size_mult}"
                )

                _cooldowns[symbol] = now

                if FR_EXTREME_TRADING:
                    try:
                        trade_size = round(SIZE_PCT * size_mult, 2)
                        trade_sig = {
                            "coin":            coin,
                            "action":          direction,
                            "total_score":     1,
                            "size_multiplier": size_mult,
                        }
                        execute_trade(
                            trade_sig,
                            leverage_override=LEVERAGE,
                            tp_pct=TP_PCT,
                            sl_pct=SL_PCT,
                            size_pct=trade_size,
                            bot_source="fr_extreme",
                        )
                        try:
                            from modules.saas_dispatcher import dispatch as _saas_dispatch
                            _saas_dispatch({
                                "source":   "fr_extreme",
                                "symbol":   symbol,
                                "side":     direction,
                                "leverage": LEVERAGE,
                                "tp_pct":   TP_PCT,
                                "sl_pct":   SL_PCT,
                                "size_pct": trade_size,
                            })
                        except Exception as _de:
                            print(f"[FRE] saas_dispatch error: {_de}")
                        _open_symbols.add(symbol)
                        send_telegram_message(tg_body, TG_CHAT_ID)
                    except Exception as e:
                        print(f"[FRE] ❌ execute_trade error {symbol}: {e}")
                else:
                    print(f"[FRE] DRY-RUN — no order placed")
                    send_telegram_message(f"[FRE] DRY-RUN\n{tg_body}", TG_CHAT_ID)

                time.sleep(COIN_SLEEP)

            time.sleep(SCAN_SLEEP)

        except KeyboardInterrupt:
            print("\n[FRE] FR Extreme бот зупинено.")
            break
        except Exception as e:
            print(f"[FRE] ❌ {e}")
            now_ts = time.time()
            if now_ts - last_error_tg > 300:
                last_error_tg = now_ts
                send_telegram_message(
                    f"❌ <b>[FRE] FR Extreme Bot — помилка</b>\n<code>{str(e)[:300]}</code>",
                    TG_CHAT_ID,
                )
            time.sleep(10)


if __name__ == "__main__":
    run_fr_extreme_engine()
