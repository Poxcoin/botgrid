import React, { useState, useEffect, useCallback } from 'react';
import { useLang } from '@/lib/LangContext';

const S = {
  bg:       '#060606',
  border:   'rgba(255,255,255,0.06)',
  borderHi: 'rgba(255,255,255,0.15)',
  fg:       '#fff',
  muted:    '#555',
  dim:      '#333',
  blue:     '#0047FF',
  green:    '#22c55e',
  red:      '#ef4444',
  card:     'rgba(255,255,255,0.03)',
  mono:     "'Courier New','SF Mono',monospace",
};

function getToken() {
  return localStorage.getItem('kado_token') || '';
}

function pct(wins, total) {
  if (!total) return '—';
  return (wins / total * 100).toFixed(1) + '%';
}

function fmtDate(ts) {
  if (!ts) return '—';
  return ts.slice(0, 10);
}

function Skeleton({ w = '100%', h = 18, style = {} }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 3,
      background: 'rgba(255,255,255,0.06)',
      animation: 'kado-skeleton 1.4s ease-in-out infinite',
      ...style,
    }} />
  );
}

function SummaryCard({ label, value, sub, color, accent }) {
  // accent: 'green' | 'red' | undefined → top border color
  const topBorder = accent === 'green' ? '2px solid var(--accent-green)'
                  : accent === 'red'   ? '2px solid var(--accent-red)'
                  : '1px solid var(--border-subtle)';
  return (
    <div
      style={{
        flex: 1, minWidth: 160,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderTop: topBorder,
        borderRadius: 12,
        padding: 24,
        transition: 'border-color 200ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
    >
      <div style={{ fontFamily: S.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
        {label}
      </div>
      <div style={{ fontFamily: S.mono, fontSize: 30, fontWeight: 700, color: color || 'var(--text-primary)', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: S.mono, fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 }}>{sub}</div>
      )}
    </div>
  );
}

function SectionHeader({ title, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: `1px solid ${S.border}`, paddingBottom: 10, marginBottom: 16,
    }}>
      <div style={{ fontFamily: S.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: S.muted }}>
        {title}
      </div>
      {right && <div style={{ fontFamily: S.mono, fontSize: 10, color: S.muted }}>{right}</div>}
    </div>
  );
}

