import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts';
import { useLiveStream } from '@/lib/useLiveStream';
import { useIsMobile } from '@/lib/useIsMobile';
import { useTheme } from '@/lib/ThemeContext';
import { useLang } from '@/lib/LangContext';

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

    let alive = true;
    let pingId = null;
    let wsInst = null;
    const connect = () => {
      if (!alive) return;
      const ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');
      wsInst = ws;
      const topic = `publicTrade.${coin}USDT`;
      ws.onopen = () => {
        if (!alive) { ws.close(); return; }
        ws.send(JSON.stringify({ op: 'subscribe', args: [topic] }));
        pingId = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send('{"op":"ping"}');
        }, 18000);
      };
      ws.onmessage = e => {
        if (!alive) return;
        try {
          const m = JSON.parse(e.data);
          if (m.topic === topic && Array.isArray(m.data)) {
            buf.current = [...m.data.map(t => ({ id: t.i, p: t.p, q: t.v, buy: t.S === 'Buy' })), ...buf.current].slice(0, 80);
            setRows([...buf.current]);
          }
        } catch {}
      };
      ws.onclose = () => { if (pingId) clearInterval(pingId); if (alive) setTimeout(connect, 3000); };
      ws.onerror = () => {};
    };
    connect();
    return () => { alive = false; if (pingId) clearInterval(pingId); wsInst?.close(); };
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
  signal:     ['WLD','JUP','ARB','RUNE','XRP','ONDO','PENDLE','LDO','LINK','UNI','INJ','SUI','CRV'],
  sweep:      ['ETH','SOL'],
  fr:         ['INJ','ONDO','PENDLE','WLD','JUP','ARB','UNI','LDO','LINK','BTC','ETH','SOL'],
  grid:       ['BTC','ETH','SOL'],
  orderflow:  ['BTC','ETH','SOL'],
  ob:         ['BTC'],
  macro:      ['EUR','GBP','XAU'],
  listing:    [],  // dynamic — any new listing
  dex:        [],  // dynamic — DEX volume spikes, any coin
  // cascade_bot.py (ETH/SOL/DOGE/LINK) + liq pipeline
  cascade: ['ETH','SOL','DOGE','LINK','BTC','XRP','ADA','AVAX','DOT','INJ','SUI','APT','OP','ARB','NEAR','TON','AAVE','UNI','LDO','CRV','RUNE','JUP','PENDLE','ONDO','WLD'],
};

const C_UP = '#0ecb81';
const C_DN = '#f6465d';
const TF_LABELS = { '1':'1m','5':'5m','15':'15m','60':'1h','240':'4h','D':'1D' };

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
  const macdArr = Array(n).fill(null);
  const sigArr  = Array(n).fill(null);
  const histArr = Array(n).fill(null);
  if (n < slow + sig) return { macdArr, sigArr, histArr };
  const kf = 2 / (fast + 1), ks = 2 / (slow + 1), kk = 2 / (sig + 1);
  const cls = bars.map(b => b.close);
  let fe = cls.slice(0, fast).reduce((a, b) => a + b, 0) / fast;
  for (let i = fast; i < slow; i++) fe = cls[i] * kf + fe * (1 - kf);
  let se = cls.slice(0, slow).reduce((a, b) => a + b, 0) / slow;
  macdArr[slow - 1] = fe - se;
  for (let i = slow; i < n; i++) {
    fe = cls[i] * kf + fe * (1 - kf);
    se = cls[i] * ks + se * (1 - ks);
    macdArr[i] = fe - se;
  }
  const fi = slow - 1;
  let sg = macdArr.slice(fi, fi + sig).reduce((a, b) => a + b, 0) / sig;
  const si = fi + sig - 1;
  sigArr[si] = sg; histArr[si] = macdArr[si] - sg;
  for (let i = si + 1; i < n; i++) {
    sg = macdArr[i] * kk + sg * (1 - kk);
    sigArr[i] = sg; histArr[i] = macdArr[i] - sg;
  }
  return { macdArr, sigArr, histArr };
}

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
        <span style={{ fontFamily: FM, fontSize: 10, color: 'var(--text-muted)', zIndex: 1 }}>{(+size).toFixed(3)}</span>
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
        const col  = isUp ? '#0ecb81' : '#f6465d';
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

