import React, { useState, useEffect } from 'react';
import { LIVE_FACTORS } from '@/lib/mockData';
import { authFetch } from '@/lib/api';

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

function BotCard({ label, data }) {
  if (!data) return null;
  const pnl = data.total ?? 0;
  const pos = pnl >= 0;
  return (
    <div className="border border-kado-black/15 p-4 flex flex-col gap-1">
      <div className="font-mono text-[9px] tracking-[0.25em] uppercase text-kado-gray mb-2">{label}</div>
      <div className={`font-black font-mono text-2xl tabular-nums ${pos ? '' : 'text-red-600'}`}>
        {pos ? '+' : ''}{pnl.toFixed(2)} <span className="text-sm font-normal text-kado-gray">USDT</span>
      </div>
      <div className="font-mono text-[10px] text-kado-gray flex gap-4 mt-1">
        <span>{data.trades ?? 0} trades</span>
        <span>{data.wr ?? 0}% WR</span>
        <span className={data.today >= 0 ? '' : 'text-red-500'}>
          today {data.today >= 0 ? '+' : ''}{(data.today ?? 0).toFixed(2)}
        </span>
        <span className={data.week >= 0 ? '' : 'text-red-500'}>
          7d {data.week >= 0 ? '+' : ''}{(data.week ?? 0).toFixed(2)}
        </span>
      </div>
    </div>
  );
}

