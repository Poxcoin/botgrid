import React, { useState, useEffect } from 'react';
import { LIVE_FACTORS, WIN_RATE_SERIES } from '@/lib/mockData';
import { authFetch } from '@/lib/api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts';

function FactorBar({ label, value, weight, unit }) {
  const pct = Math.max(5, Math.min(100, Math.abs(value) * 10));
  return (
    <div className="border-b border-kado-black/15 py-4">
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-[11px] tracking-[0.2em] uppercase">{label}</span>
        <span className="font-mono font-bold tabular-nums">{value}{unit}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-kado-black/5 relative">
          <div className="absolute inset-y-0 left-0 bg-kado-black" style={{ width: `${pct}%` }} />
        </div>
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-kado-gray w-16 text-right">
          W {(weight * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

export default function BotAnalyzerTab() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    authFetch('/api/stats').then(r => r.ok ? r.json() : null).then(d => d && setStats(d)).catch(() => {});
  }, []);

  const composite = LIVE_FACTORS.reduce((acc, f) => acc + Math.abs(f.value) * f.weight, 0).toFixed(1);

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        {/* Scoring formula */}
        <div className="border border-kado-black lg:-mr-px">
          <div className="px-5 h-12 flex items-center justify-between border-b border-kado-black">
            <h3 className="font-black tracking-tight text-lg">Scoring Formula</h3>
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">LIVE VALUES</span>
          </div>
          <div className="p-5">
            <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-kado-gray mb-4 leading-relaxed">
              score = Σ (factor_i × weight_i)
            </div>
            {LIVE_FACTORS.map((f) => <FactorBar key={f.key} {...f} />)}
            <div className="mt-6 pt-4 border-t border-kado-black flex items-baseline justify-between">
              <span className="font-mono text-[11px] tracking-[0.3em] uppercase">Composite</span>
              <span className="font-black font-mono text-4xl tabular-nums">
                {composite}<span className="text-kado-gray text-lg">/10</span>
              </span>
            </div>
          </div>
        </div>

        {/* Real stats */}
        <div className="border border-kado-black">
          <div className="px-5 h-12 flex items-center justify-between border-b border-kado-black">
            <h3 className="font-black tracking-tight text-lg">Live Statistics</h3>
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">REAL DATA</span>
          </div>
          <div className="p-5 grid grid-cols-2 gap-0">
            {[
              { label: 'Total Trades',   value: stats?.total_trades  ?? '—' },
              { label: 'Closed',         value: stats?.closed_trades ?? '—' },
              { label: 'Win Rate',       value: stats?.win_rate != null ? `${stats.win_rate.toFixed(1)}%` : '—' },
              { label: 'Total PnL',      value: stats?.total_pnl != null ? `${stats.total_pnl >= 0 ? '+' : ''}$${stats.total_pnl.toFixed(2)}` : '—' },
              { label: 'Wins',           value: stats?.winning_trades ?? '—' },
              { label: 'Losses',         value: stats?.losing_trades  ?? '—' },
              { label: 'Long Signals',   value: stats?.long_count     ?? '—' },
              { label: 'Short Signals',  value: stats?.short_count    ?? '—' },
            ].map((row) => (
              <div key={row.label} className="border-b border-r border-kado-black/15 p-4 last:border-r-0">
                <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray mb-1">{row.label}</div>
                <div className="font-black font-mono text-2xl tabular-nums">{row.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        <div className="border border-kado-black lg:-mr-px">
          <div className="px-5 h-12 flex items-center justify-between border-b border-kado-black">
            <h3 className="font-black tracking-tight text-lg">Win Rate Over Time</h3>
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">30 DAYS · DEMO</span>
          </div>
          <div className="p-5" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={WIN_RATE_SERIES} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#0A0A0A" strokeOpacity={0.08} />
                <XAxis dataKey="day" tick={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: '#737373' }} axisLine={{ stroke: '#0A0A0A' }} tickLine={false} />
                <YAxis tick={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: '#737373' }} axisLine={{ stroke: '#0A0A0A' }} tickLine={false} domain={[40, 80]} />
                <Tooltip contentStyle={{ background: '#0A0A0A', color: '#fff', border: 'none', fontFamily: 'JetBrains Mono', fontSize: 11 }} />
                <Line type="monotone" dataKey="winRate" stroke="#0A0A0A" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-kado-black">
          <div className="px-5 h-12 flex items-center justify-between border-b border-kado-black">
            <h3 className="font-black tracking-tight text-lg">Avg Score per Day</h3>
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">30 DAYS · DEMO</span>
          </div>
          <div className="p-5" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={WIN_RATE_SERIES} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="#0A0A0A" strokeOpacity={0.08} />
                <XAxis dataKey="day" tick={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: '#737373' }} axisLine={{ stroke: '#0A0A0A' }} tickLine={false} />
                <YAxis tick={{ fontFamily: 'JetBrains Mono', fontSize: 10, fill: '#737373' }} axisLine={{ stroke: '#0A0A0A' }} tickLine={false} domain={[5, 9]} />
                <Tooltip contentStyle={{ background: '#0A0A0A', color: '#fff', border: 'none', fontFamily: 'JetBrains Mono', fontSize: 11 }} />
                <Bar dataKey="avgScore">
                  {WIN_RATE_SERIES.map((_, i) => <Cell key={i} fill={i % 5 === 0 ? '#0047FF' : '#0A0A0A'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
