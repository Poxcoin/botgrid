import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { authFetch } from '@/lib/api';
import { useChartWidth } from '@/lib/useChartWidth';
import { useLang } from '@/lib/LangContext';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

const MONO = "'Courier New','SF Mono',monospace";

function dp(v) { if (!v) return 4; if (v >= 10000) return 1; if (v >= 100) return 2; return 4; }

function BalanceCard({ label, value, color, accent }) {
  const topBorder = accent === 'green' ? '2px solid var(--accent-green)'
                  : accent === 'red'   ? '2px solid var(--accent-red)'
                  : '1px solid var(--border-subtle)';
  return (
    <div
      style={{
        flex: 1, background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)', borderTop: topBorder,
        borderRadius: 12, padding: '20px 22px',
        transition: 'border-color 200ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
    >
      <div style={{ fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: MONO, marginBottom: 10 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: MONO, letterSpacing: '-.02em', lineHeight: 1.1 }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function NoKeyBanner() {
  const { t } = useLang();
  const ta = t.dashboard.analytics;
  return (
    <div style={{
      border: '1px solid var(--border-subtle)', padding: '32px 24px', marginBottom: 24,
      display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-primary)', marginBottom: 6 }}>
          {ta.noKeyTitle}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {ta.noKeyDesc}
        </div>
      </div>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'api-keys' }))}
        style={{
          background: 'var(--text-primary)', color: 'var(--bg-base)',
          border: 'none', padding: '9px 20px', fontFamily: MONO,
          fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          textTransform: 'uppercase', cursor: 'pointer', flexShrink: 0,
        }}
      >
        {ta.noKeyBtn}
      </button>
    </div>
  );
}

function PositionsTable({ positions }) {
  if (!positions || !positions.length) return null;
  const { t } = useLang();
  const td = t.dashboard;
  const cols = [td.analytics.hCoin, td.hSide, td.hLev, td.hQty, `${td.hValue} (USDT)`, td.hEntry, td.hMark, td.hUnrealPnl, td.hSL, td.hTP, td.hLiq];
  return (
    <div style={{ border: '1px solid var(--border-subtle)', marginBottom: 24 }}>
      <div style={{ padding: '0 20px', height: 40, display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{td.overview.openPositions}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--accent-green)' }}>{positions.length}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              {cols.map((h, i) => (
                <th key={h} style={{
                  textAlign: i === 0 ? 'left' : 'right', padding: '8px 20px',
                  fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase',
                  color: 'var(--text-muted)', fontWeight: 400,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.map((p, i) => {
              const isLong   = p.side === 'LONG';
              const isProfit = (p.unrealized_pnl ?? 0) >= 0;
              const qtyValue = (p.qty * (p.mark_price || p.entry_price || 0)).toFixed(2);
              return (
                <tr key={i} style={{ borderBottom: '1px solid var(--border-subtle)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '11px 20px', color: 'var(--text-primary)', fontWeight: 700 }}>{p.symbol}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', fontWeight: 700, color: isLong ? 'var(--accent-green)' : 'var(--accent-red)' }}>{p.side}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: 'var(--text-muted)' }}>{p.leverage ?? '—'}×</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: 'var(--text-secondary)' }}>{p.qty ?? '—'}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: 'var(--text-secondary)' }}>{qtyValue}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: 'var(--text-secondary)' }}>{p.entry_price?.toFixed(dp(p.entry_price)) ?? '—'}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: 'var(--text-secondary)' }}>{p.mark_price?.toFixed(dp(p.mark_price)) ?? '—'}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', fontWeight: 700, color: isProfit ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {isProfit ? '+' : ''}{(p.unrealized_pnl ?? 0).toFixed(2)}
                    {p.pnl_pct != null && (
                      <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.7 }}>({isProfit ? '+' : ''}{p.pnl_pct}%)</span>
                    )}
                  </td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: p.stop_loss ? 'var(--accent-red)' : 'var(--border-default)' }}>
                    {p.stop_loss?.toFixed(dp(p.stop_loss)) ?? '—'}
                  </td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: p.take_profit ? 'var(--accent-green)' : 'var(--border-default)' }}>
                    {p.take_profit?.toFixed(dp(p.take_profit)) ?? '—'}
                  </td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: p.liq_price ? 'rgba(255,77,109,0.5)' : 'var(--border-default)' }}>
                    {p.liq_price?.toFixed(dp(p.liq_price)) ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BotPerformanceCards({ bots }) {
  if (!bots || !bots.length) return null;
  const { t } = useLang();
  const td = t.dashboard;
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
        {td.botPerformance}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
        {bots.map((bot, i) => {
          const isPos = (bot.pnl ?? 0) >= 0;
          return (
            <div key={i} style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderTop: isPos ? '2px solid var(--accent-green)' : '2px solid var(--accent-red)',
              borderRadius: 12, padding: '16px 18px',
            }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8 }}>
                {bot.label || bot.source}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, letterSpacing: '-.02em', color: isPos ? 'var(--accent-green)' : 'var(--accent-red)', marginBottom: 8 }}>
                {isPos ? '+' : ''}${(bot.pnl ?? 0).toFixed(2)}
              </div>
              <div style={{ display: 'flex', gap: 16 }}>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>{td.analytics.hTrades}</div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-primary)' }}>{bot.trades ?? '—'}</div>
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>{td.overview.winRate}</div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-primary)' }}>{bot.win_rate != null ? `${bot.win_rate}%` : '—'}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const BOT_LABELS = {
  news: 'Signal Bot', signal: 'Signal Bot', altcoin: 'Altcoin Bot',
  grid: 'Grid Bot', fr: 'Funding Rate', fr_extreme: 'FR Extreme',
  funding: 'Funding Rate', cascade: 'Cascade', macro: 'Macro Forex',
  dex: 'DEX Bot', whale: 'Whale Tracker', listing: 'CEX Sniper',
  orderflow: 'Orderflow', sweep: 'Liq Sweep', ob: 'Order Block',
  orderblock: 'Order Block', sniper: 'CEX Sniper', bybit: 'Bybit Import',
  liq_cascade: 'Liq Cascade', other: 'Other',
};

