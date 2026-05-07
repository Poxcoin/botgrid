import React, { useState, useEffect } from 'react';
import OverviewTab    from '@/components/user/OverviewTab';
import TradesTab      from '@/components/user/TradesTab';
import PnlTab         from '@/components/user/PnlTab';
import SettingsTab    from '@/components/user/SettingsTab';
import BotTab         from '@/components/user/BotTab';
import SignalsTab     from '@/components/user/SignalsTab';
import LogsTab        from '@/components/user/LogsTab';
import BacktesterTab  from '@/components/dashboard/BacktesterTab';
import AnalyticsTab   from '@/components/user/AnalyticsTab';
import SecurityTab    from '@/components/user/SecurityTab';

// ─── Nav structure ────────────────────────────────────────────────────────────

const NAV = [
  {
    section: 'TRADING',
    items: [
      { id: 'overview',  label: 'Overview',    icon: '◈' },
      { id: 'bot',       label: 'Bot',         icon: '⬡' },
      { id: 'analytics', label: 'Analytics',   icon: '▦' },
      { id: 'pnl',       label: 'PnL',         icon: '◎' },
    ],
  },
  {
    section: 'ACTIVITY',
    items: [
      { id: 'trades',    label: 'Trades',      icon: '◫' },
      { id: 'signals',   label: 'Signals',     icon: '◬' },
      { id: 'logs',      label: 'Logs',        icon: '≡' },
    ],
  },
  {
    section: 'TOOLS',
    items: [
      { id: 'backtester', label: 'Backtester', icon: '⟳' },
    ],
  },
  {
    section: 'ACCOUNT',
    items: [
      { id: 'security',  label: 'Security',    icon: '⊠' },
      { id: 'settings',  label: 'Settings',    icon: '◱' },
    ],
  },
];

// Flat list for mobile and header lookup
const ALL_TABS = NAV.flatMap(g => g.items);

// ─── Styles ───────────────────────────────────────────────────────────────────

const C = {
  bg:      '#060606',
  border:  'rgba(255,255,255,0.06)',
  borderH: 'rgba(255,255,255,0.15)',
  fg:      '#fff',
  muted:   '#555',
  dim:     '#333',
  blue:    '#0047FF',
  font:    "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",
  mono:    "'Courier New','SF Mono',monospace",
};

// ─── Tab content router ───────────────────────────────────────────────────────

function TabContent({ tab }) {
  switch (tab) {
    case 'overview':   return <OverviewTab />;
    case 'bot':        return <BotTab />;
    case 'analytics':  return <AnalyticsTab />;
    case 'pnl':        return <PnlTab />;
    case 'trades':     return <TradesTab />;
    case 'signals':    return <SignalsTab />;
    case 'logs':       return <LogsTab />;
    case 'backtester': return <BacktesterTab />;
    case 'security':   return <SecurityTab />;
    case 'settings':   return <SettingsTab />;
    default:           return null;
  }
}

// ─── Mobile tabs (primary 5) ──────────────────────────────────────────────────

const MOBILE_TABS = ['overview', 'analytics', 'trades', 'security', 'settings'];

// ─── User helper ──────────────────────────────────────────────────────────────

