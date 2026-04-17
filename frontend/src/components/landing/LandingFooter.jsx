import React from 'react';
import { Link } from 'react-router-dom';
import NeuronReveal from '@/components/shared/NeuronReveal';

export default function LandingFooter() {
  return (
    <footer style={{ background: 'var(--site-bg-glass)', borderTop: '1px solid var(--hero-border)', color: 'var(--site-fg)' }}>
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between flex-wrap gap-3">
        <NeuronReveal delay={0} tag="div" className="font-mono text-[11px] tracking-[0.25em] uppercase" style={{ color: 'var(--hero-muted)' }}>
          Kado © 2026
        </NeuronReveal>
        <div className="flex items-center gap-6 font-mono text-[11px] tracking-[0.25em] uppercase">
          <NeuronReveal delay={80} tag="span">
            <a href="#" style={{ color: 'var(--hero-muted)', textDecoration: 'none', transition: 'color 200ms' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#0047FF'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--hero-muted)'; }}>Docs</a>
          </NeuronReveal>
          <NeuronReveal delay={140} tag="span">
            <Link to="/auth?mode=login" style={{ color: 'var(--hero-muted)', textDecoration: 'none', transition: 'color 200ms' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#0047FF'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--hero-muted)'; }}>Login</Link>
          </NeuronReveal>
          <NeuronReveal delay={200} tag="span">
            <span className="flex items-center gap-2" style={{ color: 'var(--hero-muted)' }}>
              <span className="w-1.5 h-1.5 bg-kado-blue animate-blink" /> Status
            </span>
          </NeuronReveal>
        </div>
      </div>
    </footer>
  );
}
