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

function SummaryCard({ label, value, sub, color }) {
  return (
    <div style={{
      flex: 1, minWidth: 140,
      border: `1px solid ${S.border}`,
      padding: '18px 20px',
      background: S.card,
    }}>
      <div style={{ fontFamily: S.mono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: S.muted, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ fontFamily: S.mono, fontSize: 22, fontWeight: 700, color: color || S.fg, letterSpacing: '-0.01em' }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: S.mono, fontSize: 10, color: S.muted, marginTop: 6 }}>{sub}</div>
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
  if (!daily || !daily.length) {
    return <div style={{ fontFamily: S.mono, fontSize: 11, color: S.muted }}>{t.dashboard.analytics.noData30}</div>;
  }

  const W = 640;
  const H = 120;
  const PAD_L = 52;
  const PAD_R = 12;
  const PAD_T = 12;
  const PAD_B = 28;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const pnls = daily.map(d => d.pnl);
  const maxAbs = Math.max(...pnls.map(Math.abs), 0.01);

  const barW = Math.max(2, Math.floor(chartW / daily.length) - 2);
  const step = chartW / daily.length;

  const yZero = PAD_T + chartH / 2;

  const yAxisVals = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', maxWidth: W, display: 'block', fontFamily: S.mono }}
        preserveAspectRatio="xMidYMid meet"
      >
        {yAxisVals.map((v, i) => {
          const y = PAD_T + chartH / 2 - (v / maxAbs) * (chartH / 2);
          return (
            <g key={i}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
                stroke={v === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'}
                strokeWidth={v === 0 ? 1 : 0.5} />
              <text x={PAD_L - 6} y={y + 4} textAnchor="end"
                fontSize={8} fill={S.muted}>
                {v === 0 ? '0' : (v > 0 ? '+' : '') + v.toFixed(0)}
              </text>
            </g>
          );
        })}

        {daily.map((d, i) => {
          const x = PAD_L + i * step + (step - barW) / 2;
          const norm = d.pnl / maxAbs;
          const barH = Math.abs(norm) * (chartH / 2);
          const y = d.pnl >= 0 ? yZero - barH : yZero;
          const color = d.pnl >= 0 ? S.green : S.red;
          return (
            <g key={i}>
              <rect x={x} y={y} width={barW} height={Math.max(barH, 1)}
                fill={color} opacity={0.85} rx={1} />
              {i % Math.max(1, Math.floor(daily.length / 6)) === 0 && (
                <text x={x + barW / 2} y={H - 4} textAnchor="middle"
                  fontSize={7} fill={S.muted}>
                  {d.date ? d.date.slice(5) : ''}
                </text>
              )}
            </g>
          );
        })}
      </svg>
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

      <div style={{ display: 'flex', gap: 10, marginBottom: 32, flexWrap: 'wrap' }}>
        <SummaryCard
          label={t.dashboard.analytics.totalTrades}
          value={summary?.total_trades ?? 0}
          sub={`${summary?.wins ?? 0}W / ${summary?.losses ?? 0}L`}
        />
        <SummaryCard
          label={t.dashboard.analytics.totalPnl}
          value={`${(summary?.total_pnl ?? 0) >= 0 ? '+' : ''}${summary?.total_pnl ?? 0} USDT`}
          color={pnlColor}
          sub={`${t.dashboard.analytics.since} ${fmtDate(summary?.first_trade)}`}
        />
        <SummaryCard
          label={t.dashboard.analytics.winRate}
          value={winRate}
          color={S.fg}
          sub={`${summary?.wins ?? 0} ${t.dashboard.analytics.wins}`}
        />
        <SummaryCard
          label={t.dashboard.analytics.bestDay}
          value={bestDay ? `+${bestDay.pnl}` : '—'}
          color={S.green}
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
