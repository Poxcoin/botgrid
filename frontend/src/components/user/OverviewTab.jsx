import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { init as klInit, dispose as klDispose } from 'klinecharts';
import { AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';

/* ── design ─────────────────────────────────────────────────────── */
const FF = 'var(--font-sans)';
const FM = 'var(--font-mono)';

/* ── api ─────────────────────────────────────────────────────────── */
const api = p =>
  fetch(p, { headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}` } })
    .then(r => r.ok ? r.json() : Promise.reject(r.status));

/* ── helpers ─────────────────────────────────────────────────────── */
const sym  = s => (s || '').replace('/USDT', '').replace('USDT', '').trim();
const pnl  = t => parseFloat(t?.pnl_usdt ?? t?.pnl ?? 0);
const fix  = (v, d = 2) => v == null || isNaN(+v) ? '—' : (+v).toFixed(d);
const sign = (v, d = 2) => { const n = +v; return isNaN(n) ? '—' : (n >= 0 ? '+' : '') + n.toFixed(d); };
const pos  = v => +v >= 0;
const dstr = s => s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

/* ══════════════════════════════════════════════════════════════════
   MARKET TRADES
══════════════════════════════════════════════════════════════════ */
function Trades({ coin }) {
  const [rows, setRows] = useState([]);
  const buf = useRef([]);

  useEffect(() => {
    if (!coin) return;
    fetch(`https://api.bybit.com/v5/market/recent-trade?category=linear&symbol=${coin}USDT&limit=80`)
      .then(r => r.json()).then(d => {
        const list = (d?.result?.list || []).map(t => ({ id: t.execId, p: t.price, q: t.size, buy: t.side === 'Buy' }));
        buf.current = list; setRows(list);
      }).catch(() => {});

    const ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');
    ws.onopen = () => ws.send(JSON.stringify({ op: 'subscribe', args: [`publicTrade.${coin}USDT`] }));
    ws.onmessage = e => {
      try {
        const m = JSON.parse(e.data);
        if (m.topic === `publicTrade.${coin}USDT` && Array.isArray(m.data)) {
          buf.current = [...m.data.map(t => ({ id: t.i, p: t.p, q: t.v, buy: t.S === 'Buy' })), ...buf.current].slice(0, 80);
          setRows([...buf.current]);
        }
      } catch {}
    };
    ws.onerror = ws.onclose = () => {};
    return () => ws.close();
  }, [coin]);

  return (
    <div style={{ width: 180, flexShrink: 0, borderLeft: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ height: 40, flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr auto', padding: '0 12px', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Price</span>
        <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Qty</span>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none' }}>
        {rows.map((r, i) => (
          <div key={r.id || i} style={{ display: 'grid', gridTemplateColumns: '1fr auto', padding: '2px 12px', gap: 8 }}>
            <span style={{ fontFamily: FM, fontSize: 10, color: r.buy ? 'var(--accent-green)' : 'var(--accent-red)' }}>{r.p}</span>
            <span style={{ fontFamily: FM, fontSize: 10, color: 'var(--text-muted)' }}>{(+r.q).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   CHART — identical to GridBotPage (draw tools, indicators, order book)
══════════════════════════════════════════════════════════════════ */

const POP_COINS = ['BTC','ETH','SOL','BNB','XRP','DOGE','ADA','AVAX','LINK','TON','PEPE','SUI'];

const CHART_STYLES = {
  grid: {
    horizontal: { show: true, size: 1, color: 'rgba(255,255,255,0.04)', style: 'dashed', dashedValue: [3, 3] },
    vertical:   { show: true, size: 1, color: 'rgba(255,255,255,0.04)', style: 'dashed', dashedValue: [3, 3] },
  },
  candle: {
    type: 'candle_solid',
    bar: { upColor: '#00d4aa', downColor: '#ff4d6d', noChangeColor: '#888', upBorderColor: '#00d4aa', downBorderColor: '#ff4d6d', noChangeBorderColor: '#888', upWickColor: '#00d4aa', downWickColor: '#ff4d6d', noChangeWickColor: '#888' },
    tooltip: { showRule: 'follow_cross', showType: 'standard', labels: ['O', 'H', 'L', 'C', 'Vol'] },
  },
  indicator: {
    ohlc: { upColor: '#00d4aa', downColor: '#ff4d6d', noChangeColor: '#888' },
    bars: [{ upColor: 'rgba(0,212,170,0.5)', downColor: 'rgba(255,77,109,0.5)', noChangeColor: 'rgba(136,136,136,0.5)' }],
  },
  xAxis: {
    axisLine: { show: true, color: 'rgba(255,255,255,0.08)', size: 1 },
    tickLine: { show: true, color: 'rgba(255,255,255,0.08)', size: 1, length: 3 },
    tickText: { show: true, color: 'rgba(240,242,245,0.3)', size: 10, family: 'JetBrains Mono, Courier New, monospace', weight: 'normal' },
  },
  yAxis: {
    axisLine: { show: true, color: 'rgba(255,255,255,0.08)', size: 1 },
    tickLine: { show: true, color: 'rgba(255,255,255,0.08)', size: 1, length: 3 },
    tickText: { show: true, color: 'rgba(240,242,245,0.3)', size: 10, family: 'JetBrains Mono, Courier New, monospace', weight: 'normal' },
  },
  separator: { size: 1, color: 'rgba(255,255,255,0.06)', activeBackgroundColor: 'rgba(255,255,255,0.04)' },
  crosshair: {
    show: true,
    horizontal: { line: { show: true, style: 'dashed', dashedValue: [4, 2], size: 1, color: 'rgba(255,255,255,0.2)' }, text: { show: true, size: 10, family: 'JetBrains Mono, Courier New, monospace', color: '#fff', paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3, borderSize: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 2, backgroundColor: '#1a1a1a' } },
    vertical:   { line: { show: true, style: 'dashed', dashedValue: [4, 2], size: 1, color: 'rgba(255,255,255,0.2)' }, text: { show: true, size: 10, family: 'JetBrains Mono, Courier New, monospace', color: '#fff', paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3, borderSize: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 2, backgroundColor: '#1a1a1a' } },
  },
  overlay: {
    point: { backgroundColor: '#00d4aa', borderColor: '#00d4aa', activeBackgroundColor: '#fff', activeBorderColor: '#fff' },
    line:  { size: 1, color: '#00d4aa' },
    text:  { color: '#fff', size: 12, family: 'JetBrains Mono, Courier New, monospace', weight: 'normal' },
  },
};

const CHART_TYPES = [
  { id: 'candle_solid',     label: 'Candles' },
  { id: 'candle_up_stroke', label: 'B&W'     },
  { id: 'candle_stroke',    label: 'Hollow'  },
  { id: 'area',             label: 'Line'    },
];
const COL_GREEN = '#00d4aa';
const COL_RED   = '#ff4d6d';
const CHART_TYPE_CFG = {
  candle_solid:     { bar: { upColor: COL_GREEN, downColor: COL_RED, noChangeColor: '#888', upBorderColor: COL_GREEN, downBorderColor: COL_RED, noChangeBorderColor: '#888', upWickColor: COL_GREEN, downWickColor: COL_RED, noChangeWickColor: '#888' }, vol: [{ upColor: 'rgba(0,212,170,0.45)', downColor: 'rgba(255,77,109,0.45)', noChangeColor: 'rgba(136,136,136,0.45)' }] },
  candle_up_stroke: { bar: { upColor: 'transparent', downColor: 'rgba(255,255,255,0.85)', noChangeColor: 'rgba(255,255,255,0.4)', upBorderColor: 'rgba(255,255,255,0.85)', downBorderColor: 'rgba(255,255,255,0.85)', noChangeBorderColor: 'rgba(255,255,255,0.4)', upWickColor: 'rgba(255,255,255,0.55)', downWickColor: 'rgba(255,255,255,0.55)', noChangeWickColor: 'rgba(255,255,255,0.3)' }, vol: [{ upColor: 'rgba(255,255,255,0.18)', downColor: 'rgba(255,255,255,0.09)', noChangeColor: 'rgba(255,255,255,0.12)' }] },
  candle_stroke:    { bar: { upColor: 'transparent', downColor: 'transparent', noChangeColor: 'transparent', upBorderColor: COL_GREEN, downBorderColor: COL_RED, noChangeBorderColor: '#888', upWickColor: COL_GREEN, downWickColor: COL_RED, noChangeWickColor: '#888' }, vol: [{ upColor: 'rgba(0,212,170,0.45)', downColor: 'rgba(255,77,109,0.45)', noChangeColor: 'rgba(136,136,136,0.45)' }] },
  area:             { bar: { upColor: COL_GREEN, downColor: COL_RED, noChangeColor: '#888', upBorderColor: COL_GREEN, downBorderColor: COL_RED, noChangeBorderColor: '#888', upWickColor: COL_GREEN, downWickColor: COL_RED, noChangeWickColor: '#888' }, vol: [{ upColor: 'rgba(0,212,170,0.45)', downColor: 'rgba(255,77,109,0.45)', noChangeColor: 'rgba(136,136,136,0.45)' }] },
};

const INDS_CANDLE = ['MA', 'EMA', 'BOLL'];
const INDS_PANE   = ['VOL', 'MACD', 'RSI'];
const ALL_INDS    = [...INDS_CANDLE, ...INDS_PANE];

const DRAW_TOOLS = [
  { id: null,                     icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 2l4 10 2-4 4-2L2 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>, title: 'Default cursor' },
  { id: 'segment',                icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="2" y1="12" x2="12" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>, title: 'Trend line' },
  { id: 'horizontalStraightLine', icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>, title: 'Horizontal line' },
  { id: 'rayLine',                icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="2" y1="12" x2="12" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><circle cx="2" cy="12" r="1.5" fill="currentColor"/></svg>, title: 'Ray' },
  { id: 'fibonacciLine',          icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><line x1="1" y1="3" x2="13" y2="3" stroke="currentColor" strokeWidth="1" opacity="0.5"/><line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5"/><line x1="1" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1" opacity="0.5"/><line x1="3" y1="3" x2="3" y2="11" stroke="currentColor" strokeWidth="1.2"/><line x1="11" y1="3" x2="11" y2="11" stroke="currentColor" strokeWidth="1.2"/></svg>, title: 'Fibonacci' },
];

function OrderBook({ coin }) {
  const [book, setBook] = useState({ b: [], a: [] });
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`https://api.bybit.com/v5/market/orderbook?category=linear&symbol=${coin}USDT&limit=12`)
        .then(r => r.json())
        .then(d => { if (alive && d.result && Array.isArray(d.result.b)) setBook(d.result); })
        .catch(() => {});
    load();
    const t = setInterval(load, 1500);
    return () => { alive = false; clearInterval(t); };
  }, [coin]);

  const bids = (book.b || []).slice(0, 12);
  const asks = (book.a || []).slice(0, 12);
  const maxSize = Math.max(...[...bids, ...asks].map(r => +r[1]), 1);
  const spread  = bids[0] && asks[0] ? (+asks[0][0] - +bids[0][0]).toFixed(2) : null;

  const OBRow = ({ price, size, side }) => {
    const pct = Math.min((+size / maxSize) * 100, 100);
    const isAsk = side === 'ask';
    return (
      <div style={{ position: 'relative', height: 17, display: 'flex', alignItems: 'center', padding: '0 10px', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: `${pct}%`, background: isAsk ? 'rgba(255,77,109,0.07)' : 'rgba(0,212,170,0.07)' }} />
        <span style={{ fontFamily: FM, fontSize: 10, color: isAsk ? 'var(--accent-red)' : 'var(--accent-green)', zIndex: 1 }}>{(+price).toFixed(2)}</span>
        <span style={{ fontFamily: FM, fontSize: 10, color: 'rgba(255,255,255,0.35)', zIndex: 1 }}>{(+size).toFixed(3)}</span>
      </div>
    );
  };

  return (
    <div style={{ width: 170, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-subtle)', background: 'var(--bg-base)', overflow: 'hidden' }}>
      <div style={{ padding: '0 10px', height: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <span style={{ fontFamily: FF, fontSize: 10, color: 'var(--text-muted)' }}>Order Book</span>
        {spread && <span style={{ fontFamily: FM, fontSize: 9, color: 'var(--text-muted)' }}>Δ {spread}</span>}
      </div>
      <div style={{ padding: '2px 0' }}>
        <div style={{ padding: '0 10px', height: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: FF, fontSize: 9, color: 'var(--text-muted)' }}>PRICE</span>
          <span style={{ fontFamily: FF, fontSize: 9, color: 'var(--text-muted)' }}>QTY</span>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        {asks.slice().reverse().map(([p, s], i) => <OBRow key={i} price={p} size={s} side="ask" />)}
      </div>
      <div style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderTop: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0 }}>
        <span style={{ fontFamily: FM, fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{bids[0] ? (+bids[0][0]).toFixed(2) : '—'}</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {bids.map(([p, s], i) => <OBRow key={i} price={p} size={s} side="bid" />)}
      </div>
    </div>
  );
}

function Chart({ coin, entryPrice }) {
  const elRef      = useRef(null);
  const chartRef   = useRef(null);
  const panesRef   = useRef({});
  const wsSubRef   = useRef(null);
  const entryOvRef = useRef(null);
  const [tf,         setTf]         = useState('60');
  const [activeTool, setActiveTool] = useState(null);
  const [activeInds, setActiveInds] = useState({});
  const [chartType,  setChartType]  = useState('candle_solid');

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    let mounted = true;
    let ro = null;

    const setup = () => {
      if (!mounted) return;
      const { width, height } = el.getBoundingClientRect();
      if (width === 0 || height === 0) { requestAnimationFrame(setup); return; }

      const chart = klInit(el, { styles: CHART_STYLES, locale: 'en-US' });
      chartRef.current = chart;
      panesRef.current = {};
      entryOvRef.current = null;

      const pp = coin === 'BTC' ? 1 : ['DOGE','ADA','XRP','PEPE','LINK','TON'].includes(coin) ? 4 : 2;
      chart.setSymbol({ shortName: `${coin}USDT`, pricePrecision: pp, volumePrecision: 4 });
      chart.setPeriod({ multiplier: 1, timespan: 'custom', text: tf });
      chart.setDataLoader({
        getBars: async ({ type, period, timestamp, callback }) => {
          if (type !== 'init' && type !== 'forward') { callback([], false); return; }
          try {
            const parse = list => list.slice().reverse().map(k => ({
              timestamp: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
            }));
            const fetchPage = async (end, limit = 1000) => {
              let url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${coin}USDT&interval=${period.text}&limit=${limit}`;
              if (end) url += `&end=${end}`;
              const r = await fetch(url);
              const d = await r.json();
              return parse(d.result?.list || []);
            };
            if (type === 'init') {
              // 300 candles — one fast request; more load on scroll via 'forward'
              const page = await fetchPage(undefined, 300);
              callback(page, { backward: false, forward: page.length >= 300 });
            } else {
              const page = await fetchPage(timestamp - 1);
              callback(page, { backward: false, forward: page.length >= 1000 });
            }
          } catch { callback([], false); }
        },
        subscribeBar: ({ period, callback: cb }) => {
          // Poll every 2s — stable, no per-trade flood that breaks klinecharts rendering
          const poll = async () => {
            try {
              const r = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${coin}USDT&interval=${period.text}&limit=1`);
              const d = await r.json();
              const k = d?.result?.list?.[0];
              if (k) cb({ timestamp: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] });
            } catch {}
          };
          poll();
          const pollId = setInterval(poll, 2000);
          wsSubRef.current = { close: () => clearInterval(pollId) };
        },
        unsubscribeBar: () => {
          if (wsSubRef.current) { wsSubRef.current.close(); wsSubRef.current = null; }
        },
      });
      requestAnimationFrame(() => { try { chart.zoomAtCoordinate?.(-5); } catch {} });
      ro = new ResizeObserver(() => { try { chartRef.current?.resize(); } catch {} });
      ro.observe(el);
    };

    requestAnimationFrame(setup);

    return () => {
      mounted = false;
      if (wsSubRef.current) { wsSubRef.current.close(); wsSubRef.current = null; }
      if (ro) ro.disconnect();
      try { klDispose(el); } catch {}
      chartRef.current = null;
      panesRef.current = {};
      entryOvRef.current = null;
    };
  }, [coin, tf]);

  // Entry price line — separate effect, no chart reinit
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      if (entryOvRef.current) { chart.removeOverlay?.(entryOvRef.current); entryOvRef.current = null; }
      if (entryPrice && entryPrice > 0) {
        const id = chart.createOverlay?.({ name: 'horizontalStraightLine', points: [{ value: entryPrice }], styles: { line: { style: 'dashed', dashedValue: [4, 4], size: 1, color: 'rgba(251,191,36,0.85)' } }, extendData: `Entry $${entryPrice}`, lock: true });
        entryOvRef.current = id ?? null;
      }
    } catch {}
  }, [entryPrice]);

  function applyChartType(typeId) {
    setChartType(typeId);
    const cfg = CHART_TYPE_CFG[typeId] || CHART_TYPE_CFG.candle_solid;
    try { chartRef.current?.setStyles({ candle: { type: typeId, bar: cfg.bar }, indicator: { bars: cfg.vol } }); } catch {}
  }

  function selectTool(toolId) {
    const chart = chartRef.current;
    if (!chart) return;
    if (activeTool === toolId) {
      setActiveTool(null);
      try { chart.removeOverlay(); } catch {}
    } else {
      setActiveTool(toolId);
      if (toolId) try { chart.createOverlay({ name: toolId, lock: false }); } catch {}
      else try { chart.removeOverlay(); } catch {}
    }
  }

  function toggleInd(name) {
    const chart = chartRef.current;
    if (!chart) return;
    if (activeInds[name]) {
      const paneId = panesRef.current[name];
      try {
        if (INDS_CANDLE.includes(name)) chart.removeIndicator('candle_pane', name);
        else if (paneId) chart.removeIndicator(paneId, name);
      } catch {}
      delete panesRef.current[name];
      setActiveInds(p => ({ ...p, [name]: false }));
    } else {
      try {
        if (INDS_CANDLE.includes(name)) {
          chart.createIndicator(name, false, { id: 'candle_pane' });
          panesRef.current[name] = 'candle_pane';
        } else {
          const paneId = chart.createIndicator(name, false, { height: 80 });
          panesRef.current[name] = paneId;
        }
        setActiveInds(p => ({ ...p, [name]: true }));
      } catch {}
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 480, border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', overflow: 'hidden' }}>

      {/* Top toolbar: chart type + indicators + TF */}
      <div style={{ height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 2, borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
        {CHART_TYPES.map(ct => (
          <button key={ct.id} onClick={() => applyChartType(ct.id)} style={{ height: 22, padding: '0 8px', borderRadius: 3, cursor: 'pointer', fontFamily: FM, fontSize: 11, background: chartType === ct.id ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${chartType === ct.id ? 'var(--border-strong)' : 'transparent'}`, color: chartType === ct.id ? 'var(--text-primary)' : 'var(--text-muted)' }}>{ct.label}</button>
        ))}
        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />
        <span style={{ fontFamily: FF, fontSize: 10, color: 'var(--text-muted)', marginRight: 2 }}>Ind</span>
        {ALL_INDS.map(name => (
          <button key={name} onClick={() => toggleInd(name)} style={{ height: 22, padding: '0 7px', borderRadius: 3, cursor: 'pointer', fontFamily: FM, fontSize: 10, background: activeInds[name] ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${activeInds[name] ? 'var(--border-strong)' : 'transparent'}`, color: activeInds[name] ? 'var(--text-primary)' : 'var(--text-muted)' }}>{name}</button>
        ))}
        <div style={{ flex: 1 }} />
        {activeTool && (
          <button onClick={() => { setActiveTool(null); try { chartRef.current?.removeOverlay(); } catch {} }} style={{ height: 22, padding: '0 8px', borderRadius: 3, cursor: 'pointer', fontFamily: FF, fontSize: 10, background: 'transparent', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>Clear</button>
        )}
        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />
        {['1','5','15','60','240','D'].map(t => (
          <button key={t} onClick={() => setTf(t)} style={{ height: 22, padding: '0 8px', borderRadius: 3, cursor: 'pointer', fontFamily: FM, fontSize: 11, background: tf === t ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${tf === t ? 'var(--border-strong)' : 'transparent'}`, color: tf === t ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: tf === t ? 600 : 400 }}>{{ '1':'1m','5':'5m','15':'15m','60':'1h','240':'4h','D':'1D' }[t]}</button>
        ))}
      </div>

      {/* Chart area */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left draw toolbar */}
        <div style={{ width: 34, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 6, gap: 2, borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          {DRAW_TOOLS.map(t => (
            <button key={t.id ?? 'cursor'} title={t.title} onClick={() => selectTool(t.id)} style={{ width: 26, height: 26, borderRadius: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: activeTool === t.id ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${activeTool === t.id ? 'var(--border-strong)' : 'transparent'}`, color: activeTool === t.id ? 'var(--text-primary)' : 'var(--text-muted)', padding: 0 }}>{t.icon}</button>
          ))}
        </div>
        {/* Canvas */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
          <div ref={elRef} style={{ position: 'absolute', inset: 0, background: 'var(--bg-base)' }} />
        </div>
        {/* Order book */}
        <OrderBook coin={coin} />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   EQUITY CURVE — isolated component to avoid recharts ResizeObserver
   setState-during-render (React error #310) in React 18 concurrent mode
══════════════════════════════════════════════════════════════════ */
function EquityCurve({ data }) {
  const wrapRef = useRef(null);
  const [w, setW] = useState(0);

  useEffect(() => {
    if (!wrapRef.current) return;
    setW(wrapRef.current.offsetWidth);
    const ro = new ResizeObserver(entries => setW(entries[0].contentRect.width));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  const isPos = data[data.length - 1]?.v >= 0;
  const h = 216;

  return (
    <div ref={wrapRef} style={{ padding: '12px 4px', height: h + 24 }}>
      {w > 0 && (
        <AreaChart width={w} height={h} data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="eq_grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={isPos ? '#00d4aa' : '#ff4d6d'} stopOpacity={0.25}/>
              <stop offset="95%" stopColor={isPos ? '#00d4aa' : '#ff4d6d'} stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="t" tick={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fill: 'rgba(240,242,245,0.3)' }} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
          <YAxis tick={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fill: 'rgba(240,242,245,0.3)' }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`}/>
          <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }} formatter={v => [`$${v}`, 'Cumulative PnL']} labelStyle={{ color: 'rgba(240,242,245,0.5)', fontSize: 9 }}/>
          <Area type="monotone" dataKey="v" stroke={isPos ? '#00d4aa' : '#ff4d6d'} strokeWidth={1.5} fill="url(#eq_grad)" dot={false} activeDot={{ r: 3 }}/>
        </AreaChart>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   BOTTOM PANEL
══════════════════════════════════════════════════════════════════ */
function Panel({ botTrades, botPositions, onClose = () => {} }) {
  const [tab, setTab] = useState('open');
  const [fundingRates, setFundingRates] = useState({});
  const open   = useMemo(() => botTrades.filter(t => !t.closed_at && t.status !== 'failed'), [botTrades]);
  const closed = useMemo(() => botTrades.filter(t => !!t.closed_at).sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at)), [botTrades]);

  const pnlTotal = useMemo(() => closed.reduce((s, t) => s + pnl(t), 0), [closed]);
  const pnlWins  = useMemo(() => closed.filter(t => pnl(t) > 0), [closed]);
  const pnlLoss  = useMemo(() => closed.filter(t => pnl(t) < 0), [closed]);
  const pnlWr    = closed.length ? Math.round(pnlWins.length / closed.length * 100) : 0;

  useEffect(() => {
    if (!botPositions.length) return;
    const symbols = [...new Set(botPositions.map(p => sym(p.symbol)))];
    symbols.forEach(s => {
      fetch(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${s}USDT`)
        .then(r => r.json())
        .then(d => {
          const fr = d?.result?.list?.[0]?.fundingRate;
          if (fr != null) setFundingRates(prev => ({ ...prev, [s]: parseFloat(fr) * 100 }));
        })
        .catch(() => {});
    });
  }, [botPositions]);

  const TABS = [
    { id: 'open',      label: 'Open Orders',   n: open.length },
    { id: 'positions', label: 'Positions',     n: botPositions.length },
    { id: 'history',   label: 'Trade History', n: null },
    { id: 'pnl',       label: 'P&L',           n: null },
    { id: 'equity',    label: 'Equity Curve',  n: null },
  ];

  const Th = ({ v, r }) => (
    <th style={{ padding: '6px 14px', fontFamily: FM, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 400, textAlign: r ? 'right' : 'left', background: 'var(--bg-base)', position: 'sticky', top: 0, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-subtle)' }}>{v}</th>
  );
  const Td = ({ v, hi, r }) => (
    <td style={{ padding: '7px 14px', fontFamily: FM, fontSize: 11, color: hi || 'var(--text-secondary)', textAlign: r ? 'right' : 'left', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>{v ?? '—'}</td>
  );
  const Empty = () => (
    <div style={{ padding: '40px 0', textAlign: 'center', fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', color: 'var(--text-muted)' }}>EMPTY</div>
  );

  return (
    <div style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', overflow: 'hidden' }}>
      {/* tabs */}
      <div style={{ display: 'flex', height: 40, borderBottom: '1px solid var(--border-subtle)', overflowX: 'auto', scrollbarWidth: 'none' }}>
        {TABS.map(t => {
          const on = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '0 18px',
              background: 'transparent', border: 'none',
              borderBottom: on ? '1px solid var(--text-primary)' : '1px solid transparent',
              cursor: 'pointer', whiteSpace: 'nowrap',
              fontFamily: FF, fontSize: 12,
              color: on ? 'var(--text-primary)' : 'var(--text-muted)',
            }}
            onMouseEnter={e => { if (!on) e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={e => { if (!on) e.currentTarget.style.color = 'var(--text-muted)'; }}>
              {t.label}
              {t.n != null && (
                <span style={{ fontFamily: FM, fontSize: 9, color: 'var(--text-muted)', padding: '1px 5px', border: '1px solid var(--border-default)' }}>
                  {t.n}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* content */}
      <div style={{ maxHeight: 260, overflowY: 'auto', overflowX: 'auto' }}>
        {tab === 'open' && (open.length === 0 ? <Empty /> :
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th v="Date"/><Th v="Symbol"/><Th v="Side"/><Th v="Size"/><Th v="Entry"/><Th v="Lev"/></tr></thead>
            <tbody>{open.map((t, i) => (
              <tr key={i} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Td v={dstr(t.opened_at)}/>
                <Td v={sym(t.symbol)} hi="var(--text-primary)"/>
                <Td v={t.side} hi={t.side === 'Buy' ? 'var(--accent-green)' : 'var(--accent-red)'}/>
                <Td v={fix(t.qty, 3)}/><Td v={fix(t.entry_price, 4)}/><Td v={t.leverage ? `${t.leverage}x` : '—'}/>
              </tr>
            ))}</tbody>
          </table>
        )}

        {tab === 'positions' && (botPositions.length === 0 ? <Empty /> :
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th v="Symbol"/><Th v="Side"/><Th v="Lev"/><Th v="Size"/><Th v="Entry"/><Th v="Mark"/><Th v="SL"/><Th v="TP"/><Th v="FR 8h"/><Th v="PnL%" r/><Th v="Unrealized" r/><Th v=""/></tr></thead>
            <tbody>{botPositions.map((p, i) => {
              const upnl   = p.unrealized_pnl ?? 0;
              const hasSL  = !!p.stop_loss;
              const hasTP  = !!p.take_profit;
              return (
                <tr key={i} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Td v={sym(p.symbol)} hi="var(--text-primary)"/>
                  <Td v={p.side} hi={p.side === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)'}/>
                  <Td v={p.leverage ? `${p.leverage}x` : '—'}/>
                  <Td v={fix(p.qty, 3)}/>
                  <Td v={fix(p.entry_price, 4)}/>
                  <Td v={fix(p.mark_price, 4)}/>
                  <Td v={hasSL ? fix(p.stop_loss, 4) : '—'} hi={!hasSL ? 'var(--accent-red)' : undefined}/>
                  <Td v={hasTP ? fix(p.take_profit, 4) : '⚠ NO TP'} hi={!hasTP ? 'var(--accent-red)' : undefined}/>
                  {(() => {
                    const fr = fundingRates[sym(p.symbol)];
                    return <Td v={fr != null ? `${fr >= 0 ? '+' : ''}${fr.toFixed(4)}%` : '—'} hi={fr != null ? (fr >= 0 ? 'var(--accent-red)' : 'var(--accent-green)') : undefined}/>;
                  })()}
                  <Td v={p.pnl_pct != null ? `${sign(p.pnl_pct, 1)}%` : '—'} hi={pos(p.pnl_pct ?? 0) ? 'var(--accent-green)' : 'var(--accent-red)'} r/>
                  <Td v={`${sign(upnl)} USDT`} hi={pos(upnl) ? 'var(--accent-green)' : 'var(--accent-red)'} r/>
                  <td style={{ padding: '4px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <button
                      onClick={() => onClose(p.symbol)}
                      style={{ fontFamily: FM, fontSize: 10, padding: '3px 8px', background: 'transparent', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,77,109,0.15)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      Close
                    </button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        )}

        {tab === 'history' && (closed.length === 0 ? <Empty /> :
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th v="Date"/><Th v="Symbol"/><Th v="Side"/><Th v="Lev"/><Th v="Size"/><Th v="Entry"/><Th v="Exit"/><Th v="PnL" r/></tr></thead>
            <tbody>{closed.slice(0, 200).map((t, i) => {
              const p = pnl(t);
              return (
                <tr key={i} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Td v={dstr(t.closed_at)}/><Td v={sym(t.symbol)} hi="var(--text-primary)"/>
                  <Td v={t.side} hi={t.side === 'LONG' || t.side === 'Buy' ? 'var(--accent-green)' : 'var(--accent-red)'}/>
                  <Td v={t.leverage ? `${t.leverage}x` : '—'}/>
                  <Td v={fix(t.qty, 3)}/><Td v={fix(t.entry_price, 4)}/><Td v={fix(t.exit_price, 4)}/>
                  <Td v={`${sign(p)} USDT`} hi={pos(p) ? 'var(--accent-green)' : 'var(--accent-red)'} r/>
                </tr>
              );
            })}</tbody>
          </table>
        )}

        {tab === 'pnl' && (closed.length === 0 ? <Empty /> :
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 0 }}>
            {[
              ['Total PnL', `${sign(pnlTotal)} USDT`,                        pos(pnlTotal)],
              ['Win Rate',  `${pnlWr}%`,                                      pnlWr >= 50],
              ['Trades',    String(closed.length),                            true],
              ['W / L',     `${pnlWins.length} / ${pnlLoss.length}`,         true],
            ].map(([l, v, good]) => (
              <div key={l} style={{ padding: '20px 18px', borderRight: '1px solid var(--border-subtle)' }}>
                <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>{l}</div>
                <div style={{ fontFamily: FM, fontSize: 22, fontWeight: 600, color: good ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'equity' && (() => {
          const sorted = [...botTrades]
            .filter(t => t.closed_at && t.pnl_usdt != null)
            .sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at));
          let cum = 0;
          const data = sorted.map(t => {
            cum += parseFloat(t.pnl_usdt ?? t.pnl ?? 0);
            return { t: dstr(t.closed_at), v: parseFloat(cum.toFixed(2)) };
          });
          if (data.length === 0) return <Empty />;
          return <EquityCurve data={data} />;
        })()}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════════════════════════ */
const BOT_DB_SOURCE = { signal: 'news', cascade: 'liq_cascade', fr: 'fr' };

export default function OverviewTab({ botId = 'signal' }) {
  const dbSource = BOT_DB_SOURCE[botId] ?? botId;

  const [summary,   setSummary]   = useState(null);
  const [trades,    setTrades]    = useState([]);
  const [coin,      setCoin]      = useState('BTC');
  const [heartbeat, setHeartbeat] = useState({});
  const autoSelectDoneRef = useRef(false);

  const refresh = useCallback(() => {
    Promise.all([api('/api/users/bot-summary'), api('/api/users/trades?limit=500')])
      .then(([s, td]) => { setSummary(s); setTrades(Array.isArray(td) ? td : (td?.trades ?? [])); })
      .catch(() => {});
  }, []);

  useEffect(() => { refresh(); const id = setInterval(refresh, 5000); return () => clearInterval(id); }, [refresh]);

  useEffect(() => {
    const go = () => api('/api/users/bot-heartbeat').then(setHeartbeat).catch(() => {});
    go();
    const id = setInterval(go, 30000);
    return () => clearInterval(id);
  }, []);

  const positions    = summary?.positions ?? [];
  const balance      = summary?.balance;
  const totalUnreal  = summary?.total_unrealized ?? null;
  const botTrades    = useMemo(() => trades.filter(t => (t.source || '') === dbSource), [trades, dbSource]);
  const botPos       = positions; // all open positions come from same Bybit account

  const botCoins = useMemo(() => {
    const s = new Set();
    botTrades.forEach(t => { const c = sym(t.symbol); if (c) s.add(c); });
    botPos.forEach(p => { const c = sym(p.symbol); if (c) s.add(c); });
    return [...s].sort();
  }, [botTrades, botPos]);

  // show only bot-traded coins; fall back to popular list only when bot has zero history
  const coins = useMemo(() => botCoins.length > 0 ? botCoins : POP_COINS, [botCoins]);

  // reset auto-select flag when user switches bot tab
  useEffect(() => { autoSelectDoneRef.current = false; }, [botId]);
  // auto-select first bot coin only once per tab load, never override user choice after that
  useEffect(() => {
    if (!autoSelectDoneRef.current && botCoins.length > 0) {
      setCoin(botCoins[0]);
      autoSelectDoneRef.current = true;
    }
  }, [botCoins]);

  const stats = useMemo(() => {
    const cl    = botTrades.filter(t => t.closed_at);
    const total = cl.reduce((s, t) => s + pnl(t), 0);
    const wins  = cl.filter(t => pnl(t) > 0).length;
    return { total, wins, n: cl.length, wr: cl.length ? Math.round(wins / cl.length * 100) : 0 };
  }, [botTrades]);

  const openN = botTrades.filter(t => !t.closed_at && t.status !== 'failed').length;

  const activePos  = botPos.find(p => sym(p.symbol) === coin);
  const entryPrice = activePos?.entry_price ?? 0;

  const handleClose = useCallback(async (symbol) => {
    if (!confirm(`Close ${symbol} position?`)) return;
    try {
      const r = await fetch('/api/users/close-position', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('kado_token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || r.status); }
      setTimeout(refresh, 1000);
    } catch (e) {
      alert(`Failed to close ${symbol}: ${e.message}`);
    }
  }, [refresh]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── STATS ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 0, border: '1px solid var(--border-subtle)' }}>
        {[
          { label: 'Balance',    value: balance ? `$${(+balance.wallet).toFixed(2)}` : '—', sub: balance?.equity ? `equity $${(+balance.equity).toFixed(2)}` : null, good: null },
          { label: 'Unrealized', value: totalUnreal != null ? `${sign(totalUnreal)} USDT` : '—', sub: botPos.length ? `${botPos.length} open positions` : 'no open positions', good: totalUnreal != null ? pos(totalUnreal) : null },
          { label: 'Realized',   value: `${sign(stats.total)} USDT`, sub: `${stats.n} closed trades`, good: stats.n > 0 ? pos(stats.total) : null },
          { label: 'Win Rate',   value: `${stats.wr}%`, sub: `${stats.wins}W / ${stats.n - stats.wins}L`, good: stats.n > 0 ? stats.wr >= 50 : null },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: '20px 20px', borderRight: i < 3 ? '1px solid var(--border-subtle)' : 'none' }}>
            <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>{s.label}</div>
            <div style={{ fontFamily: FM, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: s.good === null ? 'var(--text-primary)' : s.good ? 'var(--accent-green)' : 'var(--accent-red)' }}>{s.value}</div>
            {s.sub && <div style={{ fontFamily: FF, fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* ── HEARTBEAT ─────────────────────────────────────────── */}
      {heartbeat[dbSource] != null && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {(() => {
            const h = heartbeat[dbSource];
            const ago = h?.last_trade_min_ago;
            const fresh = ago != null && ago < 240;
            return <>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: fresh ? 'var(--accent-green)' : 'var(--accent-red)', display: 'inline-block', flexShrink: 0 }}/>
              <span style={{ fontFamily: FM, fontSize: 10, color: 'var(--text-muted)' }}>
                Last trade {ago != null ? (ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`) : '—'}
              </span>
            </>;
          })()}
        </div>
      )}

      {/* ── COINS ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 8 }}>Pair</span>
        {coins.map(c => {
          const on = coin === c;
          const isBot = botCoins.includes(c);
          const hp    = botPos.some(p => sym(p.symbol) === c);
          return (
            <button key={c} onClick={() => setCoin(c)} style={{
              fontFamily: FM, fontSize: 11, padding: '4px 10px',
              background: on ? 'var(--bg-elevated)' : 'transparent',
              border: `1px solid ${on ? 'var(--border-strong)' : 'var(--border-default)'}`,
              color: on ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { if (!on) { e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; } }}
            onMouseLeave={e => { if (!on) { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-default)'; } }}>
              {c}
            </button>
          );
        })}
      </div>

      {/* ── CHART ─────────────────────────────────────────────── */}
      <Chart coin={coin} entryPrice={entryPrice} />

      {/* ── PANEL ─────────────────────────────────────────────── */}
      <Panel botTrades={botTrades} botPositions={botPos} onClose={handleClose}/>
    </div>
  );
}
