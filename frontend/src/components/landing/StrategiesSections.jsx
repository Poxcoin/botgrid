import React from 'react';
import { Link } from 'react-router-dom';
import useScrollReveal from '@/lib/useScrollReveal';

// Return ranges are conservative early-data estimates, NOT promises.
// Updated 2026-05-22 after TP/SL fix inflection (2026-05-19); historical numbers
// from before fix are not representative of current system.
const DATA = [
  {
    id: 'strat-conservative',
    label: 'Conservative',
    num: '01',
    color: 'var(--neon-green)',
    bots: ['Grid Bot'],
    est: '1–5%',
    risk: 20,
    desc: 'Grid bot runs 24/7 across SOL, BTC and ETH. Earns on price oscillation in any direction. No directional prediction, no news reading. Currently frozen during EMA downtrend; will resume when macro recovers.',
    pros: ['Zero directional risk', 'Works in sideways market', 'Consistent yield when active', 'Low drawdown'],
    cons: ['Frozen during current downtrend', 'Lower upside vs. event-driven bots', 'Requires adequate capital per level'],
    params: [
      ['Active bots', 'Grid Bot'],
      ['Expected return', '1–5% / month (when active)'],
      ['Risk level', 'Low'],
      ['Capital required', '~$500 recommended'],
    ],
  },
  {
    id: 'strat-moderate',
    label: 'Moderate',
    num: '02',
    color: 'var(--neon-green)',
    bots: ['Signal Bot', 'Funding Rate'],
    est: '3–12%',
    risk: 50,
    desc: 'Signal bot processes news + smart-money + AI scoring — currently the strongest performer (71% WR on early post-fix sample). Funding rate bot captures perpetual mean-reversion at extreme funding levels. Conservative ranges; sample sizes still small.',
    pros: ['Signal bot proven on small sample', 'Two independent uncorrelated sources', 'AI filtering reduces false signals', 'Consecutive-loss cooldown auto-pauses on bad regimes'],
    cons: ['Sample sizes still small (n<30 per bot)', 'Signal bot needs news flow — quiet days = no trades', 'Funding rate trades are infrequent'],
    params: [
      ['Active bots', 'Signal Bot + Funding Rate'],
      ['Expected return', '3–12% / month (early data)'],
      ['Risk level', 'Medium'],
      ['Signal threshold', 'Score ≥ 6 / 10'],
    ],
  },
  {
    id: 'strat-aggressive',
    label: 'Aggressive',
    num: '03',
    color: 'var(--neon-green)',
    bots: ['Signal', 'Sweep', 'Order Block', 'Cascade'],
    est: 'Highly variable',
    risk: 85,
    desc: 'All bots running simultaneously. Liquidity Sweep + Order Block target structural reversals; Cascade follows liquidation momentum. Bots beyond Signal are in active tuning (post-fix data still accumulating). Expect drawdowns during regime mismatch.',
    pros: ['Maximum coverage of market regimes', 'Multiple independent edges if all converge', 'ATR-adaptive stops added 2026-05-22', 'Consecutive-loss cooldown protects against cascades'],
    cons: ['Sweep + OB + Cascade not yet validated post-fix (small n)', 'High variance — monthly results unpredictable', 'Drawdown periods expected while bots tune'],
    params: [
      ['Active bots', 'All 4 bots'],
      ['Expected return', 'Highly variable (30 days data needed)'],
      ['Risk level', 'High'],
      ['Validation gate', 'Each bot must clear 50% WR @ n≥30 by 2026-06-21'],
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
              <span style={{ color: 'var(--neon-green)', flexShrink: 0 }}>+</span>{p}
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
          <Link to="/auth?mode=register"
            className="mt-6 flex items-center justify-center h-10 font-mono text-[11px] tracking-[0.2em] uppercase transition-colors"
            style={{ background: 'var(--neon-green)', color: '#000', textDecoration: 'none', border: '1px solid var(--neon-green)', fontWeight: 700 }}
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
