import React, { useState, useEffect, useRef } from 'react';
import OverviewTab    from '@/components/user/OverviewTab';
import TradesTab      from '@/components/user/TradesTab';
import PnlTab         from '@/components/user/PnlTab';
import SettingsTab    from '@/components/user/SettingsTab';
import AccountTab     from '@/components/user/AccountTab';
import BotTab         from '@/components/user/BotTab';
import SignalsTab     from '@/components/user/SignalsTab';
import LogsTab        from '@/components/user/LogsTab';
import BacktesterTab  from '@/components/dashboard/BacktesterTab';
import AnalyticsTab   from '@/components/user/AnalyticsTab';
import SecurityTab    from '@/components/user/SecurityTab';
import { useLang }    from '@/lib/LangContext';
import { usePageTitle } from '@/lib/usePageTitle';

const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif";
const MONO = "'Courier New','SF Mono',monospace";

const MAIN_TAB_IDS = ['overview', 'bot', 'analytics', 'pnl', 'trades', 'signals', 'logs', 'backtester'];
const SECONDARY_TAB_IDS = ['account', 'security', 'settings'];
const TAB_LABEL_KEY = {
  overview:   'tabOverview',
  bot:        'tabBot',
  analytics:  'tabAnalytics',
  pnl:        'tabPnl',
  trades:     'tabTrades',
  signals:    'tabSignals',
  logs:       'tabLogs',
  backtester: 'tabBacktester',
  account:    'tabAccount',
  security:   'tabSecurity',
  settings:   'tabSettings',
};

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
    case 'account':    return <AccountTab />;
    case 'security':   return <SecurityTab />;
    case 'settings':   return <SettingsTab />;
    default:           return null;
  }
}

function getUser() {
  try { return JSON.parse(localStorage.getItem('kado_user') || '{}'); } catch { return {}; }
}

