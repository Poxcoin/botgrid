import React, { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { useTheme } from '@/lib/ThemeContext';
import { useLang } from '@/lib/LangContext';
import { StatCard, MONO, LOCALE_MAP, getToken } from './analytics/atoms';
import { EquityCurve } from './analytics/charts';

const B     = 'var(--border-subtle)';
const MUTED = 'var(--text-muted)';
const C_UP  = '#0ecb81';
const C_DN  = '#f6465d';

const TF_OPTIONS = [
  { v: '1',   l: '1m'  },
  { v: '5',   l: '5m'  },
  { v: '15',  l: '15m' },
  { v: '60',  l: '1h'  },
  { v: '240', l: '4h'  },
  { v: 'D',   l: '1D'  },
];

const SYMBOLS = {
  macro: [
    { label: 'EUR/USD', api: 'EUR/USD' },
    { label: 'GBP/USD', api: 'GBP/USD' },
  ],
  gold: [
    { label: 'XAU/USD', api: 'XAU/USD' },
  ],
};

const api = p =>
  fetch(p, { headers: { Authorization: `Bearer ${getToken()}` } })
    .then(r => r.ok ? r.json() : null)
    .catch(() => null);

/* ── ForexChart ───────────────────────────────────────────────── */
function ForexChart({ symbols }) {
  const { theme } = useTheme();
  const dark = theme !== 'light';
  const [symIdx, setSymIdx] = useState(0);
  const [tf, setTf] = useState('60');

  const wrapRef  = useRef(null);
  const chartRef = useRef(null);
  const candleRef = useRef(null);
  const volRef   = useRef(null);
  const timerRef = useRef(null);

  const sym = symbols[symIdx]?.api;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const isDark = theme !== 'light';
    const tClr = isDark ? 'rgba(240,242,245,0.45)' : 'rgba(10,10,10,0.45)';
    const gClr = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    const bClr = isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
    const lBg  = isDark ? '#1a1a1a' : '#f0f0f0';

    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: 'transparent' },
        textColor: tClr,
        fontFamily: "'Courier New','SF Mono',monospace",
        fontSize: 10,
      },
      grid: { vertLines: { color: gClr }, horzLines: { color: gClr } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', labelBackgroundColor: lBg },
        horzLine: { color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', labelBackgroundColor: lBg },
      },
      rightPriceScale: { borderColor: bClr },
      timeScale: { borderColor: bClr, timeVisible: true, secondsVisible: false },
    });

    const candle = chart.addCandlestickSeries({
      upColor: C_UP, downColor: C_DN,
      borderUpColor: C_UP, borderDownColor: C_DN,
      wickUpColor: C_UP, wickDownColor: C_DN,
    });
    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

    chartRef.current  = chart;
    candleRef.current = candle;
    volRef.current    = vol;

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      try { chart.remove(); } catch {}
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
    };
  }, []); // eslint-disable-line

  /* theme update without remount */
  useEffect(() => {
    if (!chartRef.current) return;
    const isDark = theme !== 'light';
    chartRef.current.applyOptions({
      layout: { textColor: isDark ? 'rgba(240,242,245,0.45)' : 'rgba(10,10,10,0.45)' },
      grid: {
        vertLines: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' },
        horzLines: { color: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' },
      },
    });
  }, [theme]);

  /* load data on symbol / tf change */
  useEffect(() => {
    if (!candleRef.current || !sym) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const load = () =>
      api(`/api/forex/ohlcv?symbol=${encodeURIComponent(sym)}&interval=${tf}`)
        .then(bars => {
          if (!Array.isArray(bars) || !candleRef.current) return;
          const sorted = [...bars].sort((a, b) => a.time - b.time);
          candleRef.current.setData(sorted.map(b => ({
            time: b.time, open: b.open, high: b.high, low: b.low, close: b.close,
          })));
          volRef.current?.setData(sorted.map(b => ({
            time: b.time, value: b.volume ?? 1,
            color: b.close >= b.open ? C_UP + '55' : C_DN + '55',
          })));
          chartRef.current?.timeScale().fitContent();
        });

    load();
    timerRef.current = setInterval(load, 3 * 60_000);
    return () => clearInterval(timerRef.current);
  }, [sym, tf]);

  return (
    <div style={{ marginBottom: 24 }}>
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {symbols.map((o, i) => (
            <button key={o.api} onClick={() => setSymIdx(i)} style={{
              fontFamily: MONO, fontSize: 10, padding: '4px 12px',
              border: `1px solid ${i === symIdx ? 'var(--border-default)' : B}`,
              borderRadius: 100, cursor: 'pointer',
              background: i === symIdx ? 'var(--bg-elevated)' : 'transparent',
              color: i === symIdx ? 'var(--text-primary)' : MUTED,
              letterSpacing: '0.08em',
            }}>{o.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {TF_OPTIONS.map(({ v, l }) => (
            <button key={v} onClick={() => setTf(v)} style={{
              fontFamily: MONO, fontSize: 10, padding: '4px 9px',
              border: `1px solid ${tf === v ? 'var(--border-default)' : B}`,
              borderRadius: 100, cursor: 'pointer',
              background: tf === v ? 'var(--bg-elevated)' : 'transparent',
              color: tf === v ? 'var(--text-primary)' : MUTED,
              letterSpacing: '0.06em',
            }}>{l}</button>
          ))}
        </div>
      </div>

      <div
        ref={wrapRef}
        style={{
          width: '100%',
          height: 380,
          background: 'var(--bg-base)',
          border: `1px solid ${B}`,
          position: 'relative',
        }}
      />
    </div>
  );
}

/* ── no MT5 key banner ────────────────────────────────────────── */
function NoKeyBanner() {
  const { t } = useLang();
  const tm = t.dashboard.macro;
  return (
    <div style={{ border: `1px solid ${B}`, padding: '32px 24px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-primary)', marginBottom: 6 }}>{tm.noMt5Title}</div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, lineHeight: 1.6 }}>{tm.noMt5Desc}</div>
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

  /* normalize for EquityCurve */
  const curveData = closed
    .filter(t => t.close_time)
    .map(t => ({
      pnl:       t.profit_usd,
      closed_at: String(new Date(t.close_time).getTime()),
    }));

  const locale = LOCALE_MAP[lang] || 'en-US';

  if (mt5 === undefined) return null;

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>{desc}</div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>{title}</div>
      </div>

      {/* Live price chart */}
      <ForexChart symbols={SYMBOLS[botId] || SYMBOLS.macro} />

      {!mt5Configured && <NoKeyBanner />}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard label={tm.statTrades} value={closed.length || '—'} />
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
        <StatCard label={tm.statStrategy} value={pfStr} sub="profit factor" />
      </div>

      {/* Equity curve — only when trades exist */}
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
