import React, { useState, useEffect, useRef } from 'react';
import OverviewTab      from '@/components/user/OverviewTab';
import SettingsTab      from '@/components/user/SettingsTab';
import AccountTab       from '@/components/user/AccountTab';
import SecurityTab      from '@/components/user/SecurityTab';
import ApiKeysTab       from '@/components/user/ApiKeysTab';
import AssetsTab        from '@/components/user/AssetsTab';
import AnalyticsTab     from '@/components/user/AnalyticsTab';
import PnlTab           from '@/components/user/PnlTab';
import OnboardingModal  from '@/components/user/OnboardingModal';

const BOTS = [
  { id: 'signal',  label: 'Signal'         },
  { id: 'fr',      label: 'Funding Rate'   },
  { id: 'grid',    label: 'Grid'           },
  { id: 'cascade', label: 'Cascade'        },
  { id: 'metals',  label: 'Gold'           },
  { id: 'listing', label: 'Listing Sniper' },
  { id: 'dex',     label: 'DEX Sniper'     },
  { id: 'history', label: 'History'        },
];
const BOT_IDS = BOTS.map(b => b.id);

function getUser() {
  try { return JSON.parse(localStorage.getItem('kado_user') || '{}'); } catch { return {}; }
}

function Page({ tab }) {
  if (BOT_IDS.includes(tab)) return <OverviewTab botId={tab} />;
  switch (tab) {
    case 'analytics': return <AnalyticsTab />;
    case 'pnl':       return <PnlTab />;
    case 'account':   return <AccountTab />;
    case 'api-keys':  return <ApiKeysTab />;
    case 'security':  return <SecurityTab />;
    case 'settings':  return <SettingsTab />;
    case 'assets':    return <AssetsTab />;
    default:          return null;
  }
}

