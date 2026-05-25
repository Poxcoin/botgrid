"""
pump_scanner.py — Volume-spike altcoin pump detector (paper-only, 2026-05-24).

Scans Bybit perpetual altcoins every 60s. Triggers LONG signal when:
  - 24h quote volume > VOL_MULT × 7d avg quote volume
  - Symbol NOT in top-cap blocked list (BTC/ETH/SOL/BNB)
  - Last 1h price change > MIN_PRICE_CHANGE (confirms momentum)
  - Quote vol 24h > MIN_DAILY_VOL_USD ($5M minimum liquidity)
  - Not in cooldown (12h per symbol after signal)

Score formula:
  base = clamp(log2(vol_ratio) × 2.5, 5, 12)   # 4x→5, 8x→7.5, 16x→10, 32x→12.5
  if 1h price change > 8%: base += 1
  if last 4h trend > 5%: base += 1

Output → dispatcher (source='pump_scanner', PAPER ONLY per
_LIVE_RESTRICTED_SOURCES). 30d data → Council review → graduate.

TP=20%, SL=5%, leverage=4x → R:R ~4:1, effective +80%/-20% per trade.
Break-even WR: 5/(5+20) = 20%.
"""
from __future__ import annotations

import math
import os
import sys
import time
import uuid
from datetime import datetime, timezone
from typing import Optional

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

import ccxt

from modules.saas_dispatcher import dispatch as _dispatch

# ─── Parameters ──────────────────────────────────────────────────────────────
SCAN_INTERVAL_SEC = 60
# Loosened 2026-05-25: 0 triggers in 4 days at 5x/5M/0.5%
VOL_MULT_THRESHOLD = 3.0           # 24h vol must be >= 3x past 7d avg (was 5x)
MIN_DAILY_VOL_USD = 3_000_000      # $3M minimum daily volume (was 5M)
MIN_PRICE_CHANGE_1H_PCT = 0.3      # must move at least +0.3% in last 1h (was 0.5%)
COOLDOWN_SEC = 12 * 3600           # 12h cooldown per symbol
MAX_OPEN_SIGNALS = 3               # don't open >3 pump positions simultaneously

BLOCKED_COINS = {'BTC', 'ETH', 'SOL', 'BNB', 'USDC', 'USDT', 'DAI', 'FDUSD'}

TP_PCT = 20.0
SL_PCT = 5.0
LEVERAGE = 4
SIZE_PCT = 3.0                     # 3% of balance per trade

_last_signal_ts: dict[str, float] = {}  # coin -> last signal unix ts
# NOTE: MAX_OPEN_SIGNALS gate not enforced here — cap is implicit via 12h per-symbol
# cooldown + dispatcher-side position limits. Removed dead _open_signals_count counter.


def _log(msg: str) -> None:
    print(f"[PUMP] {msg}")


def _init_exchange() -> ccxt.Exchange:
    ex = ccxt.bybit({
        'enableRateLimit': True,
        'options': {'defaultType': 'linear'},
    })
    ex.load_markets()
    return ex


