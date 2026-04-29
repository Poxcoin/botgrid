import React, { useEffect } from 'react';
import LandingHeader from '@/components/landing/LandingHeader';
import StrategiesSections from '@/components/landing/StrategiesSections';
import LandingFooter from '@/components/landing/LandingFooter';

function PageHero() {
  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '4rem 0 3rem' }}>
      <div className="px-6 md:px-10 flex items-end justify-between">
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>
            [ KADO / STRATEGIES ]
          </div>
          <h1 className="font-black tracking-[-0.05em] leading-[0.85]" style={{ fontSize: 'clamp(52px, 10vw, 120px)', color: 'var(--fg)' }}>
            Pick your<br />
            <span style={{ color: 'var(--neon-green)', textShadow: '0 0 60px rgba(0,255,136,0.4)' }}>risk profile.</span>
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.8, color: 'var(--muted-fg)', maxWidth: 520, marginTop: 20 }}>
            Three pre-configured strategies from conservative grid trading to aggressive multi-bot deployment. Choose based on your risk tolerance and capital size.
          </p>
        </div>
        <div className="hidden md:block" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'right' }}>
          <div>3 STRATEGIES</div>
          <div style={{ marginTop: 6 }}>3–50%+ / MO</div>
          <div style={{ marginTop: 6 }}>RISK MANAGED</div>
        </div>
      </div>
    </div>
  );
}

export default function StrategiesPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--fg)', minHeight: '100vh' }}>
      <LandingHeader />
      <PageHero />
      <StrategiesSections />
      <LandingFooter />
    </div>
  );
}
