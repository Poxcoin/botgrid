import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import OverviewTab from '@/components/user/OverviewTab';
import MacroBotTab from '@/components/user/MacroBotTab';
import { useIsMobile } from '@/lib/useIsMobile';
import { useTheme }    from '@/lib/ThemeContext';
import { useLang }     from '@/lib/LangContext';

const BYBIT_BOTS = [
  { id: 'signal',    label: 'Signal'         },
  { id: 'sweep',     label: 'Liq Sweep'      },
  { id: 'fr',        label: 'Funding Rate'   },
  { id: 'grid',      label: 'Grid'           },
  { id: 'cascade',   label: 'Cascade'        },
  { id: 'orderflow', label: 'Orderflow'      },
  { id: 'ob',        label: 'Order Block'    },
];
const MT5_BOTS = [
  { id: 'macro', label: 'Macro Forex' },
  { id: 'gold',  label: 'Gold'        },
];
const ALL_BOTS = [...BYBIT_BOTS, ...MT5_BOTS, { id: 'history', label: 'History' }];
const ALL_IDS  = ALL_BOTS.map(b => b.id);

function getUser() {
  try {
    const u = JSON.parse(localStorage.getItem('kado_user') || '{}');
    if (u.username && u.username.includes('@')) u.username = u.username.split('@')[0];
    return u;
  } catch { return {}; }
}

function usePlanFeatures() {
  const [bots, setBots] = useState([]);
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
  if (tab === 'macro' || tab === 'gold') return <MacroBotTab botId={tab} />;
  if (ALL_IDS.includes(tab)) return <OverviewTab botId={tab} allowedBots={allowedBots} />;
  return null;
}

export default function BotsControlPage() {
  const user              = getUser();
  const isMobile          = useIsMobile();
  const { theme, toggle } = useTheme();
  const { t }             = useLang();
  const dark              = theme === 'dark';

  const initialFromHash = () => {
    const h = (typeof window !== 'undefined' ? window.location.hash.slice(1) : '') || '';
    return ALL_IDS.includes(h) ? h : 'signal';
  };

  const [tab,        setTab]        = useState(initialFromHash);
  const [drop,       setDrop]       = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dropRef = useRef(null);
  const allowedBots = usePlanFeatures();

  useEffect(() => { if (!isMobile) setDrawerOpen(false); }, [isMobile]);

  useEffect(() => {
    if (!drop) return;
    const h = e => { if (!dropRef.current?.contains(e.target)) setDrop(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [drop]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const newHash = `#${tab}`;
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, '', `${window.location.pathname}${newHash}`);
    }
  }, [tab]);

  const goTab = id => { setTab(id); setDrawerOpen(false); };

  const pageLabel = ALL_BOTS.find(b => b.id === tab)?.label ?? '';

  /* ── tokens ── */
  const bg       = 'var(--bg-base)';
  const bgEl     = 'var(--bg-elevated)';
  const fg       = 'var(--text-primary)';
  const muted    = 'var(--text-muted)';
  const border   = 'var(--border-subtle)';
  const borderHi = 'var(--border-default)';

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
      onMouseEnter={e => { if (!on) { e.currentTarget.style.color = fg; e.currentTarget.style.background = 'var(--bg-overlay)'; } }}
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

      <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto', scrollbarWidth: 'none' }}>
        <div style={{ padding: '6px 20px 2px 20px', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: muted, fontFamily: "'Courier New',monospace", opacity: 0.5 }}>BYBIT</div>
        {BYBIT_BOTS.map(b => <NavItem key={b.id} id={b.id} label={b.label} />)}

        <div style={{ padding: '10px 20px 2px 20px', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: muted, fontFamily: "'Courier New',monospace", opacity: 0.5 }}>MT5</div>
        {MT5_BOTS.map(b => <NavItem key={b.id} id={b.id} label={b.label} />)}

        <div style={{ height: 1, background: border, margin: '12px 0' }}/>
        <NavItem id="history" label="History" />
      </nav>

      {/* footer: back to account + theme + logout */}
      <div style={{
        borderTop: `1px solid ${border}`,
        padding: '10px 20px',
        display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
      }}>
        <Link to="/account" title={t.dashboard.tabAccount} style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: muted, fontSize: 12, flex: 1, lineHeight: 1, padding: '2px 4px',
          textDecoration: 'none', fontFamily: 'inherit',
        }}
        onMouseEnter={e => e.currentTarget.style.color = fg}
        onMouseLeave={e => e.currentTarget.style.color = muted}>
          ← {t.dashboard.tabAccount}
        </Link>
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
      background: bg, color: fg, fontFamily: 'var(--font-sans)',
    }}>
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

      {isMobile && drawerOpen && (
        <div onClick={() => setDrawerOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 200 }} />
      )}

      {isMobile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, width: 260,
          background: bg, borderRight: `1px solid ${border}`,
          display: 'flex', flexDirection: 'column',
          zIndex: 201,
          transform: drawerOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.22s ease',
        }}>
          <NavContent />
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        <div style={{
          height: 56, flexShrink: 0,
          background: bg,
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
            <button
              onClick={toggle}
              title={dark ? t.dashboard.lightMode : t.dashboard.darkMode}
              style={{
                background: 'var(--bg-elevated)', border: `1px solid ${border}`,
                cursor: 'pointer', color: muted, padding: '5px 10px',
                fontSize: 11, fontFamily: 'inherit', letterSpacing: '0.04em',
                display: 'flex', alignItems: 'center', gap: 6,
                transition: 'color 120ms, border-color 120ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = fg; e.currentTarget.style.borderColor = borderHi; }}
              onMouseLeave={e => { e.currentTarget.style.color = muted; e.currentTarget.style.borderColor = border; }}>
              {dark ? t.dashboard.lightMode : t.dashboard.darkMode}
            </button>

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
                {user.username || t.dashboard.tabAccount}
              </button>

              {drop && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 4px)', right: 0, width: 180,
                  background: bgEl, border: `1px solid ${borderHi}`, zIndex: 100,
                }}>
                  <Link to="/account"
                    style={{ display: 'block', padding: '10px 14px', fontSize: 13, color: muted, textDecoration: 'none', fontFamily: 'inherit' }}
                    onMouseEnter={e => { e.currentTarget.style.color = fg; e.currentTarget.style.background = 'var(--bg-overlay)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = muted; e.currentTarget.style.background = 'none'; }}>
                    {t.dashboard.tabAccount}
                  </Link>
                  <button onClick={() => { localStorage.removeItem('kado_token'); localStorage.removeItem('kado_user'); window.location.href = '/auth'; }}
                    style={{ width: '100%', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: muted, textAlign: 'left', fontFamily: 'inherit' }}
                    onMouseEnter={e => { e.currentTarget.style.color = fg; e.currentTarget.style.background = 'var(--bg-overlay)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = muted; e.currentTarget.style.background = 'none'; }}>
                    {t.dashboard.logout}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

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
    </div>
  );
}
