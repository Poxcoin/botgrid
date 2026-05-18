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

const SOCIALS = [
  {
    name: 'Telegram', href: 'https://t.me/kadoclub07',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.49 8.31-1.97 9.27c-.15.66-.54.82-1.09.51l-3-2.21-1.45 1.39c-.16.16-.3.3-.6.3l.21-3.05 5.56-5.02c.24-.21-.05-.33-.37-.12L6.87 13.8 3.9 12.87c-.64-.2-.65-.64.14-.95l11.57-4.46c.53-.19 1 .13.88.85z"/></svg>,
  },
  {
    name: 'X / Twitter', href: 'https://x.com/kadoclub',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  },
  {
    name: 'Instagram', href: 'https://instagram.com/kadoclub',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/></svg>,
  },
  {
    name: 'TikTok', href: 'https://tiktok.com/@kadoclub',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg>,
  },
  {
    name: 'Threads', href: 'https://threads.net/@kadoclub',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.471 12.01v-.017c.029-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-.505-1.808-1.346-3.237-2.5-4.158-1.17-.934-2.68-1.417-4.74-1.433-2.013.017-3.64.55-5.038 1.63-1.406 1.085-2.39 2.773-2.8 5.14-.129.745-.195 1.554-.2 2.426.005.872.071 1.68.2 2.425.41 2.368 1.394 4.055 2.8 5.14 1.398 1.08 3.025 1.614 5.038 1.63 1.615-.014 2.879-.373 3.821-1.09.972-.742 1.596-1.9 1.857-3.432h-5.53v-2.044h7.7c.075.56.112 1.137.112 1.731 0 2.84-.83 5.104-2.46 6.727-1.55 1.543-3.697 2.33-6.418 2.33-.006 0-.013 0-.02 0z"/></svg>,
  },
  {
    name: 'Facebook', href: 'https://facebook.com/kadoclub',
    icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  },
];

export default function LandingFooter() {
  const { t } = useLang();

  const COLS = [
    { title: t.footer.colProduct, links: [{ label: t.nav.bots, to: '/bots' }, { label: t.nav.strategies, to: '/strategies' }, { label: t.nav.pricing, to: '/pricing' }, { label: t.nav.news, to: '/news' }, { label: t.footer.footerDocs, to: '/docs' }] },
    { title: t.footer.colAccess, links: [{ label: t.auth.signup.replace(' →', ''), to: '/auth?mode=register' }, { label: t.auth.login, to: '/auth?mode=login' }] },
    { title: t.footer.colLegal, links: [{ label: t.footer.legalRisk, to: '/legal/risk-disclosure' }, { label: t.footer.legalTerms, to: '/legal/terms' }, { label: t.footer.legalPrivacy, to: '/legal/privacy' }] },
  ];

  return (
    <footer style={{ background: '#060606', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#fff' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '64px 48px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '0 40px', alignItems: 'flex-start' }}>
        {/* Brand */}
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.04em', fontFamily: MONO, marginBottom: 16 }}>KADO</div>
          <p style={{ fontFamily: FONT, fontSize: 14, lineHeight: 1.7, color: '#555', letterSpacing: '-0.01em', maxWidth: 220 }}>
            {t.footer.tagline}
          </p>
        </div>

        {COLS.map(col => (
          <div key={col.title}>
            <div style={{ fontFamily: FONT, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#444', marginBottom: 20, fontWeight: 600 }}>{col.title}</div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {col.links.map(l => (
                <li key={l.label}><FootLink {...l} /></li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Social icons */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '24px 48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {SOCIALS.map(s => (
          <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name}
            style={{ color: '#444', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, transition: 'color 150ms, background 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#444'; e.currentTarget.style.background = 'transparent'; }}
          >
            {s.icon}
          </a>
        ))}
      </div>

      {/* Copyright bar */}
      <div style={{ padding: '0 48px', height: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
        <span style={{ fontFamily: FONT, fontSize: 12, color: '#333', letterSpacing: '-0.01em' }}>© 2026 KADO</span>
        <span style={{ fontFamily: FONT, fontSize: 12, color: '#333', letterSpacing: '-0.01em' }}>{t.footer.disclaimer}</span>
      </div>
    </footer>
  );
}
