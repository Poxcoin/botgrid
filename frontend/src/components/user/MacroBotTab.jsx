import React, { useEffect, useState } from 'react';
import { useLang } from '@/lib/LangContext';
import { StatCard, MONO, LOCALE_MAP, getToken } from './analytics/atoms';
import { EquityCurve } from './analytics/charts';

const B     = 'var(--border-subtle)';
const MUTED = 'var(--text-muted)';

const api = p =>
  fetch(p, { headers: { Authorization: `Bearer ${getToken()}` } })
    .then(r => r.ok ? r.json() : null)
    .catch(() => null);

/* ── no MT5 key banner ────────────────────────────────────────── */
function NoKeyBanner() {
  const { t } = useLang();
  const tm = t.dashboard.macro;
  return (
    <div style={{ border: `1px solid ${B}`, padding: '32px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-primary)', marginBottom: 6 }}>{tm.noMt5Title}</div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, lineHeight: 1.6 }}>
          {tm.noMt5Desc}
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
        {tm.addMt5Btn}
      </button>
    </div>
  );
}

/* ── main ─────────────────────────────────────────────────────── */
export default function MacroBotTab({ botId }) {
  const { t, lang } = useLang();
  const tm = t.dashboard.macro;
  const [trades, setTrades] = useState([]);
  const [stats,  setStats]  = useState(null);
  const [mt5,    setMt5]    = useState(undefined);

  useEffect(() => {
    Promise.all([
      api('/api/macro/trades?limit=100'),
      api('/api/macro/stats'),
      api('/api/users/mt5-keys'),
    ]).then(([tr, st, m]) => {
      setTrades(Array.isArray(tr) ? tr : []);
      setStats(st ?? null);
      setMt5(m ?? null);
    });
  }, []);

  const isGold   = botId === 'gold';
  const symbols  = isGold ? ['XAUUSD'] : ['EURUSD', 'GBPUSD'];
  const filtered = trades.filter(t => symbols.includes(t.symbol));
  const closed   = filtered.filter(t => t.status === 'closed');

  const wins    = closed.filter(t => t.profit_usd > 0).length;
  const netPnl  = closed.reduce((acc, t) => acc + (t.profit_usd || 0), 0);
  const winRate = closed.length ? Math.round(wins / closed.length * 100) : null;

  const pf = stats?.profit_factor;
  const pfStr = pf != null && isFinite(pf) ? pf.toFixed(2) : '—';

  const title = isGold ? tm.m2?.name : tm.m1?.name;
  const desc  = isGold ? tm.m2?.tag  : tm.m1?.tag;

  const mt5Configured = mt5?.configured === true;

  /* normalize for EquityCurve: { pnl, closed_at (ms as string) } */
  const curveData = closed
    .filter(t => t.close_time)
    .map(t => ({
      pnl:       t.profit_usd,
      closed_at: String(new Date(t.close_time).getTime()),
      side:      t.direction,
      symbol:    t.symbol,
    }));

  const locale = LOCALE_MAP[lang] || 'en-US';

  if (mt5 === undefined) return null;

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>{desc}</div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>{title}</div>
      </div>

      {!mt5Configured && <NoKeyBanner />}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard
          label={tm.statTrades}
          value={closed.length || '—'}
        />
        <StatCard
          label={tm.statWinRate}
          value={winRate != null ? `${winRate}%` : '—'}
          accent={winRate != null ? (winRate >= 50 ? 'pos' : 'neg') : null}
        />
        <StatCard
          label={tm.statNetPnl}
          value={closed.length ? `${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)}` : '—'}
          accent={netPnl > 0 ? 'pos' : netPnl < 0 ? 'neg' : null}
        />
        <StatCard
          label={tm.statStrategy}
          value={pfStr}
          sub="profit factor"
        />
      </div>

      {/* Equity curve */}
      {curveData.length >= 2 && (
        <div style={{ marginBottom: 24 }}>
          <EquityCurve trades={curveData} />
        </div>
      )}

      {/* Trades table */}
      <div style={{ border: `1px solid ${B}`, marginBottom: 24 }}>
        <div style={{ padding: '0 20px', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${B}` }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: MUTED }}>{tm.recentTrades}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: '0.12em' }}>MT5 · IC MARKETS</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontFamily: MONO, fontSize: 11, color: MUTED }}>
            {tm.noTradesYet}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${B}` }}>
                  {[tm.colSymbol, tm.colEvent, tm.colDir, tm.colPips, tm.colUsd, tm.colTime].map((h, i) => (
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
                  const pos   = t.profit_usd > 0;
                  const dt    = t.close_time || t.open_time;
                  const dtStr = dt
                    ? new Date(dt).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                    : '—';
                  return (
                    <tr key={i}
                      style={{ borderBottom: `1px solid ${B}` }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 700 }}>{t.symbol}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: 10 }}>{t.event || '—'}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: t.direction === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)' }}>{t.direction}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: MUTED }}>
                        {t.profit_pips != null ? `${t.profit_pips > 0 ? '+' : ''}${t.profit_pips}` : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: pos ? 'var(--accent-green)' : 'var(--accent-red)' }}>
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

      <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, letterSpacing: '0.08em', lineHeight: 1.8 }}>
        Event-driven · SL 20 pips · TP 35 pips · 25min auto-exit · R:R 1.75:1
      </div>
    </div>
  );
}
