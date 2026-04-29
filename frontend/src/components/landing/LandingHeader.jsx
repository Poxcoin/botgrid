import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ThemeToggle from '@/components/landing/ThemeToggle';

const BOTS = [
  { id: 'bot-news',    label: 'News Intelligence', desc: 'Claude AI · 6 TG channels · 30s scan' },
  { id: 'bot-grid',    label: 'Grid Trading',       desc: 'SOL · BTC · ETH · 2× leverage' },
  { id: 'bot-listing', label: 'Listing Sniper',     desc: 'Binance · Bybit · 5× · 20% TP' },
  { id: 'bot-dex',     label: 'DEX Sniper',         desc: 'PancakeSwap BSC · GoPlus safety' },
];

const STRATEGIES = [
  { id: 'strat-conservative', label: 'Conservative', desc: '3–8% / month · Grid only · Low risk' },
  { id: 'strat-moderate',     label: 'Moderate',     desc: '10–25% / month · Grid + News' },
  { id: 'strat-aggressive',   label: 'Aggressive',   desc: 'Up to 50%+ · All 4 bots active' },
];

function scrollTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Dropdown({ items, onClose }) {
  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 1px)', left: 0,
      minWidth: 260,
      background: 'var(--site-bg)',
      border: '1px solid var(--hero-border)',
      zIndex: 100,
      boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
    }}>
      {items.map((item, i) => (
        <button key={item.id}
          onClick={() => { scrollTo(item.id); onClose(); }}
          style={{
            display: 'block', width: '100%', padding: '12px 16px',
            textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer',
            borderBottom: i < items.length - 1 ? '1px solid var(--hero-border)' : 'none',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,71,255,0.06)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
        >
          <div className="font-mono text-[12px] tracking-[0.1em]" style={{ color: 'var(--site-fg)', fontWeight: 600, marginBottom: 2 }}>
            {item.label}
          </div>
          <div className="font-mono text-[10px] tracking-[0.05em]" style={{ color: 'var(--hero-muted)' }}>
            {item.desc}
          </div>
        </button>
      ))}
    </div>
  );
}

function NavItem({ label, href, id, dropdown }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const timer = useRef(null);

  function open_() { clearTimeout(timer.current); setOpen(true); }
  function close_() { timer.current = setTimeout(() => setOpen(false), 120); }

  useEffect(() => () => clearTimeout(timer.current), []);

  if (dropdown) {
    return (
      <div ref={ref} style={{ position: 'relative' }}
        onMouseEnter={open_} onMouseLeave={close_}>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 4, height: 48,
          background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 11,
          letterSpacing: '0.2em', textTransform: 'uppercase',
          color: open ? 'var(--site-fg)' : 'var(--hero-muted)',
          transition: 'color 150ms', padding: '0 2px',
        }}>
          {label}
          <span style={{ fontSize: 8, opacity: 0.6, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>▼</span>
        </button>
        {open && <Dropdown items={dropdown} onClose={() => setOpen(false)} />}
      </div>
    );
  }

  return (
    <button
      onClick={() => id ? scrollTo(id) : null}
      style={{
        height: 48, background: 'none', border: 'none', cursor: 'pointer',
        fontFamily: 'var(--font-mono)', fontSize: 11,
        letterSpacing: '0.2em', textTransform: 'uppercase',
        color: 'var(--hero-muted)', transition: 'color 150ms', padding: '0 2px',
      }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--site-fg)'; }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--hero-muted)'; }}
    >
      {label}
    </button>
  );
}

