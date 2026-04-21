import React, { useMemo, useState, useEffect } from 'react';
import StatCard from './StatCard';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { authFetch } from '@/lib/api';

const PAGE_SIZE = 20;

export default function SignalHistoryTab() {
  const [coin,   setCoin]   = useState('');
  const [action, setAction] = useState('');
  const [page,   setPage]   = useState(1);
  const [data,   setData]   = useState({ signals: [], total: 0, pages: 1 });
  const [stats,  setStats]  = useState(null);

  const loadHistory = async (p, c, a) => {
    const params = new URLSearchParams({ page: p, limit: PAGE_SIZE });
    if (c) params.set('coin', c);
    if (a) params.set('action', a);
    try {
      const res = await authFetch('/api/signals?' + params);
      if (res.ok) setData(await res.json());
    } catch {}
  };

  const loadStats = async () => {
    try {
      const res = await authFetch('/api/stats');
      if (res.ok) setStats(await res.json());
    } catch {}
  };

  useEffect(() => {
    setPage(1);
    loadHistory(1, coin, action);
  }, [coin, action]);

  useEffect(() => {
    loadHistory(page, coin, action);
  }, [page]);

  useEffect(() => { loadStats(); }, []);

  const pnlColor = stats?.total_pnl >= 0 ? 'text-green-700' : 'text-red-600';

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-0">
        <StatCard label="Total Signals"  value={stats?.total_trades ?? '—'} />
        <StatCard label="Win Rate"       value={stats?.win_rate != null ? `${stats.win_rate.toFixed(1)}%` : '—'} accent />
        <StatCard label="Long"           value={stats?.long_count  ?? '—'} />
        <StatCard label="Short"          value={stats?.short_count ?? '—'} />
        <StatCard
          label="Total PnL"
          value={
            stats?.total_pnl != null
              ? <span className={pnlColor}>{stats.total_pnl >= 0 ? '+' : ''}${stats.total_pnl.toFixed(2)}</span>
              : '—'
          }
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 border border-kado-black p-4">
        <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray mr-2">Filters /</span>
        <FSelect label="Asset" value={coin} onChange={(e) => { setCoin(e.target.value); setPage(1); }}>
          <option value="">All Assets</option>
          {['BTC','ETH','SOL','XRP','ADA','DOT','LINK','UNI','AAVE','SUI','APT','OP','NEAR','INJ','FET'].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </FSelect>
        <FSelect label="Action" value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          <option value="">All Actions</option>
          <option value="LONG">LONG</option>
          <option value="SHORT">SHORT</option>
        </FSelect>
      </div>

      {/* Table */}
      <div className="border border-kado-black">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-kado-black text-white font-mono text-[10px] tracking-[0.25em] uppercase">
                <th className="text-left px-5 h-10">Timestamp</th>
                <th className="text-left px-5 h-10">Asset</th>
                <th className="text-left px-5 h-10">Action</th>
                <th className="text-left px-5 h-10">Score</th>
                <th className="text-left px-5 h-10">Groq</th>
                <th className="text-left px-5 h-10">Source</th>
                <th className="text-left px-5 h-10">Age</th>
                <th className="text-left px-5 h-10">Result</th>
                <th className="text-left px-5 h-10">PnL</th>
                <th className="text-left px-5 h-10">News</th>
              </tr>
            </thead>
            <tbody>
              {data.signals.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center font-mono text-[11px] tracking-widest uppercase text-kado-gray">
                    No signals found
                  </td>
                </tr>
              ) : data.signals.map((s, i) => {
                const pnl = s.pnl_usdt;
                return (
                  <tr key={i} className="border-t border-kado-black/15 hover:bg-kado-black/[0.03]">
                    <td className="px-5 py-3 font-mono text-kado-gray tabular-nums whitespace-nowrap">
                      {format(new Date(s.timestamp), 'yyyy-MM-dd HH:mm')}
                    </td>
                    <td className="px-5 py-3 font-mono font-bold">{s.coin}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block font-mono text-[11px] font-bold tracking-[0.2em] px-2 py-1 ${s.action === 'LONG' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                        {s.action}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono font-bold tabular-nums">
                      {typeof s.total_score === 'number' ? s.total_score.toFixed(1) : s.total_score}
                    </td>
                    <td className="px-5 py-3 font-mono text-[10px]">
                      {s.groq?.market_impact ? (
                        <span className={`px-1.5 py-0.5 font-bold tracking-wider ${
                          s.groq.market_impact === 'HIGH'   ? 'bg-red-100 text-red-700' :
                          s.groq.market_impact === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-500'
                        }`}>{s.groq.market_impact}</span>
                      ) : <span className="text-kado-gray">—</span>}
                    </td>
                    <td className="px-5 py-3 font-mono text-[10px] text-kado-gray max-w-[120px] truncate">
                      {s.source?.startsWith('Telegram') ? (
                        <span className="text-blue-600 font-bold">{s.source.replace('Telegram @','@')}</span>
                      ) : s.source || '—'}
                    </td>
                    <td className="px-5 py-3 font-mono text-[11px] tabular-nums text-kado-gray">
                      {s.news_age_minutes != null ? `${s.news_age_minutes}m` : '—'}
                    </td>
                    <td className="px-5 py-3 font-mono text-[11px] tracking-[0.2em]">
                      {s.result === 'WIN'  ? <span className="text-green-700 font-bold">WIN</span>
                      : s.result === 'LOSS' ? <span className="text-red-600 font-bold">LOSS</span>
                      : s.result === 'BE'   ? <span className="text-kado-gray font-bold">BE</span>
                      :                       <span className="text-kado-gray">—</span>}
                    </td>
                    <td className={`px-5 py-3 font-mono tabular-nums ${pnl == null ? 'text-kado-gray' : pnl > 0 ? 'text-green-700' : pnl < 0 ? 'text-red-600' : 'text-kado-gray'}`}>
                      {pnl == null ? '—' : `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`}
                    </td>
                    <td className="px-5 py-3 text-kado-black/80 max-w-xs truncate">{s.news_title}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-kado-black px-5 h-12">
          <div className="font-mono text-[11px] tracking-[0.2em] uppercase text-kado-gray">
            Page {page} / {data.pages} · {data.total} rows
          </div>
          <div className="flex">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="w-9 h-9 border border-kado-black -mr-px flex items-center justify-center disabled:opacity-30 hover:bg-kado-black hover:text-white transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
              disabled={page >= data.pages}
              className="w-9 h-9 border border-kado-black flex items-center justify-center disabled:opacity-30 hover:bg-kado-black hover:text-white transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FSelect({ label, children, ...props }) {
  return (
    <label className="flex items-center gap-2">
      <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">{label}</span>
      <select
        {...props}
        className="h-9 px-3 bg-white border border-kado-black text-[12px] font-mono tracking-wider uppercase outline-none focus:border-kado-blue"
      >
        {children}
      </select>
    </label>
  );
}