function BotTable({ rows, t }) {
  if (!rows || !rows.length) {
    return <div style={{ fontFamily: S.mono, fontSize: 11, color: S.muted }}>{t.dashboard.analytics.noData}</div>;
  }
  const cols = [
    { key: 'source',   label: t.dashboard.analytics.hSource,  align: 'left' },
    { key: 'trades',   label: t.dashboard.analytics.hTrades,  align: 'right' },
    { key: '_wr',      label: t.dashboard.analytics.hWinRate, align: 'right' },
    { key: 'pnl',      label: t.dashboard.analytics.hPnlUsdt, align: 'right' },
    { key: 'avg_win',  label: t.dashboard.analytics.hAvgWin,  align: 'right' },
    { key: 'avg_loss', label: t.dashboard.analytics.hAvgLoss, align: 'right' },
  ];
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: S.mono, fontSize: 11 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key} style={{
                textAlign: c.align, padding: '6px 12px',
                borderBottom: `1px solid ${S.border}`,
                color: S.muted, fontWeight: 400, letterSpacing: '0.1em', fontSize: 9, textTransform: 'uppercase',
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const wr = pct(r.wins, r.trades);
            const pnlColor = r.pnl >= 0 ? S.green : S.red;
            return (
              <tr key={i} style={{ borderBottom: `1px solid ${S.border}` }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '9px 12px', color: S.fg, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{r.source || '—'}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: S.fg }}>{r.trades}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: S.fg }}>{wr}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: pnlColor, fontWeight: 600 }}>
                  {r.pnl >= 0 ? '+' : ''}{r.pnl}
                </td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: S.green }}>{r.avg_win > 0 ? '+' + r.avg_win : r.avg_win}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: S.red }}>{r.avg_loss}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CoinTable({ rows, t }) {
  const [sortKey, setSortKey] = useState('pnl');
  const [sortDir, setSortDir] = useState(-1);

  if (!rows || !rows.length) {
    return <div style={{ fontFamily: S.mono, fontSize: 11, color: S.muted }}>{t.dashboard.analytics.noData}</div>;
  }

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => -d);
    else { setSortKey(key); setSortDir(-1); }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? 0;
    const bv = b[sortKey] ?? 0;
    if (typeof av === 'string') return sortDir * av.localeCompare(bv);
    return sortDir * (av - bv);
  });

  const cols = [
    { key: 'coin',  label: t.dashboard.analytics.hCoin,    align: 'left' },
    { key: 'trades', label: t.dashboard.analytics.hTrades, align: 'right' },
    { key: '_wr',   label: t.dashboard.analytics.hWinRate, align: 'right', noSort: true },
    { key: 'pnl',   label: t.dashboard.analytics.hPnlUsdt, align: 'right' },
  ];

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: S.mono, fontSize: 11 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key}
                onClick={!c.noSort ? () => toggleSort(c.key) : undefined}
                style={{
                  textAlign: c.align, padding: '6px 12px',
                  borderBottom: `1px solid ${S.border}`,
                  color: sortKey === c.key ? S.fg : S.muted,
                  fontWeight: 400, letterSpacing: '0.1em', fontSize: 9, textTransform: 'uppercase',
                  cursor: c.noSort ? 'default' : 'pointer',
                  userSelect: 'none',
                }}>
                {c.label}{!c.noSort && sortKey === c.key ? (sortDir === -1 ? ' ▼' : ' ▲') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const wr = pct(r.wins, r.trades);
            const pnlColor = r.pnl >= 0 ? S.green : S.red;
            return (
              <tr key={i} style={{ borderBottom: `1px solid ${S.border}` }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '9px 12px', color: S.fg, fontWeight: 600 }}>{r.coin || '—'}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: S.fg }}>{r.trades}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: S.fg }}>{wr}</td>
                <td style={{ padding: '9px 12px', textAlign: 'right', color: pnlColor, fontWeight: 600 }}>
                  {r.pnl >= 0 ? '+' : ''}{r.pnl}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DailyChart({ daily, t }) {
  const [hover, setHover] = React.useState(null);

  if (!daily || !daily.length) {
    return <div style={{ fontFamily: S.mono, fontSize: 11, color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>{t.dashboard.analytics.noData30}</div>;
  }

  const W = 720;
  const H = 220;
  const PAD_L = 56;
  const PAD_R = 16;
  const PAD_T = 20;
  const PAD_B = 36;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const pnls = daily.map(d => d.pnl);
  const maxAbs = Math.max(...pnls.map(Math.abs), 0.01);

  const barW = Math.max(3, Math.floor(chartW / daily.length) - 3);
  const step = chartW / daily.length;
  const yZero = PAD_T + chartH / 2;
  const yAxisVals = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];

  return (
    <div style={{ position: 'relative', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 12, padding: 16 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', display: 'block', fontFamily: S.mono }}
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setHover(null)}
      >
        {/* Grid lines (dashed) */}
        {yAxisVals.map((v, i) => {
          const y = PAD_T + chartH / 2 - (v / maxAbs) * (chartH / 2);
          const isZero = v === 0;
          return (
            <g key={i}>
              <line
                x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
                stroke={isZero ? 'var(--border-default)' : 'var(--border-subtle)'}
                strokeWidth={isZero ? 1 : 0.6}
                strokeDasharray={isZero ? '0' : '3 4'}
              />
              <text x={PAD_L - 8} y={y + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)">
                {isZero ? '0' : (v > 0 ? '+' : '') + v.toFixed(0)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {daily.map((d, i) => {
          const x = PAD_L + i * step + (step - barW) / 2;
          const norm = d.pnl / maxAbs;
          const barH = Math.abs(norm) * (chartH / 2);
          const positive = d.pnl >= 0;
          const y = positive ? yZero - barH : yZero;
          const color = positive ? 'var(--accent-green)' : 'var(--accent-red)';
          const isHovered = hover === i;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} style={{ cursor: 'pointer' }}>
              {/* Hit-area transparent rect for easier hover */}
              <rect x={x - 2} y={PAD_T} width={barW + 4} height={chartH} fill="transparent" />
              <rect
                x={x} y={y} width={barW} height={Math.max(barH, 1)}
                fill={color}
                opacity={isHovered ? 1 : 0.78}
                rx={2}
              />
              {i % Math.max(1, Math.floor(daily.length / 6)) === 0 && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
                  {d.date ? d.date.slice(5) : ''}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hover != null && daily[hover] && (
        <div style={{
          position: 'absolute',
          left: `${((PAD_L + hover * step + step / 2) / W) * 100}%`,
          top: 8,
          transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 8,
          padding: '8px 12px',
          fontSize: 11,
          fontFamily: S.mono,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            {daily[hover].date}
          </div>
          <div style={{ color: daily[hover].pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700, fontSize: 13 }}>
            {daily[hover].pnl >= 0 ? '+' : ''}{daily[hover].pnl.toFixed(2)} USDT
          </div>
        </div>
      )}
    </div>
  );
}

function TradesList({ trades, title, color }) {
  if (!trades || !trades.length) {
    return null;
  }
  return (
    <div style={{ flex: 1, minWidth: 220 }}>
      <SectionHeader title={title} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {trades.map((tr, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 12px',
            border: `1px solid ${S.border}`,
            background: S.card,
          }}>
            <div>
              <span style={{ fontFamily: S.mono, fontSize: 11, color: S.fg, fontWeight: 600 }}>{tr.coin}</span>
              <span style={{ fontFamily: S.mono, fontSize: 9, color: S.muted, marginLeft: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {tr.action} · {tr.source}
              </span>
              <div style={{ fontFamily: S.mono, fontSize: 9, color: S.muted, marginTop: 2 }}>
                {fmtDate(tr.ts)}
              </div>
            </div>
            <div style={{ fontFamily: S.mono, fontSize: 13, fontWeight: 700, color }}>
              {tr.pnl >= 0 ? '+' : ''}{tr.pnl}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsTab() {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/analytics/breakdown', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div style={{ color: S.fg }}>
        <style>{`@keyframes kado-skeleton { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
        <div style={{ display: 'flex', gap: 12, marginBottom: 32, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ flex: 1, minWidth: 140, border: `1px solid ${S.border}`, padding: '18px 20px', background: S.card }}>
              <Skeleton w={60} h={10} style={{ marginBottom: 14 }} />
              <Skeleton w={100} h={28} />
            </div>
          ))}
        </div>
        <Skeleton h={200} style={{ marginBottom: 32 }} />
        <Skeleton h={160} style={{ marginBottom: 32 }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: S.mono, fontSize: 12, color: S.red, padding: '40px 0' }}>
        <div style={{ marginBottom: 12, letterSpacing: '0.08em' }}>{t.dashboard.analytics.errorPrefix} {error}</div>
        <button onClick={fetchData} style={{
          background: 'none', border: `1px solid ${S.border}`, color: S.muted,
          fontFamily: S.mono, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
          padding: '7px 16px', cursor: 'pointer',
        }}>
          {t.dashboard.analytics.retry}
        </button>
      </div>
    );
  }

  const { summary, by_bot, by_coin, daily, best, worst } = data || {};

  const winRate = summary?.total_trades
    ? pct(summary.wins, summary.total_trades)
    : '—';

  const bestDay = daily?.length
    ? daily.reduce((a, b) => (b.pnl > a.pnl ? b : a), daily[0])
    : null;

  const pnlColor = (summary?.total_pnl ?? 0) >= 0 ? S.green : S.red;

  return (
    <div style={{ color: S.fg }}>
      <style>{`@keyframes kado-skeleton { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 32 }}>
        <SummaryCard
          label={t.dashboard.analytics.totalTrades}
          value={summary?.total_trades ?? 0}
          sub={
            <span>
              <span style={{ color: 'var(--accent-green)' }}>{summary?.wins ?? 0}W</span>
              <span style={{ color: 'var(--text-muted)' }}> / </span>
              <span style={{ color: 'var(--accent-red)' }}>{summary?.losses ?? 0}L</span>
            </span>
          }
        />
        <SummaryCard
          label={t.dashboard.analytics.totalPnl}
          value={`${(summary?.total_pnl ?? 0) >= 0 ? '+' : ''}${summary?.total_pnl ?? 0} USDT`}
          color={(summary?.total_pnl ?? 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
          accent={(summary?.total_pnl ?? 0) >= 0 ? 'green' : 'red'}
          sub={`${t.dashboard.analytics.since} ${fmtDate(summary?.first_trade)}`}
        />
        <SummaryCard
          label={t.dashboard.analytics.winRate}
          value={winRate}
          accent={parseFloat(winRate) >= 50 ? 'green' : undefined}
          sub={`${summary?.wins ?? 0} ${t.dashboard.analytics.wins}`}
        />
        <SummaryCard
          label={t.dashboard.analytics.bestDay}
          value={bestDay ? `+${bestDay.pnl}` : '—'}
          color="var(--accent-green)"
          accent="green"
          sub={bestDay?.date ?? ''}
        />
      </div>

      <div style={{ marginBottom: 32 }}>
        <SectionHeader title={t.dashboard.analytics.dailyPnl30} right={`${daily?.length ?? 0} ${t.dashboard.analytics.days}`} />
        <DailyChart daily={daily} t={t} />
      </div>

      <div style={{ marginBottom: 32 }}>
        <SectionHeader title={t.dashboard.analytics.byBotSource} right={`${by_bot?.length ?? 0} ${t.dashboard.analytics.sources}`} />
        <BotTable rows={by_bot} t={t} />
      </div>

      <div style={{ marginBottom: 32 }}>
        <SectionHeader title={t.dashboard.analytics.byCoin} right={`${by_coin?.length ?? 0} · ${t.dashboard.analytics.coinsSort}`} />
        <CoinTable rows={by_coin} t={t} />
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
        <TradesList trades={best}  title={t.dashboard.analytics.topBest}  color={S.green} />
        <TradesList trades={worst} title={t.dashboard.analytics.topWorst} color={S.red} />
      </div>

      <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${S.border}` }}>
        <button onClick={fetchData} style={{
          background: 'none', border: `1px solid ${S.border}`, color: S.muted,
          fontFamily: S.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
          padding: '8px 20px', cursor: 'pointer', transition: 'border-color 150ms, color 150ms',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = S.borderHi; e.currentTarget.style.color = S.fg; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = S.border; e.currentTarget.style.color = S.muted; }}
        >
          {t.dashboard.refresh}
        </button>
      </div>
    </div>
  );
}
