import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { init as klInit, dispose as klDispose } from 'klinecharts';
import { AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { useLiveStream } from '@/lib/useLiveStream';
import { useIsMobile } from '@/lib/useIsMobile';

/* ── design ─────────────────────────────────────────────────────── */
const FF = 'var(--font-sans)';
const FM = 'var(--font-mono)';

/* ── api ─────────────────────────────────────────────────────────── */
const api = p =>
  fetch(p, { headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}` } })
    .then(r => r.ok ? r.json() : Promise.reject(r.status));

/* ── helpers ─────────────────────────────────────────────────────── */
const sym  = s => (s || '').split('/')[0].replace(/USDT$/, '').trim();
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

const BOT_COINS = {
  // signal: excludes _TRADE_BLACKLIST (STX/TRX/ATOM/OP/AAVE/BTC/ETH/SOL/BNB)
  signal:  ['WLD','JUP','ARB','RUNE','XRP','ONDO','PENDLE','LDO','LINK','UNI','INJ','SUI','CRV'],
  fr:        ['INJ','ONDO','PENDLE','WLD','JUP','ARB','UNI','LDO','LINK'],
  grid:      ['BTC','ETH','SOL'],
  orderflow: ['BTC','ETH','SOL'],
  listing:   [],  // dynamic — any new listing
  dex:       [],  // dynamic — DEX volume spikes, any coin
  // cascade_bot.py (BTC/ETH/SOL) + main.py liq_cascade (22 alts)
  cascade: ['BTC','ETH','SOL','XRP','ADA','DOGE','AVAX','DOT','LINK','INJ','SUI','APT','OP','ARB','NEAR','TON','AAVE','UNI','LDO','CRV','RUNE','JUP','PENDLE','ONDO','WLD'],
};

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
  candle_up_stroke: { bar: { upColor: 'transparent', downColor: '#c8c8c8', noChangeColor: 'rgba(200,200,200,0.3)', upBorderColor: '#c8c8c8', downBorderColor: '#c8c8c8', noChangeBorderColor: 'rgba(200,200,200,0.4)', upWickColor: '#888888', downWickColor: '#888888', noChangeWickColor: 'rgba(200,200,200,0.5)' }, vol: [{ upColor: 'rgba(200,200,200,0.12)', downColor: 'rgba(200,200,200,0.3)', noChangeColor: 'rgba(200,200,200,0.2)' }] },
  candle_stroke:    { bar: { upColor: 'transparent', downColor: 'transparent', noChangeColor: 'transparent', upBorderColor: COL_GREEN, downBorderColor: COL_RED, noChangeBorderColor: '#888', upWickColor: COL_GREEN, downWickColor: COL_RED, noChangeWickColor: '#888' }, vol: [{ upColor: 'rgba(0,212,170,0.45)', downColor: 'rgba(255,77,109,0.45)', noChangeColor: 'rgba(136,136,136,0.45)' }] },
  area:             { bar: { upColor: COL_GREEN, downColor: COL_RED, noChangeColor: '#888', upBorderColor: COL_GREEN, downBorderColor: COL_RED, noChangeBorderColor: '#888', upWickColor: COL_GREEN, downWickColor: COL_RED, noChangeWickColor: '#888' }, vol: [{ upColor: 'rgba(0,212,170,0.45)', downColor: 'rgba(255,77,109,0.45)', noChangeColor: 'rgba(136,136,136,0.45)' }] },
};

const INDS_CANDLE = ['MA', 'EMA', 'BOLL'];
const INDS_PANE   = ['VOL', 'MACD', 'RSI'];
const ALL_INDS    = [...INDS_CANDLE, ...INDS_PANE];

const THEME_DARK = {
  bg: 'var(--bg-base)',
  grid: { horizontal: { color: 'rgba(255,255,255,0.04)' }, vertical: { color: 'rgba(255,255,255,0.04)' } },
  xAxis: { axisLine: { color: 'rgba(255,255,255,0.08)' }, tickLine: { color: 'rgba(255,255,255,0.08)' }, tickText: { color: 'rgba(240,242,245,0.3)' } },
  yAxis: { axisLine: { color: 'rgba(255,255,255,0.08)' }, tickLine: { color: 'rgba(255,255,255,0.08)' }, tickText: { color: 'rgba(240,242,245,0.3)' } },
  crosshair: {
    horizontal: { line: { color: 'rgba(255,255,255,0.2)' }, text: { color: '#fff', backgroundColor: '#1a1a1a', borderColor: 'rgba(255,255,255,0.15)' } },
    vertical:   { line: { color: 'rgba(255,255,255,0.2)' }, text: { color: '#fff', backgroundColor: '#1a1a1a', borderColor: 'rgba(255,255,255,0.15)' } },
  },
};
const THEME_BW = {
  bg: '#000000',
  grid: { horizontal: { color: 'rgba(255,255,255,0.04)' }, vertical: { color: 'rgba(255,255,255,0.04)' } },
  xAxis: { axisLine: { color: 'rgba(255,255,255,0.08)' }, tickLine: { color: 'rgba(255,255,255,0.08)' }, tickText: { color: 'rgba(240,242,245,0.3)' } },
  yAxis: { axisLine: { color: 'rgba(255,255,255,0.08)' }, tickLine: { color: 'rgba(255,255,255,0.08)' }, tickText: { color: 'rgba(240,242,245,0.3)' } },
  crosshair: {
    horizontal: { line: { color: 'rgba(255,255,255,0.2)' }, text: { color: '#fff', backgroundColor: '#1a1a1a', borderColor: 'rgba(255,255,255,0.15)' } },
    vertical:   { line: { color: 'rgba(255,255,255,0.2)' }, text: { color: '#fff', backgroundColor: '#1a1a1a', borderColor: 'rgba(255,255,255,0.15)' } },
  },
};

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

/* ══════════════════════════════════════════════════════════════════
   MINI CANDLESTICK SPARKLINE — 24 × 1h candles per coin
══════════════════════════════════════════════════════════════════ */
const _klineCache = {};

function MiniChart({ coin }) {
  const [candles, setCandles] = useState(_klineCache[coin] || []);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(`https://api.bybit.com/v5/market/kline?category=linear&symbol=${coin}USDT&interval=60&limit=24`)
        .then(r => r.json())
        .then(d => {
          if (!alive) return;
          const list = (d?.result?.list || []).slice().reverse().map(k => ({
            o: +k[1], h: +k[2], l: +k[3], c: +k[4],
          }));
          _klineCache[coin] = list;
          setCandles(list);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, [coin]);

  const W = 80, H = 28;
  if (!candles.length) return <div style={{ width: W, height: H }} />;

  const maxH  = Math.max(...candles.map(c => c.h));
  const minL  = Math.min(...candles.map(c => c.l));
  const range = maxH - minL || maxH * 0.001;
  const n  = candles.length;
  const cw = W / n;
  const sy = v => ((maxH - v) / range) * H;

  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      {candles.map((c, i) => {
        const isUp = c.c >= c.o;
        const col  = isUp ? '#00d4aa' : '#ff4d6d';
        const cx   = i * cw + cw / 2;
        const top  = sy(Math.max(c.o, c.c));
        const bh   = Math.max(1, sy(Math.min(c.o, c.c)) - top);
        return (
          <g key={i}>
            <line x1={cx} y1={sy(c.h)} x2={cx} y2={sy(c.l)} stroke={col} strokeWidth={0.8} opacity={0.45}/>
            <rect x={Math.max(0, cx - cw * 0.38)} y={top} width={Math.max(1, cw * 0.76)} height={bh} fill={col} opacity={0.85}/>
          </g>
        );
      })}
    </svg>
  );
}

function CoinTicker({ coins, selected, onSelect }) {
  const [tickers, setTickers] = useState({});

  useEffect(() => {
    if (!coins.length) return;
    const coinSet = new Set(coins);
    const load = () =>
      fetch('https://api.bybit.com/v5/market/tickers?category=linear')
        .then(r => r.json())
        .then(d => {
          const map = {};
          (d?.result?.list || []).forEach(t => {
            if (!t.symbol.endsWith('USDT')) return;
            const c = t.symbol.slice(0, -4);
            if (!coinSet.has(c)) return;
            map[c] = {
              price: parseFloat(t.lastPrice),
              change: parseFloat(t.price24hPcnt) * 100,
              fr: parseFloat(t.fundingRate) * 100,
            };
          });
          setTickers(map);
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [coins.join(',')]);

  if (!coins.length) return null;

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0, maxHeight: 110, overflowY: 'auto', scrollbarWidth: 'none' }}>
      {coins.map(c => {
        const t = tickers[c];
        const on = c === selected;
        const chg = t?.change;
        const fr = t?.fr;
        return (
          <button key={c} onClick={() => onSelect(c)} style={{
            display: 'flex', flexDirection: 'column', gap: 3,
            padding: '8px 10px 6px', cursor: 'pointer',
            background: on ? 'var(--bg-elevated)' : 'transparent',
            border: `1px solid ${on ? 'var(--border-strong)' : 'var(--border-default)'}`,
            textAlign: 'left', minWidth: 100,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>{c}</span>
              {t && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: chg >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{chg >= 0 ? '+' : ''}{chg?.toFixed(2)}%</span>}
            </div>
            <MiniChart coin={c} />
            {t ? <>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-secondary)' }}>${t.price < 1 ? t.price.toFixed(5) : t.price < 10 ? t.price.toFixed(3) : t.price.toFixed(2)}</span>
              {fr != null && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: fr > 0.05 ? 'var(--accent-red)' : fr < 0 ? 'var(--accent-green)' : 'var(--text-muted)' }}>FR {fr >= 0 ? '+' : ''}{fr?.toFixed(3)}%</span>}
            </> : <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-muted)' }}>—</span>}
          </button>
        );
      })}
    </div>
  );
}

