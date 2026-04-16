import React from 'react';
import { Link } from 'react-router-dom';
import KadoButton from '@/components/shared/KadoButton';

export default function LandingCTA() {
  return (
    <section className="bg-kado-black text-white border-b border-kado-black">
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-24 md:py-36">
        <div className="font-mono text-[11px] tracking-[0.3em] text-white/50 mb-10 uppercase">[ 05 / ENTRY ]</div>
        <h2 className="font-black tracking-[-0.05em] leading-[0.85] text-6xl md:text-[140px]">
          READY TO<br/>START?
        </h2>
        <p className="mt-10 max-w-xl text-lg text-white/70 leading-relaxed">
          Join the waitlist or request early access. No credit card. No ceremony.
        </p>
        <div className="mt-14 flex flex-col sm:flex-row gap-4">
          <Link to="/auth?mode=register">
            <KadoButton variant="invertSolid">Create Account</KadoButton>
          </Link>
          <Link to="/auth?mode=login">
            <KadoButton variant="invertGhost">See Live Signals</KadoButton>
          </Link>
        </div>
        <div className="mt-20 pt-8 border-t border-white/20 flex flex-wrap justify-between font-mono text-[10px] tracking-[0.3em] text-white/40 uppercase gap-3">
          <span>// Intelligence feeds</span>
          <span>// Signals execute</span>
          <span>// Risk is managed</span>
        </div>
      </div>
    </section>
  );
}
