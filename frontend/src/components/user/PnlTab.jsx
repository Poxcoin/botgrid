import React, { useEffect, useState } from 'react';
import { useLang } from '@/lib/LangContext';

const API = (path) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}` },
}).then(r => r.ok ? r.json() : Promise.reject(r.status));

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function PnlTab() {
  const { t } = useLang();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

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

  const headers = [t.dashboard.hMonth, t.dashboard.pnl.hGrossPnl, t.dashboard.pnl.hFee, t.dashboard.pnl.hNetPnl, t.dashboard.pnl.hPaid];

  return (
    <div>
      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 40px', marginBottom: 40 }}>
        {[
          { label: t.dashboard.pnl.totalGross, val: totalGross },
          { label: t.dashboard.pnl.totalFee,   val: totalFee },
          { label: t.dashboard.pnl.totalNet,   val: totalNet },
        ].map(({ label, val }) => (
          <div key={label} style={{ borderBottom: '1px solid var(--border)', padding: '20px 0' }}>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 8 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {loading
                ? <div className="shimmer" style={{ height: 28, width: 140, borderRadius: 4 }} />
                : `${val >= 0 ? '+' : ''}${val.toFixed(2)}`}
            </div>
          </div>
        ))}
      </div>

      {/* Bar chart */}
      {!loading && rows.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 16 }}>{t.dashboard.pnl.monthlyGrossPnl}</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
            {[...rows].reverse().map(r => {
              const h = Math.abs(r.gross_pnl) / maxAbs * 72;
              return (
                <div key={`${r.year}-${r.month}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: '100%', height: h, background: r.gross_pnl >= 0 ? 'var(--fg)' : 'var(--muted-fg)',
                    opacity: r.gross_pnl >= 0 ? 1 : 0.45, minHeight: 2,
                  }} />
                  <div style={{ fontSize: 10, color: 'var(--muted-fg)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                    {MONTHS[r.month - 1]}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
              <td style={{ padding: '12px 0' }}>{MONTHS[r.month - 1]} {r.year}</td>
              <td style={{ padding: '12px 0' }}>{r.gross_pnl >= 0 ? '+' : ''}{r.gross_pnl.toFixed(2)}</td>
              <td style={{ padding: '12px 0', color: 'var(--muted-fg)' }}>{r.performance_fee.toFixed(2)}</td>
              <td style={{ padding: '12px 0' }}>{r.net_pnl >= 0 ? '+' : ''}{r.net_pnl.toFixed(2)}</td>
              <td style={{ padding: '12px 0', color: 'var(--muted-fg)' }}>{r.fee_paid ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <style>{`@keyframes pulse { 0%,100%{opacity:.4} 50%{opacity:.8} }`}</style>
    </div>
  );
}
