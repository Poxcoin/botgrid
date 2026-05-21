import React, { useEffect, useRef, useState } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';
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

/* ── indicator math (identical to OverviewTab) ────────────────────────────── */
function sma(bars, n) {
  return bars.map((_, i) => {
    if (i < n - 1) return null;
    return bars.slice(i - n + 1, i + 1).reduce((a, b) => a + b.close, 0) / n;
  });
}
function calcEma(bars, n) {
  const k = 2 / (n + 1); let ema = null;
  return bars.map(b => { ema = ema == null ? b.close : b.close * k + ema * (1 - k); return ema; });
}
function boll(bars, n = 20, mult = 2) {
  const mid = sma(bars, n);
  return bars.map((_, i) => {
    if (mid[i] == null) return { upper: null, mid: null, lower: null };
    const sl  = bars.slice(Math.max(0, i - n + 1), i + 1);
    const std = Math.sqrt(sl.reduce((s, b) => s + (b.close - mid[i]) ** 2, 0) / sl.length);
    return { upper: mid[i] + mult * std, mid: mid[i], lower: mid[i] - mult * std };
  });
}
function calcRSI(bars, period = 14) {
  const result = Array(bars.length).fill(null);
  if (bars.length <= period) return result;
  let avgGain = 0, avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = bars[i].close - bars[i - 1].close;
    if (d >= 0) avgGain += d; else avgLoss -= d;
  }
  avgGain /= period; avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < bars.length; i++) {
    const d = bars[i].close - bars[i - 1].close;
    const g = Math.max(0, d), l = Math.max(0, -d);
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}
function calcMACD(bars, fast = 12, slow = 26, sig = 9) {
  const n = bars.length;
  const macdArr = Array(n).fill(null), sigArr = Array(n).fill(null), histArr = Array(n).fill(null);
  if (n < slow + sig) return { macdArr, sigArr, histArr };
  const kf = 2 / (fast + 1), ks = 2 / (slow + 1), kk = 2 / (sig + 1);
  const cls = bars.map(b => b.close);
  let fe = cls.slice(0, fast).reduce((a, b) => a + b, 0) / fast;
  for (let i = fast; i < slow; i++) fe = cls[i] * kf + fe * (1 - kf);
  let se = cls.slice(0, slow).reduce((a, b) => a + b, 0) / slow;
  macdArr[slow - 1] = fe - se;
  for (let i = slow; i < n; i++) { fe = cls[i] * kf + fe * (1 - kf); se = cls[i] * ks + se * (1 - ks); macdArr[i] = fe - se; }
  const fi = slow - 1;
  let sg = macdArr.slice(fi, fi + sig).reduce((a, b) => a + b, 0) / sig;
  const si = fi + sig - 1;
  sigArr[si] = sg; histArr[si] = macdArr[si] - sg;
  for (let i = si + 1; i < n; i++) { sg = macdArr[i] * kk + sg * (1 - kk); sigArr[i] = sg; histArr[i] = macdArr[i] - sg; }
  return { macdArr, sigArr, histArr };
}

/* ── NoKeyBanner ──────────────────────────────────────────────────────────── */
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
        style={{ background: 'var(--text-primary)', color: 'var(--bg-base)', border: 'none', padding: '9px 20px', fontFamily: FM, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0 }}
      >
        {tm.addMt5Btn}
      </button>
    </div>
  );
}

