import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLang } from '@/lib/LangContext';

const MONO = "var(--font-mono)";
const FONT = "var(--font-sans)";

const BOT_LABELS = {
  news: "Signal Bot", signal: "Signal Bot", altcoin: "Altcoin Bot",
  grid: "Grid Bot", fr: "Funding Rate", fr_extreme: "FR Extreme",
  cascade: "Cascade", liq_cascade: "Liq Cascade", macro: "Macro Forex",
  dex: "DEX Bot", whale: "Whale Tracker", listing: "CEX Sniper",
  orderflow: "Orderflow", sweep: "Liq Sweep", ob: "Order Block",
  orderblock: "Order Block", sniper: "CEX Sniper", bybit: "Bybit Import",
  other: "Other",
};

function getToken() {
  return localStorage.getItem('kado_token') || '';
}

function pct(wins, total) {
  if (!total) return '—';
  return (wins / total * 100).toFixed(1) + '%';
}

function StatCard({ label, value, sub }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, minWidth: 160,
        background: hovered ? 'var(--bg-elevated)' : 'var(--bg-base)',
        border: '1px solid var(--border-subtle)',
        padding: '28px 24px',
        transition: 'background 200ms',
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 14 }}>
        {label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>{sub}</div>
      )}
    </div>
  );
}

function SectionLabel({ title, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: '1px solid var(--border-subtle)', paddingBottom: 10, marginBottom: 16,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {title}
      </div>
      {right && <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)' }}>{right}</div>}
    </div>
  );
}

