import React from 'react';

export const MONO = "var(--font-mono)";
export const FONT = "var(--font-sans)";

export const BOT_LABELS = {
  news: "Signal Bot", signal: "Signal Bot", altcoin: "Altcoin Bot",
  grid: "Grid Bot", fr: "Funding Rate", fr_extreme: "FR Extreme",
  cascade: "Cascade", liq_cascade: "Liq Cascade", macro: "Macro Forex",
  dex: "DEX Bot", whale: "Whale Tracker", listing: "CEX Sniper",
  orderflow: "Orderflow", sweep: "Liq Sweep", ob: "Order Block",
  orderblock: "Order Block", sniper: "CEX Sniper", bybit: "Bybit Import",
  other: "Other",
};

export const LOCALE_MAP = { en:'en-US', es:'es-ES', uk:'uk-UA', ru:'ru-RU', de:'de-DE', zh:'zh-CN' };

export const shortDay = (dayIdx, locale) =>
  new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(new Date(2023, 0, 1 + dayIdx));

export function getToken() {
  return localStorage.getItem('kado_token') || '';
}

export function pct(wins, total) {
  if (!total) return '—';
  return (wins / total * 100).toFixed(1) + '%';
}

export function exportTradesCSV(trades) {
  const hdr = ['Date', 'Symbol', 'Side', 'Bot', 'Entry', 'Exit', 'Qty', 'Duration', 'PnL (USDT)'];
  const rows = trades.map(tr => {
    const ms = parseInt(tr.closed_at);
    const date = ms ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') : '';
    const o = parseInt(tr.opened_at), c = parseInt(tr.closed_at);
    const m = (o && c && c > o) ? Math.round((c - o) / 60000) : null;
    const dur = m == null ? '' : m < 60 ? `${m}m` : m < 1440 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 1440)}d`;
    return [
      date, tr.symbol || '', tr.side || '', BOT_LABELS[tr.source] || tr.source || '',
      tr.entry_price ? (+tr.entry_price).toFixed(4) : '',
      tr.exit_price  ? (+tr.exit_price).toFixed(4)  : '',
      tr.qty ? (+tr.qty).toFixed(3) : '', dur,
      parseFloat(tr.pnl ?? 0).toFixed(2),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });
  const csv = [hdr.join(','), ...rows].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `kado_trades_${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export function StatCard({ label, value, sub, accent = null }) {
  const [hovered, setHovered] = React.useState(false);
  const accentColor = accent === 'pos' ? 'var(--accent-green)'
                     : accent === 'neg' ? 'var(--accent-red)'
                     : accent === 'neutral' ? 'var(--text-muted)' : null;
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, minWidth: 160, position: 'relative',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-subtle)',
        padding: '22px 22px 20px',
        transition: 'transform 200ms, border-color 200ms, box-shadow 200ms',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        borderColor: hovered ? 'var(--border-default)' : 'var(--border-subtle)',
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,0.25)' : '0 0 0 rgba(0,0,0,0)',
        overflow: 'hidden',
      }}
    >
      {accentColor && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, ${accentColor}, transparent)`,
          opacity: hovered ? 1 : 0.7, transition: 'opacity 200ms',
        }} />
      )}
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
        {label}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', marginTop: 10, letterSpacing: '0.04em' }}>{sub}</div>
      )}
    </div>
  );
}

export function HeroSparkline({ equity, isPos }) {
  if (!equity || equity.length < 2) return null;
  const W = 200, H = 44;
  const min = Math.min(...equity), max = Math.max(...equity);
  const range = max - min || 1;
  const sx = i => (i / (equity.length - 1)) * W;
  const sy = v => H - ((v - min) / range) * H;
  const pts = equity.map((v, i) => `${sx(i)},${sy(v)}`).join(' ');
  const area = `M0,${H} L` + pts.replace(/ /g, ' L') + ` L${W},${H} Z`;
  const stroke = isPos ? 'var(--accent-green)' : 'var(--accent-red)';
  const gradId = `hero-sparkline-${isPos ? 'p' : 'n'}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} preserveAspectRatio="none" style={{ display: 'block', opacity: 0.85 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={stroke} stopOpacity="0.35" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SectionLabel({ title, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      paddingBottom: 12, marginBottom: 14,
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 3, height: 14, background: 'var(--accent-green)', opacity: 0.55, borderRadius: 1 }} />
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-secondary, var(--text-muted))', fontWeight: 500 }}>
          {title}
        </div>
      </div>
      {right && <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-muted)' }}>{right}</div>}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, background: 'linear-gradient(90deg, var(--border-default) 0%, transparent 70%)' }} />
    </div>
  );
}

export function Skeleton({ w = '100%', h = 18 }) {
  return (
    <div style={{
      width: w, height: h,
      background: 'var(--bg-elevated)',
      animation: 'kado-skeleton 1.4s ease-in-out infinite',
    }} />
  );
}
