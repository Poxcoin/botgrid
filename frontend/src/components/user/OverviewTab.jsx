import React, { useEffect, useState } from 'react';
import { useLang } from '@/lib/LangContext';

const API = (path) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}` },
}).then(r => r.ok ? r.json() : Promise.reject(r.status));

function StatCard({ label, value, sub }) {
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: 24,
        transition: 'border-color 200ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
    >
      <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {[1,2,3,4,5,6].map(i => (
        <td key={i} style={{ padding: '12px 0' }}>
          <div style={{ height: 12, background: 'var(--bg3)', width: '80%', animation: 'pulse 1.5s ease-in-out infinite' }} />
        </td>
      ))}
    </tr>
  );
}

export default function OverviewTab() {
  const { t } = useLang();
  const [me, setMe] = useState(null);
  const [trades, setTrades] = useState([]);
  const [pnl, setPnl] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      API('/api/users/me'),
      API('/api/users/trades?limit=10'),
      API('/api/users/pnl'),
    ]).then(([me, trades, pnl]) => {
      setMe(me); setTrades(trades); setPnl(pnl);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const currentMonth = pnl[0] || {};
  const openTrades = trades.filter(t => t.status === 'open');
  const closedTrades = trades.filter(t => t.status === 'closed' && t.pnl_usdt != null);
  const wins = closedTrades.filter(t => t.pnl_usdt > 0).length;
  const winRate = closedTrades.length ? Math.round(wins / closedTrades.length * 100) : 0;
  const planLabel = me?.plan === 'pro' ? 'PRO' : 'FREE';

  const headers = [t.dashboard.hSymbol, t.dashboard.hSide, t.dashboard.hSource, t.dashboard.hEntry, t.dashboard.hPnL, t.dashboard.hStatus];

  return (
    <div>
      {/* Plan badge */}
      {me && (
        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.12em', padding: '3px 8px', border: '1px solid var(--border)', color: 'var(--muted-fg)' }}>
            {planLabel}
          </span>
          {!me.has_api_keys && (
            <span style={{ fontSize: 12, color: 'var(--muted-fg)' }}>
              {t.dashboard.overview.noApiKeysPrefix} <a href="#" onClick={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'api' })); }} style={{ color: 'var(--fg)', textDecoration: 'underline' }}>{t.dashboard.overview.connectBybit}</a> {t.dashboard.overview.toStartTrading}
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 40 }}>
        <StatCard
          label={t.dashboard.overview.monthlyPnl}
          value={loading ? '—' : `${currentMonth.net_pnl >= 0 ? '+' : ''}${(currentMonth.net_pnl || 0).toFixed(2)} USDT`}
          sub={currentMonth.performance_fee ? `${t.dashboard.overview.fee}: ${currentMonth.performance_fee.toFixed(2)} USDT` : null}
        />
        <StatCard label={t.dashboard.overview.openPositions} value={loading ? '—' : openTrades.length} />
        <StatCard
          label={t.dashboard.overview.winRate}
          value={loading ? '—' : `${winRate}%`}
          sub={`${closedTrades.length} ${t.dashboard.overview.closedTrades}`}
        />
        <StatCard label={t.dashboard.overview.performanceFee} value={loading ? '—' : `${(currentMonth.performance_fee || 0).toFixed(2)} USDT`} sub={t.dashboard.overview.feeOf20} />
      </div>

      {/* Active signals table */}
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12, fontFamily: 'var(--font-mono)' }}>{t.dashboard.overview.activeSignals}</div>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
              {headers.map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? [1,2,3].map(i => <SkeletonRow key={i} />) : (
              trades.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '48px 20px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 12px', opacity: 0.4 }}>
                    <path d="M3 3v18h18M7 14l4-4 4 4 5-5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{t.dashboard.overview.noTrades}</div>
                </td></tr>
              ) : trades.slice(0, 10).map(tr => (
                <tr key={tr.id}
                  style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 150ms ease' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style={{ padding: '14px 16px', color: 'var(--text-primary)' }}>{tr.symbol.replace('/USDT:USDT', '')}</td>
                  <td style={{ padding: '14px 16px', color: tr.side === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>{tr.side}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-muted)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.08em' }}>{tr.source}</td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{tr.entry_price ? tr.entry_price.toFixed(4) : '—'}</td>
                  <td style={{ padding: '14px 16px', color: tr.pnl_usdt > 0 ? 'var(--accent-green)' : tr.pnl_usdt < 0 ? 'var(--accent-red)' : 'var(--text-muted)', fontWeight: 600 }}>
                    {tr.pnl_usdt != null ? `${tr.pnl_usdt >= 0 ? '+' : ''}${tr.pnl_usdt.toFixed(2)}` : '—'}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase' }}>{tr.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
    </div>
  );
}
