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

function DataTable({ cols, rows, getRowColor }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key} style={{
                textAlign: c.align || 'left', padding: '6px 12px',
                borderBottom: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)', fontWeight: 400, letterSpacing: '0.1em', fontSize: 9, textTransform: 'uppercase',
              }}>{c.label}</th>
            ))}
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
  const closedMs = parseInt(tr.closed_at);
  const dateStr = closedMs ? new Date(closedMs).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) : '—';
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

export default function AnalyticsTab() {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allTrades, setAllTrades] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };
      const [analyticsRes, tradesRes, balanceRes] = await Promise.all([
        fetch('/api/users/analytics', { headers }),
        fetch('/api/users/closed-pnl?days=0', { headers }),
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

  useEffect(() => { fetchData(); }, [fetchData]);

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
        <button onClick={fetchData} style={{
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

  const winRate = summary?.total_trades ? pct(summary.wins, summary.total_trades) : '—';
  const totalPnl = summary?.total_pnl ?? 0;
  const bestDay = daily?.length ? daily.reduce((a, b) => (b.pnl > a.pnl ? b : a), daily[0]) : null;

  // Merge rows that share the same display label (e.g. "news"+"signal" → single "Signal Bot" row)
  const mergedBySource = Object.values(
    (data?.by_source ?? []).reduce((acc, r) => {
      const key = r.label || r.source;
      if (!acc[key]) {
        acc[key] = { ...r, _winSum: r.wins * (r.avg_win || 0), _lossSum: (r.trades - r.wins) * (r.avg_loss || 0) };
      } else {
        const prev = acc[key];
        const losses = r.trades - r.wins;
        prev.trades   += r.trades;
        prev.pnl       = +(prev.pnl + r.pnl).toFixed(2);
        prev.wins     += r.wins;
        prev._winSum  += r.wins * (r.avg_win || 0);
        prev._lossSum += losses * (r.avg_loss || 0);
      }
      return acc;
    }, {})
  ).map(r => ({
    ...r,
    avg_win:  r.wins > 0           ? +(r._winSum  / r.wins).toFixed(2)               : 0,
    avg_loss: (r.trades - r.wins) > 0 ? +(r._lossSum / (r.trades - r.wins)).toFixed(2) : 0,
  })).sort((a, b) => b.pnl - a.pnl);

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
  ];

  const allTradesCols = [
    { key: 'date', label: 'Date', muted: true, render: r => { const ms = parseInt(r.closed_at); return ms ? new Date(ms).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'; } },
    { key: 'symbol', label: 'Symbol', bold: true, render: r => r.symbol || '—' },
    { key: 'side', label: 'Side', render: r => r.side || '—' },
    { key: 'entry_price', label: 'Entry', render: r => r.entry_price ? (+r.entry_price).toFixed(4) : '—' },
    { key: 'exit_price', label: 'Exit', render: r => r.exit_price ? (+r.exit_price).toFixed(4) : '—' },
    { key: 'qty', label: 'Qty', muted: true, render: r => r.qty ? (+r.qty).toFixed(3) : '—' },
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
          value={summary?.total_trades ?? 0}
          sub={`${summary?.wins ?? 0}W · ${summary?.losses ?? 0}L`}
        />
        <StatCard
          label={t.dashboard.analytics.totalPnl}
          value={`${totalPnl >= 0 ? '+' : ''}${totalPnl} USDT`}
        />
        <StatCard
          label={t.dashboard.analytics.winRate}
          value={winRate}
          sub={`${summary?.wins ?? 0} ${t.dashboard.analytics.wins}`}
        />
        <StatCard
          label={t.dashboard.analytics.bestDay}
          value={bestDay ? `${bestDay.pnl >= 0 ? '+' : ''}${parseFloat(bestDay.pnl).toFixed(2)}` : '—'}
          sub={bestDay?.date ?? ''}
        />
      </div>

      {/* Daily PnL chart — last 30 days */}
      <div style={{ marginBottom: 32 }}>
        <SectionLabel title={t.dashboard.analytics.dailyPnl30} />
        <DailyChart daily={daily} t={t} />
      </div>

      {/* Equity curve — all-time cumulative PnL */}
      {allTrades.length >= 2 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title="Equity Curve" right={`${allTrades.length} trades · all time`} />
          <EquityCurve trades={allTrades} />
        </div>
      )}

      {/* By coin — card grid like bot CoinTicker */}
      {by_coin && by_coin.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title={t.dashboard.analytics.byCoin} right={`${by_coin.length} ${t.dashboard.analytics.coinsSort}`} />
          <CoinGrid coins={by_coin} />
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
            <DataTable cols={botCols} rows={mergedBySource}
              getRowColor={(k, r) => k === 'pnl' ? (parseFloat(r.pnl) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : null}
            />
          </div>
        </div>
      )}

      {/* Top 5 best / worst trades */}
      {(best?.length > 0 || worst?.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32 }}>
          {best?.length > 0 && (
            <div>
              <SectionLabel title={t.dashboard.analytics.topBest} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {best.map((tr, i) => <TradeRow key={i} tr={tr} />)}
              </div>
            </div>
          )}
          {worst?.length > 0 && (
            <div>
              <SectionLabel title={t.dashboard.analytics.topWorst} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {worst.map((tr, i) => <TradeRow key={i} tr={tr} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* All trades — single column, newest first */}
      {allTrades.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title="All Trades" right={`${allTrades.length} total`} />
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
            <DataTable
              cols={allTradesCols}
              rows={[...allTrades].sort((a, b) => parseInt(b.closed_at) - parseInt(a.closed_at))}
              getRowColor={(k, r) => k === 'pnl' ? ((r.pnl ?? 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : null}
            />
          </div>
        </div>
      )}

      <div style={{ paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>
        <button onClick={fetchData} style={{
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
