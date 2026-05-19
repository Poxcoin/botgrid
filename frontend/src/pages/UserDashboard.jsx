import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import OverviewTab      from '@/components/user/OverviewTab';
import SettingsTab      from '@/components/user/SettingsTab';
import AccountTab       from '@/components/user/AccountTab';
import SecurityTab      from '@/components/user/SecurityTab';
import ApiKeysTab       from '@/components/user/ApiKeysTab';
const AssetsTab = lazy(() => import('@/components/user/AssetsTab'));
import AnalyticsTab     from '@/components/user/AnalyticsTab';
import OnboardingModal  from '@/components/user/OnboardingModal';
import { useIsMobile }  from '@/lib/useIsMobile';
import { useTheme }     from '@/lib/ThemeContext';

const BOTS = [
  { id: 'signal',    label: 'Signal'         },
  { id: 'sweep',     label: 'Liq Sweep'      },
  { id: 'fr',        label: 'Funding Rate'   },
  { id: 'grid',      label: 'Grid'           },
  { id: 'cascade',   label: 'Cascade'        },
  { id: 'orderflow', label: 'Orderflow'      },
  { id: 'macro',     label: 'Macro'          },
  { id: 'listing',   label: 'Listing Sniper' },
  { id: 'dex',       label: 'DEX Sniper'     },
  { id: 'history',   label: 'History'        },
];
const BOT_IDS = BOTS.map(b => b.id);

function getUser() {
  try { return JSON.parse(localStorage.getItem('kado_user') || '{}'); } catch { return {}; }
}

function usePlanFeatures() {
  const [bots, setBots] = React.useState([]);
  useEffect(() => {
    const token = localStorage.getItem('kado_token');
    if (!token) return;
    fetch('/api/users/plan-features', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setBots(d.bots || []); })
      .catch(() => {});
  }, []);
  return bots;
}

function Page({ tab, allowedBots }) {
  if (BOT_IDS.includes(tab)) return <OverviewTab botId={tab} allowedBots={allowedBots} />;
  switch (tab) {
    case 'analytics': return <AnalyticsTab />;
    case 'account':   return <AccountTab />;
    case 'api-keys':  return <ApiKeysTab />;
    case 'security':  return <SecurityTab />;
    case 'settings':  return <SettingsTab />;
    case 'assets':    return <Suspense fallback={null}><AssetsTab /></Suspense>;
    default:          return null;
  }
}

