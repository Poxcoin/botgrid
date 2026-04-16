import React from 'react';

const STEPS = [
  { n: '01', t: 'Scan',     d: 'Bot scans news every 30 seconds across 16+ feeds.' },
  { n: '02', t: 'Score',    d: 'Claude AI scores sentiment on a -10 to +10 scale.' },
  { n: '03', t: 'Validate', d: 'Market metrics validated — volume, funding, trend direction.' },
  { n: '04', t: 'Signal',   d: 'Signal generated only when composite score ≥ 8.' },
  { n: '05', t: 'Execute',  d: 'Trade executed on Bybit with TP and SL attached.' },
];

export default function HowItWorks() {
  return (
    <section id="how" className="bg-white border-b border-kado-black">
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-24 md:py-32">
        <div className="flex items-end justify-between mb-16 md:mb-20">
          <div>
            <div className="font-mono text-[11px] tracking-[0.3em] text-kado-gray mb-4 uppercase">[ PROCESS ]</div>
            <h2 className="font-black tracking-[-0.04em] leading-[0.9] text-5xl md:text-7xl">How it<br/>works.</h2>
          </div>
          <div className="hidden md:block font-mono text-[11px] tracking-[0.25em] text-kado-gray uppercase">
            05 STEPS · EVERY 30s
          </div>
        </div>

        <div className="border-t border-kado-black">
          {STEPS.map((s) => (
            <div key={s.n} className="grid grid-cols-12 border-b border-kado-black group hover:bg-kado-black hover:text-white transition-colors">
              <div className="col-span-2 md:col-span-1 p-6 md:p-8 border-r border-kado-black font-mono text-[11px] tracking-[0.25em] flex items-start opacity-60">
                {s.n}
              </div>
              <div className="col-span-10 md:col-span-4 p-6 md:p-8 md:border-r border-kado-black">
                <h3 className="font-black text-3xl md:text-5xl tracking-tight leading-[0.9] group-hover:text-kado-blue transition-colors">
                  {s.t}.
                </h3>
              </div>
              <div className="col-span-12 md:col-span-7 p-6 md:p-8 border-t md:border-t-0 border-kado-black flex items-center">
                <p className="text-base md:text-lg opacity-80 leading-relaxed">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
