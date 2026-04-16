import React from 'react';

export default function StatCard({ label, value, sub, accent = false }) {
  return (
    <div className={`border border-kado-black p-6 bg-white ${accent ? 'relative overflow-hidden' : ''}`}>
      {accent && <div className="absolute top-0 left-0 w-2 h-full bg-kado-blue" />}
      <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray mb-4">{label}</div>
      <div className="font-black font-mono text-4xl md:text-5xl leading-none tracking-tighter tabular-nums">
        {value}
      </div>
      {sub && <div className="mt-3 font-mono text-[11px] tracking-[0.2em] uppercase text-kado-gray">{sub}</div>}
    </div>
  );
}
