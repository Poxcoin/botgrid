import React, { useEffect, useState } from 'react';

const MONO  = "'Courier New','SF Mono',monospace";
const B     = 'rgba(255,255,255,0.06)';
const MUTED = '#555';

const api = p =>
  fetch(p, { headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}` } })
    .then(r => r.ok ? r.json() : null)
    .catch(() => null);

function StatBox({ label, value, color }) {
  return (
    <div style={{
      flex: 1, background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderTop: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12, padding: '20px 22px',
    }}>
      <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: MONO, marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: MONO, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</div>
    </div>
  );
}

function NoKeyBanner() {
  return (
    <div style={{ border: `1px solid ${B}`, padding: '32px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: '#ccc', marginBottom: 6 }}>No MT5 account connected</div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, lineHeight: 1.6 }}>
          Connect your IC Markets MT5 credentials to see live stats and trade history.
        </div>
      </div>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'api-keys' }))}
        style={{
          background: 'var(--text-primary)', color: 'var(--bg-base)',
          border: 'none', padding: '9px 20px', fontFamily: MONO,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0,
        }}
      >
        Add MT5 Account →
      </button>
    </div>
  );
}

export default function MacroBotTab({ botId }) {
  const [stats,  setStats]  = useState(null);
  const [trades, setTrades] = useState([]);
  const [mt5,    setMt5]    = useState(undefined);

  useEffect(() => {
    Promise.all([
      api('/api/macro/stats?days=30'),
      api('/api/macro/trades?limit=100'),
      api('/api/users/mt5-keys'),
    ]).then(([s, t, m]) => {
      setStats(s || {});
      setTrades(Array.isArray(t) ? t : []);
      setMt5(m || null);
    });
  }, []);

  const isGold   = botId === 'gold';
  const symbols  = isGold ? ['XAUUSD'] : ['EURUSD', 'GBPUSD'];
  const filtered = trades.filter(t => symbols.includes(t.symbol));
  const closed   = filtered.filter(t => t.status === 'closed');

  const wins    = closed.filter(t => t.profit_usd > 0).length;
  const netPnl  = closed.reduce((acc, t) => acc + (t.profit_usd || 0), 0);
  const winRate = closed.length ? Math.round(wins / closed.length * 100) : null;

  const title   = isGold ? 'Gold Event Bot' : 'Macro Forex Bot';
  const desc    = isGold
    ? 'XAUUSD · MT5 · IC Markets'
    : 'EURUSD · GBPUSD · MT5 · IC Markets';

  if (mt5 === undefined) return null;

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>
          {desc}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
          {title}
        </div>
      </div>

      {!mt5 && <NoKeyBanner />}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatBox label="Trades (30d)" value={closed.length || '—'} />
        <StatBox
          label="Win Rate"
          value={winRate != null ? `${winRate}%` : '—'}
          color={winRate != null ? (winRate >= 50 ? '#ccc' : '#888') : undefined}
        />
        <StatBox
          label="Net PnL (USD)"
          value={closed.length ? `${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)}` : '—'}
          color={netPnl > 0 ? '#ccc' : netPnl < 0 ? '#888' : undefined}
        />
        <StatBox label="Strategy" value="Event" />
      </div>

      {/* Trades table */}
      <div style={{ border: `1px solid ${B}`, marginBottom: 24 }}>
        <div style={{ padding: '0 20px', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${B}` }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: MUTED }}>Recent Trades</span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: '#333', letterSpacing: '0.12em' }}>MT5 · IC MARKETS</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontFamily: MONO, fontSize: 11, color: MUTED }}>
            No trades yet — bot waits for economic events (CPI, NFP, FOMC)
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${B}` }}>
                  {['Symbol', 'Event', 'Dir', 'Pips', 'USD', 'Time'].map((h, i) => (
                    <th key={h} style={{
                      textAlign: i === 0 ? 'left' : 'right', padding: '8px 16px',
                      fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase',
                      color: MUTED, fontWeight: 400,
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 30).map((t, i) => {
                  const pos = t.profit_usd > 0;
                  const dt  = t.close_time || t.open_time;
                  const dtStr = dt ? new Date(dt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
                  return (
                    <tr key={i}
                      style={{ borderBottom: `1px solid rgba(255,255,255,0.025)` }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 16px', color: '#ccc', fontWeight: 700 }}>{t.symbol}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: '#888', fontSize: 10 }}>{t.event || '—'}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: t.direction === 'LONG' ? '#aaa' : '#666' }}>{t.direction}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: '#888' }}>
                        {t.profit_pips != null ? `${t.profit_pips > 0 ? '+' : ''}${t.profit_pips}` : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: pos ? '#ccc' : '#888' }}>
                        {t.profit_usd != null ? `${pos ? '+' : ''}${t.profit_usd.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: MUTED, fontSize: 10 }}>{dtStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info footer */}
      <div style={{ fontFamily: MONO, fontSize: 10, color: '#333', letterSpacing: '0.08em', lineHeight: 1.8 }}>
        Event-driven · SL 15 pips · TP 20 pips · 20min auto-exit · R:R 1.33:1
      </div>
    </div>
  );
}
