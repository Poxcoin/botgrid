import React, { useState, useEffect } from 'react';
import { authFetch } from '@/lib/api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { format } from 'date-fns';
import { useLang } from '@/lib/LangContext';

function SummaryCard({ label, value, sub, green, red }) {
  return (
    <div className="border border-kado-black p-5">
      <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray mb-2">{label}</div>
      <div className={`text-2xl font-black tabular-nums ${green ? 'text-green-600' : red ? 'text-red-600' : ''}`}>{value}</div>
      {sub && <div className="font-mono text-[10px] tracking-widest uppercase text-kado-gray mt-1">{sub}</div>}
    </div>
  );
}

function RunDetail({ runId, onBack, t }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    authFetch(`/api/backtest/run/${runId}`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(setData)
      .catch(() => setError(true));
  }, [runId]);

  if (error) return <div className="p-8 font-mono text-kado-gray text-sm">{t.dashboard.backtester.loadFailed}</div>;
  if (!data) return <div className="p-8 font-mono text-kado-gray text-sm">{t.dashboard.loading}</div>;

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
          {t.dashboard.backtester.back}
        </button>
        <h2 className="font-black text-lg">{data.run_id}</h2>
        <span className="font-mono text-[10px] tracking-widest uppercase text-kado-gray">
          {data.params?.days}d · TP {data.params?.tp}% · SL {data.params?.sl}%
        </span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-0 -m-px">
        {[
          { label: t.dashboard.backtester.hTrades, value: s.trades },
          { label: t.dashboard.backtester.hWinRate, value: `${s.win_rate}%`, green: s.win_rate >= 50 },
          {
            label: t.dashboard.backtester.hPnl,
            value: `${pnlPositive ? '+' : ''}$${s.total_pnl?.toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            green: pnlPositive,
            red: !pnlPositive,
          },
          { label: t.dashboard.backtester.hRoi, value: `${s.roi_pct >= 0 ? '+' : ''}${s.roi_pct}%`, green: s.roi_pct >= 0, red: s.roi_pct < 0 },
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
            <h3 className="font-black tracking-tight">{t.dashboard.backtester.equityCurve}</h3>
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
                  formatter={v => [`$${Number(v).toLocaleString('en', { minimumFractionDigits: 2 })}`, t.dashboard.backtester.balanceTooltip]}
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
          <h3 className="font-black tracking-tight">{t.dashboard.backtester.tradesPrefix} {data.trades?.length ?? 0}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-kado-black text-white font-mono text-[10px] tracking-[0.2em] uppercase">
                <th className="text-left px-4 h-9">{t.dashboard.hTime}</th>
                <th className="text-left px-4 h-9">{t.dashboard.backtester.hCoin}</th>
                <th className="text-left px-4 h-9">{t.dashboard.hAction}</th>
                <th className="text-left px-4 h-9">{t.dashboard.hScore}</th>
                <th className="text-left px-4 h-9">{t.dashboard.backtester.hRsi}</th>
                <th className="text-left px-4 h-9">{t.dashboard.backtester.hResult}</th>
                <th className="text-right px-4 h-9">{t.dashboard.hPnL}</th>
                <th className="text-left px-4 h-9 hidden md:table-cell">{t.dashboard.hNews}</th>
              </tr>
            </thead>
            <tbody>
              {(data.trades || []).map((trade, i) => {
                const pnlPos = trade.pnl_usdt >= 0;
                return (
                  <tr key={i} className="border-t border-kado-black/10 hover:bg-kado-black/[0.02]">
                    <td className="px-4 py-2 font-mono text-kado-gray tabular-nums whitespace-nowrap">
                      {trade.timestamp ? format(new Date(trade.timestamp), 'MMM d HH:mm') : '—'}
                    </td>
                    <td className="px-4 py-2 font-mono font-bold">{trade.coin}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block font-mono text-[10px] font-bold tracking-widest px-1.5 py-0.5 ${trade.action === 'LONG' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
                        {trade.action}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono tabular-nums">{trade.score}</td>
                    <td className="px-4 py-2 font-mono tabular-nums">{trade.rsi}</td>
                    <td className="px-4 py-2 font-mono font-bold">
                      <span className={trade.result === 'WIN' ? 'text-green-600' : trade.result === 'LOSS' ? 'text-red-600' : 'text-kado-gray'}>
                        {trade.result}
                      </span>
                    </td>
                    <td className={`px-4 py-2 font-mono font-bold tabular-nums text-right ${pnlPos ? 'text-green-600' : 'text-red-600'}`}>
                      {pnlPos ? '+' : ''}${trade.pnl_usdt?.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-kado-black/60 truncate max-w-xs hidden md:table-cell">
                      {trade.news_title}
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

const COINS_LIST = ['BTC','ETH','SOL','BNB','XRP','ADA','LINK','AVAX','DOT','UNI','AAVE','SUI','APT','OP','NEAR','INJ','DOGE'];

function NewRunForm({ onStarted, t }) {
  const [form, setForm] = useState({ days: 30, coins: [], balance: 10000, tp: 0, sl: 0 });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const toggleCoin = (c) =>
    setForm(f => ({
      ...f,
      coins: f.coins.includes(c) ? f.coins.filter(x => x !== c) : [...f.coins, c],
    }));

  const start = async () => {
    setLoading(true); setErr('');
    try {
      const r = await authFetch('/api/backtest/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (r.status === 409) { setErr(t.dashboard.backtester.alreadyRunning); return; }
      if (!r.ok) { setErr(t.dashboard.backtester.failedStart); return; }
      onStarted();
    } catch { setErr(t.dashboard.backtester.networkError); }
    finally { setLoading(false); }
  };

  const fields = [
    { label: t.dashboard.backtester.daysLabel, key: 'days', type: 'number', min: 1, max: 365 },
    { label: t.dashboard.backtester.balanceLabel, key: 'balance', type: 'number', min: 100 },
    { label: t.dashboard.backtester.tpLabel, key: 'tp', type: 'number', min: 0, step: 0.5, placeholder: t.dashboard.backtester.defaultPlaceholder },
    { label: t.dashboard.backtester.slLabel, key: 'sl', type: 'number', min: 0, step: 0.5, placeholder: t.dashboard.backtester.defaultPlaceholder },
  ];

  return (
    <div className="border border-white/20 p-6 space-y-5">
      <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray">{t.dashboard.backtester.newBacktestRun}</div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {fields.map(({ label, key, ...props }) => (
          <label key={key} className="flex flex-col gap-1">
            <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-kado-gray">{label}</span>
            <input
              {...props}
              value={form[key] || ''}
              onChange={e => setForm(f => ({ ...f, [key]: parseFloat(e.target.value) || 0 }))}
              className="border border-kado-black/20 bg-transparent font-mono text-sm px-3 py-2 focus:outline-none focus:border-kado-black"
            />
          </label>
        ))}
      </div>

      <div>
        <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-kado-gray mb-2">
          {t.dashboard.backtester.coinsLabel} <span className="text-kado-black/40">{t.dashboard.backtester.emptyAll}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {COINS_LIST.map(c => (
            <button
              key={c}
              onClick={() => toggleCoin(c)}
              className={`font-mono text-[11px] px-2.5 py-1 border transition-colors ${
                form.coins.includes(c)
                  ? 'border-kado-black bg-kado-black text-white'
                  : 'border-kado-black/20 text-kado-gray hover:border-kado-black/50'
              }`}
            >{c}</button>
          ))}
        </div>
      </div>

      {err && <div className="font-mono text-[11px] text-red-600">{err}</div>}

      <button
        onClick={start}
        disabled={loading}
        className="font-mono text-[11px] tracking-[0.2em] uppercase px-6 py-2.5 bg-kado-black text-white hover:bg-kado-black/80 disabled:opacity-50 transition-colors"
      >
        {loading ? t.dashboard.backtester.starting : t.dashboard.backtester.startBacktest}
      </button>
    </div>
  );
}

function ProgressBar({ onDone, t }) {
  const [status, setStatus] = useState({ running: true, progress: { current: 0, total: 0 } });

  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await authFetch('/api/backtest/status');
        if (r.ok) {
          const d = await r.json();
          setStatus(d);
          if (!d.running) { clearInterval(id); onDone(); }
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(id);
  }, [onDone]);

  const { current, total } = status.progress;
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div className="border border-kado-black p-6 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] tracking-[0.3em] uppercase">
          {status.running ? t.dashboard.backtester.runningStatus : t.dashboard.backtester.completeStatus}
        </div>
        <div className="font-mono text-[11px] tabular-nums text-kado-gray">
          {current} / {total || '?'} {t.dashboard.backtester.newsCount}
        </div>
      </div>
      <div className="h-1.5 bg-kado-black/10 w-full">
        <div
          className="h-full bg-kado-black transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="font-mono text-[10px] text-kado-gray">{pct}{t.dashboard.backtester.processedSuffix}</div>
    </div>
  );
}

export default function BacktesterTab() {
  const { t } = useLang();
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [running, setRunning] = useState(false);

  const loadRuns = () => {
    authFetch('/api/backtest/runs')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setRuns(d.runs || []))
      .catch(() => setError(true));
  };

  useEffect(() => {
    loadRuns();
    authFetch('/api/backtest/status')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.running) setRunning(true); })
      .catch(() => {});
  }, []);

  return (
    <div className="p-4 md:p-8">
      {selected ? (
        <RunDetail runId={selected} onBack={() => setSelected(null)} t={t} />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-xl">{t.dashboard.backtester.replayBacktester}</h2>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray hidden md:block">
                {t.dashboard.backtester.historicalDesc}
              </span>
              {!running && (
                <button
                  onClick={() => setShowForm(f => !f)}
                  className="font-mono text-[11px] tracking-[0.2em] uppercase px-4 py-2 border border-kado-black hover:bg-kado-black hover:text-white transition-colors"
                >
                  {showForm ? t.dashboard.backtester.cancelX : t.dashboard.backtester.newRunBtn}
                </button>
              )}
            </div>
          </div>

          {running && (
            <ProgressBar onDone={() => { setRunning(false); setShowForm(false); loadRuns(); }} t={t} />
          )}

          {showForm && !running && (
            <NewRunForm onStarted={() => { setShowForm(false); setRunning(true); }} t={t} />
          )}

          <div className="border border-kado-black">
            <div className="px-5 h-11 flex items-center border-b border-kado-black">
              <h3 className="font-black tracking-tight">{t.dashboard.backtester.backtestRunsHeader}</h3>
            </div>

            {error && (
              <div className="px-5 py-10 text-center font-mono text-[11px] tracking-widest uppercase text-kado-gray">
                {t.dashboard.backtester.failedLoadRuns}
              </div>
            )}
            {!error && runs === null && (
              <div className="px-5 py-10 text-center font-mono text-[11px] tracking-widest uppercase text-kado-gray">
                {t.dashboard.loading}
              </div>
            )}
            {!error && runs !== null && runs.length === 0 && (
              <div className="px-5 py-10 text-center font-mono text-[12px] text-kado-gray normal-case tracking-normal">
                {t.dashboard.backtester.noRunsYet}
              </div>
            )}
            {!error && runs && runs.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="bg-kado-black text-white font-mono text-[10px] tracking-[0.2em] uppercase">
                      <th className="text-left px-5 h-9">{t.dashboard.backtester.hRunId}</th>
                      <th className="text-left px-5 h-9">{t.dashboard.backtester.hPeriod}</th>
                      <th className="text-left px-5 h-9">{t.dashboard.backtester.hTrades}</th>
                      <th className="text-left px-5 h-9">{t.dashboard.backtester.hWinRate}</th>
                      <th className="text-left px-5 h-9">{t.dashboard.backtester.hPnl}</th>
                      <th className="text-left px-5 h-9">{t.dashboard.backtester.hRoi}</th>
                      <th className="text-left px-5 h-9">{t.dashboard.backtester.hBalance}</th>
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

        </div>
      )}
    </div>
  );
}
