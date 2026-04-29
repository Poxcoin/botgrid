import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

function NavLink({ to, label }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link to={to}
      style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        letterSpacing: '0.2em', textTransform: 'uppercase',
        color: active ? 'var(--neon-green)' : 'var(--muted)',
        textDecoration: 'none',
        borderBottom: active ? '1px solid var(--neon-green)' : '1px solid transparent',
        paddingBottom: 2,
        transition: 'color 150ms, border-color 150ms',
        textShadow: active ? '0 0 16px rgba(0,255,136,0.5)' : 'none',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.color = 'var(--fg)'; } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.color = 'var(--muted)'; } }}
    >
      {label}
    </Link>
  );
}

export default function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="w-full sticky top-0 z-50" style={{
      background: 'rgba(6,6,15,0.92)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div className="px-6 md:px-10 flex items-center justify-between" style={{ height: 56 }}>

        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="font-black text-xl tracking-[-0.04em]"
            style={{ color: 'var(--neon-green)', textShadow: '0 0 20px rgba(0,255,136,0.5)' }}>
            KADO
          </span>
          <span className="hidden md:inline font-mono text-[9px] tracking-[0.35em] uppercase"
            style={{ color: 'var(--muted)' }}>
            AI SIGNALS
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          <NavLink to="/bots"       label="Bots" />
          <NavLink to="/strategies" label="Strategies" />
          <NavLink to="/pricing"    label="Pricing" />
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-4">
          <Link to="/auth?mode=login"
            className="hidden sm:inline font-mono text-[11px] tracking-[0.2em] uppercase"
            style={{ color: 'var(--muted)', textDecoration: 'none', transition: 'color 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; }}>
            Login
          </Link>
          <Link to="/waitlist"
            className="hidden sm:inline-flex items-center h-8 px-4 font-mono text-[10px] tracking-[0.2em] uppercase"
            style={{ background: 'var(--neon-green)', color: '#000', textDecoration: 'none', fontWeight: 700, transition: 'all 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#00cc6a'; e.currentTarget.style.boxShadow = '0 0 16px rgba(0,255,136,0.4)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--neon-green)'; e.currentTarget.style.boxShadow = 'none'; }}>
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
            {[['Bots', '/bots'], ['Strategies', '/strategies'], ['Pricing', '/pricing']].map(([label, to]) => (
              <Link key={to} to={to} onClick={() => setMobileOpen(false)}
                className="block py-3 font-mono text-[13px] tracking-[0.15em] uppercase"
                style={{ color: 'var(--fg)', textDecoration: 'none', borderBottom: '1px solid var(--border)' }}>
                {label}
              </Link>
            ))}
            <div style={{ display: 'flex', gap: 20, paddingTop: 16 }}>
              <Link to="/auth?mode=login" onClick={() => setMobileOpen(false)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', textDecoration: 'none' }}>
                Login
              </Link>
              <Link to="/waitlist" onClick={() => setMobileOpen(false)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--neon-green)', textDecoration: 'none', fontWeight: 700 }}>
                Get Access →
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
