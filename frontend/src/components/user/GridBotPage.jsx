import React, { useEffect, useRef, useState, useMemo } from 'react';
import { init, dispose } from 'klinecharts';
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

const CHART_STYLES = {
  grid: {
    horizontal: { show: true, size: 1, color: 'rgba(255,255,255,0.04)', style: 'dashed', dashedValue: [3, 3] },
    vertical:   { show: true, size: 1, color: 'rgba(255,255,255,0.04)', style: 'dashed', dashedValue: [3, 3] },
  },
  candle: {
    type: 'candle_solid',
    bar: {
      upColor: '#00d4aa',   downColor: '#ff4d6d',   noChangeColor: '#888',
      upBorderColor: '#00d4aa', downBorderColor: '#ff4d6d', noChangeBorderColor: '#888',
      upWickColor: '#00d4aa',   downWickColor: '#ff4d6d',   noChangeWickColor: '#888',
    },
    tooltip: { showRule: 'follow_cross', showType: 'standard', labels: ['O', 'H', 'L', 'C', 'Vol'] },
  },
  indicator: {
    ohlc: { upColor: '#00d4aa', downColor: '#ff4d6d', noChangeColor: '#888' },
    bars: [{ upColor: 'rgba(0,212,170,0.5)', downColor: 'rgba(255,77,109,0.5)', noChangeColor: 'rgba(136,136,136,0.5)' }],
  },
  xAxis: {
    axisLine: { show: true, color: 'rgba(255,255,255,0.08)', size: 1 },
    tickLine:  { show: true, color: 'rgba(255,255,255,0.08)', size: 1, length: 3 },
    tickText:  { show: true, color: 'rgba(240,242,245,0.3)',  size: 10, family: 'JetBrains Mono, Courier New, monospace', weight: 'normal' },
  },
  yAxis: {
    axisLine: { show: true, color: 'rgba(255,255,255,0.08)', size: 1 },
    tickLine:  { show: true, color: 'rgba(255,255,255,0.08)', size: 1, length: 3 },
    tickText:  { show: true, color: 'rgba(240,242,245,0.3)',  size: 10, family: 'JetBrains Mono, Courier New, monospace', weight: 'normal' },
  },
  separator: { size: 1, color: 'rgba(255,255,255,0.06)', activeBackgroundColor: 'rgba(255,255,255,0.04)' },
  crosshair: {
    show: true,
    horizontal: {
      line: { show: true, style: 'dashed', dashedValue: [4, 2], size: 1, color: 'rgba(255,255,255,0.2)' },
      text: { show: true, size: 10, family: 'JetBrains Mono, Courier New, monospace', color: '#fff', paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3, borderSize: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 2, backgroundColor: '#1a1a1a' },
    },
    vertical: {
      line: { show: true, style: 'dashed', dashedValue: [4, 2], size: 1, color: 'rgba(255,255,255,0.2)' },
      text: { show: true, size: 10, family: 'JetBrains Mono, Courier New, monospace', color: '#fff', paddingLeft: 4, paddingRight: 4, paddingTop: 3, paddingBottom: 3, borderSize: 1, borderColor: 'rgba(255,255,255,0.15)', borderRadius: 2, backgroundColor: '#1a1a1a' },
    },
  },
  overlay: {
    point: { backgroundColor: '#00d4aa', borderColor: '#00d4aa', activeBackgroundColor: '#fff', activeBorderColor: '#fff' },
    line:  { size: 1, color: '#00d4aa' },
    text:  { color: '#fff', size: 12, family: 'JetBrains Mono, Courier New, monospace', weight: 'normal' },
  },
};

const DRAW_TOOLS = [
  { id: null,                    icon: <CursorIcon />,    title: 'Default cursor' },
  { id: 'segment',               icon: <TrendIcon />,     title: 'Trend line' },
  { id: 'horizontalStraightLine',icon: <HLineIcon />,     title: 'Horizontal line' },
  { id: 'rayLine',               icon: <RayIcon />,       title: 'Ray' },
  { id: 'fibonacciLine',         icon: <FibIcon />,       title: 'Fibonacci' },
];

