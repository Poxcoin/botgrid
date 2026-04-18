import React, { useState } from 'react';
import NeuronReveal from '@/components/shared/NeuronReveal';
import CharReveal from '@/components/shared/CharReveal';
import useScrollReveal from '@/lib/useScrollReveal';

const ITEMS = [
  { n: '01', h: 'NEWS INTELLIGENCE', p: 'Scans 16+ crypto news feeds in real-time. AI scores every headline for market impact.' },
  { n: '02', h: 'SIGNAL GENERATION',  p: 'Produces LONG / SHORT signals with confidence scores. Filters noise using volume, funding rate, and market sentiment.' },
  { n: '03', h: 'RISK MANAGEMENT',    p: 'Each signal includes built-in TP/SL levels. Daily loss limits protect your capital automatically.' },
];

function FeatureCard({ it, i, sectionVisible }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: '2.5rem',
        borderRight: i < ITEMS.length - 1 ? '1px solid var(--hero-border)' : 'none',
        borderTop: '1px solid var(--hero-border)',
        background: hov ? 'var(--site-fg)' : 'var(--site-bg-glass)',
        backdropFilter: 'blur(3px)',
        color: hov ? 'var(--site-bg)' : 'var(--site-fg)',
        transition: 'background 250ms ease, color 250ms ease, opacity 600ms ease, transform 600ms ease',
        opacity: sectionVisible ? 1 : 0,
        transform: sectionVisible ? 'translateY(0)' : 'translateY(28px)',
        transitionDelay: `${i * 120}ms`,
      }}
    >
      <div className="flex items-start justify-between mb-10">
        <NeuronReveal delay={i * 120 + 200} tag="span">
          <span className="font-mono text-[11px] tracking-[0.25em] opacity-60"
            style={{ border: '1px solid rgba(128,128,128,0.3)', padding: '3px 10px' }}>
            {it.n}
          </span>
        </NeuronReveal>
        <span className="font-mono text-[11px] opacity-40">◊</span>
      </div>
      <NeuronReveal delay={i * 120 + 80} tag="div">
        <div className="font-black text-[56px] md:text-[72px] leading-none tracking-tighter mb-8"
          style={{ color: hov ? '#0047FF' : 'inherit', transition: 'color 250ms' }}>
          {it.n}
        </div>
      </NeuronReveal>
      <div className="mb-4">
        <CharReveal text={it.h} delay={i * 120 + 160} charDelay={30} tag="h3" className="font-black text-xl md:text-2xl tracking-tight" />
      </div>
      <div>
        <CharReveal text={it.p} delay={i * 120 + 300} charDelay={12} tag="p" className="text-[15px] leading-relaxed opacity-75" />
      </div>
    </div>
  );
}

export default function Features() {
  const [ref, visible] = useScrollReveal(0.1);

  return (
    <section ref={ref} style={{ background: 'transparent', borderBottom: '1px solid var(--hero-border)', color: 'var(--site-fg)' }}>
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-24 md:py-32">
        <div className="flex items-end justify-between mb-16 md:mb-24">
          <h2 className="font-black tracking-[-0.04em] leading-[0.9] text-5xl md:text-7xl" style={{ color: 'var(--site-fg)' }}>
            <CharReveal text="What it" delay={100} charDelay={55} tag="span" /><br/>
            <CharReveal text="does." delay={550} charDelay={80} tag="span" />
          </h2>
          <NeuronReveal delay={100} tag="div" className="hidden md:block font-mono text-[11px] tracking-[0.25em] uppercase"
            style={{ color: 'var(--hero-muted)' }}>
            <span style={{ border: '1px solid rgba(128,128,128,0.3)', padding: '3px 10px', animation: visible ? 'labelPulse 4s ease-in-out infinite' : 'none' }}>
              [ 003 · CORE ]
            </span>
          </NeuronReveal>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3">
          {ITEMS.map((it, i) => <FeatureCard key={it.n} it={it} i={i} sectionVisible={visible} />)}
        </div>
      </div>
    </section>
  );
}