/* ── ForexChart — 1:1 with OverviewTab's Chart component ─────────────────── */
function ForexChart({ symbols }) {
  const { theme }  = useTheme();
  const { t }      = useLang();
  const [symIdx,   setSymIdx]   = useState(0);
  const [tf,       setTf]       = useState('60');
  const [showLine, setShowLine] = useState(false);
  const [isFS,     setIsFS]     = useState(false);
  const [activeInds, setActiveInds] = useState({});

  const elRef      = useRef(null);
  const chartRef   = useRef(null);
  const candleRef  = useRef(null);
  const volRef     = useRef(null);
  const areaRef    = useRef(null);
  const indRefs    = useRef({});
  const showLRef   = useRef(false);
  const timerRef   = useRef(null);
  const barsRef    = useRef([]);
  const activeIndsRef = useRef({});

  const dark = theme !== 'light';
  const sym  = symbols[symIdx]?.api;

  /* keep activeIndsRef in sync */
  useEffect(() => { activeIndsRef.current = activeInds; }, [activeInds]);

  /* init chart once — identical options to OverviewTab */
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const tClr = dark ? 'rgba(240,242,245,0.4)' : 'rgba(10,10,10,0.4)';
    const gClr = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
    const bClr = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    const lBg  = dark ? '#1a1a1a' : '#f0f0f0';
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: '#000000' }, textColor: tClr, fontFamily: 'JetBrains Mono, Courier New, monospace', fontSize: 10 },
      grid:    { vertLines: { color: gClr }, horzLines: { color: gClr } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', labelBackgroundColor: lBg }, horzLine: { color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', labelBackgroundColor: lBg } },
      rightPriceScale: { borderColor: bClr },
      timeScale: { borderColor: bClr, timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;

    const candle = chart.addCandlestickSeries({ upColor: C_UP, downColor: C_DN, borderUpColor: C_UP, borderDownColor: C_DN, wickUpColor: C_UP, wickDownColor: C_DN });
    candleRef.current = candle;
    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volRef.current = vol;

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      indRefs.current = {};
      try { chart.remove(); } catch {}
      chartRef.current = null; candleRef.current = null; volRef.current = null; areaRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* theme update */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const tClr = dark ? 'rgba(240,242,245,0.4)' : 'rgba(10,10,10,0.4)';
    const gClr = dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
    const bClr = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    const lBg  = dark ? '#1a1a1a' : '#f0f0f0';
    chart.applyOptions({
      layout: { textColor: tClr },
      grid:   { vertLines: { color: gClr }, horzLines: { color: gClr } },
      crosshair: { vertLine: { color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', labelBackgroundColor: lBg }, horzLine: { color: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', labelBackgroundColor: lBg } },
      rightPriceScale: { borderColor: bClr },
      timeScale: { borderColor: bClr },
    });
  }, [dark]);

  /* re-apply all active indicators on new bars */
  function reapplyInds(bars) {
    const chart = chartRef.current;
    if (!chart) return;
    const cur = activeIndsRef.current;
    Object.keys(cur).filter(k => cur[k]).forEach(name => {
      (indRefs.current[name] || []).forEach(s => { try { chart.removeSeries(s); } catch {} });
      delete indRefs.current[name];
      applyInd(name, bars, chart);
    });
  }

  function applyInd(name, bars, chart) {
    try {
      if (name === 'MA') {
        const s = chart.addLineSeries({ color: '#f5a623', lineWidth: 1 });
        const v = sma(bars, 20);
        s.setData(bars.map((b, i) => ({ time: b.time, value: v[i] })).filter(d => d.value != null));
        indRefs.current.MA = [s];
      } else if (name === 'EMA') {
        const s = chart.addLineSeries({ color: '#9b59b6', lineWidth: 1 });
        const v = calcEma(bars, 20);
        s.setData(bars.map((b, i) => ({ time: b.time, value: v[i] })));
        indRefs.current.EMA = [s];
      } else if (name === 'BOLL') {
        const upper = chart.addLineSeries({ color: 'rgba(100,180,255,0.7)', lineWidth: 1 });
        const mid   = chart.addLineSeries({ color: 'rgba(100,180,255,0.4)', lineWidth: 1, lineStyle: LineStyle.Dashed });
        const lower = chart.addLineSeries({ color: 'rgba(100,180,255,0.7)', lineWidth: 1 });
        const v = boll(bars);
        upper.setData(bars.map((b, i) => ({ time: b.time, value: v[i].upper })).filter(d => d.value != null));
        mid.setData(bars.map((b, i) => ({ time: b.time, value: v[i].mid   })).filter(d => d.value != null));
        lower.setData(bars.map((b, i) => ({ time: b.time, value: v[i].lower })).filter(d => d.value != null));
        indRefs.current.BOLL = [upper, mid, lower];
      } else if (name === 'RSI') {
        const rsi = chart.addLineSeries({ priceScaleId: 'rsi', color: '#9b59b6', lineWidth: 1.5, lastValueVisible: true, priceLineVisible: false });
        rsi.createPriceLine({ price: 70, color: 'rgba(246,70,93,0.45)', lineStyle: LineStyle.Dashed, lineWidth: 1 });
        rsi.createPriceLine({ price: 30, color: 'rgba(14,203,129,0.45)', lineStyle: LineStyle.Dashed, lineWidth: 1 });
        const v = calcRSI(bars);
        rsi.setData(bars.map((b, i) => ({ time: b.time, value: v[i] })).filter(d => d.value != null));
        const macdOn = !!activeIndsRef.current.MACD;
        if (macdOn) {
          rsi.priceScale().applyOptions({ scaleMargins: { top: 0.66, bottom: 0.28 }, drawTicks: true });
          volRef.current?.priceScale().applyOptions({ scaleMargins: { top: 0.95, bottom: 0 } });
        } else {
          rsi.priceScale().applyOptions({ scaleMargins: { top: 0.76, bottom: 0.02 }, drawTicks: true });
          volRef.current?.priceScale().applyOptions({ scaleMargins: { top: 0.92, bottom: 0 } });
        }
        indRefs.current.RSI = [rsi];
      } else if (name === 'MACD') {
        const macdLine = chart.addLineSeries({ priceScaleId: 'macd', color: '#2962ff', lineWidth: 1.5, lastValueVisible: true, priceLineVisible: false });
        const sigLine  = chart.addLineSeries({ priceScaleId: 'macd', color: '#ff6d00', lineWidth: 1, lastValueVisible: false, priceLineVisible: false });
        const histSer  = chart.addHistogramSeries({ priceScaleId: 'macd', lastValueVisible: false, priceLineVisible: false });
        const { macdArr, sigArr, histArr } = calcMACD(bars);
        macdLine.setData(bars.map((b, i) => ({ time: b.time, value: macdArr[i] })).filter(d => d.value != null));
        sigLine.setData(bars.map((b, i) => ({ time: b.time, value: sigArr[i]  })).filter(d => d.value != null));
        histSer.setData(bars.map((b, i) => ({ time: b.time, value: histArr[i], color: (histArr[i] ?? 0) >= 0 ? 'rgba(14,203,129,0.6)' : 'rgba(246,70,93,0.6)' })).filter(d => d.value != null));
        const rsiOn = !!activeIndsRef.current.RSI;
        if (rsiOn) {
          macdLine.priceScale().applyOptions({ scaleMargins: { top: 0.80, bottom: 0.02 }, drawTicks: true });
          indRefs.current.RSI?.[0]?.priceScale().applyOptions({ scaleMargins: { top: 0.66, bottom: 0.28 } });
          volRef.current?.priceScale().applyOptions({ scaleMargins: { top: 0.95, bottom: 0 } });
        } else {
          macdLine.priceScale().applyOptions({ scaleMargins: { top: 0.76, bottom: 0.02 }, drawTicks: true });
          volRef.current?.priceScale().applyOptions({ scaleMargins: { top: 0.92, bottom: 0 } });
        }
        indRefs.current.MACD = [macdLine, sigLine, histSer];
      }
    } catch {}
  }

  /* load data + poll */
  useEffect(() => {
    if (!candleRef.current || !sym) return;
    if (timerRef.current) clearInterval(timerRef.current);

    const load = () =>
      apiGet(`/api/forex/ohlcv?symbol=${encodeURIComponent(sym)}&interval=${tf}`)
        .then(bars => {
          if (!Array.isArray(bars) || !candleRef.current) return;
          const sorted = [...bars].sort((a, b) => a.time - b.time);
          barsRef.current = sorted;
          candleRef.current.setData(sorted.map(b => ({ time: b.time, open: +b.open, high: +b.high, low: +b.low, close: +b.close })));
          volRef.current?.setData(sorted.map(b => ({ time: b.time, value: b.volume || 0, color: b.close >= b.open ? C_UP + '55' : C_DN + '55' })));
          if (showLRef.current && areaRef.current)
            areaRef.current.setData(sorted.map(b => ({ time: b.time, value: +b.close })));
          reapplyInds(sorted);
          chartRef.current?.timeScale().fitContent();
        });

    load();
    timerRef.current = setInterval(load, 3 * 60_000);
    return () => clearInterval(timerRef.current);
  }, [sym, tf]); // eslint-disable-line react-hooks/exhaustive-deps

  /* candle/line area toggle — identical to OverviewTab */
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    showLRef.current = showLine;
    if (showLine) {
      if (!areaRef.current) {
        const area = chart.addAreaSeries({ lineColor: C_UP, topColor: 'rgba(14,203,129,0.25)', bottomColor: 'rgba(14,203,129,0)', lineWidth: 2 });
        areaRef.current = area;
      }
      areaRef.current.setData(barsRef.current.map(b => ({ time: b.time, value: +b.close })));
      areaRef.current.applyOptions({ visible: true });
      candleRef.current?.applyOptions({ visible: false });
    } else {
      areaRef.current?.applyOptions({ visible: false });
      candleRef.current?.applyOptions({ visible: true });
    }
  }, [showLine]);

  /* fullscreen escape */
  useEffect(() => {
    const h = e => e.key === 'Escape' && setIsFS(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  /* toggle indicator — same logic as OverviewTab */
  function toggleInd(name) {
    const chart = chartRef.current;
    if (!chart) return;
    if (activeInds[name]) {
      (indRefs.current[name] || []).forEach(s => { try { chart.removeSeries(s); } catch {} });
      delete indRefs.current[name];
      if (name === 'RSI') {
        const macdOn = !!activeInds.MACD;
        volRef.current?.priceScale().applyOptions({ scaleMargins: { top: macdOn ? 0.92 : 0.82, bottom: 0 } });
        if (macdOn && indRefs.current.MACD?.[0])
          indRefs.current.MACD[0].priceScale().applyOptions({ scaleMargins: { top: 0.76, bottom: 0.02 } });
      }
      if (name === 'MACD') {
        const rsiOn = !!activeInds.RSI;
        volRef.current?.priceScale().applyOptions({ scaleMargins: { top: rsiOn ? 0.92 : 0.82, bottom: 0 } });
        if (rsiOn && indRefs.current.RSI?.[0])
          indRefs.current.RSI[0].priceScale().applyOptions({ scaleMargins: { top: 0.76, bottom: 0.02 } });
      }
      setActiveInds(p => ({ ...p, [name]: false }));
    } else {
      applyInd(name, barsRef.current, chart);
      setActiveInds(p => ({ ...p, [name]: true }));
    }
  }

  const fsStyle = isFS ? { position: 'fixed', inset: 0, zIndex: 9999, border: 'none', height: '100vh', minHeight: '100vh' } : {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 260px)', minHeight: 480, border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', overflow: 'hidden', ...fsStyle }}>

      {/* Toolbar — identical to OverviewTab */}
      <div style={{ height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 2, borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', overflowX: 'auto', scrollbarWidth: 'none' }}>

        {/* Symbol selector */}
        {symbols.map((o, i) => (
          <button key={o.api} onClick={() => setSymIdx(i)} style={{ height: 22, padding: '0 8px', borderRadius: 3, cursor: 'pointer', fontFamily: FM, fontSize: 11, background: i === symIdx ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${i === symIdx ? 'var(--border-strong)' : 'transparent'}`, color: i === symIdx ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: i === symIdx ? 600 : 400 }}>{o.label}</button>
        ))}

        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px', flexShrink: 0 }} />

        {/* Candle / Line */}
        <button onClick={() => { showLRef.current = false; setShowLine(false); }} style={{ height: 22, padding: '0 8px', borderRadius: 3, cursor: 'pointer', fontFamily: FM, fontSize: 11, background: !showLine ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${!showLine ? 'var(--border-strong)' : 'transparent'}`, color: !showLine ? 'var(--text-primary)' : 'var(--text-muted)' }}>{t.dashboard.chartCandles}</button>
        <button onClick={() => { showLRef.current = true;  setShowLine(true); }}  style={{ height: 22, padding: '0 8px', borderRadius: 3, cursor: 'pointer', fontFamily: FM, fontSize: 11, background: showLine ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${showLine ? 'var(--border-strong)' : 'transparent'}`, color: showLine ? 'var(--text-primary)' : 'var(--text-muted)' }}>{t.dashboard.chartLine}</button>

        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px', flexShrink: 0 }} />
        <span style={{ fontFamily: FF, fontSize: 10, color: 'var(--text-muted)', marginRight: 2 }}>Ind</span>
        {['MA','EMA','BOLL','RSI','MACD'].map(name => (
          <button key={name} onClick={() => toggleInd(name)} style={{ height: 22, padding: '0 7px', borderRadius: 3, cursor: 'pointer', fontFamily: FM, fontSize: 10, background: activeInds[name] ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${activeInds[name] ? 'var(--border-strong)' : 'transparent'}`, color: activeInds[name] ? 'var(--text-primary)' : 'var(--text-muted)' }}>{name}</button>
        ))}

        <div style={{ width: 8, flexShrink: 0 }} />
        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px', flexShrink: 0 }} />

        {/* TF */}
        {['1','5','15','60','240','D'].map(v => (
          <button key={v} onClick={() => setTf(v)} style={{ height: 22, padding: '0 8px', borderRadius: 3, cursor: 'pointer', fontFamily: FM, fontSize: 11, background: tf === v ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${tf === v ? 'var(--border-strong)' : 'transparent'}`, color: tf === v ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: tf === v ? 600 : 400 }}>{TF_LABELS[v]}</button>
        ))}

        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px', flexShrink: 0 }} />

        {/* Fullscreen */}
        <button onClick={() => setIsFS(v => !v)} title={isFS ? 'Exit fullscreen (Esc)' : 'Fullscreen'} style={{ height: 22, width: 22, borderRadius: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isFS ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${isFS ? 'var(--border-strong)' : 'transparent'}`, color: isFS ? 'var(--text-primary)' : 'var(--text-muted)', padding: 0, flexShrink: 0 }}>
          {isFS
            ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 1H1v3M8 1h3v3M4 11H1V8M8 11h3V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 4V1h3M8 1h3v3M1 8v3h3M8 11h3V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          }
        </button>
      </div>

      {/* Chart canvas — flex:1 directly on elRef, same as OverviewTab */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative', background: 'var(--bg-base)' }}>
          <div ref={elRef} style={{ width: '100%', height: '100%' }} />
          <div style={{
            position: 'absolute', top: 20, left: 20, pointerEvents: 'none',
            zIndex: 10,
          }}>
            <span style={{
              fontSize: 48, fontWeight: 900, letterSpacing: '0.2em',
              color: '#e8e8e8',
              textShadow: '0 2px 12px rgba(232,232,232,0.4), 0 0 30px rgba(232,232,232,0.2)',
              fontFamily: "'Georgia', 'Garamond', 'Palatino', serif",
              textTransform: 'uppercase',
              display: 'block',
            }}>
              KADO
            </span>
          </div>
        </div>
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

  const isGold    = botId === 'gold';
  const symFilter = isGold ? ['XAUUSD'] : ['EURUSD', 'GBPUSD'];
  const filtered  = trades.filter(tr => symFilter.includes(tr.symbol));
  const closed    = filtered.filter(tr => tr.status === 'closed');

  const wins    = closed.filter(tr => tr.profit_usd > 0).length;
  const netPnl  = closed.reduce((acc, tr) => acc + (tr.profit_usd || 0), 0);
  const winRate = closed.length ? Math.round(wins / closed.length * 100) : null;
  const pf      = stats?.profit_factor;

  const locale = LOCALE_MAP[lang] || 'en-US';

  if (mt5 === undefined) return null;

  const cols = isMobile ? 2 : 4;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── STATS — same flat-border grid as OverviewTab ── */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols},1fr)`, gap: 0, border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        {[
          { label: tm.statTrades,   value: closed.length || '—', sub: 'MT5 · IC Markets', good: null },
          { label: tm.statWinRate,  value: winRate != null ? `${winRate}%` : '—', sub: closed.length ? `${wins}W / ${closed.length - wins}L` : '—', good: winRate != null ? winRate >= 50 : null },
          { label: tm.statNetPnl,   value: closed.length ? `${sign(netPnl)} USDT` : '—', sub: 'realized', good: closed.length ? netPnl >= 0 : null },
          { label: 'Profit Factor', value: pf != null && isFinite(pf) ? pf.toFixed(2) + '×' : '—', sub: 'all time', good: pf != null ? pf >= 1 : null },
        ].map((s, i) => {
          const rightBorder = isMobile ? (i % 2 === 0 ? '1px solid var(--border-subtle)' : 'none') : (i < 3 ? '1px solid var(--border-subtle)' : 'none');
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

      {/* ── CHART — same structure as OverviewTab ── */}
      <ForexChart symbols={SYMS[botId] || SYMS.macro} />

      {/* ── TRADES TABLE ── */}
      <div style={{ border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <div style={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{tm.recentTrades}</span>
          <span style={{ fontFamily: FM, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>SL 20pip · TP 35pip · R:R 1.75</span>
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
