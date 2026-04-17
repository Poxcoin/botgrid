import React, { useState, useEffect } from 'react';
import { authFetch } from '@/lib/api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';

function SummaryCard({ label, value, sub, green, red }) {
  return (
    <div className="border border-kado-black p-5">
      <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray mb-2">{label}</div>
      <div className={`text-2xl font-black tabular-nums ${green ? 'text-green-600' : red ? 'text-red-600' : ''}`}>{value}</div>
      {sub && <div className="font-mono text-[10px] tracking-widest uppercase text-kado-gray mt-1">{sub}</div>}
    </div>
  );
}

function RunDetail({ runId, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    authFetch(`/api/backtest/run/${runId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => setError(true));
  }, [runId]);

  if (error) return <div className="p-8 font-mono text-kado-gray text-sm">Failed to load run.</div>;
  if (!data) return <div className="p-8 font-mono text-kado-gray text-sm">Loading...</div>;

  const s = data.summary;
  const equityData = (data.equity_curve || []).map(([ts, bal]) => ({
    ts,
    balance: bal,
    label: format(new Date(ts), 'MMM d'),
  }));

  const pnlPositive = s.total_pnl >= 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="font-mono text-[11px] tracking-[0.2em] uppercase text-kado-gray hover:text-kado-black transition-colors"
        >
          ← Back
        </button>
        <h2 className="font-black text-lg">{data.run_id}</h2>
        <span className="font-mono text-[10px] tracking-widest uppercase text-kado-gray">
          {data.params?.days}d · TP {data.params?.tp}% · SL {data.params?.sl}%
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 -m-px">
        {[
          { label: 'Trades', value: s.trades },
          { label: 'Win Rate', value: `${s.win_rate}%`, green: s.win_rate >= 50 },
          {
            label: 'Total PnL',
            value: `${pnlPositive ? '+' : ''}$${s.total_pnl?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            green: pnlPositive,
            red: !pnlPositive,
          },
          { label: 'ROI', value: `${s.roi_pct >= 0 ? '+' : ''}${s.roi_pct}%`, green: s.roi_pct >= 0, red: s.roi_pct < 0 },
        ].map((c, i) => (
          <div key={i} className="border border-kado-black p-5 -mr-px -mb-px">
            <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray mb-1">{c.label}</div>
            <div className={`text-2xl font-black tabular-nums ${c.green ? 'text-green-600' : c.red ? 'text-red-600' : ''}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {equityData.length > 1 && (
        <div className="border border-kado-black">
          <div className="px-5 h-11 flex items-center border-b border-kado-black">
            <h3 className="font-black tracking-tight">Equity Curve</h3>
          </div>
          <div className="p-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={equityData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#111" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#111" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e5e5e5" strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontFamily: 'monospace', fontSize: 10 }} tickLine={false} />
                <YAxis tick={{ fontFamily: 'monospace', fontSize: 10 }} tickLine={false} axisLine={false}
                  tickFormatter={v => `$${(v/1000).toFixed(1)}k`} />
                <Tooltip
                  formatter={v => [`$${Number(v).toLocaleString('en', { minimumFractionDigits: 2 })}`, 'Balance']}
                  contentStyle={{ fontFamily: 'monospace', fontSize: 11, border: '1px solid #111', borderRadius: 0 }}
                />
                <Area type="monotone" dataKey="balance" stroke="#111" strokeWidth={1.5}
                  fill="url(#eqGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="border border-kado-black">
        <div className="px-5 h-11 flex items-center border-b border-kado-black">
          <h3 className="font-black tracking-tight">Trades — {data.trades?.length ?? 0}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-kado-black text-white font-mono text-[10px] tracking-[0.2em] uppercase">
                <th className="text-left px-4 h-9">Time</th>
                <th className="text-left px-4 h-9">Coin</th>
                <th className="text-left px-4 h-9">Action</th>
                <th className="text-left px-4 h-9">Score</th>
                <th className="text-left px-4 h-9">RSI</th>
                <th className="text-left px-4 h-9">Result</th>
                <th className="text-right px-4 h-9">PnL</th>
                <th className="text-left px-4 h-9 hidden md:table-cell">News</th>
              </tr>
            </thead>
            <tbody>
              {(data.trades || []).map((t, i) => {
                const pnlPos = t.pnl_usdt >= 0;
                return (
                  <tr key={i} className="border-t border-kado-black/10 hover:bg-kado-black/[0.02]">
                    <td className="px-4 py-2 font-mono text-kado-gray tabular-nums whitespace-nowrap">
                      {t.timestamp ? format(new Date(t.timestamp), 'MMM d HH:mm') : '—'}
                    </td>
                    <td className="px-4 py-2 font-mono font-bold">{t.coin}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block font-mono text-[10px] font-bold tracking-widest px-1.5 py-0.5 ${t.action === 'LONG' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                        {t.action}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono tabular-nums">{t.score}</td>
                    <td className="px-4 py-2 font-mono tabular-nums">{t.rsi}</td>
                    <td className="px-4 py-2 font-mono font-bold">
                      <span className={t.result === 'WIN' ? 'text-green-600' : t.result === 'LOSS' ? 'text-red-600' : 'text-kado-gray'}>
                        {t.result}
                      </span>
                    </td>
                    <td className={`px-4 py-2 font-mono font-bold tabular-nums text-right ${pnlPos ? 'text-green-600' : 'text-red-600'}`}>
                      {pnlPos ? '+' : ''}${t.pnl_usdt?.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-kado-black/60 truncate max-w-xs hidden md:table-cell">
                      {t.news_title}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function BacktesterTab() {
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    authFetch('/api/backtest/runs')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setRuns(d.runs || []))
      .catch(() => setError(true));
  }, []);

  return (
    <div className="p-4 md:p-8">
      {selected ? (
        <RunDetail runId={selected} onBack={() => setSelected(null)} />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-xl">Replay Backtester</h2>
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray">
              Historical news · Real Claude AI · OHLCV simulation
            </span>
          </div>

          <div className="border border-kado-black">
            <div className="px-5 h-11 flex items-center border-b border-kado-black">
              <h3 className="font-black tracking-tight">Backtest Runs</h3>
            </div>

            {error && (
              <div className="px-5 py-10 text-center font-mono text-[11px] tracking-widest uppercase text-kado-gray">
                Failed to load runs.
              </div>
            )}
            {!error && runs === null && (
              <div className="px-5 py-10 text-center font-mono text-[11px] tracking-widest uppercase text-kado-gray">
                Loading...
              </div>
            )}
            {!error && runs !== null && runs.length === 0 && (
              <div className="px-5 py-10 text-center font-mono text-[11px] tracking-widest uppercase text-kado-gray">
                No runs yet. Run: <code className="bg-kado-black/5 px-1">python tools/replay_backtest.py</code>
              </div>
            )}
            {!error && runs && runs.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-kado-black text-white font-mono text-[10px] tracking-[0.2em] uppercase">
                      <th className="text-left px-5 h-9">Run ID</th>
                      <th className="text-left px-5 h-9">Period</th>
                      <th className="text-left px-5 h-9">Trades</th>
                      <th className="text-left px-5 h-9">Win Rate</th>
                      <th className="text-left px-5 h-9">PnL</th>
                      <th className="text-left px-5 h-9">ROI</th>
                      <th className="text-left px-5 h-9">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => {
                      const s = r.summary;
                      const pnlPos = s.total_pnl >= 0;
                      return (
                        <tr
                          key={r.run_id}
                          onClick={() => setSelected(r.run_id)}
                          className="border-t border-kado-black/10 hover:bg-kado-black/[0.03] cursor-pointer transition-colors"
                        >
                          <td className="px-5 py-3 font-mono text-[11px] text-kado-gray">{r.run_id}</td>
                          <td className="px-5 py-3 font-mono">{r.params?.days}d</td>
                          <td className="px-5 py-3 font-mono font-bold">{s.trades}</td>
                          <td className="px-5 py-3 font-mono font-bold">
                            <span className={s.win_rate >= 50 ? 'text-green-600' : 'text-red-600'}>
                              {s.win_rate}%
                            </span>
                          </td>
                          <td className={`px-5 py-3 font-mono font-bold tabular-nums ${pnlPos ? 'text-green-600' : 'text-red-600'}`}>
                            {pnlPos ? '+' : ''}${s.total_pnl?.toFixed(2)}
                          </td>
                          <td className={`px-5 py-3 font-mono font-bold tabular-nums ${s.roi_pct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {s.roi_pct >= 0 ? '+' : ''}{s.roi_pct}%
                          </td>
                          <td className="px-5 py-3 font-mono tabular-nums">
                            ${s.initial?.toLocaleString()} → ${s.final?.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="border border-kado-black/20 p-5 font-mono text-[11px] tracking-wide text-kado-gray space-y-1">
            <div className="font-bold text-kado-black uppercase tracking-[0.2em] text-[10px] mb-2">How to run a backtest</div>
            <div>python tools/replay_backtest.py <span className="text-kado-black/50">— 30 days, all coins</span></div>
            <div>python tools/replay_backtest.py --days 7 --coins BTC ETH SOL</div>
            <div>python tools/replay_backtest.py --balance 5000 --tp 8 --sl 2</div>
          </div>
        </div>
      )}
    </div>
  );
}
