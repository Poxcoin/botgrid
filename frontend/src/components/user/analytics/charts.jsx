import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLang } from '@/lib/LangContext';
import { MONO, LOCALE_MAP, shortDay } from './atoms';

export function DailyChart({ daily, t }) {
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

export function DayOfWeekChart({ trades }) {
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

export function HourOfDayChart({ trades }) {
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

  return (
    <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', padding: '16px 12px 8px', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 90, position: 'relative' }}>
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

export function CalendarHeatmap({ dailyPnl }) {
  const { lang, t } = useLang();
  const locale = LOCALE_MAP[lang] || 'en-US';
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

export function EquityCurve({ trades }) {
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
    const loc = LOCALE_MAP[lang] || 'en-US';
    const sorted = [...trades]
      .filter(tr => tr.pnl != null)
      .sort((a, b) => parseInt(a.closed_at) - parseInt(b.closed_at));
    let cum = 0;
    return sorted.map(tr => {
      cum += parseFloat(tr.pnl ?? 0);
      const ms = parseInt(tr.closed_at);
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
          {geom.yTicks.map((tk, i) => (
            <g key={i}>
              <line x1={PAD.left} x2={w - PAD.right} y1={tk.y} y2={tk.y}
                stroke={tk.v === 0 ? 'var(--border-default)' : 'var(--border-subtle)'}
                strokeWidth={tk.v === 0 ? 1 : 0.5} strokeDasharray={tk.v === 0 ? '0' : '3 4'} />
              <text x={PAD.left - 6} y={tk.y + 3.5} textAnchor="end" fontSize={9} fill="var(--text-muted)">
                {tk.v >= 0 ? (tk.v === 0 ? '0' : `+${tk.v.toFixed(0)}`) : tk.v.toFixed(0)}
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
