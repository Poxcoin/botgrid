import React from 'react';
import { Link } from 'react-router-dom';
import useScrollReveal from '@/lib/useScrollReveal';

const DATA = [
  {
    id: 'strat-conservative',
    label: 'Conservative',
    num: '01',
    color: '#22c55e',
    bots: ['Grid Bot'],
    est: '3–8%',
    risk: 25,
    desc: 'Grid bot runs 24/7 across SOL, BTC and ETH. Earns on price oscillation in any direction. No directional prediction, no news reading. Best for capital preservation with steady yield.',
    pros: ['Zero directional risk', 'Works in sideways market', 'Consistent yield', 'Low drawdown'],
    cons: ['Lower upside vs. event-driven bots', 'Requires adequate capital per level'],
    params: [
      ['Active bots', 'Grid Bot'],
      ['Expected return', '3–8% / month'],
      ['Risk level', 'Low'],
      ['Capital required', '~$500 recommended'],
    ],
  },
  {
    id: 'strat-moderate',
    label: 'Moderate',
    num: '02',
    color: '#0047FF',
    bots: ['Grid Bot', 'News Bot'],
    est: '10–25%',
    risk: 55,
    desc: 'Grid provides the baseline yield. News bot fires on high-confidence events — whale moves, listing announcements, macro crypto news — filtered through Groq and Claude AI.',
    pros: ['Grid covers quiet periods', 'News bot captures high-impact moves', 'AI filtering reduces false signals', 'Two independent income streams'],
    cons: ['News signals can miss during low-volatility periods', 'More exposure than grid-only'],
    params: [
      ['Active bots', 'Grid Bot + News Bot'],
      ['Expected return', '10–25% / month'],
      ['Risk level', 'Medium'],
      ['Signal threshold', 'Score ≥ 8 / 10'],
    ],
  },
  {
    id: 'strat-aggressive',
    label: 'Aggressive',
    num: '03',
    color: '#f59e0b',
    bots: ['Grid Bot', 'News Bot', 'Listing Sniper', 'DEX Sniper'],
    est: '50%+',
    risk: 90,
    desc: 'All four bots running simultaneously. Listing sniper and DEX sniper target high-volatility opportunities. Maximum edge but also maximum variance — individual trade results vary widely.',
    pros: ['Highest potential upside', 'Catches CEX listings early', 'DEX entries before price discovery', 'Grid + news base always active'],
    cons: ['High variance — monthly results unpredictable', 'DEX sniper needs BNB capital', 'Listing entries can gap through SL on illiquid pairs'],
    params: [
      ['Active bots', 'All 4 bots'],
      ['Expected return', 'Up to 50%+ / month'],
      ['Risk level', 'High'],
      ['DEX capital needed', '0.1–0.2 BNB'],
    ],
  },
];

function StrategySection({ s }) {
  const [ref, visible] = useScrollReveal(0.06);
  return (
    <section id={s.id} ref={ref} style={{ borderBottom: '1px solid var(--hero-border)', color: 'var(--site-fg)' }}>
      <div className="px-6 md:px-12 pt-16 pb-6">
        <div className="flex items-start justify-between mb-2">
          <span className="font-mono text-[9px] tracking-[0.25em] uppercase px-2 py-0.5"
            style={{ border: `1px solid ${s.color}`, color: s.color }}>
            {s.num} / {s.label}
          </span>
          <div className="flex gap-2">
            {s.bots.map(b => (
              <span key={b} className="font-mono text-[9px] tracking-[0.15em] uppercase px-2 py-0.5"
                style={{ border: '1px solid var(--hero-border)', color: 'var(--hero-muted)' }}>{b}</span>
            ))}
          </div>
        </div>
        <h2 className="font-black text-4xl md:text-6xl tracking-[-0.04em] leading-[0.88] mt-6 mb-4">{s.label}</h2>
        <p className="text-base md:text-lg leading-relaxed max-w-xl" style={{ color: 'var(--hero-muted-fg)' }}>{s.desc}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3" style={{
        borderTop: '1px solid var(--hero-border)',
        opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(16px)',
        transition: 'opacity 500ms, transform 500ms',
      }}>
        {/* Return */}
        <div className="px-6 md:px-12 py-8" style={{ borderRight: '1px solid var(--hero-border)' }}>
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-3" style={{ color: 'var(--hero-muted)' }}>Est. Return</div>
          <div className="font-black text-5xl md:text-6xl leading-none tracking-tighter mb-2" style={{ color: s.color }}>{s.est}</div>
          <div className="font-mono text-[11px]" style={{ color: 'var(--hero-muted)' }}>per month · estimate</div>
          <div className="mt-6">
            <div className="flex justify-between font-mono text-[10px] mb-2" style={{ color: 'var(--hero-muted)' }}>
              <span>Risk</span><span style={{ color: s.color }}>{s.risk}%</span>
            </div>
            <div className="h-1" style={{ background: 'var(--hero-border)' }}>
              <div className="h-full" style={{ width: `${s.risk}%`, background: s.color, transition: 'width 800ms ease' }} />
            </div>
          </div>
        </div>

        {/* Pros/Cons */}
        <div className="px-6 md:px-12 py-8" style={{ borderRight: '1px solid var(--hero-border)' }}>
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-3" style={{ color: 'var(--hero-muted)' }}>Pros</div>
          {s.pros.map(p => (
            <div key={p} className="flex gap-2 py-1.5 font-mono text-[12px]" style={{ color: 'var(--hero-muted-fg)' }}>
              <span style={{ color: '#22c55e', flexShrink: 0 }}>+</span>{p}
            </div>
          ))}
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mt-4 mb-3" style={{ color: 'var(--hero-muted)' }}>Cons</div>
          {s.cons.map(c => (
            <div key={c} className="flex gap-2 py-1.5 font-mono text-[12px]" style={{ color: 'var(--hero-muted-fg)' }}>
              <span style={{ color: '#ef4444', flexShrink: 0 }}>−</span>{c}
            </div>
          ))}
        </div>

        {/* Params */}
        <div className="px-6 md:px-12 py-8">
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase mb-3" style={{ color: 'var(--hero-muted)' }}>Details</div>
          {s.params.map(([k, v]) => (
            <div key={k} className="flex justify-between items-start py-3 font-mono text-[12px]"
              style={{ borderBottom: '1px solid var(--hero-border)' }}>
              <span style={{ color: 'var(--hero-muted)' }}>{k}</span>
              <span style={{ textAlign: 'right', maxWidth: '55%' }}>{v}</span>
            </div>
          ))}
          <Link to="/waitlist"
            className="mt-6 flex items-center justify-center h-10 font-mono text-[11px] tracking-[0.2em] uppercase transition-colors"
            style={{ background: s.color, color: '#fff', textDecoration: 'none', border: `1px solid ${s.color}` }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
            Start with {s.label} →
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function StrategiesSections() {
  return (
    <div id="strategies">
      {DATA.map(s => <StrategySection key={s.id} s={s} />)}
    </div>
  );
}
