import React, { useState, useRef, useEffect } from 'react';
import NeuronReveal from '@/components/shared/NeuronReveal';
import useScrollReveal from '@/lib/useScrollReveal';

const ITEMS = [
  { n: '01', h: 'NEWS INTELLIGENCE', p: 'Scans 16+ crypto news feeds in real-time. AI scores every headline for market impact.' },
  { n: '02', h: 'SIGNAL GENERATION',  p: 'Produces LONG / SHORT signals with confidence scores. Filters noise using volume, funding rate, and market sentiment.' },
  { n: '03', h: 'RISK MANAGEMENT',    p: 'Each signal includes built-in TP/SL levels. Daily loss limits protect your capital automatically.' },
];

function FeatureCard({ it, i, sectionVisible }) {
  const [hov, setHov] = useState(false);
  const cardRef = useRef(null);
  const firedRef = useRef(false);

  useEffect(() => {
    if (sectionVisible && !firedRef.current && cardRef.current) {
      firedRef.current = true;
      setTimeout(() => {
        const rect = cardRef.current?.getBoundingClientRect();
        if (rect) window.__neuronPulse?.(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.5);
      }, i * 150 + 200);
    }
  }, [sectionVisible]);

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
        padding: '2.5rem',
        borderRight: i < ITEMS.length - 1 ? '1px solid var(--hero-border)' : 'none',
        borderTop: '1px solid var(--hero-border)',
        background: hov ? 'var(--site-fg)' : 'var(--site-bg-glass)',
        backdropFilter: 'blur(3px)',
        color: hov ? 'var(--site-bg)' : 'var(--site-fg)',
        transition: 'background 250ms ease, color 250ms ease, opacity 600ms ease, transform 600ms ease',
        opacity: sectionVisible ? 1 : 0,
        transform: sectionVisible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(24px)',
        transitionDelay: `${i * 120}ms`,
        willChange: 'opacity, transform',
        overflow: 'hidden',
      }}
    >
      {hov && (
        <span style={{
          position: 'absolute', inset: 0, pointerEvents: 'none',
          boxShadow: 'inset 0 0 0 1.5px #0047FF',
          animation: 'electricBorder 600ms ease forwards',
        }} />
      )}

      <div className="flex items-start justify-between mb-10">
        <NeuronReveal delay={i * 120 + 200} tag="span">
          <span className="font-mono text-[11px] tracking-[0.25em] opacity-60"
            style={{ border: '1px solid rgba(128,128,128,0.3)', padding: '3px 10px' }}>
            {it.n}
          </span>
        </NeuronReveal>
        <span
          className="font-mono text-[11px] opacity-40"
          style={{ transition: 'transform 400ms ease', transform: hov ? 'rotate(360deg)' : 'rotate(0deg)' }}>
          ◊
        </span>
      </div>

      <NeuronReveal delay={i * 120 + 80} tag="div">
        <div className="font-black text-[56px] md:text-[72px] leading-none tracking-tighter mb-8"
          style={{ color: hov ? '#0047FF' : 'inherit', transition: 'color 250ms' }}>
          {it.n}
        </div>
      </NeuronReveal>

      <NeuronReveal delay={i * 120 + 160} tag="div">
        <h3 className="font-black text-xl md:text-2xl tracking-tight mb-4">{it.h}</h3>
      </NeuronReveal>

      <NeuronReveal delay={i * 120 + 240} tag="div">
        <p className="text-[15px] leading-relaxed opacity-75">{it.p}</p>
      </NeuronReveal>
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
            {['What', 'it', 'does.'].map((word, wi) => (
              <span key={wi} style={{ display: 'inline-block', marginRight: wi < 2 ? '0.25em' : 0 }}>
                {word.split('').map((char, ci) => (
                  <span key={ci} style={{
                    display: 'inline-block',
                    opacity: visible ? 1 : 0,
                    transform: visible ? 'translateY(0)' : 'translateY(100%)',
                    transition: `opacity 400ms ease ${(wi * 3 + ci) * 40}ms, transform 400ms ease ${(wi * 3 + ci) * 40}ms`,
                    willChange: 'opacity, transform',
                  }}>{char}</span>
                ))}
                {wi === 1 && <br />}
              </span>
            ))}
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
