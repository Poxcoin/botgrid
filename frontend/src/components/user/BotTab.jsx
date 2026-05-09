import React, { useState, useEffect, useCallback } from 'react';
import { authFetch } from '@/lib/api';
import { formatDistanceToNowStrict } from 'date-fns';
import { useLang } from '@/lib/LangContext';

const B    = 'rgba(255,255,255,0.06)';
const MUTED = '#555';
const MONO  = "'Courier New','SF Mono',monospace";

function StatBox({ label, value, sub, color, accent, live }) {
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
      <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: MONO, marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {live && <span className="pulse-dot" />}
        <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: MONO, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</div>
      </div>
      {sub && <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginTop: 8, fontFamily: MONO }}>{sub}</div>}
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

function priceDp(v) {
  if (!v) return 4;
  if (v >= 10000) return 1;
  if (v >= 100) return 2;
  return 4;
}

function PositionsTable({ positions }) {
  if (!positions || !positions.length) return null;
  return (
    <div style={{ border: `1px solid ${B}`, marginBottom: 24 }}>
      <div style={{ padding: '0 20px', height: 40, display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${B}` }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: MUTED }}>Open Positions</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--accent-green)' }}>{positions.length}</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${B}` }}>
              {['Symbol', 'Side', 'Lev', 'Entry', 'Mark', 'Unreal. PnL', 'ROE%', 'SL', 'TP', 'Liq'].map((h, i) => (
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
              return (
                <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.025)` }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '11px 20px', color: '#ccc', fontWeight: 700 }}>{p.symbol}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', fontWeight: 700, color: isLong ? 'var(--accent-green)' : 'var(--accent-red)' }}>{p.side}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: '#888' }}>{p.leverage ?? '—'}×</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: '#999' }}>{p.entry_price?.toFixed(priceDp(p.entry_price)) ?? '—'}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: '#999' }}>{p.mark_price?.toFixed(priceDp(p.mark_price)) ?? '—'}</td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', fontWeight: 700, color: isProfit ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {isProfit ? '+' : ''}{(p.unrealized_pnl ?? 0).toFixed(2)}
                  </td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: isProfit ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {isProfit ? '+' : ''}{p.pnl_pct ?? '—'}%
                  </td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: p.stop_loss ? 'var(--accent-red)' : '#333' }}>
                    {p.stop_loss?.toFixed(priceDp(p.stop_loss)) ?? '—'}
                  </td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: p.take_profit ? 'var(--accent-green)' : '#333' }}>
                    {p.take_profit?.toFixed(priceDp(p.take_profit)) ?? '—'}
                  </td>
                  <td style={{ padding: '11px 20px', textAlign: 'right', color: p.liq_price ? 'rgba(255,77,109,0.5)' : '#333' }}>
                    {p.liq_price?.toFixed(priceDp(p.liq_price)) ?? '—'}
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

function CoinBreakdown({ trades }) {
  if (!trades || !trades.length) return null;

  // Compute per-coin stats from live Bybit closed-pnl data
  const map = {};
  trades.forEach(t => {
    const coin = t.symbol || '?';
    if (!map[coin]) map[coin] = { trades: 0, pnl: 0, wins: 0 };
    map[coin].trades++;
    map[coin].pnl += t.pnl;
    if (t.pnl > 0) map[coin].wins++;
  });

  const rows = Object.entries(map)
    .map(([coin, s]) => ({ coin, trades: s.trades, pnl: Math.round(s.pnl * 100) / 100, wr: s.trades ? Math.round(s.wins / s.trades * 100) : 0 }))
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, 10);

  return (
    <div style={{ border: `1px solid ${B}`, marginBottom: 24 }}>
      <div style={{ padding: '0 20px', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${B}` }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: MUTED }}>Top Coins — 30d</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: '#333', letterSpacing: '0.12em' }}>LIVE · FROM BYBIT</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${B}` }}>
              {['Coin', 'Trades', 'Win Rate', 'PnL (USDT)'].map((h, i) => (
                <th key={h} style={{
                  textAlign: i === 0 ? 'left' : 'right', padding: '8px 20px',
                  fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase',
                  color: MUTED, fontWeight: 400,
                }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isPos = r.pnl >= 0;
              return (
                <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.025)` }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 20px', color: '#ccc', fontWeight: 700, letterSpacing: '0.04em' }}>{r.coin}</td>
                  <td style={{ padding: '10px 20px', textAlign: 'right', color: '#888' }}>{r.trades}</td>
                  <td style={{ padding: '10px 20px', textAlign: 'right', color: '#888' }}>{r.wr}%</td>
                  <td style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 700, color: isPos ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {isPos ? '+' : ''}{r.pnl}
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

