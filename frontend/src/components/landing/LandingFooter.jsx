import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/lib/LangContext';

const MONO = "'Courier New','SF Mono',monospace";
const FONT = "'Inter','SF Pro Display','Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif";

function FootLink({ label, href, to }) {
  const s = { fontFamily: FONT, fontSize: 15, color: '#777', textDecoration: 'none', transition: 'color 150ms', letterSpacing: '-0.01em' };
  const over = e => { e.currentTarget.style.color = '#fff'; };
  const out  = e => { e.currentTarget.style.color = '#777'; };
  if (to) return <Link to={to} style={s} onMouseEnter={over} onMouseLeave={out}>{label}</Link>;
  return <a href={href} style={s} onMouseEnter={over} onMouseLeave={out}>{label}</a>;
}

export default function LandingFooter() {
  const { t } = useLang();

  const COLS = [
    { title: t.footer.colProduct, links: [{ label: t.nav.bots, to: '/bots' }, { label: t.nav.strategies, to: '/strategies' }, { label: t.nav.pricing, to: '/pricing' }, { label: t.nav.news, to: '/news' }, { label: t.footer.footerDocs, to: '/docs' }] },
    { title: t.footer.colAccess, links: [{ label: t.auth.signup.replace(' →', ''), to: '/auth?mode=register' }, { label: t.auth.login, to: '/auth?mode=login' }] },
    { title: t.footer.colLegal, links: [{ label: t.footer.legalRisk, to: '/legal/risk-disclosure' }, { label: t.footer.legalTerms, to: '/legal/terms' }, { label: t.footer.legalPrivacy, to: '/legal/privacy' }] },
  ];

  return (
    <footer style={{ background: '#060606', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#fff' }}>
      <div className="grid grid-cols-2 md:grid-cols-4" style={{ padding: '64px 24px', gap: 48 }}>
        {/* Brand */}
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', fontFamily: MONO, marginBottom: 16 }}>KADO</div>
          <p style={{ fontFamily: FONT, fontSize: 15, lineHeight: 1.6, color: '#666', letterSpacing: '-0.01em' }}>
            {t.footer.tagline}
          </p>
          <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 13, color: '#666' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
            {t.footer.status}
          </div>
        </div>

        {COLS.map(col => (
          <div key={col.title}>
            <div style={{ fontFamily: FONT, fontSize: 12, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#555', marginBottom: 20, fontWeight: 600 }}>{col.title}</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {col.links.map(l => (
                <li key={l.label}><FootLink {...l} /></li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ fontFamily: FONT, fontSize: 13, color: '#444', letterSpacing: '-0.01em' }}>© 2026 KADO</span>
        <span style={{ fontFamily: FONT, fontSize: 13, color: '#444', letterSpacing: '-0.01em' }}>{t.footer.disclaimer}</span>
      </div>
    </footer>
  );
}
