import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';
import { authFetch } from '@/lib/api';

const COINS = [
  { key: 'BTC', label: 'BTC/USDT' },
  { key: 'ETH', label: 'ETH/USDT' },
];
const TFS = [
  { v: '1', l: '1m' }, { v: '5', l: '5m' }, { v: '15', l: '15m' },
  { v: '60', l: '1h' }, { v: '240', l: '4h' }, { v: 'D', l: '1D' },
];

const SANS = 'var(--font-sans)';
const MONO = 'var(--font-mono)';

const normSym = s => (s || '').replace('/USDT:USDT', '').replace('/USDT', '').replace('USDT', '').trim();
const isLong  = t => t.side === 'LONG' || t.side === 'Buy';
const fmtN    = (v, d = 2) => v == null || isNaN(+v) ? '—' : (+v).toFixed(d);
const fmtSign = (v, d = 2) => { const n = parseFloat(v); if (isNaN(n)) return '—'; return (n >= 0 ? '+' : '') + n.toFixed(d); };
const fmtUSD  = v => v != null && !isNaN(+v) ? `$${parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
const pclr    = v => +v >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
const dstr    = s => s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

const C_UP = '#0ecb81';
const C_DN = '#f6465d';

function sma(bars, n) {
  return bars.map((_, i) => {
    if (i < n - 1) return null;
    const sl = bars.slice(i - n + 1, i + 1);
    return sl.reduce((acc, b) => acc + b.close, 0) / n;
  });
}
function calcEma(bars, n) {
  const k = 2 / (n + 1);
  let ema = null;
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


// ── TickerRow ─────────────────────────────────────────────────

function TickerRow({ coin, setCoin, tf, setTf, ticker }) {
  const price  = ticker?.lastPrice    ? parseFloat(ticker.lastPrice)         : null;
  const chgPct = ticker?.price24hPcnt ? parseFloat(ticker.price24hPcnt) * 100 : null;
  const high   = ticker?.highPrice24h  ? parseFloat(ticker.highPrice24h)      : null;
  const low    = ticker?.lowPrice24h   ? parseFloat(ticker.lowPrice24h)       : null;
  const vol    = ticker?.volume24h     ? parseFloat(ticker.volume24h)         : null;

  return (
    <div style={{ height: 52, display: 'flex', alignItems: 'stretch', flexShrink: 0, borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'stretch', borderRight: '1px solid var(--border-subtle)' }}>
        {COINS.map(c => (
          <button key={c.key} onClick={() => setCoin(c.key)} style={{
            padding: '0 20px', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: SANS, fontSize: 13, fontWeight: coin === c.key ? 600 : 400,
            color: coin === c.key ? 'var(--text-primary)' : 'var(--text-muted)',
            borderBottom: coin === c.key ? '2px solid var(--accent-green)' : '2px solid transparent',
          }}>{c.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, borderRight: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          {price != null ? price.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}
        </span>
        {chgPct != null && (
          <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 600, color: pclr(chgPct) }}>
            {chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%
          </span>
        )}
      </div>

      {[
        { label: '24H High', value: high ? `$${high.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '—' },
        { label: '24H Low',  value: low  ? `$${low.toLocaleString('en-US',  { minimumFractionDigits: 2 })}` : '—' },
        { label: '24H Vol',  value: vol  ? `${(vol / 1e6).toFixed(1)}M` : '—' },
      ].map((s, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 14px', borderRight: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <span style={{ fontFamily: SANS, fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{s.label}</span>
          <span style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-secondary)' }}>{s.value}</span>
        </div>
      ))}

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', padding: '0 10px', gap: 2, borderLeft: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        {TFS.map(t => (
          <button key={t.v} onClick={() => setTf(t.v)} style={{
            fontFamily: MONO, fontSize: 11, height: 26, padding: '0 8px', borderRadius: 4, cursor: 'pointer',
            background: tf === t.v ? 'var(--bg-elevated)' : 'transparent',
            border: `1px solid ${tf === t.v ? 'var(--border-strong)' : 'transparent'}`,
            color: tf === t.v ? 'var(--text-primary)' : 'var(--text-muted)',
            fontWeight: tf === t.v ? 600 : 400,
          }}>{t.l}</button>
        ))}
      </div>
    </div>
  );
}