const INDS_CANDLE = ['MA', 'EMA', 'BOLL'];
const INDS_PANE   = ['VOL', 'MACD', 'RSI'];
const ALL_INDS    = [...INDS_CANDLE, ...INDS_PANE];

function CursorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 2l4 10 2-4 4-2L2 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
    </svg>
  );
}
function TrendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <line x1="2" y1="12" x2="12" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function HLineIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <line x1="1" y1="7" x2="13" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}
function RayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <line x1="2" y1="12" x2="12" y2="2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="2" cy="12" r="1.5" fill="currentColor"/>
    </svg>
  );
}
function FibIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <line x1="1" y1="3"  x2="13" y2="3"  stroke="currentColor" strokeWidth="1" opacity="0.5"/>
      <line x1="1" y1="7"  x2="13" y2="7"  stroke="currentColor" strokeWidth="1.5"/>
      <line x1="1" y1="11" x2="13" y2="11" stroke="currentColor" strokeWidth="1" opacity="0.5"/>
      <line x1="3" y1="3" x2="3" y2="11" stroke="currentColor" strokeWidth="1.2"/>
      <line x1="11" y1="3" x2="11" y2="11" stroke="currentColor" strokeWidth="1.2"/>
    </svg>
  );
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

function AccountRow({ balance, trades }) {
  const realized = useMemo(() => (trades || []).reduce((s, t) => s + parseFloat(t.pnl_usdt || 0), 0), [trades]);
  const connected = balance != null;

  return (
    <div style={{ height: 36, display: 'flex', alignItems: 'stretch', flexShrink: 0, borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-base)', overflowX: 'auto', scrollbarWidth: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', borderRight: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: connected ? 'var(--accent-green)' : 'var(--text-muted)' }} />
        <span style={{ fontFamily: SANS, fontSize: 10, color: connected ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
          {connected ? 'Bybit · Unified' : 'No key connected'}
        </span>
      </div>
      {[
        { label: 'Wallet',     value: fmtUSD(balance?.wallet) },
        { label: 'Available',  value: fmtUSD(balance?.usdt_free) },
        { label: 'Unrealized', value: balance?.unrealized_pnl != null ? `${fmtSign(balance.unrealized_pnl)} USDT` : '—', color: balance?.unrealized_pnl != null ? pclr(balance.unrealized_pnl) : undefined },
        { label: 'Grid PnL',   value: `${fmtSign(realized)} USDT`, color: pclr(realized) },
      ].map((c, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', borderRight: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <span style={{ fontFamily: SANS, fontSize: 10, color: 'var(--text-muted)' }}>{c.label}</span>
          <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 500, color: c.color || 'var(--text-secondary)' }}>{c.value}</span>
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


// ── Chart type configs ────────────────────────────────────────

const CHART_TYPES = [
  { id: 'candle_solid',     label: 'Candles',  title: 'Solid candles (colored)'      },
  { id: 'candle_up_stroke', label: 'B&W',      title: 'Classic B&W (hollow up)'      },
  { id: 'candle_stroke',    label: 'Hollow',   title: 'Hollow candles'               },
  { id: 'area',             label: 'Line',     title: 'Line / Area chart'            },
];

const COL_GREEN = '#00d4aa';
const COL_RED   = '#ff4d6d';
const CHART_TYPE_CFG = {
  candle_solid: {
    bar: { upColor: COL_GREEN, downColor: COL_RED, noChangeColor: '#888', upBorderColor: COL_GREEN, downBorderColor: COL_RED, noChangeBorderColor: '#888', upWickColor: COL_GREEN, downWickColor: COL_RED, noChangeWickColor: '#888' },
    vol: [{ upColor: 'rgba(0,212,170,0.45)', downColor: 'rgba(255,77,109,0.45)', noChangeColor: 'rgba(136,136,136,0.45)' }],
  },
  candle_up_stroke: {
    bar: { upColor: 'transparent', downColor: 'rgba(255,255,255,0.85)', noChangeColor: 'rgba(255,255,255,0.4)', upBorderColor: 'rgba(255,255,255,0.85)', downBorderColor: 'rgba(255,255,255,0.85)', noChangeBorderColor: 'rgba(255,255,255,0.4)', upWickColor: 'rgba(255,255,255,0.55)', downWickColor: 'rgba(255,255,255,0.55)', noChangeWickColor: 'rgba(255,255,255,0.3)' },
    vol: [{ upColor: 'rgba(255,255,255,0.18)', downColor: 'rgba(255,255,255,0.09)', noChangeColor: 'rgba(255,255,255,0.12)' }],
  },
  candle_stroke: {
    bar: { upColor: 'transparent', downColor: 'transparent', noChangeColor: 'transparent', upBorderColor: COL_GREEN, downBorderColor: COL_RED, noChangeBorderColor: '#888', upWickColor: COL_GREEN, downWickColor: COL_RED, noChangeWickColor: '#888' },
    vol: [{ upColor: 'rgba(0,212,170,0.45)', downColor: 'rgba(255,77,109,0.45)', noChangeColor: 'rgba(136,136,136,0.45)' }],
  },
  area: {
    bar: { upColor: COL_GREEN, downColor: COL_RED, noChangeColor: '#888', upBorderColor: COL_GREEN, downBorderColor: COL_RED, noChangeBorderColor: '#888', upWickColor: COL_GREEN, downWickColor: COL_RED, noChangeWickColor: '#888' },
    vol: [{ upColor: 'rgba(0,212,170,0.45)', downColor: 'rgba(255,77,109,0.45)', noChangeColor: 'rgba(136,136,136,0.45)' }],
  },
};


// ── KlineChart ────────────────────────────────────────────────

function KlineChart({ coin, tf }) {
  const elRef      = useRef(null);
  const chartRef   = useRef(null);
  const panesRef   = useRef({});
  const timerRef   = useRef(null);
  const [activeTool,    setActiveTool]    = useState(null);
  const [activeInds,    setActiveInds]    = useState({});
  const [chartType,     setChartType]     = useState('candle_solid');

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    let mounted = true;
    let ro = null;

    const setup = () => {
      if (!mounted) return;
      const { width, height } = el.getBoundingClientRect();
      if (width === 0 || height === 0) { requestAnimationFrame(setup); return; }

      const chart = init(el, { styles: CHART_STYLES, locale: 'en-US' });
      chartRef.current = chart;

      const pp = coin === 'BTC' ? 1 : ['DOGE','ADA','XRP','PEPE','LINK','TON'].includes(coin) ? 4 : 2;
      chart.setSymbol({ shortName: `${coin}USDT`, pricePrecision: pp, volumePrecision: 4 });
      chart.setPeriod({ multiplier: 1, timespan: 'custom', text: tf });
      chart.setDataLoader({
        getBars: async ({ period, timestamp, callback }) => {
          try {
            const parse = list => list.slice().reverse().map(k => ({
              timestamp: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
            }));
            const fetchPage = async end => {
              let url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${coin}USDT&interval=${period.text}&limit=1000`;
              if (end) url += `&end=${end}`;
              const r = await fetch(url);
              const d = await r.json();
              return parse(d.result?.list || []);
            };
            if (!timestamp) {
              // Initial load: fetch 5 pages = up to 5000 candles of history
              let all = [];
              let end = undefined;
              for (let i = 0; i < 5; i++) {
                const page = await fetchPage(end);
                if (!page.length) break;
                all = [...page, ...all];
                end = page[0].timestamp - 1;
                if (page.length < 1000) break;
              }
              callback(all, all.length >= 1000);
            } else {
              // Lazy load on scroll-back
              const page = await fetchPage(timestamp - 1);
              callback(page, page.length >= 1000);
            }
          } catch { callback([], false); }
        },
        subscribeBar: ({ period, callback: cb }) => {
          timerRef.current = setInterval(async () => {
            try {
              const r = await fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${coin}USDT&interval=${period.text}&limit=1`);
              const d = await r.json();
              const k = d?.result?.list?.[0];
              if (k) cb({ timestamp: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5] });
            } catch {}
          }, 5000);
        },
        unsubscribeBar: () => {
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        },
      });

      requestAnimationFrame(() => { try { chart.zoomAtCoordinate?.(-5); } catch {} });

      ro = new ResizeObserver(() => { try { chartRef.current?.resize(); } catch {} });
      ro.observe(el);
    };

    requestAnimationFrame(setup);

    return () => {
      mounted = false;
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      if (ro) ro.disconnect();
      try { dispose(el); } catch {}
      chartRef.current = null;
      panesRef.current = {};
    };
  }, [coin, tf]);

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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>

      {/* Toolbar */}
      <div style={{ height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 2, borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>

        {/* Chart type */}
        {CHART_TYPES.map(ct => (
          <button key={ct.id} title={ct.title} onClick={() => applyChartType(ct.id)} style={{
            height: 22, padding: '0 8px', borderRadius: 3, cursor: 'pointer',
            fontFamily: MONO, fontSize: 11,
            background: chartType === ct.id ? 'var(--bg-elevated)' : 'transparent',
            border: `1px solid ${chartType === ct.id ? 'var(--border-strong)' : 'transparent'}`,
            color: chartType === ct.id ? 'var(--text-primary)' : 'var(--text-muted)',
          }}>{ct.label}</button>
        ))}

        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />

        {/* Indicators */}
        <span style={{ fontFamily: SANS, fontSize: 10, color: 'var(--text-muted)', marginRight: 2 }}>Ind</span>
        {ALL_INDS.map(name => (
          <button key={name} onClick={() => toggleInd(name)} style={{
            height: 22, padding: '0 7px', borderRadius: 3, cursor: 'pointer',
            fontFamily: MONO, fontSize: 10,
            background: activeInds[name] ? 'var(--bg-elevated)' : 'transparent',
            border: `1px solid ${activeInds[name] ? 'var(--border-strong)' : 'transparent'}`,
            color: activeInds[name] ? 'var(--text-primary)' : 'var(--text-muted)',
          }}>{name}</button>
        ))}

        <div style={{ flex: 1 }} />
        {activeTool && (
          <button onClick={() => { setActiveTool(null); try { chartRef.current?.removeOverlay(); } catch {} }} style={{
            height: 22, padding: '0 8px', borderRadius: 3, cursor: 'pointer',
            fontFamily: SANS, fontSize: 10, background: 'transparent',
            border: '1px solid var(--border-subtle)', color: 'var(--text-muted)',
          }}>Clear</button>
        )}
      </div>

      {/* Chart area + order book */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>

        {/* Left drawing toolbar */}
        <div style={{ width: 34, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 6, gap: 2, borderRight: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          {DRAW_TOOLS.map(t => (
            <button key={t.id ?? 'cursor'} title={t.title} onClick={() => selectTool(t.id)} style={{
              width: 26, height: 26, borderRadius: 3, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: activeTool === t.id ? 'var(--bg-elevated)' : 'transparent',
              border: `1px solid ${activeTool === t.id ? 'var(--border-strong)' : 'transparent'}`,
              color: activeTool === t.id ? 'var(--text-primary)' : 'var(--text-muted)',
              padding: 0,
            }}>{t.icon}</button>
          ))}
        </div>

        {/* Chart canvas — absolute-fill wrapper ensures klinecharts gets correct dimensions */}
        <div style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
          <div ref={elRef} style={{ position: 'absolute', inset: 0, background: 'var(--bg-base)' }} />
        </div>

        {/* Order book */}
        <OrderBook coin={coin} />
      </div>
    </div>
  );
}


// ── BottomPanel ────────────────────────────────────────────────

const BP_TABS = ['Positions', 'History', 'PnL'];

function BottomPanel({ coin, trades, positions }) {
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
                <thead><tr><Th ch="Symbol"/><Th ch="Side"/><Th ch="Size"/><Th ch="Entry"/><Th ch="Mark"/><Th ch="Liq"/><Th ch="ROE"/><Th ch="Unrealized PnL" right/></tr></thead>
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
      <AccountRow balance={balance} trades={trades} />
      <KlineChart coin={coin} tf={tf} />
      <BottomPanel coin={coin} trades={trades} positions={positions} />
    </div>
  );
}