function getUser() {
  try { return JSON.parse(localStorage.getItem('kado_user') || '{}'); } catch { return {}; }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function UserDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [menuOpen, setMenuOpen]   = useState(false);
  const user = getUser();

  // Allow other components to switch tab via custom event
  useEffect(() => {
    const h = e => setActiveTab(e.detail);
    window.addEventListener('switch-tab', h);
    return () => window.removeEventListener('switch-tab', h);
  }, []);

  function logout() {
    localStorage.removeItem('kado_token');
    localStorage.removeItem('kado_user');
    window.location.href = '/auth';
  }

  const activeItem = ALL_TABS.find(t => t.id === activeTab);
  const mobileItems = ALL_TABS.filter(t => MOBILE_TABS.includes(t.id));

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.fg, fontFamily: C.font }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside className="kado-sidebar" style={{
        width: 210, flexShrink: 0,
        borderRight: `1px solid ${C.border}`,
        background: C.bg,
        position: 'fixed', top: 0, left: 0, bottom: 0,
        display: 'flex', flexDirection: 'column',
        zIndex: 20,
      }}>
        {/* Logo */}
        <div style={{ padding: '20px 22px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/" style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: C.fg, textDecoration: 'none' }}>
            KADO
          </a>
          <span style={{ fontFamily: C.mono, fontSize: 8, color: C.dim, letterSpacing: '0.15em', marginTop: 1 }}>ACCOUNT</span>
        </div>

        {/* Grouped nav */}
        <nav style={{ flex: 1, padding: '6px 0', overflowY: 'auto' }}>
          {NAV.map(group => (
            <div key={group.section} style={{ marginBottom: 4 }}>
              {/* Section header */}
              <div style={{
                padding: '12px 22px 4px',
                fontFamily: C.mono, fontSize: 8,
                letterSpacing: '0.2em', textTransform: 'uppercase',
                color: C.dim,
              }}>
                {group.section}
              </div>

              {/* Items */}
              {group.items.map(item => {
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      width: '100%', textAlign: 'left',
                      padding: '9px 22px',
                      background: active ? 'rgba(255,255,255,0.03)' : 'none',
                      border: 'none',
                      borderLeft: `2px solid ${active ? C.fg : 'transparent'}`,
                      fontFamily: C.mono, fontSize: 11,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      cursor: 'pointer',
                      color: active ? C.fg : C.muted,
                      transition: 'color 150ms, background 150ms',
                    }}
                    onMouseEnter={e => { if (!active) { e.currentTarget.style.color = '#aaa'; e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; } }}
                    onMouseLeave={e => { if (!active) { e.currentTarget.style.color = C.muted; e.currentTarget.style.background = 'none'; } }}
                  >
                    <span style={{ fontSize: 12, opacity: active ? 1 : 0.4, flexShrink: 0, lineHeight: 1 }}>{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User block */}
        <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.border}` }}>
          {/* Plan badge */}
          {user.plan && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontFamily: C.mono, fontSize: 8, letterSpacing: '0.15em',
              color: user.plan === 'performance' || user.plan === 'pro' ? C.blue : C.dim,
              textTransform: 'uppercase',
              border: `1px solid ${user.plan === 'performance' || user.plan === 'pro' ? 'rgba(0,71,255,0.3)' : C.border}`,
              padding: '2px 7px', marginBottom: 8,
            }}>
              {user.plan}
            </div>
          )}
          {/* Email */}
          {user.email && (
            <div style={{
              fontFamily: C.mono, fontSize: 10, color: C.muted,
              letterSpacing: '0.02em', marginBottom: 12,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {user.email}
            </div>
          )}
          <button
            onClick={logout}
            style={{
              display: 'block', width: '100%',
              background: 'none', border: `1px solid ${C.border}`,
              color: C.muted, fontFamily: C.mono, fontSize: 9,
              letterSpacing: '0.12em', textTransform: 'uppercase',
              padding: '7px 0', cursor: 'pointer',
              transition: 'border-color 150ms, color 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderH; e.currentTarget.style.color = C.fg; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.muted; }}
          >
            Log out
          </button>
        </div>
      </aside>

      {/* ── Main area ───────────────────────────────────────────────────────── */}
      <div className="kado-main" style={{ marginLeft: 210, flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>

        {/* Top bar */}
        <header style={{
          height: 50, borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 28px', background: C.bg,
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Mobile burger */}
            <button
              className="kado-burger"
              onClick={() => setMenuOpen(v => !v)}
              style={{ display: 'none', background: 'none', border: 'none', color: C.fg, cursor: 'pointer', padding: '0 4px', fontSize: 18, lineHeight: 1 }}
            >
              ☰
            </button>
            <span style={{ fontFamily: C.mono, fontSize: 10, letterSpacing: '0.18em', color: C.muted, textTransform: 'uppercase' }}>
              {activeItem?.icon && <span style={{ marginRight: 6 }}>{activeItem.icon}</span>}
              {activeItem?.label}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {user.email_verified === false && (
              <div style={{ fontFamily: C.mono, fontSize: 9, color: '#f59e0b', letterSpacing: '0.08em' }}>
                ⚠ Email not verified
              </div>
            )}
          </div>
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: '36px 28px 60px', minWidth: 0 }}>
          <TabContent tab={activeTab} />
        </main>
      </div>

      {/* ── Mobile slide-over menu ───────────────────────────────────────────── */}
      {menuOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 40 }}
          onClick={() => setMenuOpen(false)}
        >
          <div
            style={{
              position: 'absolute', top: 0, left: 0, bottom: 0, width: 240,
              background: C.bg, borderRight: `1px solid ${C.border}`,
              display: 'flex', flexDirection: 'column', overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '18px 22px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: C.mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em' }}>KADO</span>
              <button onClick={() => setMenuOpen(false)} style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <div style={{ flex: 1, padding: '6px 0' }}>
              {NAV.map(group => (
                <div key={group.section}>
                  <div style={{ padding: '12px 22px 4px', fontFamily: C.mono, fontSize: 8, letterSpacing: '0.2em', color: C.dim }}>{group.section}</div>
                  {group.items.map(item => {
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => { setActiveTab(item.id); setMenuOpen(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          width: '100%', textAlign: 'left', padding: '10px 22px',
                          background: active ? 'rgba(255,255,255,0.04)' : 'none',
                          border: 'none', borderLeft: `2px solid ${active ? C.fg : 'transparent'}`,
                          fontFamily: C.mono, fontSize: 11, letterSpacing: '0.1em',
                          textTransform: 'uppercase', cursor: 'pointer',
                          color: active ? C.fg : C.muted,
                        }}
                      >
                        <span style={{ fontSize: 12, opacity: active ? 1 : 0.4 }}>{item.icon}</span>
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <div style={{ padding: '14px 22px', borderTop: `1px solid ${C.border}` }}>
              {user.email && <div style={{ fontFamily: C.mono, fontSize: 9, color: C.muted, marginBottom: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>}
              <button onClick={logout} style={{ background: 'none', border: `1px solid ${C.border}`, color: C.muted, fontFamily: C.mono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '7px 14px', cursor: 'pointer', width: '100%' }}>
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile bottom nav (5 primary tabs) ──────────────────────────────── */}
      <nav className="kado-mobile-nav" style={{
        display: 'none',
        position: 'fixed', bottom: 0, left: 0, right: 0,
        borderTop: `1px solid ${C.border}`, background: C.bg,
        zIndex: 30, height: 52,
      }}>
        {mobileItems.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              flex: 1, height: '100%', background: 'none', border: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              cursor: 'pointer',
              color: activeTab === t.id ? C.fg : C.dim,
              borderTop: activeTab === t.id ? `2px solid ${C.fg}` : '2px solid transparent',
              transition: 'color 150ms',
            }}
          >
            <span style={{ fontSize: 13 }}>{t.icon}</span>
            <span style={{ fontFamily: C.mono, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t.label}</span>
          </button>
        ))}
        {/* "More" button → opens slide menu */}
        <button
          onClick={() => setMenuOpen(true)}
          style={{
            flex: 1, height: '100%', background: 'none', border: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
            cursor: 'pointer', color: C.dim,
            borderTop: '2px solid transparent',
          }}
        >
          <span style={{ fontSize: 13 }}>⋯</span>
          <span style={{ fontFamily: C.mono, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase' }}>More</span>
        </button>
      </nav>

      <style>{`
        @media (max-width: 768px) {
          .kado-sidebar  { display: none !important; }
          .kado-burger   { display: block !important; }
          .kado-main     { margin-left: 0 !important; padding-bottom: 52px; }
          .kado-mobile-nav { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
