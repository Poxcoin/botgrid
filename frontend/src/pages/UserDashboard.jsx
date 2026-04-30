import React, { useState } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import OverviewTab from '@/components/user/OverviewTab';
import TradesTab from '@/components/user/TradesTab';
import PnlTab from '@/components/user/PnlTab';
import ApiKeysTab from '@/components/user/ApiKeysTab';
import SettingsTab from '@/components/user/SettingsTab';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'trades',   label: 'Trades' },
  { id: 'pnl',      label: 'PnL' },
  { id: 'api',      label: 'API Keys' },
  { id: 'settings', label: 'Settings' },
];

function TabContent({ tab }) {
  if (tab === 'overview') return <OverviewTab />;
  if (tab === 'trades')   return <TradesTab />;
  if (tab === 'pnl')      return <PnlTab />;
  if (tab === 'api')      return <ApiKeysTab />;
  if (tab === 'settings') return <SettingsTab />;
  return null;
}

export default function UserDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const { theme, toggle } = useTheme();
  const email = localStorage.getItem('kado_email') || '';

  function logout() {
    localStorage.removeItem('kado_token');
    localStorage.removeItem('kado_email');
    window.location.href = '/auth';
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)' }}>

      {/* Sidebar */}
      <aside className="dashboard-sidebar" style={{
        width: 220, flexShrink: 0, borderRight: '1px solid var(--border)',
        background: 'var(--bg)', position: 'fixed', top: 0, left: 0, bottom: 0,
        display: 'flex', flexDirection: 'column', zIndex: 20,
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', fontSize: 16, fontWeight: 900, letterSpacing: '-0.04em' }}>
          KADO
        </div>
        <nav style={{ flex: 1, padding: '16px 0' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '10px 24px', background: 'none', border: 'none',
              fontSize: 13, cursor: 'pointer',
              color: activeTab === t.id ? 'var(--fg)' : 'var(--muted-fg)',
              fontWeight: activeTab === t.id ? 600 : 400,
              borderLeft: activeTab === t.id ? '2px solid var(--fg)' : '2px solid transparent',
              transition: 'color 150ms',
            }}>
              {t.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <div className="dashboard-main" style={{ marginLeft: 220, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header style={{
          height: 56, borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
          gap: 16, padding: '0 28px', background: 'var(--bg)',
          position: 'sticky', top: 0, zIndex: 10,
        }}>
          {email && <span style={{ fontSize: 12, color: 'var(--muted-fg)' }}>{email}</span>}
          <button onClick={toggle} style={{
            background: 'none', border: '1px solid var(--border)', color: 'var(--muted-fg)',
            cursor: 'pointer', padding: '5px 10px', fontSize: 11, letterSpacing: '0.06em',
          }}>
            {theme === 'dark' ? 'LIGHT' : 'DARK'}
          </button>
          <button onClick={logout} style={{ background: 'none', border: 'none', color: 'var(--muted-fg)', cursor: 'pointer', fontSize: 12 }}>
            Logout
          </button>
        </header>

        <main style={{ flex: 1, padding: '32px 28px', maxWidth: 1100 }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 24, letterSpacing: '-0.02em' }}>
            {TABS.find(t => t.id === activeTab)?.label}
          </div>
          <TabContent tab={activeTab} />
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="mobile-tab-bar" style={{
        display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0,
        borderTop: '1px solid var(--border)', background: 'var(--bg)', zIndex: 30, height: 56,
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            flex: 1, height: '100%', background: 'none', border: 'none',
            fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: activeTab === t.id ? 'var(--fg)' : 'var(--muted-fg)',
            fontWeight: activeTab === t.id ? 700 : 400, cursor: 'pointer',
          }}>
            {t.label}
          </button>
        ))}
      </nav>

      <style>{`
        @media (max-width: 768px) {
          .dashboard-sidebar { display: none !important; }
          .dashboard-main { margin-left: 0 !important; padding-bottom: 56px; }
          .mobile-tab-bar { display: flex !important; }
        }
      `}</style>
    </div>
  );
}
