import React, { useEffect, useState } from 'react';
import { useLang } from '@/lib/LangContext';

const API = (path) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}` },
}).then(r => r.ok ? r.json() : Promise.reject(r.status));

function StatCard({ label, value, sub, color }) {
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
      <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em', color: color || 'var(--text-primary)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>{sub}</div>}
    </div>
  );
}

function SkeletonRow({ cols = 6 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '12px 0' }}>
          <div className="shimmer" style={{ height: 12, width: '80%', borderRadius: 3 }} />
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
  const [data, setData] = useState(null);          // /api/data — balance + latest signals
  const [breakdown, setBreakdown] = useState(null); // /api/analytics/breakdown — per-bot PnL
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      API('/api/users/me'),
      API('/api/users/trades?limit=200'),
      API('/api/users/pnl'),
      API('/api/data').catch(() => null),
      API('/api/analytics/breakdown').catch(() => null),
    ]).then(([me, trades, pnl, data, breakdown]) => {
      setMe(me);
      setTrades(Array.isArray(trades) ? trades : []);
      setPnl(Array.isArray(pnl) ? pnl : []);
      setData(data);
      setBreakdown(breakdown);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const currentMonth = pnl[0] || {};
  const openTrades = trades.filter(tr => tr.status === 'open');
  const closedTrades = trades.filter(tr => tr.status === 'closed' && tr.pnl_usdt != null);
  const wins = closedTrades.filter(tr => tr.pnl_usdt > 0).length;
  const winRate = closedTrades.length ? Math.round(wins / closedTrades.length * 100) : 0;
  const planLabel = me?.plan ? me.plan.toUpperCase() : 'FREE';
  const balance = data?.balance ?? null;
  const byBot = breakdown?.by_bot ?? [];

  const ov = t.dashboard.overview;
  const sec = t.dashboard.security;

  const headers = [t.dashboard.hSymbol, t.dashboard.hSide, t.dashboard.hSource, t.dashboard.hEntry, t.dashboard.hPnL, t.dashboard.hStatus];
  const botHeaders = [
    t.dashboard.analytics.hSource,
    t.dashboard.analytics.hTrades,
    t.dashboard.analytics.hWinRate,
    t.dashboard.analytics.hPnlUsdt,
  ];

  function goToTab(id) {
    window.dispatchEvent(new CustomEvent('switch-tab', { detail: id }));
  }

  return (
    <div>
      {/* Connection status banner */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
        padding: '16px 20px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: me?.has_api_keys ? 'var(--accent-green)' : 'var(--accent-amber)',
            boxShadow: me?.has_api_keys ? '0 0 8px rgba(0,212,170,0.6)' : '0 0 8px rgba(245,158,11,0.5)',
          }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            {me?.has_api_keys ? sec.connected : sec.notConnected}
          </span>
          {me?.has_api_keys && me?.api_key_testnet && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', padding: '2px 8px', border: '1px solid var(--border-default)', borderRadius: 4 }}>
              {sec.testnetTag}
            </span>
          )}
        </div>
        <span style={{ fontSize: 11, letterSpacing: '0.12em', padding: '3px 10px', border: '1px solid var(--border-default)', borderRadius: 100, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          {planLabel}
        </span>
        {!me?.has_api_keys && (
          <button
            onClick={() => goToTab('api-keys')}
            style={{
              marginLeft: 'auto',
              background: 'var(--text-primary)', color: 'var(--bg-base)', border: 'none',
              padding: '8px 18px', borderRadius: 4,
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em',
              textTransform: 'uppercase', fontWeight: 700, cursor: 'pointer',
            }}
          >
            {ov.connectBybit}
          </button>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 32 }}>
        <StatCard
          label={t.dashboard.bot.balance}
          value={loading ? '—' : (balance ? `$${balance.total.toFixed(2)}` : '—')}
          sub={balance ? `${t.dashboard.bot.free} $${balance.free.toFixed(2)}` : null}
        />
        <StatCard
          label={ov.monthlyPnl}
          value={loading ? '—' : `${currentMonth.net_pnl >= 0 ? '+' : ''}${(currentMonth.net_pnl || 0).toFixed(2)} USDT`}
          color={(currentMonth.net_pnl ?? 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
          sub={currentMonth.performance_fee ? `${ov.fee}: ${currentMonth.performance_fee.toFixed(2)} USDT` : null}
        />
        <StatCard
          label={ov.openPositions}
          value={loading ? '—' : openTrades.length}
        />
        <StatCard
          label={ov.winRate}
          value={loading ? '—' : `${winRate}%`}
          sub={`${closedTrades.length} ${ov.closedTrades}`}
        />
      </div>

      {/* Per-bot PnL */}
      {!loading && byBot.length > 0 && (
        <>
          <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12, fontFamily: 'var(--font-mono)' }}>
            {t.dashboard.analytics.byBotSource}
          </div>
          <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden', marginBottom: 32 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
                    {botHeaders.map((h, i) => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: i === 0 ? 'left' : 'right', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byBot.map((b, i) => {
                    const wr = b.trades ? Math.round((b.wins / b.trades) * 100) : 0;
                    const pnlPos = (b.pnl ?? 0) >= 0;
                    return (
                      <tr key={i}
                        style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 150ms ease' }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <td style={{ padding: '12px 16px', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{b.source || '—'}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-primary)' }}>{b.trades}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-primary)' }}>{wr}%</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', color: pnlPos ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700 }}>
                          {pnlPos ? '+' : ''}{(b.pnl ?? 0).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Active signals table */}
      <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12, fontFamily: 'var(--font-mono)' }}>{ov.activeSignals}</div>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
       <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-default)' }}>
              {headers.map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-muted)', fontWeight: 500, textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? [1,2,3].map(i => <SkeletonRow key={i} cols={6} />) : (
              trades.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: '48px 20px', color: 'var(--text-muted)', fontSize: 13, textAlign: 'center' }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 12px', opacity: 0.4 }}>
                    <path d="M3 3v18h18M7 14l4-4 4 4 5-5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{ov.noTrades}</div>
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
      </div>
    </div>
  );
}
