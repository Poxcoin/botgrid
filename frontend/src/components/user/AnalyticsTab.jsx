import React, { useState, useEffect, useCallback } from 'react';
import { useLang } from '@/lib/LangContext';

const MONO = "var(--font-mono)";
const FONT = "var(--font-sans)";

function getToken() {
  return localStorage.getItem('kado_token') || '';
}

function pct(wins, total) {
  if (!total) return '—';
  return (wins / total * 100).toFixed(1) + '%';
}

function StatCard({ label, value, sub }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, minWidth: 160,
        background: hovered ? 'var(--bg-elevated)' : 'var(--bg-base)',
        border: '1px solid var(--border-subtle)',
        padding: '28px 24px',
        transition: 'background 200ms',
      }}
    >
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 14 }}>
        {label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 28, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', marginTop: 8 }}>{sub}</div>
      )}
    </div>
  );
}

function SectionLabel({ title, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      borderBottom: '1px solid var(--border-subtle)', paddingBottom: 10, marginBottom: 16,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        {title}
      </div>
      {right && <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)' }}>{right}</div>}
    </div>
  );
}

function DailyChart({ daily, t }) {
  const [hover, setHover] = React.useState(null);

  if (!daily || !daily.length) {
    return (
      <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>
        {t.dashboard.analytics.noData30}
      </div>
    );
  }

  const W = 720, H = 200;
  const PAD_L = 52, PAD_R = 16, PAD_T = 16, PAD_B = 32;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;
  const pnls = daily.map(d => d.pnl);
  const maxAbs = Math.max(...pnls.map(Math.abs), 0.01);
  const barW = Math.max(3, Math.floor(chartW / daily.length) - 3);
  const step = chartW / daily.length;
  const yZero = PAD_T + chartH / 2;
  const yAxisVals = [-maxAbs, -maxAbs / 2, 0, maxAbs / 2, maxAbs];

  return (
    <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', padding: 16, position: 'relative' }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', display: 'block', fontFamily: MONO }}
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setHover(null)}
      >
        {yAxisVals.map((v, i) => {
          const y = PAD_T + chartH / 2 - (v / maxAbs) * (chartH / 2);
          const isZero = v === 0;
          return (
            <g key={i}>
              <line
                x1={PAD_L} x2={W - PAD_R} y1={y} y2={y}
                stroke={isZero ? 'var(--border-default)' : 'var(--border-subtle)'}
                strokeWidth={isZero ? 1 : 0.6}
                strokeDasharray={isZero ? '0' : '3 4'}
              />
              <text x={PAD_L - 8} y={y + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)">
                {isZero ? '0' : (v > 0 ? '+' : '') + v.toFixed(0)}
              </text>
            </g>
          );
        })}

        {daily.map((d, i) => {
          const x = PAD_L + i * step + (step - barW) / 2;
          const norm = d.pnl / maxAbs;
          const barH = Math.abs(norm) * (chartH / 2);
          const positive = d.pnl >= 0;
          const y = positive ? yZero - barH : yZero;
          const isHovered = hover === i;
          return (
            <g key={i} onMouseEnter={() => setHover(i)} style={{ cursor: 'pointer' }}>
              <rect x={x - 2} y={PAD_T} width={barW + 4} height={chartH} fill="transparent" />
              <rect
                x={x} y={y} width={barW} height={Math.max(barH, 1)}
                fill={isHovered ? 'var(--text-primary)' : 'var(--text-muted)'}
                rx={1}
              />
              {i % Math.max(1, Math.floor(daily.length / 6)) === 0 && (
                <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
                  {d.date ? d.date.slice(5) : ''}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {hover != null && daily[hover] && (
        <div style={{
          position: 'absolute',
          left: `${((PAD_L + hover * step + step / 2) / W) * 100}%`,
          top: 8,
          transform: 'translateX(-50%)',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          padding: '8px 12px',
          fontSize: 11,
          fontFamily: MONO,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
        }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
            {daily[hover].date}
          </div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 13 }}>
            {daily[hover].pnl >= 0 ? '+' : ''}{daily[hover].pnl.toFixed(2)} USDT
          </div>
        </div>
      )}
    </div>
  );
}

function DataTable({ cols, rows, getRowColor }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th key={c.key} style={{
                textAlign: c.align || 'left', padding: '6px 12px',
                borderBottom: '1px solid var(--border-subtle)',
                color: 'var(--text-muted)', fontWeight: 400, letterSpacing: '0.1em', fontSize: 9, textTransform: 'uppercase',
              }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}
              style={{ borderBottom: '1px solid var(--border-subtle)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {cols.map(c => (
                <td key={c.key} style={{
                  padding: '9px 12px',
                  textAlign: c.align || 'left',
                  color: (getRowColor && getRowColor(c.key, r)) || (c.muted ? 'var(--text-muted)' : 'var(--text-secondary)'),
                  fontWeight: c.bold ? 600 : 400,
                }}>
                  {c.render ? c.render(r) : (r[c.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradeRow({ tr }) {
  const closedMs = parseInt(tr.closed_at);
  const dateStr = closedMs ? new Date(closedMs).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit' }) : '—';
  const pnl = tr.pnl ?? 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 12px',
      border: '1px solid var(--border-subtle)',
      background: 'var(--bg-base)',
    }}>
      <div>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-primary)', fontWeight: 600 }}>{tr.coin}</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', marginLeft: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {tr.side}
        </span>
        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', marginTop: 2 }}>
          {dateStr}
          {tr.duration_min != null && <span style={{ marginLeft: 6 }}>{tr.duration_min}m</span>}
          {tr.source && <span style={{ marginLeft: 6, opacity: 0.6 }}>{tr.source}</span>}
        </div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
        {pnl >= 0 ? '+' : ''}{pnl}
      </div>
    </div>
  );
}

function Skeleton({ w = '100%', h = 18 }) {
  return (
    <div style={{
      width: w, height: h,
      background: 'var(--bg-elevated)',
      animation: 'kado-skeleton 1.4s ease-in-out infinite',
    }} />
  );
}

function CoinCard({ r, maxAbsPnl }) {
  const [hovered, setHovered] = React.useState(false);
  const pnl = parseFloat(r.pnl) || 0;
  const pos = pnl >= 0;
  const wr = r.trades ? Math.round(r.wins / r.trades * 100) : 0;
  const barW = maxAbsPnl > 0 ? Math.abs(pnl) / maxAbsPnl : 0;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 5,
        padding: '10px 12px 10px',
        background: hovered ? 'var(--bg-elevated)' : 'transparent',
        border: `1px solid ${hovered ? 'var(--border-strong)' : 'var(--border-default)'}`,
        textAlign: 'left', minWidth: 112,
        transition: 'background 120ms, border-color 120ms',
        cursor: 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>{r.coin}</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: pos ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>
          {pos ? '+' : ''}{pnl.toFixed(2)}
        </span>
      </div>
      {/* PnL bar */}
      <div style={{ height: 2, background: 'var(--border-subtle)', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: 0, left: pos ? '50%' : `${(0.5 - barW * 0.5) * 100}%`,
          width: `${barW * 50}%`,
          height: '100%',
          background: pos ? 'var(--accent-green)' : 'var(--accent-red)',
          opacity: 0.8,
        }} />
        <div style={{ position: 'absolute', top: 0, left: '50%', width: 1, height: '100%', background: 'var(--border-default)' }} />
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)' }}>
        <span style={{ color: 'var(--accent-green)', marginRight: 4 }}>{r.wins}W</span>
        <span style={{ color: 'var(--accent-red)', marginRight: 4 }}>{r.trades - r.wins}L</span>
        <span style={{ color: wr >= 50 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{wr}%</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
        {r.trades} trades
      </div>
    </div>
  );
}

function CoinGrid({ coins }) {
  const sorted = [...coins].sort((a, b) => parseFloat(b.pnl) - parseFloat(a.pnl));
  const maxAbsPnl = Math.max(...sorted.map(r => Math.abs(parseFloat(r.pnl) || 0)), 0.01);
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {sorted.map(r => <CoinCard key={r.coin} r={r} maxAbsPnl={maxAbsPnl} />)}
    </div>
  );
}

export default function AnalyticsTab() {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [allTrades, setAllTrades] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${getToken()}` };
      const [analyticsRes, tradesRes, balanceRes] = await Promise.all([
        fetch('/api/users/analytics', { headers }),
        fetch('/api/users/closed-pnl?days=0', { headers }),
        fetch('/api/users/balance', { headers }),
      ]);
      if (!analyticsRes.ok) throw new Error(`HTTP ${analyticsRes.status}`);
      setData(await analyticsRes.json());
      if (tradesRes.ok) {
        const j = await tradesRes.json();
        setAllTrades(j.trades || []);
      }
      if (balanceRes.ok) setBalance(await balanceRes.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div>
        <style>{`@keyframes kado-skeleton { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
        <div style={{ display: 'flex', gap: 1, marginBottom: 1, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ flex: 1, minWidth: 140, background: 'var(--bg-base)', padding: '28px 24px' }}>
              <Skeleton w={60} h={9} />
              <div style={{ marginTop: 14 }}><Skeleton w={100} h={26} /></div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 1 }}><Skeleton h={200} /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-muted)', padding: '40px 0' }}>
        <div style={{ marginBottom: 12, letterSpacing: '0.08em' }}>{t.dashboard.analytics.errorPrefix} {error}</div>
        <button onClick={fetchData} style={{
          background: 'none', border: '1px solid var(--border-default)', color: 'var(--text-muted)',
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
          padding: '7px 16px', cursor: 'pointer',
        }}>
          {t.dashboard.analytics.retry}
        </button>
      </div>
    );
  }

  const { summary, by_coin, daily, best, worst } = data || {};
  const hasKey = data?.has_key ?? false;
  const noData = data !== null
    && (summary?.total_trades ?? 0) === 0
    && !daily?.length
    && !by_coin?.length;

  if (noData && !hasKey) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>
          No API key connected
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-muted)', marginBottom: 28, lineHeight: 1.6 }}>
          Connect your Bybit API key to see personal analytics —<br />balance, PnL, trade history and coin breakdown.
        </div>
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'api-keys' }))}
          style={{
            background: 'var(--text-primary)', color: 'var(--bg-base)',
            border: 'none', padding: '10px 24px',
            fontFamily: MONO, fontSize: 11, fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            cursor: 'pointer',
          }}
        >
          Add API Key →
        </button>
      </div>
    );
  }

  if (noData && hasKey) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px', textAlign: 'center' }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>
          No trades yet
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          API key connected. Analytics will appear here once<br />the bot executes trades on your account.
        </div>
      </div>
    );
  }

  const winRate = summary?.total_trades ? pct(summary.wins, summary.total_trades) : '—';
  const totalPnl = summary?.total_pnl ?? 0;
  const bestDay = daily?.length ? daily.reduce((a, b) => (b.pnl > a.pnl ? b : a), daily[0]) : null;

  const botCols = [
    { key: 'source', label: t.dashboard.analytics.hSource, bold: true },
    { key: 'trades', label: t.dashboard.analytics.hTrades, align: 'right' },
    { key: '_wr', label: t.dashboard.analytics.hWinRate, align: 'right', render: r => pct(r.wins, r.trades) },
    { key: 'pnl', label: t.dashboard.analytics.hPnlUsdt, align: 'right', render: r => `${r.pnl >= 0 ? '+' : ''}${r.pnl}` },
    { key: 'avg_win', label: t.dashboard.analytics.hAvgWin, align: 'right', render: r => r.avg_win > 0 ? `+${r.avg_win}` : r.avg_win },
    { key: 'avg_loss', label: t.dashboard.analytics.hAvgLoss, align: 'right', muted: true },
  ];

  const coinCols = [
    { key: 'coin', label: t.dashboard.analytics.hCoin, bold: true },
    { key: 'trades', label: t.dashboard.analytics.hTrades, align: 'right' },
    { key: '_wr', label: t.dashboard.analytics.hWinRate, align: 'right', render: r => pct(r.wins, r.trades) },
    { key: 'pnl', label: t.dashboard.analytics.hPnlUsdt, align: 'right', render: r => `${r.pnl >= 0 ? '+' : ''}${r.pnl}` },
  ];

  const allTradesCols = [
    { key: 'date', label: 'Date', muted: true, render: r => { const ms = parseInt(r.closed_at); return ms ? new Date(ms).toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'; } },
    { key: 'symbol', label: 'Symbol', bold: true, render: r => r.symbol || '—' },
    { key: 'side', label: 'Side', render: r => r.side || '—' },
    { key: 'entry_price', label: 'Entry', render: r => r.entry_price ? (+r.entry_price).toFixed(4) : '—' },
    { key: 'exit_price', label: 'Exit', render: r => r.exit_price ? (+r.exit_price).toFixed(4) : '—' },
    { key: 'qty', label: 'Qty', muted: true, render: r => r.qty ? (+r.qty).toFixed(3) : '—' },
    { key: 'source', label: 'Source', muted: true },
    { key: 'pnl', label: 'PnL', align: 'right', bold: true, render: r => `${(r.pnl ?? 0) >= 0 ? '+' : ''}${(r.pnl ?? 0).toFixed(2)}` },
  ];

  const sign = v => (v >= 0 ? '+' : '') + parseFloat(v ?? 0).toFixed(2);
  const upnl = balance?.unrealized_pnl ?? 0;

  return (
    <div style={{ color: 'var(--text-primary)', fontFamily: FONT }}>
      <style>{`@keyframes kado-skeleton { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>

      {/* Balance bar */}
      {balance && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 0,
          border: '1px solid var(--border-subtle)',
          background: 'var(--border-subtle)',
          marginBottom: 1,
        }}>
          {[
            { label: 'Wallet',      value: `$${parseFloat(balance.usdt_wallet ?? 0).toFixed(2)}`,   color: null },
            { label: 'Equity',      value: `$${parseFloat(balance.usdt_equity ?? 0).toFixed(2)}`,   color: null },
            { label: 'Unrealized',  value: `${sign(upnl)} USDT`,  color: upnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
            { label: 'Available',   value: `$${parseFloat(balance.usdt_free ?? 0).toFixed(2)}`,     color: null },
          ].map((s, i, arr) => (
            <div key={s.label} style={{
              padding: '18px 20px',
              background: 'var(--bg-base)',
              borderRight: i < arr.length - 1 ? '1px solid var(--border-subtle)' : 'none',
            }}>
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>{s.label}</div>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: s.color || 'var(--text-primary)' }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Stats row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
        gap: 1,
        background: 'var(--border-subtle)',
        marginBottom: 32,
        marginTop: balance ? 1 : 0,
      }}>
        <StatCard
          label={t.dashboard.analytics.totalTrades}
          value={summary?.total_trades ?? 0}
          sub={`${summary?.wins ?? 0}W · ${summary?.losses ?? 0}L`}
        />
        <StatCard
          label={t.dashboard.analytics.totalPnl}
          value={`${totalPnl >= 0 ? '+' : ''}${totalPnl} USDT`}
        />
        <StatCard
          label={t.dashboard.analytics.winRate}
          value={winRate}
          sub={`${summary?.wins ?? 0} ${t.dashboard.analytics.wins}`}
        />
        <StatCard
          label={t.dashboard.analytics.bestDay}
          value={bestDay ? `${bestDay.pnl >= 0 ? '+' : ''}${bestDay.pnl}` : '—'}
          sub={bestDay?.date ?? ''}
        />
      </div>

      {/* By coin — card grid like bot CoinTicker */}
      {by_coin && by_coin.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title={t.dashboard.analytics.byCoin} right={`${by_coin.length} ${t.dashboard.analytics.coinsSort}`} />
          <CoinGrid coins={by_coin} />
        </div>
      )}

      {/* By bot source */}
      {(data?.by_source?.length > 0) && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel
            title={t.dashboard.analytics.byBotSource}
            right={`${data.by_source.length} ${t.dashboard.analytics.sources}`}
          />
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
            <DataTable cols={botCols} rows={data.by_source}
              getRowColor={(k, r) => k === 'pnl' ? (parseFloat(r.pnl) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : null}
            />
          </div>
        </div>
      )}

      {/* All trades — single column, newest first */}
      {allTrades.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title="All Trades" right={`${allTrades.length} total`} />
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
            <DataTable
              cols={allTradesCols}
              rows={[...allTrades].sort((a, b) => parseInt(b.closed_at) - parseInt(a.closed_at))}
              getRowColor={(k, r) => k === 'pnl' ? ((r.pnl ?? 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : null}
            />
          </div>
        </div>
      )}

      <div style={{ paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>
        <button onClick={fetchData} style={{
          background: 'none', border: '1px solid var(--border-default)', color: 'var(--text-muted)',
          fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase',
          padding: '8px 20px', cursor: 'pointer', transition: 'border-color 150ms, color 150ms',
        }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          {t.dashboard.refresh}
        </button>
      </div>
    </div>
  );
}
