import React from 'react';
import { LayoutDashboard, Activity, Brain, FlaskConical, Key, ScrollText, ShieldCheck } from 'lucide-react';

const TABS = [
  { id: 'overview',   label: 'Overview',   icon: LayoutDashboard },
  { id: 'history',    label: 'Signals',    icon: Activity },
  { id: 'analyzer',   label: 'Analyzer',   icon: Brain },
  { id: 'backtester', label: 'Backtester', icon: FlaskConical },
  { id: 'keys',       label: 'API Keys',   icon: Key },
  { id: 'security',   label: 'Security',   icon: ShieldCheck },
  { id: 'logs',       label: 'Logs',       icon: ScrollText },
];

export default function TabNav({ active, onChange }) {
  return (
    <div className="border-b border-kado-black bg-white sticky top-16 z-30">
      <div className="px-4 md:px-8 flex overflow-x-auto no-scrollbar">
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id)}
              title={t.label}
              className={`relative whitespace-nowrap h-12 px-4 font-mono text-[11px] tracking-[0.2em] uppercase transition-colors flex items-center gap-2 ${isActive ? 'text-kado-black' : 'text-kado-black/35 hover:text-kado-black/70'}`}
            >
              <Icon size={14} strokeWidth={isActive ? 2.5 : 1.8} />
              <span className="hidden sm:inline">{t.label}</span>
              <span className="absolute left-0 right-0 -bottom-px h-0.5 transition-colors"
                style={{ background: isActive ? '#0047FF' : 'transparent' }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
