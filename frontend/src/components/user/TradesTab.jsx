import React, { useEffect, useMemo, useState } from 'react';
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
  grid:        'Grid',
  news:        'Signal',
  signal:      'Signal',
  fr:          'Funding',
  fr_extreme:  'FR Extreme',
  listing:     'Sniper',
  altcoin:     'Altcoin',
  orderflow:   'Orderflow',
  cascade:     'Cascade',
  liq_cascade: 'Cascade',
  sweep:       'Sweep',
  ob:          'Order Block',
  orderblock:  'Order Block',
  macro:       'Macro',
  dex:         'DEX',
  whale:       'Whale',
  sniper:      'Sniper',
  bybit:       'Bybit',
  other:       'Other',
};

const LANG_LOCALE = { en: 'en-US', es: 'es-ES', uk: 'uk-UA', ru: 'ru-RU', de: 'de-DE', zh: 'zh-CN' };

function exportCSV(trades) {
  const hdr = ['Date', 'Symbol', 'Bot', 'Side', 'Entry Price', 'Exit Price', 'Qty', 'PnL (USDT)'];
  const rows = trades.map(tr => {
    const ms = parseInt(tr.closed_at);
    const date = ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : '';
    return [
      date,
      tr.symbol,
      BOT_LABELS[tr.source] ?? tr.source ?? '',
      tr.side,
      tr.entry_price ?? '',
      tr.exit_price ?? '',
      tr.qty ?? '',
      parseFloat(tr.pnl ?? 0).toFixed(2),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  const csv = [hdr.join(','), ...rows].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `kado_trades_${new Date().toISOString().slice(0,10)}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export default function TradesTab() {
  const { t, lang } = useLang();
  const locale = LANG_LOCALE[lang] || 'en-US';
  const [data,       setData]      = useState(null);
  const [loading,    setLoading]   = useState(true);
  const [days,       setDays]      = useState(30);
  const [filterSide, setFilterSide] = useState('ALL');
  const [filterSrc,  setFilterSrc]  = useState('ALL');
  const [search,     setSearch]    = useState('');
  const [sortCol,    setSortCol]   = useState('date');
  const [sortAsc,    setSortAsc]   = useState(false);

  useEffect(() => {
    setLoading(true);
    API(`/api/users/closed-pnl?days=${days}`)
      .then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [days]);

  const allTrades = data?.trades ?? [];
  const availableSrcs = [...new Set(allTrades.map(t => t.source).filter(Boolean))].sort();

  const toggleSort = (col) => {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(false); }
  };

  const trades = useMemo(() => {
    const filtered = allTrades
      .filter(tr => filterSide === 'ALL' || tr.side === filterSide)
      .filter(tr => filterSrc  === 'ALL' || tr.source === filterSrc)
      .filter(tr => !search || tr.symbol.includes(search.toUpperCase()));
    return [...filtered].sort((a, b) => {
      let av, bv;
      if (sortCol === 'date')   { av = parseInt(a.closed_at) || 0; bv = parseInt(b.closed_at) || 0; }
      else if (sortCol === 'pnl')    { av = parseFloat(a.pnl) || 0; bv = parseFloat(b.pnl) || 0; }
      else if (sortCol === 'symbol') { av = a.symbol || ''; bv = b.symbol || ''; return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av); }
      else return 0;
      return sortAsc ? av - bv : bv - av;
    });
  }, [allTrades, filterSide, filterSrc, search, sortCol, sortAsc]);

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
            {' '}· WR{' '}
            <span style={{ color: data.win_rate >= 50 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>
              {data.win_rate}%
            </span>
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
        {trades.length > 0 && (
          <button onClick={() => exportCSV(trades)}
            style={{ ...btnBase, marginLeft: 'auto', flexShrink: 0 }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            ↓ CSV
          </button>
        )}
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
              {[
                { label: 'Date',   col: 'date' },
                { label: 'Symbol', col: 'symbol' },
                { label: 'Bot',    col: null },
                { label: 'Side',   col: null },
                { label: 'Entry',  col: null },
                { label: 'Exit',   col: null },
                { label: 'Qty',    col: null },
                { label: 'Dur',    col: null },
                { label: 'PnL',    col: 'pnl' },
              ].map(({ label, col }) => (
                <th key={label}
                  onClick={col ? () => toggleSort(col) : undefined}
                  style={{
                    padding: '12px 16px', textAlign: 'left', fontSize: 10, letterSpacing: '0.12em',
                    color: col && sortCol === col ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: 500, textTransform: 'uppercase', whiteSpace: 'nowrap',
                    cursor: col ? 'pointer' : 'default', userSelect: 'none',
                  }}
                >
                  {label}{col && sortCol === col ? (sortAsc ? ' ↑' : ' ↓') : col ? ' ·' : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              [1,2,3,4,5].map(i => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  {[1,2,3,4,5,6,7,8,9].map(j => (
                    <td key={j} style={{ padding: '14px 16px' }}>
                      <div className="shimmer" style={{ height: 11, width: '70%', borderRadius: 3 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : trades.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: '48px 20px', color: 'var(--text-muted)', textAlign: 'center' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 12px', opacity: 0.4 }}>
                  <path d="M3 3v18h18M7 14l4-4 4 4 5-5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>No closed trades in this period</div>
              </td></tr>
            ) : trades.map((tr, i) => {
              const closedMs  = parseInt(tr.closed_at);
              const closedStr = closedMs
                ? new Date(closedMs).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: '2-digit' })
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
                  <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: 11 }}>{(() => {
                    const o = parseInt(tr.opened_at), c = parseInt(tr.closed_at);
                    if (!o || !c || c <= o) return '—';
                    const m = Math.round((c - o) / 60000);
                    if (m < 60) return `${m}m`;
                    if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`;
                    return `${Math.floor(m / 1440)}d`;
                  })()}</td>
                  <td style={{ padding: '14px 16px', fontWeight: 600, color: tr.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {tr.pnl >= 0 ? '+' : ''}{parseFloat(tr.pnl)?.toFixed(2) ?? '—'}
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
