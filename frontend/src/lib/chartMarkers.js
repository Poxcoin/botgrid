const C_UP = '#0ecb81';
const C_DN = '#f6465d';

const norm = s => (s || '').toUpperCase().replace(/[/_\-]/g, '');

const CRYPTO = {
  sym:    t => (t.symbol || '').split('/')[0].replace(/USDT$/, ''),
  side:   t => (t.side || '').toUpperCase(),
  openT:  t => t.opened_at,
  closeT: t => t.closed_at,
  pnl:    t => parseFloat(t.pnl ?? 0),
  isOpen: t => !t.closed_at,
  parseT: t => Math.trunc(new Date(t).getTime() / 1000),
  id:     t => t.id ?? t.signal_id,
};

const MACRO = {
  sym:    t => t.symbol,
  side:   t => (t.direction || t.side || '').toUpperCase(),
  openT:  t => t.open_time,
  closeT: t => t.close_time,
  pnl:    t => parseFloat(t.profit_usd ?? 0),
  isOpen: t => t.status === 'open' || !t.close_time,
  parseT: t => Math.trunc(Date.parse(t) / 1000),
  id:     t => t.ticket ?? t.id,
};

export function buildTradeMarkers(trades, bars, symbol, kind = 'crypto') {
  if (!bars?.length || !trades?.length) return [];
  const m = kind === 'macro' ? MACRO : CRYPTO;
  const firstT = bars[0].time;
  const lastT  = bars[bars.length - 1].time;
  const target = norm(symbol);
  const markers = [];

  for (const tr of trades) {
    if (norm(m.sym(tr)) !== target) continue;
    const side   = m.side(tr);
    const isLong = side === 'LONG' || side === 'BUY';

    const openT = m.openT(tr);
    if (openT) {
      const ts = m.parseT(openT);
      if (ts >= firstT && ts <= lastT) {
        markers.push({
          time: ts,
          position: isLong ? 'belowBar' : 'aboveBar',
          color: isLong ? C_UP : C_DN,
          shape: isLong ? 'arrowUp' : 'arrowDown',
          text: isLong ? 'B' : 'S',
          size: 1.5,
          id: `entry-${m.id(tr) ?? ts}`,
        });
      }
    }

    const closeT = m.closeT(tr);
    if (closeT && !m.isOpen(tr)) {
      const ts = m.parseT(closeT);
      if (ts >= firstT && ts <= lastT) {
        const p = m.pnl(tr);
        markers.push({
          time: ts,
          position: isLong ? 'aboveBar' : 'belowBar',
          color: p >= 0 ? C_UP : C_DN,
          shape: 'circle',
          text: `${p >= 0 ? '+' : ''}$${p.toFixed(1)}`,
          size: 1,
          id: `exit-${m.id(tr) ?? ts}`,
        });
      }
    }
  }

  return markers.sort((a, b) => a.time - b.time);
}