function DailyChart({ daily, t }) {
  const [hover, setHover] = React.useState(null);

  if (!daily || !daily.length) {
    return (
      <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>
        {t.dashboard.analytics.noData30}
      </div>
    );
  }

  const W = 720, H = 200;
  const PAD_L = 52, PAD_R = 16, PAD_T = 16, PAD_B = 32;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;
  const pnls = daily.map(d => d.pnl);
  const maxAbs = Math.max(...pnls.map(Math.abs), 0.01);
  const barW = Math.max(3, Math.floor(chartW / daily.length) - 3);
  const step = chartW / daily.length;
  const yZero = PAD_T + chartH / 2;
  const yAxisVals = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];

  return (
    <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', padding: 16, position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', display: 'block', fontFamily: MONO }}
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setHover(null)}
      >
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

        {daily.map((d, i) => {
          const x = PAD_L + i * step + (step - barW) / 2;
          const norm = d.pnl / maxAbs;
          const barH = Math.abs(norm) * (chartH / 2);
          const positive = d.pnl >= 0;
          const y = positive ? yZero - barH : yZero;
          const isHovered = hover === i;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} style={{ cursor: 'pointer' }}>
              <rect x={x - 2} y={PAD_T} width={barW + 4} height={chartH} fill="transparent" />
              <rect
                x={x} y={y} width={barW} height={Math.max(barH, 1)}
                fill={isHovered
                  ? (positive ? 'var(--accent-green)' : 'var(--accent-red)')
                  : (positive ? 'rgba(14,203,129,0.65)' : 'rgba(246,70,93,0.65)')}
                rx={1}
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

      {hover != null && daily[hover] && (
        <div style={{
          position: 'absolute',
          left: `${((PAD_L + hover * step + step / 2) / W) * 100}%`,
          top: 8,
          transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          padding: '8px 12px',
          fontSize: 11,
          fontFamily: MONO,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            {daily[hover].date}
          </div>
          <div style={{ color: daily[hover].pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700, fontSize: 13 }}>
            {daily[hover].pnl >= 0 ? '+' : ''}{daily[hover].pnl.toFixed(2)} USDT
          </div>
          {daily[hover].trades != null && (
            <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 2 }}>
              {daily[hover].trades} trade{daily[hover].trades !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DataTable({ cols, rows, getRowColor, sortCol, sortAsc, onSort }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11 }}>
        <thead>
          <tr>
            {cols.map(c => {
              const sortable = onSort && !c.key.startsWith('_');
              const active   = sortCol === c.key;
              return (
                <th key={c.key}
                  onClick={sortable ? () => onSort(c.key) : undefined}
                  style={{
                    textAlign: c.align || 'left', padding: '6px 12px',
                    borderBottom: '1px solid var(--border-subtle)',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: active ? 600 : 400, letterSpacing: '0.1em', fontSize: 9, textTransform: 'uppercase',
                    cursor: sortable ? 'pointer' : 'default', userSelect: 'none',
                  }}>
                  {c.label}{active ? (sortAsc ? ' ↑' : ' ↓') : sortable ? ' ·' : ''}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {cols.map(c => (
                <td key={c.key} style={{
                  padding: '9px 12px',
                  textAlign: c.align || 'left',
                  color: (getRowColor && getRowColor(c.key, r)) || (c.muted ? 'var(--text-muted)' : 'var(--text-secondary)'),
                  fontWeight: c.bold ? 600 : 400,
                }}>
                  {c.render ? c.render(r) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradeRow({ tr }) {
  const { lang } = useLang();
  const loc = { en:'en-US',es:'es-ES',uk:'uk-UA',ru:'ru-RU',de:'de-DE',zh:'zh-CN' }[lang] || 'en-US';
  const closedMs = parseInt(tr.closed_at);
  const dateStr = closedMs ? new Date(closedMs).toLocaleDateString(loc, { day: '2-digit', month: '2-digit' }) : '—';
  const pnl = tr.pnl ?? 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 12px',
      border: '1px solid var(--border-subtle)',
      background: 'var(--bg-base)',
    }}>
      <div>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>{tr.coin}</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', marginLeft: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {tr.side}
        </span>
        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
          {dateStr}
          {tr.duration_min != null && <span style={{ marginLeft: 6 }}>{tr.duration_min}m</span>}
          {tr.source && <span style={{ marginLeft: 6, opacity: 0.6 }}>{BOT_LABELS[tr.source] || tr.source}</span>}
        </div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
        {pnl >= 0 ? '+' : ''}{parseFloat(pnl).toFixed(2)}
      </div>
    </div>
  );
}

function Skeleton({ w = '100%', h = 18 }) {
  return (
    <div style={{
      width: w, height: h,
      background: 'var(--bg-elevated)',
      animation: 'kado-skeleton 1.4s ease-in-out infinite',
    }} />
  );
}

function CoinCard({ r, maxAbsPnl }) {
  const [hovered, setHovered] = React.useState(false);
  const pnl = parseFloat(r.pnl) || 0;
  const pos = pnl >= 0;
  const wr = r.trades ? Math.round(r.wins / r.trades * 100) : 0;
  const barW = maxAbsPnl > 0 ? Math.abs(pnl) / maxAbsPnl : 0;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 5,
        padding: '10px 12px 10px',
        background: hovered ? 'var(--bg-elevated)' : 'transparent',
        border: `1px solid ${hovered ? 'var(--border-strong)' : 'var(--border-default)'}`,
        textAlign: 'left', minWidth: 112,
        transition: 'background 120ms, border-color 120ms',
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>{r.coin}</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: pos ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>
          {pos ? '+' : ''}{pnl.toFixed(2)}
        </span>
      </div>
      {/* PnL bar */}
      <div style={{ height: 2, background: 'var(--border-subtle)', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: 0, left: pos ? '50%' : `${(0.5 - barW * 0.5) * 100}%`,
          width: `${barW * 50}%`,
          height: '100%',
          background: pos ? 'var(--accent-green)' : 'var(--accent-red)',
          opacity: 0.8,
        }} />
        <div style={{ position: 'absolute', top: 0, left: '50%', width: 1, height: '100%', background: 'var(--border-default)' }} />
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--accent-green)', marginRight: 4 }}>{r.wins}W</span>
        <span style={{ color: 'var(--accent-red)', marginRight: 4 }}>{r.trades - r.wins}L</span>
        <span style={{ color: wr >= 50 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{wr}%</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
        {r.trades} trades
      </div>
      {hovered && (r.avg_win > 0 || r.avg_loss < 0) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          {r.avg_win > 0 && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--accent-green)' }}>
              avg W: +{parseFloat(r.avg_win).toFixed(2)}
            </span>
          )}
          {r.avg_loss < 0 && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--accent-red)' }}>
              avg L: {parseFloat(r.avg_loss).toFixed(2)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function CoinGrid({ coins }) {
  const sorted = [...coins].sort((a, b) => parseFloat(b.pnl) - parseFloat(a.pnl));
  const maxAbsPnl = Math.max(...sorted.map(r => Math.abs(parseFloat(r.pnl) || 0)), 0.01);
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {sorted.map(r => <CoinCard key={r.coin} r={r} maxAbsPnl={maxAbsPnl} />)}
    </div>
  );
}

const DOW_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function DayOfWeekChart({ trades }) {
  const [hover, setHover] = React.useState(null);
  const data = useMemo(() => {
    const buckets = Array.from({ length: 7 }, (_, i) => ({ day: i, pnl: 0, trades: 0, wins: 0 }));
    for (const tr of trades) {
      const ms = parseInt(tr.closed_at);
      if (!ms) continue;
      const dow = new Date(ms).getDay();
      const p = parseFloat(tr.pnl ?? 0);
      buckets[dow].pnl += p;
      buckets[dow].trades += 1;
      if (p > 0) buckets[dow].wins += 1;
    }
    return buckets.map(b => ({ ...b, pnl: parseFloat(b.pnl.toFixed(2)) }));
  }, [trades]);

  const maxAbs = Math.max(...data.map(d => Math.abs(d.pnl)), 0.01);
  if (!trades.length) return null;

  return (
    <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', padding: '16px 16px 8px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 80 }}>
        {data.map((d, i) => {
          const barH = Math.abs(d.pnl) / maxAbs * 64;
          const pos = d.pnl >= 0;
          const isH = hover === i;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'default' }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', height: 68 }}>
                {pos
                  ? <div style={{ marginTop: 'auto', width: '100%', height: barH || 2, background: isH ? 'var(--accent-green)' : 'rgba(14,203,129,0.65)', transition: 'background 100ms' }} />
                  : <div style={{ marginTop: 'auto', width: '100%', height: barH || 2, background: isH ? 'var(--accent-red)' : 'rgba(246,70,93,0.65)', transition: 'background 100ms' }} />
                }
              </div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: hover === i ? 'var(--text-secondary)' : 'var(--text-muted)', letterSpacing: '0.06em' }}>
                {DOW_LABELS[d.day]}
              </div>
            </div>
          );
        })}
      </div>
      {hover != null && (
        <div style={{
          position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          padding: '7px 14px', fontFamily: MONO, fontSize: 11, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
        }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginBottom: 3 }}>{DOW_LABELS[data[hover].day]}</div>
          <div style={{ color: data[hover].pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700, fontSize: 13 }}>
            {data[hover].pnl >= 0 ? '+' : ''}{data[hover].pnl.toFixed(2)} USDT
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 2 }}>
            {data[hover].trades} trades · {data[hover].trades ? Math.round(data[hover].wins / data[hover].trades * 100) : 0}% WR
          </div>
        </div>
      )}
    </div>
  );
}

function HourOfDayChart({ trades }) {
  const [hover, setHover] = React.useState(null);
  const data = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ h, pnl: 0, trades: 0, wins: 0 }));
    for (const tr of trades) {
      const ms = parseInt(tr.closed_at);
      if (!ms) continue;
      const hour = new Date(ms).getUTCHours();
      const p = parseFloat(tr.pnl ?? 0);
      buckets[hour].pnl    += p;
      buckets[hour].trades += 1;
      if (p > 0) buckets[hour].wins += 1;
    }
    return buckets.map(b => ({ ...b, pnl: parseFloat(b.pnl.toFixed(2)) }));
  }, [trades]);

  const maxAbs = Math.max(...data.map(d => Math.abs(d.pnl)), 0.01);
  if (!trades.length) return null;

  const SESSION_COLORS = {
    asia:   'rgba(96,165,250,0.18)',
    europe: 'rgba(167,139,250,0.14)',
    us:     'rgba(251,191,36,0.13)',
  };
  const sessionFor = h => h >= 0 && h < 8 ? 'asia' : h >= 8 && h < 16 ? 'europe' : 'us';

  return (
    <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', padding: '16px 12px 8px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90, position: 'relative' }}>
        {/* session backgrounds */}
        {['asia', 'europe', 'us'].map((s, si) => {
          const start = si * 8;
          return (
            <div key={s} style={{
              position: 'absolute', bottom: 20, top: 0,
              left: `${(start / 24) * 100}%`, width: `${(8 / 24) * 100}%`,
              background: SESSION_COLORS[s], pointerEvents: 'none',
            }} />
          );
        })}
        {data.map((d, i) => {
          const barH = Math.abs(d.pnl) / maxAbs * 64;
          const pos = d.pnl >= 0;
          const isH = hover === i;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, cursor: 'default', position: 'relative', zIndex: 1 }}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', height: 70 }}>
                {pos
                  ? <div style={{ marginTop: 'auto', width: '100%', height: barH || 1.5, background: isH ? 'var(--accent-green)' : 'rgba(14,203,129,0.65)', transition: 'background 100ms' }} />
                  : <div style={{ marginTop: 'auto', width: '100%', height: barH || 1.5, background: isH ? 'var(--accent-red)' : 'rgba(246,70,93,0.65)', transition: 'background 100ms' }} />
                }
              </div>
              {i % 4 === 0 && (
                <div style={{ fontFamily: MONO, fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>{i}h</div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
        <span style={{ background: SESSION_COLORS.asia,   padding: '1px 6px' }}>Asia 00–08 UTC</span>
        <span style={{ background: SESSION_COLORS.europe, padding: '1px 6px' }}>Europe 08–16 UTC</span>
        <span style={{ background: SESSION_COLORS.us,     padding: '1px 6px' }}>US 16–24 UTC</span>
      </div>
      {hover != null && (
        <div style={{
          position: 'absolute', top: 8,
          left: Math.min(Math.max(`${(hover / 24) * 100}%`, '4px'), 'calc(100% - 130px)'),
          transform: hover < 12 ? 'none' : 'translateX(-100%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          padding: '7px 12px', fontFamily: MONO, fontSize: 11, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
        }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginBottom: 3 }}>{String(hover).padStart(2,'0')}:00 UTC</div>
          <div style={{ color: data[hover].pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700, fontSize: 13 }}>
            {data[hover].pnl >= 0 ? '+' : ''}{data[hover].pnl.toFixed(2)} USDT
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 2 }}>
            {data[hover].trades} trades · {data[hover].trades ? Math.round(data[hover].wins / data[hover].trades * 100) : 0}% WR
          </div>
        </div>
      )}
    </div>
  );
}

