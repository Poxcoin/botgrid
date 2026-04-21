import React, { useState, useEffect } from 'react';
import StatCard from './StatCard';
import { formatDistanceToNowStrict } from 'date-fns';
import { authFetch } from '@/lib/api';

export default function OverviewTab() {
  const [data,  setData]  = useState(null);
  const [intel, setIntel] = useState(null);
  const [error, setError] = useState(false);

  const load = async () => {
    try {
      const res = await authFetch('/api/data');
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError(false);
    } catch {
      setError(true);
    }
  };

  const loadIntel = async () => {
    try {
      const res = await authFetch('/api/intel');
      if (res.ok) setIntel(await res.json());
    } catch {}
  };

  useEffect(() => {
    load(); loadIntel();
    const id = setInterval(() => { load(); loadIntel(); }, 30000);
    return () => clearInterval(id);
  }, []);

  const balance = data?.balance ?? { total: 0, free: 0 };
  const signalsToday = (data?.latest_signals ?? []).filter((s) => {
    const d = new Date(s.timestamp);
    return d.toDateString() === new Date().toDateString();
  }).length;
  const feed = data?.latest_signals ?? [];

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
        <div className="md:-mr-px">
          <StatCard
            label="Account Balance"
            value={`$${balance.total.toFixed(2)}`}
            sub={`FREE $${balance.free.toFixed(2)}`}
            accent
          />
        </div>
        <div className="md:-mr-px">
          <StatCard label="Signals Today" value={signalsToday} sub="LAST 24H" />
        </div>
        <StatCard
          label="Feed Status"
          value={
            <span className="flex items-center gap-3">
              <span className={`w-3 h-3 ${error ? 'bg-red-500' : 'bg-kado-blue animate-blink'}`} />
              {error ? 'OFFLINE' : 'LIVE'}
            </span>
          }
          sub={intel ? [
            intel.sources?.rss        && 'RSS',
            intel.sources?.telegram   && 'TG',
            intel.sources?.liquidations && 'LIQ',
            intel.sources?.onchain    && 'CHAIN',
          ].filter(Boolean).join(' · ') : '...'}
        />
      </div>

      {/* Live Intel Panel */}
      {intel && (
        <div className="border border-kado-black">
          <div className="px-5 h-10 border-b border-kado-black flex items-center">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray">Live Intel /</span>
            {intel.updated_at && (
              <span className="ml-3 font-mono text-[10px] text-kado-gray/60">
                {formatDistanceToNowStrict(new Date(intel.updated_at))} ago
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-kado-black/20">
            {['BTC','ETH','SOL','BNB'].map(coin => {
              const liq = intel.liquidations?.[coin];
              if (!liq) return null;
              const sig = liq.signal;
              const color = sig === 'BEARISH' ? 'text-red-600' : sig === 'BULLISH' ? 'text-green-600' : 'text-kado-gray';
              return (
                <div key={coin} className="p-4">
                  <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray mb-1">{coin} Liq</div>
                  <div className={`font-mono font-bold text-sm ${color}`}>{sig}</div>
                  <div className="font-mono text-[10px] text-kado-gray/70 mt-1">
                    ↑${(liq.long_liq_usd/1000).toFixed(0)}K ↓${(liq.short_liq_usd/1000).toFixed(0)}K
                  </div>
                </div>
              );
            })}
          </div>
          {intel.onchain && (
            <div className="border-t border-kado-black/20 px-5 py-3 flex items-center gap-6">
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">On-chain ETH /</span>
              <span className={`font-mono text-sm font-bold ${
                intel.onchain.signal === 'BEARISH' ? 'text-red-600' :
                intel.onchain.signal === 'BULLISH' ? 'text-green-600' : 'text-kado-gray'
              }`}>{intel.onchain.signal}</span>
              <span className="font-mono text-[11px] text-kado-gray">
                → Exchange: {intel.onchain.to_exchange_eth} ETH
              </span>
              <span className="font-mono text-[11px] text-kado-gray">
                ← From Exchange: {intel.onchain.from_exchange_eth} ETH
              </span>
            </div>
          )}
        </div>
      )}

      <div className="border border-kado-black">
        <div className="flex items-center justify-between px-5 h-12 border-b border-kado-black">
          <h3 className="font-black tracking-tight text-lg">Intelligence Feed</h3>
          <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-kado-blue animate-blink" /> UPDATES EVERY 30s
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-kado-black text-white font-mono text-[10px] tracking-[0.25em] uppercase">
                <th className="text-left px-5 h-10 w-32">Time</th>
                <th className="text-left px-5 h-10 w-32">Asset</th>
                <th className="text-left px-5 h-10 w-28">Action</th>
                <th className="text-left px-5 h-10 w-24">Score</th>
                <th className="text-left px-5 h-10">News Title</th>
              </tr>
            </thead>
            <tbody>
              {feed.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center font-mono text-[11px] tracking-widest uppercase text-kado-gray">
                    {data === null ? 'Loading...' : 'No signals yet'}
                  </td>
                </tr>
              ) : feed.map((s, i) => (
                <tr key={i} className="border-t border-kado-black/15 hover:bg-kado-black/[0.03] transition-colors">
                  <td className="px-5 py-3 font-mono text-kado-gray tabular-nums">
                    {formatDistanceToNowStrict(new Date(s.timestamp))} ago
                  </td>
                  <td className="px-5 py-3 font-mono font-bold">{s.coin}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block font-mono text-[11px] font-bold tracking-[0.2em] px-2 py-1 ${s.action === 'LONG' ? 'bg-green-600 text-white' : s.action === 'SHORT' ? 'bg-red-600 text-white' : 'bg-kado-gray text-white'}`}>
                      {s.action}
                    </span>
                  </td>
                  <td className="px-5 py-3 font-mono font-bold tabular-nums">
                    {typeof s.total_score === 'number' ? s.total_score.toFixed(1) : s.total_score}
                  </td>
                  <td className="px-5 py-3 text-kado-black/80 truncate max-w-xs">{s.news_title}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