export default function UserDashboard() {
  const user = getUser();
  const [tab,      setTab]      = useState('signal');
  const [botsOpen, setBotsOpen] = useState(true);
  const [drop,     setDrop]     = useState(false);
  const dropRef = useRef(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('kado_token');
    if (!token) return;
    fetch('/api/users/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && !data.onboarding_completed) setShowOnboarding(true);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const h = e => setTab(e.detail);
    window.addEventListener('switch-tab', h);
    return () => window.removeEventListener('switch-tab', h);
  }, []);

  useEffect(() => {
    if (!drop) return;
    const h = e => { if (!dropRef.current?.contains(e.target)) setDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [drop]);

  const isBot = BOT_IDS.includes(tab);
  const allItems = [
    ...BOTS,
    { id: 'analytics', label: 'Analytics' },
    { id: 'pnl',       label: 'PnL'       },
    { id: 'account',   label: 'Account'   },
    { id: 'api-keys',  label: 'API Keys'  },
    { id: 'security',  label: 'Security'  },
    { id: 'settings',  label: 'Settings'  },
  ];
  const pageLabel = allItems.find(x => x.id === tab)?.label ?? '';

  const NavItem = ({ id, label, indent = false }) => {
    const on = tab === id;
    return (
      <button onClick={() => setTab(id)} style={{
        width: '100%', display: 'flex', alignItems: 'center',
        padding: indent ? '8px 20px 8px 40px' : '10px 20px',
        background: on ? '#fff' : 'transparent',
        border: 'none', cursor: 'pointer',
        color: on ? '#000' : 'rgba(255,255,255,0.4)',
        fontSize: 13, textAlign: 'left',
        fontFamily: "var(--font-sans)",
        fontWeight: on ? 500 : 400,
        letterSpacing: indent ? 0 : '0.01em',
        transition: 'background 0.1s, color 0.1s',
      }}
      onMouseEnter={e => { if (!on) { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; } }}
      onMouseLeave={e => { if (!on) { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.background = 'transparent'; } }}>
        {label}
      </button>
    );
  };

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: '#000', color: '#fff',
      fontFamily: "var(--font-sans)",
    }}>

      {/* SIDEBAR */}
      <div style={{
        width: 200, flexShrink: 0,
        background: '#000',
        borderRight: '1px solid rgba(255,255,255,0.1)',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* logo */}
        <div style={{
          height: 56, display: 'flex', alignItems: 'center', padding: '0 20px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <a href="/" style={{
            fontFamily: "'Courier New',monospace",
            fontSize: 14, fontWeight: 700, letterSpacing: '0.35em',
            color: '#fff', textDecoration: 'none',
          }}>KADO</a>
        </div>

        {/* nav */}
        <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto', scrollbarWidth: 'none' }}>

          {/* Bots parent */}
          <button onClick={() => setBotsOpen(v => !v)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 20px',
            background: isBot && !botsOpen ? '#fff' : 'transparent',
            border: 'none', cursor: 'pointer',
            color: isBot ? (botsOpen ? '#fff' : '#000') : 'rgba(255,255,255,0.4)',
            fontSize: 13, fontFamily: 'inherit',
            letterSpacing: '0.01em',
          }}
          onMouseEnter={e => { if (!(isBot && !botsOpen)) { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; } }}
          onMouseLeave={e => { if (!(isBot && !botsOpen)) { e.currentTarget.style.color = isBot ? '#fff' : 'rgba(255,255,255,0.4)'; e.currentTarget.style.background = 'transparent'; } }}>
            <span>Bots</span>
            <span style={{ fontSize: 9, opacity: 0.5 }}>{botsOpen ? '▾' : '▸'}</span>
          </button>

          {botsOpen && BOTS.map(b => <NavItem key={b.id} id={b.id} label={b.label} indent />)}

          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '12px 0' }}/>

          {[
            { id: 'analytics', label: 'Analytics' },
            { id: 'pnl',       label: 'PnL'       },
          ].map(item => <NavItem key={item.id} id={item.id} label={item.label} />)}

          <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '12px 0' }}/>

          {[
            { id: 'account',  label: 'Account'  },
            { id: 'api-keys', label: 'API Keys' },
            { id: 'security', label: 'Security' },
            { id: 'settings', label: 'Settings' },
          ].map(item => <NavItem key={item.id} id={item.id} label={item.label} />)}
        </nav>

        {/* footer */}
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: '12px 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{
            fontSize: 11, color: 'rgba(255,255,255,0.25)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
          }}>
            {user.email ?? '—'}
          </span>
          <button onClick={() => { localStorage.removeItem('kado_token'); localStorage.removeItem('kado_user'); window.location.href = '/auth'; }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.2)', fontSize: 16, flexShrink: 0, lineHeight: 1, padding: '0 0 0 8px' }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}>
            ↪
          </button>
        </div>
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* header */}
        <div style={{
          height: 56, flexShrink: 0,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 28px',
        }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>{pageLabel}</span>

          <div ref={dropRef} style={{ position: 'relative' }}>
            <button onClick={() => setDrop(v => !v)} style={{
              background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
              padding: '6px 14px', cursor: 'pointer',
              fontSize: 12, color: 'rgba(255,255,255,0.35)', fontFamily: 'inherit',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { if (!drop) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)'; } }}>
              {user.email ?? 'Account'}
            </button>

            {drop && (
              <div style={{
                position: 'absolute', top: 'calc(100% + 4px)', right: 0, width: 180,
                background: '#111', border: '1px solid rgba(255,255,255,0.12)', zIndex: 100,
              }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
                  {user.email}
                </div>
                <button onClick={() => { localStorage.removeItem('kado_token'); localStorage.removeItem('kado_user'); window.location.href = '/auth'; }}
                  style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'left', fontFamily: 'inherit' }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.background = 'none'; }}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>

        {/* content */}
        <div style={{ flex: 1, overflow: isBot ? 'hidden' : 'auto', padding: '28px', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <Page tab={tab} />
        </div>
      </div>

      <style>{`*{box-sizing:border-box}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1)}`}</style>

      {showOnboarding && (
        <OnboardingModal
          username={user.username}
          onClose={() => setShowOnboarding(false)}
          onGoToKeys={() => { setTab('api-keys'); setShowOnboarding(false); }}
        />
      )}
    </div>
  );
}
