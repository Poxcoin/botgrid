import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTheme } from '@/lib/ThemeContext';

function NavLink({ to, label }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link to={to} style={{
      fontFamily: 'var(--font-mono)', fontSize: 11,
      letterSpacing: '0.12em', textTransform: 'uppercase',
      color: active ? 'var(--fg)' : 'var(--muted)',
      textDecoration: 'none',
      borderBottom: active ? '1px solid var(--fg)' : '1px solid transparent',
      paddingBottom: 2,
      transition: 'color 150ms',
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--fg)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--muted)'; }}
    >
      {label}
    </Link>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button onClick={toggle} title={isDark ? 'Switch to light' : 'Switch to dark'}
      style={{
        background: 'none', border: '1px solid var(--border)',
        cursor: 'pointer', color: 'var(--muted)',
        width: 32, height: 32,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'border-color 150ms, color 150ms',
        flexShrink: 0,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--fg)'; e.currentTarget.style.color = 'var(--fg)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
    >
      {isDark ? (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <circle cx="6.5" cy="6.5" r="3" stroke="currentColor" strokeWidth="1.2" />
          <line x1="6.5" y1="0" x2="6.5" y2="2" stroke="currentColor" strokeWidth="1.2" />
          <line x1="6.5" y1="11" x2="6.5" y2="13" stroke="currentColor" strokeWidth="1.2" />
          <line x1="0" y1="6.5" x2="2" y2="6.5" stroke="currentColor" strokeWidth="1.2" />
          <line x1="11" y1="6.5" x2="13" y2="6.5" stroke="currentColor" strokeWidth="1.2" />
          <line x1="1.9" y1="1.9" x2="3.3" y2="3.3" stroke="currentColor" strokeWidth="1.2" />
          <line x1="9.7" y1="9.7" x2="11.1" y2="11.1" stroke="currentColor" strokeWidth="1.2" />
          <line x1="9.7" y1="3.3" x2="11.1" y2="1.9" stroke="currentColor" strokeWidth="1.2" />
          <line x1="1.9" y1="11.1" x2="3.3" y2="9.7" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
          <path d="M10.5 7.5A5 5 0 0 1 5.5 2.5a5 5 0 1 0 5 5z" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      )}
    </button>
  );
}

export default function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="w-full sticky top-0 z-50" style={{
      background: 'var(--site-bg-glass)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div className="px-6 md:px-10 flex items-center justify-between" style={{ height: 56 }}>

        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="font-black text-xl tracking-[-0.04em]" style={{ color: 'var(--fg)' }}>
            KADO
          </span>
          <span className="hidden md:inline font-mono text-[9px] tracking-[0.3em] uppercase"
            style={{ color: 'var(--muted)' }}>
            AI SIGNALS
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          <NavLink to="/bots"       label="Bots" />
          <NavLink to="/strategies" label="Strategies" />
          <NavLink to="/pricing"    label="Pricing" />
          <NavLink to="/news"       label="News" />
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link to="/auth?mode=login"
            className="hidden sm:inline font-mono text-[11px] tracking-[0.15em] uppercase"
            style={{ color: 'var(--muted)', textDecoration: 'none', transition: 'color 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; }}>
            Login
          </Link>
          <Link to="/waitlist"
            className="hidden sm:inline-flex items-center h-8 px-4 font-mono text-[10px] tracking-[0.15em] uppercase"
            style={{
              background: 'var(--fg)', color: 'var(--bg)',
              textDecoration: 'none', fontWeight: 700, transition: 'opacity 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
            Get Access
          </Link>

          {/* Mobile burger */}
          <button className="md:hidden" onClick={() => setMobileOpen(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg)', padding: 4 }}>
            <svg width="20" height="14" viewBox="0 0 20 14" fill="none">
              <rect width="20" height="1.5" fill="currentColor"/>
              <rect y="6" width="20" height="1.5" fill="currentColor"/>
              <rect y="12" width="20" height="1.5" fill="currentColor"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div className="px-6 py-5 flex flex-col gap-1">
            {[['Bots', '/bots'], ['Strategies', '/strategies'], ['Pricing', '/pricing'], ['News', '/news']].map(([label, to]) => (
              <Link key={to} to={to} onClick={() => setMobileOpen(false)}
                className="block py-3 font-mono text-[13px] tracking-[0.12em] uppercase"
                style={{ color: 'var(--fg)', textDecoration: 'none', borderBottom: '1px solid var(--border)' }}>
                {label}
              </Link>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, paddingTop: 16 }}>
              <Link to="/auth?mode=login" onClick={() => setMobileOpen(false)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--muted)', textDecoration: 'none' }}>
                Login
              </Link>
              <Link to="/waitlist" onClick={() => setMobileOpen(false)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--fg)', textDecoration: 'none', fontWeight: 700 }}>
                Get Access →
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