function EquityCurve({ trades }) {
  const wrapRef = useRef(null);
  const [w, setW] = useState(0);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    if (!wrapRef.current) return;
    setW(wrapRef.current.offsetWidth);
    let raf = null;
    const ro = new ResizeObserver(entries => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setW(entries[0].contentRect.width));
    });
    ro.observe(wrapRef.current);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  const data = useMemo(() => {
    const sorted = [...trades]
      .filter(t => t.pnl != null)
      .sort((a, b) => parseInt(a.closed_at) - parseInt(b.closed_at));
    let cum = 0;
    return sorted.map(t => {
      cum += parseFloat(t.pnl ?? 0);
      const ms = parseInt(t.closed_at);
      return { t: ms ? new Date(ms).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) : '', v: parseFloat(cum.toFixed(2)) };
    });
  }, [trades]);

  if (data.length < 2) return null;

  const H = 220;
  const PAD = { top: 16, right: 12, bottom: 28, left: 60 };

  const geom = useMemo(() => {
    if (!w) return null;
    const vals  = data.map(d => d.v);
    const minV  = Math.min(...vals, 0);
    const maxV  = Math.max(...vals, 0);
    const range = maxV - minV || 1;
    const isPos = vals[vals.length - 1] >= 0;
    const color = isPos ? '#0ecb81' : '#f6465d';
    const cW    = w - PAD.left - PAD.right;
    const cH    = H - PAD.top - PAD.bottom;
    const sx    = i => PAD.left + (i / Math.max(data.length - 1, 1)) * cW;
    const sy    = v => PAD.top + cH - ((v - minV) / range) * cH;
    const zeroY = sy(0);
    const pts   = data.map((d, i) => `${sx(i)},${sy(d.v)}`).join(' ');
    const area  = data.length > 1
      ? `M${sx(0)},${zeroY} ` + data.map((d, i) => `L${sx(i)},${sy(d.v)}`).join(' ') + ` L${sx(data.length - 1)},${zeroY} Z`
      : '';
    const yTicks = [0, 1, 2, 3, 4].map(i => ({ v: minV + range * i / 4, y: sy(minV + range * i / 4) }));
    const xIdxs = data.length <= 1 ? [0]
      : [0, Math.floor(data.length * 0.25), Math.floor(data.length * 0.5), Math.floor(data.length * 0.75), data.length - 1]
          .filter((v, i, a) => a.indexOf(v) === i);
    return { color, cW, cH, sx, sy, zeroY, pts, area, yTicks, xIdxs };
  }, [data, w]);

  return (
    <div ref={wrapRef} style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', position: 'relative' }}>
      {w > 0 && geom && (
        <svg width={w} height={H} style={{ display: 'block', fontFamily: MONO }} onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="ec-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={geom.color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={geom.color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {geom.yTicks.map((t, i) => (
            <g key={i}>
              <line x1={PAD.left} x2={w - PAD.right} y1={t.y} y2={t.y}
                stroke={t.v === 0 ? 'var(--border-default)' : 'var(--border-subtle)'}
                strokeWidth={t.v === 0 ? 1 : 0.5} strokeDasharray={t.v === 0 ? '0' : '3 4'} />
              <text x={PAD.left - 6} y={t.y + 3.5} textAnchor="end" fontSize={9} fill="var(--text-muted)">
                {t.v >= 0 ? (t.v === 0 ? '0' : `+${t.v.toFixed(0)}`) : t.v.toFixed(0)}
              </text>
            </g>
          ))}
          {geom.xIdxs.map(i => (
            <text key={i} x={geom.sx(i)} y={H - 6} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
              {data[i]?.t ?? ''}
            </text>
          ))}
          {geom.area && <path d={geom.area} fill="url(#ec-grad)" />}
          <polyline points={geom.pts} fill="none" stroke={geom.color} strokeWidth={1.5} strokeLinejoin="round" />
          {/* hover interaction zone */}
          {data.map((d, i) => (
            <rect key={i} x={geom.sx(i) - (geom.cW / data.length / 2)} y={PAD.top}
              width={geom.cW / data.length} height={geom.cH}
              fill="transparent"
              onMouseEnter={() => setHover(i)} />
          ))}
          {hover != null && (
            <>
              <line x1={geom.sx(hover)} x2={geom.sx(hover)} y1={PAD.top} y2={H - PAD.bottom}
                stroke="var(--border-default)" strokeWidth={1} strokeDasharray="3 3" />
              <circle cx={geom.sx(hover)} cy={geom.sy(data[hover].v)} r={4}
                fill={geom.color} stroke="var(--bg-base)" strokeWidth={2} />
            </>
          )}
        </svg>
      )}
      {hover != null && data[hover] && (
        <div style={{
          position: 'absolute', top: 8,
          left: Math.min(Math.max(geom.sx(hover), PAD.left + 40), w - 120),
          transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
          padding: '7px 12px', fontFamily: MONO, fontSize: 11, pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
        }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginBottom: 3 }}>{data[hover].t}</div>
          <div style={{ color: data[hover].v >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700, fontSize: 13 }}>
            {data[hover].v >= 0 ? '+' : ''}{data[hover].v.toFixed(2)} USDT
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 1 }}>trade {hover + 1} of {data.length}</div>
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 50;