function Chart({ coin, entryPrice, stopLoss = 0, takeProfit = 0, onTypeChange, isMobile = false }) {
  const elRef       = useRef(null);
  const chartRef    = useRef(null);
  const panesRef    = useRef({});
  const wsSubRef    = useRef(null);
  const entryOvRef  = useRef(null);
  const slOvRef     = useRef(null);
  const tpOvRef     = useRef(null);
  const coinRef     = useRef(coin);
  const tfRef       = useRef('60');
  const prevCoinRef = useRef(coin);
  const prevTfRef   = useRef('60');

  const [tf,           setTf]           = useState('60');
  const [activeTool,   setActiveTool]   = useState(null);
  const [activeInds,   setActiveInds]   = useState({});
  const [chartType,    setChartType]    = useState('candle_solid');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chartBg,      setChartBg]      = useState('var(--bg-base)');

  coinRef.current = coin;
  tfRef.current   = tf;

  const prec = c => c === 'BTC' ? 1 : ['DOGE','ADA','XRP','PEPE','LINK','TON'].includes(c) ? 4 : 2;

  // Init chart once — never tear down on coin/tf change
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const chart = klInit(el, { styles: CHART_STYLES, locale: 'en-US' });
    chartRef.current = chart;
    panesRef.current = {};
    entryOvRef.current = null;

    chart.setSymbol({ shortName: `${coinRef.current}USDT`, pricePrecision: prec(coinRef.current), volumePrecision: 4 });
    chart.setPeriod({ multiplier: 1, timespan: 'custom', text: tfRef.current });

    chart.setDataLoader({
      getBars: async ({ type, period, timestamp, callback }) => {
        if (type !== 'init' && type !== 'forward') { callback([], false); return; }
        const c = coinRef.current;
        try {
          const parse = list => list.slice().reverse().map(k => ({
            timestamp: +k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
          }));
          const fetchPage = async (end, limit) => {
            let url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${c}USDT&interval=${period.text}&limit=${limit}`;
            if (end) url += `&end=${end}`;
            return parse((await (await fetch(url)).json()).result?.list || []);
          };
          if (type === 'init') {
            const page = await fetchPage(undefined, 200);
            callback(page, { backward: false, forward: page.length >= 200 });
          } else {
            const page = await fetchPage(timestamp - 1, 1000);
            callback(page, { backward: false, forward: page.length >= 1000 });
          }
        } catch { callback([], false); }
      },
      subscribeBar: ({ period, callback: cb }) => {
        const sym = coinRef.current;
        const topic = `kline.${period.text}.${sym}USDT`;
        let closed = false;
        const tryConnect = () => {
          if (closed) return;
          const ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');
          ws.onopen = () => {
            if (closed) { ws.close(); return; }
            ws.send(JSON.stringify({ op: 'subscribe', args: [topic] }));
          };
          ws.onmessage = e => {
            if (closed) return;
            try {
              const m = JSON.parse(e.data);
              if (m.topic === topic && Array.isArray(m.data) && m.data[0]) {
                const k = m.data[0];
                cb({ timestamp: +k.start, open: +k.open, high: +k.high, low: +k.low, close: +k.close, volume: +k.volume });
              }
            } catch {}
          };
          ws.onclose = () => { if (!closed) setTimeout(tryConnect, 3000); };
          ws.onerror = () => {};
          wsSubRef.current = { close: () => { closed = true; ws.close(); } };
        };
        tryConnect();
      },
      unsubscribeBar: () => { wsSubRef.current?.close(); wsSubRef.current = null; },
    });

    let resizeRaf = null;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => { try { chart.resize(); } catch {} });
    });
    ro.observe(el);

    return () => {
      wsSubRef.current?.close();
      wsSubRef.current = null;
      cancelAnimationFrame(resizeRaf);
      ro.disconnect();
      try { klDispose(el); } catch {}
      chartRef.current = null;
      panesRef.current = {};
      entryOvRef.current = null;
    };
  }, []);

  // Coin or TF changed — update in-place, reload data without teardown
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    let changed = false;
    if (coin !== prevCoinRef.current) {
      chart.setSymbol({ shortName: `${coin}USDT`, pricePrecision: prec(coin), volumePrecision: 4 });
      prevCoinRef.current = coin;
      changed = true;
    }
    if (tf !== prevTfRef.current) {
      chart.setPeriod({ multiplier: 1, timespan: 'custom', text: tf });
      prevTfRef.current = tf;
      changed = true;
    }
    // setSymbol/setPeriod already call resetData internally — no extra call needed
  }, [coin, tf]);

  // Entry / SL / TP lines on chart
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    try {
      if (entryOvRef.current) { chart.removeOverlay?.(entryOvRef.current); entryOvRef.current = null; }
      if (slOvRef.current)    { chart.removeOverlay?.(slOvRef.current);    slOvRef.current    = null; }
      if (tpOvRef.current)    { chart.removeOverlay?.(tpOvRef.current);    tpOvRef.current    = null; }
      if (entryPrice > 0) {
        entryOvRef.current = chart.createOverlay?.({ name: 'horizontalStraightLine', points: [{ value: entryPrice }], styles: { line: { style: 'dashed', dashedValue: [4, 4], size: 1, color: 'rgba(251,191,36,0.9)' } }, extendData: `Entry $${entryPrice}`, lock: true }) ?? null;
      }
      if (stopLoss > 0) {
        slOvRef.current = chart.createOverlay?.({ name: 'horizontalStraightLine', points: [{ value: stopLoss }], styles: { line: { style: 'dashed', dashedValue: [2, 4], size: 1, color: 'rgba(255,77,109,0.9)' } }, extendData: `SL $${stopLoss}`, lock: true }) ?? null;
      }
      if (takeProfit > 0) {
        tpOvRef.current = chart.createOverlay?.({ name: 'horizontalStraightLine', points: [{ value: takeProfit }], styles: { line: { style: 'dashed', dashedValue: [2, 4], size: 1, color: 'rgba(0,212,170,0.9)' } }, extendData: `TP $${takeProfit}`, lock: true }) ?? null;
      }
    } catch {}
  }, [entryPrice, stopLoss, takeProfit]);

  // ESC exits fullscreen
  React.useEffect(() => {
    const h = e => { if (e.key === 'Escape') setIsFullscreen(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Resize chart after fullscreen toggle
  React.useEffect(() => {
    const t = setTimeout(() => { try { chartRef.current?.resize(); } catch {} }, 60);
    return () => clearTimeout(t);
  }, [isFullscreen]);

  function applyChartType(typeId) {
    setChartType(typeId);
    onTypeChange?.(typeId);
    const cfg   = CHART_TYPE_CFG[typeId] || CHART_TYPE_CFG.candle_solid;
    const theme = typeId === 'candle_up_stroke' ? THEME_BW : THEME_DARK;
    setChartBg(theme.bg);
    try {
      chartRef.current?.setStyles({
        candle:    { type: typeId, bar: cfg.bar },
        indicator: { bars: cfg.vol },
        grid:      theme.grid,
        xAxis:     theme.xAxis,
        yAxis:     theme.yAxis,
        crosshair: theme.crosshair,
      });
    } catch {}
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
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 260px)', minHeight: 480, border: '1px solid var(--border-subtle)', background: chartBg, overflow: 'hidden', ...(isFullscreen ? { position: 'fixed', inset: 0, zIndex: 9999, border: 'none', height: '100vh', minHeight: '100vh' } : {}) }}>

      {/* Top toolbar: chart type + indicators + TF */}
      <div style={{ height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 2, borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', overflowX: 'auto', scrollbarWidth: 'none' }}>
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
        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />
        <button
          onClick={() => setIsFullscreen(v => !v)}
          title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
          style={{ height: 22, width: 22, borderRadius: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isFullscreen ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${isFullscreen ? 'var(--border-strong)' : 'transparent'}`, color: isFullscreen ? 'var(--text-primary)' : 'var(--text-muted)', padding: 0, flexShrink: 0 }}
          onMouseEnter={e => { if (!isFullscreen) e.currentTarget.style.color = 'var(--text-primary)'; }}
          onMouseLeave={e => { if (!isFullscreen) e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          {isFullscreen
            ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 1H1v3M8 1h3v3M4 11H1V8M8 11h3V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 4V1h3M8 1h3v3M1 8v3h3M8 11h3V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          }
        </button>
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
          <div ref={elRef} style={{ position: 'absolute', inset: 0, background: chartBg }} />
        </div>
        {/* Order book */}
        {!isMobile && <OrderBook coin={coin} />}
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
    let raf = null;
    const ro = new ResizeObserver(entries => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setW(entries[0].contentRect.width));
    });
    ro.observe(wrapRef.current);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);

  const isPos = data[data.length - 1]?.v >= 0;
  const h = 320;

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
function Panel({ botTrades, botPositions, openOrders = [], onClose = () => {}, onCancelOrder = () => {}, filterCoin, balance }) {
  const [tab, setTab] = useState('open');
  const [fundingRates, setFundingRates] = useState({});
  const closed = useMemo(() => botTrades.filter(t => !!t.closed_at).sort((a, b) => new Date(b.closed_at) - new Date(a.closed_at)), [botTrades]);

  const filteredOrders = useMemo(() =>
    filterCoin ? openOrders.filter(o => o.symbol === filterCoin) : openOrders,
  [openOrders, filterCoin]);
  const filteredPos = useMemo(() =>
    filterCoin ? botPositions.filter(p => sym(p.symbol) === filterCoin) : botPositions,
  [botPositions, filterCoin]);
  const filteredClosed = useMemo(() =>
    filterCoin ? closed.filter(t => sym(t.symbol) === filterCoin) : closed,
  [closed, filterCoin]);

  const pnlTotal = useMemo(() => filteredClosed.reduce((s, t) => s + pnl(t), 0), [filteredClosed]);
  const pnlWins  = useMemo(() => filteredClosed.filter(t => pnl(t) > 0), [filteredClosed]);
  const pnlLoss  = useMemo(() => filteredClosed.filter(t => pnl(t) < 0), [filteredClosed]);
  const pnlWr    = filteredClosed.length ? Math.round(pnlWins.length / filteredClosed.length * 100) : 0;

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
    { id: 'open',      label: 'Open Orders',   n: filteredOrders.length },
    { id: 'positions', label: 'Positions',     n: filteredPos.length },
    { id: 'history',   label: 'Trade History', n: null },
    { id: 'pnl',       label: 'P&L',           n: null },
    { id: 'equity',    label: 'Equity Curve',  n: null },
    { id: 'assets',    label: 'Assets',        n: null },
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
      <div style={{ maxHeight: tab === 'equity' ? 'none' : 260, overflowY: tab === 'equity' ? 'visible' : 'auto', overflowX: tab === 'equity' ? 'visible' : 'auto' }}>
        {tab === 'open' && (filteredOrders.length === 0 ? <Empty /> :
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th v="Time"/><Th v="Symbol"/><Th v="Side"/><Th v="Type"/><Th v="Qty"/><Th v="Price" r/><Th v="Filled" r/><Th v="Status"/><Th v="Reduce"/><Th v=""/></tr></thead>
            <tbody>{filteredOrders.map((o, i) => (
              <tr key={i} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Td v={dstr(o.created_at ? +o.created_at : null)}/>
                <Td v={o.symbol} hi="var(--text-primary)"/>
                <Td v={o.side} hi={o.side === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)'}/>
                <Td v={o.order_type}/>
                <Td v={fix(o.qty, 3)}/>
                <Td v={fix(o.price, 4)} r/>
                <Td v={fix(o.filled_qty, 3)} r/>
                <Td v={o.status}/>
                <Td v={o.reduce_only ? 'Yes' : '—'}/>
                <td style={{ padding: '4px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <button
                    onClick={() => onCancelOrder(o.order_id, o.symbol)}
                    style={{ fontFamily: FM, fontSize: 10, padding: '3px 8px', background: 'transparent', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,77,109,0.15)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    Cancel
                  </button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}

        {tab === 'positions' && (filteredPos.length === 0 ? <Empty /> :
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th v="Symbol"/><Th v="Side"/><Th v="Lev"/><Th v="Size"/><Th v="Entry"/><Th v="Mark"/><Th v="SL"/><Th v="TP"/><Th v="FR 8h"/><Th v="PnL%" r/><Th v="Unrealized" r/><Th v=""/></tr></thead>
            <tbody>{filteredPos.map((p, i) => {
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

        {tab === 'pnl' && (filteredClosed.length === 0 ? <Empty /> :
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: 0 }}>
            {[
              ['Total PnL', `${sign(pnlTotal)} USDT`,                              pos(pnlTotal)],
              ['Win Rate',  `${pnlWr}%`,                                            pnlWr >= 50],
              ['Trades',    String(filteredClosed.length),                          true],
              ['W / L',     `${pnlWins.length} / ${pnlLoss.length}`,               true],
            ].map(([l, v, good]) => (
              <div key={l} style={{ padding: '20px 18px', borderRight: '1px solid var(--border-subtle)' }}>
                <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>{l}</div>
                <div style={{ fontFamily: FM, fontSize: 22, fontWeight: 600, color: good ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{v}</div>
              </div>
            ))}
          </div>
        )}

        {tab === 'equity' && (() => {
          const sorted = [...closed]
            .filter(t => t.pnl_usdt != null)
            .sort((a, b) => new Date(a.closed_at) - new Date(b.closed_at));
          let cum = 0;
          const data = sorted.map(t => {
            cum += parseFloat(t.pnl_usdt ?? t.pnl ?? 0);
            return { t: dstr(t.closed_at), v: parseFloat(cum.toFixed(2)) };
          });
          if (data.length === 0) return <Empty />;
          return <EquityCurve data={data} />;
        })()}

        {tab === 'assets' && (
          balance ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 0 }}>
              {[
                ['Wallet Balance', `$${(+(balance.usdt_wallet ?? balance.wallet ?? 0)).toFixed(2)}`, true],
                ['Equity',         `$${(+(balance.usdt_equity ?? balance.equity ?? 0)).toFixed(2)}`, true],
                ['Unrealized PnL', `${sign(balance.unrealized_pnl)} USDT`, pos(balance.unrealized_pnl)],
                ['Available',      `$${(+(balance.usdt_free ?? 0)).toFixed(2)}`, true],
              ].map(([l, v, good]) => (
                <div key={l} style={{ padding: '20px 18px', borderRight: '1px solid var(--border-subtle)' }}>
                  <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>{l}</div>
                  <div style={{ fontFamily: FM, fontSize: 20, fontWeight: 600, color: good ? 'var(--text-primary)' : 'var(--accent-red)' }}>{v}</div>
                </div>
              ))}
            </div>
          ) : <Empty />
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   MAIN
══════════════════════════════════════════════════════════════════ */
// Maps botId → one or more source values stored in user_trades.source
// cascade_bot.py saves 'cascade', main.py liq pipeline saves 'liq_cascade'
const BOT_SOURCES = {
  signal:    ['news', 'dex'],
  cascade:   ['liq_cascade', 'cascade'],
  fr:        ['fr'],
  grid:      ['grid'],
  altcoin:   ['altcoin'],
  orderflow: ['orderflow'],
  listing:   ['listing'],
  dex:       ['dex'],
  history:   ['bybit'],
};

const ALL_BOTS_CONFIG = [
  { id: 'signal',    label: 'Signal',    source: BOT_SOURCES.signal[0] },
  { id: 'cascade',   label: 'Cascade',   source: BOT_SOURCES.cascade[0] },
  { id: 'fr',        label: 'Funding',   source: BOT_SOURCES.fr[0] },
  { id: 'grid',      label: 'Grid',      source: BOT_SOURCES.grid[0] },
  { id: 'altcoin',   label: 'Alt',       source: BOT_SOURCES.altcoin[0] },
  { id: 'orderflow', label: 'Orderflow', source: BOT_SOURCES.orderflow[0] },
  { id: 'listing',   label: 'Listing',   source: BOT_SOURCES.listing[0] },
  { id: 'dex',       label: 'DEX',       source: BOT_SOURCES.dex[0] },
];

export default function OverviewTab({ botId = 'signal' }) {
  const dbSources = BOT_SOURCES[botId] ?? [botId];
  const dbSource  = dbSources[0]; // primary key for heartbeat + labels
  const isMobile  = useIsMobile();

  // ── Real-time WebSocket feed ──────────────────────────────────────────────
  const { positions, balance, openOrders, trades, connected } = useLiveStream();

  const [coin,      setCoin]      = useState('BTC');
  const [isBW,      setIsBW]      = useState(false);
  const [heartbeat, setHeartbeat] = useState({});
  const [period,    setPeriod]    = useState('30d');
  const autoSelectDoneRef = useRef(false);
  const prevPosCoinSetRef = useRef(null);

  // heartbeat is low-frequency metadata — keep as a 30s REST poll
  useEffect(() => {
    const go = () => api('/api/users/bot-heartbeat').then(setHeartbeat).catch(() => {});
    go();
    const id = setInterval(go, 30000);
    return () => clearInterval(id);
  }, []);

  // close-position REST call — triggers a manual WS refresh via reconnect
  const refresh = useCallback(() => {}, []);

  const totalUnreal = useMemo(
    () => positions.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0),
    [positions],
  );
  const botTrades    = useMemo(() => trades.filter(t => dbSources.includes(t.source || '')), [trades, dbSources.join(',')]);

  const botCoins = useMemo(() => {
    const seen = new Set();
    const result = [];
    for (const t of botTrades) {
      const c = sym(t.symbol);
      if (c && !seen.has(c)) { seen.add(c); result.push(c); }
    }
    return result.slice(0, 30); // most-recently-traded first, max 30
  }, [botTrades]);

  // show only bot-traded coins; fall back to static watchlist, then popular list
  const staticCoins = BOT_COINS[botId] ?? [];

  // Match Bybit positions to this bot's OPEN user_trades (most accurate ownership signal).
  // Fallback to staticCoins watchlist when no open trades recorded yet.
  // Empty result for dynamic bots (listing/dex) with no open trades → no false positives.
  const botPos = useMemo(() => {
    const openCoins = new Set(
      botTrades.filter(t => !t.closed_at && t.status !== 'failed').map(t => sym(t.symbol)).filter(Boolean)
    );
    if (openCoins.size > 0) return positions.filter(p => openCoins.has(sym(p.symbol)));
    // Static fallback only for bots that hold positions without explicit open-trade records.
    // grid/fr are always-on — they hold perpetual positions even when all DB trades are closed.
    // All other bots (cascade, orderflow, listing, dex, signal): no open trades = no positions.
    if ((botId === 'grid' || botId === 'fr') && staticCoins.length > 0) {
      const s = new Set(staticCoins);
      return positions.filter(p => s.has(sym(p.symbol)));
    }
    return [];
  }, [positions, botTrades, staticCoins.join(','), botId]);
  const botUnreal = useMemo(() => botPos.reduce((s, p) => s + (p.unrealized_pnl ?? 0), 0), [botPos]);
  const coins = useMemo(() => {
    // grid always shows all configured pairs regardless of trade history
    if (botId === 'grid') return [...new Set([...staticCoins, ...botCoins])];
    if (botCoins.length > 0) return botCoins;
    // dynamic bots (listing/dex): no static coins, no POP_COINS fallback — wait for real signals
    if (botId === 'listing' || botId === 'dex') return [];
    return staticCoins.length > 0 ? staticCoins : POP_COINS;
  }, [botCoins, staticCoins.join(','), botId]);
  // grid: always show full configured set.
  // Bots with actual trades: show traded coins.
  // Bots with no trades: show static watchlist (market monitoring only — no PnL in CoinTicker).
  // listing/dex have empty staticCoins so they return [] naturally.
  const analyzerCoins = useMemo(() => {
    if (botId === 'grid') return [...new Set([...staticCoins, ...botCoins])];
    if (botCoins.length > 0) return botCoins;
    return staticCoins;
  }, [botCoins, staticCoins.join(','), botId]);

  // reset auto-select flag when user switches bot tab
  useEffect(() => { autoSelectDoneRef.current = false; }, [botId]);
  // auto-select first available coin once per tab load
  // Prefer botCoins (actual trades) but DON'T lock if we only have staticCoins fallback —
  // wait for WS trades to arrive so botCoins takes priority over the static watchlist.
  useEffect(() => {
    if (autoSelectDoneRef.current) return;
    if (botCoins.length > 0) {
      setCoin(botCoins[0]);
      autoSelectDoneRef.current = true;
    } else if (staticCoins.length > 0) {
      setCoin(staticCoins[0]);
      // Don't lock yet — botCoins may still arrive from WS
    }
  }, [botCoins, staticCoins.join(',')]);

  // auto-switch chart to coin when a new position opens for this bot
  useEffect(() => {
    const currentCoins = botPos.map(p => sym(p.symbol)).filter(Boolean);
    if (prevPosCoinSetRef.current === null) {
      prevPosCoinSetRef.current = new Set(currentCoins);
      return;
    }
    for (const c of currentCoins) {
      if (!prevPosCoinSetRef.current.has(c)) {
        setCoin(c);
        break;
      }
    }
    prevPosCoinSetRef.current = new Set(currentCoins);
  }, [botPos]);

  const periodTrades = useMemo(() => {
    if (period === 'all') return botTrades;
    const now = Date.now();
    const cutoff = period === '1d'  ? now - 86_400_000
                 : period === '7d'  ? now - 7 * 86_400_000
                 : /* 30d */          now - 30 * 86_400_000;
    return botTrades.filter(t => {
      const d = t.closed_at || t.opened_at;
      return d && new Date(d).getTime() >= cutoff;
    });
  }, [botTrades, period]);

  const stats = useMemo(() => {
    const cl    = periodTrades.filter(t => t.closed_at);
    const total = cl.reduce((s, t) => s + pnl(t), 0);
    const wins  = cl.filter(t => pnl(t) > 0).length;
    return { total, wins, n: cl.length, wr: cl.length ? Math.round(wins / cl.length * 100) : 0 };
  }, [periodTrades]);

  // Search ALL Bybit positions for the selected coin (not just this bot's subset)
  // so entry/SL/TP lines always appear when a position exists, matching Bybit UX
  const activePos  = positions.find(p => sym(p.symbol) === coin);
  const entryPrice = activePos?.entry_price ?? 0;
  const stopLoss   = activePos?.stop_loss   ?? 0;
  const takeProfit = activePos?.take_profit ?? 0;

  const handleClose = useCallback(async (symbol) => {
    if (!confirm(`Close ${symbol} position?`)) return;
    try {
      const r = await fetch('/api/users/close-position', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('kado_token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || r.status); }
      // WS update arrives automatically within 2s — no manual poll needed
    } catch (e) {
      alert(`Failed to close ${symbol}: ${e.message}`);
    }
  }, []);

  const handleCancelOrder = useCallback(async (orderId, symbol) => {
    if (!confirm(`Cancel ${symbol} order?`)) return;
    try {
      const r = await fetch('/api/users/cancel-order', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('kado_token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, symbol }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || r.status); }
      // WS update arrives automatically within 2s
    } catch (e) {
      alert(`Failed to cancel order: ${e.message}`);
    }
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, ...(isBW ? { filter: 'grayscale(1)' } : {}) }}>

      {/* ── PERIOD FILTER ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 4 }}>Period</span>
        {[['1d','Today'],['7d','7D'],['30d','30D'],['all','All']].map(([v,label]) => {
          const on = period === v;
          return (
            <button key={v} onClick={() => setPeriod(v)} style={{
              fontFamily: FM, fontSize: 10, padding: '3px 9px',
              background: on ? 'var(--bg-elevated)' : 'transparent',
              border: `1px solid ${on ? 'var(--accent-green)' : 'var(--border-default)'}`,
              color: on ? 'var(--accent-green)' : 'var(--text-muted)',
              cursor: 'pointer', letterSpacing: '0.05em',
            }}>
              {label}
            </button>
          );
        })}
      </div>

      {/* ── STATS ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 0, border: '1px solid var(--border-subtle)', flexShrink: 0 }}>
        {[
          { label: 'Balance',    value: balance ? `$${(+(balance.usdt_wallet ?? balance.wallet ?? 0)).toFixed(2)}` : '—', sub: (balance?.usdt_equity ?? balance?.equity) ? `equity $${(+(balance.usdt_equity ?? balance.equity ?? 0)).toFixed(2)}` : null, good: null },
          { label: 'Unrealized', value: botPos.length > 0 ? `${sign(botUnreal)} USDT` : '—', sub: botPos.length ? `${botPos.length} open position${botPos.length !== 1 ? 's' : ''}` : 'no open positions', good: botPos.length ? pos(botUnreal) : null },
          { label: 'Realized',   value: stats.n > 0 ? `${sign(stats.total)} USDT` : '—', sub: stats.n > 0 ? `${stats.n} closed trades` : 'no trades yet', good: stats.n > 0 ? pos(stats.total) : null },
          { label: 'Win Rate',   value: stats.n > 0 ? `${stats.wr}%` : '—', sub: stats.n > 0 ? `${stats.wins}W / ${stats.n - stats.wins}L` : '—', good: stats.n > 0 ? stats.wr >= 50 : null },
        ].map((s, i) => {
          const cols = isMobile ? 2 : 4;
          const last = i === 3;
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

      {/* ── BOT STATUS ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0, alignItems: 'center' }}>
        <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 2 }}>Bots</span>
        {ALL_BOTS_CONFIG.map(b => {
          const h = heartbeat[b.source];
          const ago = h?.last_trade_min_ago;
          const active = ago != null && ago < 240;
          const current = b.id === botId;
          return (
            <div key={b.id} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 8px',
              border: `1px solid ${current ? 'var(--border-strong)' : 'var(--border-subtle)'}`,
              borderRadius: 3,
              background: current ? 'var(--bg-elevated)' : 'transparent',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
                background: h == null ? 'var(--text-muted)' : active ? 'var(--accent-green)' : 'var(--accent-red)',
                boxShadow: active ? '0 0 5px var(--accent-green)' : 'none',
              }}/>
              <span style={{ fontFamily: FM, fontSize: 10, color: current ? 'var(--text-primary)' : active ? 'var(--text-secondary)' : 'var(--text-muted)', letterSpacing: '0.04em' }}>
                {b.label}
              </span>
              {ago != null && (
                <span style={{ fontFamily: FM, fontSize: 9, color: 'var(--text-muted)' }}>
                  {ago < 60 ? `${ago}m` : `${Math.round(ago / 60)}h`}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── STATUS BAR: live feed indicator + heartbeat ───────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        {/* WebSocket connection status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
            background: connected ? 'var(--accent-green)' : 'var(--accent-red)',
            boxShadow: connected ? '0 0 6px var(--accent-green)' : 'none',
          }}/>
          <span style={{ fontFamily: FM, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            {connected ? 'LIVE' : 'RECONNECTING…'}
          </span>
        </div>
        {/* Bot heartbeat */}
        {heartbeat[dbSource] != null && (() => {
          const h = heartbeat[dbSource];
          const ago = h?.last_trade_min_ago;
          const fresh = ago != null && ago < 240;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: fresh ? 'var(--accent-green)' : 'var(--text-muted)', display: 'inline-block', flexShrink: 0 }}/>
              <span style={{ fontFamily: FM, fontSize: 10, color: 'var(--text-muted)' }}>
                Last trade {ago != null ? (ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`) : '—'}
              </span>
            </div>
          );
        })()}
      </div>

      {/* ── COINS ─────────────────────────────────────────────── */}
      <CoinTicker coins={analyzerCoins} selected={coin} onSelect={setCoin} />

      {analyzerCoins.length === 0 && (
        coins.length === 0 ? (
          <div style={{ padding: '8px 0', fontFamily: FM, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
            ⏳ Waiting for first signal…
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 8 }}>Pair</span>
            {coins.map(c => {
              const on = coin === c;
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
        )
      )}

      {/* ── CHART ─────────────────────────────────────────────── */}
      <Chart coin={coin} entryPrice={entryPrice} stopLoss={stopLoss} takeProfit={takeProfit} onTypeChange={id => setIsBW(id === 'candle_up_stroke')} isMobile={isMobile} />

      {/* ── PANEL ─────────────────────────────────────────────── */}
      <Panel botTrades={periodTrades} botPositions={botPos} openOrders={openOrders} onClose={handleClose} onCancelOrder={handleCancelOrder} filterCoin={coin} balance={balance}/>
    </div>
  );
}
