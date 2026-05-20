import React, { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { useTheme } from '@/lib/ThemeContext';
import { useLang } from '@/lib/LangContext';
import { useIsMobile } from '@/lib/useIsMobile';

const FM = 'var(--font-mono)';
const FF = 'var(--font-sans)';
const C_UP = '#0ecb81';
const C_DN = '#f6465d';

const TF_LABELS = { '1':'1m','5':'5m','15':'15m','60':'1h','240':'4h','D':'1D' };

const SYMS = {
  macro: [{ label: 'EUR/USD', api: 'EUR/USD' }, { label: 'GBP/USD', api: 'GBP/USD' }],
  gold:  [{ label: 'XAU/USD', api: 'XAU/USD' }],
};

const LOCALE_MAP = { en:'en-US', es:'es-ES', uk:'uk-UA', ru:'ru-RU', de:'de-DE', zh:'zh-CN' };

const apiGet = p =>
  fetch(p, { headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}` } })
    .then(r => r.ok ? r.json() : null).catch(() => null);

const sign = v => { const n = +v; return isNaN(n) ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2); };

/* ── no MT5 key banner ────────────────────────────────────────────────────── */
function NoKeyBanner() {
  const { t } = useLang();
  const tm = t.dashboard.macro;
  return (
    <div style={{ border: '1px solid var(--border-subtle)', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', flexShrink: 0 }}>
      <div>
        <div style={{ fontFamily: FM, fontSize: 11, color: 'var(--text-primary)', marginBottom: 6 }}>{tm.noMt5Title}</div>
        <div style={{ fontFamily: FM, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>{tm.noMt5Desc}</div>
      </div>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'api-keys' }))}
        style={{
          background: 'var(--text-primary)', color: 'var(--bg-base)',
          border: 'none', padding: '9px 20px', fontFamily: FM,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0,
        }}
      >
        {tm.addMt5Btn}
      </button>
    </div>
  );
}

/* ── forex chart — same structure as OverviewTab Chart ───────────────────── */
function ForexChart({ symbols }) {
  const { theme } = useTheme();
  const [symIdx, setSymIdx] = useState(0);
  const [tf, setTf]         = useState('60');

  const elRef    = useRef(null);
  const chartRef = useRef(null);
  const candleRef = useRef(null);
  const volRef   = useRef(null);
  const timerRef = useRef(null);
  const dark     = theme !== 'light';

  const sym = symbols[symIdx]?.api;

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const tClr = dark ? 'rgba(240,242,245,0.4)' : 'rgba(10,10,10,0.4)';
    const gClr = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
    const bClr = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    const lBg  = dark ? '#1a1a1a' : '#f0f0f0';

    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: tClr, fontFamily: 'JetBrains Mono, Courier New, monospace', fontSize: 10 },
      grid:    { vertLines: { color: gClr }, horzLines: { color: gClr } },
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
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    chartRef.current  = chart;
    candleRef.current = candle;
    volRef.current    = vol;

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      try { chart.remove(); } catch {}
      chartRef.current = null; candleRef.current = null; volRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!chartRef.current) return;
    const tClr = dark ? 'rgba(240,242,245,0.4)' : 'rgba(10,10,10,0.4)';
    const gClr = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
    const bClr = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    const lBg  = dark ? '#1a1a1a' : '#f0f0f0';
    chartRef.current.applyOptions({
      layout: { textColor: tClr },
      grid:   { vertLines: { color: gClr }, horzLines: { color: gClr } },
      crosshair: { vertLine: { color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', labelBackgroundColor: lBg }, horzLine: { color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', labelBackgroundColor: lBg } },
      rightPriceScale: { borderColor: bClr },
      timeScale: { borderColor: bClr },
    });
  }, [dark]);

  useEffect(() => {
    if (!candleRef.current || !sym) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const load = () =>
      apiGet(`/api/forex/ohlcv?symbol=${encodeURIComponent(sym)}&interval=${tf}`)
        .then(bars => {
          if (!Array.isArray(bars) || !candleRef.current) return;
          const sorted = [...bars].sort((a, b) => a.time - b.time);
          candleRef.current.setData(sorted.map(b => ({ time: b.time, open: +b.open, high: +b.high, low: +b.low, close: +b.close })));
          volRef.current?.setData(sorted.map(b => ({ time: b.time, value: b.volume || 0, color: b.close >= b.open ? C_UP + '55' : C_DN + '55' })));
          chartRef.current?.timeScale().fitContent();
        });

    load();
    timerRef.current = setInterval(load, 3 * 60_000);
    return () => clearInterval(timerRef.current);
  }, [sym, tf]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 320px)', minHeight: 420, border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', overflow: 'hidden', flexShrink: 0 }}>

      {/* Toolbar — mirrors OverviewTab's chart toolbar */}
      <div style={{ height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 4, borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {/* Symbol tabs */}
        {symbols.map((o, i) => (
          <button key={o.api} onClick={() => setSymIdx(i)} style={{
            height: 22, padding: '0 8px', borderRadius: 3, cursor: 'pointer',
            fontFamily: FM, fontSize: 11,
            background: i === symIdx ? 'var(--bg-elevated)' : 'transparent',
            border: `1px solid ${i === symIdx ? 'var(--border-strong)' : 'transparent'}`,
            color: i === symIdx ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: i === symIdx ? 600 : 400,
          }}>{o.label}</button>
        ))}

        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px', flexShrink: 0 }} />

        {/* TF buttons */}
        {['1','5','15','60','240','D'].map(v => (
          <button key={v} onClick={() => setTf(v)} style={{
            height: 22, padding: '0 8px', borderRadius: 3, cursor: 'pointer',
            fontFamily: FM, fontSize: 11,
            background: tf === v ? 'var(--bg-elevated)' : 'transparent',
            border: `1px solid ${tf === v ? 'var(--border-strong)' : 'transparent'}`,
            color: tf === v ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: tf === v ? 600 : 400,
          }}>{TF_LABELS[v]}</button>
        ))}

        <div style={{ marginLeft: 'auto', flexShrink: 0, fontFamily: FM, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', paddingRight: 4 }}>
          MT5 · IC MARKETS
        </div>
      </div>

      {/* Chart canvas */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <div ref={elRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}

/* ── main ─────────────────────────────────────────────────────────────────── */
export default function MacroBotTab({ botId }) {
  const { t, lang } = useLang();
  const isMobile    = useIsMobile();
  const tm          = t.dashboard.macro;
  const ta          = t.dashboard.analytics;
  const to          = t.dashboard.overview;

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
  const symFilter = isGold ? ['XAUUSD'] : ['EURUSD', 'GBPUSD'];
  const filtered  = trades.filter(tr => symFilter.includes(tr.symbol));
  const closed    = filtered.filter(tr => tr.status === 'closed');

  const wins    = closed.filter(tr => tr.profit_usd > 0).length;
  const netPnl  = closed.reduce((acc, tr) => acc + (tr.profit_usd || 0), 0);
  const winRate = closed.length ? Math.round(wins / closed.length * 100) : null;
  const pf      = stats?.profit_factor;

  const locale = LOCALE_MAP[lang] || 'en-US';

  if (mt5 === undefined) return null;

  const statGrid = isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── STATS — same flat-border style as OverviewTab ── */}
      <div style={{ display: 'grid', gridTemplateColumns: statGrid, gap: 0, border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        {[
          {
            label: tm.statTrades,
            value: closed.length || '—',
            sub: 'MT5 · IC Markets',
            good: null,
          },
          {
            label: tm.statWinRate,
            value: winRate != null ? `${winRate}%` : '—',
            sub: closed.length ? `${wins}W / ${closed.length - wins}L` : '—',
            good: winRate != null ? winRate >= 50 : null,
          },
          {
            label: tm.statNetPnl,
            value: closed.length ? `${sign(netPnl)} USDT` : '—',
            sub: 'realized',
            good: closed.length ? netPnl >= 0 : null,
          },
          {
            label: 'Profit Factor',
            value: pf != null && isFinite(pf) ? pf.toFixed(2) + '×' : '—',
            sub: 'all time',
            good: pf != null ? pf >= 1 : null,
          },
        ].map((s, i) => {
          const cols = isMobile ? 2 : 4;
          const rightBorder = isMobile
            ? (i % 2 === 0 ? '1px solid var(--border-subtle)' : 'none')
            : (i < 3 ? '1px solid var(--border-subtle)' : 'none');
          const bottomBorder = isMobile && i < 2 ? '1px solid var(--border-subtle)' : 'none';
          return (
            <div key={s.label} style={{ padding: isMobile ? '14px 14px' : '20px 20px', borderRight: rightBorder, borderBottom: bottomBorder }}>
              <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontFamily: FM, fontSize: isMobile ? 16 : 22, fontWeight: 600, letterSpacing: '-0.02em', color: s.good === null ? 'var(--text-primary)' : s.good ? 'var(--accent-green)' : 'var(--accent-red)' }}>{s.value}</div>
              {s.sub && <div style={{ fontFamily: FF, fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>{s.sub}</div>}
            </div>
          );
        })}
      </div>

      {/* ── NO KEY BANNER ── */}
      {mt5?.configured !== true && <NoKeyBanner />}

      {/* ── CHART — same structure as OverviewTab's Chart component ── */}
      <ForexChart symbols={SYMS[botId] || SYMS.macro} />

      {/* ── TRADES TABLE ── */}
      <div style={{ border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tm.recentTrades}</span>
          <span style={{ fontFamily: FM, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>MT5 · IC MARKETS · SL 20 pips · TP 35 pips</span>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: '32px 20px', textAlign: 'center', fontFamily: FM, fontSize: 11, color: 'var(--text-muted)' }}>{tm.noTradesYet}</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FM, fontSize: 11 }}>
              <thead>
                <tr>
                  {[tm.colSymbol, tm.colEvent, tm.colDir, tm.colPips, tm.colUsd, tm.colTime].map((h, i) => (
                    <th key={h} style={{ padding: '8px 16px', textAlign: i === 0 ? 'left' : 'right', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 400, borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 50).map((tr, i) => {
                  const pos   = tr.profit_usd > 0;
                  const dt    = tr.close_time || tr.open_time;
                  const dtStr = dt ? new Date(dt).toLocaleString(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
                  return (
                    <tr key={i}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 700, borderBottom: '1px solid var(--border-subtle)' }}>{tr.symbol}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-muted)', fontSize: 10, borderBottom: '1px solid var(--border-subtle)' }}>{tr.event || '—'}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: tr.direction === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)', borderBottom: '1px solid var(--border-subtle)' }}>{tr.direction}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-subtle)' }}>{tr.profit_pips != null ? `${tr.profit_pips > 0 ? '+' : ''}${tr.profit_pips}` : '—'}</td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 700, color: pos ? 'var(--accent-green)' : 'var(--accent-red)', borderBottom: '1px solid var(--border-subtle)' }}>
                        {tr.profit_usd != null ? `${pos ? '+' : ''}${tr.profit_usd.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-muted)', fontSize: 10, borderBottom: '1px solid var(--border-subtle)' }}>{dtStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
}
