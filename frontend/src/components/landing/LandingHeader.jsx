import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

const MONO = "'Courier New','SF Mono',monospace";
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif";

function NavLink({ to, label }) {
  const { pathname } = useLocation();
  const active = pathname === to;
  return (
    <Link to={to} style={{
      fontFamily: FONT, fontSize: 13, color: active ? '#fff' : '#888',
      textDecoration: 'none', transition: 'color 150ms',
    }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#fff'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#888'; }}
    >
      {label}
    </Link>
  );
}

export default function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="w-full sticky top-0 z-50" style={{
      background: 'rgba(6,6,6,0.88)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div className="px-5 md:px-14" style={{ maxWidth: 1100, margin: '0 auto', height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.04em', fontFamily: MONO, color: '#fff' }}>KADO</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center" style={{ gap: 32 }}>
          <NavLink to="/bots"       label="Bots" />
          <NavLink to="/strategies" label="Strategies" />
          <NavLink to="/pricing"    label="Pricing" />
          <NavLink to="/news"       label="News" />
        </nav>

        {/* Right side */}
        <div className="flex items-center" style={{ gap: 16 }}>
          <Link to="/auth?mode=login"
            className="hidden sm:inline"
            style={{ fontFamily: FONT, fontSize: 13, color: '#888', textDecoration: 'none', transition: 'color 150ms' }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = '#888'}>
            Login
          </Link>
          <Link to="/waitlist"
            className="hidden sm:inline-flex items-center"
            style={{
              background: '#fff', color: '#000', padding: '8px 22px', borderRadius: 100,
              fontSize: 12, fontWeight: 600, fontFamily: FONT, textDecoration: 'none', transition: 'opacity 150ms',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
            Get Access
          </Link>

          {/* Mobile burger */}
          <button className="md:hidden" onClick={() => setMobileOpen(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', padding: 4 }}>
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
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', background: '#060606' }}>
          <div className="px-5 py-5 flex flex-col" style={{ gap: 4 }}>
            {[['Bots', '/bots'], ['Strategies', '/strategies'], ['Pricing', '/pricing'], ['News', '/news']].map(([label, to]) => (
              <Link key={to} to={to} onClick={() => setMobileOpen(false)}
                className="block py-3"
                style={{ fontFamily: FONT, fontSize: 14, letterSpacing: '0.02em', color: '#fff', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                {label}
              </Link>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, paddingTop: 16 }}>
              <Link to="/auth?mode=login" onClick={() => setMobileOpen(false)}
                style={{ fontFamily: FONT, fontSize: 13, color: '#888', textDecoration: 'none' }}>
                Login
              </Link>
              <Link to="/waitlist" onClick={() => setMobileOpen(false)}
                style={{ background: '#fff', color: '#000', padding: '8px 22px', borderRadius: 100, fontSize: 12, fontWeight: 600, fontFamily: FONT, textDecoration: 'none' }}>
                Get Access
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