function DailyPnlChart({ daily }) {
  const [hover, setHover] = useState(null);
  if (!daily || !daily.length) return null;
  const W = 720, H = 160;
  const PAD_L = 52, PAD_R = 16, PAD_T = 12, PAD_B = 28;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;
  const maxAbs = Math.max(...daily.map(d => Math.abs(d.pnl)), 0.01);
  const barW   = Math.max(3, Math.floor(chartW / daily.length) - 3);
  const step   = chartW / daily.length;
  const yZero  = PAD_T + chartH / 2;
  return (
    <div style={{ background: '#fafafa', border: '1px solid rgba(0,0,0,0.12)', padding: 12, position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', display: 'block', fontFamily: "'Courier New',monospace" }} preserveAspectRatio="xMidYMid meet" onMouseLeave={() => setHover(null)}>
        {[0].map(v => { const y = yZero; return <line key={v} x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="rgba(0,0,0,0.15)" strokeWidth={1} />; })}
        {daily.map((d, i) => {
          const x    = PAD_L + i * step + (step - barW) / 2;
          const pos  = d.pnl >= 0;
          const barH = Math.abs(d.pnl) / maxAbs * (chartH / 2);
          const y    = pos ? yZero - barH : yZero;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} style={{ cursor: 'pointer' }}>
              <rect x={x - 2} y={PAD_T} width={barW + 4} height={chartH} fill="transparent" />
              <rect x={x} y={y} width={barW} height={Math.max(barH, 1)} fill={hover === i ? (pos ? '#0ecb81' : '#f6465d') : (pos ? 'rgba(14,203,129,0.65)' : 'rgba(246,70,93,0.65)')} rx={1} />
              {i % Math.max(1, Math.floor(daily.length / 6)) === 0 && (
                <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize={9} fill="rgba(0,0,0,0.4)">{d.date ? d.date.slice(5) : ''}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && daily[hover] && (
        <div style={{ position: 'absolute', left: `${((PAD_L + hover * step + step / 2) / W) * 100}%`, top: 6, transform: 'translateX(-50%)', background: '#fff', border: '1px solid rgba(0,0,0,0.15)', padding: '6px 10px', fontSize: 11, fontFamily: "'Courier New',monospace", pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10 }}>
          <div style={{ color: 'rgba(0,0,0,0.4)', fontSize: 9, marginBottom: 3 }}>{daily[hover].date}</div>
          <div style={{ color: daily[hover].pnl >= 0 ? '#15803d' : '#dc2626', fontWeight: 700 }}>
            {daily[hover].pnl >= 0 ? '+' : ''}{daily[hover].pnl.toFixed(2)} USDT
          </div>
          <div style={{ color: 'rgba(0,0,0,0.4)', fontSize: 9 }}>{daily[hover].trades} trades</div>
        </div>
      )}
    </div>
  );
}

export default function BotAnalyzerTab() {
  const [stats,     setStats]     = useState(null);
  const [report,    setReport]    = useState(null);
  const [trades,    setTrades]    = useState([]);
  const [breakdown, setBreakdown] = useState(null);

  useEffect(() => {
    authFetch('/api/stats').then(r => r.ok ? r.json() : null).then(d => d && setStats(d)).catch(() => {});
    authFetch('/api/bot-pnl').then(r => r.ok ? r.json() : null).then(d => d && setReport(d)).catch(() => {});
    authFetch('/api/bot-trades?n=30').then(r => r.ok ? r.json() : null).then(d => d?.trades && setTrades(d.trades)).catch(() => {});
    authFetch('/api/analytics/breakdown').then(r => r.ok ? r.json() : null).then(d => d && setBreakdown(d)).catch(() => {});
  }, []);

  const composite = LIVE_FACTORS.reduce((acc, f) => acc + Math.abs(f.value) * f.weight, 0).toFixed(1);

  return (
    <div className="p-4 md:p-8 space-y-8">

      {/* Per-bot PnL cards */}
      {report && (
        <div>
          <div className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray mb-3">Bot Performance — All Time</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-0 border border-kado-black/15">
            {[
              { label: 'Signal Bot', key: 'signal'  },
              { label: 'Grid Bot',   key: 'grid'    },
              { label: 'Funding',    key: 'funding'  },
              { label: 'Cascade',   key: 'cascade'  },
            ].map(b => <BotCard key={b.key} label={b.label} data={report[b.key]} />)}
          </div>
        </div>
      )}

      {/* Top / Worst coins */}
      {report && (report.top_coins?.length > 0 || report.worst_coins?.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
          <div className="border border-kado-black lg:-mr-px">
            <div className="px-5 h-10 flex items-center border-b border-kado-black/15">
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">Top Coins</span>
            </div>
            <div className="p-4 space-y-2">
              {(report.top_coins ?? []).map(([coin, pnl]) => (
                <div key={coin} className="flex justify-between font-mono text-[12px]">
                  <span>{coin}</span>
                  <span className={pnl >= 0 ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="border border-kado-black">
            <div className="px-5 h-10 flex items-center border-b border-kado-black/15">
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">Worst Coins</span>
            </div>
            <div className="p-4 space-y-2">
              {(report.worst_coins ?? []).map(([coin, pnl]) => (
                <div key={coin} className="flex justify-between font-mono text-[12px]">
                  <span>{coin}</span>
                  <span className={pnl >= 0 ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}>
                    {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Daily PnL chart + per-coin breakdown from all_trades */}
      {breakdown && (
        <div className="space-y-0">
          <div className="border border-kado-black">
            <div className="px-5 h-10 flex items-center justify-between border-b border-kado-black/15">
              <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">Daily PnL — Last 30 Days (all_trades)</span>
              <span className="font-mono text-[10px] text-kado-gray">
                total {breakdown.summary?.total_pnl >= 0 ? '+' : ''}{breakdown.summary?.total_pnl ?? 0} USDT · {breakdown.summary?.total_trades ?? 0} trades
              </span>
            </div>
            <div className="p-4">
              <DailyPnlChart daily={breakdown.daily} />
            </div>
          </div>

          {breakdown.by_coin?.length > 0 && (
            <div className="border border-kado-black border-t-0">
              <div className="px-5 h-10 flex items-center border-b border-kado-black/15">
                <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">Per Coin Breakdown</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse font-mono text-[11px]">
                  <thead>
                    <tr className="border-b border-kado-black/15">
                      {['Coin','Trades','Wins','WR%','PnL','Avg Win','Avg Loss'].map(h => (
                        <th key={h} className="px-4 py-2 text-left tracking-[0.12em] uppercase text-kado-gray font-normal text-[9px]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.by_coin.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-b border-kado-black/8 hover:bg-kado-black/3">
                        <td className="px-4 py-2 font-bold">{r.coin}</td>
                        <td className="px-4 py-2 text-kado-gray">{r.trades}</td>
                        <td className="px-4 py-2 text-kado-gray">{r.wins}</td>
                        <td className="px-4 py-2">{r.trades > 0 ? Math.round(r.wins / r.trades * 100) : 0}%</td>
                        <td className={`px-4 py-2 font-bold ${r.pnl >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                          {r.pnl >= 0 ? '+' : ''}{r.pnl.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-green-700">{r.avg_win > 0 ? `+${r.avg_win.toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-2 text-red-500">{r.avg_loss < 0 ? r.avg_loss.toFixed(2) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
        {/* Scoring formula */}
        <div className="border border-kado-black lg:-mr-px">
          <div className="px-5 h-12 flex items-center justify-between border-b border-kado-black">
            <h3 className="font-black tracking-tight text-lg">Scoring Formula</h3>
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">WEIGHTS</span>
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

        {/* Live Statistics */}
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

      {/* Recent trades */}
      {trades.length > 0 && (
        <div className="border border-kado-black">
          <div className="px-5 h-12 flex items-center justify-between border-b border-kado-black">
            <h3 className="font-black tracking-tight text-lg">Recent Bot Trades</h3>
            <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">{trades.length} TRADES</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse font-mono text-[11px]">
              <thead>
                <tr className="border-b border-kado-black/15">
                  {['Bot','Coin','Side','Entry','Exit','PnL','Result','Duration'].map(h => (
                    <th key={h} className="px-4 py-3 text-left tracking-[0.15em] uppercase text-kado-gray font-normal text-[9px]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trades.map((tr, i) => {
                  const win = tr.result === 'WIN';
                  const pnl = parseFloat(tr.pnl_usdt ?? 0);
                  return (
                    <tr key={i} className="border-b border-kado-black/8 hover:bg-kado-black/3">
                      <td className="px-4 py-2 uppercase text-[10px]">{tr.bot_source}</td>
                      <td className="px-4 py-2 font-bold">{tr.coin}</td>
                      <td className="px-4 py-2">{tr.action}</td>
                      <td className="px-4 py-2 text-kado-gray">{tr.entry_price ? (+tr.entry_price).toFixed(4) : '—'}</td>
                      <td className="px-4 py-2 text-kado-gray">{tr.exit_price  ? (+tr.exit_price).toFixed(4)  : '—'}</td>
                      <td className={`px-4 py-2 font-bold ${pnl >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}
                      </td>
                      <td className={`px-4 py-2 font-bold ${win ? 'text-green-700' : 'text-red-600'}`}>{tr.result ?? '—'}</td>
                      <td className="px-4 py-2 text-kado-gray">{tr.duration_min != null ? `${tr.duration_min}m` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
