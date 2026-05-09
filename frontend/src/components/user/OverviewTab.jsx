import React, { useEffect, useState } from 'react';
import { useLang } from '@/lib/LangContext';

const API = (path) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}` },
}).then(r => r.ok ? r.json() : Promise.reject(r.status));

function StatCard({ label, value, sub, accent }) {
  const topBorder = accent === 'green' ? '2px solid var(--accent-green)'
                  : accent === 'red'   ? '2px solid var(--accent-red)'
                  : '1px solid var(--border-subtle)';
  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderTop: topBorder,
        borderRadius: 12,
        padding: 24,
        transition: 'border-color 200ms ease, transform 200ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
    >
      <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

function SkeletonRow({ cols }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '12px 0' }}>
          <div style={{ height: 12, background: 'var(--bg3)', width: '80%', animation: 'pulse 1.5s ease-in-out infinite' }} />
        </td>
      ))}
    </tr>
  );
}

function priceDp(v) {
  if (!v) return 4;
  if (v >= 10000) return 1;
  if (v >= 100) return 2;
  return 4;
}

export default function OverviewTab() {
  const { t } = useLang();
  const [me,      setMe]      = useState(null);
  const [summary, setSummary] = useState(null);
  const [pnl30,   setPnl30]   = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      API('/api/users/me'),
      API('/api/users/bot-summary'),
      API('/api/users/closed-pnl?days=30'),
    ]).then(([me, summary, pnl30]) => {
      setMe(me);
      setSummary(summary);
      setPnl30(pnl30);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const balance       = summary?.balance;
  const positions     = summary?.positions ?? [];
  const recentTrades  = (pnl30?.trades ?? []).slice(0, 8);
  const pnl30Val      = pnl30?.total_pnl ?? 0;
  const winRate       = pnl30?.win_rate ?? 0;
  const planLabel     = me?.plan === 'pro' ? 'PRO' : 'FREE';
  const hasApiKeys    = me?.has_api_keys;

  return (
    <div>
      {/* Plan badge */}
      {me && (
        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.12em', padding: '3px 8px', border: '1px solid var(--border)', color: 'var(--muted-fg)' }}>
            {planLabel}
          </span>
          {!hasApiKeys && (
            <span style={{ fontSize: 12, color: 'var(--muted-fg)' }}>
              {t.dashboard.overview.noApiKeysPrefix}{' '}
              <a href="#" onClick={e => { e.preventDefault(); window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'api' })); }}
                style={{ color: 'var(--fg)', textDecoration: 'underline' }}>
                {t.dashboard.overview.connectBybit}
              </a>{' '}
              {t.dashboard.overview.toStartTrading}
            </span>
          )}
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 40 }}>
        <StatCard
          label="Wallet Balance"
          value={loading ? '—' : balance ? `$${balance.wallet.toFixed(2)}` : '—'}
          sub={balance ? `Equity $${balance.equity.toFixed(2)}` : null}
          accent={balance?.wallet > 0 ? 'green' : undefined}
        />
        <StatCard
          label="Open Positions"
          value={loading ? '—' : positions.length}
          sub={positions.length > 0
            ? `${(summary?.total_unrealized ?? 0) >= 0 ? '+' : ''}${(summary?.total_unrealized ?? 0).toFixed(2)} USDT unrealized`
            : null}
        />
        <StatCard
          label="30d PnL"
          value={loading ? '—' : `${pnl30Val >= 0 ? '+' : ''}${pnl30Val.toFixed(2)} USDT`}
          sub={pnl30 ? `${pnl30.total_trades} trades` : null}
          accent={pnl30Val > 0 ? 'green' : pnl30Val < 0 ? 'red' : undefined}
        />
        <StatCard
          label={t.dashboard.overview.winRate}
          value={loading ? '—' : `${winRate}%`}
          sub={pnl30 ? `${pnl30.wins}W / ${pnl30.losses}L` : null}
          accent={winRate >= 50 ? 'green' : undefined}
        />
      </div>

      {/* Open positions */}
      {positions.length > 0 && (
        <>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12, fontFamily: 'var(--font-mono)' }}>
            Open Positions
          </div>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden', marginBottom: 32, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
                  {['Symbol', 'Side', 'Lev', 'Entry', 'Mark', 'Unrealized PnL', 'ROE%', 'SL', 'TP', 'Liq'].map((h, i) => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map((p, i) => {
                  const isLong   = p.side === 'LONG';
                  const isProfit = (p.unrealized_pnl ?? 0) >= 0;
                  return (
                    <tr key={i}
                      style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 150ms ease' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      <td style={{ padding: '14px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>{p.symbol}</td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: isLong ? 'var(--accent-green)' : 'var(--accent-red)' }}>{p.side}</td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', color: '#888' }}>{p.leverage ?? '—'}×</td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', color: '#999' }}>{p.entry_price?.toFixed(priceDp(p.entry_price)) ?? '—'}</td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', color: '#999' }}>{p.mark_price?.toFixed(priceDp(p.mark_price)) ?? '—'}</td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: isProfit ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {isProfit ? '+' : ''}{(p.unrealized_pnl ?? 0).toFixed(2)}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', color: isProfit ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {isProfit ? '+' : ''}{p.pnl_pct ?? '—'}%
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', color: p.stop_loss ? 'var(--accent-red)' : '#333' }}>
                        {p.stop_loss?.toFixed(priceDp(p.stop_loss)) ?? '—'}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', color: p.take_profit ? 'var(--accent-green)' : '#333' }}>
                        {p.take_profit?.toFixed(priceDp(p.take_profit)) ?? '—'}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right', color: p.liq_price ? 'rgba(255,77,109,0.5)' : '#333' }}>
                        {p.liq_price?.toFixed(priceDp(p.liq_price)) ?? '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Recent closed trades */}
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12, fontFamily: 'var(--font-mono)' }}>
        Recent Closed Trades (30d)
      </div>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
              {['Symbol', 'Side', 'Entry', 'Exit', 'PnL', 'Date'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? [1,2,3].map(i => <SkeletonRow key={i} cols={6} />) : (
              recentTrades.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '48px 20px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 12px', opacity: 0.4 }}>
                    <path d="M3 3v18h18M7 14l4-4 4 4 5-5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{hasApiKeys ? 'No closed trades in last 30 days' : t.dashboard.overview.noTrades}</div>
                </td></tr>
              ) : recentTrades.map((tr, i) => {
                const closedMs  = parseInt(tr.closed_at);
                const closedStr = closedMs
                  ? new Date(closedMs).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' })
                  : '—';
                const isLong = tr.side === 'Buy';
                return (
                  <tr key={i}
                    style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 150ms ease' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <td style={{ padding: '14px 16px', color: 'var(--text-primary)', fontWeight: 600 }}>{tr.symbol}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: isLong ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {isLong ? 'LONG' : 'SHORT'}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{tr.entry_price?.toFixed(4) ?? '—'}</td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-secondary)' }}>{tr.exit_price?.toFixed(4) ?? '—'}</td>
                    <td style={{ padding: '14px 16px', fontWeight: 600, color: tr.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {tr.pnl >= 0 ? '+' : ''}{tr.pnl}
                    </td>
                    <td style={{ padding: '14px 16px', color: 'var(--text-muted)', fontSize: 11 }}>{closedStr}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
    </div>
  );
}