export default function AnalyticsTab() {
  const { t, lang } = useLang();
  const [data, setData] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allTrades, setAllTrades] = useState([]);
  const [tradePage, setTradePage] = useState(1);
  const [allDays,   setAllDays]   = useState(0);
  const [tradeSearch, setTradeSearch] = useState('');
  const [tradeSide,   setTradeSide]   = useState('ALL');
  const [coinView,    setCoinView]    = useState('cards');
  const [coinSort,    setCoinSort]    = useState('pnl');
  const [coinSortAsc, setCoinSortAsc] = useState(false);
  const [botSort,     setBotSort]     = useState('pnl');
  const [botSortAsc,  setBotSortAsc]  = useState(false);
  const [tradeSource, setTradeSource] = useState('ALL');

  const fetchData = useCallback(async (days = 0) => {
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };
      const [analyticsRes, tradesRes, balanceRes] = await Promise.all([
        fetch('/api/users/analytics', { headers }),
        fetch(`/api/users/closed-pnl?days=${days}`, { headers }),
        fetch('/api/users/balance', { headers }),
      ]);
      if (!analyticsRes.ok) throw new Error(`HTTP ${analyticsRes.status}`);
      setData(await analyticsRes.json());
      if (tradesRes.ok) {
        const j = await tradesRes.json();
        setAllTrades(j.trades || []);
      }
      if (balanceRes.ok) setBalance(await balanceRes.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(allDays); }, [fetchData, allDays]);

  if (loading) {
    return (
      <div>
        <style>{`@keyframes kado-skeleton { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
        <div style={{ display: 'flex', gap: 1, marginBottom: 1, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ flex: 1, minWidth: 140, background: 'var(--bg-base)', padding: '28px 24px' }}>
              <Skeleton w={60} h={9} />
              <div style={{ marginTop: 14 }}><Skeleton w={100} h={26} /></div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 1 }}><Skeleton h={200} /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-muted)', padding: '40px 0' }}>
        <div style={{ marginBottom: 12, letterSpacing: '0.08em' }}>{t.dashboard.analytics.errorPrefix} {error}</div>
        <button onClick={() => fetchData(allDays)} style={{
          background: 'none', border: '1px solid var(--border-default)', color: 'var(--text-muted)',
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
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

  if (noData && !hasKey) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>
          No API key connected
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-muted)', marginBottom: 28, lineHeight: 1.6 }}>
          Connect your Bybit API key to see personal analytics —<br />balance, PnL, trade history and coin breakdown.
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'api-keys' }))}
          style={{
            background: 'var(--text-primary)', color: 'var(--bg-base)',
            border: 'none', padding: '10px 24px',
            fontFamily: MONO, fontSize: 11, fontWeight: 700,
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>
          No trades yet
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          API key connected. Analytics will appear here once<br />the bot executes trades on your account.
        </div>
      </div>
    );
  }

  const bestDay = daily?.length ? daily.reduce((a, b) => (b.pnl > a.pnl ? b : a), daily[0]) : null;

  // All stats computed from allTrades so they respond to the period selector
  const periodStats = useMemo(() => {
    if (!allTrades.length) return {
      totalPnl: 0, wins: 0, losses: 0, winRate: '—',
      avgTrade: null, streak: 0, streakDir: null, profitFactor: null, maxDrawdown: null, avgDuration: null,
      byCoin: [], bySource: [], best: [], worst: [],
    };

    const sorted = [...allTrades].sort((a, b) => parseInt(a.closed_at) - parseInt(b.closed_at));
    let totalPnl = 0, wins = 0;
    let totalWin = 0, totalLoss = 0, peak = 0, equity = 0, maxDD = 0;
    let durSum = 0, durCount = 0;
    const coinMap = {}, srcMap = {};

    for (const t of sorted) {
      const p = parseFloat(t.pnl ?? 0);
      totalPnl += p;
      if (p > 0) wins += 1;

      // coin aggregation
      const c = t.symbol || '';
      if (!coinMap[c]) coinMap[c] = { coin: c, trades: 0, pnl: 0, wins: 0, win_pnls: [], loss_pnls: [] };
      coinMap[c].trades += 1; coinMap[c].pnl += p;
      if (p > 0) { coinMap[c].wins += 1; coinMap[c].win_pnls.push(p); } else { coinMap[c].loss_pnls.push(p); }

      // source aggregation (merge news+signal → Signal Bot)
      const src = t.source || 'other';
      const lbl = BOT_LABELS[src] || src;
      if (!srcMap[lbl]) srcMap[lbl] = { source: src, label: lbl, trades: 0, pnl: 0, wins: 0, win_pnls: [], loss_pnls: [] };
      srcMap[lbl].trades += 1; srcMap[lbl].pnl += p;
      if (p > 0) { srcMap[lbl].wins += 1; srcMap[lbl].win_pnls.push(p); } else { srcMap[lbl].loss_pnls.push(p); }

      // advanced metrics
      if (p > 0) totalWin += p; else totalLoss += Math.abs(p);
      equity += p;
      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDD) maxDD = dd;
      const o = parseInt(t.opened_at), cl = parseInt(t.closed_at);
      if (o && cl && cl > o) { durSum += (cl - o) / 60000; durCount++; }
    }

    // streak
    let count = 0, dir = null;
    for (let i = sorted.length - 1; i >= 0; i--) {
      const w = parseFloat(sorted[i].pnl ?? 0) > 0;
      if (dir === null) { dir = w; count = 1; } else if (dir === w) count++; else break;
    }

    const agg = map => Object.values(map).map(v => ({
      ...v, pnl: parseFloat(v.pnl.toFixed(2)),
      avg_win:  v.win_pnls.length  ? parseFloat((v.win_pnls.reduce((s, x) => s + x, 0)  / v.win_pnls.length).toFixed(2))  : 0,
      avg_loss: v.loss_pnls.length ? parseFloat((v.loss_pnls.reduce((s, x) => s + x, 0) / v.loss_pnls.length).toFixed(2)) : 0,
    })).sort((a, b) => b.pnl - a.pnl);

    const byDate = [...allTrades].sort((a, b) => parseFloat(b.pnl ?? 0) - parseFloat(a.pnl ?? 0));
    const losses = allTrades.length - wins;

    return {
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      wins, losses,
      winRate: allTrades.length ? pct(wins, allTrades.length) : '—',
      avgTrade: totalPnl / allTrades.length,
      streak: count, streakDir: dir,
      profitFactor: totalLoss > 0 ? +(totalWin / totalLoss).toFixed(2) : null,
      maxDrawdown: maxDD > 0 ? +maxDD.toFixed(2) : null,
      avgDuration: durCount > 0 ? Math.round(durSum / durCount) : null,
      byCoin: agg(coinMap),
      bySource: agg(srcMap),
      best:  byDate.slice(0, 5).map(t => ({ coin: t.symbol, pnl: parseFloat(t.pnl ?? 0), closed_at: t.closed_at, side: t.side, source: t.source, duration_min: (() => { const o = parseInt(t.opened_at), c = parseInt(t.closed_at); return (o && c && c > o) ? Math.round((c - o) / 60000) : null; })() })),
      worst: byDate.slice(-5).reverse().map(t => ({ coin: t.symbol, pnl: parseFloat(t.pnl ?? 0), closed_at: t.closed_at, side: t.side, source: t.source, duration_min: (() => { const o = parseInt(t.opened_at), c = parseInt(t.closed_at); return (o && c && c > o) ? Math.round((c - o) / 60000) : null; })() })),
    };
  }, [allTrades]);

  const { totalPnl, winRate, avgTrade, streak, streakDir, profitFactor, maxDrawdown, avgDuration } = periodStats;
  const mergedBySource = periodStats.bySource;

  const botCols = [
    { key: 'source', label: t.dashboard.analytics.hSource, bold: true, render: r => r.label || r.source },
    { key: 'trades', label: t.dashboard.analytics.hTrades, align: 'right' },
    { key: '_wr', label: t.dashboard.analytics.hWinRate, align: 'right', render: r => pct(r.wins, r.trades) },
    { key: 'pnl', label: t.dashboard.analytics.hPnlUsdt, align: 'right', render: r => `${r.pnl >= 0 ? '+' : ''}${parseFloat(r.pnl).toFixed(2)}` },
    { key: 'avg_win', label: t.dashboard.analytics.hAvgWin, align: 'right', render: r => r.avg_win > 0 ? `+${parseFloat(r.avg_win).toFixed(2)}` : parseFloat(r.avg_win).toFixed(2) },
    { key: 'avg_loss', label: t.dashboard.analytics.hAvgLoss, align: 'right', muted: true, render: r => parseFloat(r.avg_loss || 0).toFixed(2) },
  ];

  const coinCols = [
    { key: 'coin', label: t.dashboard.analytics.hCoin, bold: true },
    { key: 'trades', label: t.dashboard.analytics.hTrades, align: 'right' },
    { key: '_wr', label: t.dashboard.analytics.hWinRate, align: 'right', render: r => pct(r.wins, r.trades) },
    { key: 'pnl', label: t.dashboard.analytics.hPnlUsdt, align: 'right', render: r => `${r.pnl >= 0 ? '+' : ''}${parseFloat(r.pnl).toFixed(2)}` },
    { key: 'avg_win', label: t.dashboard.analytics.hAvgWin, align: 'right', render: r => r.avg_win > 0 ? `+${parseFloat(r.avg_win).toFixed(2)}` : '—' },
    { key: 'avg_loss', label: t.dashboard.analytics.hAvgLoss, align: 'right', muted: true, render: r => r.avg_loss < 0 ? parseFloat(r.avg_loss).toFixed(2) : '—' },
  ];

  const fmtDuration = r => {
    const o = parseInt(r.opened_at), c = parseInt(r.closed_at);
    if (!o || !c || c <= o) return '—';
    const m = Math.round((c - o) / 60000);
    if (m < 60) return `${m}m`;
    if (m < 1440) return `${Math.floor(m / 60)}h ${m % 60}m`;
    return `${Math.floor(m / 1440)}d`;
  };

  const allTradesCols = [
    { key: 'date', label: 'Date', muted: true, render: r => { const ms = parseInt(r.closed_at); const loc = { en:'en-US',es:'es-ES',uk:'uk-UA',ru:'ru-RU',de:'de-DE',zh:'zh-CN' }[lang]||'en-US'; return ms ? new Date(ms).toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'; } },
    { key: 'symbol', label: 'Symbol', bold: true, render: r => r.symbol || '—' },
    { key: 'side', label: 'Side', render: r => <span style={{ color: r.side === 'LONG' ? 'var(--accent-green)' : r.side === 'SHORT' ? 'var(--accent-red)' : 'var(--text-muted)' }}>{r.side || '—'}</span> },
    { key: 'entry_price', label: 'Entry', render: r => r.entry_price ? (+r.entry_price).toFixed(4) : '—' },
    { key: 'exit_price', label: 'Exit', render: r => r.exit_price ? (+r.exit_price).toFixed(4) : '—' },
    { key: 'qty', label: 'Qty', muted: true, render: r => r.qty ? (+r.qty).toFixed(3) : '—' },
    { key: '_dur', label: 'Dur', muted: true, render: fmtDuration },
    { key: 'source', label: 'Source', muted: true, render: r => BOT_LABELS[r.source] || r.source || '—' },
    { key: 'pnl', label: 'PnL', align: 'right', bold: true, render: r => `${(r.pnl ?? 0) >= 0 ? '+' : ''}${(r.pnl ?? 0).toFixed(2)}` },
  ];

  const sign = v => (v >= 0 ? '+' : '') + parseFloat(v ?? 0).toFixed(2);
  const upnl = balance?.unrealized_pnl ?? 0;

  return (
    <div style={{ color: 'var(--text-primary)', fontFamily: FONT }}>
      <style>{`@keyframes kado-skeleton { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>

      {/* Balance bar */}
      {balance && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 0,
          border: '1px solid var(--border-subtle)',
          background: 'var(--border-subtle)',
          marginBottom: 1,
        }}>
          {[
            { label: 'Wallet',      value: `$${parseFloat(balance.usdt_wallet ?? 0).toFixed(2)}`,   color: null },
            { label: 'Equity',      value: `$${parseFloat(balance.usdt_equity ?? 0).toFixed(2)}`,   color: null },
            { label: 'Unrealized',  value: `${sign(upnl)} USDT`,  color: upnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
            { label: 'Available',   value: `$${parseFloat(balance.usdt_free ?? 0).toFixed(2)}`,     color: null },
          ].map((s, i, arr) => (
            <div key={s.label} style={{
              padding: '18px 20px',
              background: 'var(--bg-base)',
              borderRight: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: s.color || 'var(--text-primary)' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 1,
        background: 'var(--border-subtle)',
        marginBottom: 32,
        marginTop: balance ? 1 : 0,
      }}>
        <StatCard
          label={t.dashboard.analytics.totalTrades}
          value={allTrades.length || (summary?.total_trades ?? 0)}
          sub={`${periodStats.wins}W · ${periodStats.losses}L`}
        />
        <StatCard
          label={t.dashboard.analytics.totalPnl}
          value={<span style={{ color: totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {`${totalPnl >= 0 ? '+' : ''}${totalPnl} USDT`}
          </span>}
        />
        <StatCard
          label={t.dashboard.analytics.winRate}
          value={winRate === '—' ? '—' : <span style={{ color: parseFloat(winRate) >= 50 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{winRate}</span>}
          sub={`${periodStats.wins} ${t.dashboard.analytics.wins}`}
        />
        <StatCard
          label={t.dashboard.analytics.bestDay}
          value={bestDay ? `${bestDay.pnl >= 0 ? '+' : ''}${parseFloat(bestDay.pnl).toFixed(2)}` : '—'}
          sub={bestDay?.date ?? ''}
        />
        {avgTrade != null && (
          <StatCard
            label="Avg Trade"
            value={`${avgTrade >= 0 ? '+' : ''}${avgTrade.toFixed(2)}`}
            sub="USDT per trade"
          />
        )}
        {streak > 0 && (
          <StatCard
            label="Current Streak"
            value={`${streak}×`}
            sub={streakDir ? '✓ wins' : '✗ losses'}
          />
        )}
        {profitFactor != null && (
          <StatCard
            label="Profit Factor"
            value={profitFactor >= 1
              ? <span style={{ color: 'var(--accent-green)' }}>{profitFactor}×</span>
              : <span style={{ color: 'var(--accent-red)' }}>{profitFactor}×</span>}
            sub="gross win / gross loss"
          />
        )}
        {maxDrawdown != null && (
          <StatCard
            label="Max Drawdown"
            value={<span style={{ color: 'var(--accent-red)' }}>−{maxDrawdown}</span>}
            sub="USDT from peak"
          />
        )}
        {avgDuration != null && (
          <StatCard
            label="Avg Duration"
            value={avgDuration < 60 ? `${avgDuration}m` : avgDuration < 1440 ? `${Math.floor(avgDuration / 60)}h ${avgDuration % 60}m` : `${Math.floor(avgDuration / 1440)}d`}
            sub="per closed trade"
          />
        )}
      </div>

      {/* Daily PnL chart — last 30 days */}
      <div style={{ marginBottom: 32 }}>
        <SectionLabel title={t.dashboard.analytics.dailyPnl30} />
        <DailyChart daily={daily} t={t} />
      </div>

      {/* Period selector for trade-based charts */}
      {allTrades.length >= 2 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {[{ label: '7d', days: 7 }, { label: '30d', days: 30 }, { label: '90d', days: 90 }, { label: 'All', days: 0 }].map(p => (
            <button key={p.days} onClick={() => { setAllDays(p.days); setTradePage(1); }}
              style={{
                background: 'none', border: `1px solid ${allDays === p.days ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                color: allDays === p.days ? 'var(--text-primary)' : 'var(--text-muted)',
                fontFamily: MONO, fontSize: 11, padding: '5px 14px', cursor: 'pointer',
                letterSpacing: '0.08em', transition: 'border-color 150ms, color 150ms',
              }}>
              {p.label}
            </button>
          ))}
          <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', alignSelf: 'center', marginLeft: 6 }}>
            {allTrades.length} trades
          </span>
        </div>
      )}

      {/* Equity curve */}
      {allTrades.length >= 2 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title="Equity Curve" right={allDays === 0 ? 'all time' : `last ${allDays}d`} />
          <EquityCurve trades={allTrades} />
        </div>
      )}

      {/* Day of week breakdown */}
      {allTrades.length >= 7 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title="Day of Week" right="avg PnL by weekday" />
          <DayOfWeekChart trades={allTrades} />
        </div>
      )}

      {/* Hour of day breakdown */}
      {allTrades.length >= 10 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title="Hour of Day (UTC)" right="cumulative PnL by hour" />
          <HourOfDayChart trades={allTrades} />
        </div>
      )}

      {/* Long vs Short breakdown */}
      {allTrades.length >= 4 && (() => {
        const sides = { LONG: { trades: 0, pnl: 0, wins: 0 }, SHORT: { trades: 0, pnl: 0, wins: 0 } };
        for (const tr of allTrades) {
          const side = (tr.side || '').toUpperCase();
          if (!sides[side]) continue;
          const p = parseFloat(tr.pnl ?? 0);
          sides[side].trades += 1;
          sides[side].pnl   += p;
          if (p > 0) sides[side].wins += 1;
        }
        const hasBoth = sides.LONG.trades > 0 && sides.SHORT.trades > 0;
        if (!hasBoth && sides.LONG.trades + sides.SHORT.trades < 4) return null;
        return (
          <div style={{ marginBottom: 32 }}>
            <SectionLabel title="Long vs Short" right="direction breakdown" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border-subtle)' }}>
              {['LONG', 'SHORT'].map(side => {
                const s = sides[side];
                const pnl = parseFloat(s.pnl.toFixed(2));
                const wr = s.trades ? Math.round(s.wins / s.trades * 100) : 0;
                const pos = pnl >= 0;
                const col = side === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)';
                return (
                  <div key={side} style={{ background: 'var(--bg-base)', padding: '20px 24px' }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: col, marginBottom: 10, fontWeight: 700 }}>{side}</div>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: pos ? 'var(--accent-green)' : 'var(--accent-red)', marginBottom: 8, letterSpacing: '-0.02em' }}>
                      {pos ? '+' : ''}{pnl.toFixed(2)}
                    </div>
                    <div style={{ display: 'flex', gap: 20 }}>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>Trades</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-primary)' }}>{s.trades}</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>Win Rate</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-primary)' }}>{wr}%</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>Avg Trade</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: s.trades ? (s.pnl / s.trades >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-muted)' }}>
                          {s.trades ? `${s.pnl / s.trades >= 0 ? '+' : ''}${(s.pnl / s.trades).toFixed(2)}` : '—'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* By coin — card grid or table */}
      {periodStats.byCoin.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: 10, marginBottom: 16 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              {t.dashboard.analytics.byCoin}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)' }}>{periodStats.byCoin.length} {t.dashboard.analytics.coinsSort}</span>
              <div style={{ display: 'flex', gap: 2 }}>
                {['cards', 'table'].map(v => (
                  <button key={v} onClick={() => setCoinView(v)} style={{
                    background: 'none', border: `1px solid ${coinView === v ? 'var(--border-default)' : 'var(--border-subtle)'}`,
                    color: coinView === v ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', padding: '2px 8px', cursor: 'pointer',
                    textTransform: 'uppercase', transition: 'all 120ms',
                  }}>{v}</button>
                ))}
              </div>
            </div>
          </div>
          {coinView === 'cards'
            ? <CoinGrid coins={periodStats.byCoin} />
            : (
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
                <DataTable
                  cols={coinCols}
                  rows={[...periodStats.byCoin].sort((a, b) => {
                    let va, vb;
                    if (coinSort === '_wr') { va = a.trades ? a.wins / a.trades : 0; vb = b.trades ? b.wins / b.trades : 0; }
                    else { va = parseFloat(a[coinSort] ?? 0); vb = parseFloat(b[coinSort] ?? 0); }
                    return coinSortAsc ? va - vb : vb - va;
                  })}
                  getRowColor={(k, r) => k === 'pnl' ? (parseFloat(r.pnl) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : k === 'avg_win' ? 'var(--accent-green)' : k === 'avg_loss' ? 'var(--accent-red)' : null}
                  sortCol={coinSort}
                  sortAsc={coinSortAsc}
                  onSort={col => { if (coinSort === col) setCoinSortAsc(a => !a); else { setCoinSort(col); setCoinSortAsc(false); } }}
                />
              </div>
            )
          }
        </div>
      )}

      {/* By bot source */}
      {mergedBySource.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel
            title={t.dashboard.analytics.byBotSource}
            right={`${mergedBySource.length} ${t.dashboard.analytics.sources}`}
          />
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
            <DataTable
              cols={botCols}
              rows={[...mergedBySource].sort((a, b) => {
                let va, vb;
                if (botSort === '_wr') { va = a.trades ? a.wins / a.trades : 0; vb = b.trades ? b.wins / b.trades : 0; }
                else { va = parseFloat(a[botSort] ?? 0); vb = parseFloat(b[botSort] ?? 0); }
                return botSortAsc ? va - vb : vb - va;
              })}
              getRowColor={(k, r) => k === 'pnl' ? (parseFloat(r.pnl) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : k === 'avg_win' ? 'var(--accent-green)' : k === 'avg_loss' ? 'var(--accent-red)' : null}
              sortCol={botSort}
              sortAsc={botSortAsc}
              onSort={col => { if (botSort === col) setBotSortAsc(a => !a); else { setBotSort(col); setBotSortAsc(false); } }}
            />
          </div>
        </div>
      )}

      {/* Top 5 best / worst trades */}
      {(periodStats.best.length > 0 || periodStats.worst.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
          {periodStats.best.length > 0 && (
            <div>
              <SectionLabel title={t.dashboard.analytics.topBest} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {periodStats.best.map((tr, i) => <TradeRow key={i} tr={tr} />)}
              </div>
            </div>
          )}
          {periodStats.worst.length > 0 && (
            <div>
              <SectionLabel title={t.dashboard.analytics.topWorst} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {periodStats.worst.map((tr, i) => <TradeRow key={i} tr={tr} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* All trades — paginated, newest first */}
      {allTrades.length > 0 && (() => {
        const sources = [...new Set(allTrades.map(t => t.source).filter(Boolean))].sort();
        const lc = tradeSearch.toLowerCase();
        const filtered = [...allTrades]
          .filter(t => {
            if (tradeSide !== 'ALL' && (t.side || '').toUpperCase() !== tradeSide) return false;
            if (tradeSource !== 'ALL' && t.source !== tradeSource) return false;
            if (lc && !(t.symbol || '').toLowerCase().includes(lc)) return false;
            return true;
          })
          .sort((a, b) => parseInt(b.closed_at) - parseInt(a.closed_at));
        const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
        const page = Math.min(tradePage, totalPages);
        const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        const btnSide = {
          background: 'none', border: '1px solid var(--border-subtle)', fontFamily: MONO,
          fontSize: 10, letterSpacing: '0.1em', padding: '4px 10px', cursor: 'pointer', transition: 'all 120ms',
        };
        return (
          <div style={{ marginBottom: 32 }}>
            <SectionLabel title="All Trades" right={`${filtered.length !== allTrades.length ? `${filtered.length} / ` : ''}${allTrades.length} total`} />
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {['ALL', 'LONG', 'SHORT'].map(s => (
                <button key={s} onClick={() => { setTradeSide(s); setTradePage(1); }} style={{
                  ...btnSide,
                  borderColor: tradeSide === s ? (s === 'LONG' ? 'var(--accent-green)' : s === 'SHORT' ? 'var(--accent-red)' : 'var(--border-default)') : 'var(--border-subtle)',
                  color: tradeSide === s ? (s === 'LONG' ? 'var(--accent-green)' : s === 'SHORT' ? 'var(--accent-red)' : 'var(--text-primary)') : 'var(--text-muted)',
                }}>{s}</button>
              ))}
              <input
                value={tradeSearch}
                onChange={e => { setTradeSearch(e.target.value); setTradePage(1); }}
                placeholder="Symbol…"
                style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 3,
                  color: 'var(--text-primary)', fontFamily: MONO, fontSize: 10, padding: '4px 10px',
                  outline: 'none', width: 110, letterSpacing: '0.04em',
                }}
              />
              {sources.length > 1 && (
                <select
                  value={tradeSource}
                  onChange={e => { setTradeSource(e.target.value); setTradePage(1); }}
                  style={{
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                    color: tradeSource !== 'ALL' ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontFamily: MONO, fontSize: 10, padding: '4px 10px', outline: 'none', cursor: 'pointer',
                  }}
                >
                  <option value="ALL">All bots</option>
                  {sources.map(s => (
                    <option key={s} value={s}>{BOT_LABELS[s] || s}</option>
                  ))}
                </select>
              )}
            </div>
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
              <DataTable
                cols={allTradesCols}
                rows={pageRows}
                getRowColor={(k, r) => k === 'pnl' ? ((r.pnl ?? 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : null}
              />
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 12 }}>
                <button
                  onClick={() => setTradePage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  style={{
                    background: 'none', border: '1px solid var(--border-subtle)', color: page <= 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
                    fontFamily: MONO, fontSize: 11, padding: '5px 14px', cursor: page <= 1 ? 'default' : 'pointer',
                    opacity: page <= 1 ? 0.4 : 1, transition: 'border-color 150ms',
                  }}
                >← Prev</button>
                <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)' }}>
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setTradePage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  style={{
                    background: 'none', border: '1px solid var(--border-subtle)', color: page >= totalPages ? 'var(--text-muted)' : 'var(--text-secondary)',
                    fontFamily: MONO, fontSize: 11, padding: '5px 14px', cursor: page >= totalPages ? 'default' : 'pointer',
                    opacity: page >= totalPages ? 0.4 : 1, transition: 'border-color 150ms',
                  }}
                >Next →</button>
              </div>
            )}
          </div>
        );
      })()}

      <div style={{ paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>
        <button onClick={() => fetchData(allDays)} style={{
          background: 'none', border: '1px solid var(--border-default)', color: 'var(--text-muted)',
          fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
          padding: '8px 20px', cursor: 'pointer', transition: 'border-color 150ms, color 150ms',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          {t.dashboard.refresh}
        </button>
      </div>
    </div>
  );
}
