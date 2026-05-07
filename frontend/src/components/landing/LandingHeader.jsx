import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import TickerTape from '@/components/landing/TickerTape';
import { useLang } from '@/lib/LangContext';

const MONO = "'Courier New','SF Mono',monospace";
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif";

const LANG_LABELS = { ru: 'Русский', uk: 'Українська', en: 'English', de: 'Deutsch' };

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

function SectionLabel({ children }) {
  return (
    <div style={{ padding: '10px 18px 4px', fontFamily: MONO, fontSize: 8, color: '#3a3a3a', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
      {children}
    </div>
  );
}

function MenuItem({ icon, label, sub, to, onClick, danger }) {
  const inner = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '9px 18px' }}>
      <div style={{
        width: 28, height: 28, borderRadius: 6, flexShrink: 0,
        background: danger ? 'rgba(231,76,60,0.08)' : 'rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: danger ? '#e74c3c' : '#777',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: FONT, fontSize: 13, color: danger ? '#e74c3c' : '#bbb', lineHeight: 1.2 }}>{label}</div>
        {sub && <div style={{ fontFamily: MONO, fontSize: 9, color: '#444', marginTop: 2, letterSpacing: '0.04em' }}>{sub}</div>}
      </div>
      {!danger && (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M3 2l4 3-4 3" stroke="#333" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
  );

  const hover = e => { e.currentTarget.style.background = danger ? 'rgba(231,76,60,0.06)' : 'rgba(255,255,255,0.04)'; };
  const out   = e => { e.currentTarget.style.background = 'none'; };

  if (to) return (
    <Link to={to} style={{ display: 'block', textDecoration: 'none', transition: 'background 120ms' }}
      onMouseEnter={hover} onMouseLeave={out}>
      {inner}
    </Link>
  );
  return (
    <div onClick={onClick} style={{ cursor: 'pointer', transition: 'background 120ms' }}
      onMouseEnter={hover} onMouseLeave={out}>
      {inner}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />;
}

function getUser() {
  try { return JSON.parse(localStorage.getItem('kado_user') || '{}'); } catch { return {}; }
}

function SettingsDropdown({ onClose }) {
  const { lang, setLang, LANGS, t } = useLang();
  const isLoggedIn = !!localStorage.getItem('kado_token');
  const user = isLoggedIn ? getUser() : {};

  function logout() {
    localStorage.removeItem('kado_token');
    localStorage.removeItem('kado_user');
    window.location.href = '/auth';
    onClose();
  }

  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 8px)', right: 0,
      width: 296, background: '#0d0d0d',
      border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 24px 64px rgba(0,0,0,0.85)',
      zIndex: 200, overflow: 'hidden',
    }}>

      {/* ── Account info bar (logged in only) ── */}
      {isLoggedIn && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{
            width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
            background: 'rgba(255,255,255,0.07)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: MONO, fontSize: 13, fontWeight: 700, color: '#bbb',
          }}>
            {(user.email?.[0] || 'K').toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.email || '—'}
            </div>
            {user.plan && (
              <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.14em', color: '#3a3a3a', textTransform: 'uppercase', marginTop: 2 }}>
                {user.plan}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Account section ── */}
      <div style={{ paddingTop: 6 }}>
        <SectionLabel>{t.settings.account}</SectionLabel>
        <MenuItem
          icon={<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.3"/><path d="M2.5 14c0-3 2.462-5 5.5-5s5.5 2 5.5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>}
          label={t.settings.account}
          to={isLoggedIn ? '/account' : '/auth?mode=login'}
          onClick={onClose}
        />
        <MenuItem
          icon={<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 1l.7 1.3H11l-.8 1.15.3 1.3L8 4l-2.5 1 .3-1.3L5 2.3h2.3L8 1z" fill="currentColor" opacity=".25"/><circle cx="8" cy="9" r="2.8" stroke="currentColor" strokeWidth="1.3"/><path d="M8 6.2V4m0 9.8V12M4.95 7.3L3.5 5.84M12.5 12.16l-1.45-1.46M4.95 10.7l-1.45 1.46M12.5 3.84L11.05 5.3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>}
          label={t.settings.security}
          to={isLoggedIn ? '/account#security' : '/auth?mode=login'}
          onClick={onClose}
        />
      </div>

      <Divider />

      {/* ── Integrations section ── */}
      <div>
        <SectionLabel>{t.settings.integrations}</SectionLabel>
        <MenuItem
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.49 8.31-1.97 9.27c-.15.66-.54.82-1.09.51l-3-2.21-1.45 1.39c-.16.16-.3.3-.6.3l.21-3.05 5.56-5.02c.24-.21-.05-.33-.37-.12L6.87 13.8 3.9 12.87c-.64-.2-.65-.64.14-.95l11.57-4.46c.53-.19 1 .13.88.85z"/></svg>}
          label={t.settings.tgBot}
          sub="@pulseplusebot"
          to={isLoggedIn ? '/account#telegram' : '/auth?mode=login'}
          onClick={onClose}
        />
        <MenuItem
          icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none"><rect x="2" y="5" width="20" height="14" rx="2" stroke="currentColor" strokeWidth="1.5"/><path d="M2 10h20M8 15h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/><circle cx="17" cy="15" r="1" fill="currentColor" opacity=".6"/></svg>}
          label={t.settings.tgChannel}
          to={isLoggedIn ? '/account#channel' : '/auth?mode=login'}
          onClick={onClose}
        />
      </div>

      <Divider />

      {/* ── Language section ── */}
      <div>
        <SectionLabel>{t.settings.language}</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: '6px 18px 10px' }}>
          {LANGS.map(({ code }) => (
            <button key={code} onClick={() => setLang(code)}
              style={{
                padding: '7px 0', borderRadius: 6, cursor: 'pointer',
                border: lang === code ? '1px solid rgba(255,255,255,0.22)' : '1px solid rgba(255,255,255,0.07)',
                background: lang === code ? 'rgba(255,255,255,0.09)' : 'none',
                fontFamily: FONT, fontSize: 12,
                color: lang === code ? '#fff' : '#4a4a4a',
                transition: 'all 130ms', textAlign: 'center',
              }}
              onMouseEnter={e => { if (lang !== code) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.14)'; e.currentTarget.style.color = '#888'; } }}
              onMouseLeave={e => { if (lang !== code) { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = '#4a4a4a'; } }}
            >
              {LANG_LABELS[code]}
            </button>
          ))}
        </div>
      </div>

      <Divider />

      {/* ── Log out / Login ── */}
      {isLoggedIn ? (
        <div style={{ paddingBottom: 4 }}>
          <MenuItem
            icon={<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M10.5 8H3M5.5 5.5L3 8l2.5 2.5M7 4V3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            label={t.settings.logout}
            onClick={logout}
            danger
          />
        </div>
      ) : (
        <div style={{ padding: '6px 18px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Link to="/auth?mode=login" onClick={onClose}
            style={{ display: 'block', padding: '9px', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, textAlign: 'center', fontFamily: FONT, fontSize: 13, color: '#888', textDecoration: 'none', transition: 'all 120ms' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#888'; }}>
            {t.auth.login}
          </Link>
          <Link to="/auth?mode=register" onClick={onClose}
            style={{ display: 'block', padding: '9px', background: '#fff', borderRadius: 6, textAlign: 'center', fontFamily: FONT, fontSize: 13, fontWeight: 600, color: '#000', textDecoration: 'none', transition: 'opacity 120ms' }}
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
