import React, { useState, useEffect } from 'react';
import { authFetch } from '@/lib/api';
import { formatDistanceToNowStrict } from 'date-fns';
import { useLang } from '@/lib/LangContext';

const B = 'rgba(255,255,255,0.06)';
const MUTED = '#555';
const MONO = "'Courier New','SF Mono',monospace";

function StatBox({ label, value, sub, color, live }) {
  return (
    <div
      style={{
        flex: 1,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 8,
        padding: '20px 22px',
        transition: 'border-color 200ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
    >
      <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: MONO, marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {live && <span className="pulse-dot" />}
        <div style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text-primary)', fontFamily: MONO, letterSpacing: '-0.02em', lineHeight: 1.1 }}>{value}</div>
      </div>
      {sub && <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginTop: 8, fontFamily: MONO }}>{sub}</div>}
    </div>
  );
}

export default function BotTab() {
  const { t } = useLang();
  const [data,  setData]  = useState(null);
  const [intel, setIntel] = useState(null);
  const [error, setError] = useState(false);

  const load = async () => {
    try {
      const res = await authFetch('/api/data');
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError(false);
    } catch { setError(true); }
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
  const feed = data?.latest_signals ?? [];
  const signalsToday = feed.filter(s =>
    new Date(s.timestamp).toDateString() === new Date().toDateString()
  ).length;

  const headers = [t.dashboard.hTime, t.dashboard.hAsset, t.dashboard.hAction, t.dashboard.hScore, t.dashboard.hNews];

  return (
    <div>
      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <StatBox label={t.dashboard.bot.balance} value={`$${balance.total.toFixed(2)}`} sub={`${t.dashboard.bot.free} $${balance.free.toFixed(2)}`} color="var(--accent-green)" />
        <StatBox label={t.dashboard.bot.signalsToday} value={signalsToday} sub={t.dashboard.bot.last24h} />
        <StatBox
          label={t.dashboard.bot.feedStatus}
          value={error ? t.dashboard.bot.offline : t.dashboard.bot.live}
          color={error ? 'var(--accent-red)' : 'var(--accent-green)'}
          live={!error}
          sub={intel
            ? [intel.sources?.rss && 'RSS', intel.sources?.telegram && 'TG', intel.sources?.liquidations && 'LIQ', intel.sources?.onchain && 'CHAIN'].filter(Boolean).join(' · ')
            : '...'}
        />
      </div>

      {/* Live Intel */}
      {intel && (
        <div style={{ border: `1px solid ${B}`, marginTop: 24 }}>
          <div style={{ padding: '0 20px', height: 40, display: 'flex', alignItems: 'center', gap: 16, borderBottom: `1px solid ${B}` }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: MUTED }}>{t.dashboard.bot.liveIntel}</span>
            {intel.updated_at && (
              <span style={{ fontFamily: MONO, fontSize: 10, color: '#333' }}>
                {formatDistanceToNowStrict(new Date(intel.updated_at))} {t.dashboard.bot.ago}
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {['BTC','ETH','SOL','BNB'].map(coin => {
              const liq = intel.liquidations?.[coin];
              if (!liq) return <div key={coin} />;
              const sig = liq.signal;
              const col = sig === 'BEARISH' ? '#f87171' : sig === 'BULLISH' ? '#4ade80' : MUTED;
              return (
                <div key={coin} style={{ padding: '12px 20px', borderRight: `1px solid ${B}` }}>
                  <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: MUTED, marginBottom: 4 }}>{coin}</div>
                  <div style={{ fontFamily: MONO, fontWeight: 700, fontSize: 13, color: col }}>{sig}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: MUTED, marginTop: 2 }}>
                    ↑${(liq.long_liq_usd/1000).toFixed(0)}K ↓${(liq.short_liq_usd/1000).toFixed(0)}K
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

      {/* Live Feed */}
      <div style={{ border: `1px solid ${B}`, marginTop: 24 }}>
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
              {feed.length === 0 ? (
                <tr><td colSpan={5} style={{ padding: '40px 20px', textAlign: 'center', fontFamily: MONO, fontSize: 11, color: MUTED }}>
                  {data === null ? t.dashboard.loading : t.dashboard.bot.noSignalsYet}
                </td></tr>
              ) : feed.map((s, i) => (
                <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.025)` }}>
                  <td style={{ padding: '12px 20px', fontFamily: MONO, fontSize: 11, color: MUTED }}>
                    {formatDistanceToNowStrict(new Date(s.timestamp))} {t.dashboard.bot.ago}
                  </td>
                  <td style={{ padding: '12px 20px', fontFamily: MONO, fontWeight: 700 }}>{s.coin}</td>
                  <td style={{ padding: '12px 20px' }}>
                    <span style={{
                      display: 'inline-block', fontFamily: MONO, fontSize: 11, fontWeight: 700,
                      letterSpacing: '0.15em', padding: '3px 10px', borderRadius: 4,
                      background: s.action === 'LONG'  ? 'rgba(0,212,170,0.12)'
                                : s.action === 'SHORT' ? 'rgba(255,77,109,0.12)'
                                : 'rgba(255,255,255,0.06)',
                      border:     s.action === 'LONG'  ? '1px solid rgba(0,212,170,0.25)'
                                : s.action === 'SHORT' ? '1px solid rgba(255,77,109,0.25)'
                                : '1px solid rgba(255,255,255,0.12)',
                      color:      s.action === 'LONG'  ? '#00d4aa'
                                : s.action === 'SHORT' ? '#ff4d6d'
                                : '#888',
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
