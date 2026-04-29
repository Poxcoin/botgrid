import React from 'react';
import { Link } from 'react-router-dom';

const COL = [
  {
    title: 'Product',
    links: [
      { label: 'Bots', href: '#bots' },
      { label: 'Strategies', href: '#strategies' },
      { label: 'How it works', href: '#how' },
      { label: 'Pricing', href: '#pricing' },
    ],
  },
  {
    title: 'Access',
    links: [
      { label: 'Join Waitlist', to: '/waitlist' },
      { label: 'Login', to: '/auth?mode=login' },
      { label: 'Register', to: '/auth?mode=register' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Risk Disclosure', href: '#' },
      { label: 'Terms of Service', href: '#' },
    ],
  },
];

function FootLink({ label, href, to }) {
  const style = { color: 'var(--hero-muted)', textDecoration: 'none', transition: 'color 150ms' };
  const hover = e => { e.currentTarget.style.color = 'var(--site-fg)'; };
  const unhover = e => { e.currentTarget.style.color = 'var(--hero-muted)'; };
  if (to) return <Link to={to} style={style} onMouseEnter={hover} onMouseLeave={unhover}>{label}</Link>;
  return <a href={href} style={style} onMouseEnter={hover} onMouseLeave={unhover}>{label}</a>;
}

export default function LandingFooter() {
  return (
    <footer style={{ borderTop: '1px solid var(--hero-border)', color: 'var(--site-fg)' }}>
      {/* Main footer grid */}
      <div className="px-6 md:px-10 py-12 grid grid-cols-2 md:grid-cols-4 gap-10">
        {/* Brand */}
        <div>
          <div className="font-black text-xl tracking-[-0.04em] mb-3">KADO</div>
          <p className="font-mono text-[11px] leading-relaxed" style={{ color: 'var(--hero-muted)' }}>
            AI-driven crypto signal intelligence. Four bots. One system.
          </p>
          <div className="mt-4 flex items-center gap-2 font-mono text-[10px]" style={{ color: 'var(--hero-muted)' }}>
            <span className="w-1.5 h-1.5 bg-kado-blue animate-blink" />
            <span>Systems operational</span>
          </div>
        </div>

        {/* Link columns */}
        {COL.map(col => (
          <div key={col.title}>
            <div className="font-mono text-[9px] tracking-[0.3em] uppercase mb-4" style={{ color: 'var(--hero-muted)', opacity: 0.5 }}>
              {col.title}
            </div>
            <ul className="space-y-2">
              {col.links.map(l => (
                <li key={l.label} className="font-mono text-[12px]">
                  <FootLink {...l} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div className="px-6 md:px-10 h-10 flex items-center justify-between" style={{ borderTop: '1px solid var(--hero-border)' }}>
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase" style={{ color: 'var(--hero-muted)' }}>
          KADO © 2026
        </span>
        <span className="font-mono text-[10px] tracking-[0.15em] uppercase" style={{ color: 'var(--hero-muted)' }}>
          Not financial advice. Trade at your own risk.
        </span>
      </div>
    </footer>
  );
}
