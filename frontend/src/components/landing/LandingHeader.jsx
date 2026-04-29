import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '@/components/landing/ThemeToggle';

const NAV = [
  { label: 'Bots',       href: '#bots' },
  { label: 'Strategies', href: '#strategies' },
  { label: 'How it works', href: '#how' },
  { label: 'Pricing',    href: '#pricing' },
];

export default function LandingHeader() {
  const [mounted, setMounted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { const id = setTimeout(() => setMounted(true), 80); return () => clearTimeout(id); }, []);

  const navLink = (label, href) => (
    <a key={label} href={href}
      className="font-mono text-[11px] tracking-[0.22em] uppercase transition-colors"
      style={{ color: 'var(--hero-muted)', textDecoration: 'none' }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--site-fg)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--hero-muted)'; }}
      onClick={() => setMenuOpen(false)}
    >{label}</a>
  );

  return (
    <header className="w-full sticky top-0 z-40" style={{
      background: 'var(--site-bg-glass)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--hero-border)',
      color: 'var(--site-fg)',
    }}>
      <div className="px-6 md:px-10 h-14 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none', color: 'var(--site-fg)', display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
          <span className="font-black text-lg tracking-[-0.04em]"
            style={{ opacity: mounted ? 1 : 0, transition: 'opacity 300ms ease' }}>
            KADO
          </span>
          <span className="hidden md:inline font-mono text-[9px] tracking-[0.25em] uppercase" style={{ color: 'var(--hero-muted)' }}>
            AI SIGNALS
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-7">
          {NAV.map(({ label, href }) => navLink(label, href))}
        </nav>

        {/* Right actions */}
        <div className="flex items-center gap-4">
          <Link to="/auth?mode=login"
            className="hidden sm:inline font-mono text-[11px] tracking-[0.22em] uppercase transition-colors"
            style={{ color: 'var(--hero-muted)', textDecoration: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--site-fg)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--hero-muted)'; }}>
            Login
          </Link>
          <Link to="/waitlist"
            className="inline-flex items-center h-8 px-4 font-mono text-[10px] tracking-[0.2em] uppercase transition-colors"
            style={{ background: 'var(--site-fg)', color: 'var(--site-bg)', textDecoration: 'none', border: '1px solid var(--site-fg)' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0047FF'; e.currentTarget.style.borderColor = '#0047FF'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--site-fg)'; e.currentTarget.style.borderColor = 'var(--site-fg)'; e.currentTarget.style.color = 'var(--site-bg)'; }}>
            Get Access
          </Link>
          <ThemeToggle />
          {/* Mobile menu toggle */}
          <button className="md:hidden flex flex-col gap-1 p-1" onClick={() => setMenuOpen(v => !v)}
            style={{ color: 'var(--site-fg)' }}>
            <span style={{ display: 'block', width: 18, height: 1.5, background: 'currentColor', transition: 'transform 200ms', transform: menuOpen ? 'rotate(45deg) translate(2px, 2px)' : 'none' }} />
            <span style={{ display: 'block', width: 18, height: 1.5, background: 'currentColor', opacity: menuOpen ? 0 : 1, transition: 'opacity 200ms' }} />
            <span style={{ display: 'block', width: 18, height: 1.5, background: 'currentColor', transition: 'transform 200ms', transform: menuOpen ? 'rotate(-45deg) translate(2px, -2px)' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t px-6 py-4 flex flex-col gap-4" style={{ borderColor: 'var(--hero-border)', background: 'var(--site-bg)' }}>
          {NAV.map(({ label, href }) => navLink(label, href))}
          <Link to="/auth?mode=login" className="font-mono text-[11px] tracking-[0.22em] uppercase" style={{ color: 'var(--hero-muted)', textDecoration: 'none' }} onClick={() => setMenuOpen(false)}>Login</Link>
        </div>
      )}
    </header>
  );
}
