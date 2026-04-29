import React, { useEffect } from 'react';
import LandingHeader from '@/components/landing/LandingHeader';
import Pricing from '@/components/landing/Pricing';
import LandingFooter from '@/components/landing/LandingFooter';

function PageHero() {
  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '4rem 0 3rem' }}>
      <div className="px-6 md:px-10 flex items-end justify-between">
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>
            [ KADO / PRICING ]
          </div>
          <h1 className="font-black tracking-[-0.05em] leading-[0.85]" style={{ fontSize: 'clamp(52px, 10vw, 120px)', color: 'var(--fg)' }}>
            Simple,<br />
            <span style={{ color: 'var(--neon-gold)', textShadow: '0 0 60px rgba(255,217,61,0.4)' }}>transparent.</span>
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.8, color: 'var(--muted-fg)', maxWidth: 520, marginTop: 20 }}>
            No hidden fees. No lock-in contracts. Start free, upgrade when you are ready to deploy real capital with the full bot suite.
          </p>
        </div>
        <div className="hidden md:block" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'right' }}>
          <div>3 PLANS</div>
          <div style={{ marginTop: 6 }}>CANCEL ANYTIME</div>
          <div style={{ marginTop: 6 }}>NO HIDDEN FEES</div>
        </div>
      </div>
    </div>
  );
}

export default function PricingPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--fg)', minHeight: '100vh' }}>
      <LandingHeader />
      <PageHero />
      <Pricing />
      <LandingFooter />
    </div>
  );
}
