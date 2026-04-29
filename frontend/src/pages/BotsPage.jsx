import React, { useEffect } from 'react';
import LandingHeader from '@/components/landing/LandingHeader';
import BotSections from '@/components/landing/BotSections';
import LandingFooter from '@/components/landing/LandingFooter';

function PageHero() {
  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '4rem 0 3rem' }}>
      <div className="px-6 md:px-10 flex items-end justify-between">
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>
            [ KADO / BOTS ]
          </div>
          <h1 className="font-black tracking-[-0.05em] leading-[0.85]" style={{ fontSize: 'clamp(52px, 10vw, 120px)', color: 'var(--fg)' }}>
            The<br />
            <span style={{ color: 'var(--neon-cyan)', textShadow: '0 0 60px rgba(0,212,255,0.4)' }}>Arsenal.</span>
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.8, color: 'var(--muted-fg)', maxWidth: 520, marginTop: 20 }}>
            Four autonomous trading systems running in parallel 24/7. Each bot specializes in a different market opportunity — from AI news signals to DEX sniping.
          </p>
        </div>
        <div className="hidden md:block" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'right' }}>
          <div>4 BOTS</div>
          <div style={{ marginTop: 6 }}>BYBIT · BSC</div>
          <div style={{ marginTop: 6, color: 'var(--neon-green)', animation: 'labelPulse 3s infinite' }}>LIVE</div>
        </div>
      </div>
    </div>
  );
}

export default function BotsPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--fg)', minHeight: '100vh' }}>
      <LandingHeader />
      <PageHero />
      <BotSections />
      <LandingFooter />
    </div>
  );
}