export default function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 80); }, []);

  return (
    <header className="w-full sticky top-0 z-50" style={{
      background: 'var(--site-bg-glass)',
      backdropFilter: 'blur(12px)',
      WebkitBackdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--hero-border)',
      color: 'var(--site-fg)',
    }}>
      <div className="px-6 md:px-10 flex items-center justify-between" style={{ height: 56 }}>

        {/* Logo */}
        <Link to="/" style={{ textDecoration: 'none', color: 'var(--site-fg)', display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span className="font-black text-xl tracking-[-0.04em]"
            style={{ opacity: mounted ? 1 : 0, transition: 'opacity 300ms' }}>KADO</span>
          <span className="hidden md:inline font-mono text-[9px] tracking-[0.3em] uppercase"
            style={{ color: 'var(--hero-muted)' }}>AI SIGNALS</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          <NavItem label="Bots"       dropdown={BOTS} />
          <NavItem label="Strategies" dropdown={STRATEGIES} />
          <NavItem label="How It Works" id="how" />
          <NavItem label="Pricing"    id="pricing" />
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <Link to="/auth?mode=login"
            className="hidden sm:inline font-mono text-[11px] tracking-[0.2em] uppercase transition-colors"
            style={{ color: 'var(--hero-muted)', textDecoration: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--site-fg)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--hero-muted)'; }}>
            Login
          </Link>
          <Link to="/waitlist"
            className="hidden sm:inline-flex items-center h-8 px-4 font-mono text-[10px] tracking-[0.2em] uppercase"
            style={{ background: 'var(--site-fg)', color: 'var(--site-bg)', textDecoration: 'none', border: '1px solid var(--site-fg)' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#0047FF'; e.currentTarget.style.borderColor = '#0047FF'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--site-fg)'; e.currentTarget.style.borderColor = 'var(--site-fg)'; e.currentTarget.style.color = 'var(--site-bg)'; }}>
            Get Access
          </Link>
          <ThemeToggle />
          {/* Mobile burger */}
          <button className="md:hidden" onClick={() => setMobileOpen(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--site-fg)', padding: 4 }}>
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
        <div style={{ borderTop: '1px solid var(--hero-border)', background: 'var(--site-bg)' }}>
          <div className="px-6 py-4 space-y-1">
            <div className="font-mono text-[9px] tracking-[0.3em] uppercase py-2 mb-1" style={{ color: 'var(--hero-muted)' }}>Bots</div>
            {BOTS.map(b => (
              <button key={b.id} onClick={() => { scrollTo(b.id); setMobileOpen(false); }}
                className="block w-full text-left py-2 font-mono text-[12px]"
                style={{ color: 'var(--site-fg)', background: 'none', border: 'none', cursor: 'pointer' }}>
                {b.label}
              </button>
            ))}
            <div className="font-mono text-[9px] tracking-[0.3em] uppercase py-2 mt-3 mb-1" style={{ color: 'var(--hero-muted)' }}>Strategies</div>
            {STRATEGIES.map(s => (
              <button key={s.id} onClick={() => { scrollTo(s.id); setMobileOpen(false); }}
                className="block w-full text-left py-2 font-mono text-[12px]"
                style={{ color: 'var(--site-fg)', background: 'none', border: 'none', cursor: 'pointer' }}>
                {s.label}
              </button>
            ))}
            <div style={{ borderTop: '1px solid var(--hero-border)', paddingTop: 12, marginTop: 12, display: 'flex', gap: 16 }}>
              <button onClick={() => { scrollTo('how'); setMobileOpen(false); }} className="font-mono text-[11px] uppercase" style={{ color: 'var(--hero-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>How It Works</button>
              <button onClick={() => { scrollTo('pricing'); setMobileOpen(false); }} className="font-mono text-[11px] uppercase" style={{ color: 'var(--hero-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>Pricing</button>
            </div>
            <div style={{ paddingTop: 12, display: 'flex', gap: 12 }}>
              <Link to="/auth?mode=login" onClick={() => setMobileOpen(false)} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--hero-muted)', textDecoration: 'none' }}>Login</Link>
              <Link to="/waitlist" onClick={() => setMobileOpen(false)} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: '#0047FF', textDecoration: 'none', fontWeight: 700 }}>Get Access →</Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
