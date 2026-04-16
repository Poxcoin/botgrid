import React from 'react';
import LandingHeader from '@/components/landing/LandingHeader';
import Hero from '@/components/landing/Hero';
import Features from '@/components/landing/Features';
import StatsBar from '@/components/landing/StatsBar';
import HowItWorks from '@/components/landing/HowItWorks';
import LandingCTA from '@/components/landing/LandingCTA';
import LandingFooter from '@/components/landing/LandingFooter';

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-kado-black">
      <LandingHeader />
      <Hero />
      <Features />
      <StatsBar />
      <HowItWorks />
      <LandingCTA />
      <LandingFooter />
    </div>
  );
}
