import React, { useRef, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import NeuronReveal from '@/components/shared/NeuronReveal';

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
    <section ref={ref} style={{ background: 'rgba(10,10,10,0.95)', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
      <div className="px-6 md:px-10 py-20 md:py-32">
        {/* Top: label left, counter right */}
        <div className="flex items-start justify-between mb-12">
          <span className="font-mono text-[10px] tracking-[0.3em] uppercase"
            style={{ color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.12)', padding: '3px 10px' }}>
            [ 05 / EARLY ACCESS ]
          </span>
          <span className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Limited spots
          </span>
        </div>

        {/* Title — left-aligned */}
        <h2 className="font-black leading-[0.85] tracking-[-0.05em]" style={{ fontSize: 'clamp(52px, 10vw, 130px)', letterSpacing: '-0.05em' }}>
          <span style={{ display: 'block' }}>READY TO</span>
          <span style={{ display: 'block' }}>START?</span>
        </h2>

        {/* Bottom: desc left, CTAs right */}
        <div className="mt-14 flex flex-col md:flex-row items-start md:items-end justify-between gap-10">
          <p className="max-w-md text-base leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
            Join the waitlist to get early access. No credit card required.
            Start in demo mode, switch to live when you're ready.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link to="/waitlist"
              onMouseEnter={() => setCtaHov(true)}
              onMouseLeave={() => setCtaHov(false)}
              className="inline-flex items-center h-12 px-8 font-mono text-[12px] tracking-[0.2em] uppercase"
              style={{
                background: ctaHov ? 'transparent' : '#fff',
                color: ctaHov ? '#fff' : '#0A0A0A',
                border: '1px solid #fff',
                textDecoration: 'none',
                transition: 'background 200ms, color 200ms',
              }}>
              Join Waitlist →
            </Link>
            <Link to="/auth?mode=login"
              className="inline-flex items-center h-12 px-8 font-mono text-[12px] tracking-[0.2em] uppercase"
              style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', textDecoration: 'none' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}>
              Login
            </Link>
          </div>
        </div>

        <div className="mt-16 pt-6 flex flex-wrap justify-between font-mono text-[9px] tracking-[0.3em] uppercase gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.25)' }}>
          {['// Intelligence feeds', '// Signals execute', '// Risk is managed', '// 24/7 uptime'].map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
