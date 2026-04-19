import React, { useState, useRef, useEffect } from 'react';
import NeuronReveal from '@/components/shared/NeuronReveal';
import useScrollReveal from '@/lib/useScrollReveal';

const STEPS = [
  { n: '01', t: 'Scan',     d: 'Bot scans news every 30 seconds across 16+ feeds.' },
  { n: '02', t: 'Score',    d: 'Claude AI scores sentiment on a -10 to +10 scale.' },
  { n: '03', t: 'Validate', d: 'Market metrics validated — volume, funding, trend direction.' },
  { n: '04', t: 'Signal',   d: 'Signal generated only when composite score ≥ 8.' },
  { n: '05', t: 'Execute',  d: 'Trade executed on Bybit with TP and SL attached.' },
];

function AxonLine({ visible }) {
  return (
    <div className="hidden md:block" style={{ position: 'relative', height: 4, margin: '0 0 40px 0', overflow: 'hidden' }}>
      {/* base line */}
      <div style={{ position: 'absolute', top: 1, left: 0, right: 0, height: 1, background: 'var(--hero-border)' }} />
      {/* fill line */}
      <div style={{
        position: 'absolute', top: 1, left: 0, height: 1,
        background: '#0047FF', opacity: 0.6,
        width: visible ? '100%' : '0%',
        transition: 'width 900ms ease 200ms',
      }} />
      {/* running impulse dots */}
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          position: 'absolute',
          top: -2,
          width: 6, height: 6,
          borderRadius: '50%',
          background: '#0047FF',
          opacity: visible ? 0.85 : 0,
          animation: visible ? `axonDot 2.5s linear ${i * 0.85}s infinite` : 'none',
        }} />
      ))}
    </div>
  );
}

export default function HowItWorks() {
  const [ref, visible] = useScrollReveal(0.08);
  const [hov, setHov] = useState(-1);
  const stepRefs = useRef([]);
  const firedSteps = useRef(new Set());

  useEffect(() => {
    if (!visible) return;
    STEPS.forEach((_, i) => {
      setTimeout(() => {
        if (firedSteps.current.has(i)) return;
        firedSteps.current.add(i);
        const el = stepRefs.current[i];
        if (el) {
          const rect = el.getBoundingClientRect();
          window.__neuronPulse?.(rect.left + rect.width / 2, rect.top + rect.height / 2, 0.4);
        }
      }, i * 80 + 300);
    });
  }, [visible]);

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
              {[['How', 'it'], ['works.']].map((line, li) => (
                <span key={li} style={{ display: 'block' }}>
                  {line.map((word, wi) => (
                    <span key={wi} style={{ display: 'inline-block', marginRight: wi < line.length - 1 ? '0.25em' : 0 }}>
                      {word.split('').map((char, ci) => (
                        <span key={ci} style={{
                          display: 'inline-block',
                          opacity: visible ? 1 : 0,
                          transform: visible ? 'translateY(0)' : 'translateY(60%)',
                          transition: `opacity 400ms ease ${(li * 10 + wi * 3 + ci) * 40 + 80}ms, transform 400ms ease ${(li * 10 + wi * 3 + ci) * 40 + 80}ms`,
                          willChange: 'opacity, transform',
                        }}>{char}</span>
                      ))}
                    </span>
                  ))}
                </span>
              ))}
            </h2>
          </div>
          <div className="hidden md:block font-mono text-[11px] tracking-[0.25em] uppercase" style={{ color: 'var(--hero-muted)' }}>
            05 STEPS · EVERY 30s
          </div>
        </div>

        <AxonLine visible={visible} />

        <div ref={ref} style={{ borderTop: '1px solid var(--hero-border)' }}>
          {STEPS.map((s, i) => (
            <div
              key={s.n}
              ref={el => stepRefs.current[i] = el}
              onMouseEnter={() => setHov(i)}
              onMouseLeave={() => setHov(-1)}
              className="grid grid-cols-12"
              style={{
                borderBottom: '1px solid var(--hero-border)',
                background: hov === i ? 'var(--site-fg)' : i % 2 === 1 ? 'rgba(128,128,128,0.03)' : 'transparent',
                color: hov === i ? 'var(--site-bg)' : 'var(--site-fg)',
                transition: 'background 200ms ease, color 200ms ease, opacity 500ms ease, transform 500ms ease',
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateX(0)' : 'translateX(-30px)',
                transitionDelay: `${i * 80}ms`,
                willChange: 'opacity, transform',
              }}
            >
              <div className="col-span-2 md:col-span-1 p-6 md:p-8 font-mono text-[11px] tracking-[0.25em] flex items-start opacity-60"
                style={{ borderRight: '1px solid var(--hero-border)' }}>
                <NeuronReveal delay={i * 80} tag="span">
                  <span style={{
                    display: 'block',
                    fontSize: visible ? '11px' : '22px',
                    opacity: visible ? 0.6 : 0,
                    transform: visible ? 'scale(1)' : 'scale(2)',
                    transition: `font-size 400ms ease ${i * 80}ms, opacity 400ms ease ${i * 80}ms, transform 400ms ease ${i * 80}ms`,
                  }}>{s.n}</span>
                </NeuronReveal>
              </div>
              <div className="col-span-10 md:col-span-4 p-6 md:p-8" style={{ borderRight: '1px solid var(--hero-border)' }}>
                <NeuronReveal delay={i * 80 + 100} tag="h3"
                  className="font-black text-3xl md:text-5xl tracking-tight leading-[0.9]"
                  style={{ color: hov === i ? '#0047FF' : 'inherit', transition: 'color 200ms' }}>
                  {s.t}.
                </NeuronReveal>
              </div>
              <div className="col-span-12 md:col-span-7 p-6 md:p-8 flex items-center">
                <NeuronReveal delay={i * 80 + 180} tag="p" className="text-base md:text-lg opacity-80 leading-relaxed">
                  {s.d}
                </NeuronReveal>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
