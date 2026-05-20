import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { authFetch } from '@/lib/api';
import { format } from 'date-fns';

// ── helpers ───────────────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function pnlColor(v) {
  if (v == null) return 'text-kado-gray';
  return v > 0 ? 'text-green-700' : v < 0 ? 'text-red-600' : 'text-kado-gray';
}

function fmtUSD(v) {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}$${Math.abs(v).toFixed(2)}`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  try { return format(new Date(iso), 'yyyy-MM-dd'); } catch { return '—'; }
}

// ── StatBlock ─────────────────────────────────────────────────────────────────

function StatBlock({ label, value, sub, accent }) {
  return (
    <div className={`p-5 border-r border-kado-black/15 last:border-r-0 ${accent ? 'bg-kado-black text-white' : ''}`}>
      <div className={`font-mono text-[10px] tracking-[0.3em] uppercase mb-1 ${accent ? 'text-white/50' : 'text-kado-gray'}`}>{label}</div>
      <div className={`font-black font-mono text-3xl tabular-nums ${accent ? 'text-white' : ''}`}>{value ?? '—'}</div>
      {sub && <div className={`font-mono text-[11px] mt-1 ${accent ? 'text-white/40' : 'text-kado-gray'}`}>{sub}</div>}
    </div>
  );
}

// ── PlatformStats ─────────────────────────────────────────────────────────────

function PlatformStats() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await authFetch('/api/admin/stats');
      if (!r.ok) throw new Error();
      setData(await r.json());
      setErr(false);
    } catch { setErr(true); }
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 30000); return () => clearInterval(id); }, [load]);

  if (err) return (
    <div className="border border-kado-black p-5 font-mono text-[12px] text-red-600">
      Failed to load stats — check admin token
    </div>
  );

  const u = data?.users;
  const t = data?.trades;
  const r = data?.revenue;
  const b = data?.bots;

  return (
    <div className="space-y-0">
      {/* Row 1: Users */}
      <div className="border border-kado-black">
        <div className="px-5 h-10 border-b border-kado-black flex items-center">
          <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray">Users /</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5">
          <StatBlock label="Total"        value={u?.total ?? '—'} />
          <StatBlock label="Active"       value={u?.active ?? '—'} />
          <StatBlock label="Verified"     value={u?.verified ?? '—'} />
          <StatBlock label="With API Keys" value={u?.with_keys ?? '—'} />
          <StatBlock label="Running Bots" value={b?.running ?? '—'} accent />
        </div>
      </div>

      {/* Plans breakdown */}
      {u?.by_plan && (
        <div className="border border-kado-black border-t-0">
          <div className="px-5 h-10 border-b border-kado-black flex items-center">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray">Plans /</span>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-6">
            {['trial','free','basic','pro','performance'].map(plan => (
              <StatBlock key={plan} label={plan} value={u.by_plan[plan] ?? 0} />
            ))}
          </div>
        </div>
      )}

      {/* Row 2: Trades + Revenue */}
      <div className="grid grid-cols-1 md:grid-cols-2 border border-kado-black border-t-0">
        <div className="border-r border-kado-black/30">
          <div className="px-5 h-10 border-b border-kado-black flex items-center">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray">Trades /</span>
          </div>
          <div className="grid grid-cols-3">
            <StatBlock label="Total"  value={t?.total ?? '—'} />
            <StatBlock label="Open"   value={t?.open  ?? '—'} />
            <StatBlock label="Closed" value={t?.closed ?? '—'} />
          </div>
        </div>
        <div>
          <div className="px-5 h-10 border-b border-kado-black flex items-center">
            <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray">Revenue (25% fee) /</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4">
            <StatBlock label="Collected"        value={r ? `$${r.collected.toFixed(2)}` : '—'} accent />
            <StatBlock label="Pending"          value={r ? `$${r.pending.toFixed(2)}` : '—'} />
            <StatBlock label="Open Invoices"    value={r?.pending_invoices ?? '—'} />
            <StatBlock label="User Notified"    value={r?.notified_invoices ?? '—'} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── InvoicesPanel ─────────────────────────────────────────────────────────────

function InvoicesPanel() {
  const [invoices, setInvoices] = useState(null);
  const [marking, setMarking] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await authFetch('/api/admin/invoices');
      if (r.ok) setInvoices(await r.json());
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const markPaid = async (id) => {
    setMarking(id);
    try {
      const r = await authFetch(`/api/admin/invoices/${id}/mark-paid`, { method: 'POST' });
      if (r.ok) { await load(); }
    } catch {}
    setMarking(null);
  };

  return (
    <div className="border border-kado-black">
      <div className="px-5 h-12 border-b border-kado-black flex items-center justify-between">
        <h3 className="font-black tracking-tight text-lg">Performance Fee Invoices</h3>
        <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">25% of profit</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-kado-black text-white font-mono text-[10px] tracking-[0.2em] uppercase">
              <th className="text-left px-5 h-10">User</th>
              <th className="text-left px-5 h-10">Period</th>
              <th className="text-right px-5 h-10">Gross PnL</th>
              <th className="text-right px-5 h-10">Fee (25%)</th>
              <th className="text-left px-5 h-10">Status</th>
              <th className="text-left px-5 h-10">Notified</th>
              <th className="text-left px-5 h-10">TX</th>
              <th className="text-left px-5 h-10"></th>
            </tr>
          </thead>
          <tbody>
            {invoices === null ? (
              <tr><td colSpan={8} className="px-5 py-8 text-center font-mono text-[11px] text-kado-gray tracking-widest">Loading...</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={8} className="px-5 py-8 text-center font-mono text-[11px] text-kado-gray tracking-widest">No invoices yet</td></tr>
            ) : invoices.map(inv => (
              <tr key={inv.id} className="border-t border-kado-black/15 hover:bg-kado-black/[0.02]">
                <td className="px-5 py-3 font-mono text-[12px]">{inv.user_email || `#${inv.user_id}`}</td>
                <td className="px-5 py-3 font-mono text-kado-gray">{MONTHS[inv.month - 1]} {inv.year}</td>
                <td className={`px-5 py-3 font-mono tabular-nums text-right ${pnlColor(inv.gross_pnl)}`}>
                  {fmtUSD(inv.gross_pnl)}
                </td>
                <td className="px-5 py-3 font-mono font-bold tabular-nums text-right">
                  ${inv.fee.toFixed(2)}
                </td>
                <td className="px-5 py-3 font-mono text-[11px] tracking-widest">
                  {inv.fee_paid
                    ? <span className="text-green-700 font-bold">PAID</span>
                    : <span className="text-amber-600 font-bold">PENDING</span>}
                </td>
                <td className="px-5 py-3 font-mono text-[11px] text-kado-gray">
                  {inv.notified_at ? fmtDate(inv.notified_at) : '—'}
                </td>
                <td className="px-5 py-3 font-mono text-[10px] text-kado-gray max-w-[100px] truncate">
                  {inv.tx_hash || '—'}
                </td>
                <td className="px-5 py-3">
                  {!inv.fee_paid && (
                    <button
                      onClick={() => markPaid(inv.id)}
                      disabled={marking === inv.id}
                      className="font-mono text-[10px] tracking-[0.2em] uppercase px-3 py-1 border border-kado-black hover:bg-kado-black hover:text-white transition-colors disabled:opacity-40"
                    >
                      {marking === inv.id ? '...' : 'Mark Paid'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── UsersPanel ────────────────────────────────────────────────────────────────

const PLANS = ['trial', 'free', 'basic', 'pro', 'performance'];

function UsersPanel() {
  const [data,       setData]       = useState(null);
  const [search,     setSearch]     = useState('');
  const [planFilter, setPlanFilter] = useState('ALL');
  const [onlyKeys,   setOnlyKeys]   = useState(false);
  const [sortCol,    setSortCol]    = useState('created_at');
  const [sortAsc,    setSortAsc]    = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await authFetch('/api/admin/users?limit=200');
      if (r.ok) setData(await r.json());
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const PLAN_COLOR = {
    trial:       'bg-amber-100 text-amber-700',
    free:        'bg-gray-100 text-gray-500',
    basic:       'bg-blue-50 text-blue-700',
    pro:         'bg-indigo-100 text-indigo-700',
    performance: 'bg-green-100 text-green-700',
  };

  const toggleSort = (col) => {
    if (sortCol === col) setSortAsc(a => !a);
    else { setSortCol(col); setSortAsc(false); }
  };

  const users = useMemo(() => {
    if (!data?.users) return [];
    const lc = search.toLowerCase();
    let list = data.users.filter(u => {
      if (lc && !u.email.toLowerCase().includes(lc)) return false;
      if (planFilter !== 'ALL' && u.plan !== planFilter) return false;
      if (onlyKeys && !u.has_api_keys) return false;
      return true;
    });
    list = [...list].sort((a, b) => {
      let av, bv;
      if (sortCol === 'email')       { return sortAsc ? a.email.localeCompare(b.email) : b.email.localeCompare(a.email); }
      if (sortCol === 'trades_total') { av = a.trades_total ?? 0; bv = b.trades_total ?? 0; }
      else if (sortCol === 'pending_fee') { av = a.pending_fee ?? 0; bv = b.pending_fee ?? 0; }
      else { av = a.created_at ?? ''; bv = b.created_at ?? ''; return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av); }
      return sortAsc ? av - bv : bv - av;
    });
    return list;
  }, [data, search, planFilter, onlyKeys, sortCol, sortAsc]);

  const SortTh = ({ label, col, right }) => (
    <th
      onClick={() => toggleSort(col)}
      className={`${right ? 'text-right' : 'text-left'} px-5 h-10 cursor-pointer select-none hover:text-white/70`}
      style={{ whiteSpace: 'nowrap' }}
    >
      {label}{sortCol === col ? (sortAsc ? ' ↑' : ' ↓') : ' ·'}
    </th>
  );

  return (
    <div className="border border-kado-black">
      <div className="px-5 h-12 border-b border-kado-black flex items-center justify-between">
        <h3 className="font-black tracking-tight text-lg">Users</h3>
        <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">
          {data ? (users.length !== data.total ? `${users.length} / ${data.total}` : `${data.total} total`) : '...'}
        </span>
      </div>

      {/* Filter bar */}
      <div className="px-5 py-3 border-b border-kado-black/15 flex items-center gap-3 flex-wrap bg-kado-black/[0.02]">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search email…"
          className="font-mono text-[11px] border border-kado-black/20 bg-white px-3 py-1.5 outline-none w-44"
        />
        <select
          value={planFilter}
          onChange={e => setPlanFilter(e.target.value)}
          className="font-mono text-[11px] border border-kado-black/20 bg-white px-3 py-1.5 outline-none cursor-pointer"
        >
          <option value="ALL">All plans</option>
          {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="flex items-center gap-2 font-mono text-[11px] text-kado-gray cursor-pointer select-none">
          <input type="checkbox" checked={onlyKeys} onChange={e => setOnlyKeys(e.target.checked)} />
          API keys only
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-kado-black text-white font-mono text-[10px] tracking-[0.2em] uppercase">
              <SortTh label="Email"        col="email" />
              <th className="text-left px-5 h-10">Plan</th>
              <th className="text-left px-5 h-10">Ver</th>
              <th className="text-left px-5 h-10">Keys</th>
              <SortTh label="Trades" col="trades_total" right />
              <th className="text-right px-5 h-10">Open</th>
              <th className="text-left px-5 h-10">Latest PnL</th>
              <SortTh label="Pending Fee" col="pending_fee" right />
              <SortTh label="Registered"  col="created_at" />
              <th className="text-left px-5 h-10">Last Login</th>
            </tr>
          </thead>
          <tbody>
            {data === null ? (
              <tr><td colSpan={10} className="px-5 py-8 text-center font-mono text-[11px] text-kado-gray tracking-widest">Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={10} className="px-5 py-8 text-center font-mono text-[11px] text-kado-gray tracking-widest">No matching users</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className={`border-t border-kado-black/15 hover:bg-kado-black/[0.02] ${!u.is_active ? 'opacity-40' : ''}`}>
                <td className="px-5 py-3 font-mono text-[12px] max-w-[200px] truncate">
                  {u.email}
                  {!u.is_active && <span className="ml-2 text-[10px] text-red-500 font-bold">BANNED</span>}
                </td>
                <td className="px-5 py-3">
                  <span className={`font-mono text-[10px] tracking-[0.15em] uppercase px-2 py-0.5 ${PLAN_COLOR[u.plan] ?? 'bg-gray-100 text-gray-500'}`}>
                    {u.plan}
                  </span>
                </td>
                <td className="px-5 py-3 font-mono text-[12px]">
                  {u.email_verified ? <span className="text-green-700">✓</span> : <span className="text-kado-gray">—</span>}
                </td>
                <td className="px-5 py-3 font-mono text-[12px]">
                  {u.has_api_keys ? <span className="text-green-700">✓</span> : <span className="text-kado-gray">—</span>}
                </td>
                <td className="px-5 py-3 font-mono tabular-nums text-right">{u.trades_total}</td>
                <td className="px-5 py-3 font-mono tabular-nums text-right">
                  {u.trades_open > 0
                    ? <span className="text-kado-blue font-bold">{u.trades_open}</span>
                    : <span className="text-kado-gray">0</span>}
                </td>
                <td className="px-5 py-3 font-mono text-[12px]">
                  {u.latest_pnl
                    ? <span className={pnlColor(u.latest_pnl.net_pnl)}>
                        {MONTHS[u.latest_pnl.month - 1]} {u.latest_pnl.year}: {fmtUSD(u.latest_pnl.net_pnl)}
                      </span>
                    : <span className="text-kado-gray">—</span>}
                </td>
                <td className="px-5 py-3 font-mono tabular-nums text-right">
                  {u.pending_fee > 0
                    ? <span className="text-amber-600 font-bold">${u.pending_fee.toFixed(2)}</span>
                    : <span className="text-kado-gray">—</span>}
                </td>
                <td className="px-5 py-3 font-mono text-kado-gray text-[12px]">{fmtDate(u.created_at)}</td>
                <td className="px-5 py-3 font-mono text-kado-gray text-[12px]">{fmtDate(u.last_login)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── DispatcherPanel ───────────────────────────────────────────────────────────

function DispatcherPanel() {
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await authFetch('/api/admin/dispatcher');
      if (r.ok) setData(await r.json());
    } catch {}
  }, []);

  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, [load]);

  const instances = data?.instances ?? [];

  return (
    <div className="border border-kado-black">
      <div className="px-5 h-12 border-b border-kado-black flex items-center justify-between">
        <h3 className="font-black tracking-tight text-lg">Running Bots</h3>
        <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">
          {instances.length} active · 15s refresh
        </span>
      </div>
      {instances.length === 0 ? (
        <div className="px-5 py-8 text-center font-mono text-[11px] text-kado-gray tracking-widest">
          {data === null ? 'Loading...' : 'No bots running'}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-kado-black text-white font-mono text-[10px] tracking-[0.2em] uppercase">
                <th className="text-left px-5 h-10">User ID</th>
                <th className="text-left px-5 h-10">Bot</th>
                <th className="text-left px-5 h-10">Status</th>
                <th className="text-left px-5 h-10">Detail</th>
              </tr>
            </thead>
            <tbody>
              {instances.map((inst, i) => (
                <tr key={i} className="border-t border-kado-black/15 hover:bg-kado-black/[0.02]">
                  <td className="px-5 py-3 font-mono">{inst.user_id ?? '—'}</td>
                  <td className="px-5 py-3 font-mono">{inst.bot ?? inst.type ?? '—'}</td>
                  <td className="px-5 py-3 font-mono">
                    <span className="text-green-700 font-bold">{inst.status ?? 'running'}</span>
                  </td>
                  <td className="px-5 py-3 font-mono text-kado-gray text-[11px]">
                    {inst.symbol ?? inst.detail ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main AdminTab ─────────────────────────────────────────────────────────────

export default function AdminTab() {
  return (
    <div className="p-4 md:p-8 space-y-8">
      <PlatformStats />
      <InvoicesPanel />
      <UsersPanel />
      <DispatcherPanel />
    </div>
  );
}
