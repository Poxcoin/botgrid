import React from 'react';
import LandingHeader from '@/components/landing/LandingHeader';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import Strategies from '@/components/landing/Strategies';
import StatsBar from '@/components/landing/StatsBar';
import HowItWorks from '@/components/landing/HowItWorks';
import Pricing from '@/components/landing/Pricing';
import LandingCTA from '@/components/landing/LandingCTA';
import LandingFooter from '@/components/landing/LandingFooter';

export default function Landing() {
  return (
    <div className="min-h-screen" style={{ background: 'transparent', color: 'var(--site-fg)', position: 'relative', zIndex: 1 }}>
      <LandingHeader />
      <Hero />
      <Features />
      <Strategies />
      <HowItWorks />
      <StatsBar />
      <Pricing />
      <LandingCTA />
      <LandingFooter />
    </div>
  );
}
