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

      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {headers.map(h => (
              <th key={h} style={{ padding: '8px 0', textAlign: 'left', fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted-fg)', fontWeight: 400, textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            [1,2,3,4,5].map(i => (
              <tr key={i}>
                {[1,2,3,4,5,6,7,8].map(j => (
                  <td key={j} style={{ padding: '12px 0' }}>
                    <div style={{ height: 11, background: 'var(--bg3)', width: '70%', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  </td>
                ))}
              </tr>
            ))
          ) : filtered.length === 0 ? (
            <tr><td colSpan={8} style={{ padding: '40px 0', color: 'var(--muted-fg)', textAlign: 'center' }}>{t.dashboard.trades.noTrades}</td></tr>
          ) : filtered.map(tr => (
            <tr key={tr.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 0', color: 'var(--muted-fg)', fontSize: 11 }}>
                {tr.opened_at ? new Date(tr.opened_at).toLocaleDateString() : '—'}
              </td>
              <td style={{ padding: '12px 0' }}>{tr.symbol.replace('/USDT:USDT', '')}</td>
              <td style={{ padding: '12px 0', fontWeight: 600, color: tr.side === 'LONG' ? 'var(--fg)' : 'var(--muted-fg)' }}>{tr.side}</td>
              <td style={{ padding: '12px 0', color: 'var(--muted-fg)', textTransform: 'uppercase', fontSize: 11 }}>{tr.source}</td>
              <td style={{ padding: '12px 0' }}>{tr.entry_price?.toFixed(4) ?? '—'}</td>
              <td style={{ padding: '12px 0' }}>{tr.exit_price?.toFixed(4) ?? '—'}</td>
              <td style={{ padding: '12px 0', opacity: tr.pnl_usdt == null ? 0.4 : 1 }}>
                {tr.pnl_usdt != null ? `${tr.pnl_usdt >= 0 ? '+' : ''}${tr.pnl_usdt.toFixed(2)}` : '—'}
              </td>
              <td style={{ padding: '12px 0', color: 'var(--muted-fg)', fontSize: 11, textTransform: 'uppercase' }}>{tr.status}</td>
            </tr>
          ))}
        </tbody>
      </table>

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
