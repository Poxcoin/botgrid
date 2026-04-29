import React, { useState } from 'react';
import useScrollReveal from '@/lib/useScrollReveal';

const STRATEGIES = [
  {
    id: 'conservative',
    label: 'Conservative',
    bots: ['Grid Bot'],
    est: '3–8%',
    period: 'per month',
    risk: 'Low',
    color: '#22c55e',
    desc: 'Grid bot runs 24/7 on SOL, BTC, ETH. Earns on every price oscillation — up, down or sideways. No directional bets. Best for capital preservation.',
    details: [
      'SOL grid: 10 levels, $30 per level, 2× leverage',
      'BTC grid: 8 levels, $20 per level, 2× leverage',
      'ETH grid: 10 levels, $25 per level, 2× leverage',
      'Auto-range recalculation on trend break',
    ],
  },
  {
    id: 'moderate',
    label: 'Moderate',
    bots: ['Grid Bot', 'News Bot'],
    est: '10–25%',
    period: 'per month',
    risk: 'Medium',
    color: '#0047FF',
    desc: 'Grid provides the baseline yield. News bot fires on high-confidence events — whale moves, listing announcements, macro news — filtered by Claude AI.',
    details: [
      'Grid bot running continuously (see Conservative)',
      'News bot: 6 Telegram channels + announcements',
      'Claude Haiku scores each signal −10 to +10',
      'Enters only when composite score ≥ 8',
    ],
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    bots: ['Grid Bot', 'News Bot', 'Listing Sniper', 'DEX Sniper'],
    est: 'Up to 50%+',
    period: 'per month',
    risk: 'High',
    color: '#f59e0b',
    desc: 'All four bots active simultaneously. Listing sniper catches new token launches on CEX. DEX sniper enters on-chain liquidity pools before price discovery.',
    details: [
      'Listing sniper: 5× leverage, 20% TP, 7% SL',
      'DEX sniper: PancakeSwap BSC, +100% TP, −50% SL',
      'GoPlus token safety check before every DEX entry',
      'High volatility — results vary significantly',
    ],
  },
];

export default function Strategies() {
  const [ref, visible] = useScrollReveal(0.08);
  const [active, setActive] = useState('moderate');
  const strategy = STRATEGIES.find(s => s.id === active);

  return (
    <section id="strategies" ref={ref} style={{ background: 'transparent', borderBottom: '1px solid var(--hero-border)', color: 'var(--site-fg)' }}>
      {/* Header */}
      <div className="px-6 md:px-10 pt-20 pb-12 flex items-end justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--hero-muted)' }}>
            [ 02 / STRATEGIES ]
          </div>
          <h2 className="font-black tracking-[-0.04em] leading-[0.88] text-5xl md:text-7xl">
            Choose your<br />risk profile.
          </h2>
        </div>
        <div className="hidden md:flex flex-col items-end gap-1 font-mono text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--hero-muted)' }}>
          {STRATEGIES.map(s => (
            <span key={s.id} style={{ color: active === s.id ? s.color : 'var(--hero-muted)', transition: 'color 200ms' }}>{s.label}</span>
          ))}
        </div>
      </div>

      {/* Selector tabs */}
      <div className="flex" style={{ borderTop: '1px solid var(--hero-border)', borderBottom: '1px solid var(--hero-border)' }}>
        {STRATEGIES.map((s, i) => (
          <button key={s.id} onClick={() => setActive(s.id)}
            className="flex-1 py-5 font-mono text-[11px] tracking-[0.2em] uppercase transition-colors"
            style={{
              borderRight: i < STRATEGIES.length - 1 ? '1px solid var(--hero-border)' : 'none',
              background: active === s.id ? 'var(--site-fg)' : 'transparent',
              color: active === s.id ? 'var(--site-bg)' : 'var(--hero-muted)',
            }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ minHeight: 360 }}>
        {/* Left: description */}
        <div className="px-6 md:px-10 py-10" style={{ borderRight: '1px solid var(--hero-border)' }}>
          <div className="flex items-center gap-3 mb-6">
            {strategy.bots.map(b => (
              <span key={b} className="font-mono text-[9px] tracking-[0.25em] uppercase px-2 py-1"
                style={{ border: `1px solid ${strategy.color}`, color: strategy.color }}>
                {b}
              </span>
            ))}
          </div>
          <p className="text-base md:text-lg leading-relaxed mb-8" style={{ color: 'var(--hero-muted-fg)' }}>
            {strategy.desc}
          </p>
          <ul className="space-y-3">
            {strategy.details.map(d => (
              <li key={d} className="font-mono text-[12px] flex items-start gap-3" style={{ color: 'var(--hero-muted-fg)' }}>
                <span style={{ color: strategy.color, flexShrink: 0 }}>→</span>
                {d}
              </li>
            ))}
          </ul>
        </div>

        {/* Right: stats */}
        <div className="px-6 md:px-10 py-10 flex flex-col justify-between">
          <div>
            <div className="font-mono text-[10px] tracking-[0.3em] uppercase mb-3" style={{ color: 'var(--hero-muted)' }}>
              Estimated Return
            </div>
            <div className="font-black text-6xl md:text-8xl leading-none tracking-tighter" style={{ color: strategy.color }}>
              {strategy.est}
            </div>
            <div className="font-mono text-[12px] mt-2" style={{ color: 'var(--hero-muted)' }}>
              {strategy.period} · backtested estimate
            </div>
          </div>
          <div className="mt-10">
            <div className="flex items-center justify-between font-mono text-[11px] mb-2" style={{ color: 'var(--hero-muted)' }}>
              <span>Risk Level</span>
              <span style={{ color: strategy.color }}>{strategy.risk}</span>
            </div>
            <div className="h-1" style={{ background: 'var(--hero-border)' }}>
              <div className="h-full transition-all duration-500"
                style={{
                  background: strategy.color,
                  width: active === 'conservative' ? '25%' : active === 'moderate' ? '55%' : '90%',
                }} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
