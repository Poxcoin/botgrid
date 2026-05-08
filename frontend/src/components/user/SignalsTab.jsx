import React, { useState, useEffect } from 'react';
import { authFetch } from '@/lib/api';
import { format } from 'date-fns';
import { useLang } from '@/lib/LangContext';

const B = 'rgba(255,255,255,0.06)';
const MUTED = '#555';
const MONO = "'Courier New','SF Mono',monospace";
const PAGE_SIZE = 20;

const sel = {
  background: '#0f0f0f', border: `1px solid rgba(255,255,255,0.1)`,
  color: '#fff', padding: '6px 10px', fontSize: 11,
  fontFamily: MONO, outline: 'none', letterSpacing: '0.08em',
};

function StatBox({ label, value, color }) {
  return (
    <div style={{ border: `1px solid ${B}`, padding: '14px 20px', flex: 1 }}>
      <div style={{ fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: MUTED, fontFamily: MONO, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: color || '#fff', fontFamily: MONO }}>{value}</div>
    </div>
  );
}

export default function SignalsTab() {
  const { t } = useLang();
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

  useEffect(() => {
    authFetch('/api/stats').then(r => r.ok ? r.json() : null).then(d => d && setStats(d)).catch(() => {});
  }, []);

  useEffect(() => { setPage(1); loadHistory(1, coin, action); }, [coin, action]);
  useEffect(() => { loadHistory(page, coin, action); }, [page]);

  const pnlColor = stats?.total_pnl >= 0 ? '#4ade80' : '#f87171';

  const headers = [
    t.dashboard.hTime, t.dashboard.hAsset, t.dashboard.hAction, t.dashboard.hScore,
    t.dashboard.signals.hGroq, t.dashboard.hSource, t.dashboard.signals.hAge,
    t.dashboard.signals.hResult, t.dashboard.hPnL, t.dashboard.hNews,
  ];

  return (
    <div>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)' }}>
        <StatBox label={t.dashboard.signals.totalSignals} value={stats?.total_trades ?? '—'} />
        <StatBox label={t.dashboard.signals.winRate} value={stats?.win_rate != null ? `${stats.win_rate.toFixed(1)}%` : '—'} color="#4ade80" />
        <StatBox label={t.dashboard.signals.longCount} value={stats?.long_count ?? '—'} />
        <StatBox label={t.dashboard.signals.shortCount} value={stats?.short_count ?? '—'} />
        <StatBox label={t.dashboard.signals.totalPnl} value={stats?.total_pnl != null ? `${stats.total_pnl >= 0 ? '+' : ''}$${stats.total_pnl.toFixed(2)}` : '—'} color={pnlColor} />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px', border: `1px solid ${B}`, marginTop: 24 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: MUTED }}>{t.dashboard.signals.filters}</span>
        <select value={coin} onChange={e => { setCoin(e.target.value); setPage(1); }} style={sel}>
          <option value="">{t.dashboard.signals.allAssets}</option>
          {['BTC','ETH','SOL','XRP','ADA','DOT','LINK','UNI','AAVE','SUI','APT','OP','NEAR','INJ','FET'].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select value={action} onChange={e => { setAction(e.target.value); setPage(1); }} style={sel}>
          <option value="">{t.dashboard.signals.allActions}</option>
          <option value="LONG">LONG</option>
          <option value="SHORT">SHORT</option>
        </select>
      </div>

      {/* Table */}
      <div style={{ border: `1px solid ${B}`, marginTop: 0, borderTop: 'none' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${B}` }}>
                {headers.map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED, fontFamily: MONO, fontWeight: 400, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.signals.length === 0 ? (
                <tr><td colSpan={10} style={{ padding: '40px 20px', textAlign: 'center', fontFamily: MONO, fontSize: 11, color: MUTED }}>{t.dashboard.signals.noSignalsFound}</td></tr>
              ) : data.signals.map((s, i) => {
                const pnl = s.pnl_usdt;
                return (
                  <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.025)` }}>
                    <td style={{ padding: '10px 16px', fontFamily: MONO, fontSize: 10, color: MUTED, whiteSpace: 'nowrap' }}>
                      {format(new Date(s.timestamp), 'MM-dd HH:mm')}
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: MONO, fontWeight: 700 }}>{s.coin}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        display: 'inline-block', fontFamily: MONO, fontSize: 10, fontWeight: 700,
                        letterSpacing: '0.15em', padding: '3px 9px', borderRadius: 4,
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
                    <td style={{ padding: '10px 16px', fontFamily: MONO, fontWeight: 700 }}>
                      {typeof s.total_score === 'number' ? s.total_score.toFixed(1) : s.total_score}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {s.groq?.market_impact ? (
                        <span style={{
                          fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                          padding: '2px 6px',
                          color: s.groq.market_impact === 'HIGH' ? '#f87171' : s.groq.market_impact === 'MEDIUM' ? '#fbbf24' : MUTED,
                          border: `1px solid ${s.groq.market_impact === 'HIGH' ? 'rgba(248,113,113,0.3)' : s.groq.market_impact === 'MEDIUM' ? 'rgba(251,191,36,0.3)' : B}`,
                        }}>{s.groq.market_impact}</span>
                      ) : <span style={{ color: MUTED }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: MONO, fontSize: 10, color: s.source?.startsWith('Telegram') ? '#60a5fa' : MUTED, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.source?.startsWith('Telegram') ? s.source.replace('Telegram @','@') : (s.source || '—')}
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: MONO, fontSize: 10, color: MUTED }}>
                      {s.news_age_minutes != null ? `${s.news_age_minutes}m` : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: MONO, fontSize: 10, fontWeight: 700 }}>
                      {s.result === 'WIN'  ? <span style={{ color: '#4ade80' }}>WIN</span>
                       : s.result === 'LOSS' ? <span style={{ color: '#f87171' }}>LOSS</span>
                       : s.result === 'BE'   ? <span style={{ color: MUTED }}>BE</span>
                       : <span style={{ color: MUTED }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: MONO, fontSize: 11, color: pnl == null ? MUTED : pnl > 0 ? '#4ade80' : pnl < 0 ? '#f87171' : MUTED }}>
                      {pnl == null ? '—' : `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`}
                    </td>
                    <td style={{ padding: '10px 16px', color: '#666', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>
                      {s.news_title}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', height: 48, borderTop: `1px solid ${B}` }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED }}>
            {t.dashboard.signals.page} {page} / {data.pages} · {data.total} {t.dashboard.signals.rowsSuffix}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[['←', -1], ['→', 1]].map(([label, dir]) => (
              <button
                key={label}
                onClick={() => setPage(p => Math.max(1, Math.min(data.pages, p + dir)))}
                disabled={(dir === -1 && page === 1) || (dir === 1 && page >= data.pages)}
                style={{ width: 32, height: 32, border: `1px solid ${B}`, background: 'none', color: '#fff', cursor: 'pointer', fontFamily: MONO, fontSize: 14, opacity: ((dir === -1 && page === 1) || (dir === 1 && page >= data.pages)) ? 0.3 : 1 }}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
