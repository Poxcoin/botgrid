import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createChart } from 'lightweight-charts';
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
        {trades.map((tr, i) => {
          const closedMs = parseInt(tr.closed_at);
          const dateStr  = closedMs ? new Date(closedMs).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) : '—';
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px',
              border: `1px solid ${S.border}`,
              background: S.card,
            }}>
              <div>
                <span style={{ fontFamily: S.mono, fontSize: 11, color: S.fg, fontWeight: 600 }}>{tr.coin}</span>
                <span style={{ fontFamily: S.mono, fontSize: 9, color: S.muted, marginLeft: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {tr.side === 'Buy' ? 'LONG' : 'SHORT'}
                </span>
                <div style={{ fontFamily: S.mono, fontSize: 9, color: S.muted, marginTop: 2 }}>{dateStr}</div>
              </div>
              <div style={{ fontFamily: S.mono, fontSize: 13, fontWeight: 700, color }}>
                {tr.pnl >= 0 ? '+' : ''}{tr.pnl}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CoinChart({ coins, allTrades }) {
  const [selectedCoin, setSelectedCoin] = useState(() => {
    if (!coins || !coins.length) return null;
    const hasBtc = coins.find(c => c.coin === 'BTC');
    return hasBtc ? 'BTC' : coins[0].coin;
  });
  const [klines, setKlines] = useState([]);
  const [klineLoading, setKlineLoading] = useState(false);
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!coins || !coins.length) return;
    const hasBtc = coins.find(c => c.coin === 'BTC');
    setSelectedCoin(hasBtc ? 'BTC' : coins[0].coin);
  }, [coins]);

  useEffect(() => {
    if (!selectedCoin) return;
    const load = (initial = false) => {
      if (initial) { setKlineLoading(true); setKlines([]); }
      fetch(`https://api.bybit.com/v5/market/kline?symbol=${selectedCoin}USDT&interval=D&limit=90`)
        .then(r => r.json())
        .then(json => {
          const list = json?.result?.list;
          if (!list) return;
          const candles = [...list].reverse().map(row => ({
            time: Math.floor(parseInt(row[0]) / 1000),
            open:  parseFloat(row[1]),
            high:  parseFloat(row[2]),
            low:   parseFloat(row[3]),
            close: parseFloat(row[4]),
          }));
          setKlines(candles);
        })
        .catch(() => {})
        .finally(() => { if (initial) setKlineLoading(false); });
    };
    load(true);
    const id = setInterval(() => load(false), 60000);
    return () => clearInterval(id);
  }, [selectedCoin]);

  useEffect(() => {
    if (!chartContainerRef.current || klines.length === 0) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      autoSize: true,
      height: 280,
      layout: {
        background: { color: '#060606' },
        textColor: '#555',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(255,255,255,0.2)' },
        horzLine: { color: 'rgba(255,255,255,0.2)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
      },
    });

    const series = chart.addCandlestickSeries({
      upColor:        '#22c55e',
      downColor:      '#ef4444',
      borderUpColor:  '#22c55e',
      borderDownColor:'#ef4444',
      wickUpColor:    '#22c55e',
      wickDownColor:  '#ef4444',
    });

    series.setData(klines);

    const coinTrades = (allTrades || []).filter(
      t => (t.symbol || '').split('/')[0].replace('USDT', '') === selectedCoin
    );

    const markers = [];
    coinTrades.forEach(tr => {
      const ts = tr.closed_at ? new Date(tr.closed_at) : null;
      if (!ts || isNaN(ts)) return;
      const dateStr = ts.toISOString().slice(0, 10);
      const isLong  = tr.side === 'LONG';

      markers.push({
        time:     dateStr,
        position: 'belowBar',
        color:    isLong ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)',
        shape:    'arrowUp',
        text:     isLong ? '▲ Entry' : '▼ Entry',
      });

      markers.push({
        time:     dateStr,
        position: 'aboveBar',
        color:    isLong ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)',
        shape:    'arrowDown',
        text:     'Exit',
      });
    });

    markers.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    if (markers.length) series.setMarkers(markers);

    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
    };
  }, [klines, allTrades, selectedCoin]);

  if (!coins || !coins.length) return null;

  const visibleCoins = coins.slice(0, 6);

  return (
    <div style={{ marginBottom: 32 }}>
      <SectionHeader title="Coin Charts" right={selectedCoin ? `${selectedCoin}USDT · 90D` : ''} />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {visibleCoins.map(c => {
          const active = c.coin === selectedCoin;
          return (
            <button
              key={c.coin}
              onClick={() => setSelectedCoin(c.coin)}
              style={{
                background:   'none',
                border:       `1px solid ${active ? 'rgba(255,255,255,0.5)' : S.border}`,
                color:        active ? S.fg : S.muted,
                fontFamily:   S.mono,
                fontSize:     10,
                letterSpacing:'0.12em',
                textTransform:'uppercase',
                padding:      '5px 12px',
                cursor:       'pointer',
                borderRadius: 4,
                transition:   'border-color 150ms, color 150ms',
              }}
              onMouseEnter={e => {
                if (!active) {
                  e.currentTarget.style.borderColor = S.borderHi;
                  e.currentTarget.style.color = S.fg;
                }
              }}
              onMouseLeave={e => {
                if (!active) {
                  e.currentTarget.style.borderColor = S.border;
                  e.currentTarget.style.color = S.muted;
                }
              }}
            >
              {c.coin}
            </button>
          );
        })}
      </div>

      <div style={{
        position:   'relative',
        background: '#060606',
        border:     `1px solid ${S.border}`,
        borderRadius: 8,
        overflow:   'hidden',
      }}>
        {klineLoading && (
          <div style={{
            position:   'absolute',
            inset:       0,
            display:    'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: S.mono,
            fontSize:   11,
            color:      S.muted,
            zIndex:     10,
            background: '#060606',
          }}>
            Loading chart...
          </div>
        )}
        <div ref={chartContainerRef} style={{ width: '100%', height: 280 }} />
      </div>
    </div>
  );
}

