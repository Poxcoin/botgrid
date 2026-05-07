import React from 'react';
import { Link } from 'react-router-dom';

const MONO = "'Courier New','SF Mono',monospace";
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif";

const COLS = [
  { title: 'Product', links: [{ label: 'Bots', to: '/bots' }, { label: 'Strategies', to: '/strategies' }, { label: 'Pricing', to: '/pricing' }, { label: 'News', to: '/news' }] },
  { title: 'Access', links: [{ label: 'Register', to: '/auth?mode=register' }, { label: 'Login', to: '/auth?mode=login' }] },
  { title: 'Legal', links: [{ label: 'Risk Disclosure', href: '#' }, { label: 'Terms of Service', href: '#' }] },
];

function FootLink({ label, href, to }) {
  const s = { fontFamily: FONT, fontSize: 13, color: '#555', textDecoration: 'none', transition: 'color 150ms' };
  const over = e => { e.currentTarget.style.color = '#aaa'; };
  const out  = e => { e.currentTarget.style.color = '#555'; };
  if (to) return <Link to={to} style={s} onMouseEnter={over} onMouseLeave={out}>{label}</Link>;
  return <a href={href} style={s} onMouseEnter={over} onMouseLeave={out}>{label}</a>;
}

export default function LandingFooter() {
  return (
    <footer style={{ background: '#060606', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#fff' }}>
      <div className="px-5 md:px-14 grid grid-cols-2 md:grid-cols-4" style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 56px', gap: 40 }}>
        {/* Brand */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.04em', fontFamily: MONO, marginBottom: 12 }}>KADO</div>
          <p style={{ fontFamily: FONT, fontSize: 12, lineHeight: 1.7, color: '#444' }}>
            AI-driven crypto signal intelligence. Six bots. One platform.
          </p>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 11, color: '#444' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#333', display: 'inline-block' }} />
            Systems operational
          </div>
        </div>

        {COLS.map(col => (
          <div key={col.title}>
            <div style={{ fontFamily: FONT, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#444', marginBottom: 16 }}>{col.title}</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {col.links.map(l => (
                <li key={l.label}><FootLink {...l} /></li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="px-5 md:px-14" style={{ maxWidth: 1100, margin: '0 auto', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ fontFamily: FONT, fontSize: 11, color: '#3a3a3a' }}>© 2026 KADO</span>
        <span style={{ fontFamily: FONT, fontSize: 11, color: '#3a3a3a' }}>Not financial advice. Trade at your own risk.</span>
      </div>
    </footer>
  );
}
