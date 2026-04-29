import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '@/components/landing/ThemeToggle';

const NAV = [
  {
    id: 'bots',
    label: 'Bots',
    children: [
      { id: 'bot-news',    label: 'News Intelligence' },
      { id: 'bot-grid',    label: 'Grid Trading' },
      { id: 'bot-listing', label: 'Listing Sniper' },
      { id: 'bot-dex',     label: 'DEX Sniper' },
    ],
  },
  {
    id: 'strategies',
    label: 'Strategies',
    children: [
      { id: 'strat-conservative', label: 'Conservative' },
      { id: 'strat-moderate',     label: 'Moderate' },
      { id: 'strat-aggressive',   label: 'Aggressive' },
    ],
  },
  { id: 'how',     label: 'How It Works' },
  { id: 'pricing', label: 'Pricing' },
];

function scrollTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export const SIDEBAR_W = 240;

export default function SidebarNav({ mobileOpen, onClose }) {
  const [expanded, setExpanded] = useState({ bots: true, strategies: false });
  const [active, setActive] = useState('');

  // Track scroll position → highlight active section
  useEffect(() => {
    const ids = ['hero', 'bot-news', 'bot-grid', 'bot-listing', 'bot-dex',
                 'strat-conservative', 'strat-moderate', 'strat-aggressive', 'how', 'pricing'];
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: '-30% 0px -60% 0px' });
    ids.forEach(id => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  function toggle(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function handleClick(id) {
    scrollTo(id);
    if (onClose) onClose();
  }

  const isGroupActive = (item) =>
    item.children?.some(c => c.id === active) || item.id === active;

  const sidebar = (
    <nav style={{
      width: SIDEBAR_W,
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--hero-border)' }}>
        <Link to="/" style={{ textDecoration: 'none', color: 'var(--site-fg)' }}>
          <div className="font-black text-lg tracking-[-0.04em]">KADO</div>
          <div className="font-mono text-[9px] tracking-[0.25em] uppercase mt-0.5" style={{ color: 'var(--hero-muted)' }}>
            AI SIGNALS
          </div>
        </Link>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
        {NAV.map(item => (
          <div key={item.id}>
            {item.children ? (
              <>
                {/* Group header */}
                <button
                  onClick={() => toggle(item.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 20px',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: isGroupActive(item) ? 'var(--site-fg)' : 'var(--hero-muted)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    textAlign: 'left',
                    transition: 'color 150ms',
                  }}
                >
                  {item.label}
                  <span style={{
                    fontSize: 9,
                    opacity: 0.6,
                    transform: expanded[item.id] ? 'rotate(90deg)' : 'none',
                    transition: 'transform 200ms',
                  }}>▶</span>
                </button>

                {/* Sub-items */}
                {expanded[item.id] && (
                  <div style={{ paddingBottom: 4 }}>
                    {item.children.map(child => (
                      <button
                        key={child.id}
                        onClick={() => handleClick(child.id)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '7px 20px 7px 32px',
                          background: active === child.id ? 'rgba(0,71,255,0.08)' : 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: active === child.id ? '#0047FF' : 'var(--hero-muted)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          letterSpacing: '0.12em',
                          textAlign: 'left',
                          transition: 'color 150ms, background 150ms',
                        }}
                        onMouseEnter={e => { if (active !== child.id) e.currentTarget.style.color = 'var(--site-fg)'; }}
                        onMouseLeave={e => { if (active !== child.id) e.currentTarget.style.color = 'var(--hero-muted)'; }}
                      >
                        <span style={{ width: 4, height: 4, background: active === child.id ? '#0047FF' : 'var(--hero-muted)', borderRadius: '50%', flexShrink: 0, transition: 'background 150ms' }} />
                        {child.label}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              /* Top-level link */
              <button
                onClick={() => handleClick(item.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '8px 20px',
                  background: active === item.id ? 'rgba(0,71,255,0.08)' : 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: active === item.id ? '#0047FF' : 'var(--hero-muted)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  textAlign: 'left',
                  transition: 'color 150ms, background 150ms',
                }}
                onMouseEnter={e => { if (active !== item.id) e.currentTarget.style.color = 'var(--site-fg)'; }}
                onMouseLeave={e => { if (active !== item.id) e.currentTarget.style.color = 'var(--hero-muted)'; }}
              >
                {item.label}
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Bottom: actions */}
      <div style={{ padding: '12px 20px 20px', borderTop: '1px solid var(--hero-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Link to="/waitlist"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 36, fontFamily: 'var(--font-mono)', fontSize: 10,
            letterSpacing: '0.2em', textTransform: 'uppercase',
            background: 'var(--site-fg)', color: 'var(--site-bg)',
            textDecoration: 'none', border: '1px solid var(--site-fg)',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#0047FF'; e.currentTarget.style.borderColor = '#0047FF'; e.currentTarget.style.color = '#fff'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--site-fg)'; e.currentTarget.style.borderColor = 'var(--site-fg)'; e.currentTarget.style.color = 'var(--site-bg)'; }}
        >
          Get Access
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link to="/auth?mode=login"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--hero-muted)', textDecoration: 'none', transition: 'color 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--site-fg)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--hero-muted)'; }}
          >
            Login
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="hidden md:flex" style={{
        position: 'fixed', top: 0, left: 0, bottom: 0,
        width: SIDEBAR_W,
        background: 'var(--site-bg-glass)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderRight: '1px solid var(--hero-border)',
        zIndex: 40,
        flexDirection: 'column',
      }}>
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 48 }} />
          <aside style={{
            position: 'fixed', top: 0, left: 0, bottom: 0,
            width: SIDEBAR_W,
            background: 'var(--site-bg)',
            borderRight: '1px solid var(--hero-border)',
            zIndex: 49,
            display: 'flex', flexDirection: 'column',
          }}>
            {sidebar}
          </aside>
        </>
      )}
    </>
  );
}
