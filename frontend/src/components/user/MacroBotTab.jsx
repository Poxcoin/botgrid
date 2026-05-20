import React, { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { useTheme } from '@/lib/ThemeContext';
import { useLang } from '@/lib/LangContext';

const B     = 'var(--border-subtle)';
const MUTED = 'var(--text-muted)';
const MONO  = 'var(--font-mono)';
const C_UP  = '#0ecb81';
const C_DN  = '#f6465d';

const TF_OPTIONS = [
  { v: '1', l: '1m' }, { v: '5', l: '5m' }, { v: '15', l: '15m' },
  { v: '60', l: '1h' }, { v: '240', l: '4h' }, { v: 'D', l: '1D' },
];

const SYMS = {
  macro: [{ label: 'EUR/USD', api: 'EUR/USD' }, { label: 'GBP/USD', api: 'GBP/USD' }],
  gold:  [{ label: 'XAU/USD', api: 'XAU/USD' }],
};

const LOCALE_MAP = { en:'en-US', es:'es-ES', uk:'uk-UA', ru:'ru-RU', de:'de-DE', zh:'zh-CN' };

const apiGet = p =>
  fetch(p, { headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}` } })
    .then(r => r.ok ? r.json() : null).catch(() => null);

/* ── same StatBox as BotTab ───────────────────────────────────── */
function StatBox({ label, value, sub, color }) {
  return (
    <div
      style={{
        flex: 1, background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 12, padding: '20px 22px',
        transition: 'border-color 200ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
    >
      <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED, fontFamily: MONO, marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: MONO, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginTop: 8, fontFamily: MONO }}>{sub}</div>}
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

/* ── forex candlestick chart ──────────────────────────────────── */
function ForexChart({ symbols }) {
  const { theme } = useTheme();
  const [symIdx, setSymIdx] = useState(0);
  const [tf, setTf]         = useState('60');

  const wrapRef  = useRef(null);
  const chartRef = useRef(null);
  const candleRef = useRef(null);
  const volRef   = useRef(null);
  const timerRef = useRef(null);

  const sym = symbols[symIdx]?.api;

  /* init chart once */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const dark = theme !== 'light';
    const tClr = dark ? 'rgba(240,242,245,0.45)' : 'rgba(10,10,10,0.45)';
    const gClr = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    const bClr = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)';
    const lBg  = dark ? '#1a1a1a' : '#f0f0f0';

    const chart = createChart(el, {
      width:  el.offsetWidth || 600,
      height: 380,
      layout: { background: { color: 'transparent' }, textColor: tClr, fontFamily: MONO, fontSize: 10 },
      grid: { vertLines: { color: gClr }, horzLines: { color: gClr } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', labelBackgroundColor: lBg },
        horzLine: { color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', labelBackgroundColor: lBg },
      },
      rightPriceScale: { borderColor: bClr },
      timeScale: { borderColor: bClr, timeVisible: true, secondsVisible: false },
      handleScroll: true,
      handleScale: true,
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

    /* resize observer */
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      if (w && chartRef.current) chartRef.current.applyOptions({ width: w });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      if (timerRef.current) clearInterval(timerRef.current);
      try { chart.remove(); } catch {}
      chartRef.current = null; candleRef.current = null; volRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* theme update without remount */
  useEffect(() => {
    if (!chartRef.current) return;
    const dark = theme !== 'light';
    chartRef.current.applyOptions({
      layout: { textColor: dark ? 'rgba(240,242,245,0.45)' : 'rgba(10,10,10,0.45)' },
      grid: {
        vertLines: { color: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' },
        horzLines: { color: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)' },
      },
    });
  }, [theme]);

  /* load + poll on symbol/tf change */
  useEffect(() => {
    if (!candleRef.current || !sym) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const load = () =>
      apiGet(`/api/forex/ohlcv?symbol=${encodeURIComponent(sym)}&interval=${tf}`)
        .then(bars => {
          if (!Array.isArray(bars) || !candleRef.current) return;
          const sorted = [...bars].sort((a, b) => a.time - b.time);
          candleRef.current.setData(sorted.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
          volRef.current?.setData(sorted.map(b => ({ time: b.time, value: b.volume || 0, color: b.close >= b.open ? C_UP + '55' : C_DN + '55' })));
          chartRef.current?.timeScale().fitContent();
        });

    load();
    timerRef.current = setInterval(load, 3 * 60_000);
    return () => clearInterval(timerRef.current);
  }, [sym, tf]);

  return (
    <div style={{ marginBottom: 24 }}>
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
            }}>{l}</button>
          ))}
        </div>
      </div>
      <div ref={wrapRef} style={{ width: '100%', height: 380, background: 'var(--bg-base)', border: `1px solid ${B}` }} />
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
      apiGet('/api/macro/trades?limit=100'),
      apiGet('/api/macro/stats'),
      apiGet('/api/users/mt5-keys'),
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
  const pf      = stats?.profit_factor;

  const locale = LOCALE_MAP[lang] || 'en-US';

  if (mt5 === undefined) return null;

  return (
    <div style={{ padding: '0 0 40px' }}>

      {/* ── stats ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatBox
          label={tm.statTrades}
          value={closed.length || '—'}
          sub={tm.m1?.tag || 'MT5 · IC Markets'}
        />
        <StatBox
          label={tm.statWinRate}
          value={winRate != null ? `${winRate}%` : '—'}
          color={winRate != null ? (winRate >= 50 ? 'var(--accent-green)' : 'var(--accent-red)') : undefined}
          sub={closed.length ? `${wins}W / ${closed.length - wins}L` : null}
        />
        <StatBox
          label={tm.statNetPnl}
          value={closed.length ? `${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)}` : '—'}
          color={netPnl > 0 ? 'var(--accent-green)' : netPnl < 0 ? 'var(--accent-red)' : undefined}
          sub="USDT"
        />
        <StatBox
          label="Profit Factor"
          value={pf != null && isFinite(pf) ? pf.toFixed(2) : '—'}
          sub="all time"
        />
      </div>

      {/* ── no key banner ─────────────────────────────────────── */}
      {mt5?.configured !== true && <NoKeyBanner />}

      {/* ── chart ─────────────────────────────────────────────── */}
      <ForexChart symbols={SYMS[botId] || SYMS.macro} />

      {/* ── trades table ─────────────────────────────────────── */}
      <div style={{ border: `1px solid ${B}`, marginBottom: 24 }}>
        <div style={{ padding: '0 20px', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${B}` }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: MUTED }}>{tm.recentTrades}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: '0.12em' }}>MT5 · IC MARKETS</span>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontFamily: MONO, fontSize: 11, color: MUTED }}>{tm.noTradesYet}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${B}` }}>
                  {[tm.colSymbol, tm.colEvent, tm.colDir, tm.colPips, tm.colUsd, tm.colTime].map((h, i) => (
                    <th key={h} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '8px 16px', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED, fontWeight: 400 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 30).map((tr, i) => {
                  const pos   = tr.profit_usd > 0;
                  const dt    = tr.close_time || tr.open_time;
                  const dtStr = dt ? new Date(dt).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
                  return (
                    <tr key={i} style={{ borderBottom: `1px solid ${B}` }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 700 }}>{tr.symbol}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-secondary)', fontSize: 10 }}>{tr.event || '—'}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: tr.direction === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)' }}>{tr.direction}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: MUTED }}>{tr.profit_pips != null ? `${tr.profit_pips > 0 ? '+' : ''}${tr.profit_pips}` : '—'}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: pos ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {tr.profit_usd != null ? `${pos ? '+' : ''}${tr.profit_usd.toFixed(2)}` : '—'}
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
