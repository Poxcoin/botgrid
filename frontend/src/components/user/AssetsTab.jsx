import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { authFetch } from '@/lib/api';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const MONO = "'Courier New','SF Mono',monospace";
const B    = 'rgba(255,255,255,0.06)';
const MUTED = '#555';

function dp(v) { if (!v) return 4; if (v >= 10000) return 1; if (v >= 100) return 2; return 4; }

function BalanceCard({ label, value, color, accent, live }) {
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
        {live && <span className="pulse-dot" />}
        <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: MONO, letterSpacing: '-.02em', lineHeight: 1.1 }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function NoKeyBanner() {
  return (
    <div style={{
      border: `1px solid ${B}`, padding: '32px 24px', marginBottom: 24,
      display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
    }}>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: '#ccc', marginBottom: 6 }}>
          No Bybit API key connected
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, lineHeight: 1.6 }}>
          Connect your key to see live balance, positions and trade history.
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
        Add API Key →
      </button>
    </div>
  );
}

function PositionsTable({ positions }) {
  if (!positions || !positions.length) return null;
  const cols = ['Coin', 'Side', 'Lev', 'Qty', 'Value (USDT)', 'Entry', 'Mark', 'Unreal PnL', 'SL', 'TP', 'Liq'];
  return (
    <div style={{ border: `1px solid ${B}`, marginBottom: 24 }}>
      <div style={{ padding: '0 20px', height: 40, display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${B}` }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: MUTED }}>Open Positions</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--accent-green)' }}>{positions.length}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${B}` }}>
              {cols.map((h, i) => (
                <th key={h} style={{
                  textAlign: i === 0 ? 'left' : 'right', padding: '8px 20px',
                  fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase',
                  color: MUTED, fontWeight: 400,
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
                <tr key={i} style={{ borderBottom: 'rgba(255,255,255,0.025) solid 1px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '11px 20px', color: '#ccc', fontWeight: 700 }}>{p.symbol}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', fontWeight: 700, color: isLong ? 'var(--accent-green)' : 'var(--accent-red)' }}>{p.side}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: '#888' }}>{p.leverage ?? '—'}×</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: '#999' }}>{p.qty ?? '—'}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: '#999' }}>{qtyValue}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: '#999' }}>{p.entry_price?.toFixed(dp(p.entry_price)) ?? '—'}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: '#999' }}>{p.mark_price?.toFixed(dp(p.mark_price)) ?? '—'}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', fontWeight: 700, color: isProfit ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {isProfit ? '+' : ''}{(p.unrealized_pnl ?? 0).toFixed(2)}
                    {p.pnl_pct != null && (
                      <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.7 }}>({isProfit ? '+' : ''}{p.pnl_pct}%)</span>
                    )}
                  </td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: p.stop_loss ? 'var(--accent-red)' : '#333' }}>
                    {p.stop_loss?.toFixed(dp(p.stop_loss)) ?? '—'}
                  </td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: p.take_profit ? 'var(--accent-green)' : '#333' }}>
                    {p.take_profit?.toFixed(dp(p.take_profit)) ?? '—'}
                  </td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: p.liq_price ? 'rgba(255,77,109,0.5)' : '#333' }}>
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
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: MUTED, marginBottom: 12 }}>
        Bot Performance
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
                  <div style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>Trades</div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: '#ccc' }}>{bot.trades ?? '—'}</div>
                </div>
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 9, color: MUTED, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>Win Rate</div>
                  <div style={{ fontFamily: MONO, fontSize: 13, color: '#ccc' }}>{bot.win_rate != null ? `${bot.win_rate}%` : '—'}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const BOT_LABELS = { signal: 'Signal', grid: 'Grid', altcoin: 'Altcoin', funding: 'Funding', bybit: 'Bybit' };

