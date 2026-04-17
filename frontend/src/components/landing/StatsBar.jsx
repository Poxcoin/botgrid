import React, { useEffect, useRef, useState } from 'react';
import NeuronReveal from '@/components/shared/NeuronReveal';
import useScrollReveal from '@/lib/useScrollReveal';

const STATS = [
  { raw: 16,   v: '16',    l: 'News sources',  isNum: true },
  { raw: 2,    v: '02',    l: 'Active bots',   isNum: true },
  { raw: null, v: '30s',   l: 'Scan interval', isNum: false },
  { raw: null, v: 'BYBIT', l: 'Futures venue', isNum: false },
];

function easeOutQuart(t) { return 1 - Math.pow(1 - t, 4); }

function CountUp({ target, started, pad = 0 }) {
  const [val, setVal] = useState(0);
  const [glitch, setGlitch] = useState(false);
  const raf = useRef(null);

  useEffect(() => {
    if (!started) return;
    const start = performance.now();
    const duration = 1200;
    function tick(now) {
      const p = Math.min(1, (now - start) / duration);
      setVal(Math.round(easeOutQuart(p) * target));
      if (p < 1) { raf.current = requestAnimationFrame(tick); }
      else { setTimeout(() => { setGlitch(true); setTimeout(() => setGlitch(false), 120); }, 80); }
    }
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [started, target]);

  return (
    <span style={{ display: 'inline-block', transform: glitch ? `translateX(${Math.random() > 0.5 ? 2 : -2}px)` : 'none', transition: glitch ? 'none' : 'transform 80ms ease' }}>
      {String(val).padStart(pad, '0')}
    </span>
  );
}

export default function StatsBar() {
  const [ref, visible] = useScrollReveal(0.2);

  return (
    <section id="stats" ref={ref} style={{ background: 'rgba(10,10,10,0.9)', color: '#fff', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 py-3 font-mono text-[10px] tracking-[0.3em] uppercase flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.45)' }}>
        <NeuronReveal delay={0} tag="span">
          <span style={{ border: '1px solid rgba(255,255,255,0.2)', padding: '3px 10px' }}>// SYSTEM</span>
        </NeuronReveal>
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-kado-blue animate-blink" /> OPERATIONAL
        </span>
      </div>
      <div className="max-w-[1400px] mx-auto grid grid-cols-2 md:grid-cols-4">
        {STATS.map((s, i) => (
          <div key={s.l}
            className={`px-6 md:px-10 py-10 md:py-14 ${i < STATS.length - 1 ? 'md:border-r border-white/10' : ''} ${i < 2 ? 'border-b md:border-b-0 border-white/10' : ''}`}
            style={{ opacity: visible ? 1 : 0, transition: `opacity 600ms ease ${i * 120}ms` }}>
            <NeuronReveal delay={i * 120 + 100} tag="div" className="font-black font-mono text-5xl md:text-6xl tracking-tighter leading-none mb-4">
              {s.isNum ? <CountUp target={s.raw} started={visible} pad={s.v.length} /> : s.v}
            </NeuronReveal>
            <NeuronReveal delay={i * 120 + 220} tag="div" className="font-mono text-[11px] tracking-[0.25em] uppercase"
              style={{ color: 'rgba(255,255,255,0.55)' }}>
              <span style={{ border: '1px solid rgba(255,255,255,0.15)', padding: '3px 8px', display: 'inline-block', animation: visible ? `flickerBox ${2 + i * 0.8}s ease-in-out ${i * 0.5}s infinite` : 'none' }}>
                {s.l}
              </span>
            </NeuronReveal>
          </div>
        ))}
      </div>
    </section>
  );
}
