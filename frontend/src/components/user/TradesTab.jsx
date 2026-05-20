import React, { useEffect, useState } from 'react';
import { useLang } from '@/lib/LangContext';

const API = (path) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}` },
}).then(r => r.ok ? r.json() : Promise.reject(r.status));

const PERIODS = [
  { label: '7d',   days: 7 },
  { label: '30d',  days: 30 },
  { label: '90d',  days: 90 },
  { label: '180d', days: 180 },
  { label: 'All',  days: 0 },
];

const BOT_LABELS = {
  grid:       'Grid',
  news:       'Signal',
  signal:     'Signal',
  fr:         'Funding',
  fr_extreme: 'FR Extreme',
  listing:    'Sniper',
  altcoin:    'Altcoin',
  orderflow:  'Orderflow',
  cascade:    'Cascade',
  liq_cascade:'Cascade',
  sweep:      'Sweep',
  ob:         'Order Block',
  orderblock: 'Order Block',
  macro:      'Macro',
  dex:        'DEX',
  bybit:      'Bybit',
  other:      'Other',
};

export default function TradesTab() {
  const { t } = useLang();
  const [data,       setData]      = useState(null);
  const [loading,    setLoading]   = useState(true);
  const [days,       setDays]      = useState(30);
  const [filterSide, setFilterSide] = useState('ALL');
  const [filterSrc,  setFilterSrc]  = useState('ALL');
  const [search,     setSearch]    = useState('');

  useEffect(() => {
    setLoading(true);
    API(`/api/users/closed-pnl?days=${days}`)
      .then(setData).catch(console.error).finally(() => setLoading(false));
  }, [days]);

  const allTrades = data?.trades ?? [];
  const availableSrcs = [...new Set(allTrades.map(t => t.source).filter(Boolean))].sort();
  const trades = allTrades
    .filter(tr => filterSide === 'ALL' || tr.side === filterSide)
    .filter(tr => filterSrc  === 'ALL' || tr.source === filterSrc)
    .filter(tr => !search || tr.symbol.includes(search.toUpperCase()));

  const btnBase = {
    background: 'none', border: '1px solid var(--border-subtle)',
    color: 'var(--text-muted)', fontSize: 11, padding: '5px 14px',
    cursor: 'pointer', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em',
    transition: 'border-color 150ms, color 150ms',
  };
  const activeBtn = { borderColor: 'var(--border-default)', color: 'var(--text-primary)' };

  return (
    <div>
      {/* Period filter + summary */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        {PERIODS.map(p => (
          <button key={p.days} onClick={() => setDays(p.days)}
            style={{ ...btnBase, ...(days === p.days ? activeBtn : {}) }}>
            {p.label}
          </button>
        ))}
        {data && (
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
            {data.total_trades} trades ·{' '}
            <span style={{ color: data.total_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>
              {data.total_pnl >= 0 ? '+' : ''}{data.total_pnl} USDT
            </span>
            {' '}· WR {data.win_rate}%
          </span>
        )}
      </div>

      {/* Filters row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {['ALL', 'LONG', 'SHORT'].map(s => (
          <button key={s} onClick={() => setFilterSide(s)}
            style={{ ...btnBase, ...(filterSide === s ? { ...activeBtn, ...(s === 'LONG' ? { borderColor: 'var(--accent-green)', color: 'var(--accent-green)' } : s === 'SHORT' ? { borderColor: 'var(--accent-red)', color: 'var(--accent-red)' } : {}) } : {}) }}>
            {s}
          </button>
        ))}
        <div style={{ width: 1, height: 18, background: 'var(--border-subtle)', margin: '0 4px' }} />
        {['ALL', ...availableSrcs].map(s => (
          <button key={s} onClick={() => setFilterSrc(s)}
            style={{ ...btnBase, ...(filterSrc === s ? activeBtn : {}) }}>
            {s === 'ALL' ? 'All Bots' : (BOT_LABELS[s] || s)}
          </button>
        ))}
        <div style={{ width: 1, height: 18, background: 'var(--border-subtle)', margin: '0 4px' }} />
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search coin…"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 6,
            color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: 11,
            padding: '5px 12px', outline: 'none', width: 130 }}
        />
        {trades.length !== allTrades.length && (
          <span style={{ marginLeft: 4, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
            {trades.length} / {allTrades.length}
          </span>
        )}
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
              {['Date', 'Symbol', 'Bot', 'Side', 'Entry', 'Exit', 'Qty', 'PnL'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1,2,3,4,5].map(i => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {[1,2,3,4,5,6,7,8].map(j => (
                    <td key={j} style={{ padding: '14px 16px' }}>
                      <div className="shimmer" style={{ height: 11, width: '70%', borderRadius: 3 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : trades.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '48px 20px', color: 'var(--text-muted)', textAlign: 'center' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 12px', opacity: 0.4 }}>
                  <path d="M3 3v18h18M7 14l4-4 4 4 5-5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>No closed trades in this period</div>
              </td></tr>
            ) : trades.map((tr, i) => {
              const closedMs  = parseInt(tr.closed_at);
              const closedStr = closedMs
                ? new Date(closedMs).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' })
                : '—';
              const isLong = tr.side === 'LONG';
              const srcLabel = BOT_LABELS[tr.source] ?? tr.source ?? '—';
              return (
                <tr key={i}
                  style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 150ms ease' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>{closedStr}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>{tr.symbol}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', letterSpacing: '0.06em' }}>
                      {srcLabel}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: isLong ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {isLong ? 'LONG' : 'SHORT'}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{tr.entry_price?.toFixed(4) ?? '—'}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{tr.exit_price?.toFixed(4) ?? '—'}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: 11 }}>{tr.qty?.toFixed(2)}</td>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: tr.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {tr.pnl >= 0 ? '+' : ''}{tr.pnl}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <style>{`@keyframes shimmer { 0%,100%{opacity:.3} 50%{opacity:.7} } .shimmer{animation:shimmer 1.5s ease-in-out infinite;background:var(--border-subtle);}`}</style>
    </div>
  );
}