function CoinTicker({ coins, selected, onSelect, coinPnl = {} }) {
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
        const cp = coinPnl[c];
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
            {cp != null && (
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 600, color: cp >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {cp >= 0 ? '+' : ''}{cp.toFixed(2)} USDT
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   KLINECHART — full candlestick chart with order book, indicators
══════════════════════════════════════════════════════════════════ */
function Chart({ coin, entryPrice, stopLoss = 0, takeProfit = 0, isMobile = false, trades = [] }) {
  const { theme } = useTheme();
  const { t } = useLang();
  const dark = theme !== 'light';

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
  const tfRef      = useRef('60');
  const showLRef   = useRef(false);
  const plRef      = useRef({ entry: null, sl: null, tp: null });
  const tradesRef  = useRef([]);
  tradesRef.current = trades;

  const [tf,         setTf]         = useState(() => localStorage.getItem('kado_chart_tf') || '60');
  const [showLine,   setShowLine]   = useState(false);
  const [activeInds, setActiveInds] = useState({});
  const [isFS,       setIsFS]       = useState(false);

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

  function dedup(bars) {
    const seen = new Set();
    return bars.filter(b => { if (seen.has(b.time)) return false; seen.add(b.time); return true; });
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
    if (refs.RSI?.[0]) {
      const v = calcRSI(bars);
      refs.RSI[0].setData(bars.map((b, i) => ({ time: b.time, value: v[i] })).filter(d => d.value != null));
    }
    if (refs.MACD?.[0]) {
      const { macdArr, sigArr, histArr } = calcMACD(bars);
      refs.MACD[0].setData(bars.map((b, i) => ({ time: b.time, value: macdArr[i] })).filter(d => d.value != null));
      refs.MACD[1].setData(bars.map((b, i) => ({ time: b.time, value: sigArr[i]  })).filter(d => d.value != null));
      refs.MACD[2].setData(bars.map((b, i) => ({
        time: b.time, value: histArr[i],
        color: (histArr[i] ?? 0) >= 0 ? 'rgba(14,203,129,0.6)' : 'rgba(246,70,93,0.6)',
      })).filter(d => d.value != null));
    }
  }

  function applyMarkers(bars) {
    const cs = candleRef.current;
    if (!cs) return;
    const trs = tradesRef.current;
    if (!bars.length || !trs.length) { try { cs.setMarkers([]); } catch {} return; }
    const firstT = bars[0].time;
    const lastT  = bars[bars.length - 1].time;
    const markers = [];
    for (const tr of trs) {
      if (tr.opened_at) {
        const ts = Math.trunc(new Date(tr.opened_at).getTime() / 1000);
        if (ts >= firstT && ts <= lastT) {
          markers.push({
            time: ts,
            position: tr.side === 'LONG' ? 'belowBar' : 'aboveBar',
            color: tr.side === 'LONG' ? '#0ecb81' : '#f6465d',
            shape: tr.side === 'LONG' ? 'arrowUp' : 'arrowDown',
            text: '', size: 1,
          });
        }
      }
      if (tr.closed_at) {
        const ts = Math.trunc(new Date(tr.closed_at).getTime() / 1000);
        const p  = parseFloat(tr.pnl ?? 0);
        if (ts >= firstT && ts <= lastT) {
          markers.push({
            time: ts,
            position: tr.side === 'LONG' ? 'aboveBar' : 'belowBar',
            color: p >= 0 ? '#0ecb81' : '#f6465d',
            shape: 'circle',
            text: `${p >= 0 ? '+' : ''}${p.toFixed(1)}`,
            size: 1,
          });
        }
      }
    }
    markers.sort((a, b) => a.time - b.time);
    try { cs.setMarkers(markers); } catch {}
  }

  function applyData(bars) {
    if (!bars.length || !candleRef.current) return;
    const sorted = [...bars].sort((a, b) => a.time - b.time);
    barsRef.current = sorted;
    const candle = sorted.map(b => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }));
    const vol    = sorted.map(b => ({ time: b.time, value: b.value, color: b.close >= b.open ? 'rgba(0,212,170,0.4)' : 'rgba(255,77,109,0.4)' }));
    try {
      if (showLRef.current && areaRef.current) {
        areaRef.current.setData(sorted.map(b => ({ time: b.time, value: b.close })));
      } else {
        candleRef.current.applyOptions({ visible: true });
        candleRef.current.setData(candle);
      }
      volRef.current?.setData(vol);
      refreshInds(sorted);
      applyMarkers(sorted);
    } catch {}
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

  // Create chart on mount
  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const isDark = theme !== 'light';
    const tClr = isDark ? 'rgba(240,242,245,0.4)' : 'rgba(10,10,10,0.4)';
    const gClr = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
    const bClr = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    const lBg  = isDark ? '#1a1a1a' : '#f0f0f0';
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: tClr, fontFamily: 'JetBrains Mono, Courier New, monospace', fontSize: 10 },
      grid:    { vertLines: { color: gClr }, horzLines: { color: gClr } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', labelBackgroundColor: lBg }, horzLine: { color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)', labelBackgroundColor: lBg } },
      rightPriceScale: { borderColor: bClr },
      timeScale: { borderColor: bClr, timeVisible: true, secondsVisible: false },
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
        }).catch(() => { loadingRef.current = false; });
      }
    });

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
      indRefs.current = {};
      plRef.current = { entry: null, sl: null, tp: null };
      try { chart.remove(); } catch {}
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
      areaRef.current = null;
    };
  }, []);

  // Load data when coin or tf changes
  useEffect(() => {
    if (!chartRef.current) return;
    let cancelled = false;
    wsRef.current?.close();
    barsRef.current = [];
    fetchBars(coin, tf, undefined).then(async bars => {
      if (cancelled || !candleRef.current) return;
      applyData(bars);
      chartRef.current?.timeScale().fitContent();
      connectWS(coin, tf);
      // Background: fetch remaining history (up to 9 more pages)
      if (bars.length >= 1000) {
        let all = [...bars];
        let endMs = bars[0].time * 1000 - 1;
        for (let page = 0; page < 9; page++) {
          if (cancelled) break;
          const chunk = await fetchBars(coin, tf, endMs);
          if (!chunk.length) break;
          all = dedup([...chunk, ...all]);
          if (!cancelled && candleRef.current) {
            barsRef.current = all;
            applyData(all);
          }
          if (chunk.length < 1000) break;
          endMs = chunk[0].time * 1000 - 1;
        }
      }
    });
    return () => { cancelled = true; };
  }, [coin, tf]);

  // Theme changes
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

  // Price lines for entry / SL / TP
  useEffect(() => {
    const cs = candleRef.current;
    if (!cs) return;
    const { entry, sl, tp } = plRef.current;
    try { if (entry) cs.removePriceLine(entry); } catch {}
    try { if (sl)    cs.removePriceLine(sl);    } catch {}
    try { if (tp)    cs.removePriceLine(tp);    } catch {}
    plRef.current = { entry: null, sl: null, tp: null };
    if (entryPrice > 0) plRef.current.entry = cs.createPriceLine({ price: entryPrice, color: 'rgba(251,191,36,0.9)', lineStyle: LineStyle.Dashed, lineWidth: 1, title: 'Entry' });
    if (stopLoss   > 0) plRef.current.sl    = cs.createPriceLine({ price: stopLoss,   color: 'rgba(255,77,109,0.9)',  lineStyle: LineStyle.Dashed, lineWidth: 1, title: 'SL'    });
    if (takeProfit > 0) plRef.current.tp    = cs.createPriceLine({ price: takeProfit,  color: 'rgba(0,212,170,0.9)',   lineStyle: LineStyle.Dashed, lineWidth: 1, title: 'TP'    });
  }, [entryPrice, stopLoss, takeProfit]);

  // Re-apply markers when trade list changes while bars are already loaded
  useEffect(() => {
    if (barsRef.current.length) applyMarkers(barsRef.current);
  }, [trades]); // eslint-disable-line react-hooks/exhaustive-deps

  // Candle / Line area toggle
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    showLRef.current = showLine;
    if (showLine) {
      if (!areaRef.current) {
        const area = chart.addAreaSeries({ lineColor: C_UP, topColor: 'rgba(14,203,129,0.25)', bottomColor: 'rgba(14,203,129,0)', lineWidth: 2 });
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

  // Escape fullscreen
  useEffect(() => {
    const h = e => e.key === 'Escape' && setIsFS(false);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

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
        } else if (name === 'RSI') {
          const rsi = chart.addLineSeries({ priceScaleId: 'rsi', color: '#9b59b6', lineWidth: 1.5, lastValueVisible: true, priceLineVisible: false });
          rsi.createPriceLine({ price: 70, color: 'rgba(246,70,93,0.45)', lineStyle: LineStyle.Dashed, lineWidth: 1 });
          rsi.createPriceLine({ price: 50, color: 'rgba(150,150,150,0.3)', lineStyle: LineStyle.Dashed, lineWidth: 1 });
          rsi.createPriceLine({ price: 30, color: 'rgba(14,203,129,0.45)', lineStyle: LineStyle.Dashed, lineWidth: 1 });
          const v = calcRSI(bars);
          rsi.setData(bars.map((b, i) => ({ time: b.time, value: v[i] })).filter(d => d.value != null));
          if (activeInds.MACD) {
            rsi.priceScale().applyOptions({ scaleMargins: { top: 0.66, bottom: 0.28 }, drawTicks: true });
            indRefs.current.MACD?.[0]?.priceScale().applyOptions({ scaleMargins: { top: 0.80, bottom: 0.02 } });
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
          sigLine.setData(bars.map((b, i) => ({ time: b.time, value: sigArr[i] })).filter(d => d.value != null));
          histSer.setData(bars.map((b, i) => ({
            time: b.time, value: histArr[i],
            color: (histArr[i] ?? 0) >= 0 ? 'rgba(14,203,129,0.6)' : 'rgba(246,70,93,0.6)',
          })).filter(d => d.value != null));
          if (activeInds.RSI) {
            macdLine.priceScale().applyOptions({ scaleMargins: { top: 0.80, bottom: 0.02 }, drawTicks: true });
            indRefs.current.RSI?.[0]?.priceScale().applyOptions({ scaleMargins: { top: 0.66, bottom: 0.28 } });
            volRef.current?.priceScale().applyOptions({ scaleMargins: { top: 0.95, bottom: 0 } });
          } else {
            macdLine.priceScale().applyOptions({ scaleMargins: { top: 0.76, bottom: 0.02 }, drawTicks: true });
            volRef.current?.priceScale().applyOptions({ scaleMargins: { top: 0.92, bottom: 0 } });
          }
          indRefs.current.MACD = [macdLine, sigLine, histSer];
        }
        setActiveInds(p => ({ ...p, [name]: true }));
      } catch {}
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 260px)', minHeight: 480, border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', overflow: 'hidden', ...(isFS ? { position: 'fixed', inset: 0, zIndex: 9999, border: 'none', height: '100vh', minHeight: '100vh' } : {}) }}>

      {/* Toolbar */}
      <div style={{ height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 8px', gap: 2, borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <button onClick={() => { showLRef.current = false; setShowLine(false); }} style={{ height: 22, padding: '0 8px', borderRadius: 3, cursor: 'pointer', fontFamily: FM, fontSize: 11, background: !showLine ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${!showLine ? 'var(--border-strong)' : 'transparent'}`, color: !showLine ? 'var(--text-primary)' : 'var(--text-muted)' }}>{t.dashboard.chartCandles}</button>
        <button onClick={() => { showLRef.current = true; setShowLine(true); }} style={{ height: 22, padding: '0 8px', borderRadius: 3, cursor: 'pointer', fontFamily: FM, fontSize: 11, background: showLine ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${showLine ? 'var(--border-strong)' : 'transparent'}`, color: showLine ? 'var(--text-primary)' : 'var(--text-muted)' }}>{t.dashboard.chartLine}</button>
        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />
        <span style={{ fontFamily: FF, fontSize: 10, color: 'var(--text-muted)', marginRight: 2 }}>Ind</span>
        {['MA','EMA','BOLL','RSI','MACD'].map(name => (
          <button key={name} onClick={() => toggleInd(name)} style={{ height: 22, padding: '0 7px', borderRadius: 3, cursor: 'pointer', fontFamily: FM, fontSize: 10, background: activeInds[name] ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${activeInds[name] ? 'var(--border-strong)' : 'transparent'}`, color: activeInds[name] ? 'var(--text-primary)' : 'var(--text-muted)' }}>{name}</button>
        ))}
        <div style={{ width: 8, flexShrink: 0 }} />
        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px', flexShrink: 0 }} />
        {['1','5','15','60','240','D'].map(t => (
          <button key={t} onClick={() => { setTf(t); localStorage.setItem('kado_chart_tf', t); }} style={{ height: 22, padding: '0 8px', borderRadius: 3, cursor: 'pointer', fontFamily: FM, fontSize: 11, background: tf === t ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${tf === t ? 'var(--border-strong)' : 'transparent'}`, color: tf === t ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: tf === t ? 600 : 400 }}>{TF_LABELS[t]}</button>
        ))}
        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 4px' }} />
        <button onClick={() => setIsFS(v => !v)} title={isFS ? 'Exit fullscreen (Esc)' : 'Fullscreen'} style={{ height: 22, width: 22, borderRadius: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isFS ? 'var(--bg-elevated)' : 'transparent', border: `1px solid ${isFS ? 'var(--border-strong)' : 'transparent'}`, color: isFS ? 'var(--text-primary)' : 'var(--text-muted)', padding: 0, flexShrink: 0 }}>
          {isFS
            ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 1H1v3M8 1h3v3M4 11H1V8M8 11h3V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 4V1h3M8 1h3v3M1 8v3h3M8 11h3V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          }
        </button>
      </div>

      {/* Chart area */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div ref={elRef} style={{ flex: 1, minWidth: 0, background: 'var(--bg-base)' }} />
        {!isMobile && <OrderBook coin={coin} />}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   EQUITY CURVE — pure SVG, no recharts (avoids React 18 error #310)
══════════════════════════════════════════════════════════════════ */
function EquityCurve({ data }) {
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

  const H = 300;
  const PAD = { top: 12, right: 8, bottom: 28, left: 56 };

  // All chart geometry depends only on `data` and width `w` — recompute
  // only when those change, not on every hover-driven re-render.
  const geom = useMemo(() => {
    const vals  = data.map(d => d.v);
    const minV  = Math.min(...vals, 0);
    const maxV  = Math.max(...vals, 0);
    const range = maxV - minV || 1;
    const isPos = (vals[vals.length - 1] ?? 0) >= 0;
    const color = isPos ? '#0ecb81' : '#f6465d';

    const chartW = w - PAD.left - PAD.right;
    const chartH = H - PAD.top - PAD.bottom;

    const sx = i => PAD.left + (i / Math.max(data.length - 1, 1)) * chartW;
    const sy = v => PAD.top + chartH - ((v - minV) / range) * chartH;

    const pts   = data.map((d, i) => `${sx(i)},${sy(d.v)}`).join(' ');
    const zeroY = sy(0);

    const areaPath = data.length > 1
      ? `M${sx(0)},${zeroY} ` +
        data.map((d, i) => `L${sx(i)},${sy(d.v)}`).join(' ') +
        ` L${sx(data.length - 1)},${zeroY} Z`
      : '';

    const yTicks = [];
    for (let i = 0; i <= 5; i++) {
      const v = minV + (range * i) / 5;
      yTicks.push({ v, y: sy(v) });
    }

    const xIdxs = data.length <= 1 ? [0]
      : [0, Math.floor(data.length * 0.33), Math.floor(data.length * 0.66), data.length - 1].filter((v, i, a) => a.indexOf(v) === i);

    return { minV, maxV, color, chartW, chartH, sx, sy, pts, zeroY, areaPath, yTicks, xIdxs };
  }, [data, w]);

  const { minV, maxV, color, chartW, chartH, sx, sy, pts, zeroY, areaPath, yTicks, xIdxs } = geom;

  // Throttle mouse-move tracking: ignore moves that don't change the snapped index.
  const handleMouseMove = useCallback(e => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx   = e.clientX - rect.left - PAD.left;
    const raw  = Math.round((mx / chartW) * (data.length - 1));
    const idx  = Math.max(0, Math.min(data.length - 1, raw));
    setHover(prev => (prev === idx ? prev : idx));
  }, [chartW, data.length]);

  return (
    <div ref={wrapRef} style={{ padding: '8px 4px 0' }}>
      {w > 0 && data.length > 0 && (
        <svg
          width={w} height={H}
          style={{ display: 'block', overflow: 'visible' }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="eq_svg_grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2}/>
              <stop offset="100%" stopColor={color} stopOpacity={0}/>
            </linearGradient>
          </defs>

          {/* zero line */}
          {minV < 0 && maxV > 0 && (
            <line x1={PAD.left} y1={zeroY} x2={PAD.left + chartW} y2={zeroY}
              stroke="var(--border-default)" strokeWidth={1} strokeDasharray="3 3"/>
          )}

          {/* grid lines */}
          {yTicks.map(({ y }, i) => (
            <line key={i} x1={PAD.left} y1={y} x2={PAD.left + chartW} y2={y}
              stroke="var(--border-subtle)" strokeWidth={0.5}/>
          ))}

          {/* fill */}
          {areaPath && <path d={areaPath} fill="url(#eq_svg_grad)"/>}

          {/* line */}
          <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round"/>

          {/* Y-axis labels */}
          {yTicks.map(({ v, y }) => (
            <text key={v} x={PAD.left - 6} y={y + 3}
              textAnchor="end" fontFamily="JetBrains Mono, monospace" fontSize={9}
              fill="var(--text-muted)">
              ${v >= 0 ? '+' : ''}{v.toFixed(0)}
            </text>
          ))}

          {/* X-axis labels */}
          {xIdxs.map(i => (
            <text key={i} x={sx(i)} y={H - 6}
              textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
              fontFamily="JetBrains Mono, monospace" fontSize={9}
              fill="var(--text-muted)">
              {data[i].t}
            </text>
          ))}

          {/* hover crosshair */}
          {hover != null && (
            <>
              <line x1={sx(hover)} y1={PAD.top} x2={sx(hover)} y2={PAD.top + chartH}
                stroke="var(--border-default)" strokeWidth={1} strokeDasharray="4 2"/>
              <circle cx={sx(hover)} cy={sy(data[hover].v)} r={4}
                fill={color} stroke="var(--bg-base)" strokeWidth={2}/>
              <rect
                x={Math.min(sx(hover) + 8, PAD.left + chartW - 110)}
                y={Math.max(PAD.top, sy(data[hover].v) - 28)}
                width={104} height={40} rx={2}
                fill="var(--bg-elevated)" stroke="var(--border-default)" strokeWidth={1}/>
              <text
                x={Math.min(sx(hover) + 60, PAD.left + chartW - 58)}
                y={Math.max(PAD.top, sy(data[hover].v) - 28) + 14}
                textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize={9}
                fill="var(--text-muted)">
                {data[hover].t}
              </text>
              <text
                x={Math.min(sx(hover) + 60, PAD.left + chartW - 58)}
                y={Math.max(PAD.top, sy(data[hover].v) - 28) + 28}
                textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize={11}
                fontWeight={600} fill={color}>
                {data[hover].v >= 0 ? '+' : ''}{data[hover].v.toFixed(2)} USDT
              </text>
            </>
          )}
        </svg>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   BOTTOM PANEL
══════════════════════════════════════════════════════════════════ */
const PANEL_LOCALE = { en:'en-US', es:'es-ES', uk:'uk-UA', ru:'ru-RU', de:'de-DE', zh:'zh-CN' };

function Panel({ botTrades, botPositions, openOrders = [], onClose = () => {}, onCancelOrder = () => {}, filterCoin, balance }) {
  const { t, lang } = useLang();
  const tp = t.dashboard.panel;
  const td = t.dashboard;
  const dstrLoc = s => s ? new Date(s).toLocaleString(PANEL_LOCALE[lang] || 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const [tab, setTab] = useState('open');
  const [fundingRates, setFundingRates] = useState({});
  const [histSide,   setHistSide]   = useState('ALL');
  const [histSearch, setHistSearch] = useState('');
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
  const pnlStats = useMemo(() => {
    if (!filteredClosed.length) return {};
    const winSum  = pnlWins.reduce((s, t) => s + pnl(t), 0);
    const lossSum = Math.abs(pnlLoss.reduce((s, t) => s + pnl(t), 0));
    const pnls    = filteredClosed.map(t => pnl(t));
    return {
      avgWin:  pnlWins.length ? +(winSum / pnlWins.length).toFixed(2) : null,
      avgLoss: pnlLoss.length ? +(pnlLoss.reduce((s, t) => s + pnl(t), 0) / pnlLoss.length).toFixed(2) : null,
      pf:      lossSum > 0 ? +(winSum / lossSum).toFixed(2) : null,
      best:    pnlWins.length ? +Math.max(...pnlWins.map(t => pnl(t))).toFixed(2) : null,
      worst:   pnlLoss.length ? +Math.min(...pnlLoss.map(t => pnl(t))).toFixed(2) : null,
    };
  }, [filteredClosed, pnlWins, pnlLoss]);

  const displayHistory = useMemo(() => {
    const lc = histSearch.toUpperCase();
    return closed.filter(t => {
      if (histSide !== 'ALL' && (t.side || '').toUpperCase() !== histSide) return false;
      if (lc && !sym(t.symbol).includes(lc)) return false;
      return true;
    }).slice(0, 200);
  }, [closed, histSide, histSearch]);

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
    { id: 'open',      label: tp.openOrders,   n: filteredOrders.length },
    { id: 'positions', label: tp.positions,    n: filteredPos.length },
    { id: 'history',   label: tp.tradeHistory, n: null },
    { id: 'pnl',       label: tp.pnl,          n: null },
    { id: 'equity',    label: tp.equityCurve,  n: null },
    { id: 'assets',    label: tp.assets,       n: null },
  ];

  const Th = ({ v, r }) => (
    <th style={{ padding: '6px 14px', fontFamily: FM, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 400, textAlign: r ? 'right' : 'left', background: 'var(--bg-base)', position: 'sticky', top: 0, whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-subtle)' }}>{v}</th>
  );
  const Td = ({ v, hi, r }) => (
    <td style={{ padding: '7px 14px', fontFamily: FM, fontSize: 11, color: hi || 'var(--text-secondary)', textAlign: r ? 'right' : 'left', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-subtle)' }}>{v ?? '—'}</td>
  );
  const Empty = () => (
    <div style={{ padding: '40px 0', textAlign: 'center', fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', color: 'var(--text-muted)' }}>{tp.empty}</div>
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
            <thead><tr><Th v={td.hTime}/><Th v={td.hSymbol}/><Th v={td.hSide}/><Th v={td.hType}/><Th v={td.hQty}/><Th v={td.hPrice} r/><Th v={td.hFilled} r/><Th v={td.hStatus}/><Th v={td.hReduce}/><Th v=""/></tr></thead>
            <tbody>{filteredOrders.map((o, i) => (
              <tr key={i} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                <Td v={dstrLoc(o.created_at ? +o.created_at : null)}/>
                <Td v={o.symbol} hi="var(--text-primary)"/>
                <Td v={o.side} hi={o.side === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)'}/>
                <Td v={o.order_type}/>
                <Td v={fix(o.qty, 3)}/>
                <Td v={fix(o.price, 4)} r/>
                <Td v={fix(o.filled_qty, 3)} r/>
                <Td v={o.status}/>
                <Td v={o.reduce_only ? tp.yes : '—'}/>
                <td style={{ padding: '4px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
                  <button
                    onClick={() => onCancelOrder(o.order_id, o.symbol)}
                    style={{ fontFamily: FM, fontSize: 10, padding: '3px 8px', background: 'transparent', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', cursor: 'pointer' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,77,109,0.15)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                    {tp.cancel}
                  </button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        )}

        {tab === 'positions' && (filteredPos.length === 0 ? <Empty /> :
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><Th v={td.hSymbol}/><Th v={td.hSide}/><Th v={td.hLev}/><Th v={td.hSize}/><Th v={td.hEntry}/><Th v={td.hMark}/><Th v={td.hSL}/><Th v={td.hTP}/><Th v="FR 8h"/><Th v="PnL%" r/><Th v={td.hUnrealPnl} r/><Th v=""/></tr></thead>
            <tbody>{filteredPos.map((p, i) => {
              const upnl   = p.unrealized_pnl ?? 0;
              const hasSL  = !!p.stop_loss;
              const hasTP  = !!p.take_profit;
              return (
                <tr key={i} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <Td v={sym(p.symbol)} hi="var(--text-primary)"/>
                  <Td v={p.side} hi={p.side === 'LONG' ? 'var(--accent-green)' : 'var(--accent-red)'}/>
                  <Td v={p.leverage ? `${p.leverage}x` : '—'}/>
                  <Td v={fix(p.qty, 3)}/>
                  <Td v={fix(p.entry_price, 4)}/>
                  <Td v={fix(p.mark_price, 4)}/>
                  <Td v={hasSL ? fix(p.stop_loss, 4) : '—'} hi={!hasSL ? 'var(--accent-red)' : undefined}/>
                  <Td v={hasTP ? fix(p.take_profit, 4) : tp.noTp} hi={!hasTP ? 'var(--accent-red)' : undefined}/>
                  {(() => {
                    const fr = fundingRates[sym(p.symbol)];
                    return <Td v={fr != null ? `${fr >= 0 ? '+' : ''}${fr.toFixed(4)}%` : '—'} hi={fr != null ? (fr >= 0 ? 'var(--accent-red)' : 'var(--accent-green)') : undefined}/>;
                  })()}
                  <Td v={p.pnl_pct != null ? `${sign(p.pnl_pct, 1)}%` : '—'} hi={pos(p.pnl_pct ?? 0) ? 'var(--accent-green)' : 'var(--accent-red)'} r/>
                  <Td v={`${sign(upnl)} USDT`} hi={pos(upnl) ? 'var(--accent-green)' : 'var(--accent-red)'} r/>
                  <td style={{ padding: '4px 12px', borderBottom: '1px solid var(--border-subtle)' }}>
                    <button
                      onClick={() => onClose(p.symbol)}
                      style={{ fontFamily: FM, fontSize: 10, padding: '3px 8px', background: 'transparent', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,77,109,0.15)'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                      {tp.close}
                    </button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        )}

        {tab === 'history' && (closed.length === 0 ? <Empty /> : (
          <>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
              {['ALL', 'LONG', 'SHORT'].map(s => (
                <button key={s} onClick={() => setHistSide(s)} style={{
                  fontFamily: FM, fontSize: 9, padding: '2px 8px', cursor: 'pointer',
                  border: `1px solid ${histSide === s ? (s === 'LONG' ? 'var(--accent-green)' : s === 'SHORT' ? 'var(--accent-red)' : 'var(--border-strong)') : 'var(--border-subtle)'}`,
                  color: histSide === s ? (s === 'LONG' ? 'var(--accent-green)' : s === 'SHORT' ? 'var(--accent-red)' : 'var(--text-primary)') : 'var(--text-muted)',
                  background: 'transparent', letterSpacing: '0.08em',
                }}>{s}</button>
              ))}
              <input
                value={histSearch}
                onChange={e => setHistSearch(e.target.value)}
                placeholder={td.searchCoin}
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', fontFamily: FM, fontSize: 9, padding: '2px 8px', outline: 'none', width: 70, letterSpacing: '0.04em' }}
              />
              {(histSide !== 'ALL' || histSearch) && (
                <span style={{ fontFamily: FM, fontSize: 9, color: 'var(--text-muted)' }}>{displayHistory.length} / {closed.length}</span>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><Th v={td.hDate}/><Th v={td.hSymbol}/><Th v={td.hSide}/><Th v={td.hLev}/><Th v={td.hSize}/><Th v={td.hEntry}/><Th v={td.hExit}/><Th v={td.hPnL} r/></tr></thead>
              <tbody>{displayHistory.map((t, i) => {
                const p = pnl(t);
                return (
                  <tr key={i} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <Td v={dstrLoc(t.closed_at)}/><Td v={sym(t.symbol)} hi="var(--text-primary)"/>
                    <Td v={t.side} hi={t.side === 'LONG' || t.side === 'Buy' ? 'var(--accent-green)' : 'var(--accent-red)'}/>
                    <Td v={t.leverage ? `${t.leverage}x` : '—'}/>
                    <Td v={fix(t.qty, 3)}/><Td v={fix(t.entry_price, 4)}/><Td v={fix(t.exit_price, 4)}/>
                    <Td v={`${sign(p)} USDT`} hi={pos(p) ? 'var(--accent-green)' : 'var(--accent-red)'} r/>
                  </tr>
                );
              })}</tbody>
            </table>
          </>
        ))}

        {tab === 'pnl' && (filteredClosed.length === 0 ? <Empty /> :
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(110px,1fr))', gap: 0 }}>
            {[
              [ta.totalPnl,    `${sign(pnlTotal)} USDT`, pos(pnlTotal) ? 'var(--accent-green)' : 'var(--accent-red)'],
              [to.winRate,     `${pnlWr}%`,              pnlWr >= 50 ? 'var(--accent-green)' : 'var(--accent-red)'],
              [ta.hTrades,     String(filteredClosed.length), 'var(--text-primary)'],
              [to.wl,          `${pnlWins.length} / ${pnlLoss.length}`, 'var(--text-primary)'],
              ...(pnlStats.avgWin  != null ? [[ta.hAvgWin,  `+${pnlStats.avgWin}`,  'var(--accent-green)']] : []),
              ...(pnlStats.avgLoss != null ? [[ta.hAvgLoss, `${pnlStats.avgLoss}`,  'var(--accent-red)']]   : []),
              ...(pnlStats.avgWin != null && pnlStats.avgLoss != null ? (() => { const rr = +(pnlStats.avgWin / Math.abs(pnlStats.avgLoss)).toFixed(2); return [['R:R', `${rr}`, rr >= 1 ? 'var(--accent-green)' : 'var(--accent-red)']]; })() : []),
              ...(pnlStats.pf      != null ? [[ta.profitFactor, `${pnlStats.pf}×`, pnlStats.pf >= 1 ? 'var(--accent-green)' : 'var(--accent-red)']] : []),
              ...(pnlStats.best    != null ? [[to.best,     `+${pnlStats.best}`,    'var(--accent-green)']] : []),
              ...(pnlStats.worst   != null ? [[to.worst,    `${pnlStats.worst}`,    'var(--accent-red)']]   : []),
            ].map(([l, v, col]) => (
              <div key={l} style={{ padding: '16px 14px', borderRight: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)' }}>
                <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>{l}</div>
                <div style={{ fontFamily: FM, fontSize: 18, fontWeight: 600, color: col }}>{v}</div>
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
            return { t: dstrLoc(t.closed_at), v: parseFloat(cum.toFixed(2)) };
          });
          if (data.length === 0) return <Empty />;
          return <EquityCurve data={data} />;
        })()}

        {tab === 'assets' && (
          balance ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 0 }}>
              {[
                [ta.bWallet,     `$${(+(balance.usdt_wallet ?? balance.wallet ?? 0)).toFixed(2)}`, true],
                [ta.bEquity,     `$${(+(balance.usdt_equity ?? balance.equity ?? 0)).toFixed(2)}`, true],
                [ta.bUnrealized, `${sign(balance.unrealized_pnl)} USDT`, pos(balance.unrealized_pnl)],
                [ta.bAvailable,  `$${(+(balance.usdt_free ?? 0)).toFixed(2)}`, true],
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
  signal:    ['news', 'signal', 'dex'],
  sweep:     ['sweep'],
  cascade:   ['liq_cascade', 'cascade'],
  fr:        ['fr', 'fr_extreme'],
  grid:      ['grid'],
  altcoin:   ['altcoin'],
  orderflow: ['orderflow'],
  ob:        ['ob', 'orderblock'],
  macro:     ['macro'],
  listing:   ['listing'],
  dex:       ['dex'],
  history:   ['bybit'],
};

const ALL_BOTS_CONFIG = [
  { id: 'signal',    label: 'Signal',    source: 'news' },
  { id: 'sweep',     label: 'Sweep',     source: 'sweep' },
  { id: 'cascade',   label: 'Cascade',   source: 'liq_cascade' },
  { id: 'fr',        label: 'Funding',   source: 'fr_extreme' },
  { id: 'grid',      label: 'Grid',      source: 'grid' },
  { id: 'altcoin',   label: 'Alt',       source: 'altcoin' },
  { id: 'orderflow', label: 'Orderflow', source: 'orderflow' },
  { id: 'ob',        label: 'OB',        source: 'orderblock' },
  { id: 'macro',     label: 'Macro',     source: 'macro' },
  { id: 'listing',   label: 'Listing',   source: 'listing' },
  { id: 'dex',       label: 'DEX',       source: 'dex' },
];

export default function OverviewTab({ botId = 'signal', allowedBots = null }) {
  const dbSources = BOT_SOURCES[botId] ?? [botId];
  const dbSource  = dbSources[0]; // primary key for heartbeat + labels
  const isMobile  = useIsMobile();
  const isLocked  = false;
  const { t }     = useLang();
  const to        = t.dashboard.overview;
  const ta        = t.dashboard.analytics;
  const tp        = t.dashboard.panel;

  // ── Real-time WebSocket feed ──────────────────────────────────────────────
  const { positions, balance, openOrders, trades, connected, noKey } = useLiveStream();

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

  const coinTrades = useMemo(() =>
    periodTrades.filter(t => sym(t.symbol) === coin && !!t.closed_at),
    [periodTrades, coin]
  );

  const coinPnl = useMemo(() => {
    const cl = periodTrades.filter(t => t.closed_at);
    const map = {};
    for (const t of cl) {
      const c = sym(t.symbol);
      if (!c) continue;
      map[c] = (map[c] ?? 0) + pnl(t);
    }
    return Object.fromEntries(Object.entries(map).map(([k, v]) => [k, parseFloat(v.toFixed(2))]));
  }, [periodTrades]);

  // Search ALL Bybit positions for the selected coin (not just this bot's subset)
  // so entry/SL/TP lines always appear when a position exists, matching Bybit UX
  const activePos  = positions.find(p => sym(p.symbol) === coin);
  const entryPrice = activePos?.entry_price ?? 0;
  const stopLoss   = activePos?.stop_loss   ?? 0;
  const takeProfit = activePos?.take_profit ?? 0;

  const handleClose = useCallback(async (symbol) => {
    if (!confirm(`${tp.closePositionQ}: ${symbol}?`)) return;
    try {
      const r = await fetch('/api/users/close-position', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('kado_token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || r.status); }
      // WS update arrives automatically within 2s — no manual poll needed
    } catch (e) {
      alert(`${tp.closeFailed} ${symbol}: ${e.message}`);
    }
  }, []);

  const handleCancelOrder = useCallback(async (orderId, symbol) => {
    if (!confirm(`${tp.cancelOrderQ}: ${symbol}?`)) return;
    try {
      const r = await fetch('/api/users/cancel-order', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('kado_token')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId, symbol }),
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || r.status); }
      // WS update arrives automatically within 2s
    } catch (e) {
      alert(`${tp.cancelFailed}: ${e.message}`);
    }
  }, []);

  if (isLocked) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
      <div style={{ fontSize: 32 }}>🔒</div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 16, color: 'var(--text-primary)', fontWeight: 600 }}>{tp.botNotAvailable}</div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-muted)' }}>{tp.upgradeToAccess}</div>
      <a href="/pricing" style={{ marginTop: 8, padding: '10px 24px', background: 'var(--accent-green)', color: '#000', borderRadius: 6, fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>{tp.upgradePlan}</a>
    </div>
  );

  if (noKey) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 12, textAlign: 'center', padding: '0 24px' }}>
      <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>{ta.noKeyTitle}</div>
      <div style={{ fontFamily: 'var(--font-sans)', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 360 }}>
        {ta.noKeyDesc}
      </div>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'api-keys' }))}
        style={{ marginTop: 8, padding: '10px 24px', background: 'var(--text-primary)', color: 'var(--bg-base)', border: 'none', fontFamily: FM, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
      >
        {ta.noKeyBtn}
      </button>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, ...(isBW ? { filter: 'grayscale(1)' } : {}) }}>

      {/* ── PERIOD FILTER ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 4 }}>{to.period}</span>
        {[['1d', to.today],['7d','7D'],['30d','30D'],['all', ta.all]].map(([v,label]) => {
          const on = period === v;
          return (
            <button key={v} onClick={() => setPeriod(v)} style={{
              fontFamily: FM, fontSize: 10, padding: '3px 9px',
              background: on ? 'var(--bg-elevated)' : 'transparent',
              border: `1px solid ${on ? 'var(--border-strong)' : 'var(--border-default)'}`,
              color: on ? 'var(--text-primary)' : 'var(--text-muted)',
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
          { label: ta.bWallet,    value: balance ? `$${(+(balance.usdt_wallet ?? balance.wallet ?? 0)).toFixed(2)}` : '—', sub: (balance?.usdt_equity ?? balance?.equity) ? `${ta.bEquity.toLowerCase()} $${(+(balance.usdt_equity ?? balance.equity ?? 0)).toFixed(2)}` : null, good: null },
          { label: ta.bUnrealized, value: botPos.length > 0 ? `${sign(botUnreal)} USDT` : '—', sub: botPos.length ? `${botPos.length} ${to.openPositions.toLowerCase()}` : to.noOpenPos, good: botPos.length ? pos(botUnreal) : null },
          { label: to.realized,   value: stats.n > 0 ? `${sign(stats.total)} USDT` : '—', sub: stats.n > 0 ? `${stats.n} ${to.closedTrades}` : to.noTrades, good: stats.n > 0 ? pos(stats.total) : null },
          { label: to.winRate,    value: stats.n > 0 ? `${stats.wr}%` : '—', sub: stats.n > 0 ? `${stats.wins}W / ${stats.n - stats.wins}L` : '—', good: stats.n > 0 ? stats.wr >= 50 : null },
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
      <div style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', flexShrink: 0, alignItems: 'center', overflowX: 'auto', scrollbarWidth: 'none' }}>
        <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 2, flexShrink: 0 }}>{to.bots}</span>
        {ALL_BOTS_CONFIG.map(b => {
          const h = heartbeat[b.source];
          const ago = h?.last_trade_min_ago;
          const active = ago != null && ago < 240;
          const current = b.id === botId;
          return (
            <div key={b.id} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '3px 8px', flexShrink: 0,
              border: `1px solid ${current ? 'var(--border-strong)' : 'var(--border-subtle)'}`,
              borderRadius: 3,
              background: current ? 'var(--bg-elevated)' : 'transparent',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
                background: h == null ? 'var(--border-strong)' : active ? 'var(--text-secondary)' : 'var(--text-muted)',
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
            background: connected ? 'var(--text-secondary)' : 'var(--text-muted)',
          }}/>
          <span style={{ fontFamily: FM, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
            {connected ? t.dashboard.bot.live : to.reconnecting}
          </span>
        </div>
        {/* Bot heartbeat */}
        {heartbeat[dbSource] != null && (() => {
          const h = heartbeat[dbSource];
          const ago = h?.last_trade_min_ago;
          const fresh = ago != null && ago < 240;
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: fresh ? '#aaa' : '#444', display: 'inline-block', flexShrink: 0 }}/>
              <span style={{ fontFamily: FM, fontSize: 10, color: 'var(--text-muted)' }}>
                {to.lastTrade} {ago != null ? (ago < 60 ? `${ago}m ${t.dashboard.bot.ago}` : `${Math.round(ago / 60)}h ${t.dashboard.bot.ago}`) : '—'}
              </span>
            </div>
          );
        })()}
      </div>

      {/* ── COINS ─────────────────────────────────────────────── */}
      <CoinTicker coins={analyzerCoins} selected={coin} onSelect={setCoin} coinPnl={coinPnl} />

      {analyzerCoins.length === 0 && (
        coins.length === 0 ? (
          <div style={{ padding: '8px 0', fontFamily: FM, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
            {to.waitingSignal}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center', flexShrink: 0 }}>
            <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 8 }}>{to.pair}</span>
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

      {/* ── KLINECHART ────────────────────────────────────────── */}
      <Chart coin={coin} entryPrice={entryPrice} stopLoss={stopLoss} takeProfit={takeProfit} onTypeChange={id => setIsBW(id === 'candle_up_stroke')} isMobile={isMobile} trades={coinTrades} />

      {/* ── PANEL ─────────────────────────────────────────────── */}
      <Panel botTrades={periodTrades} botPositions={botPos} openOrders={openOrders} onClose={handleClose} onCancelOrder={handleCancelOrder} filterCoin={coin} balance={balance}/>
    </div>
  );
}
