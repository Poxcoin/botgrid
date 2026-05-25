"""
okx_trending.py — OKX volume+price spike detector for cross-exchange signals.

Polls OKX public ticker API (no auth). For each USDT spot ticker:
  - Compute 24h price change %
  - Compute notional volume (USD)
  - Rank by composite score = abs(pct_change) × log10(volume)
  - Top spike candidates → check Bybit availability for execution
  - Emit LONG signal (or SHORT if -10%+) → dispatcher source='okx_trending'

Tagged paper-only via _LIVE_RESTRICTED_SOURCES. Bayesian quality auto-tracks.
30d data → graduate if positive edge.

Council 2026-05-25: Asian exchange flow may lead Western pumps;
free public API; zero API cost.

Scan interval: 60s. Cooldown 6h per symbol.
"""
from __future__ import annotations

import math
import os
import sys
import time
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

import requests
import ccxt

from modules.saas_dispatcher import dispatch as _dispatch

OKX_URL = 'https://www.okx.com/api/v5/market/tickers?instType=SPOT'
SCAN_INTERVAL_SEC = 60
COOLDOWN_SEC = 6 * 3600

# Trigger thresholds (loosened 2026-05-25: 0 triggers in 4 days at 8/3M/50)
MIN_PCT_CHANGE_24H = 5.0      # |chg| ≥ 5% in 24h (was 8.0)
MIN_VOL_USD = 1_000_000        # at least $1M 24h notional on OKX (was 3M)
MIN_COMPOSITE_SCORE = 30.0    # |pct| × log10(vol_usd) ≥ 30 (was 50)

BLOCKED_COINS = {'BTC', 'ETH', 'SOL', 'BNB', 'USDC', 'USDT', 'DAI', 'FDUSD',
                 'EUR', 'TRY', 'BRL', 'GBP'}

_last_signal_ts: dict[str, float] = {}
_bybit_universe: set[str] = set()


def _log(msg: str) -> None:
    print(f"[OKX] {msg}", flush=True)


def _load_bybit_perp_universe() -> set[str]:
    """Set of coin tickers tradeable as USDT perps on Bybit."""
    try:
        ex = ccxt.bybit({'options': {'defaultType': 'linear'}})
        ex.load_markets()
        coins = set()
        for sym in ex.markets:
            if ':USDT' in sym:
                coin = sym.split('/')[0]
                coins.add(coin.upper())
        return coins
    except Exception as e:
        _log(f'bybit universe err: {e}')
        return set()


def _scan_iteration() -> None:
    global _bybit_universe
    if not _bybit_universe:
        _bybit_universe = _load_bybit_perp_universe()
        _log(f'loaded {len(_bybit_universe)} Bybit perp tickers')

    try:
        r = requests.get(OKX_URL, timeout=15)
        r.raise_for_status()
        rows = r.json().get('data', [])
    except Exception as e:
        _log(f'OKX api err: {e}')
        return

    # Filter to USDT pairs
    candidates = []
    for row in rows:
        inst_id = row.get('instId', '')
        if not inst_id.endswith('-USDT'):
            continue
        coin = inst_id.split('-')[0].upper()
        if coin in BLOCKED_COINS:
            continue
        if coin not in _bybit_universe:
            continue   # can only trade what Bybit has

        try:
            last = float(row.get('last', 0) or 0)
            open24h = float(row.get('open24h', 0) or 0)
            vol_ccy_24h = float(row.get('volCcy24h', 0) or 0)
        except (ValueError, TypeError):
            continue
        if last <= 0 or open24h <= 0:
            continue
        pct_change = (last - open24h) / open24h * 100
        if abs(pct_change) < MIN_PCT_CHANGE_24H:
            continue
        if vol_ccy_24h < MIN_VOL_USD:
            continue

        composite = abs(pct_change) * math.log10(max(vol_ccy_24h, 1))
        if composite < MIN_COMPOSITE_SCORE:
            continue

        candidates.append({
            'coin': coin,
            'price': last,
            'pct_24h': pct_change,
            'vol_usd': vol_ccy_24h,
            'composite': composite,
        })

    candidates.sort(key=lambda x: -x['composite'])
    _log(f'screening: {len(candidates)} OKX trending candidates (Bybit-tradeable)')

    for c in candidates[:5]:  # top 5 only per cycle to avoid spam
        coin = c['coin']
        if time.time() - _last_signal_ts.get(coin, 0) < COOLDOWN_SEC:
            continue

        side = 'LONG' if c['pct_24h'] > 0 else 'SHORT'
        # Score: composite normalized to 5-12 range
        # composite typically 50-200 → score 6-12
        score = max(5.0, min(12.0, c['composite'] / 15))
        if abs(c['pct_24h']) > 15:
            score += 1.0
        score = round(score, 1)

        _log(f"🚨 {coin} {side}: {c['pct_24h']:+.1f}%  vol=${c['vol_usd']/1e6:.1f}M  "
             f"composite={c['composite']:.1f}  score={score}")

        signal = {
            'source': 'okx_trending',
            'coin': coin,
            'symbol': f"{coin}/USDT:USDT",
            'action': side,
            'total_score': score if side == 'LONG' else -score,
            'confidence': 65,
            'size_multiplier': 1.0,
            'leverage': 4,
            'tp_pct': 15.0,
            'sl_pct': 5.0,
            '_market': {'quote_volume_24h': c['vol_usd'], 'okx_pct_24h': c['pct_24h']},
            'news_title': f"{coin} OKX trending: {c['pct_24h']:+.1f}% on ${c['vol_usd']/1e6:.0f}M",
            'news_description': f"OKX spike — 24h price move {c['pct_24h']:+.1f}%, vol ${c['vol_usd']/1e6:.0f}M",
        }
        try:
            result = _dispatch(signal)
            _log(f'dispatched {coin} {side}: {result}')
            _last_signal_ts[coin] = time.time()
        except Exception as e:
            _log(f'dispatch err {coin}: {e}')


def main():
    _log(f'okx_trending starting — scan every {SCAN_INTERVAL_SEC}s')
    _log(f'thresholds: |pct_24h|≥{MIN_PCT_CHANGE_24H}%, vol≥${MIN_VOL_USD/1e6}M, '
         f'composite≥{MIN_COMPOSITE_SCORE}, cooldown {COOLDOWN_SEC//3600}h')
    _log(f'TP=15% SL=5% lev=4x (R:R 3:1, BE WR=25%)')

    while True:
        try:
            _scan_iteration()
        except KeyboardInterrupt:
            _log('shutting down')
            return
        except Exception as e:
            _log(f'scan err: {e}')
        time.sleep(SCAN_INTERVAL_SEC)


if __name__ == '__main__':
    main()
