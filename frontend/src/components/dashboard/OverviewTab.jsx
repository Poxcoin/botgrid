import React, { useState, useEffect } from 'react';
import StatCard from './StatCard';
import { formatDistanceToNowStrict } from 'date-fns';

export default function OverviewTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  const load = async () => {
    try {
      const res = await fetch('/api/data');
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError(false);
    } catch {
      setError(true);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
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
          sub="16 / 16 SOURCES"
        />
      </div>

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
