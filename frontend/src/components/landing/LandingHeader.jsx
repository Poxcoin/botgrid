import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import TickerTape from '@/components/landing/TickerTape';
import { useLang } from '@/lib/LangContext';
import { useTheme } from '@/lib/ThemeContext';

const MONO = "'Courier New','SF Mono',monospace";
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif";

const LANG_LABELS = { en: 'English', es: 'Español', uk: 'Українська', ru: 'Русский', de: 'Deutsch', zh: '中文' };
const TG_CHANNEL_URL = 'https://t.me/kadoclub07';

function NavLink({ to, label }) {
  const { pathname } = useLocation();
  const active = pathname === to || (to !== '/' && pathname.startsWith(to));
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

/* ── Section header (small uppercase label above each block) ── */
function SectionTitle({ children }) {
  return (
    <div style={{
      padding: '14px 20px 8px',
      fontFamily: MONO, fontSize: 9, color: '#3a3a3a',
      letterSpacing: '0.22em', textTransform: 'uppercase',
    }}>
      {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />;
}

/* ── Theme segmented toggle (Dark / Light, always inline) ── */
function ThemeSegment() {
  const { theme, toggle } = useTheme();
  const { t } = useLang();

  const seg = (label, isActive, onClick) => (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
        color: isActive ? '#fff' : '#777',
        border: '1px solid ' + (isActive ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'),
        borderRadius: 6,
        fontFamily: FONT, fontSize: 12, fontWeight: 500,
        padding: '8px 0', cursor: 'pointer',
        transition: 'all 140ms',
        letterSpacing: '0.02em',
      }}
      onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = '#bbb'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; } }}
      onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = '#777'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; } }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ padding: '0 20px 14px', display: 'flex', gap: 8 }}>
      {seg(t.settings.themeDark,  theme === 'dark',  () => { if (theme !== 'dark') toggle(); })}
      {seg(t.settings.themeLight, theme === 'light', () => { if (theme !== 'light') toggle(); })}
    </div>
  );
}

