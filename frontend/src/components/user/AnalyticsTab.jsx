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

function exportTradesCSV(trades) {
  const hdr = ['Date', 'Symbol', 'Side', 'Bot', 'Entry', 'Exit', 'Qty', 'Duration', 'PnL (USDT)'];
  const rows = trades.map(tr => {
    const ms = parseInt(tr.closed_at);
    const date = ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : '';
    const o = parseInt(tr.opened_at), c = parseInt(tr.closed_at);
    const m = (o && c && c > o) ? Math.round((c - o) / 60000) : null;
    const dur = m == null ? '' : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 1440)}d`;
    return [
      date, tr.symbol || '', tr.side || '', BOT_LABELS[tr.source] || tr.source || '',
      tr.entry_price ? (+tr.entry_price).toFixed(4) : '',
      tr.exit_price  ? (+tr.exit_price).toFixed(4)  : '',
      tr.qty ? (+tr.qty).toFixed(3) : '', dur,
      parseFloat(tr.pnl ?? 0).toFixed(2),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  const csv = [hdr.join(','), ...rows].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `kado_trades_${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

function pct(wins, total) {
  if (!total) return '—';
  return (wins / total * 100).toFixed(1) + '%';
}

function StatCard({ label, value, sub, accent = null }) {
  const [hovered, setHovered] = React.useState(false);
  const accentColor = accent === 'pos' ? 'var(--accent-green)'
                     : accent === 'neg' ? 'var(--accent-red)'
                     : accent === 'neutral' ? 'var(--text-muted)' : null;
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, minWidth: 160, position: 'relative',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        padding: '22px 22px 20px',
        transition: 'transform 200ms, border-color 200ms, box-shadow 200ms',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        borderColor: hovered ? 'var(--border-default)' : 'var(--border-subtle)',
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.25)' : '0 0 0 rgba(0,0,0,0)',
        overflow: 'hidden',
      }}
    >
      {accentColor && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, ${accentColor}, transparent)`,
          opacity: hovered ? 1 : 0.7, transition: 'opacity 200ms',
        }} />
      )}
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
        {label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', marginTop: 10, letterSpacing: '0.04em' }}>{sub}</div>
      )}
    </div>
  );
}

/* ───────── Inline sparkline for hero PnL card ───────── */
function HeroSparkline({ equity, isPos }) {
  if (!equity || equity.length < 2) return null;
  const W = 200, H = 44;
  const min = Math.min(...equity), max = Math.max(...equity);
  const range = max - min || 1;
  const sx = i => (i / (equity.length - 1)) * W;
  const sy = v => H - ((v - min) / range) * H;
  const pts = equity.map((v, i) => `${sx(i)},${sy(v)}`).join(' ');
  const area = `M0,${H} L` + pts.replace(/ /g, ' L') + ` L${W},${H} Z`;
  const stroke = isPos ? 'var(--accent-green)' : 'var(--accent-red)';
  const gradId = `hero-sparkline-${isPos ? 'p' : 'n'}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} preserveAspectRatio="none" style={{ display: 'block', opacity: 0.85 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SectionLabel({ title, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      paddingBottom: 12, marginBottom: 14,
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 3, height: 14, background: 'var(--accent-green)', opacity: 0.55, borderRadius: 1 }} />
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-secondary, var(--text-muted))', fontWeight: 500 }}>
          {title}
        </div>
      </div>
      {right && <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-muted)' }}>{right}</div>}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, background: 'linear-gradient(90deg, var(--border-default) 0%, transparent 70%)' }} />
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
    <div style={{ background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-base) 100%)', border: '1px solid var(--border-subtle)', padding: 16, position: 'relative', borderRadius: 4 }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', display: 'block', fontFamily: MONO }}
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="kdDailyPos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="var(--accent-green)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--accent-green)" stopOpacity="0.45" />
          </linearGradient>
          <linearGradient id="kdDailyNeg" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%"   stopColor="var(--accent-red)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--accent-red)" stopOpacity="0.45" />
          </linearGradient>
          <filter id="kdGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {yAxisVals.map((v, i) => {
          const y = PAD_T + chartH / 2 - (v / maxAbs) * (chartH / 2);
          const isZero = v === 0;
          return (
            <g key={i}>
              <line
                x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
                stroke={isZero ? 'var(--border-default)' : 'var(--border-subtle)'}
                strokeWidth={isZero ? 1 : 0.5}
                strokeDasharray={isZero ? '0' : '2 5'}
                opacity={isZero ? 0.8 : 0.5}
              />
              <text x={PAD_L - 8} y={y + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)" letterSpacing="0.04em">
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
                fill={positive ? 'url(#kdDailyPos)' : 'url(#kdDailyNeg)'}
                opacity={isHovered ? 1 : 0.82}
                filter={isHovered ? 'url(#kdGlow)' : undefined}
                rx={1.5}
                style={{ transition: 'opacity 120ms' }}
              />
              {i % Math.max(1, Math.floor(daily.length / 6)) === 0 && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={9} fill="var(--text-muted)" letterSpacing="0.04em">
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
              {daily[hover].trades} {t.dashboard.analytics.tradesLbl}
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
        <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
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
          {r.avg_win > 0 && r.avg_loss < 0 && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: (r.avg_win / Math.abs(r.avg_loss)) >= 1 ? 'var(--accent-green)' : 'var(--text-muted)' }}>
              R:R {(r.avg_win / Math.abs(r.avg_loss)).toFixed(2)}
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

const LOCALE_MAP = { en:'en-US', es:'es-ES', uk:'uk-UA', ru:'ru-RU', de:'de-DE', zh:'zh-CN' };
// Jan 1 2023 was Sunday — dayIdx 0→Sun, 1→Mon, …
const shortDay = (dayIdx, locale) =>
  new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2023, 0, 1 + dayIdx));

