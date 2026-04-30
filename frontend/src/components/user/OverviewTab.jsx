import React, { useEffect, useState } from 'react';

const API = (path) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}` },
}).then(r => r.ok ? r.json() : Promise.reject(r.status));

function StatCard({ label, value, sub }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
      <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginTop: 4 }}>{sub}</div>}
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
              No API keys — <a href="#" onClick={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'api' })); }} style={{ color: 'var(--fg)', textDecoration: 'underline' }}>connect Bybit</a> to start trading
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0 40px', marginBottom: 40 }}>
        <StatCard label="Monthly PnL" value={loading ? '—' : `${currentMonth.net_pnl >= 0 ? '+' : ''}${(currentMonth.net_pnl || 0).toFixed(2)} USDT`} sub={currentMonth.performance_fee ? `Fee: ${currentMonth.performance_fee.toFixed(2)} USDT` : null} />
        <StatCard label="Open positions" value={loading ? '—' : openTrades.length} />
        <StatCard label="Win rate" value={loading ? '—' : `${winRate}%`} sub={`${closedTrades.length} closed trades`} />
        <StatCard label="Performance fee" value={loading ? '—' : `${(currentMonth.performance_fee || 0).toFixed(2)} USDT`} sub="20% of profit" />
      </div>

      {/* Active signals table */}
      <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 12 }}>Active signals</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {['Symbol', 'Side', 'Source', 'Entry', 'P&L', 'Status'].map(h => (
              <th key={h} style={{ padding: '8px 0', textAlign: 'left', fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted-fg)', fontWeight: 400, textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? [1,2,3].map(i => <SkeletonRow key={i} />) : (
            trades.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '32px 0', color: 'var(--muted-fg)', fontSize: 13, textAlign: 'center' }}>No trades yet</td></tr>
            ) : trades.slice(0, 10).map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '12px 0' }}>{t.symbol.replace('/USDT:USDT', '')}</td>
                <td style={{ padding: '12px 0', color: t.side === 'LONG' ? 'var(--fg)' : 'var(--muted-fg)', fontWeight: 600 }}>{t.side}</td>
                <td style={{ padding: '12px 0', color: 'var(--muted-fg)', textTransform: 'uppercase', fontSize: 11, letterSpacing: '0.08em' }}>{t.source}</td>
                <td style={{ padding: '12px 0' }}>{t.entry_price ? t.entry_price.toFixed(4) : '—'}</td>
                <td style={{ padding: '12px 0', color: t.pnl_usdt > 0 ? 'var(--fg)' : t.pnl_usdt < 0 ? 'var(--muted-fg)' : 'var(--muted-fg)' }}>
                  {t.pnl_usdt != null ? `${t.pnl_usdt >= 0 ? '+' : ''}${t.pnl_usdt.toFixed(2)}` : '—'}
                </td>
                <td style={{ padding: '12px 0', color: 'var(--muted-fg)', fontSize: 11, textTransform: 'uppercase' }}>{t.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
    </div>
  );
}
