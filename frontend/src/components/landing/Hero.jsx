import React from 'react';
import { Link } from 'react-router-dom';
import KadoButton from '@/components/shared/KadoButton';

export default function Hero() {
  return (
    <section className="relative bg-white border-b border-kado-black overflow-hidden">
      <div className="absolute inset-0 kado-grid pointer-events-none" />

      <div className="absolute top-6 left-6 md:left-10 font-mono text-[11px] tracking-[0.2em] text-kado-gray">
        [ LIVE / v1.0 ]
      </div>
      <div className="absolute top-6 right-6 md:right-10 font-mono text-[11px] tracking-[0.2em] text-kado-gray flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-kado-blue animate-blink" />
        BYBIT · PERP
      </div>

      <div className="relative max-w-[1400px] mx-auto px-6 md:px-10 min-h-[92vh] flex flex-col items-center justify-center text-center py-24">
        <div className="font-mono text-[11px] md:text-[13px] tracking-[0.35em] text-kado-gray mb-10 uppercase">
          AI-DRIVEN CRYPTO SIGNAL INTELLIGENCE
        </div>

        <h1 className="font-black tracking-[-0.06em] leading-[0.82] text-[22vw] md:text-[18vw] lg:text-[220px] text-kado-black select-none">
          KADO
        </h1>

        <p className="mt-10 max-w-xl text-base md:text-lg text-kado-black/70 leading-relaxed">
          A quantitative newsroom that listens to the market — scores every headline,
          validates every move, and executes with discipline.
        </p>

        <div className="mt-12 flex flex-col sm:flex-row gap-4 items-center">
          <Link to="/auth?mode=register">
            <KadoButton variant="primary">Get Access →</KadoButton>
          </Link>
          <a href="#how" className="text-[12px] font-mono tracking-[0.2em] uppercase text-kado-black/60 hover:text-kado-blue transition-colors">
            Learn how it works
          </a>
        </div>

        <div className="absolute bottom-0 left-0 right-0 border-t border-kado-black">
          <div className="max-w-[1400px] mx-auto px-6 md:px-10 h-10 flex items-center justify-between font-mono text-[10px] tracking-[0.25em] text-kado-gray uppercase">
            <span>// Scroll</span>
            <span className="hidden md:inline">Intelligence feeds. Signals execute.</span>
            <span>EST. 2026</span>
          </div>
        </div>
      </div>
    </section>
  );
}