function FilterChip({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
      padding: '4px 10px', cursor: 'pointer',
      border: `1px solid ${active ? 'rgba(255,255,255,0.4)' : B}`,
      background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
      color: active ? '#fff' : MUTED,
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
      background: '#111', border: `1px solid ${B}`,
      padding: '8px 12px', fontFamily: MONO, fontSize: 11,
    }}>
      <div style={{ color: MUTED, marginBottom: 4 }}>{d.date}</div>
      <div style={{ color: isPos ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700 }}>
        {isPos ? '+' : ''}{d.cum.toFixed(2)} USDT
      </div>
      <div style={{ color: MUTED, marginTop: 2 }}>
        Trade: {d.pnl >= 0 ? '+' : ''}{d.pnl.toFixed(2)}
        {d.symbol && <span style={{ marginLeft: 8 }}>{d.symbol}</span>}
        {d.source && <span style={{ marginLeft: 6, opacity: 0.6 }}>{BOT_LABELS[d.source] || d.source}</span>}
      </div>
    </div>
  );
};

function PnlChart({ hasKey }) {
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
    <div style={{ border: `1px solid ${B}`, marginBottom: 24 }}>
      {/* Header */}
      <div style={{
        padding: '0 20px', height: 44, display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: `1px solid ${B}`,
      }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: MUTED }}>
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
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED, marginRight: 4 }}>Bot</span>
            <FilterChip active={botFilter === 'all'} onClick={() => { setBotFilter('all'); setCoin('all'); }}>All</FilterChip>
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
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED, marginRight: 4 }}>Coin</span>
            <FilterChip active={coin === 'all'} onClick={() => setCoin('all')}>All</FilterChip>
            {coins.map(c => (
              <FilterChip key={c} active={coin === c} onClick={() => setCoin(c)}>{c}</FilterChip>
            ))}
          </div>
        )}

        {/* Stats row */}
        {stats && (
          <div style={{ display: 'flex', gap: 32, marginBottom: 16, flexWrap: 'wrap' }}>
            {[
              { label: 'PnL', val: `${stats.pnl >= 0 ? '+' : ''}$${stats.pnl.toFixed(2)}`, color: stats.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
              { label: 'Trades', val: stats.trades },
              { label: 'Win Rate', val: `${stats.wr}%` },
              { label: 'W / L', val: `${stats.wins} / ${stats.losses}` },
            ].map(({ label, val, color: c }) => (
              <div key={label}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>{label}</div>
                <div style={{ fontFamily: MONO, fontSize: 16, fontWeight: 700, color: c || '#ccc' }}>{val}</div>
              </div>
            ))}
          </div>
        )}

        {/* Chart */}
        {loading && <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, padding: '40px 0', textAlign: 'center' }}>Loading…</div>}

        {!loading && !hasKey && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, padding: '40px 0', textAlign: 'center' }}>
            Connect API key to see chart
          </div>
        )}

        {!loading && hasKey && chartData.length < 2 && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: MUTED, padding: '40px 0', textAlign: 'center' }}>
            Not enough data for selected filters
          </div>
        )}

        {!loading && chartData.length >= 2 && (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={isPos ? '#22c55e' : '#ef4444'} stopOpacity={0.15} />
                  <stop offset="95%" stopColor={isPos ? '#22c55e' : '#ef4444'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#444', fontSize: 9, fontFamily: MONO }}
                tickLine={false} axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: '#444', fontSize: 9, fontFamily: MONO }}
                tickLine={false} axisLine={false}
                tickFormatter={v => `${v >= 0 ? '+' : ''}${v}`}
                width={46}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }} />
              <Area
                type="monotone" dataKey="cum"
                stroke={isPos ? '#22c55e' : '#ef4444'} strokeWidth={1.5}
                fill="url(#pnlGrad)" dot={false}
                activeDot={{ r: 3, fill: isPos ? '#22c55e' : '#ef4444', strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function AssetsTab() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await authFetch('/api/users/bot-summary');
      if (!res.ok) throw new Error();
      setSummary(await res.json());
    } catch (e) {
      console.error('AssetsTab: failed to load bot-summary', e);
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
          label="Total Equity"
          value={equity}
          color={balance?.equity != null ? 'var(--accent-green)' : MUTED}
          accent={balance?.equity != null ? 'green' : undefined}
          live={!!balance}
        />
        <BalanceCard
          label="Wallet Balance"
          value={wallet}
          color={balance?.wallet != null ? 'var(--text-primary)' : MUTED}
        />
        <BalanceCard
          label="Unrealized PnL"
          value={unrealVal}
          color={unrealColor}
          accent={unrealTotal > 0 ? 'green' : unrealTotal < 0 ? 'red' : undefined}
        />
        <BalanceCard
          label="Realized PnL (All Time)"
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
