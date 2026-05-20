import React from 'react';
import { useLang } from '@/lib/LangContext';
import { MONO, BOT_LABELS, LOCALE_MAP } from './atoms';

export function DataTable({ cols, rows, getRowColor, sortCol, sortAsc, onSort }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: MONO, fontSize: 11 }}>
        <thead>
          <tr>
            {cols.map(c => {
              const sortable = onSort && !c.key.startsWith('_');
              const active   = sortCol === c.key;
              return (
                <th key={c.key}
                  onClick={sortable ? () => onSort(c.key) : undefined}
                  style={{
                    textAlign: c.align || 'left', padding: '6px 12px',
                    borderBottom: '1px solid var(--border-subtle)',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: active ? 600 : 400, letterSpacing: '0.1em', fontSize: 9, textTransform: 'uppercase',
                    cursor: sortable ? 'pointer' : 'default', userSelect: 'none',
                  }}>
                  {c.label}{active ? (sortAsc ? ' ↑' : ' ↓') : sortable ? ' ·' : ''}
                </th>
              );
            })}
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

export function TradeRow({ tr }) {
  const { lang } = useLang();
  const loc = LOCALE_MAP[lang] || 'en-US';
  const closedMs = parseInt(tr.closed_at);
  const dateStr = closedMs ? new Date(closedMs).toLocaleDateString(loc, { day: '2-digit', month: '2-digit' }) : '—';
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
          {tr.source && <span style={{ marginLeft: 6, opacity: 0.6 }}>{BOT_LABELS[tr.source] || tr.source}</span>}
        </div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, color: pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
        {pnl >= 0 ? '+' : ''}{parseFloat(pnl).toFixed(2)}
      </div>
    </div>
  );
}

export function CoinCard({ r, maxAbsPnl }) {
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
      {hovered && (r.avg_win > 0 || r.avg_loss < 0) && (
        <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
          {r.avg_win > 0 && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--accent-green)' }}>
              avg W: +{parseFloat(r.avg_win).toFixed(2)}
            </span>
          )}
          {r.avg_loss < 0 && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: 'var(--accent-red)' }}>
              avg L: {parseFloat(r.avg_loss).toFixed(2)}
            </span>
          )}
          {r.avg_win > 0 && r.avg_loss < 0 && (
            <span style={{ fontFamily: MONO, fontSize: 9, color: (r.avg_win / Math.abs(r.avg_loss)) >= 1 ? 'var(--accent-green)' : 'var(--text-muted)' }}>
              R:R {(r.avg_win / Math.abs(r.avg_loss)).toFixed(2)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function CoinGrid({ coins }) {
  const sorted = [...coins].sort((a, b) => parseFloat(b.pnl) - parseFloat(a.pnl));
  const maxAbsPnl = Math.max(...sorted.map(r => Math.abs(parseFloat(r.pnl) || 0)), 0.01);
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {sorted.map(r => <CoinCard key={r.coin} r={r} maxAbsPnl={maxAbsPnl} />)}
    </div>
  );
}
