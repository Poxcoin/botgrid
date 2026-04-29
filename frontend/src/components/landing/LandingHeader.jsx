import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '@/components/landing/ThemeToggle';

const LOGO = 'KADO';

export default function LandingHeader() {
  const [mounted, setMounted] = useState(false);
  const [logoHov, setLogoHov] = useState(false);

  useEffect(() => { const id = setTimeout(() => setMounted(true), 100); return () => clearTimeout(id); }, []);

  return (
    <header className="w-full sticky top-0 z-40" style={{
      background: 'var(--site-bg-glass)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      borderBottom: '1px solid var(--hero-border)',
      color: 'var(--site-fg)',
    }}>
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between">
        <Link to="/"
          onMouseEnter={() => setLogoHov(true)}
          onMouseLeave={() => setLogoHov(false)}
          style={{ textDecoration: 'none', color: 'var(--site-fg)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
        >
          <span className="font-black text-xl" style={{ letterSpacing: logoHov ? '0.08em' : '-0.04em', transition: 'letter-spacing 200ms ease' }}>
            {LOGO.split('').map((ch, i) => (
              <span key={i} style={{
                display: 'inline-block',
                opacity: mounted ? 1 : 0,
                transform: mounted ? 'translateY(0)' : 'translateY(8px)',
                transition: `opacity 300ms ease ${i * 40}ms, transform 300ms ease ${i * 40}ms`,
              }}>{ch}</span>
            ))}
          </span>
          <span className="hidden md:inline font-mono text-[10px] tracking-[0.2em]" style={{ color: 'var(--hero-muted)' }}>/ AI SIGNALS</span>
        </Link>

        <nav className="flex items-center gap-5 text-[12px] font-semibold tracking-[0.15em] uppercase">
          {[{ label: 'How it works', href: '#how' }, { label: 'Stats', href: '#stats' }].map(({ label, href }) => (
            <a key={label} href={href} className="hidden sm:inline relative" style={{ color: 'var(--hero-muted)', textDecoration: 'none', transition: 'color 200ms' }}
              onMouseEnter={e => { e.currentTarget.style.color = '#0047FF'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--hero-muted)'; }}>
              {label}
            </a>
          ))}
          <Link to="/auth?mode=login" className="relative" style={{ color: 'var(--site-fg)', transition: 'color 200ms', textDecoration: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#0047FF'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--site-fg)'; }}>
            Login
          </Link>
          <Link to="/waitlist" className="hidden sm:inline-flex items-center h-9 px-4 font-mono text-[11px] tracking-[0.2em] uppercase"
            style={{ background: 'var(--site-fg)', color: 'var(--site-bg)', border: '1px solid var(--site-fg)', textDecoration: 'none', transition: 'background 200ms, color 200ms' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0047FF'; e.currentTarget.style.borderColor = '#0047FF'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--site-fg)'; e.currentTarget.style.borderColor = 'var(--site-fg)'; e.currentTarget.style.color = 'var(--site-bg)'; }}>
            Get Access
          </Link>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
