import React from 'react';

const STATS = [
  { v: '16',    l: 'News sources' },
  { v: '02',    l: 'Active bots' },
  { v: '30s',   l: 'Scan interval' },
  { v: 'BYBIT', l: 'Futures venue' },
];

export default function StatsBar() {
  return (
    <section id="stats" className="bg-kado-black text-white border-b border-kado-black">
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-3 font-mono text-[10px] tracking-[0.3em] text-white/50 uppercase flex items-center justify-between border-b border-white/20">
        <span>// SYSTEM</span>
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-kado-blue animate-blink" /> OPERATIONAL
        </span>
      </div>
      <div className="max-w-[1400px] mx-auto grid grid-cols-2 md:grid-cols-4">
        {STATS.map((s, i) => (
          <div
            key={s.l}
            className={`px-6 md:px-10 py-10 md:py-14 ${i < STATS.length - 1 ? 'md:border-r border-white/20' : ''} ${i < 2 ? 'border-b md:border-b-0 border-white/20' : ''}`}
          >
            <div className="font-black font-mono text-5xl md:text-6xl tracking-tighter leading-none mb-4">{s.v}</div>
            <div className="font-mono text-[11px] tracking-[0.25em] uppercase text-white/60">{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