def _scan_iteration(ex: ccxt.Exchange) -> None:
    """One scan cycle: fetch tickers, compute spike, dispatch signals."""
    try:
        tickers = ex.fetch_tickers()
    except Exception as e:
        _log(f'fetch_tickers err: {e}')
        return

    # Filter to USDT perps only
    candidates = []
    for sym, t in tickers.items():
        if ':USDT' not in sym:
            continue
        coin = sym.split('/')[0]
        if coin in BLOCKED_COINS:
            continue
        last = t.get('last') or 0
        if not last or last <= 0:
            continue
        qv24 = float(t.get('quoteVolume') or 0)
        if qv24 < MIN_DAILY_VOL_USD:
            continue
        pct_1h = float(t.get('info', {}).get('price1hPcnt', 0) or 0) * 100  # Bybit returns decimal
        candidates.append((coin, sym, last, qv24, pct_1h, t))

    if not candidates:
        _log('no candidates met initial filters')
        return

    _log(f'screening {len(candidates)} USDT perps for vol spike')

    for coin, sym, price, qv24, pct_1h, t in candidates:
        # Cooldown check
        if time.time() - _last_signal_ts.get(coin, 0) < COOLDOWN_SEC:
            continue

        # Need 1h momentum confirmation
        if pct_1h < MIN_PRICE_CHANGE_1H_PCT:
            continue

        # Fetch 7d daily candles to compute avg volume
        try:
            daily = ex.fetch_ohlcv(sym, timeframe='1d', limit=8)
        except Exception:
            continue
        if not daily or len(daily) < 7:
            continue
        # Last 7 days (excluding today) avg quote-vol
        # Bybit linear perps via ccxt: bar[5] is ALREADY quote volume (turnover).
        prev_qvols = [bar[5] for bar in daily[-8:-1]]
        if not prev_qvols:
            continue
        avg_prev_qvol = sum(prev_qvols) / len(prev_qvols)
        if avg_prev_qvol <= 0:
            continue
        vol_ratio = qv24 / avg_prev_qvol
        if vol_ratio < VOL_MULT_THRESHOLD:
            continue

        # Compute score
        score = max(5.0, min(12.5, math.log2(vol_ratio) * 2.5))
        if pct_1h > 8.0:
            score += 1.0
        # 4h trend bonus
        try:
            h4 = ex.fetch_ohlcv(sym, timeframe='4h', limit=1)
            if h4 and h4[0][4] > 0:
                pct_4h = (price - h4[0][1]) / h4[0][1] * 100
                if pct_4h > 5.0:
                    score += 1.0
        except Exception:
            pass
        score = round(score, 1)

        _log(f'🚨 {coin}: vol_ratio={vol_ratio:.1f}x qv24=${qv24/1e6:.1f}M '
             f'1h={pct_1h:+.1f}% score={score}')

        signal = {
            'source': 'pump_scanner',
            'coin': coin,
            'symbol': sym,
            'action': 'LONG',
            'total_score': score,
            'confidence': 65,
            'size_multiplier': 1.0,
            'leverage': LEVERAGE,
            'size_pct': SIZE_PCT,
            'tp_pct': TP_PCT,
            'sl_pct': SL_PCT,
            '_market': {'quote_volume_24h': qv24, 'vol_ratio': vol_ratio,
                        'price_1h_pct': pct_1h},
            'news_title': f'{coin} volume spike {vol_ratio:.1f}x — pump scanner',
            'news_description': f'24h vol ${qv24/1e6:.1f}M vs 7d avg, +{pct_1h:.1f}% last 1h',
        }
        try:
            result = _dispatch(signal)
            _log(f'dispatched {coin}: {result}')
            _last_signal_ts[coin] = time.time()
        except Exception as e:
            _log(f'dispatch err {coin}: {e}')


def main():
    _log(f'pump_scanner starting — scan every {SCAN_INTERVAL_SEC}s')
    _log(f'thresholds: vol_mult≥{VOL_MULT_THRESHOLD}x, daily_vol≥${MIN_DAILY_VOL_USD/1e6:.0f}M, '
         f'1h≥+{MIN_PRICE_CHANGE_1H_PCT}%, cooldown {COOLDOWN_SEC//3600}h')
    _log(f'TP={TP_PCT}% SL={SL_PCT}% lev={LEVERAGE}x size={SIZE_PCT}%')
    _log(f'blocked coins: {sorted(BLOCKED_COINS)}')

    ex = _init_exchange()
    while True:
        try:
            _scan_iteration(ex)
        except KeyboardInterrupt:
            _log('shutting down')
            return
        except Exception as e:
            _log(f'scan iter err: {e}')
        time.sleep(SCAN_INTERVAL_SEC)


if __name__ == '__main__':
    main()