function DayOfWeekChart({ trades }) {
  const { lang, t } = useLang();
  const locale = LOCALE_MAP[lang] || 'en-US';
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
                {shortDay(d.day, locale)}
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
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginBottom: 3 }}>{shortDay(data[hover].day, locale)}</div>
          <div style={{ color: data[hover].pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700, fontSize: 13 }}>
            {data[hover].pnl >= 0 ? '+' : ''}{data[hover].pnl.toFixed(2)} USDT
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 2 }}>
            {data[hover].trades} {t.dashboard.analytics.tradesLbl} · {data[hover].trades ? Math.round(data[hover].wins / data[hover].trades * 100) : 0}% {t.dashboard.analytics.hWinRate}
          </div>
        </div>
      )}
    </div>
  );
}

function HourOfDayChart({ trades }) {
  const { t } = useLang();
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
            {data[hover].trades} {t.dashboard.analytics.tradesLbl} · {data[hover].trades ? Math.round(data[hover].wins / data[hover].trades * 100) : 0}% {t.dashboard.analytics.hWinRate}
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarHeatmap({ dailyPnl }) {
  const { lang, t } = useLang();
  const locale = { en:'en-US', es:'es-ES', uk:'uk-UA', ru:'ru-RU', de:'de-DE', zh:'zh-CN' }[lang] || 'en-US';
  const [hover, setHover] = useState(null);

  const dayMap = useMemo(() => {
    const m = {};
    for (const d of dailyPnl) m[d.date] = d;
    return m;
  }, [dailyPnl]);

  const maxAbs = useMemo(() => Math.max(...dailyPnl.map(d => Math.abs(d.pnl)), 0.01), [dailyPnl]);

  const { todayStr, weeks, monthLabels } = useMemo(() => {
    const ts = new Date().toISOString().slice(0, 10);
    const start = new Date(ts + 'T00:00:00');
    start.setDate(start.getDate() - 7 * 52);
    start.setDate(start.getDate() - start.getDay());
    const dates = [];
    const cur = new Date(start);
    while (cur.toISOString().slice(0, 10) <= ts) {
      dates.push(new Date(cur).toISOString().slice(0, 10));
      cur.setDate(cur.getDate() + 1);
    }
    const wks = [];
    for (let i = 0; i < dates.length; i += 7) {
      wks.push(dates.slice(i, i + 7).map(ds => ({ date: ds, data: dayMap[ds] || null })));
    }
    const labels = [];
    let prev = -1;
    wks.forEach((week, wi) => {
      const d = new Date(week[0].date + 'T00:00:00');
      const m = d.getMonth();
      if (m !== prev) {
        prev = m;
        labels.push({ text: new Intl.DateTimeFormat(locale, { month: 'short' }).format(d), wi });
      }
    });
    return { todayStr: ts, weeks: wks, monthLabels: labels };
  }, [dayMap, locale]);

  const getColor = data => {
    if (!data) return 'var(--bg-elevated)';
    const alpha = (0.2 + Math.min(Math.abs(data.pnl) / maxAbs, 1) * 0.8).toFixed(2);
    return data.pnl >= 0 ? `rgba(14,203,129,${alpha})` : `rgba(246,70,93,${alpha})`;
  };

  const CELL = 11, STEP = 13, MONTH_H = 18;
  const svgW = weeks.length * STEP;
  const svgH = MONTH_H + 7 * STEP;

  return (
    <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', padding: '16px 16px 8px' }}>
      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ width: svgW, maxWidth: '100%', display: 'block', height: svgH }}
          onMouseLeave={() => setHover(null)}>
          {monthLabels.map((ml, i) => (
            <text key={i} x={ml.wi * STEP + 1} y={13}
              fontSize={9} fill="var(--text-muted)" fontFamily={MONO}>{ml.text}</text>
          ))}
          {weeks.map((week, wi) =>
            week.map((day, di) => day.date <= todayStr && (
              <rect key={`${wi}-${di}`}
                x={wi * STEP} y={MONTH_H + di * STEP}
                width={CELL} height={CELL} rx={2}
                fill={getColor(day.data)}
                style={{ cursor: day.data ? 'pointer' : 'default' }}
                onMouseEnter={() => setHover(day)}
              />
            ))
          )}
        </svg>
      </div>
      <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 11, minHeight: 20, color: 'var(--text-muted)', display: 'flex', gap: 16, alignItems: 'center' }}>
        {hover?.data ? (
          <>
            <span style={{ fontSize: 9, letterSpacing: '0.06em' }}>{hover.date}</span>
            <span style={{ fontWeight: 700, color: hover.data.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
              {hover.data.pnl >= 0 ? '+' : ''}{hover.data.pnl.toFixed(2)} USDT
            </span>
            <span style={{ fontSize: 9 }}>{hover.data.trades} {t.dashboard.analytics.tradesLbl}</span>
          </>
        ) : (
          <span style={{ fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t.dashboard.analytics.hoverDay}</span>
        )}
      </div>
    </div>
  );
}

const CURVE_LOC = { en:'en-US',es:'es-ES',uk:'uk-UA',ru:'ru-RU',de:'de-DE',zh:'zh-CN' };

function EquityCurve({ trades }) {
  const { lang, t } = useLang();
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
    const loc = CURVE_LOC[lang] || 'en-US';
    const sorted = [...trades]
      .filter(t => t.pnl != null)
      .sort((a, b) => parseInt(a.closed_at) - parseInt(b.closed_at));
    let cum = 0;
    return sorted.map(t => {
      cum += parseFloat(t.pnl ?? 0);
      const ms = parseInt(t.closed_at);
      return { t: ms ? new Date(ms).toLocaleDateString(loc, { day: '2-digit', month: '2-digit' }) : '', v: parseFloat(cum.toFixed(2)) };
    });
  }, [trades, lang]);

  const H = 220;
  const PAD = { top: 16, right: 12, bottom: 28, left: 60 };

  const geom = useMemo(() => {
    if (!w || data.length < 2) return null;
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

  if (data.length < 2) return null;

  return (
    <div ref={wrapRef} style={{ background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-base) 100%)', border: '1px solid var(--border-subtle)', position: 'relative', borderRadius: 4 }}>
      {w > 0 && geom && (
        <svg width={w} height={H} style={{ display: 'block', fontFamily: MONO }} onMouseLeave={() => setHover(null)}>
          <defs>
            <linearGradient id="ec-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={geom.color} stopOpacity="0.38" />
              <stop offset="100%" stopColor={geom.color} stopOpacity="0" />
            </linearGradient>
            <filter id="ec-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
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
          <polyline points={geom.pts} fill="none" stroke={geom.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" filter="url(#ec-glow)" opacity={0.85} />
          <polyline points={geom.pts} fill="none" stroke={geom.color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
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
          <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 1 }}>{t.dashboard.analytics.tradesLbl} #{hover + 1} / {data.length}</div>
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 50;

const PNL_LOC = { en:'en-US', es:'es-ES', uk:'uk-UA', ru:'ru-RU', de:'de-DE', zh:'zh-CN' };
const shortMonth = (monthIdx, locale) =>
  new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2000, monthIdx, 1));

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
  const [pnlRows,     setPnlRows]     = useState([]);
  const [hovBar,      setHovBar]      = useState(null);

  const fetchStatic = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };
      const [analyticsRes, balanceRes, pnlRes] = await Promise.all([
        fetch('/api/users/analytics', { headers }),
        fetch('/api/users/balance', { headers }),
        fetch('/api/users/pnl', { headers }),
      ]);
      if (!analyticsRes.ok) throw new Error(`HTTP ${analyticsRes.status}`);
      setData(await analyticsRes.json());
      if (balanceRes.ok) setBalance(await balanceRes.json());
      if (pnlRes.ok) { const d = await pnlRes.json(); setPnlRows(Array.isArray(d) ? d : []); }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTrades = useCallback(async (days) => {
    const headers = { Authorization: `Bearer ${getToken()}` };
    try {
      const res = await fetch(`/api/users/closed-pnl?days=${days}`, { headers });
      if (res.ok) { const j = await res.json(); setAllTrades(j.trades || []); }
    } catch {}
  }, []);

  const fetchData = useCallback((days = 0) => {
    fetchStatic();
    fetchTrades(days);
  }, [fetchStatic, fetchTrades]);

  useEffect(() => { fetchStatic(); fetchTrades(allDays); }, [fetchStatic, fetchTrades]);
  useEffect(() => { fetchTrades(allDays); }, [allDays, fetchTrades]);

  // All stats computed from allTrades so they respond to the period selector
  // NOTE: must be before any early returns (loading/error/noData) to keep hook count stable
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

    // daily PnL — group by calendar date (period-aware: feeds chart + best/worst day stat)
    const dayMap = {};
    for (const t of sorted) {
      const ms = parseInt(t.closed_at);
      if (!ms) continue;
      const d = new Date(ms).toISOString().slice(0, 10);
      if (!dayMap[d]) dayMap[d] = { pnl: 0, trades: 0 };
      dayMap[d].pnl += parseFloat(t.pnl ?? 0);
      dayMap[d].trades += 1;
    }
    const entries = Object.entries(dayMap);
    const dailyPnl = entries.map(([date, v]) => ({ date, pnl: parseFloat(v.pnl.toFixed(2)), trades: v.trades })).sort((a, b) => a.date.localeCompare(b.date));
    const bestDayEntry  = entries.length ? entries.reduce((a, b) => (b[1].pnl > a[1].pnl ? b : a), [null, { pnl: -Infinity }]) : [null, null];
    const worstDayEntry = entries.length ? entries.reduce((a, b) => (b[1].pnl < a[1].pnl ? b : a), [null, { pnl:  Infinity }]) : [null, null];
    const bestDay  = bestDayEntry[0]  ? { date: bestDayEntry[0],  pnl: parseFloat(bestDayEntry[1].pnl.toFixed(2))  } : null;
    const worstDay = worstDayEntry[0] ? { date: worstDayEntry[0], pnl: parseFloat(worstDayEntry[1].pnl.toFixed(2)) } : null;

    return {
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      wins, losses,
      winRate: allTrades.length ? pct(wins, allTrades.length) : '—',
      avgTrade: totalPnl / allTrades.length,
      streak: count, streakDir: dir,
      profitFactor: totalLoss > 0 ? +(totalWin / totalLoss).toFixed(2) : null,
      maxDrawdown: maxDD > 0 ? +maxDD.toFixed(2) : null,
      avgDuration: durCount > 0 ? Math.round(durSum / durCount) : null,
      bestDay, worstDay, dailyPnl,
      byCoin: agg(coinMap),
      bySource: agg(srcMap),
      best:  byDate.slice(0, 5).map(t => ({ coin: t.symbol, pnl: parseFloat(t.pnl ?? 0), closed_at: t.closed_at, side: t.side, source: t.source, duration_min: (() => { const o = parseInt(t.opened_at), c = parseInt(t.closed_at); return (o && c && c > o) ? Math.round((c - o) / 60000) : null; })() })),
      worst: byDate.slice(-5).reverse().map(t => ({ coin: t.symbol, pnl: parseFloat(t.pnl ?? 0), closed_at: t.closed_at, side: t.side, source: t.source, duration_min: (() => { const o = parseInt(t.opened_at), c = parseInt(t.closed_at); return (o && c && c > o) ? Math.round((c - o) / 60000) : null; })() })),
    };
  }, [allTrades]);

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
          {t.dashboard.analytics.noKeyTitle}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-muted)', marginBottom: 28, lineHeight: 1.6 }}>
          {t.dashboard.analytics.noKeyDesc}
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
          {t.dashboard.analytics.noKeyBtn}
        </button>
      </div>
    );
  }

  if (noData && hasKey) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>
          {t.dashboard.analytics.noTradesTitle}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {t.dashboard.analytics.noTradesDesc}
        </div>
      </div>
    );
  }

  const { totalPnl, winRate, avgTrade, streak, streakDir, profitFactor, maxDrawdown, avgDuration, bestDay, worstDay, dailyPnl } = periodStats;
  const mergedBySource = periodStats.bySource;

  const botCols = [
    { key: 'source', label: t.dashboard.analytics.hSource, bold: true, render: r => r.label || r.source },
    { key: 'trades', label: t.dashboard.analytics.hTrades, align: 'right' },
    { key: '_wr', label: t.dashboard.analytics.hWinRate, align: 'right', render: r => pct(r.wins, r.trades) },
    { key: 'pnl', label: t.dashboard.analytics.hPnlUsdt, align: 'right', render: r => `${r.pnl >= 0 ? '+' : ''}${parseFloat(r.pnl).toFixed(2)}` },
    { key: 'avg_win', label: t.dashboard.analytics.hAvgWin, align: 'right', render: r => r.avg_win > 0 ? `+${parseFloat(r.avg_win).toFixed(2)}` : parseFloat(r.avg_win).toFixed(2) },
    { key: 'avg_loss', label: t.dashboard.analytics.hAvgLoss, align: 'right', muted: true, render: r => parseFloat(r.avg_loss || 0).toFixed(2) },
    { key: '_rr', label: 'R:R', align: 'right', muted: true, render: r => r.avg_win > 0 && r.avg_loss < 0 ? (r.avg_win / Math.abs(r.avg_loss)).toFixed(2) : '—' },
  ];

  const coinCols = [
    { key: 'coin', label: t.dashboard.analytics.hCoin, bold: true },
    { key: 'trades', label: t.dashboard.analytics.hTrades, align: 'right' },
    { key: '_wr', label: t.dashboard.analytics.hWinRate, align: 'right', render: r => pct(r.wins, r.trades) },
    { key: 'pnl', label: t.dashboard.analytics.hPnlUsdt, align: 'right', render: r => `${r.pnl >= 0 ? '+' : ''}${parseFloat(r.pnl).toFixed(2)}` },
    { key: 'avg_win', label: t.dashboard.analytics.hAvgWin, align: 'right', render: r => r.avg_win > 0 ? `+${parseFloat(r.avg_win).toFixed(2)}` : '—' },
    { key: 'avg_loss', label: t.dashboard.analytics.hAvgLoss, align: 'right', muted: true, render: r => r.avg_loss < 0 ? parseFloat(r.avg_loss).toFixed(2) : '—' },
    { key: '_rr', label: 'R:R', align: 'right', muted: true, render: r => r.avg_win > 0 && r.avg_loss < 0 ? (r.avg_win / Math.abs(r.avg_loss)).toFixed(2) : '—' },
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
    { key: 'date', label: t.dashboard.hDate, muted: true, render: r => { const ms = parseInt(r.closed_at); const loc = { en:'en-US',es:'es-ES',uk:'uk-UA',ru:'ru-RU',de:'de-DE',zh:'zh-CN' }[lang]||'en-US'; return ms ? new Date(ms).toLocaleDateString(loc, { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'; } },
    { key: 'symbol', label: t.dashboard.hSymbol, bold: true, render: r => r.symbol || '—' },
    { key: 'side', label: t.dashboard.hSide, render: r => <span style={{ color: r.side === 'LONG' ? 'var(--accent-green)' : r.side === 'SHORT' ? 'var(--accent-red)' : 'var(--text-muted)' }}>{r.side || '—'}</span> },
    { key: 'entry_price', label: t.dashboard.hEntry, render: r => r.entry_price ? (+r.entry_price).toFixed(4) : '—' },
    { key: 'exit_price', label: t.dashboard.hExit, render: r => r.exit_price ? (+r.exit_price).toFixed(4) : '—' },
    { key: 'qty', label: t.dashboard.hQty, muted: true, render: r => r.qty ? (+r.qty).toFixed(3) : '—' },
    { key: '_dur', label: t.dashboard.hDur, muted: true, render: fmtDuration },
    { key: 'source', label: t.dashboard.hSource, muted: true, render: r => BOT_LABELS[r.source] || r.source || '—' },
    { key: 'pnl', label: t.dashboard.hPnL, align: 'right', bold: true, render: r => `${(r.pnl ?? 0) >= 0 ? '+' : ''}${(r.pnl ?? 0).toFixed(2)}` },
  ];

  const sign = v => (v >= 0 ? '+' : '') + parseFloat(v ?? 0).toFixed(2);
  const upnl = balance?.unrealized_pnl ?? 0;

  const sparseHint = allTrades.length > 0 && allTrades.length < 5
    ? t.dashboard.analytics?.sparseHint ?? `Поки що ${allTrades.length} закритих торгів. Деякі графіки з'являться, коли набереться більше історії (5+ трейдів).`
    : null;
  const emptyHint = allTrades.length === 0
    ? t.dashboard.analytics?.emptyHint ?? 'Поки що немає закритих торгів. Підключіть API-ключ Bybit на вкладці API Keys і дайте ботам час — статистика з\'явиться автоматично.'
    : null;

  // Equity series for hero sparkline (cumulative PnL ordered by close time)
  const equitySeries = useMemo(() => {
    if (!allTrades.length) return [];
    const sorted = [...allTrades].sort((a, b) => parseInt(a.closed_at) - parseInt(b.closed_at));
    let cum = 0;
    return sorted.map(tr => { cum += parseFloat(tr.pnl ?? 0); return cum; });
  }, [allTrades]);
  const heroIsPos = totalPnl >= 0;

  return (
    <div style={{ color: 'var(--text-primary)', fontFamily: FONT }}>
      <style>{`
        @keyframes kado-skeleton { 0%,100%{opacity:.4} 50%{opacity:.8} }
        @keyframes kado-fadeup { from { opacity:0; transform: translateY(8px); } to { opacity:1; transform: translateY(0); } }
        .kado-fadeup { animation: kado-fadeup 380ms cubic-bezier(.2,.6,.2,1) both; }
        .kado-fadeup-1 { animation-delay: 40ms; }
        .kado-fadeup-2 { animation-delay: 90ms; }
        .kado-fadeup-3 { animation-delay: 140ms; }
      `}</style>

      {/* ── HERO: big PnL + sparkline + 3 KPI side rail ── */}
      <div className="kado-fadeup" style={{
        position: 'relative',
        border: '1px solid var(--border-subtle)',
        background: heroIsPos
          ? 'radial-gradient(120% 100% at 0% 0%, rgba(14,203,129,0.10) 0%, transparent 55%), var(--bg-elevated)'
          : totalPnl < 0
            ? 'radial-gradient(120% 100% at 0% 0%, rgba(246,70,93,0.08) 0%, transparent 55%), var(--bg-elevated)'
            : 'var(--bg-elevated)',
        marginBottom: 1,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
        overflow: 'hidden',
      }}>
        {/* Left: big PnL block */}
        <div style={{ padding: '34px 36px 28px', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 22 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: heroIsPos ? 'var(--accent-green)' : totalPnl < 0 ? 'var(--accent-red)' : 'var(--text-muted)', boxShadow: heroIsPos ? '0 0 12px var(--accent-green)' : totalPnl < 0 ? '0 0 12px var(--accent-red)' : 'none' }} />
              {t.dashboard.analytics.totalPnl}
              <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--text-muted)', opacity: 0.6 }}>
                {allTrades.length} {t.dashboard.analytics.tradesLbl}
              </span>
            </div>
            <div style={{
              fontFamily: MONO, fontWeight: 600, letterSpacing: '-0.05em', lineHeight: 1,
              fontSize: 'clamp(40px, 6vw, 64px)',
              color: heroIsPos ? 'var(--accent-green)' : totalPnl < 0 ? 'var(--accent-red)' : 'var(--text-primary)',
              textShadow: heroIsPos ? '0 0 40px rgba(14,203,129,0.30)' : totalPnl < 0 ? '0 0 40px rgba(246,70,93,0.20)' : 'none',
              display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap',
            }}>
              <span>{totalPnl > 0 ? '+' : ''}{totalPnl.toFixed(2)}</span>
              <span style={{ fontSize: '0.42em', letterSpacing: '0.12em', color: 'var(--text-muted)', fontWeight: 500 }}>USDT</span>
            </div>
          </div>
          {equitySeries.length >= 2 && (
            <div style={{ marginTop: 6 }}>
              <HeroSparkline equity={equitySeries} isPos={heroIsPos} />
            </div>
          )}
        </div>

        {/* Right: 3 supporting KPIs */}
        <div style={{ display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-subtle)' }}>
          {[
            { label: t.dashboard.analytics.winRate, value: winRate, accent: winRate !== '—' && parseFloat(winRate) >= 50 ? 'pos' : (winRate === '—' ? null : 'neg'), sub: `${periodStats.wins}W · ${periodStats.losses}L` },
            { label: t.dashboard.analytics.profitFactor, value: profitFactor == null ? '—' : `${profitFactor}×`, accent: profitFactor == null ? null : (profitFactor >= 1 ? 'pos' : 'neg'), sub: t.dashboard.analytics.grossPerLoss },
            { label: t.dashboard.analytics.maxDrawdown, value: maxDrawdown == null ? '—' : `−${maxDrawdown}`, accent: maxDrawdown == null ? null : 'neg', sub: t.dashboard.analytics.fromPeak },
          ].map((k, i, arr) => {
            const col = k.accent === 'pos' ? 'var(--accent-green)' : k.accent === 'neg' ? 'var(--accent-red)' : 'var(--text-primary)';
            return (
              <div key={k.label} style={{
                flex: 1, padding: '18px 26px',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                display: 'flex', flexDirection: 'column', justifyContent: 'center',
              }}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
                  {k.label}
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, color: col }}>
                    {k.value}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                    {k.sub}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(emptyHint || sparseHint) && (
        <div className="kado-fadeup kado-fadeup-1" style={{
          padding: '14px 18px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderLeft: `2px solid ${emptyHint ? 'var(--accent-amber)' : 'var(--text-muted)'}`,
          marginTop: 1, marginBottom: 24,
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: emptyHint ? 'var(--accent-amber)' : 'var(--text-muted)', flexShrink: 0, paddingTop: 2 }}>INFO</span>
          <span style={{ fontFamily: FONT, fontSize: 12.5, color: 'var(--text-secondary, var(--text-muted))', lineHeight: 1.6 }}>
            {emptyHint || sparseHint}
          </span>
        </div>
      )}

      {/* ── Balance bar — compact horizontal bar with subtle gradient ── */}
      {balance && (
        <div className="kado-fadeup kado-fadeup-1" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          marginTop: 1, marginBottom: 24,
          border: '1px solid var(--border-subtle)',
          background: 'linear-gradient(180deg, var(--bg-elevated) 0%, var(--bg-base) 100%)',
        }}>
          {[
            { label: t.dashboard.analytics.bWallet,     value: `$${parseFloat(balance.usdt_wallet ?? 0).toFixed(2)}`, color: null },
            { label: t.dashboard.analytics.bEquity,     value: `$${parseFloat(balance.usdt_equity ?? 0).toFixed(2)}`, color: null },
            { label: t.dashboard.analytics.bUnrealized, value: `${sign(upnl)} USDT`,  color: upnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
            { label: t.dashboard.analytics.bAvailable,  value: `$${parseFloat(balance.usdt_free ?? 0).toFixed(2)}`, color: null },
          ].map((s, i, arr) => (
            <div key={s.label} style={{
              padding: '16px 22px',
              borderRight: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', color: s.color || 'var(--text-primary)' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Secondary metrics grid ── */}
      <div className="kado-fadeup kado-fadeup-2" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 10,
        marginBottom: 36,
      }}>
        <StatCard
          label={t.dashboard.analytics.totalTrades}
          value={allTrades.length}
          sub={`${periodStats.wins}W · ${periodStats.losses}L`}
          accent={periodStats.wins > periodStats.losses ? 'pos' : periodStats.losses > periodStats.wins ? 'neg' : 'neutral'}
        />
        {bestDay && (
          <StatCard
            label={t.dashboard.analytics.bestDay}
            value={<span style={{ color: bestDay.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{`${bestDay.pnl >= 0 ? '+' : ''}${parseFloat(bestDay.pnl).toFixed(2)}`}</span>}
            sub={bestDay.date}
            accent={bestDay.pnl >= 0 ? 'pos' : 'neg'}
          />
        )}
        {worstDay && (
          <StatCard
            label={t.dashboard.analytics.worstDay}
            value={<span style={{ color: worstDay.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{`${worstDay.pnl >= 0 ? '+' : ''}${parseFloat(worstDay.pnl).toFixed(2)}`}</span>}
            sub={worstDay.date}
            accent={worstDay.pnl >= 0 ? 'pos' : 'neg'}
          />
        )}
        {avgTrade != null && (
          <StatCard
            label={t.dashboard.analytics.avgTrade}
            value={<span style={{ color: avgTrade >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{`${avgTrade >= 0 ? '+' : ''}${avgTrade.toFixed(2)}`}</span>}
            sub="USDT"
            accent={avgTrade >= 0 ? 'pos' : 'neg'}
          />
        )}
        {streak > 0 && (
          <StatCard
            label={t.dashboard.analytics.currentStreak}
            value={<span style={{ color: streakDir ? 'var(--accent-green)' : 'var(--accent-red)' }}>{streak}×</span>}
            sub={streakDir ? t.dashboard.analytics.winning : t.dashboard.analytics.losing}
            accent={streakDir ? 'pos' : 'neg'}
          />
        )}
        {avgDuration != null && (
          <StatCard
            label={t.dashboard.analytics.avgDuration}
            value={avgDuration < 60 ? `${avgDuration}m` : avgDuration < 1440 ? `${Math.floor(avgDuration / 60)}h ${avgDuration % 60}m` : `${Math.floor(avgDuration / 1440)}d`}
            sub={t.dashboard.analytics.perTrade}
            accent="neutral"
          />
        )}
      </div>

      {/* Period selector for trade-based charts */}
      {allTrades.length >= 2 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          {[{ label: '7d', days: 7 }, { label: '30d', days: 30 }, { label: '90d', days: 90 }, { label: t.dashboard.analytics.all, days: 0 }].map(p => (
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
            {allTrades.length} {t.dashboard.analytics.tradesLbl}
          </span>
        </div>
      )}

      {/* Daily PnL chart — period-aware */}
      {dailyPnl.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title={t.dashboard.analytics.dailyPnl} right={allDays === 0 ? t.dashboard.analytics.allTime : `${t.dashboard.analytics.lastDays} ${allDays}d`} />
          <DailyChart daily={dailyPnl} t={t} />
        </div>
      )}

      {/* Trading calendar heatmap — all-time only; filtered periods leave most cells empty */}
      {allDays === 0 && dailyPnl.length >= 7 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title={t.dashboard.analytics.calendarHeatmap} right={t.dashboard.analytics.allTime} />
          <CalendarHeatmap dailyPnl={dailyPnl} />
        </div>
      )}

      {/* Equity curve */}
      {allTrades.length >= 2 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title={t.dashboard.analytics.equityCurve} right={allDays === 0 ? t.dashboard.analytics.allTime : `${t.dashboard.analytics.lastDays} ${allDays}d`} />
          <EquityCurve trades={allTrades} />
        </div>
      )}

      {/* Day of week breakdown */}
      {allTrades.length >= 3 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title={t.dashboard.analytics.dayOfWeek} right={t.dashboard.analytics.avgByWeekday} />
          <DayOfWeekChart trades={allTrades} />
        </div>
      )}

      {/* Hour of day breakdown */}
      {allTrades.length >= 4 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title={t.dashboard.analytics.hourOfDay} right={t.dashboard.analytics.cumByHour} />
          <HourOfDayChart trades={allTrades} />
        </div>
      )}

      {/* Long vs Short breakdown */}
      {allTrades.length >= 2 && (() => {
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
            <SectionLabel title={t.dashboard.analytics.longVsShort} right={t.dashboard.analytics.dirBreakdown} />
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
                        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>{t.dashboard.analytics.hTrades}</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-primary)' }}>{s.trades}</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>{t.dashboard.analytics.hWinRate}</div>
                        <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-primary)' }}>{wr}%</div>
                      </div>
                      <div>
                        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>{t.dashboard.analytics.avgTrade}</div>
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
                  getRowColor={(k, r) => k === 'pnl' ? (parseFloat(r.pnl) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : k === 'avg_win' ? 'var(--accent-green)' : k === 'avg_loss' ? 'var(--accent-red)' : k === '_rr' && r.avg_win > 0 && r.avg_loss < 0 ? (r.avg_win / Math.abs(r.avg_loss) >= 1 ? 'var(--accent-green)' : 'var(--accent-red)') : null}
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
          {/* Visual PnL bar chart */}
          {(() => {
            const sorted = [...mergedBySource].sort((a, b) => b.pnl - a.pnl);
            const maxAbs = Math.max(...sorted.map(r => Math.abs(r.pnl)), 0.01);
            return (
              <div style={{ border: '1px solid var(--border-subtle)', borderBottom: 'none', marginBottom: 0 }}>
                {sorted.map((r, i) => {
                  const pnl = parseFloat(r.pnl);
                  const pos = pnl >= 0;
                  const barW = Math.abs(pnl) / maxAbs * 100;
                  const wr = r.trades ? Math.round(r.wins / r.trades * 100) : 0;
                  return (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '110px 1fr 90px 60px',
                      alignItems: 'center', gap: 12,
                      padding: '9px 16px',
                      borderBottom: '1px solid var(--border-subtle)',
                      background: 'var(--bg-base)',
                    }}>
                      <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.label || r.source}
                      </span>
                      <div style={{ height: 6, background: 'var(--bg-elevated)', borderRadius: 1, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${barW}%`,
                          background: pos ? 'rgba(14,203,129,0.7)' : 'rgba(246,70,93,0.7)',
                          borderRadius: 1,
                        }} />
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, textAlign: 'right', color: pos ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {pos ? '+' : ''}{pnl.toFixed(2)}
                      </span>
                      <span style={{ fontFamily: MONO, fontSize: 10, textAlign: 'right', color: wr >= 50 ? 'var(--accent-green)' : 'var(--text-muted)' }}>
                        {r.trades ? `${wr}%` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderTop: 'none' }}>
            <DataTable
              cols={botCols}
              rows={[...mergedBySource].sort((a, b) => {
                let va, vb;
                if (botSort === '_wr') { va = a.trades ? a.wins / a.trades : 0; vb = b.trades ? b.wins / b.trades : 0; }
                else { va = parseFloat(a[botSort] ?? 0); vb = parseFloat(b[botSort] ?? 0); }
                return botSortAsc ? va - vb : vb - va;
              })}
              getRowColor={(k, r) => k === 'pnl' ? (parseFloat(r.pnl) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : k === 'avg_win' ? 'var(--accent-green)' : k === 'avg_loss' ? 'var(--accent-red)' : k === '_rr' && r.avg_win > 0 && r.avg_loss < 0 ? (r.avg_win / Math.abs(r.avg_loss) >= 1 ? 'var(--accent-green)' : 'var(--accent-red)') : null}
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
            <SectionLabel title={t.dashboard.analytics.allTradesTitle} right={`${filtered.length !== allTrades.length ? `${filtered.length} / ` : ''}${allTrades.length} ${t.dashboard.analytics.total}`} />
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
                placeholder={t.dashboard.searchCoin}
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
                  <option value="ALL">{t.dashboard.analytics.allBots}</option>
                  {sources.map(s => (
                    <option key={s} value={s}>{BOT_LABELS[s] || s}</option>
                  ))}
                </select>
              )}
              {filtered.length > 0 && (
                <button onClick={() => exportTradesCSV(filtered)}
                  style={{ ...btnSide, marginLeft: 'auto', flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >↓ CSV</button>
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
                >{t.dashboard.analytics.prev}</button>
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
                >{t.dashboard.analytics.next}</button>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Monthly PnL (from PnL tab) ─────────────────────────── */}
      {pnlRows.length > 0 && (() => {
        const locale = PNL_LOC[lang] || 'en-US';
        const totalGross = pnlRows.reduce((s, r) => s + r.gross_pnl, 0);
        const totalFee   = pnlRows.reduce((s, r) => s + r.performance_fee, 0);
        const totalNet   = pnlRows.reduce((s, r) => s + r.net_pnl, 0);
        const maxAbs     = Math.max(...pnlRows.map(r => Math.abs(r.gross_pnl)), 1);
        const multiYear  = new Set(pnlRows.map(r => r.year)).size > 1;
        const reversed   = [...pnlRows].reverse();

        // cumulative net PnL line
        const sorted  = [...pnlRows].sort((a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month));
        let cum = 0;
        const cumPts  = sorted.map(r => { cum += r.net_pnl; return parseFloat(cum.toFixed(2)); });
        const minV    = Math.min(...cumPts, 0);
        const maxV    = Math.max(...cumPts, 0);
        const range   = (maxV - minV) || 1;
        const cumH    = 64, cumN = cumPts.length;
        const cumXs   = cumPts.map((_, i) => (i / Math.max(cumN - 1, 1)) * 100);
        const cumYs   = cumPts.map(v => cumH - ((v - minV) / range) * cumH);
        const linePth = cumXs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${cumYs[i].toFixed(1)}`).join(' ');
        const areaPth = `${linePth} L${cumXs[cumXs.length-1].toFixed(1)},${cumH} L0,${cumH} Z`;
        const cumPos  = cumPts[cumPts.length - 1] >= 0;
        const cumCol  = cumPos ? 'var(--accent-green)' : 'var(--accent-red)';

        const pnlTableCols = [
          { key: 'month',  label: t.dashboard.hMonth, render: r => `${shortMonth(r.month - 1, locale)} ${r.year}` },
          { key: 'gross',  label: t.dashboard.pnl.hGrossPnl, align: 'right', render: r => `${r.gross_pnl >= 0 ? '+' : ''}${r.gross_pnl.toFixed(2)}` },
          { key: 'fee',    label: t.dashboard.pnl.hFee,      align: 'right', muted: true, render: r => r.performance_fee.toFixed(2) },
          { key: 'net',    label: t.dashboard.pnl.hNetPnl,   align: 'right', render: r => `${r.net_pnl >= 0 ? '+' : ''}${r.net_pnl.toFixed(2)}` },
          { key: 'paid',   label: t.dashboard.pnl.hPaid,     align: 'right', muted: true, render: r => r.fee_paid ? '✓' : '—' },
        ];

        return (
          <div style={{ marginBottom: 32, marginTop: 32 }}>
            <SectionLabel title={t.dashboard.pnl.monthlyGrossPnl} right={`${pnlRows.length} ${t.dashboard.analytics.tradesLbl.replace('trades','mo').trim()}`} />

            {/* Stat cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--border-subtle)', marginBottom: 1 }}>
              {[
                { label: t.dashboard.pnl.totalGross, val: totalGross, col: true },
                { label: t.dashboard.pnl.totalFee,   val: totalFee,   col: false },
                { label: t.dashboard.pnl.totalNet,   val: totalNet,   col: true },
              ].map(({ label, val, col }) => (
                <div key={label} style={{ padding: '18px 20px', background: 'var(--bg-base)' }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>{label}</div>
                  <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: col ? (val >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : 'var(--text-primary)' }}>
                    {val >= 0 ? '+' : ''}{val.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {/* Monthly bar chart */}
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', padding: '12px 16px 8px', marginBottom: 1, position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80 }}>
                {reversed.map((r, i) => {
                  const h = Math.abs(r.gross_pnl) / maxAbs * 64;
                  const pos = r.gross_pnl >= 0;
                  const isH = hovBar === i;
                  return (
                    <div key={`${r.year}-${r.month}`}
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'default' }}
                      onMouseEnter={() => setHovBar(i)} onMouseLeave={() => setHovBar(null)}>
                      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', height: 66 }}>
                        <div style={{ marginTop: 'auto', width: '100%', height: Math.max(h, 2),
                          background: pos ? (isH ? 'var(--accent-green)' : 'rgba(14,203,129,0.65)') : (isH ? 'var(--accent-red)' : 'rgba(246,70,93,0.65)'),
                          transition: 'background 100ms' }} />
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 8, color: isH ? 'var(--text-secondary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {shortMonth(r.month - 1, locale)}{multiYear ? ` '${String(r.year).slice(2)}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
              {hovBar != null && reversed[hovBar] && (
                <div style={{
                  position: 'absolute', top: 8,
                  left: `${(hovBar / reversed.length + 0.5 / reversed.length) * 100}%`,
                  transform: 'translateX(-50%)',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                  padding: '7px 12px', fontFamily: MONO, fontSize: 11,
                  pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
                }}>
                  <div style={{ color: 'var(--text-muted)', fontSize: 9, marginBottom: 3 }}>
                    {shortMonth(reversed[hovBar].month - 1, locale)} {reversed[hovBar].year}
                  </div>
                  <div style={{ color: reversed[hovBar].gross_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700, fontSize: 13 }}>
                    {reversed[hovBar].gross_pnl >= 0 ? '+' : ''}{reversed[hovBar].gross_pnl.toFixed(2)} {t.dashboard.pnl.gross}
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 1 }}>
                    {t.dashboard.pnl.net} {reversed[hovBar].net_pnl >= 0 ? '+' : ''}{reversed[hovBar].net_pnl.toFixed(2)}
                  </div>
                </div>
              )}
            </div>

            {/* Cumulative net PnL line */}
            {cumN >= 2 && (
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderTop: 'none', padding: '10px 16px 8px', marginBottom: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{t.dashboard.pnl.cumNetPnl}</div>
                  <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: cumCol }}>
                    {cumPos ? '+' : ''}{cumPts[cumPts.length - 1].toFixed(2)} USDT
                  </div>
                </div>
                <svg viewBox={`0 0 100 ${cumH}`} preserveAspectRatio="none" style={{ width: '100%', height: cumH, display: 'block' }}>
                  <path d={areaPth} fill={cumPos ? 'rgba(14,203,129,0.08)' : 'rgba(246,70,93,0.08)'} />
                  <path d={linePth} fill="none" stroke={cumCol} strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
                  <circle cx={cumXs[cumXs.length-1].toFixed(1)} cy={cumYs[cumYs.length-1].toFixed(1)} r="2" fill={cumCol} vectorEffect="non-scaling-stroke" />
                </svg>
              </div>
            )}

            {/* Monthly table */}
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderTop: 'none' }}>
              <DataTable
                cols={pnlTableCols}
                rows={pnlRows}
                getRowColor={(k, r) => k === 'gross' ? (r.gross_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : k === 'net' ? (r.net_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : null}
              />
            </div>
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
