import React from 'react';
import LandingHeader from '@/components/landing/LandingHeader';
import Hero from '@/components/landing/Hero';
import BotSections from '@/components/landing/BotSections';
import StrategiesSections from '@/components/landing/StrategiesSections';
import HowItWorks from '@/components/landing/HowItWorks';
import StatsBar from '@/components/landing/StatsBar';
import Pricing from '@/components/landing/Pricing';
import LandingCTA from '@/components/landing/LandingCTA';
import LandingFooter from '@/components/landing/LandingFooter';

export default function Landing() {
  return (
    <div style={{ background: 'var(--site-bg)', color: 'var(--site-fg)', minHeight: '100vh', position: 'relative', zIndex: 1 }}>
      <LandingHeader />
      <div id="hero"><Hero /></div>
      <BotSections />
      <StrategiesSections />
      <HowItWorks />
      <StatsBar />
      <Pricing />
      <LandingCTA />
      <LandingFooter />
    </div>
  );
}