function UserDropdown({ user, activeTab, setActiveTab, onClose }) {
  const { t } = useLang();
  function logout() {
    localStorage.removeItem('kado_token');
    localStorage.removeItem('kado_user');
    window.location.href = '/auth';
  }

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0,
      width: 224, background: '#0e0e0e',
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 20px 48px rgba(0,0,0,0.7)',
      zIndex: 200, padding: '8px 0',
    }}>
      {/* User info block */}
      <div style={{ padding: '10px 16px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        {user.plan && (
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 100, padding: '2px 9px',
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em',
            color: user.plan === 'performance' || user.plan === 'pro' ? '#ccc' : '#555',
            textTransform: 'uppercase', marginBottom: 7,
          }}>
            {user.plan}
          </div>
        )}
        <div style={{
          fontFamily: MONO, fontSize: 10, color: '#4a4a4a',
          letterSpacing: '0.02em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {user.email || '—'}
        </div>
      </div>

      {/* Security & Settings */}
      {SECONDARY_TAB_IDS.map(id => (
        <button key={id}
          onClick={() => { setActiveTab(id); onClose(); }}
          style={{
            display: 'flex', alignItems: 'center',
            width: '100%', padding: '10px 16px',
            background: activeTab === id ? 'rgba(255,255,255,0.04)' : 'none',
            border: 'none', cursor: 'pointer',
            fontFamily: FONT, fontSize: 13,
            color: activeTab === id ? '#fff' : '#666',
            textAlign: 'left', transition: 'background 120ms, color 120ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.background = activeTab === id ? 'rgba(255,255,255,0.04)' : 'none'; e.currentTarget.style.color = activeTab === id ? '#fff' : '#666'; }}
        >
          {t.dashboard[TAB_LABEL_KEY[id]]}
        </button>
      ))}

      <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '8px 0' }} />

      <button
        onClick={logout}
        style={{
          display: 'flex', alignItems: 'center',
          width: '100%', padding: '10px 16px',
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: FONT, fontSize: 13, color: '#555',
          textAlign: 'left', transition: 'background 120ms, color 120ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = '#fff'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#555'; }}
      >
        {t.dashboard.logout}
      </button>
    </div>
  );
}

export default function UserDashboard() {
  const { t } = useLang();
  const [activeTab, setActiveTab]   = useState('overview');
  usePageTitle(t.dashboard[TAB_LABEL_KEY[activeTab]]);
  const [menuOpen,  setMenuOpen]    = useState(false);
  const [userDrop,  setUserDrop]    = useState(false);
  const userDropRef = useRef(null);
  const user = getUser();
  const allTabIds = [...MAIN_TAB_IDS, ...SECONDARY_TAB_IDS];

  useEffect(() => {
    const h = e => setActiveTab(e.detail);
    window.addEventListener('switch-tab', h);
    return () => window.removeEventListener('switch-tab', h);
  }, []);

  useEffect(() => {
    function handler(e) {
      if (userDropRef.current && !userDropRef.current.contains(e.target)) setUserDrop(false);
    }
    if (userDrop) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [userDrop]);

  return (
    <div style={{ minHeight: '100vh', background: '#060606', color: '#fff', fontFamily: FONT }}>

      {/* ── Top navigation bar ──────────────────────────────────────────────── */}
      <header style={{
        height: 58,
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--site-bg-glass)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        position: 'sticky', top: 0, zIndex: 50,
        display: 'flex', alignItems: 'stretch',
        padding: '0 24px',
      }}>
        {/* Logo */}
        <a href="/" style={{
          display: 'flex', alignItems: 'center',
          fontFamily: MONO, fontSize: 14, fontWeight: 800,
          letterSpacing: '0.15em', color: 'var(--text-primary)',
          textDecoration: 'none', marginRight: 32, flexShrink: 0,
        }}>
          KADO
        </a>

        {/* Mobile burger */}
        <button className="kado-burger"
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Open menu"
          aria-expanded={menuOpen}
          title="Open menu"
          style={{
            display: 'none', alignItems: 'center',
            background: 'none', border: 'none', color: '#fff',
            cursor: 'pointer', padding: '0 8px 0 0', marginRight: 8,
          }}>
          <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
            <rect width="18" height="1.5" fill="currentColor"/>
            <rect y="6" width="18" height="1.5" fill="currentColor"/>
            <rect y="12" width="18" height="1.5" fill="currentColor"/>
          </svg>
        </button>

        {/* Tab nav */}
        <nav className="kado-topnav" style={{
          display: 'flex', alignItems: 'stretch', flex: 1, gap: 0,
          overflowX: 'auto', scrollbarWidth: 'none',
        }}>
          {MAIN_TAB_IDS.map(id => {
            const active = activeTab === id;
            return (
              <button key={id}
                onClick={() => setActiveTab(id)}
                style={{
                  height: '100%', padding: '0 16px',
                  background: 'none', border: 'none',
                  borderBottom: active ? '2px solid var(--accent-green)' : '2px solid transparent',
                  marginBottom: -1,
                  fontFamily: FONT, fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                  cursor: 'pointer', flexShrink: 0,
                  transition: 'color 200ms, border-color 200ms',
                  letterSpacing: '0.01em',
                }}
                onMouseEnter={e => {
                  if (!active) {
                    e.currentTarget.style.color = 'var(--text-secondary)';
                    e.currentTarget.style.borderBottomColor = 'var(--border-default)';
                  }
                }}
                onMouseLeave={e => {
                  if (!active) {
                    e.currentTarget.style.color = 'var(--text-muted)';
                    e.currentTarget.style.borderBottomColor = 'transparent';
                  }
                }}
              >
                {t.dashboard[TAB_LABEL_KEY[id]]}
              </button>
            );
          })}
        </nav>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0, marginLeft: 16 }}>
          {user.email_verified === false && (
            <div style={{ fontFamily: MONO, fontSize: 9, color: '#f59e0b', letterSpacing: '0.08em', flexShrink: 0 }}>
              {t.dashboard.verifyEmail}
            </div>
          )}

          {/* User pill */}
          <div ref={userDropRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setUserDrop(v => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                background: userDrop ? 'var(--bg-elevated)' : 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6, padding: '6px 12px 6px 6px',
                cursor: 'pointer', transition: 'border-color 200ms, background 200ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
              onMouseLeave={e => { if (!userDrop) e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
            >
              {/* Avatar */}
              <span style={{
                width: 24, height: 24, borderRadius: '50%',
                background: 'rgba(255,255,255,0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: MONO, fontSize: 10, color: '#ccc', flexShrink: 0,
              }}>
                {user.email ? user.email[0].toUpperCase() : '?'}
              </span>
              <span className="kado-user-email" style={{
                fontFamily: FONT, fontSize: 12, color: '#888',
                maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {user.email || t.dashboard.account}
              </span>
              <svg width="9" height="5" viewBox="0 0 9 5" fill="none" style={{ opacity: 0.35, flexShrink: 0 }}>
                <path d="M1 1l3.5 3L8 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            {userDrop && (
              <UserDropdown
                user={user}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                onClose={() => setUserDrop(false)}
              />
            )}
          </div>
        </div>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <main className="kado-content" style={{ padding: '36px 32px 72px', minWidth: 0 }}>
        <TabContent tab={activeTab} />
      </main>

      {/* ── Mobile slide-over ────────────────────────────────────────────────── */}
      {menuOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 100 }}
          onClick={() => setMenuOpen(false)}
        >
          <div
            style={{
              position: 'absolute', top: 0, left: 0, bottom: 0, width: 268,
              background: '#060606', borderRight: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', flexDirection: 'column', overflowY: 'auto',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: MONO, fontSize: 14, fontWeight: 900, letterSpacing: '-0.03em' }}>KADO</span>
              <button onClick={() => setMenuOpen(false)} style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 18 }}>✕</button>
            </div>
            <nav style={{ flex: 1, padding: '8px 0' }}>
              {allTabIds.map(id => {
                const active = activeTab === id;
                return (
                  <button key={id}
                    onClick={() => { setActiveTab(id); setMenuOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center',
                      width: '100%', textAlign: 'left',
                      padding: '12px 24px',
                      background: active ? 'rgba(255,255,255,0.04)' : 'none',
                      border: 'none',
                      fontFamily: FONT, fontSize: 14,
                      cursor: 'pointer', color: active ? '#fff' : '#555',
                      transition: 'background 120ms, color 120ms',
                    }}
                  >
                    {t.dashboard[TAB_LABEL_KEY[id]]}
                  </button>
                );
              })}
            </nav>
            <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
              {user.email && (
                <div style={{ fontFamily: MONO, fontSize: 10, color: '#3a3a3a', marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.email}
                </div>
              )}
              <button
                onClick={() => { localStorage.removeItem('kado_token'); localStorage.removeItem('kado_user'); window.location.href = '/auth'; }}
                style={{
                  background: 'none', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#555', fontFamily: FONT, fontSize: 13,
                  padding: '9px 0', cursor: 'pointer', width: '100%',
                  borderRadius: 8, transition: 'border-color 150ms, color 150ms',
                }}>
                {t.dashboard.logout}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 768px) {
          .kado-burger      { display: flex !important; }
          .kado-topnav      { display: none !important; }
          .kado-user-email  { display: none !important; }
          .kado-content     { padding: 20px 16px 72px !important; }
        }
        .kado-topnav::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
