import React, { useState } from 'react';
import OverviewTab from '@/components/user/OverviewTab';
import TradesTab from '@/components/user/TradesTab';
import PnlTab from '@/components/user/PnlTab';
import ApiKeysTab from '@/components/user/ApiKeysTab';
import SettingsTab from '@/components/user/SettingsTab';
import BotTab from '@/components/user/BotTab';
import SignalsTab from '@/components/user/SignalsTab';
import LogsTab from '@/components/user/LogsTab';
import BacktesterTab from '@/components/dashboard/BacktesterTab';
import AnalyticsTab from '@/components/user/AnalyticsTab';

const TABS = [
  { id: 'overview',   label: 'Overview' },
  { id: 'bot',        label: 'Bot' },
  { id: 'trades',     label: 'Trades' },
  { id: 'analytics',  label: 'Analytics' },
  { id: 'pnl',        label: 'PnL' },
  { id: 'signals',    label: 'Signals' },
  { id: 'backtester', label: 'Backtester' },
  { id: 'logs',       label: 'Logs' },
  { id: 'api',        label: 'API Keys' },
  { id: 'settings',   label: 'Settings' },
];

const S = {
  bg:     '#060606',
  border: 'rgba(255,255,255,0.06)',
  borderHi: 'rgba(255,255,255,0.15)',
  fg:     '#fff',
  muted:  '#555',
  dim:    '#333',
  font:   "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",
  mono:   "'Courier New','SF Mono',monospace",
};

function getUser() {
  try { return JSON.parse(localStorage.getItem('kado_user') || '{}'); } catch { return {}; }
}

function TabContent({ tab }) {
  if (tab === 'overview')   return <OverviewTab />;
  if (tab === 'bot')        return <BotTab />;
  if (tab === 'trades')     return <TradesTab />;
  if (tab === 'analytics')  return <AnalyticsTab />;
  if (tab === 'pnl')        return <PnlTab />;
  if (tab === 'signals')    return <SignalsTab />;
  if (tab === 'backtester') return <BacktesterTab />;
  if (tab === 'logs')       return <LogsTab />;
  if (tab === 'api')        return <ApiKeysTab />;
  if (tab === 'settings')   return <SettingsTab />;
  return null;
}

export default function UserDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const user = getUser();

  function logout() {
    localStorage.removeItem('kado_token');
    localStorage.removeItem('kado_user');
    window.location.href = '/auth';
  }

  const tabLabel = TABS.find(t => t.id === activeTab)?.label ?? '';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: S.bg, color: S.fg, fontFamily: S.font }}>

      {/* ── Sidebar ── */}
      <aside className="kado-sidebar" style={{
        width: 200, flexShrink: 0,
        borderRight: `1px solid ${S.border}`,
        background: S.bg,
        position: 'fixed', top: 0, left: 0, bottom: 0,
        display: 'flex', flexDirection: 'column',
        zIndex: 20,
      }}>
        {/* Logo */}
        <div style={{ padding: '22px 24px', borderBottom: `1px solid ${S.border}` }}>
          <a href="/" style={{ fontFamily: S.mono, fontSize: 13, fontWeight: 700, letterSpacing: '0.08em', color: S.fg, textDecoration: 'none' }}>
            KADO
          </a>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 0' }}>
          {TABS.map(t => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '11px 24px',
                  background: 'none', border: 'none',
                  fontFamily: S.mono, fontSize: 11,
                  letterSpacing: '0.12em', textTransform: 'uppercase',
                  cursor: 'pointer',
                  color: active ? S.fg : S.muted,
                  borderLeft: active ? `1px solid ${S.borderHi}` : '1px solid transparent',
                  transition: 'color 150ms, border-color 150ms',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#aaa'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = S.muted; }}
              >
                {t.label}
              </button>
            );
          })}
        </nav>

        {/* User block */}
        <div style={{ padding: '16px 24px', borderTop: `1px solid ${S.border}` }}>
          {user.email && (
            <div style={{
              fontFamily: S.mono, fontSize: 10, color: S.muted,
              letterSpacing: '0.04em', marginBottom: 6,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {user.email}
            </div>
          )}
          {user.plan && (
            <div style={{
              display: 'inline-block',
              fontFamily: S.mono, fontSize: 9, letterSpacing: '0.15em',
              color: S.dim, textTransform: 'uppercase',
              border: `1px solid ${S.border}`,
              padding: '2px 7px', borderRadius: 100, marginBottom: 14,
            }}>
              {user.plan}
            </div>
          )}
          <button
            onClick={logout}
            style={{
              display: 'block', width: '100%',
              background: 'none', border: `1px solid ${S.border}`,
              color: S.muted, fontFamily: S.mono, fontSize: 10,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              padding: '7px 0', cursor: 'pointer',
              transition: 'border-color 150ms, color 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = S.borderHi; e.currentTarget.style.color = S.fg; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = S.border; e.currentTarget.style.color = S.muted; }}
          >
            Logout
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="kado-main" style={{ marginLeft: 200, flex: 1, display: 'flex', flexDirection: 'column' }}>

        {/* Top bar */}
        <header style={{
          height: 52, borderBottom: `1px solid ${S.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 32px', background: S.bg,
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          <div style={{ fontFamily: S.mono, fontSize: 11, letterSpacing: '0.15em', color: S.muted, textTransform: 'uppercase' }}>
            {tabLabel}
          </div>
          {user.email_verified === false && (
            <div style={{ fontFamily: S.mono, fontSize: 10, color: '#f59e0b', letterSpacing: '0.08em' }}>
              ⚠ Email not verified — check your inbox
            </div>
          )}
        </header>

        {/* Content */}
        <main style={{ flex: 1, padding: '40px 32px' }}>
          <TabContent tab={activeTab} />
        </main>
      </div>

      {/* ── Mobile bottom nav ── */}
      <nav className="kado-mobile-nav" style={{
        display: 'none',
        position: 'fixed', bottom: 0, left: 0, right: 0,
        borderTop: `1px solid ${S.border}`, background: S.bg,
        zIndex: 30, height: 56,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            flex: 1, height: '100%', background: 'none', border: 'none',
            fontFamily: S.mono, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: activeTab === t.id ? S.fg : S.muted,
            cursor: 'pointer',
          }}>
            {t.label}
          </button>
        ))}
      </nav>

      <style>{`
        @media (max-width: 768px) {
          .kado-sidebar { display: none !important; }
          .kado-main { margin-left: 0 !important; padding-bottom: 56px; }
          .kado-mobile-nav { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
