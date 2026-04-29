import React, { useState, useRef, useEffect } from 'react';
import NeuronReveal from '@/components/shared/NeuronReveal';
import useScrollReveal from '@/lib/useScrollReveal';

const ITEMS = [
  {
    n: '01', tag: 'NEWS BOT', h: 'News Intelligence',
    p: 'Monitors 6 Telegram channels + Binance/Bybit announcements in real-time. Groq LLaMA pre-filters noise, Claude Haiku scores market impact. Executes within seconds of the signal.',
    params: [['BTC/ETH', '2× · 5% TP · 2% SL'], ['Altcoins', '3× · 10% TP · 4% SL'], ['Scan rate', '30 sec']],
  },
  {
    n: '02', tag: 'GRID BOT', h: 'Grid Trading',
    p: 'Runs three parallel grids on SOL, BTC and ETH simultaneously. Buys low, sells high on every grid level — earns on sideways and trending markets alike without prediction.',
    params: [['SOL', '10 levels · $30/level'], ['BTC', '8 levels · $20/level'], ['ETH', '10 levels · $25/level']],
  },
  {
    n: '03', tag: 'LISTING BOT', h: 'Listing Sniper',
    p: 'Detects new token listings on Binance and Bybit announcements the moment they are published. Enters with high leverage before the pump peak.',
    params: [['Leverage', '5×'], ['Take profit', '20%'], ['Stop loss', '7%']],
  },
  {
    n: '04', tag: 'DEX SNIPER', h: 'DEX / On-Chain',
    p: 'Hunts new liquidity pools on PancakeSwap (BSC). Checks token safety via GoPlus API before every entry. Catches early launches before CEX discovery.',
    params: [['Chain', 'BSC / BEP-20'], ['Take profit', '+100%'], ['Safety', 'GoPlus check']],
  },
];

function FeatureCard({ it, i, sectionVisible }) {
  const [hov, setHov] = useState(false);

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
        padding: '2rem',
        borderRight: i < ITEMS.length - 1 ? '1px solid var(--hero-border)' : 'none',
        borderTop: '1px solid var(--hero-border)',
        background: hov ? 'var(--site-fg)' : 'transparent',
        color: hov ? 'var(--site-bg)' : 'var(--site-fg)',
        transition: 'background 220ms, color 220ms, opacity 500ms, transform 500ms',
        opacity: sectionVisible ? 1 : 0,
        transform: sectionVisible ? 'translateY(0)' : 'translateY(24px)',
        transitionDelay: `${i * 90}ms`,
      }}
    >
      {/* Top: number + tag */}
      <div className="flex items-center justify-between mb-8">
        <span className="font-mono text-[10px] tracking-[0.3em] uppercase opacity-50"
          style={{ border: '1px solid rgba(128,128,128,0.3)', padding: '2px 8px' }}>
          {it.tag}
        </span>
        <span className="font-black text-5xl leading-none tracking-tighter"
          style={{ color: hov ? '#0047FF' : 'rgba(128,128,128,0.2)', transition: 'color 220ms' }}>
          {it.n}
        </span>
      </div>

      {/* Title */}
      <h3 className="font-black text-2xl md:text-3xl tracking-tight leading-tight mb-4">{it.h}</h3>

      {/* Description */}
      <p className="text-[14px] leading-relaxed mb-6" style={{ opacity: 0.7 }}>{it.p}</p>

      {/* Params table */}
      <div className="space-y-1 pt-4" style={{ borderTop: `1px solid ${hov ? 'rgba(255,255,255,0.2)' : 'var(--hero-border)'}` }}>
        {it.params.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between font-mono text-[11px]">
            <span style={{ opacity: 0.5 }}>{k}</span>
            <span style={{ color: hov ? '#7dd3fc' : '#0047FF' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Features() {
  const [ref, visible] = useScrollReveal(0.08);

  return (
    <section id="bots" ref={ref} style={{ background: 'transparent', borderBottom: '1px solid var(--hero-border)', color: 'var(--site-fg)' }}>
      {/* Section header — left + right corners */}
      <div className="px-6 md:px-10 pt-20 pb-12 flex items-end justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--hero-muted)' }}>
            [ 01 / BOTS ]
          </div>
          <h2 className="font-black tracking-[-0.04em] leading-[0.88] text-5xl md:text-7xl">
            Four bots.<br />One system.
          </h2>
        </div>
        <div className="hidden md:block text-right font-mono text-[11px] uppercase" style={{ color: 'var(--hero-muted)' }}>
          <div>News · Grid</div>
          <div>Listing · DEX</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4" style={{ borderTop: '1px solid var(--hero-border)' }}>
        {ITEMS.map((it, i) => <FeatureCard key={it.n} it={it} i={i} sectionVisible={visible} />)}
      </div>
    </section>
  );
}
