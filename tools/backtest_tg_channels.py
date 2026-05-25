"""
tools/backtest_tg_channels.py — measure historical edge of TG channels.

Usage:
  python tools/backtest_tg_channels.py join     # join all CANDIDATES (anti-flood)
  python tools/backtest_tg_channels.py backtest # fetch history + score
  python tools/backtest_tg_channels.py both     # join then backtest

Output:
  /opt/botgrid/tg_channel_scores.json — per-channel: n_msgs, n_signals, WR, avg_ret_1h, avg_ret_4h
  Ranked by edge_pp = (avg_ret_1h - 0) × 100
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, '/opt/botgrid')
from dotenv import load_dotenv
load_dotenv('/opt/botgrid/.env')

import ccxt
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.errors import FloodWaitError

from config.settings import TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION

# 30 curated channels (mix of categories — see comments)
CANDIDATES = [
    # === Exchange announcements (high-frequency) ===
    "Binance_Announcements", "BinanceListings", "Bybit_announcements",
    "okx_announcements", "kucoin_listings",
    # === Whale/onchain ===
    "whalealert_io", "lookonchain", "ArkhamIntel", "WhaleScout", "spotonchain",
    # === News aggregators (real-time) ===
    "cryptopanic", "TheBlockOfficial", "decryptmedia", "coindesk", "cryptocom",
    # === KOL / signal channels ===
    "CryptoCapo_", "altcoindaily", "Cred_Crypto", "messaricrypto", "Trader_XO",
    # === Alpha leaks / low-followed ===
    "CryptoBubbles", "DegenSpartan", "crypto_birb", "AltcoinPsycho", "DefiLlama",
    # === Macro context ===
    "MacroAlf", "LynAldenContact", "DocumentingBTC",
    # === Russian/Ukrainian (less competition) ===
    "cryptocom_ru", "cryptopanicnews",
]

CACHE_DIR = Path('/opt/botgrid/tg_backtest_cache')
CACHE_DIR.mkdir(exist_ok=True)
OUTPUT = Path('/opt/botgrid/tg_channel_scores.json')

LOOKBACK_DAYS = 30
JOIN_DELAY_SEC = 90  # 40/hour max — safe vs Telegram flood

# Coin regex — uppercase 2-10 chars before USDT/USD/$ marker
_COIN_RE = re.compile(r'\b([A-Z]{2,10})(?:USDT|/USDT|USD|\$|\s+\$)', re.IGNORECASE)
_COIN_RE2 = re.compile(r'\$([A-Z]{2,10})\b')
# Blocked: stablecoins + meta words
_BLOCKED = {'USDT','USDC','DAI','BUSD','TUSD','FDUSD','USD','EUR','GBP','BTC','ETH',
             'NEW','BUY','SELL','LONG','SHORT','PUMP','DUMP','MOON','GEM','HOT','HIGH',
             'LOW','THE','AND','FOR','WITH','FROM','THIS','THAT','HAVE','WILL'}


def extract_coin(text: str) -> str | None:
    for rx in (_COIN_RE2, _COIN_RE):
        for m in rx.finditer(text or ''):
            sym = m.group(1).upper()
            if sym not in _BLOCKED and len(sym) <= 8:
                return sym
    return None


async def join_channels():
    client = TelegramClient(StringSession(TELEGRAM_SESSION), int(TELEGRAM_API_ID), TELEGRAM_API_HASH)
    await client.start()
    joined = []
    failed = []
    for ch in CANDIDATES:
        try:
            entity = await client.get_entity(ch)
            # Try join (no-op if already joined)
            from telethon.tl.functions.channels import JoinChannelRequest
            await client(JoinChannelRequest(entity))
            joined.append(ch)
            print(f'[JOIN] ✓ @{ch}')
        except FloodWaitError as e:
            print(f'[JOIN] flood wait {e.seconds}s — sleeping')
            await asyncio.sleep(e.seconds + 5)
        except Exception as e:
            failed.append((ch, str(e)[:80]))
            print(f'[JOIN] ✗ @{ch}: {type(e).__name__} {str(e)[:60]}')
        await asyncio.sleep(JOIN_DELAY_SEC)
    print(f'\nJoined: {len(joined)} / Failed: {len(failed)}')
    if failed:
        print('Failed channels:')
        for ch, err in failed:
            print(f'  @{ch}: {err}')
    await client.disconnect()
    return joined, failed


async def fetch_messages(client, channel: str, days: int) -> list[dict]:
    """Fetch last N days of messages from a channel."""
    cache_file = CACHE_DIR / f'{channel}.json'
    if cache_file.exists():
        try:
            return json.loads(cache_file.read_text())
        except Exception:
            pass

    since = datetime.now(timezone.utc) - timedelta(days=days)
    messages = []
    try:
        entity = await client.get_entity(channel)
        async for msg in client.iter_messages(entity, offset_date=None, limit=2000):
            if msg.date < since:
                break
            text = msg.message or ''
            if not text or len(text) < 10:
                continue
            coin = extract_coin(text)
            if not coin:
                continue
            messages.append({
                'ts': int(msg.date.timestamp()),
                'coin': coin,
                'text': text[:200],
            })
    except Exception as e:
        print(f'  ERR fetching @{channel}: {type(e).__name__} {str(e)[:80]}')
        return []
    cache_file.write_text(json.dumps(messages))
    return messages


def get_return(ex: ccxt.bybit, coin: str, ts_open: int, hours: int) -> float | None:
    """Fetch return % at `hours` after `ts_open` (epoch sec). Return None if unavailable."""
    symbol = f'{coin}/USDT:USDT'
    try:
        # Bybit 1h klines — fetch a window covering open + hours
        ohlcv = ex.fetch_ohlcv(symbol, '1h', since=ts_open * 1000, limit=hours + 2)
        if len(ohlcv) < hours + 1:
            return None
        entry_price = ohlcv[0][1]  # open of first candle after signal
        exit_price = ohlcv[hours][4]  # close of N-th candle
        if entry_price <= 0:
            return None
        return ((exit_price / entry_price) - 1) * 100
    except Exception:
        return None


async def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'help'

    if cmd in ('join', 'both'):
        print('=== JOINING CHANNELS ===')
        await join_channels()
        if cmd == 'join':
            return

    if cmd in ('backtest', 'both'):
        print('=== BACKTESTING ===')
        client = TelegramClient(StringSession(TELEGRAM_SESSION), int(TELEGRAM_API_ID), TELEGRAM_API_HASH)
        await client.start()

        ex = ccxt.bybit({'options': {'defaultType': 'linear'}})
        ex.has['fetchCurrencies'] = False
        ex.load_markets()
        valid_coins = {m.split('/')[0] for m in ex.markets if '/USDT:USDT' in m}

        results = {}
        for ch in CANDIDATES:
            print(f'\n[FETCH] @{ch} ...')
            msgs = await fetch_messages(client, ch, LOOKBACK_DAYS)
            print(f'  {len(msgs)} messages with coin mentions')
            if not msgs:
                results[ch] = {'n_msgs': 0, 'n_signals': 0, 'avg_ret_1h': None, 'avg_ret_4h': None, 'wr_4h': None}
                continue
            # Backtest each signal
            rets_1h = []
            rets_4h = []
            n_valid = 0
            for m in msgs:
                if m['coin'] not in valid_coins:
                    continue
                r1 = get_return(ex, m['coin'], m['ts'], 1)
                r4 = get_return(ex, m['coin'], m['ts'], 4)
                if r1 is not None:
                    rets_1h.append(r1); n_valid += 1
                if r4 is not None:
                    rets_4h.append(r4)
            avg_1h = sum(rets_1h) / len(rets_1h) if rets_1h else None
            avg_4h = sum(rets_4h) / len(rets_4h) if rets_4h else None
            wr_4h = (sum(1 for r in rets_4h if r > 0) / len(rets_4h) * 100) if rets_4h else None
            results[ch] = {
                'n_msgs': len(msgs),
                'n_signals': n_valid,
                'avg_ret_1h': round(avg_1h, 3) if avg_1h is not None else None,
                'avg_ret_4h': round(avg_4h, 3) if avg_4h is not None else None,
                'wr_4h': round(wr_4h, 1) if wr_4h is not None else None,
            }
            print(f'  n_signals={n_valid}  avg_1h={results[ch]["avg_ret_1h"]}%  avg_4h={results[ch]["avg_ret_4h"]}%  WR4h={results[ch]["wr_4h"]}%')

        OUTPUT.write_text(json.dumps(results, indent=2))
        await client.disconnect()

        print('\n=== RANKING (by avg_ret_4h descending) ===')
        ranked = sorted(results.items(), key=lambda x: -(x[1].get('avg_ret_4h') or -999))
        print('Recommend ENABLE if: n_signals>=5 AND avg_ret_4h>0.3% AND wr_4h>=55%')
        print()
        print(f'{"channel":25s} n_msg n_sig avg_1h  avg_4h  WR4h')
        print('-' * 70)
        for ch, r in ranked:
            print(f'{ch:25s} {r["n_msgs"]:4d}  {r["n_signals"]:4d}  '
                  f'{(r["avg_ret_1h"] or 0):+5.2f}%  {(r["avg_ret_4h"] or 0):+5.2f}%  '
                  f'{(r["wr_4h"] or 0):4.0f}%')
        print(f'\nSaved to: {OUTPUT}')

    if cmd == 'help' or cmd not in ('join', 'backtest', 'both'):
        print(__doc__)


if __name__ == '__main__':
    asyncio.run(main())