function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
      padding: '4px 10px', cursor: 'pointer',
      border: `1px solid ${active ? 'var(--border-strong)' : 'var(--border-subtle)'}`,
      background: active ? 'var(--bg-overlay)' : 'transparent',
      color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    }}>
      {children}
    </button>
  );
}

const ChartTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isPos = d.cum >= 0;
  return (
    <div style={{
      background: 'var(--bg-base)', border: '1px solid var(--border-subtle)',
      padding: '8px 12px', fontFamily: MONO, fontSize: 11,
    }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{d.date}</div>
      <div style={{ color: isPos ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700 }}>
        {isPos ? '+' : ''}{d.cum.toFixed(2)} USDT
      </div>
      <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
        Trade: {d.pnl >= 0 ? '+' : ''}{d.pnl.toFixed(2)}
        {d.symbol && <span style={{ marginLeft: 8 }}>{d.symbol}</span>}
        {d.source && <span style={{ marginLeft: 6, opacity: 0.6 }}>{BOT_LABELS[d.source] || d.source}</span>}
      </div>
    </div>
  );
};

function PnlChart({ hasKey }) {
  const { t } = useLang();
  const td = t.dashboard;
  const [chartRef, chartW] = useChartWidth();
  const [days, setDays]           = useState(30);
  const [rawData, setRawData]     = useState(null);
  const [loading, setLoading]     = useState(false);
  const [botFilter, setBotFilter] = useState('all');
  const [coin, setCoin]           = useState('all');

  const load = useCallback(async () => {
    if (!hasKey) return;
    setLoading(true);
    try {
      const res = await authFetch(`/api/users/closed-pnl?days=${days}`);
      if (res.ok) setRawData(await res.json());
    } catch {}
    finally { setLoading(false); }
  }, [days, hasKey]);

  useEffect(() => { load(); }, [load]);

  const bots = useMemo(() => {
    if (!rawData?.trades?.length) return [];
    return [...new Set(rawData.trades.map(t => t.source || 'bybit'))];
  }, [rawData]);

  const coins = useMemo(() => {
    if (!rawData?.trades?.length) return [];
    return [...new Set(
      rawData.trades
        .filter(t => botFilter === 'all' || (t.source || 'bybit') === botFilter)
        .map(t => t.symbol)
    )].sort();
  }, [rawData, botFilter]);

  const chartData = useMemo(() => {
    if (!rawData?.trades?.length) return [];
    const filtered = [...rawData.trades]
      .filter(t => botFilter === 'all' || (t.source || 'bybit') === botFilter)
      .filter(t => coin === 'all' || t.symbol === coin)
      .reverse();
    let cum = 0;
    return filtered.map(t => {
      cum += parseFloat(t.pnl || 0);
      const ms = parseInt(t.closed_at);
      const d  = ms ? new Date(ms) : null;
      return {
        date:   d ? `${d.getDate()}/${d.getMonth() + 1} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : '—',
        cum:    Math.round(cum * 100) / 100,
        pnl:    parseFloat(t.pnl || 0),
        symbol: t.symbol,
        source: t.source,
      };
    });
  }, [rawData, botFilter, coin]);

  const stats = useMemo(() => {
    if (!rawData?.trades?.length) return null;
    const filtered = rawData.trades
      .filter(t => botFilter === 'all' || (t.source || 'bybit') === botFilter)
      .filter(t => coin === 'all' || t.symbol === coin);
    const pnl  = filtered.reduce((s, t) => s + parseFloat(t.pnl || 0), 0);
    const wins = filtered.filter(t => parseFloat(t.pnl) > 0).length;
    return {
      pnl:    pnl,
      trades: filtered.length,
      wr:     filtered.length ? Math.round(wins / filtered.length * 1000) / 10 : 0,
      wins,
      losses: filtered.length - wins,
    };
  }, [rawData, botFilter, coin]);

  const isPos  = chartData.length ? chartData[chartData.length - 1]?.cum >= 0 : true;
  const color  = isPos ? 'var(--accent-green)' : 'var(--accent-red)';

  return (
    <div style={{ border: '1px solid var(--border-subtle)', marginBottom: 24 }}>
      {/* Header */}
      <div style={{
        padding: '0 20px', height: 44, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)',
      }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          PnL Chart
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[7, 30, 90].map(d => (
            <FilterChip key={d} active={days === d} onClick={() => { setDays(d); setBotFilter('all'); setCoin('all'); }}>
              {d}d
            </FilterChip>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* Bot filter */}
        {bots.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 4 }}>{td.hBot}</span>
            <FilterChip active={botFilter === 'all'} onClick={() => { setBotFilter('all'); setCoin('all'); }}>{td.analytics.all}</FilterChip>
            {bots.map(b => (
              <FilterChip key={b} active={botFilter === b} onClick={() => { setBotFilter(b); setCoin('all'); }}>
                {BOT_LABELS[b] || b}
              </FilterChip>
            ))}
          </div>
        )}

        {/* Coin filter */}
        {coins.length > 1 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', marginRight: 4 }}>{td.analytics.hCoin}</span>
            <FilterChip active={coin === 'all'} onClick={() => setCoin('all')}>{td.analytics.all}</FilterChip>
            {coins.map(c => (
              <FilterChip key={c} active={coin === c} onClick={() => setCoin(c)}>{c}</FilterChip>
            ))}
          </div>
        )}

        {/* Stats row */}
        {stats && (
          <div style={{ display: 'flex', gap: 32, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: td.hPnL, val: `${stats.pnl >= 0 ? '+' : ''}$${stats.pnl.toFixed(2)}`, color: stats.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
              { label: td.analytics.hTrades, val: stats.trades },
              { label: td.overview.winRate, val: `${stats.wr}%` },
              { label: td.analytics.wl, val: `${stats.wins} / ${stats.losses}` },
            ].map(({ label, val, color: c }) => (
              <div key={label}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: c || 'var(--text-primary)' }}>{val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Chart */}
        {loading && <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>{td.loading}</div>}

        {!loading && !hasKey && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>
            {td.analytics.noKeyChart}
          </div>
        )}

        {!loading && hasKey && chartData.length < 2 && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)', padding: '40px 0', textAlign: 'center' }}>
            {td.analytics.notEnoughData}
          </div>
        )}

        {!loading && chartData.length >= 2 && (
          <div ref={chartRef} style={{ width: '100%', height: 220 }}>
            {chartW > 0 && (
              <AreaChart width={chartW} height={220} data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={isPos ? '#22c55e' : '#ef4444'} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={isPos ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: MONO }}
                  tickLine={false} axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: 'var(--text-muted)', fontSize: 9, fontFamily: MONO }}
                  tickLine={false} axisLine={false}
                  tickFormatter={v => `${v >= 0 ? '+' : ''}${v}`}
                  width={46}
                />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'var(--border-default)', strokeWidth: 1 }} />
                <Area
                  type="monotone" dataKey="cum"
                  stroke={isPos ? '#22c55e' : '#ef4444'} strokeWidth={1.5}
                  fill="url(#pnlGrad)" dot={false}
                  activeDot={{ r: 3, fill: isPos ? '#22c55e' : '#ef4444', strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              </AreaChart>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AssetsTab() {
  const { t } = useLang();
  const ta     = t.dashboard.analytics;
  const to     = t.dashboard.overview;
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/users/bot-summary');
      if (!res.ok) throw new Error();
      setSummary(await res.json());
    } catch (e) {
      // silently ignore — UI shows empty state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, [load]);

  const hasKey      = summary?.has_key ?? false;
  const balance     = summary?.balance;
  const equity      = loading ? '—' : balance?.equity != null ? `$${balance.equity.toFixed(2)}` : '—';
  const wallet      = loading ? '—' : balance?.wallet != null ? `$${balance.wallet.toFixed(2)}` : '—';
  const unrealTotal = summary?.total_unrealized ?? summary?.balance?.unrealized_pnl ?? null;
  const unrealVal   = loading ? '—' : unrealTotal != null ? `${unrealTotal >= 0 ? '+' : ''}$${unrealTotal.toFixed(2)}` : '—';
  const realVal     = loading ? '—' : summary?.total_realized != null ? `${summary.total_realized >= 0 ? '+' : ''}$${summary.total_realized.toFixed(2)}` : '—';

  const unrealColor = unrealTotal == null ? 'var(--text-primary)' : unrealTotal > 0 ? 'var(--accent-green)' : unrealTotal < 0 ? 'var(--accent-red)' : 'var(--text-primary)';
  const realColor   = summary?.total_realized == null ? 'var(--text-primary)' : summary.total_realized > 0 ? 'var(--accent-green)' : summary.total_realized < 0 ? 'var(--accent-red)' : 'var(--text-primary)';

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <BalanceCard
          label={ta.bEquity}
          value={equity}
          color={balance?.equity != null ? 'var(--accent-green)' : 'var(--text-muted)'}
          accent={balance?.equity != null ? 'green' : undefined}
        />
        <BalanceCard
          label={ta.bWallet}
          value={wallet}
          color={balance?.wallet != null ? 'var(--text-primary)' : 'var(--text-muted)'}
        />
        <BalanceCard
          label={ta.bUnrealized}
          value={unrealVal}
          color={unrealColor}
          accent={unrealTotal > 0 ? 'green' : unrealTotal < 0 ? 'red' : undefined}
        />
        <BalanceCard
          label={to.realized}
          value={realVal}
          color={realColor}
          accent={summary?.total_realized > 0 ? 'green' : summary?.total_realized < 0 ? 'red' : undefined}
        />
      </div>

      {!hasKey && !loading && summary !== null && <NoKeyBanner />}

      <PositionsTable positions={summary?.positions} />

      <BotPerformanceCards bots={summary?.bots} />

      <PnlChart hasKey={hasKey} />
    </div>
  );
}