export default function BotTab() {
  const { t } = useLang();
  const [feed,    setFeed]    = useState(null);
  const [intel,   setIntel]   = useState(null);
  const [summary, setSummary] = useState(null);
  const [pnl,     setPnl]     = useState(null);
  const [feedErr, setFeedErr] = useState(false);

  const loadFeed = useCallback(async () => {
    try {
      const res = await authFetch('/api/data');
      if (!res.ok) throw new Error();
      setFeed(await res.json());
      setFeedErr(false);
    } catch { setFeedErr(true); }
  }, []);

  const loadLive = useCallback(async () => {
    const [iRes, sRes, pRes] = await Promise.allSettled([
      authFetch('/api/intel'),
      authFetch('/api/users/bot-summary'),
      authFetch('/api/users/closed-pnl?days=30'),
    ]);
    if (iRes.status === 'fulfilled' && iRes.value.ok) setIntel(await iRes.value.json());
    if (sRes.status === 'fulfilled' && sRes.value.ok) setSummary(await sRes.value.json());
    if (pRes.status === 'fulfilled' && pRes.value.ok) setPnl(await pRes.value.json());
  }, []);

  useEffect(() => {
    loadFeed(); loadLive();
    const id = setInterval(() => { loadFeed(); loadLive(); }, 30000);
    return () => clearInterval(id);
  }, [loadFeed, loadLive]);

  const signals = feed?.latest_signals ?? [];
  const signalsToday = signals.filter(s =>
    new Date(s.timestamp).toDateString() === new Date().toDateString()
  ).length;

  const hasKey   = summary?.has_key ?? (summary?.balance !== null && summary?.balance !== undefined);
  const balance  = summary?.balance;
  const pnl30    = pnl?.total_pnl ?? 0;
  const trades30 = pnl?.total_trades ?? 0;
  const winRate  = pnl?.win_rate ?? 0;

  const headers = [t.dashboard.hTime, t.dashboard.hAsset, t.dashboard.hAction, t.dashboard.hScore, t.dashboard.hNews];

  return (
    <div>

      {/* ── Stats row ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatBox
          label={t.dashboard.bot.balance}
          value={balance ? `$${balance.wallet.toFixed(2)}` : '—'}
          sub={balance ? `Equity $${balance.equity.toFixed(2)}` : 'connect key'}
          color={balance ? 'var(--accent-green)' : MUTED}
          accent={balance ? 'green' : undefined}
          live={!!balance}
        />
        <StatBox
          label="30d PnL"
          value={hasKey ? `${pnl30 >= 0 ? '+' : ''}$${pnl30.toFixed(2)}` : '—'}
          sub={hasKey ? `${trades30} trades` : 'connect key'}
          color={pnl30 > 0 ? 'var(--accent-green)' : pnl30 < 0 ? 'var(--accent-red)' : 'var(--text-primary)'}
          accent={pnl30 > 0 ? 'green' : pnl30 < 0 ? 'red' : undefined}
        />
        <StatBox
          label={t.dashboard.bot.feedStatus}
          value={feedErr ? t.dashboard.bot.offline : t.dashboard.bot.live}
          color={feedErr ? 'var(--accent-red)' : 'var(--accent-green)'}
          accent={feedErr ? 'red' : 'green'}
          live={!feedErr}
          sub={intel
            ? [intel.sources?.rss && 'RSS', intel.sources?.telegram && 'TG', intel.sources?.liquidations && 'LIQ', intel.sources?.onchain && 'CHAIN'].filter(Boolean).join(' · ')
            : undefined}
        />
        <StatBox
          label="Win Rate"
          value={hasKey ? `${winRate}%` : '—'}
          sub={hasKey ? `${pnl?.wins ?? 0}W / ${pnl?.losses ?? 0}L` : 'connect key'}
          accent={winRate >= 50 ? 'green' : undefined}
        />
      </div>

      {/* ── No key banner ─────────────────────────────────────────────────── */}
      {!hasKey && summary !== null && <NoKeyBanner />}

      {/* ── Open positions ─────────────────────────────────────────────────── */}
      <PositionsTable positions={summary?.positions} />

      {/* ── Per-coin breakdown (live from Bybit) ──────────────────────────── */}
      <CoinBreakdown trades={pnl?.trades} />

      {/* ── Live Intel ─────────────────────────────────────────────────────── */}
      {intel && (
        <div style={{ border: `1px solid ${B}`, marginBottom: 24 }}>
          <div style={{ padding: '0 20px', height: 40, display: 'flex', alignItems: 'center', gap: 16, borderBottom: `1px solid ${B}` }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: MUTED }}>{t.dashboard.bot.liveIntel}</span>
            {intel.updated_at && (
              <span style={{ fontFamily: MONO, fontSize: 10, color: '#333' }}>
                {formatDistanceToNowStrict(new Date(intel.updated_at))} {t.dashboard.bot.ago}
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {['BTC', 'ETH', 'SOL', 'BNB'].map(coin => {
              const liq = intel.liquidations?.[coin];
              if (!liq) return <div key={coin} />;
              const sig = liq.signal;
              const col = sig === 'BEARISH' ? '#f87171' : sig === 'BULLISH' ? '#4ade80' : MUTED;
              return (
                <div key={coin} style={{ padding: '12px 20px', borderRight: `1px solid ${B}` }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>{coin}</div>
                  <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, color: col }}>{sig}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, marginTop: 2 }}>
                    ↑${(liq.long_liq_usd / 1000).toFixed(0)}K ↓${(liq.short_liq_usd / 1000).toFixed(0)}K
                  </div>
                </div>
              );
            })}
          </div>
          {intel.onchain && (
            <div style={{ borderTop: `1px solid ${B}`, padding: '10px 20px', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: MUTED, textTransform: 'uppercase', letterSpacing: '0.2em' }}>{t.dashboard.bot.onchainEth}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: intel.onchain.signal === 'BEARISH' ? '#f87171' : intel.onchain.signal === 'BULLISH' ? '#4ade80' : MUTED }}>
                {intel.onchain.signal}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>{t.dashboard.bot.toExchange} {intel.onchain.to_exchange_eth} ETH</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}>{t.dashboard.bot.fromExchange} {intel.onchain.from_exchange_eth} ETH</span>
            </div>
          )}
        </div>
      )}

      {/* ── Intelligence feed ──────────────────────────────────────────────── */}
      <div style={{ border: `1px solid ${B}` }}>
        <div style={{ padding: '0 20px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${B}` }}>
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED }}>{t.dashboard.bot.intelligenceFeed}</span>
          <span style={{ fontFamily: MONO, fontSize: 10, color: '#333' }}>{t.dashboard.bot.auto30s}</span>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${B}` }}>
                {headers.map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 20px', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: MUTED, fontFamily: MONO, fontWeight: 400 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {signals.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '40px 20px', textAlign: 'center', fontFamily: MONO, fontSize: 11, color: MUTED }}>
                    {feed === null ? t.dashboard.loading : t.dashboard.bot.noSignalsYet}
                  </td>
                </tr>
              ) : signals.map((s, i) => (
                <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.025)` }}>
                  <td style={{ padding: '12px 20px', fontFamily: MONO, fontSize: 11, color: MUTED }}>
                    {formatDistanceToNowStrict(new Date(s.timestamp))} {t.dashboard.bot.ago}
                  </td>
                  <td style={{ padding: '12px 20px', fontFamily: MONO, fontWeight: 700 }}>{s.coin}</td>
                  <td style={{ padding: '12px 20px' }}>
                    <span style={{
                      display: 'inline-block', fontFamily: MONO, fontSize: 11, fontWeight: 700,
                      letterSpacing: '0.15em', padding: '2px 8px',
                      background: s.action === 'LONG' ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
                      color: s.action === 'LONG' ? '#4ade80' : '#f87171',
                    }}>{s.action}</span>
                  </td>
                  <td style={{ padding: '12px 20px', fontFamily: MONO, fontWeight: 700 }}>
                    {typeof s.total_score === 'number' ? s.total_score.toFixed(1) : s.total_score}
                  </td>
                  <td style={{ padding: '12px 20px', color: '#666', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                    {s.news_title}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
