import React, { useState } from 'react';
import NeuronReveal from '@/components/shared/NeuronReveal';
import CharReveal from '@/components/shared/CharReveal';
import useScrollReveal from '@/lib/useScrollReveal';

const STEPS = [
  { n: '01', t: 'Scan',     d: 'Bot scans news every 30 seconds across 16+ feeds.' },
  { n: '02', t: 'Score',    d: 'Claude AI scores sentiment on a -10 to +10 scale.' },
  { n: '03', t: 'Validate', d: 'Market metrics validated — volume, funding, trend direction.' },
  { n: '04', t: 'Signal',   d: 'Signal generated only when composite score ≥ 8.' },
  { n: '05', t: 'Execute',  d: 'Trade executed on Bybit with TP and SL attached.' },
];

export default function HowItWorks() {
  const [ref, visible] = useScrollReveal(0.08);
  const [hov, setHov] = useState(-1);

  return (
    <section id="how" style={{ background: 'transparent', borderBottom: '1px solid var(--hero-border)', color: 'var(--site-fg)' }}>
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-24 md:py-32">
        <div className="flex items-end justify-between mb-16 md:mb-20">
          <div>
            <NeuronReveal delay={0} tag="div" className="font-mono text-[11px] tracking-[0.3em] mb-4 uppercase" style={{ color: 'var(--hero-muted)' }}>
              <span style={{ border: '1px solid rgba(128,128,128,0.3)', padding: '3px 10px', animation: visible ? 'labelPulse 4s ease-in-out 0.5s infinite' : 'none' }}>
                [ PROCESS ]
              </span>
            </NeuronReveal>
            <h2 className="font-black tracking-[-0.04em] leading-[0.9] text-5xl md:text-7xl" style={{ color: 'var(--site-fg)' }}>
              <CharReveal text="How it" delay={100} charDelay={60} tag="span" /><br/>
              <CharReveal text="works." delay={560} charDelay={80} tag="span" />
            </h2>
          </div>
          <div className="hidden md:block font-mono text-[11px] tracking-[0.25em] uppercase" style={{ color: 'var(--hero-muted)' }}>
            05 STEPS · EVERY 30s
          </div>
        </div>

        <div ref={ref} style={{ borderTop: '1px solid var(--hero-border)' }}>
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              onMouseEnter={() => setHov(i)}
              onMouseLeave={() => setHov(-1)}
              className="grid grid-cols-12"
              style={{
                borderBottom: '1px solid var(--hero-border)',
                background: hov === i ? 'var(--site-fg)' : i % 2 === 1 ? 'rgba(128,128,128,0.03)' : 'transparent',
                color: hov === i ? 'var(--site-bg)' : 'var(--site-fg)',
                transition: 'background 200ms ease, color 200ms ease, opacity 500ms ease, transform 500ms ease',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateX(0)' : 'translateX(-24px)',
                transitionDelay: `${i * 80}ms`,
              }}
            >
              <div className="col-span-2 md:col-span-1 p-6 md:p-8 font-mono text-[11px] tracking-[0.25em] flex items-start opacity-60"
                style={{ borderRight: '1px solid var(--hero-border)' }}>
                <NeuronReveal delay={i * 80} tag="span">{s.n}</NeuronReveal>
              </div>
              <div className="col-span-10 md:col-span-4 p-6 md:p-8" style={{ borderRight: '1px solid var(--hero-border)' }}>
                <CharReveal text={s.t + '.'} delay={i * 80 + 100} charDelay={60} tag="h3"
                  className="font-black text-3xl md:text-5xl tracking-tight leading-[0.9]"
                  style={{ color: hov === i ? '#0047FF' : 'inherit', transition: 'color 200ms' }} />
              </div>
              <div className="col-span-12 md:col-span-7 p-6 md:p-8 flex items-center">
                <CharReveal text={s.d} delay={i * 80 + 200} charDelay={14} tag="p"
                  className="text-base md:text-lg opacity-80 leading-relaxed" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
