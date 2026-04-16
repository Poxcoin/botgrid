import React from 'react';

const ITEMS = [
  { n: '01', h: 'NEWS INTELLIGENCE', p: 'Scans 16+ crypto news feeds in real-time. AI scores every headline for market impact.' },
  { n: '02', h: 'SIGNAL GENERATION',  p: 'Produces LONG / SHORT signals with confidence scores. Filters noise using volume, funding rate, and market sentiment.' },
  { n: '03', h: 'RISK MANAGEMENT',    p: 'Each signal includes built-in TP/SL levels. Daily loss limits protect your capital automatically.' },
];

export default function Features() {
  return (
    <section className="bg-white border-b border-kado-black">
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-24 md:py-32">
        <div className="flex items-end justify-between mb-16 md:mb-24">
          <h2 className="font-black tracking-[-0.04em] leading-[0.9] text-5xl md:text-7xl">
            What it<br/>does.
          </h2>
          <div className="hidden md:block font-mono text-[11px] tracking-[0.25em] text-kado-gray uppercase">
            [ 003 · CORE ]
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 border-t border-kado-black">
          {ITEMS.map((it, i) => (
            <div
              key={it.n}
              className={`p-8 md:p-10 border-b border-kado-black md:border-b-0 ${i < ITEMS.length - 1 ? 'md:border-r border-kado-black' : ''} group hover:bg-kado-black hover:text-white transition-colors duration-300`}
            >
              <div className="flex items-start justify-between mb-10">
                <span className="font-mono text-[11px] tracking-[0.25em] opacity-60">{it.n}</span>
                <span className="font-mono text-[11px] tracking-[0.25em] opacity-60">◊</span>
              </div>
              <div className="font-black text-[56px] md:text-[72px] leading-none tracking-tighter mb-8 group-hover:text-kado-blue transition-colors">
                {it.n}
              </div>
              <h3 className="font-black text-xl md:text-2xl tracking-tight mb-4">{it.h}</h3>
              <p className="text-[15px] leading-relaxed opacity-75">{it.p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
