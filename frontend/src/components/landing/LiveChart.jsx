import React, { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';

const PAIRS = ['BTCUSDT', 'ETHUSDT'];
const INTERVALS = [
  { label: '1H', bybit: '60' },
  { label: '4H', bybit: '240' },
  { label: '1D', bybit: 'D' },
];

const CHART_OPTS = {
  layout:          { background: { color: '#0a0a0a' }, textColor: 'rgba(255,255,255,0.35)' },
  grid:            { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
  crosshair:       { mode: 1 },
  rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)', scaleMargins: { top: 0.1, bottom: 0.1 } },
  timeScale:       { borderColor: 'rgba(255,255,255,0.06)', timeVisible: true, secondsVisible: false },
  handleScroll:    { mouseWheel: false, pressedMouseMove: false },
  handleScale:     { mouseWheel: false, pinch: false },
};

const CANDLE_OPTS = {
  upColor:        'rgba(34,197,94,0.75)',
  downColor:      'rgba(239,68,68,0.65)',
  borderUpColor:  'rgba(34,197,94,0.9)',
  borderDownColor:'rgba(239,68,68,0.8)',
  wickUpColor:    'rgba(34,197,94,0.5)',
  wickDownColor:  'rgba(239,68,68,0.45)',
};

async function fetchKlines(symbol, interval) {
  const url = `https://api.bybit.com/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=100`;
  const res  = await fetch(url);
  const json = await res.json();
  return (json?.result?.list ?? [])
    .reverse()
    .map(([t, o, h, l, c]) => ({
      time:  Math.floor(Number(t) / 1000),
      open:  parseFloat(o),
      high:  parseFloat(h),
      low:   parseFloat(l),
      close: parseFloat(c),
    }));
}

async function fetchLastPrice(symbol) {
  const url  = `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`;
  const res  = await fetch(url);
  const json = await res.json();
  const t    = json?.result?.list?.[0];
  if (!t) return null;
  return { price: parseFloat(t.lastPrice), pct: parseFloat(t.price24hPcnt) * 100 };
}

export default function LiveChart() {
  const containerRef  = useRef(null);
  const chartRef      = useRef(null);
  const seriesRef     = useRef(null);
  const wsRef         = useRef(null);
  const currentBarRef = useRef(null);

  const [pair,     setPair]     = useState('BTCUSDT');
  const [activeIv, setActiveIv] = useState('60');
  const [ticker,   setTicker]   = useState(null);

  // Init chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      ...CHART_OPTS,
      width:  containerRef.current.clientWidth,
      height: 220,
    });
    const series = chart.addCandlestickSeries(CANDLE_OPTS);
    chartRef.current  = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect;
      chart.resize(width, 220);
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); };
  }, []);

  // Load data + WebSocket on pair/interval change
  useEffect(() => {
    if (!seriesRef.current) return;
    currentBarRef.current = null;

    fetchKlines(pair, activeIv).then(data => {
      seriesRef.current.setData(data);
      chartRef.current.timeScale().fitContent();
      // seed currentBar from last historical candle
      if (data.length) currentBarRef.current = { ...data[data.length - 1] };
    }).catch(() => {});

    fetchLastPrice(pair).then(setTicker).catch(() => {});

    if (wsRef.current) { wsRef.current.close(); }
    const ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ op: 'subscribe', args: [
        `kline.${activeIv}.${pair}`,
        `publicTrade.${pair}`,
      ]}));
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);

        // publicTrade → fires on every trade, updates candle + price display
        if (msg.topic === `publicTrade.${pair}` && Array.isArray(msg.data) && msg.data.length) {
          const price = parseFloat(msg.data[msg.data.length - 1].p);
          setTicker(prev => prev ? { ...prev, price } : null);
          if (currentBarRef.current) {
            currentBarRef.current = {
              ...currentBarRef.current,
              close: price,
              high:  Math.max(currentBarRef.current.high, price),
              low:   Math.min(currentBarRef.current.low,  price),
            };
            seriesRef.current?.update(currentBarRef.current);
          }
          return;
        }

        // kline → candle confirmed or new candle opened
        if (!msg.data || !msg.topic?.startsWith('kline')) return;
        msg.data.forEach(k => {
          const bar = {
            time:  Math.floor(k.start / 1000),
            open:  parseFloat(k.open),
            high:  parseFloat(k.high),
            low:   parseFloat(k.low),
            close: parseFloat(k.close),
          };
          currentBarRef.current = bar;
          seriesRef.current?.update(bar);
        });
      } catch {}
    };
    return () => { ws.close(); };
  }, [pair, activeIv]);

  const MONO = "'Courier New','SF Mono',monospace";

  return (
    <div style={{
      width: '100%', maxWidth: 380,
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 12, overflow: 'hidden',
      background: '#0a0a0a', flexShrink: 0,
    }}>
      {/* Header */}
      <div style={{ padding: '12px 16px 10px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          {/* Pair tabs */}
          <div style={{ display: 'flex', gap: 4 }}>
            {PAIRS.map(p => (
              <button key={p} onClick={() => setPair(p)} style={{
                fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em',
                padding: '3px 10px', borderRadius: 6, border: '1px solid',
                borderColor: pair === p ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                background:  pair === p ? 'rgba(255,255,255,0.07)' : 'transparent',
                color:       pair === p ? '#fff' : '#555',
                cursor: 'pointer', transition: 'all 120ms',
              }}>
                {p.replace('USDT', '')}
              </button>
            ))}
          </div>
          {/* Interval tabs */}
          <div style={{ display: 'flex', gap: 3 }}>
            {INTERVALS.map(iv => (
              <button key={iv.bybit} onClick={() => setActiveIv(iv.bybit)} style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em',
                padding: '2px 8px', borderRadius: 4, border: '1px solid',
                borderColor: activeIv === iv.bybit ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.06)',
                background:  activeIv === iv.bybit ? 'rgba(255,255,255,0.07)' : 'transparent',
                color:       activeIv === iv.bybit ? '#fff' : '#555',
                cursor: 'pointer', transition: 'all 120ms',
              }}>
                {iv.label}
              </button>
            ))}
          </div>
        </div>
        {/* Price */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: '#fff' }}>
            {ticker ? `$${ticker.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
          </span>
          {ticker && (
            <span style={{ fontFamily: MONO, fontSize: 11, color: ticker.pct >= 0 ? 'rgba(34,197,94,0.85)' : 'rgba(239,68,68,0.8)' }}>
              {ticker.pct >= 0 ? '+' : ''}{ticker.pct.toFixed(2)}%
            </span>
          )}
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef} style={{ width: '100%' }} />
    </div>
  );
}