export default function AnalyticsTab() {
  const { t } = useLang();
  const [data,      setData]      = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [allTrades, setAllTrades] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };
      const [analyticsRes, tradesRes] = await Promise.all([
        fetch('/api/users/analytics', { headers }),
        fetch('/api/users/closed-pnl?days=90', { headers }),
      ]);
      if (!analyticsRes.ok) throw new Error(`HTTP ${analyticsRes.status}`);
      const json = await analyticsRes.json();
      setData(json);
      if (tradesRes.ok) {
        const tradesJson = await tradesRes.json();
        setAllTrades(tradesJson.trades || []);
      }
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

  const { summary, by_coin, daily, best, worst } = data || {};
  const hasKey = data?.has_key ?? false;
  const noData = data !== null
    && (summary?.total_trades ?? 0) === 0
    && !daily?.length
    && !by_coin?.length;

  const winRate = summary?.total_trades
    ? pct(summary.wins, summary.total_trades)
    : '—';

  const bestDay = daily?.length
    ? daily.reduce((a, b) => (b.pnl > a.pnl ? b : a), daily[0])
    : null;

  const totalPnl = summary?.total_pnl ?? 0;

  if (noData && !hasKey) {
    return (
      <div style={{ color: S.fg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: S.mono, fontSize: 11, color: S.muted, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>
          No API key connected
        </div>
        <div style={{ fontFamily: S.mono, fontSize: 12, color: '#333', marginBottom: 28, lineHeight: 1.6 }}>
          Connect your Bybit API key to see personal analytics —<br />balance, PnL, trade history and coin breakdown.
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'api-keys' }))}
          style={{
            background: 'var(--text-primary)', color: 'var(--bg-base)',
            border: 'none', padding: '10px 24px',
            fontFamily: S.mono, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Add API Key →
        </button>
      </div>
    );
  }

  if (noData && hasKey) {
    return (
      <div style={{ color: S.fg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: S.mono, fontSize: 11, color: S.muted, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>
          No trades yet
        </div>
        <div style={{ fontFamily: S.mono, fontSize: 12, color: '#333', lineHeight: 1.6 }}>
          API key connected. Analytics will appear here once<br />the bot executes trades on your account.
        </div>
      </div>
    );
  }

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
          value={`${totalPnl >= 0 ? '+' : ''}${totalPnl} USDT`}
          color={totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
          accent={totalPnl >= 0 ? 'green' : 'red'}
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
        <SectionHeader
          title={t.dashboard.analytics.byBotSource}
          right={data?.by_source?.length ? `${data.by_source.length} ${t.dashboard.analytics.sources}` : ''}
        />
        <BotTable rows={data?.by_source ?? []} t={t} />
      </div>

      {by_coin && by_coin.length > 0 && (
        <CoinChart coins={by_coin} allTrades={allTrades} />
      )}

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
