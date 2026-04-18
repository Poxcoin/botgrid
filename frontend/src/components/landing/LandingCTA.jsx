import React from 'react';
import { Link } from 'react-router-dom';
import NeuronReveal from '@/components/shared/NeuronReveal';
import CharReveal from '@/components/shared/CharReveal';
import useScrollReveal from '@/lib/useScrollReveal';

export default function LandingCTA() {
  const [ref, visible] = useScrollReveal(0.1);

  return (
    <section ref={ref} style={{ background: 'rgba(10,10,10,0.92)', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-24 md:py-36">
        <NeuronReveal delay={0} tag="div" className="font-mono text-[11px] tracking-[0.3em] uppercase mb-10" style={{ color: 'rgba(255,255,255,0.4)' }}>
          <span style={{ border: '1px solid rgba(255,255,255,0.15)', padding: '3px 10px' }}>[ 05 / ENTRY ]</span>
        </NeuronReveal>
        <h2 className="font-black tracking-[-0.05em] leading-[0.85] text-6xl md:text-[140px]">
          <CharReveal text="READY TO" delay={100} charDelay={70} tag="span" /><br/>
          <CharReveal text="START?" delay={720} charDelay={90} tag="span" />
        </h2>
        <p className="mt-10 max-w-xl text-lg leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)' }}>
          <CharReveal text="Join the waitlist or request early access. No credit card. No ceremony." delay={1200} charDelay={16} tag="span" />
        </p>

        <div className="mt-14 flex flex-col sm:flex-row gap-6">
          <NeuronReveal delay={320} tag="div">
            <Link to="/auth?mode=register" className="inline-flex items-center h-12 px-8 font-mono text-[13px] tracking-[0.2em] uppercase"
              style={{ background: '#fff', color: '#0A0A0A', border: '1px solid #fff', textDecoration: 'none', transition: 'background 200ms, color 200ms' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#0047FF'; e.currentTarget.style.borderColor = '#0047FF'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.borderColor = '#fff'; e.currentTarget.style.color = '#0A0A0A'; }}>
              Create Account
            </Link>
          </NeuronReveal>
          <NeuronReveal delay={400} tag="div">
            <Link to="/auth?mode=login" className="inline-flex items-center h-12 px-8 font-mono text-[13px] tracking-[0.2em] uppercase"
              style={{ background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', textDecoration: 'none', transition: 'border-color 200ms' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }}>
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
