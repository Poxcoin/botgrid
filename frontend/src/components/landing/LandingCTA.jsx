import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import NeuronReveal from '@/components/shared/NeuronReveal';
import NeuralText from '@/components/shared/NeuralText';
import useScrollReveal from '@/lib/useScrollReveal';

export default function LandingCTA() {
  const [ref, visible] = useScrollReveal(0.1);
  const firedRef = useRef(false);
  const [ctaHov, setCtaHov] = useState(false);

  useEffect(() => {
    if (visible && !firedRef.current && ref.current) {
      firedRef.current = true;
      const rect = ref.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      window.__neuronPulse?.(cx, cy, 2.0);
      setTimeout(() => window.__neuronPulse?.(cx, cy, 1.5), 300);
    }
  }, [visible]);

  return (
    <section ref={ref} style={{ background: 'rgba(10,10,10,0.92)', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-24 md:py-36">
        <NeuronReveal delay={0} tag="div" className="font-mono text-[11px] tracking-[0.3em] uppercase mb-10"
          style={{ color: 'rgba(255,255,255,0.4)' }}>
          <span style={{ border: '1px solid rgba(255,255,255,0.15)', padding: '3px 10px' }}>[ 05 / ENTRY ]</span>
        </NeuronReveal>

        <h2 className="font-black tracking-[-0.05em] leading-[0.85] text-6xl md:text-[140px]">
          <span style={{ display: 'block' }}>
            <NeuralText
              text="READY TO"
              fontWeight={900}
              style={{ fontSize: 'clamp(48px,10vw,140px)', letterSpacing: '-0.05em' }}
            />
          </span>
          <span style={{ display: 'block' }}>
            <NeuralText
              text="START?"
              fontWeight={900}
              style={{ fontSize: 'clamp(48px,10vw,140px)', letterSpacing: '-0.05em' }}
            />
          </span>
        </h2>

        <div style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 600ms ease 400ms, transform 600ms ease 400ms',
        }}>
          <p className="mt-10 max-w-xl text-lg leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
            Join the waitlist or request early access. No credit card. No ceremony.
          </p>
        </div>

        <div className="mt-14 flex flex-col sm:flex-row gap-6">
          <NeuronReveal delay={320} tag="div">
            <Link
              to="/auth?mode=register"
              onMouseEnter={() => setCtaHov(true)}
              onMouseLeave={() => setCtaHov(false)}
              className="inline-flex items-center h-12 px-8 font-mono text-[13px] tracking-[0.2em] uppercase"
              style={{
                background: ctaHov ? 'transparent' : '#fff',
                color: ctaHov ? '#fff' : '#0A0A0A',
                border: '1px solid #fff',
                textDecoration: 'none',
                transition: 'background 200ms, color 200ms',
                animation: 'ctaPulse 2s ease-in-out infinite',
                willChange: 'box-shadow',
              }}
            >
              Create Account
            </Link>
          </NeuronReveal>

          <NeuronReveal delay={400} tag="div">
            <Link
              to="/auth?mode=login"
              className="inline-flex items-center h-12 px-8 font-mono text-[13px] tracking-[0.2em] uppercase"
              style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', textDecoration: 'none', transition: 'border-color 200ms' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }}
            >
              See Live Signals
            </Link>
          </NeuronReveal>
        </div>

        <div className="mt-20 pt-8 flex flex-wrap justify-between font-mono text-[10px] tracking-[0.3em] uppercase gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.3)' }}>
          {['// Intelligence feeds', '// Signals execute', '// Risk is managed'].map((t, i) => (
            <NeuronReveal key={t} delay={500 + i * 80} tag="span">{t}</NeuronReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