export default function UserDashboard() {
  const user              = getUser();
  const isMobile          = useIsMobile();
  const { theme, toggle } = useTheme();
  const dark              = theme === 'dark';

  const [tab,        setTab]        = useState('signal');
  const [botsOpen,   setBotsOpen]   = useState(true);
  const [drop,       setDrop]       = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dropRef = useRef(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const allowedBots = usePlanFeatures();

  useEffect(() => { if (!isMobile) setDrawerOpen(false); }, [isMobile]);

  useEffect(() => {
    const token = localStorage.getItem('kado_token');
    if (!token) return;
    fetch('/api/users/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data && !data.onboarding_completed) setShowOnboarding(true); })
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

  const goTab = id => { setTab(id); setDrawerOpen(false); };

  const isBot    = BOT_IDS.includes(tab);
  const allItems = [
    ...BOTS,
    { id: 'analytics', label: 'Balance' },
    { id: 'account',   label: 'Account'   },
    { id: 'api-keys',  label: 'API Keys'  },
    { id: 'security',  label: 'Security'  },
    { id: 'settings',  label: 'Settings'  },
  ];
  const pageLabel = allItems.find(x => x.id === tab)?.label ?? '';

  /* ── tokens ── */
  const bg          = 'var(--bg-base)';
  const bgEl        = 'var(--bg-elevated)';
  const fg          = 'var(--text-primary)';
  const muted       = 'var(--text-muted)';
  const border      = 'var(--border-subtle)';
  const borderHi    = 'var(--border-default)';

  const NavItem = ({ id, label, indent = false }) => {
    const on = tab === id;
    return (
      <button onClick={() => goTab(id)} style={{
        width: '100%', display: 'flex', alignItems: 'center',
        padding: indent ? '9px 20px 9px 40px' : '11px 20px',
        background: on ? fg : 'transparent',
        border: 'none', cursor: 'pointer',
        color: on ? bg : muted,
        fontSize: 13, textAlign: 'left',
        fontFamily: 'var(--font-sans)',
        fontWeight: on ? 500 : 400,
        letterSpacing: indent ? 0 : '0.01em',
        transition: 'background 0.12s, color 0.12s',
        minHeight: 44,
      }}
      onMouseEnter={e => { if (!on) { e.currentTarget.style.color = fg; e.currentTarget.style.background = `var(--bg-overlay)`; } }}
      onMouseLeave={e => { if (!on) { e.currentTarget.style.color = muted; e.currentTarget.style.background = 'transparent'; } }}>
        {label}
      </button>
    );
  };

  const NavContent = () => (
    <>
      {/* logo row */}
      <div style={{
        height: 56, display: 'flex', alignItems: 'center',
        padding: '0 20px', flexShrink: 0,
        borderBottom: `1px solid ${border}`,
        justifyContent: 'space-between',
      }}>
        <a href="/" style={{
          fontFamily: "'Courier New',monospace",
          fontSize: 14, fontWeight: 700, letterSpacing: '0.35em',
          color: fg, textDecoration: 'none',
        }}>KADO</a>
        {isMobile && (
          <button onClick={() => setDrawerOpen(false)} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: muted, fontSize: 20, lineHeight: 1, padding: 4,
          }}>✕</button>
        )}
      </div>

      {/* nav links */}
      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto', scrollbarWidth: 'none' }}>

        <NavItem id="analytics" label="Balance" />

        <div style={{ height: 1, background: border, margin: '8px 0' }}/>

        {/* Bots parent */}
        <button onClick={() => setBotsOpen(v => !v)} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 20px', minHeight: 44,
          background: isBot && !botsOpen ? fg : 'transparent',
          border: 'none', cursor: 'pointer',
          color: isBot ? (botsOpen ? fg : bg) : muted,
          fontSize: 13, fontFamily: 'inherit',
          letterSpacing: '0.01em',
          transition: 'background 0.12s, color 0.12s',
        }}
        onMouseEnter={e => { if (!(isBot && !botsOpen)) { e.currentTarget.style.color = fg; e.currentTarget.style.background = 'var(--bg-overlay)'; } }}
        onMouseLeave={e => { if (!(isBot && !botsOpen)) { e.currentTarget.style.color = isBot ? fg : muted; e.currentTarget.style.background = 'transparent'; } }}>
          <span>Bots</span>
          <span style={{ fontSize: 9, opacity: 0.5 }}>{botsOpen ? '▾' : '▸'}</span>
        </button>

        {botsOpen && BOTS.map(b => <NavItem key={b.id} id={b.id} label={b.label} indent />)}

        <div style={{ height: 1, background: border, margin: '8px 0' }}/>

        {[
          { id: 'account',  label: 'Account'  },
          { id: 'api-keys', label: 'API Keys' },
          { id: 'security', label: 'Security' },
          { id: 'settings', label: 'Settings' },
        ].map(item => <NavItem key={item.id} id={item.id} label={item.label} />)}
      </nav>

      {/* footer: account name + gear + theme + logout */}
      <div style={{
        borderTop: `1px solid ${border}`,
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}>
        <span style={{
          fontSize: 11, color: muted,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
        }}>
          {user.username || '—'}
        </span>
        {/* gear → settings */}
        <button
          onClick={() => goTab('settings')}
          title="Settings"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, fontSize: 13, flexShrink: 0, lineHeight: 1, padding: '2px 4px' }}
          onMouseEnter={e => e.currentTarget.style.color = fg}
          onMouseLeave={e => e.currentTarget.style.color = muted}>
          ⚙
        </button>
        {/* logout */}
        <button
          onClick={() => { localStorage.removeItem('kado_token'); localStorage.removeItem('kado_user'); window.location.href = '/auth'; }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, fontSize: 16, flexShrink: 0, lineHeight: 1, padding: '0 0 0 2px' }}
          onMouseEnter={e => e.currentTarget.style.color = fg}
          onMouseLeave={e => e.currentTarget.style.color = muted}>
          ↪
        </button>
      </div>
    </>
  );

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: bg, color: fg,
      fontFamily: 'var(--font-sans)',
    }}>

      {/* ── DESKTOP SIDEBAR ── */}
      {!isMobile && (
        <div style={{
          width: 200, flexShrink: 0,
          background: bg,
          borderRight: `1px solid ${border}`,
          display: 'flex', flexDirection: 'column',
        }}>
          <NavContent />
        </div>
      )}

      {/* ── MOBILE BACKDROP ── */}
      {isMobile && drawerOpen && (
        <div
          onClick={() => setDrawerOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200 }}
        />
      )}

      {/* ── MOBILE DRAWER ── */}
      {isMobile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, width: 260,
          background: bg,
          borderRight: `1px solid ${border}`,
          display: 'flex', flexDirection: 'column',
          zIndex: 201,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.22s ease',
        }}>
          <NavContent />
        </div>
      )}

      {/* ── MAIN ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>

        {/* header */}
        <div style={{
          height: 56, flexShrink: 0,
          borderBottom: `1px solid ${border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: isMobile ? '0 16px' : '0 28px',
          gap: 12,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {isMobile && (
              <button
                onClick={() => setDrawerOpen(v => !v)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: muted, fontSize: 18, lineHeight: 1, padding: 4, flexShrink: 0 }}
                onMouseEnter={e => e.currentTarget.style.color = fg}
                onMouseLeave={e => e.currentTarget.style.color = muted}>
                ☰
              </button>
            )}
            <span style={{ fontSize: 13, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pageLabel}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {/* theme toggle — header (desktop only; mobile gets it in drawer footer) */}
            {!isMobile && (
              <button
                onClick={toggle}
                title={dark ? 'Light mode' : 'Dark mode'}
                style={{ background: 'none', border: `1px solid ${border}`, cursor: 'pointer', color: muted, fontSize: 13, padding: '5px 9px', lineHeight: 1, fontFamily: 'inherit' }}
                onMouseEnter={e => { e.currentTarget.style.color = fg; e.currentTarget.style.borderColor = borderHi; }}
                onMouseLeave={e => { e.currentTarget.style.color = muted; e.currentTarget.style.borderColor = border; }}>
                {dark ? '☀ Light' : '🌙 Dark'}
              </button>
            )}

            {/* account dropdown */}
            <div ref={dropRef} style={{ position: 'relative' }}>
              <button onClick={() => setDrop(v => !v)} style={{
                background: 'transparent', border: `1px solid ${border}`,
                padding: isMobile ? '6px 10px' : '6px 14px', cursor: 'pointer',
                fontSize: 12, color: muted, fontFamily: 'inherit',
                maxWidth: isMobile ? 110 : 'none',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = borderHi; e.currentTarget.style.color = fg; }}
              onMouseLeave={e => { if (!drop) { e.currentTarget.style.borderColor = border; e.currentTarget.style.color = muted; } }}>
                {user.username || 'Account'}
              </button>

              {drop && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', right: 0, width: 180,
                  background: bgEl, border: `1px solid ${borderHi}`, zIndex: 100,
                }}>
                  {/* theme in dropdown (mobile) */}
                  {isMobile && (
                    <button onClick={toggle}
                      style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: muted, textAlign: 'left', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}
                      onMouseEnter={e => { e.currentTarget.style.color = fg; e.currentTarget.style.background = 'var(--bg-overlay)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = muted; e.currentTarget.style.background = 'none'; }}>
                      {dark ? '☀' : '🌙'} {dark ? 'Light mode' : 'Dark mode'}
                    </button>
                  )}
                  <button onClick={() => { localStorage.removeItem('kado_token'); localStorage.removeItem('kado_user'); window.location.href = '/auth'; }}
                    style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: muted, textAlign: 'left', fontFamily: 'inherit' }}
                    onMouseEnter={e => { e.currentTarget.style.color = fg; e.currentTarget.style.background = 'var(--bg-overlay)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = muted; e.currentTarget.style.background = 'none'; }}>
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* content */}
        <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px' : '28px', display: 'flex', flexDirection: 'column' }}>
          <Page tab={tab} allowedBots={allowedBots} />
        </div>
      </div>

      <style>{`
        *{box-sizing:border-box}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:var(--border-default)}
      `}</style>

      {showOnboarding && (
        <OnboardingModal
          username={user.username}
          onClose={() => setShowOnboarding(false)}
          onGoToKeys={() => { goTab('api-keys'); setShowOnboarding(false); }}
        />
      )}
    </div>
  );
}
