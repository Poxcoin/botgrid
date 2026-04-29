import React, { useState } from 'react';
import SidebarNav, { SIDEBAR_W } from '@/components/landing/SidebarNav';
import Hero from '@/components/landing/Hero';
import BotSections from '@/components/landing/BotSections';
import StrategiesSections from '@/components/landing/StrategiesSections';
import HowItWorks from '@/components/landing/HowItWorks';
import StatsBar from '@/components/landing/StatsBar';
import Pricing from '@/components/landing/Pricing';
import LandingCTA from '@/components/landing/LandingCTA';
import LandingFooter from '@/components/landing/LandingFooter';

export default function Landing() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div style={{ background: 'var(--site-bg)', color: 'var(--site-fg)', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
      <SidebarNav mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Mobile top bar — only on small screens */}
      <div className="md:hidden sticky top-0 z-40 flex items-center justify-between px-5 h-12"
        style={{ background: 'var(--site-bg-glass)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--hero-border)' }}>
        <span className="font-black text-base tracking-[-0.04em]">KADO</span>
        <button onClick={() => setMobileOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--site-fg)', padding: 4 }}>
          <svg width="18" height="18" fill="none" viewBox="0 0 18 18">
            <rect y="2" width="18" height="1.5" fill="currentColor"/>
            <rect y="8" width="18" height="1.5" fill="currentColor"/>
            <rect y="14" width="18" height="1.5" fill="currentColor"/>
          </svg>
        </button>
      </div>

      {/* Main content — offset by sidebar width on desktop */}
      <div style={{ marginLeft: 0 }} className="md:ml-[240px]">
        <div id="hero"><Hero /></div>
        <BotSections />
        <StrategiesSections />
        <HowItWorks />
        <StatsBar />
        <Pricing />
        <LandingCTA />
        <LandingFooter />
      </div>
    </div>
  );
}
