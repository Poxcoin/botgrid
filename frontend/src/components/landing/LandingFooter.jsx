import React from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/lib/LangContext';

const MONO = "'Courier New','SF Mono',monospace";
const FONT = "'Inter','SF Pro Display','Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif";

function FootLink({ label, href, to }) {
  const s = { fontFamily: FONT, fontSize: 13, color: '#555', textDecoration: 'none', transition: 'color 150ms', letterSpacing: '-0.01em', lineHeight: 1.4 };
  const over = e => { e.currentTarget.style.color = '#aaa'; };
  const out  = e => { e.currentTarget.style.color = '#555'; };
  if (to) return <Link to={to} style={s} onMouseEnter={over} onMouseLeave={out}>{label}</Link>;
  return <a href={href} style={s} onMouseEnter={over} onMouseLeave={out}>{label}</a>;
}

const SOCIALS = [
  {
    name: 'Telegram', href: 'https://t.me/kadoclub07',
    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.49 8.31-1.97 9.27c-.15.66-.54.82-1.09.51l-3-2.21-1.45 1.39c-.16.16-.3.3-.6.3l.21-3.05 5.56-5.02c.24-.21-.05-.33-.37-.12L6.87 13.8 3.9 12.87c-.64-.2-.65-.64.14-.95l11.57-4.46c.53-.19 1 .13.88.85z"/></svg>,
  },
  {
    name: 'X / Twitter', href: 'https://x.com/kadoclub',
    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>,
  },
  {
    name: 'Instagram', href: 'https://instagram.com/kadoclub',
    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none"/></svg>,
  },
  {
    name: 'TikTok', href: 'https://tiktok.com/@kadoclub',
    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg>,
  },
  {
    name: 'Facebook', href: 'https://facebook.com/kadoclub',
    icon: <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>,
  },
];

const COLS = [
  {
    title: 'PRODUCTS',
    links: [
      { label: 'Signal Bot', to: '/bots' },
      { label: 'Grid Bot', to: '/bots' },
      { label: 'Funding Rate Bot', to: '/bots' },
      { label: 'Listing Sniper', to: '/bots' },
      { label: 'DEX Sniper (BSC)', to: '/bots' },
      { label: 'All Bots', to: '/bots' },
    ],
  },
  {
    title: 'PLATFORM',
    links: [
      { label: 'Dashboard', to: '/auth?mode=login' },
      { label: 'Strategies', to: '/strategies' },
      { label: 'Pricing & Plans', to: '/pricing' },
      { label: 'Performance Fees', to: '/pricing' },
      { label: 'Referral Program', to: '/pricing' },
      { label: 'Demo Mode', to: '/docs' },
    ],
  },
  {
    title: 'RESOURCES',
    links: [
      { label: 'Documentation', to: '/docs' },
      { label: 'FAQ', to: '/docs' },
      { label: 'News & Signals', to: '/news' },
      { label: 'Risk Disclosure', to: '/legal/risk-disclosure' },
      { label: 'Telegram Community', href: 'https://t.me/kadoclub07' },
      { label: 'API Guide', to: '/docs' },
    ],
  },
  {
    title: 'SUPPORT',
    links: [
      { label: 'Help Center', to: '/docs' },
      { label: 'Submit Request', href: 'mailto:support@kadoclub.net' },
      { label: 'Telegram Bot', href: 'https://t.me/KADO_c_BOT' },
      { label: 'Community Chat', href: 'https://t.me/kadoclub07' },
      { label: 'Security', to: '/docs' },
      { label: 'Contact Us', href: 'mailto:support@kadoclub.net' },
    ],
  },
  {
    title: 'LEGAL',
    links: [
      { label: 'Terms of Service', to: '/legal/terms' },
      { label: 'Privacy Policy', to: '/legal/privacy' },
      { label: 'Risk Disclosure', to: '/legal/risk-disclosure' },
      { label: 'Cookie Policy', to: '/legal/privacy' },
      { label: 'GDPR / Data Rights', to: '/legal/privacy' },
    ],
  },
];

export default function LandingFooter() {
  const { t } = useLang();

  return (
    <footer style={{ background: '#060606', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#fff' }}>

      <style>{`
        .kado-footer-grid {
          display: grid;
          grid-template-columns: 200px repeat(5, 1fr);
          gap: 0 40px;
          align-items: flex-start;
        }
        @media (max-width: 1024px) {
          .kado-footer-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 640px) {
          .kado-footer-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      {/* Main columns */}
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '60px 48px 48px' }}>
        <div className="kado-footer-grid">

          {/* Brand */}
          <div style={{ paddingBottom: 32 }}>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: '-0.04em', fontFamily: MONO, marginBottom: 14 }}>KADO</div>
            <p style={{ fontFamily: FONT, fontSize: 13, lineHeight: 1.75, color: '#444', letterSpacing: '-0.01em', maxWidth: 180, margin: '0 0 20px' }}>
              {t.footer.tagline}
            </p>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', color: '#2a2a2a', textTransform: 'uppercase', marginBottom: 6 }}>
              Non-custodial · Bybit · USDT Perps
            </div>
          </div>

          {/* Link columns */}
          {COLS.map(col => (
            <div key={col.title} style={{ paddingBottom: 32 }}>
              <div style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
                color: '#333', marginBottom: 18, fontWeight: 400,
              }}>
                {col.title}
              </div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 11 }}>
                {col.links.map(l => (
                  <li key={l.label}><FootLink {...l} /></li>
                ))}
              </ul>
            </div>
          ))}

        </div>
      </div>

      {/* Divider + social icons */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.04)', padding: '20px 48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        {SOCIALS.map(s => (
          <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name}
            style={{ color: '#333', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, transition: 'color 150ms, background 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = '#333'; e.currentTarget.style.background = 'transparent'; }}
          >
            {s.icon}
          </a>
        ))}
      </div>

      {/* Copyright */}
      <div style={{ padding: '0 48px', height: 44, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.03)' }}>
        <span style={{ fontFamily: FONT, fontSize: 11, color: '#2a2a2a', letterSpacing: '-0.01em' }}>© 2026 KADO</span>
        <span style={{ fontFamily: FONT, fontSize: 11, color: '#2a2a2a', letterSpacing: '-0.01em' }}>{t.footer.disclaimer}</span>
      </div>
    </footer>
  );
}
