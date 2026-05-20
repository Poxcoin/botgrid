import React, { useEffect, useState, useCallback } from 'react';
import { authFetch } from '@/lib/api';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function pnlColor(v) {
  if (v == null) return 'color: var(--text-muted)';
  if (v > 0) return 'color: #16a34a';
  if (v < 0) return 'color: #dc2626';
  return 'color: var(--text-muted)';
}

function fmtUSD(v) {
  if (v == null) return '—';
  const sign = v >= 0 ? '+' : '';
  return `${sign}$${Math.abs(v).toFixed(2)}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return iso.slice(0, 10); } catch { return '—'; }
}

function fmtDT(iso) {
  if (!iso) return '—';
  try { return iso.slice(0, 16).replace('T', ' '); } catch { return '—'; }
}

// ── PlatformSummary ────────────────────────────────────────────────────────

function PlatformSummary({ users }) {
  if (!users) return null;
  const totalPnl  = users.reduce((s, u) => s + (u.total_pnl ?? 0), 0);
  const totalTrades = users.reduce((s, u) => s + u.trades_total, 0);
  const totalClosed = users.reduce((s, u) => s + u.trades_closed, 0);
  const totalOpen   = users.reduce((s, u) => s + u.trades_open, 0);

  const cells = [
    { label: 'Users',          val: users.length },
    { label: 'Total PnL',      val: fmtUSD(totalPnl), pnl: totalPnl },
    { label: 'Total Trades',   val: totalTrades },
    { label: 'Closed',         val: totalClosed },
    { label: 'Open',           val: totalOpen },
  ];

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
      border: '1px solid var(--border-default)', marginBottom: 24,
    }}>
      {cells.map((c, i) => (
        <div key={i} style={{
          padding: '16px 20px',
          borderRight: i < cells.length - 1 ? '1px solid var(--border-subtle)' : 'none',
        }}>
          <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }}>{c.label}</div>
          <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 22, ...(c.pnl != null ? { color: c.pnl > 0 ? '#16a34a' : c.pnl < 0 ? '#dc2626' : 'var(--text-muted)' } : {}) }}>{c.val}</div>
        </div>
      ))}
    </div>
  );
}

// ── UserTradesDrawer ───────────────────────────────────────────────────────

function UserTradesDrawer({ userId, email, onClose }) {
  const [data, setData]   = useState(null);
  const [page, setPage]   = useState(0);
  const PAGE = 50;

  const load = useCallback(async (p = 0) => {
    try {
      const r = await authFetch(`/api/owner/user-trades/${userId}?limit=${PAGE}&offset=${p * PAGE}`);
      if (r.ok) setData(await r.json());
    } catch {}
  }, [userId]);

  useEffect(() => { load(page); }, [load, page]);

  const trades = data?.trades ?? [];
  const total  = data?.total ?? 0;
  const pages  = Math.ceil(total / PAGE);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      padding: '40px 16px',
      overflowY: 'auto',
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg-base)', border: '1px solid var(--border-default)',
        width: '100%', maxWidth: 900, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0,
        }}>
          <div>
            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 13 }}>{email}</span>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)', marginLeft: 12 }}>{total} trades</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: 'var(--text-muted)', lineHeight: 1 }}>✕</button>
        </div>

        {/* table */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--bg-elevated)', fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {['Source','Symbol','Side','Lev','Entry','Exit','Qty','PnL','Status','Opened','Closed'].map(h => (
                  <th key={h} style={{ textAlign: h === 'PnL' ? 'right' : 'left', padding: '8px 12px', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border-subtle)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data === null ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 32, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>Loading...</td></tr>
              ) : trades.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: 32, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>No trades</td></tr>
              ) : trades.map(t => (
                <tr key={t.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{t.source}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 600 }}>{t.symbol?.replace('/USDT:USDT','')}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: t.side === 'LONG' ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{t.side}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{t.leverage}x</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{t.entry_price?.toFixed(4) ?? '—'}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{t.exit_price?.toFixed(4) ?? '—'}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{t.qty ?? '—'}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontWeight: 700, textAlign: 'right', color: t.pnl_usdt == null ? 'var(--text-muted)' : t.pnl_usdt > 0 ? '#16a34a' : '#dc2626' }}>
                    {fmtUSD(t.pnl_usdt)}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.1em', color: t.status === 'closed' ? '#16a34a' : t.status === 'open' ? '#2563eb' : 'var(--text-muted)' }}>
                    {t.status?.toUpperCase()}
                  </td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{fmtDT(t.opened_at)}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{fmtDT(t.closed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* pagination */}
        {pages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
            <button
              disabled={page === 0}
              onClick={() => setPage(p => Math.max(0, p - 1))}
              style={{ fontFamily: 'monospace', fontSize: 11, border: '1px solid var(--border-default)', background: 'none', cursor: page === 0 ? 'not-allowed' : 'pointer', padding: '4px 12px', color: 'var(--text-primary)', opacity: page === 0 ? 0.4 : 1 }}>
              ← Prev
            </button>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{page + 1} / {pages}</span>
            <button
              disabled={page >= pages - 1}
              onClick={() => setPage(p => Math.min(pages - 1, p + 1))}
              style={{ fontFamily: 'monospace', fontSize: 11, border: '1px solid var(--border-default)', background: 'none', cursor: page >= pages - 1 ? 'not-allowed' : 'pointer', padding: '4px 12px', color: 'var(--text-primary)', opacity: page >= pages - 1 ? 0.4 : 1 }}>
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── MonthlyBar ─────────────────────────────────────────────────────────────

function MonthlyBar({ monthly }) {
  if (!monthly || monthly.length === 0) return <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>—</span>;
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      {monthly.slice(-6).map((m, i) => (
        <span key={i} style={{
          fontFamily: 'monospace', fontSize: 10,
          padding: '2px 6px',
          background: m.net_pnl > 0 ? 'rgba(22,163,74,0.12)' : m.net_pnl < 0 ? 'rgba(220,38,38,0.1)' : 'var(--bg-elevated)',
          color: m.net_pnl > 0 ? '#16a34a' : m.net_pnl < 0 ? '#dc2626' : 'var(--text-muted)',
          border: `1px solid ${m.net_pnl > 0 ? 'rgba(22,163,74,0.3)' : m.net_pnl < 0 ? 'rgba(220,38,38,0.2)' : 'var(--border-subtle)'}`,
        }}>
          {MONTHS[m.month - 1]}: {fmtUSD(m.net_pnl)}
        </span>
      ))}
    </div>
  );
}

// ── Main OwnerTab ──────────────────────────────────────────────────────────

const PLAN_COLOR = {
  trial:       { bg: 'rgba(217,119,6,0.1)',  color: '#b45309' },
  free:        { bg: 'rgba(100,116,139,0.1)', color: '#64748b' },
  basic:       { bg: 'rgba(37,99,235,0.1)',  color: '#1d4ed8' },
  pro:         { bg: 'rgba(79,70,229,0.12)', color: '#4338ca' },
  performance: { bg: 'rgba(22,163,74,0.1)',  color: '#15803d' },
};

export default function OwnerTab() {
  const [data,   setData]   = useState(null);
  const [err,    setErr]    = useState(false);
  const [drawer, setDrawer] = useState(null); // {id, email}
  const [sort,   setSort]   = useState({ col: 'total_pnl', asc: false });
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await authFetch('/api/owner/users-pnl');
      if (!r.ok) { setErr(true); return; }
      setData(await r.json());
      setErr(false);
    } catch { setErr(true); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleSort = col => setSort(s => ({ col, asc: s.col === col ? !s.asc : false }));

  const users = React.useMemo(() => {
    if (!data?.users) return [];
    let list = data.users.filter(u => !search || u.email.toLowerCase().includes(search.toLowerCase()));
    list = [...list].sort((a, b) => {
      let av = a[sort.col] ?? -Infinity;
      let bv = b[sort.col] ?? -Infinity;
      if (typeof av === 'string') return sort.asc ? av.localeCompare(bv) : bv.localeCompare(av);
      return sort.asc ? av - bv : bv - av;
    });
    return list;
  }, [data, sort, search]);

  const Th = ({ label, col, right }) => (
    <th
      onClick={() => toggleSort(col)}
      style={{
        textAlign: right ? 'right' : 'left',
        padding: '8px 16px', cursor: 'pointer', whiteSpace: 'nowrap',
        userSelect: 'none', fontFamily: 'monospace', fontSize: 10,
        letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)',
        fontWeight: sort.col === col ? 700 : 400,
      }}>
      {label}{sort.col === col ? (sort.asc ? ' ↑' : ' ↓') : ' ·'}
    </th>
  );

  if (err) return (
    <div style={{ padding: 40, fontFamily: 'monospace', color: '#dc2626' }}>
      Failed to load — check that you are logged in as owner (ID 1)
    </div>
  );

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: 18, letterSpacing: '0.04em' }}>
          Owner / User PnL
        </h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter email…"
            style={{ fontFamily: 'monospace', fontSize: 11, border: '1px solid var(--border-default)', background: 'var(--bg-elevated)', color: 'var(--text-primary)', padding: '6px 12px', outline: 'none', width: 180 }}
          />
          <button
            onClick={load}
            style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', border: '1px solid var(--border-default)', background: 'none', cursor: 'pointer', padding: '6px 14px', color: 'var(--text-primary)' }}>
            Refresh
          </button>
        </div>
      </div>

      <PlatformSummary users={data?.users} />

      {/* table */}
      <div style={{ border: '1px solid var(--border-default)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--text-primary)' }}>
              <Th label="Email"        col="email" />
              <Th label="Plan"         col="plan" />
              <Th label="Total PnL"    col="total_pnl"      right />
              <Th label="Win Rate"     col="win_rate"       right />
              <Th label="Trades"       col="trades_total"   right />
              <Th label="Closed"       col="trades_closed"  right />
              <Th label="Open"         col="trades_open"    right />
              <Th label="Last 6 months" col="email" />
              <Th label="Registered"   col="created_at" />
            </tr>
          </thead>
          <tbody>
            {data === null ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 40, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>No users</td></tr>
            ) : users.map((u, i) => {
              const planStyle = PLAN_COLOR[u.plan] ?? { bg: 'transparent', color: 'var(--text-muted)' };
              return (
                <tr
                  key={u.id}
                  style={{ borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', transition: 'background 0.1s' }}
                  onClick={() => setDrawer({ id: u.id, email: u.email })}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-overlay)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 12, opacity: u.is_active ? 1 : 0.45 }}>
                    {u.email}
                    {!u.is_active && <span style={{ marginLeft: 8, fontSize: 10, color: '#dc2626', fontWeight: 700 }}>BANNED</span>}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '2px 8px', background: planStyle.bg, color: planStyle.color }}>
                      {u.plan}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontWeight: 700, textAlign: 'right', color: u.total_pnl > 0 ? '#16a34a' : u.total_pnl < 0 ? '#dc2626' : 'var(--text-muted)' }}>
                    {fmtUSD(u.total_pnl)}
                  </td>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', textAlign: 'right', color: u.win_rate == null ? 'var(--text-muted)' : u.win_rate >= 55 ? '#16a34a' : u.win_rate >= 45 ? '#d97706' : '#dc2626' }}>
                    {u.win_rate != null ? `${u.win_rate}%` : '—'}
                  </td>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', textAlign: 'right' }}>{u.trades_total}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', textAlign: 'right', color: 'var(--text-muted)' }}>{u.trades_closed}</td>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', textAlign: 'right', color: u.trades_open > 0 ? '#2563eb' : 'var(--text-muted)', fontWeight: u.trades_open > 0 ? 700 : 400 }}>
                    {u.trades_open}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <MonthlyBar monthly={u.monthly} />
                  </td>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(u.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 10, fontFamily: 'monospace', fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>
        Click any row to see trades · Win rate = closed profitable / total closed
      </div>

      {drawer && (
        <UserTradesDrawer
          userId={drawer.id}
          email={drawer.email}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}
