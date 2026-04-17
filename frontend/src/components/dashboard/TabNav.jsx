import React from 'react';

const TABS = [
  { id: 'overview',    label: 'Overview' },
  { id: 'history',     label: 'Signal History' },
  { id: 'analyzer',    label: 'Bot Analyzer' },
  { id: 'backtester',  label: 'Backtester' },
  { id: 'keys',        label: 'Exchange Keys' },
  { id: 'logs',        label: 'System Logs' },
];

export default function TabNav({ active, onChange }) {
  return (
    <div className="border-b border-kado-black bg-white sticky top-16 z-30">
      <div className="px-4 md:px-8 flex overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`relative whitespace-nowrap h-12 px-5 font-mono text-[11px] tracking-[0.25em] uppercase transition-colors ${active === t.id ? 'text-kado-black' : 'text-kado-black/40 hover:text-kado-black'}`}
          >
            {t.label}
            <span className={`absolute left-0 right-0 -bottom-px h-0.5 transition-colors ${active === t.id ? 'bg-kado-blue' : 'bg-transparent'}`} />
          </button>
        ))}
      </div>
    </div>
  );
}
