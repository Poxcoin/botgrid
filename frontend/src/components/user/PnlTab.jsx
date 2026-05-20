import React, { useEffect, useState } from 'react';
import { useLang } from '@/lib/LangContext';
import { useIsMobile } from '@/lib/useIsMobile';

const API = (path) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}` },
}).then(r => r.ok ? r.json() : Promise.reject(r.status));

const PNLTAB_LOCALE = { en:'en-US', es:'es-ES', uk:'uk-UA', ru:'ru-RU', de:'de-DE', zh:'zh-CN' };
// monthIdx is 0-based (0=Jan)
const shortMonth = (monthIdx, locale) =>
  new Intl.DateTimeFormat(locale, { month: 'short' }).format(new Date(2000, monthIdx, 1));

export default function PnlTab() {
  const { t, lang } = useLang();
  const locale = PNLTAB_LOCALE[lang] || 'en-US';
  const isMobile = useIsMobile();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [hovBar, setHovBar] = useState(null);

  function load() {
    setLoading(true); setError(false);
    API('/api/users/pnl')
      .then(d => { setRows(Array.isArray(d) ? d : []); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  const totalGross = rows.reduce((s, r) => s + r.gross_pnl, 0);
  const totalFee   = rows.reduce((s, r) => s + r.performance_fee, 0);
  const totalNet   = rows.reduce((s, r) => s + r.net_pnl, 0);

  const maxAbs = Math.max(...rows.map(r => Math.abs(r.gross_pnl)), 1);
  const multiYear = new Set(rows.map(r => r.year)).size > 1;

  const headers = [t.dashboard.hMonth, t.dashboard.pnl.hGrossPnl, t.dashboard.pnl.hFee, t.dashboard.pnl.hNetPnl, t.dashboard.pnl.hPaid];

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: isMobile ? 0 : '0 40px', marginBottom: 40 }}>
        {[
          { label: t.dashboard.pnl.totalGross, val: totalGross, colored: true },
          { label: t.dashboard.pnl.totalFee,   val: totalFee,   colored: false },
          { label: t.dashboard.pnl.totalNet,   val: totalNet,   colored: true },
        ].map(({ label, val, colored }) => (
          <div key={label} style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: colored && !loading ? (val >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : undefined }}>
              {loading
                ? <div className="shimmer" style={{ height: 28, width: 140, borderRadius: 4 }} />
                : `${val >= 0 ? '+' : ''}${val.toFixed(2)}`}
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      {!loading && rows.length > 0 && (() => {
        const reversed = [...rows].reverse();
        const BAR_H = 100;
        return (
          <div style={{ marginBottom: 40 }}>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 16 }}>{t.dashboard.pnl.monthlyGrossPnl}</div>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: BAR_H + 20 }}>
                {reversed.map((r, i) => {
                  const h = Math.abs(r.gross_pnl) / maxAbs * BAR_H;
                  const pos = r.gross_pnl >= 0;
                  const isH = hovBar === i;
                  return (
                    <div key={`${r.year}-${r.month}`}
                      style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'default' }}
                      onMouseEnter={() => setHovBar(i)} onMouseLeave={() => setHovBar(null)}>
                      <div style={{
                        width: '100%', height: Math.max(h, 2), minHeight: 2,
                        background: pos
                          ? (isH ? 'var(--accent-green)' : 'rgba(14,203,129,0.65)')
                          : (isH ? 'var(--accent-red)' : 'rgba(246,70,93,0.55)'),
                        transition: 'background 100ms',
                      }} />
                      <div style={{ fontSize: 10, color: isH ? 'var(--text-secondary)' : 'var(--muted-fg)', letterSpacing: '0.05em', whiteSpace: 'nowrap', transition: 'color 100ms' }}>
                        {shortMonth(r.month - 1, locale)}{multiYear ? ` '${String(r.year).slice(2)}` : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
              {hovBar != null && reversed[hovBar] && (
                <div style={{
                  position: 'absolute', top: 0,
                  left: `${(hovBar / reversed.length + 0.5 / reversed.length) * 100}%`,
                  transform: 'translateX(-50%)',
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-default)',
                  padding: '8px 14px', fontFamily: 'var(--font-mono)', fontSize: 11,
                  pointerEvents: 'none', whiteSpace: 'nowrap', zIndex: 10,
                }}>
                  <div style={{ fontSize: 9, color: 'var(--muted-fg)', marginBottom: 5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    {shortMonth(reversed[hovBar].month - 1, locale)} {reversed[hovBar].year}
                  </div>
                  <div style={{ color: reversed[hovBar].gross_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 700, fontSize: 13, marginBottom: 3 }}>
                    {reversed[hovBar].gross_pnl >= 0 ? '+' : ''}{reversed[hovBar].gross_pnl.toFixed(2)} {t.dashboard.pnl.gross}
                  </div>
                  <div style={{ color: 'var(--muted-fg)', fontSize: 10 }}>
                    {t.dashboard.pnl.net} {reversed[hovBar].net_pnl >= 0 ? '+' : ''}{reversed[hovBar].net_pnl.toFixed(2)}
                  </div>
                  <div style={{ color: 'var(--muted-fg)', fontSize: 10 }}>
                    {t.dashboard.pnl.fee} {reversed[hovBar].performance_fee.toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)' }}>
            {headers.map(h => (
              <th key={h} style={{ padding: '8px 0', textAlign: 'left', fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted-fg)', fontWeight: 400, textTransform: 'uppercase' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? [1,2,3].map(i => (
            <tr key={i}>
              {[1,2,3,4,5].map(j => (
                <td key={j} style={{ padding: '12px 0' }}>
                  <div className="shimmer" style={{ height: 11, width: '70%', borderRadius: 3 }} />
                </td>
              ))}
            </tr>
          )) : error ? (
            <tr><td colSpan={5} style={{ padding: '40px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 13, color: 'var(--accent-red)', marginBottom: 12 }}>{t.dashboard.analytics.errorPrefix} —</div>
              <button onClick={load} style={{
                background: 'none', border: '1px solid var(--border-default)', color: 'var(--text-secondary)',
                fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
                padding: '7px 16px', cursor: 'pointer', borderRadius: 4,
              }}>
                {t.dashboard.analytics.retry}
              </button>
            </td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={5} style={{ padding: '40px 0', color: 'var(--muted-fg)', textAlign: 'center' }}>{t.dashboard.pnl.noPnlData}</td></tr>
          ) : rows.map(r => (
            <tr key={`${r.year}-${r.month}`} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 0' }}>{shortMonth(r.month - 1, locale)} {r.year}</td>
              <td style={{ padding: '12px 0', color: r.gross_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>{r.gross_pnl >= 0 ? '+' : ''}{r.gross_pnl.toFixed(2)}</td>
              <td style={{ padding: '12px 0', color: 'var(--muted-fg)' }}>{r.performance_fee.toFixed(2)}</td>
              <td style={{ padding: '12px 0', color: r.net_pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600 }}>{r.net_pnl >= 0 ? '+' : ''}{r.net_pnl.toFixed(2)}</td>
              <td style={{ padding: '12px 0', color: 'var(--muted-fg)' }}>{r.fee_paid ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
    </div>
  );
}