// ── AccountRow ────────────────────────────────────────────────

function StatsPanel({ balance, trades, positions }) {
  const closed    = useMemo(() => (trades || []).filter(t => t.closed_at || t.status === 'closed'), [trades]);
  const realized  = useMemo(() => closed.reduce((s, t) => s + parseFloat(t.pnl_usdt || 0), 0), [closed]);
  const wins      = useMemo(() => closed.filter(t => parseFloat(t.pnl_usdt || 0) > 0).length, [closed]);
  const wr        = closed.length ? Math.round(wins / closed.length * 100) : 0;
  const totalUnreal = useMemo(() => (positions || []).reduce((s, p) => s + parseFloat(p.unrealized_pnl || 0), 0), [positions]);

  const sign = v => (v >= 0 ? '+' : '') + (+v).toFixed(2);
  const pos  = v => v > 0;

  const cards = [
    { label: 'Balance',    value: balance ? `$${(+balance.wallet).toFixed(2)}` : '—',      sub: balance?.equity ? `equity $${(+balance.equity).toFixed(2)}` : null, good: null },
    { label: 'Unrealized', value: positions?.length ? `${sign(totalUnreal)} USDT` : '—',   sub: positions?.length ? `${positions.length} open positions` : 'no open positions', good: positions?.length ? pos(totalUnreal) : null },
    { label: 'Realized',   value: `${sign(realized)} USDT`,                                sub: `${closed.length} closed trades`, good: closed.length > 0 ? pos(realized) : null },
    { label: 'Win Rate',   value: `${wr}%`,                                                sub: `${wins}W / ${closed.length - wins}L`, good: closed.length > 0 ? wr >= 50 : null },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0, border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
      {cards.map((s, i) => (
        <div key={s.label} style={{ padding: '16px 20px', borderRight: i < 3 ? '1px solid var(--border-subtle)' : 'none' }}>
          <div style={{ fontFamily: SANS, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>{s.label}</div>
          <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: s.good === null ? 'var(--text-primary)' : s.good ? 'var(--accent-green)' : 'var(--accent-red)' }}>{s.value}</div>
          {s.sub && <div style={{ fontFamily: SANS, fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}


// ── OrderBook ─────────────────────────────────────────────────

function OrderBook({ coin }) {
  const [book, setBook] = useState({ b: [], a: [] });

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${coin}USDT&limit=12`)
        .then(r => r.json())
        .then(d => { if (alive && d.result) setBook(d.result); })
        .catch(() => {});
    load();
    const t = setInterval(load, 1500);
    return () => { alive = false; clearInterval(t); };
  }, [coin]);

  const bids = book.b.slice(0, 12);
  const asks = book.a.slice(0, 12);
  const allSizes = [...bids, ...asks].map(r => +r[1]);
  const maxSize = Math.max(...allSizes, 1);
  const spread = bids[0] && asks[0] ? (+asks[0][0] - +bids[0][0]).toFixed(2) : null;

  const Row = ({ price, size, side }) => {
    const pct = Math.min((+size / maxSize) * 100, 100);
    const isAsk = side === 'ask';
    return (
      <div style={{ position: 'relative', height: 17, display: 'flex', alignItems: 'center', padding: '0 10px', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          right: 0, width: `${pct}%`,
          background: isAsk ? 'rgba(255,77,109,0.07)' : 'rgba(0,212,170,0.07)',
        }} />
        <span style={{ fontFamily: MONO, fontSize: 10, color: isAsk ? 'var(--accent-red)' : 'var(--accent-green)', zIndex: 1, letterSpacing: '0.02em' }}>
          {(+price).toFixed(2)}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(255,255,255,0.35)', zIndex: 1 }}>
          {(+size).toFixed(3)}
        </span>
      </div>
    );
  };

  return (
    <div style={{ width: 170, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-base)', overflow: 'hidden' }}>
      <div style={{ padding: '0 10px', height: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <span style={{ fontFamily: SANS, fontSize: 10, color: 'var(--text-muted)' }}>Order Book</span>
        {spread && <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)' }}>Δ {spread}</span>}
      </div>
      <div style={{ padding: '2px 0' }}>
        <div style={{ padding: '0 10px', height: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: SANS, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>PRICE</span>
          <span style={{ fontFamily: SANS, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.06em' }}>QTY</span>
        </div>
      </div>
      {/* Asks — reversed so best ask is closest to mid */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        {asks.slice().reverse().map(([p, s], i) => <Row key={i} price={p} size={s} side="ask" />)}
      </div>
      {/* Mid price */}
      <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0 }}>
        <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
          {bids[0] ? (+bids[0][0]).toFixed(2) : '—'}
        </span>
      </div>
      {/* Bids */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {bids.map(([p, s], i) => <Row key={i} price={p} size={s} side="bid" />)}
      </div>
    </div>
  );
}


// ── KlineChart ────────────────────────────────────────────────

function KlineChart({ coin, tf }) {
  const elRef      = useRef(null);
  const chartRef   = useRef(null);
  const candleRef  = useRef(null);
  const volRef     = useRef(null);
  const areaRef    = useRef(null);
  const indRefs    = useRef({});
  const wsRef      = useRef(null);
  const barsRef    = useRef([]);
  const loadingRef = useRef(false);
  const coinRef    = useRef(coin);
  const tfRef      = useRef(tf);
  const showLRef   = useRef(false);

  const [showLine,   setShowLine]   = useState(false);
  const [activeInds, setActiveInds] = useState({});

  coinRef.current = coin;
  tfRef.current   = tf;

  async function fetchBars(c, tfV, endMs) {
    let url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${c}USDT&interval=${tfV}&limit=1000`;
    if (endMs) url += `&end=${endMs}`;
    try {
      const d = await (await fetch(url)).json();
      return (d.result?.list || []).slice().reverse().map(k => ({
        time: Math.trunc(+k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], value: +k[5],
      })).filter(b => b.open > 0 && b.high > 0 && b.low > 0 && b.close > 0 && b.high >= b.low);
    } catch { return []; }
  }

  async function fetchAllBars(c, tfV) {
    const MAX_PAGES = 10;
    let all = [];
    let endMs;
    for (let page = 0; page < MAX_PAGES; page++) {
      const chunk = await fetchBars(c, tfV, endMs);
      if (!chunk.length) break;
      all = [...chunk, ...all];
      if (chunk.length < 1000) break;
      endMs = chunk[0].time * 1000 - 1;
    }
    const seen = new Set();
    return all.filter(b => { if (seen.has(b.time)) return false; seen.add(b.time); return true; });
  }

  function refreshInds(bars) {
    const refs = indRefs.current;
    if (refs.MA?.[0]) {
      const v = sma(bars, 20);
      refs.MA[0].setData(bars.map((b, i) => ({ time: b.time, value: v[i] })).filter(d => d.value != null));
    }
    if (refs.EMA?.[0]) {
      const v = calcEma(bars, 20);
      refs.EMA[0].setData(bars.map((b, i) => ({ time: b.time, value: v[i] })));
    }
    if (refs.BOLL?.[0]) {
      const v = boll(bars);
      refs.BOLL[0].setData(bars.map((b, i) => ({ time: b.time, value: v[i].upper })).filter(d => d.value != null));
      refs.BOLL[1].setData(bars.map((b, i) => ({ time: b.time, value: v[i].mid   })).filter(d => d.value != null));
      refs.BOLL[2].setData(bars.map((b, i) => ({ time: b.time, value: v[i].lower })).filter(d => d.value != null));
    }
  }

  function applyData(bars) {
    barsRef.current = bars;
    if (!candleRef.current) return;
    const candle = bars.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
    const vol    = bars.map(b => ({ time: b.time, value: b.value, color: b.close >= b.open ? 'rgba(0,212,170,0.4)' : 'rgba(255,77,109,0.4)' }));
    if (showLRef.current && areaRef.current) {
      areaRef.current.setData(candle.map(b => ({ time: b.time, value: b.close })));
    } else {
      candleRef.current.setData(candle);
    }
    volRef.current?.setData(vol);
    refreshInds(bars);
  }

  function connectWS(c, tfV) {
    wsRef.current?.close();
    const topic = `kline.${tfV}.${c}USDT`;
    let closed = false;
    let pingId = null;
    const tryConnect = () => {
      if (closed) return;
      const ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');
      ws.onopen = () => {
        if (closed) { ws.close(); return; }
        ws.send(JSON.stringify({ op: 'subscribe', args: [topic] }));
        pingId = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"op":"ping"}'), 18000);
      };
      ws.onmessage = e => {
        if (closed) return;
        try {
          const m = JSON.parse(e.data);
          if (m.topic === topic && m.data?.[0]) {
            const k = m.data[0];
            const bar = { time: Math.trunc(+k.start / 1000), open: +k.open, high: +k.high, low: +k.low, close: +k.close, value: +k.volume };
            if (bar.open <= 0 || bar.high < bar.low) return;
            const bars = barsRef.current;
            const last = bars[bars.length - 1];
            if (last && last.time === bar.time) bars[bars.length - 1] = bar;
            else bars.push(bar);
            const cBar = { time: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close };
            const vBar = { time: bar.time, value: bar.value, color: bar.close >= bar.open ? 'rgba(0,212,170,0.4)' : 'rgba(255,77,109,0.4)' };
            try {
              if (showLRef.current && areaRef.current) areaRef.current.update({ time: bar.time, value: bar.close });
              else candleRef.current?.update(cBar);
              volRef.current?.update(vBar);
              refreshInds(bars);
            } catch {}
          }
        } catch {}
      };
      ws.onclose = () => { if (pingId) clearInterval(pingId); if (!closed) setTimeout(tryConnect, 3000); };
      ws.onerror = () => {};
      wsRef.current = { close: () => { closed = true; if (pingId) clearInterval(pingId); ws.close(); } };
    };
    tryConnect();
  }

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: 'rgba(240,242,245,0.4)', fontFamily: 'JetBrains Mono, Courier New, monospace', fontSize: 10 },
      grid:    { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: 'rgba(255,255,255,0.3)', labelBackgroundColor: '#1a1a1a' }, horzLine: { color: 'rgba(255,255,255,0.3)', labelBackgroundColor: '#1a1a1a' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: true, secondsVisible: false },
    });
    chartRef.current = chart;

    const candle = chart.addCandlestickSeries({ upColor: C_UP, downColor: C_DN, borderUpColor: C_UP, borderDownColor: C_DN, wickUpColor: C_UP, wickDownColor: C_DN });
    candleRef.current = candle;

    const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '' });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    volRef.current = vol;

    chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
      if (!range || loadingRef.current) return;
      if (range.from < 10) {
        const oldest = barsRef.current[0];
        if (!oldest) return;
        loadingRef.current = true;
        fetchBars(coinRef.current, tfRef.current, oldest.time * 1000 - 1).then(older => {
          if (older.length) {
            const merged = [...older, ...barsRef.current];
            const seen = new Set();
            const deduped = merged.filter(b => { if (seen.has(b.time)) return false; seen.add(b.time); return true; });
            applyData(deduped);
          }
          loadingRef.current = false;
        });
      }
    });

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      indRefs.current = {};
      try { chart.remove(); } catch {}
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      areaRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    let cancelled = false;
    wsRef.current?.close();
    barsRef.current = [];
    fetchAllBars(coin, tf).then(bars => {
      if (cancelled || !candleRef.current) return;
      applyData(bars);
      chartRef.current?.timeScale().fitContent();
      connectWS(coin, tf);
    });
    return () => { cancelled = true; };
  }, [coin, tf]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    showLRef.current = showLine;
    if (showLine) {
      if (!areaRef.current) {
        const area = chart.addAreaSeries({ lineColor: C_UP, topColor: 'rgba(0,212,170,0.25)', bottomColor: 'rgba(0,212,170,0)', lineWidth: 2 });
        areaRef.current = area;
      }
      areaRef.current.setData(barsRef.current.map(b => ({ time: b.time, value: b.close })));
      areaRef.current.applyOptions({ visible: true });
      candleRef.current?.applyOptions({ visible: false });
    } else {
      areaRef.current?.applyOptions({ visible: false });
      candleRef.current?.applyOptions({ visible: true });
    }
  }, [showLine]);

  function toggleInd(name) {
    const chart = chartRef.current;
    if (!chart) return;
    if (activeInds[name]) {
      (indRefs.current[name] || []).forEach(s => { try { chart.removeSeries(s); } catch {} });
      delete indRefs.current[name];
      setActiveInds(p => ({ ...p, [name]: false }));
    } else {
      const bars = barsRef.current;
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
        }
        setActiveInds(p => ({ ...p, [name]: true }));
      } catch {}
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

      {/* Toolbar */}
      <div style={{ height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 2, borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
        <button onClick={() => { showLRef.current = false; setShowLine(false); }} style={{ height: 22, padding: '0 8px', borderRadius: 3, cursor: 'pointer', fontFamily: MONO, fontSize: 11, background: !showLine ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${!showLine ? 'var(--border-strong)' : 'transparent'}`, color: !showLine ? 'var(--text-primary)' : 'var(--text-muted)' }}>Candles</button>
        <button onClick={() => { showLRef.current = true; setShowLine(true); }} style={{ height: 22, padding: '0 8px', borderRadius: 3, cursor: 'pointer', fontFamily: MONO, fontSize: 11, background: showLine ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${showLine ? 'var(--border-strong)' : 'transparent'}`, color: showLine ? 'var(--text-primary)' : 'var(--text-muted)' }}>Line</button>
        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />
        <span style={{ fontFamily: SANS, fontSize: 10, color: 'var(--text-muted)', marginRight: 2 }}>Ind</span>
        {['MA','EMA','BOLL'].map(name => (
          <button key={name} onClick={() => toggleInd(name)} style={{ height: 22, padding: '0 7px', borderRadius: 3, cursor: 'pointer', fontFamily: MONO, fontSize: 10, background: activeInds[name] ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${activeInds[name] ? 'var(--border-strong)' : 'transparent'}`, color: activeInds[name] ? 'var(--text-primary)' : 'var(--text-muted)' }}>{name}</button>
        ))}
        <div style={{ flex: 1 }} />
      </div>

      {/* Chart area */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div ref={elRef} style={{ flex: 1, minWidth: 0, background: 'var(--bg-base)' }} />
        <OrderBook coin={coin} />
      </div>
    </div>
  );
}


// ── BottomPanel ────────────────────────────────────────────────

const BP_TABS = ['Positions', 'History', 'PnL'];

function BottomPanel({ coin, trades, positions, onClose }) {
  const [tab, setTab] = useState('Positions');

  const openPos    = useMemo(() => (positions || []).filter(p => normSym(p.symbol) === coin), [positions, coin]);
  const coinTrades = useMemo(() => (trades || []).filter(t => normSym(t.symbol) === coin), [trades, coin]);
  const closed     = coinTrades.filter(t => t.closed_at || t.status === 'closed');

  const pnlTotal = closed.reduce((s, t) => s + parseFloat(t.pnl_usdt || 0), 0);
  const wins     = closed.filter(t => parseFloat(t.pnl_usdt || 0) > 0);
  const losses   = closed.filter(t => parseFloat(t.pnl_usdt || 0) < 0);
  const wr       = closed.length ? wins.length / closed.length * 100 : null;
  const avgW     = wins.length   ? wins.reduce((s, t)   => s + parseFloat(t.pnl_usdt || 0), 0) / wins.length   : null;
  const avgL     = losses.length ? losses.reduce((s, t) => s + parseFloat(t.pnl_usdt || 0), 0) / losses.length : null;
  const rr       = avgW && avgL ? Math.abs(avgW / avgL) : null;

  const Th = ({ ch, right }) => (
    <th style={{ padding: '0 14px', height: 32, fontFamily: SANS, fontSize: 11, color: 'var(--text-muted)', fontWeight: 400, textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap', background: 'var(--bg-surface)', position: 'sticky', top: 0 }}>
      {ch}
    </th>
  );
  const Td = ({ v, color, right }) => (
    <td style={{ padding: '5px 14px', fontFamily: MONO, fontSize: 11, color: color || 'var(--text-secondary)', textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-subtle)' }}>
      {v ?? '—'}
    </td>
  );

  return (
    <div style={{ height: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', borderTop: '1px solid var(--border-subtle)' }}>
      <div style={{ height: 36, display: 'flex', alignItems: 'stretch', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0, background: 'var(--bg-surface)' }}>
        {BP_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '0 18px', background: 'none', border: 'none', cursor: 'pointer',
            fontFamily: SANS, fontSize: 12, fontWeight: tab === t ? 600 : 400,
            color: tab === t ? 'var(--text-primary)' : 'var(--text-muted)',
            borderBottom: tab === t ? '2px solid var(--accent-green)' : '2px solid transparent',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {t}
            {t === 'Positions' && openPos.length > 0 && (
              <span style={{ background: 'var(--accent-green)', color: '#000', padding: '1px 5px', borderRadius: 3, fontSize: 9, fontWeight: 700 }}>{openPos.length}</span>
            )}
            {t === 'History' && closed.length > 0 && (
              <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)' }}>{closed.length}</span>
            )}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-base)', scrollbarWidth: 'thin', scrollbarColor: 'var(--border-default) transparent' }}>

        {tab === 'Positions' && (
          openPos.length === 0
            ? <div style={{ padding: '20px 16px', fontFamily: SANS, fontSize: 12, color: 'var(--text-muted)' }}>No open positions · {coin}/USDT</div>
            : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th ch="Symbol"/><Th ch="Side"/><Th ch="Size"/><Th ch="Entry"/><Th ch="Mark"/><Th ch="Liq"/><Th ch="ROE"/><Th ch="Unrealized PnL" right/><Th ch=""/></tr></thead>
                <tbody>
                  {openPos.map((p, i) => (
                    <tr key={i}>
                      <Td v={`${normSym(p.symbol)}/USDT`} color="var(--text-primary)"/>
                      <Td v={p.side} color={isLong(p) ? 'var(--accent-green)' : 'var(--accent-red)'}/>
                      <Td v={fmtN(p.qty, 4)}/>
                      <Td v={p.entry_price ? `$${fmtN(p.entry_price, 2)}` : '—'}/>
                      <Td v={p.mark_price  ? `$${fmtN(p.mark_price, 2)}`  : '—'}/>
                      <Td v={p.liq_price   ? `$${fmtN(p.liq_price, 2)}`   : '—'} color="var(--accent-amber)"/>
                      <Td v={p.pnl_pct != null ? `${fmtSign(p.pnl_pct, 2)}%` : '—'} color={p.pnl_pct != null ? pclr(p.pnl_pct) : undefined}/>
                      <Td v={`${fmtSign(p.unrealized_pnl ?? 0, 2)} USDT`} color={pclr(p.unrealized_pnl ?? 0)} right/>
                      <td style={{ padding: '5px 14px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-subtle)' }}>
                        {onClose && (
                          <button onClick={() => onClose(p.symbol)} style={{
                            fontFamily: MONO, fontSize: 10, padding: '3px 8px',
                            background: 'transparent', border: '1px solid var(--accent-red)',
                            color: 'var(--accent-red)', cursor: 'pointer', borderRadius: 2,
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-red)'; e.currentTarget.style.color = '#000'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--accent-red)'; }}>
                            Close
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
        )}

        {tab === 'History' && (
          closed.length === 0
            ? <div style={{ padding: '20px 16px', fontFamily: SANS, fontSize: 12, color: 'var(--text-muted)' }}>No closed trades · {coin}/USDT</div>
            : <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><Th ch="Side"/><Th ch="Entry"/><Th ch="Exit"/><Th ch="Size"/><Th ch="Opened"/><Th ch="Closed"/><Th ch="PnL" right/></tr></thead>
                <tbody>
                  {closed.slice(0, 200).map((t, i) => {
                    const pnl = parseFloat(t.pnl_usdt || 0);
                    return (
                      <tr key={i}>
                        <Td v={t.side} color={isLong(t) ? 'var(--accent-green)' : 'var(--accent-red)'}/>
                        <Td v={t.entry_price ? `$${fmtN(t.entry_price, 2)}` : '—'}/>
                        <Td v={t.exit_price  ? `$${fmtN(t.exit_price, 2)}`  : '—'}/>
                        <Td v={fmtN(t.qty, 4)}/>
                        <Td v={dstr(t.opened_at)}/>
                        <Td v={dstr(t.closed_at)}/>
                        <Td v={`${fmtSign(pnl, 2)} USDT`} color={pclr(pnl)} right/>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
        )}

        {tab === 'PnL' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            {[
              { l: 'Total PnL',     v: `${fmtSign(pnlTotal, 2)} USDT`, c: pclr(pnlTotal) },
              { l: 'Total Trades',  v: closed.length },
              { l: 'Win Rate',      v: wr != null ? `${wr.toFixed(1)}%` : '—', c: wr != null && wr >= 50 ? 'var(--accent-green)' : undefined },
              { l: 'Wins / Losses', v: `${wins.length} / ${losses.length}` },
              { l: 'Avg Win',       v: avgW != null ? `${fmtSign(avgW, 2)} USDT` : '—', c: 'var(--accent-green)' },
              { l: 'Avg Loss',      v: avgL != null ? `${fmtSign(avgL, 2)} USDT` : '—', c: 'var(--accent-red)' },
              { l: 'Risk / Reward', v: rr != null ? rr.toFixed(2) : '—' },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontFamily: SANS, fontSize: 11, color: 'var(--text-muted)' }}>{row.l}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 600, color: row.c || 'var(--text-primary)' }}>{row.v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


// ── Root ───────────────────────────────────────────────────────

export default function GridBotPage() {
  const [coin,      setCoin]      = useState('BTC');
  const [tf,        setTf]        = useState('60');
  const [trades,    setTrades]    = useState([]);
  const [positions, setPositions] = useState([]);
  const [balance,   setBalance]   = useState(null);
  const [ticker,    setTicker]    = useState(null);

  const handleClose = async (symbol) => {
    if (!confirm(`Close ${symbol} position?`)) return;
    try {
      const r = await authFetch('/api/users/close-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || r.status); }
    } catch (e) {
      alert(`Failed to close ${symbol}: ${e.message}`);
    }
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [tRes, sRes] = await Promise.all([
          authFetch('/api/users/trades?limit=500'),
          authFetch('/api/users/bot-summary'),
        ]);
        if (tRes.ok) {
          const d = await tRes.json();
          setTrades((Array.isArray(d) ? d : d.trades ?? []).filter(t => t.source === 'grid'));
        }
        if (sRes.ok) {
          const d = await sRes.json();
          const pos = d.positions ?? [];
          setPositions(pos);
          setBalance(d.balance ?? null);
          if (pos.length > 0) {
            const activeCoin = normSym(pos[0].symbol);
            if (activeCoin && COINS.some(c => c.key === activeCoin)) setCoin(activeCoin);
          }
        }
      } catch {}
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const load = () =>
      fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${coin}USDT`)
        .then(r => r.json())
        .then(d => { const x = d?.result?.list?.[0]; if (x) setTicker(x); })
        .catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [coin]);

  return (
    <div data-grid-root style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg-base)', overflow: 'hidden' }}>
      <TickerRow coin={coin} setCoin={coin => { setCoin(coin); setTicker(null); }} tf={tf} setTf={setTf} ticker={ticker} />
      <StatsPanel balance={balance} trades={trades} positions={positions} />
      <KlineChart coin={coin} tf={tf} />
      <BottomPanel coin={coin} trades={trades} positions={positions} onClose={handleClose} />
    </div>
  );
}
