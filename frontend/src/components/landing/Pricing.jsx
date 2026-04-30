import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useScrollReveal from '@/lib/useScrollReveal';

const PLANS = [
  {
    id: 'free',
    label: 'Free',
    price: '$0',
    sub: 'forever',
    desc: 'Explore the platform. View live signals without trading.',
    features: [
      'Dashboard access',
      'Live signal feed (read-only)',
      'Bot analyzer & backtester',
      'System logs',
    ],
    missing: ['Automated trading', 'Listing sniper', 'DEX sniper', 'Priority support'],
    cta: 'Join Waitlist',
    href: '/waitlist',
  },
  {
    id: 'basic',
    label: 'Basic',
    price: '$29',
    sub: 'per month',
    desc: 'News bot + grid bot on your Bybit account. Demo mode available.',
    features: [
      'Everything in Free',
      'News Intelligence Bot',
      'Grid Trading Bot (SOL · BTC · ETH)',
      'Demo + live trading modes',
      'Bybit API key integration',
    ],
    missing: ['Listing sniper', 'DEX sniper'],
    cta: 'Join Waitlist',
    href: '/waitlist',
    highlight: false,
  },
  {
    id: 'pro',
    label: 'Pro',
    price: '$79',
    sub: 'per month',
    desc: 'All four bots active. Maximum edge, full automation.',
    features: [
      'Everything in Basic',
      'Listing Sniper Bot',
      'DEX Sniper (BSC/PancakeSwap)',
      'Smart wallet tracker',
      'Funding rate strategy',
      'Priority support',
    ],
    missing: [],
    cta: 'Join Waitlist',
    href: '/waitlist',
    highlight: true,
  },
];

export default function Pricing() {
  const [ref, visible] = useScrollReveal(0.08);

  return (
    <section id="pricing" ref={ref} style={{ background: 'transparent', borderBottom: '1px solid var(--hero-border)', color: 'var(--site-fg)' }}>
      {/* Header */}
      <div className="px-6 md:px-10 pt-20 pb-12 flex items-end justify-between">
        <div>
          <div className="font-mono text-[10px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--hero-muted)' }}>
            [ 04 / PRICING ]
          </div>
          <h2 className="font-black tracking-[-0.04em] leading-[0.88] text-5xl md:text-7xl">
            Simple,<br />transparent.
          </h2>
        </div>
        <div className="hidden md:block font-mono text-[11px] uppercase text-right" style={{ color: 'var(--hero-muted)' }}>
          <div>No hidden fees.</div>
          <div>Cancel anytime.</div>
        </div>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3" style={{ borderTop: '1px solid var(--hero-border)' }}>
        {PLANS.map((plan, i) => (
          <div key={plan.id}
            style={{
              borderRight: i < PLANS.length - 1 ? '1px solid var(--hero-border)' : 'none',
              background: plan.highlight ? 'var(--site-fg)' : 'transparent',
              color: plan.highlight ? 'var(--site-bg)' : 'var(--site-fg)',
              opacity: visible ? 1 : 0,
              transform: visible ? 'translateY(0)' : 'translateY(20px)',
              transition: `opacity 500ms ease ${i * 100}ms, transform 500ms ease ${i * 100}ms`,
              display: 'flex', flexDirection: 'column',
            }}
          >
            <div className="px-8 pt-8 pb-6" style={{ borderBottom: `1px solid ${plan.highlight ? 'rgba(255,255,255,0.15)' : 'var(--hero-border)'}` }}>
              <div className="flex items-start justify-between mb-6">
                <span className="font-mono text-[10px] tracking-[0.3em] uppercase" style={{ opacity: 0.5 }}>
                  {plan.label}
                </span>
                {plan.highlight && (
                  <span className="font-mono text-[9px] tracking-[0.2em] uppercase px-2 py-0.5" style={{ background: 'var(--neon-green)', color: '#fff' }}>
                    Popular
                  </span>
                )}
              </div>
              <div className="font-black text-6xl leading-none tracking-tighter mb-1">{plan.price}</div>
              <div className="font-mono text-[11px]" style={{ opacity: 0.5 }}>{plan.sub}</div>
              <p className="mt-4 text-[14px] leading-relaxed" style={{ opacity: 0.7 }}>{plan.desc}</p>
            </div>

            <div className="px-8 py-6 flex-1">
              <ul className="space-y-2 mb-6">
                {plan.features.map(f => (
                  <li key={f} className="font-mono text-[12px] flex items-start gap-2">
                    <span style={{ color: 'var(--neon-green)', flexShrink: 0 }}>✓</span>
                    {f}
                  </li>
                ))}
                {plan.missing.map(f => (
                  <li key={f} className="font-mono text-[12px] flex items-start gap-2" style={{ opacity: 0.35 }}>
                    <span style={{ flexShrink: 0 }}>—</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="px-8 pb-8">
              <Link to={plan.href}
                className="block w-full h-11 flex items-center justify-center font-mono text-[11px] tracking-[0.2em] uppercase transition-colors"
                style={{
                  background: plan.highlight ? 'var(--neon-green)' : 'transparent',
                  color: plan.highlight ? '#000' : 'var(--site-fg)',
                  border: `1px solid ${plan.highlight ? 'var(--neon-green)' : 'var(--hero-border)'}`,
                  textDecoration: 'none',
                }}
                onMouseEnter={e => {
                  if (!plan.highlight) { e.currentTarget.style.background = 'var(--site-fg)'; e.currentTarget.style.color = 'var(--site-bg)'; e.currentTarget.style.borderColor = 'var(--site-fg)'; }
                  else { e.currentTarget.style.background = 'rgba(255,255,255,0.85)'; }
                }}
                onMouseLeave={e => {
                  if (!plan.highlight) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--site-fg)'; e.currentTarget.style.borderColor = 'var(--hero-border)'; }
                  else { e.currentTarget.style.background = 'var(--neon-green)'; }
                }}
              >
                {plan.cta} →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
