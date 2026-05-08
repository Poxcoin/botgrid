import React, { useEffect, useState } from 'react';
import { useLang } from '@/lib/LangContext';

const API = (path) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}` },
}).then(r => r.ok ? r.json() : Promise.reject(r.status));

const SOURCES = ['all', 'news', 'fr', 'listing', 'grid', 'whale'];
const STATUSES = ['all', 'open', 'closed', 'failed'];

export default function TradesTab() {
  const { t } = useLang();
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [source, setSource] = useState('all');
  const [status, setStatus] = useState('all');
  const LIMIT = 50;

  useEffect(() => {
    setLoading(true);
    API(`/api/users/trades?limit=${LIMIT}&offset=${offset}`)
      .then(setTrades).catch(console.error).finally(() => setLoading(false));
  }, [offset]);

  const filtered = trades.filter(tr =>
    (source === 'all' || tr.source === source) &&
    (status === 'all' || tr.status === status)
  );

  const sel = { background: 'none', border: '1px solid var(--border)', color: 'var(--fg)', fontSize: 12, padding: '5px 10px', cursor: 'pointer', fontFamily: 'var(--font-sans)' };

  const headers = [t.dashboard.hDate, t.dashboard.hSymbol, t.dashboard.hSide, t.dashboard.hSource, t.dashboard.hEntry, t.dashboard.hExit, t.dashboard.hPnL, t.dashboard.hStatus];

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <select value={source} onChange={e => setSource(e.target.value)} style={sel}>
          {SOURCES.map(s => <option key={s} value={s}>{s === 'all' ? t.dashboard.trades.allSources : s.toUpperCase()}</option>)}
        </select>
        <select value={status} onChange={e => setStatus(e.target.value)} style={sel}>
          {STATUSES.map(s => <option key={s} value={s}>{s === 'all' ? t.dashboard.trades.allStatuses : s}</option>)}
        </select>
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
              {headers.map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>{h}</th>
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
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} style={{ padding: '48px 20px', color: 'var(--text-muted)', textAlign: 'center' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 12px', opacity: 0.4 }}>
                  <path d="M3 3v18h18M7 14l4-4 4 4 5-5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{t.dashboard.trades.noTrades}</div>
              </td></tr>
            ) : filtered.map(tr => (
              <tr key={tr.id}
                style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 150ms ease' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: 11 }}>
                  {tr.opened_at ? new Date(tr.opened_at).toLocaleDateString() : '—'}
                </td>
                <td style={{ padding: '14px 16px', color: 'var(--text-primary)' }}>{tr.symbol.replace('/USDT:USDT', '')}</td>
                <td style={{ padding: '14px 16px', fontWeight: 600, color: tr.side === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)' }}>{tr.side}</td>
                <td style={{ padding: '14px 16px', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 11 }}>{tr.source}</td>
                <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{tr.entry_price?.toFixed(4) ?? '—'}</td>
                <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{tr.exit_price?.toFixed(4) ?? '—'}</td>
                <td style={{ padding: '14px 16px', fontWeight: 600, color: tr.pnl_usdt == null ? 'var(--text-muted)' : tr.pnl_usdt >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {tr.pnl_usdt != null ? `${tr.pnl_usdt >= 0 ? '+' : ''}${tr.pnl_usdt.toFixed(2)}` : '—'}
                </td>
                <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{tr.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={() => setOffset(Math.max(0, offset - LIMIT))} disabled={offset === 0}
          style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted-fg)', padding: '6px 14px', fontSize: 12, cursor: 'pointer', opacity: offset === 0 ? 0.3 : 1 }}>
          {t.dashboard.prev}
        </button>
        <button onClick={() => setOffset(offset + LIMIT)} disabled={trades.length < LIMIT}
          style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted-fg)', padding: '6px 14px', fontSize: 12, cursor: 'pointer', opacity: trades.length < LIMIT ? 0.3 : 1 }}>
          {t.dashboard.next}
        </button>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
    </div>
  );
}
