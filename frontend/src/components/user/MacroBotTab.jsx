import React, { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode } from 'lightweight-charts';
import { useTheme } from '@/lib/ThemeContext';
import { useLang } from '@/lib/LangContext';

const MACRO_LOCALE = { en:'en-US', es:'es-ES', uk:'uk-UA', ru:'ru-RU', de:'de-DE', zh:'zh-CN' };

const MONO  = "'Courier New','SF Mono',monospace";
const B     = 'var(--border-subtle)';
const MUTED = 'var(--text-muted)';
const C_UP  = '#0ecb81';
const C_DN  = '#f6465d';

const TF_LABELS = { '1': '1m', '5': '5m', '15': '15m', '60': '1h', '240': '4h', 'D': '1D' };

const SYMBOLS = {
  macro: [
    { label: 'EUR/USD', sym: 'EUR/USD' },
    { label: 'GBP/USD', sym: 'GBP/USD' },
  ],
  gold: [
    { label: 'XAU/USD', sym: 'XAU/USD' },
  ],
};

const api = p =>
  fetch(p, { headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}` } })
    .then(r => r.ok ? r.json() : null)
    .catch(() => null);

/* ── ForexChart ───────────────────────────────────────────────── */
function ForexChart({ symbols }) {
  const { theme } = useTheme();
  const dark = theme !== 'light';
  const [symIdx, setSymIdx] = useState(0);
  const [tf, setTf] = useState('60');
  const elRef     = useRef(null);
  const chartRef  = useRef(null);
  const candleRef = useRef(null);
  const volRef    = useRef(null);
  const timerRef  = useRef(null);

  const sym = symbols[symIdx]?.sym;

  /* create chart once */
  useEffect(() => {
    if (!elRef.current) return;
    const c = createChart(elRef.current, {
      layout: { background: { color: 'transparent' }, textColor: '#888' },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.04)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'transparent' },
      timeScale: { borderColor: 'transparent', timeVisible: true, secondsVisible: false },
    });

    const candles = c.addCandlestickSeries({
      upColor: C_UP, downColor: C_DN,
      borderUpColor: C_UP, borderDownColor: C_DN,
      wickUpColor: C_UP, wickDownColor: C_DN,
    });

    const vol = c.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.84, bottom: 0 } });

    chartRef.current  = c;
    candleRef.current = candles;
    volRef.current    = vol;

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      c.remove();
      chartRef.current = null;
    };
  }, []);

  /* theme changes */
  useEffect(() => {
    chartRef.current?.applyOptions({
      layout: { textColor: dark ? '#888' : '#444' },
      grid: {
        vertLines: { color: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)' },
        horzLines: { color: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)' },
      },
    });
  }, [dark]);

  /* load + poll on symbol / tf change */
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
            time: b.time, value: b.volume,
            color: b.close >= b.open ? C_UP + '55' : C_DN + '55',
          })));
          chartRef.current?.timeScale().fitContent();
        });

    load();
    timerRef.current = setInterval(load, 3 * 60 * 1000);
    return () => clearInterval(timerRef.current);
  }, [sym, tf]);

  return (
    <div style={{ marginBottom: 24 }}>
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 6 }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {symbols.map((o, i) => (
            <button key={o.sym} onClick={() => setSymIdx(i)} style={{
              fontFamily: MONO, fontSize: 9, padding: '3px 10px',
              border: `1px solid ${B}`, borderRadius: 100, cursor: 'pointer',
              background: i === symIdx ? 'var(--bg-elevated)' : 'transparent',
              color: i === symIdx ? 'var(--text-primary)' : MUTED,
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>{o.label}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {Object.entries(TF_LABELS).map(([v, l]) => (
            <button key={v} onClick={() => setTf(v)} style={{
              fontFamily: MONO, fontSize: 9, padding: '3px 8px',
              border: `1px solid ${tf === v ? 'var(--border-default)' : B}`,
              borderRadius: 100, cursor: 'pointer',
              background: tf === v ? 'var(--bg-elevated)' : 'transparent',
              color: tf === v ? 'var(--text-secondary)' : MUTED,
              letterSpacing: '0.08em',
            }}>{l}</button>
          ))}
        </div>
      </div>
      <div
        ref={elRef}
        style={{ width: '100%', height: 380, background: 'var(--bg-base)', border: `1px solid ${B}` }}
      />
    </div>
  );
}

/* ── stat box ─────────────────────────────────────────────────── */
function StatBox({ label, value, color }) {
  return (
    <div style={{
      flex: 1, background: 'var(--bg-surface)',
      border: '1px solid var(--border-subtle)',
      borderTop: '1px solid var(--border-subtle)',
      borderRadius: 12, padding: '20px 22px',
    }}>
      <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: MONO, marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: MONO, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</div>
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
        <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, lineHeight: 1.6 }}>
          {tm.noMt5Desc}
        </div>
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
  const [mt5,    setMt5]    = useState(undefined);

  useEffect(() => {
    Promise.all([
      api('/api/macro/trades?limit=100'),
      api('/api/users/mt5-keys'),
    ]).then(([t, m]) => {
      setTrades(Array.isArray(t) ? t : []);
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

  const title = isGold ? tm.m2?.name : tm.m1?.name;
  const desc  = isGold ? tm.m2?.tag : tm.m1?.tag;

  const mt5Configured = mt5?.configured === true;

  if (mt5 === undefined) return null;

  return (
    <div style={{ padding: '0 0 40px' }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED, marginBottom: 6 }}>{desc}</div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>{title}</div>
      </div>

      {/* Chart */}
      <ForexChart symbols={SYMBOLS[botId] || SYMBOLS.gold} />

      {!mt5Configured && <NoKeyBanner />}

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatBox label={tm.statTrades} value={closed.length || '—'} />
        <StatBox
          label={tm.statWinRate}
          value={winRate != null ? `${winRate}%` : '—'}
          color={winRate != null ? (winRate >= 50 ? 'var(--accent-green)' : 'var(--accent-red)') : undefined}
        />
        <StatBox
          label={tm.statNetPnl}
          value={closed.length ? `${netPnl >= 0 ? '+' : ''}${netPnl.toFixed(2)}` : '—'}
          color={netPnl > 0 ? 'var(--accent-green)' : netPnl < 0 ? 'var(--accent-red)' : undefined}
        />
        <StatBox label={tm.statStrategy} value={tm.statEvent} />
      </div>

      {/* Trades table */}
      <div style={{ border: `1px solid ${B}`, marginBottom: 24 }}>
        <div style={{ padding: '0 20px', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${B}` }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: MUTED }}>{tm.recentTrades}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em' }}>MT5 · IC MARKETS</span>
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
                  const pos = t.profit_usd > 0;
                  const dt  = t.close_time || t.open_time;
                  const dtStr = dt ? new Date(dt).toLocaleString(MACRO_LOCALE[lang] || 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
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

      <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.08em', lineHeight: 1.8 }}>
        Event-driven · SL 15 pips · TP 20 pips · 20min auto-exit · R:R 1.33:1
      </div>
    </div>
  );
}
