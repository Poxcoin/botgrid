import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/lib/LangContext';

const MONO = "'Courier New','SF Mono',monospace";
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif";

function FootLink({ label, href, to }) {
  const s = { fontFamily: FONT, fontSize: 13, color: '#555', textDecoration: 'none', transition: 'color 150ms' };
  const over = e => { e.currentTarget.style.color = '#aaa'; };
  const out  = e => { e.currentTarget.style.color = '#555'; };
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
      <div className="px-5 md:px-14 grid grid-cols-2 md:grid-cols-4" style={{ maxWidth: 1440, margin: '0 auto', padding: '48px 56px', gap: 40 }}>
        {/* Brand */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 900, letterSpacing: '-0.04em', fontFamily: MONO, marginBottom: 12 }}>KADO</div>
          <p style={{ fontFamily: FONT, fontSize: 12, lineHeight: 1.7, color: '#444' }}>
            {t.footer.tagline}
          </p>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 11, color: '#444' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
            {t.footer.status}
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

      <div className="px-5 md:px-14" style={{ maxWidth: 1440, margin: '0 auto', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <span style={{ fontFamily: FONT, fontSize: 11, color: '#3a3a3a' }}>© 2026 KADO</span>
        <span style={{ fontFamily: FONT, fontSize: 11, color: '#3a3a3a' }}>{t.footer.disclaimer}</span>
      </div>
    </footer>
  );
}