/* ── Language inline-expandable list ── */
function LanguageBlock() {
  const { lang, setLang, LANGS, t } = useLang();
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <div
        onClick={() => setExpanded(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '11px 20px', cursor: 'pointer',
          transition: 'background 120ms',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, color: '#777' }}>
          <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M8 1.5C8 1.5 5.5 4 5.5 8s2.5 6.5 2.5 6.5M8 1.5C8 1.5 10.5 4 10.5 8S8 14.5 8 14.5M1.5 8h13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: FONT, fontSize: 13, color: '#ddd', lineHeight: 1.2 }}>{t.settings.language}</div>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 10, color: '#666', letterSpacing: '0.04em' }}>{LANG_LABELS[lang]}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 180ms', flexShrink: 0 }}>
          <path d="M3 2l4 3-4 3" stroke="#555" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {expanded && (
        <div style={{ padding: '2px 12px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {LANGS.map(({ code }) => {
            const active = lang === code;
            return (
              <button key={code}
                onClick={() => setLang(code)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px',
                  background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: '1px solid ' + (active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)'),
                  borderRadius: 6,
                  cursor: 'pointer', transition: 'all 120ms',
                  fontFamily: FONT, fontSize: 12,
                  color: active ? '#fff' : '#888',
                }}
                onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.color = '#ccc'; } }}
                onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#888'; } }}
              >
                <span>{LANG_LABELS[code]}</span>
                {active && (
                  <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
                    <path d="M2 6.5l3.5 3.5 5.5-6" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ── Single row link ── */
function MenuRow({ icon, label, onClick, href, danger }) {
  const inner = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 20px',
      transition: 'background 120ms',
    }}>
      <span style={{ flexShrink: 0, color: danger ? '#e74c3c' : '#777', display: 'flex' }}>{icon}</span>
      <span style={{ flex: 1, fontFamily: FONT, fontSize: 13, color: danger ? '#e74c3c' : '#ddd' }}>{label}</span>
      {href && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
          <path d="M3.5 8.5l5-5M5 3.5h3.5V7" stroke="#555" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );

  const onEnter = e => { e.currentTarget.style.background = danger ? 'rgba(231,76,60,0.07)' : 'rgba(255,255,255,0.03)'; };
  const onLeave = e => { e.currentTarget.style.background = 'transparent'; };

  if (href) return (
    <a href={href} target="_blank" rel="noopener noreferrer"
      style={{ display: 'block', textDecoration: 'none', cursor: 'pointer' }}
      onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {inner}
    </a>
  );
  return (
    <div onClick={onClick} style={{ cursor: 'pointer' }}
      onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {inner}
    </div>
  );
}

function SettingsDropdown({ onClose }) {
  const { t } = useLang();
  const isLoggedIn = !!localStorage.getItem('kado_token');

  function logout() {
    localStorage.removeItem('kado_token');
    localStorage.removeItem('kado_user');
    window.location.href = '/auth';
    onClose();
  }

  const panelStyle = {
    position: 'absolute', top: 'calc(100% + 8px)', right: 0,
    width: 308, background: '#0b0b0b',
    border: '1px solid rgba(255,255,255,0.09)',
    borderRadius: 10,
    boxShadow: '0 24px 64px rgba(0,0,0,0.85)',
    zIndex: 200, overflow: 'hidden',
    paddingTop: 4, paddingBottom: 4,
  };

  return (
    <div style={panelStyle}>
      {/* ── THEME ── */}
      <SectionTitle>{t.settings.theme}</SectionTitle>
      <ThemeSegment />

      <Divider />

      {/* ── LANGUAGE (inline-expandable) ── */}
      <LanguageBlock />

      <Divider />

      {/* ── TELEGRAM CHANNEL (external link) ── */}
      <MenuRow
        icon={
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.49 8.31-1.97 9.27c-.15.66-.54.82-1.09.51l-3-2.21-1.45 1.39c-.16.16-.3.3-.6.3l.21-3.05 5.56-5.02c.24-.21-.05-.33-.37-.12L6.87 13.8 3.9 12.87c-.64-.2-.65-.64.14-.95l11.57-4.46c.53-.19 1 .13.88.85z"/>
          </svg>
        }
        label={t.settings.tgChannel}
        href={TG_CHANNEL_URL}
      />

      <Divider />

      {/* ── LOG OUT or LOGIN/SIGNUP ── */}
      {isLoggedIn ? (
        <MenuRow
          icon={
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
              <path d="M10.5 8H3M5.5 5.5L3 8l2.5 2.5M7 4V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
          label={t.settings.logout}
          onClick={logout}
          danger
        />
      ) : (
        <div style={{ padding: '10px 16px 12px', display: 'flex', gap: 8 }}>
          <Link to="/auth?mode=login" onClick={onClose}
            style={{
              flex: 1, padding: '9px 0', border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6, textAlign: 'center',
              fontFamily: FONT, fontSize: 12, color: '#aaa', textDecoration: 'none',
              transition: 'all 120ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.22)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#aaa'; }}>
            {t.auth.login}
          </Link>
          <Link to="/auth?mode=register" onClick={onClose}
            style={{
              flex: 1, padding: '9px 0', background: '#fff',
              borderRadius: 6, textAlign: 'center',
              fontFamily: FONT, fontSize: 12, fontWeight: 600, color: '#000', textDecoration: 'none',
              transition: 'opacity 120ms',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
            {t.auth.signup}
          </Link>
        </div>
      )}
    </div>
  );
}

export default function LandingHeader() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef(null);
  const isLoggedIn = !!localStorage.getItem('kado_token');
  const { t } = useLang();

  useEffect(() => {
    function handler(e) {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) {
        setSettingsOpen(false);
      }
    }
    if (settingsOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [settingsOpen]);

  const navLinks = [
    ['/bots',       t.nav.bots],
    ['/strategies', t.nav.strategies],
    ['/pricing',    t.nav.pricing],
    ['/news',       t.nav.news],
  ];

  return (
    <>
      <header className="w-full sticky top-0 z-50" style={{
        background: 'rgba(6,6,6,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ padding: '0 48px', height: 62, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>

          {/* Logo */}
          <Link to="/" style={{ textDecoration: 'none' }}>
            <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.04em', fontFamily: MONO, color: '#fff' }}>KADO</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center" style={{ gap: 32 }}>
            {navLinks.map(([to, label]) => (
              <NavLink key={to} to={to} label={label} />
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center" style={{ gap: 12 }}>

            {isLoggedIn ? (
              <Link to="/account"
                className="hidden sm:inline-flex items-center"
                style={{
                  background: '#fff', color: '#000', padding: '8px 22px', borderRadius: 100,
                  fontSize: 12, fontWeight: 600, fontFamily: FONT, textDecoration: 'none', transition: 'opacity 150ms',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                {t.auth.account}
              </Link>
            ) : (
              <>
                <Link to="/auth?mode=login"
                  className="hidden sm:inline"
                  style={{ fontFamily: FONT, fontSize: 13, color: '#888', textDecoration: 'none', transition: 'color 150ms' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                  onMouseLeave={e => e.currentTarget.style.color = '#888'}>
                  {t.auth.login}
                </Link>
                <Link to="/auth?mode=register"
                  className="hidden sm:inline-flex items-center"
                  style={{
                    background: '#fff', color: '#000', padding: '8px 22px', borderRadius: 100,
                    fontSize: 12, fontWeight: 600, fontFamily: FONT, textDecoration: 'none', transition: 'opacity 150ms',
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  {t.auth.signup}
                </Link>
              </>
            )}

            {/* Settings gear */}
            <div ref={settingsRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setSettingsOpen(v => !v)}
                style={{
                  background: settingsOpen ? 'rgba(255,255,255,0.07)' : 'none',
                  border: settingsOpen ? '1px solid rgba(255,255,255,0.1)' : '1px solid transparent',
                  borderRadius: 6,
                  cursor: 'pointer', padding: '5px 6px',
                  color: settingsOpen ? '#fff' : '#666',
                  transition: 'all 150ms', display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { if (!settingsOpen) { e.currentTarget.style.color = '#666'; e.currentTarget.style.background = 'none'; e.currentTarget.style.border = '1px solid transparent'; } }}
              >
                {/* Cogwheel gear icon */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z" stroke="currentColor" strokeWidth="1.5"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              </button>
              {settingsOpen && <SettingsDropdown onClose={() => setSettingsOpen(false)} />}
            </div>

            {/* Mobile burger */}
            <button className="md:hidden" onClick={() => setMobileOpen(v => !v)}
              aria-label="Open menu" aria-expanded={mobileOpen} title="Open menu"
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
              {navLinks.map(([to, label]) => (
                <Link key={to} to={to} onClick={() => setMobileOpen(false)}
                  className="block py-3"
                  style={{ fontFamily: FONT, fontSize: 14, letterSpacing: '0.02em', color: '#fff', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {label}
                </Link>
              ))}
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, paddingTop: 16 }}>
                {isLoggedIn ? (
                  <Link to="/account" onClick={() => setMobileOpen(false)}
                    style={{ background: '#fff', color: '#000', padding: '8px 22px', borderRadius: 100, fontSize: 12, fontWeight: 600, fontFamily: FONT, textDecoration: 'none' }}>
                    {t.auth.account}
                  </Link>
                ) : (
                  <>
                    <Link to="/auth?mode=login" onClick={() => setMobileOpen(false)}
                      style={{ fontFamily: FONT, fontSize: 13, color: '#888', textDecoration: 'none' }}>
                      {t.auth.login}
                    </Link>
                    <Link to="/auth?mode=register" onClick={() => setMobileOpen(false)}
                      style={{ background: '#fff', color: '#000', padding: '8px 22px', borderRadius: 100, fontSize: 12, fontWeight: 600, fontFamily: FONT, textDecoration: 'none' }}>
                      {t.auth.signup}
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>
      <TickerTape />
    </>
  );
}
