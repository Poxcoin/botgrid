"""tools/paper_close_runner.py — periodically check paper trades for TP/SL hits."""
import sys, os
sys.path.insert(0, '/opt/botgrid')
os.chdir('/opt/botgrid')
from dotenv import load_dotenv
load_dotenv('/opt/botgrid/.env')

import ccxt
from modules.paper_trader import paper_check_and_close, stats_by_source

# Public Bybit client — no auth needed for mark price
_ex = ccxt.bybit({'enableRateLimit': True})
_ex.has['fetchCurrencies'] = False


def get_mark(symbol: str):
    """Symbol format: BTCUSDT (no slash). Returns last price or None."""
    try:
        # Normalize to ccxt format if needed
        if '/' not in symbol:
            # BTCUSDT → BTC/USDT:USDT
            sym = symbol.replace('USDT', '/USDT:USDT')
        else:
            sym = symbol
        t = _ex.fetch_ticker(sym, params={'category': 'linear'})
        return float(t.get('last') or 0)
    except Exception:
        return None


if __name__ == '__main__':
    closed = paper_check_and_close(get_mark)
    if closed:
        print(f'Closed {closed} paper trades')
    s = stats_by_source(14)
    for row in s:
        print(f"  {row['source']:12s} [{row['variant']:8s}]  n={row['n']:3d}  WR={row['wr']:.0f}%  total={row['total_pnl_pct']:+.2f}%")
