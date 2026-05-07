import React, { useEffect, useState } from 'react';

const SYMBOLS = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','AVAXUSDT','ARBUSDT','DOGEUSDT','INJUSDT','SUIUSDT','OPUSDT','TIAUSDT','PEPEUSDT'];

async function fetchTickers() {
  const res = await fetch('https://api.bybit.com/v5/market/tickers?category=linear');
  const json = await res.json();
  const all = json?.result?.list ?? [];
  return SYMBOLS
    .map(sym => all.find(t => t.symbol === sym))
    .filter(Boolean)
    .map(t => ({
      symbol: t.symbol.replace('USDT', ''),
      price:  parseFloat(t.lastPrice),
      pct:    parseFloat(t.price24hPcnt) * 100,
    }));
}

export default function TickerTape() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    fetchTickers().then(setItems).catch(() => {});
    const id = setInterval(() => fetchTickers().then(setItems).catch(() => {}), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!items.length) return null;

  const tape = [...items, ...items, ...items]; // triple for seamless loop at wide viewports

  return (
    <div style={{
      height: 30, overflow: 'hidden', position: 'relative',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      background: '#060606',
    }}>
      {/* fade edges */}
      <div style={{ position:'absolute',left:0,top:0,bottom:0,width:48,background:'linear-gradient(to right,#060606,transparent)',zIndex:2,pointerEvents:'none' }} />
      <div style={{ position:'absolute',right:0,top:0,bottom:0,width:48,background:'linear-gradient(to left,#060606,transparent)',zIndex:2,pointerEvents:'none' }} />

      <div style={{
        display: 'flex', alignItems: 'center', height: '100%',
        animation: `ticker-scroll ${items.length * 4}s linear infinite`,
        width: 'max-content',
      }}>
        {tape.map((item, i) => (
          <span key={i} style={{
            padding: '0 20px',
            fontFamily: "'Courier New','SF Mono',monospace",
            fontSize: 10, letterSpacing: '0.06em',
            color: 'rgba(255,255,255,0.28)',
            display: 'flex', alignItems: 'center', gap: 7,
            borderRight: '1px solid rgba(255,255,255,0.04)',
            whiteSpace: 'nowrap',
          }}>
            {item.symbol}
            <span style={{ color: item.pct >= 0 ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.7)' }}>
              {item.pct >= 0 ? '+' : ''}{item.pct.toFixed(2)}%
            </span>
          </span>
        ))}
      </div>

      <style>{`
        @keyframes ticker-scroll {
          from { transform: translateX(0); }
          to   { transform: translateX(-33.333%); }
        }
      `}</style>
    </div>
  );
}
