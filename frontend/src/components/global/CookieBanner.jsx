import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/lib/LangContext';
import { initPixel } from '@/lib/metaPixel';

const CONSENT_KEY = 'kado_consent_v1';
const LEGACY_KEY  = 'kado_cookie_consent';
const FF   = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif";
const MONO = "'Courier New','SF Mono',monospace";

export function isLegalAccepted() {
  try { return JSON.parse(localStorage.getItem(CONSENT_KEY) || '{}')?.legal === true; } catch { return false; }
}

export function saveConsent({ legal, cookies }) {
  try {
    localStorage.setItem(CONSENT_KEY, JSON.stringify({ legal, cookies, ts: new Date().toISOString() }));
    localStorage.setItem(LEGACY_KEY, cookies ? 'accepted' : 'rejected');
  } catch {}
  if (cookies) initPixel();
  if (legal) {
    const token = localStorage.getItem('kado_token');
    if (token) {
      fetch('/api/users/accept-terms', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token },
      }).catch(() => {});
    }
  }
}

export default function CookieBanner() {
  const { t } = useLang();
  const [visible,   setVisible]   = useState(false);
  const [show,      setShow]      = useState(false); // drives CSS transition
  const [legalOk,   setLegalOk]   = useState(false);
  const [cookiesOk, setCookiesOk] = useState(true);

  useEffect(() => {
    if (!isLegalAccepted()) {
      setVisible(true);
      // two rAFs so the initial opacity:0 state is painted before we transition to 1
      requestAnimationFrame(() => requestAnimationFrame(() => setShow(true)));
    }
  }, []);

  function handleContinue() {
    if (!legalOk) return;
    saveConsent({ legal: true, cookies: cookiesOk });
    setShow(false);
    setTimeout(() => setVisible(false), 500);
  }

  if (!visible) return null;

  const linkUnder = { color: '#fff', textDecoration: 'underline', textUnderlineOffset: 2 };
  const linkMuted = { color: '#444', textDecoration: 'none', fontSize: 11, fontFamily: FF };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Legal consent"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        // backdrop fades in
        background: `rgba(0,0,0,${show ? 0.88 : 0})`,
        backdropFilter: show ? 'blur(6px)' : 'none',
        WebkitBackdropFilter: show ? 'blur(6px)' : 'none',
        transition: 'background 0.5s ease, backdrop-filter 0.5s ease',
      }}
    >
      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 480,
        background: '#000',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        padding: '40px 36px',
        fontFamily: FF, color: '#fff',
        // fade + subtle lift
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.98)',
        transition: 'opacity 0.45s ease, transform 0.45s ease',
        boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
      }}>

        {/* Logo */}
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 700, letterSpacing: '0.35em', color: '#fff', marginBottom: 32 }}>
          KADO
        </div>

        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 10 }}>
          {t.cookies.title}
        </div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.65, margin: '0 0 28px' }}>
          {t.cookies.body}
        </p>

        {/* Required checkbox */}
        <label style={{
          display: 'flex', gap: 12, alignItems: 'flex-start',
          cursor: 'pointer', marginBottom: 12,
          padding: '14px 16px',
          background: legalOk ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
          border: `1px solid ${legalOk ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`,
          borderRadius: 10,
          transition: 'background 0.2s, border-color 0.2s',
        }}>
          <input
            type="checkbox"
            checked={legalOk}
            onChange={e => setLegalOk(e.target.checked)}
            style={{ marginTop: 2, width: 15, height: 15, flexShrink: 0, cursor: 'pointer', accentColor: '#fff' }}
          />
          <span style={{ fontSize: 13, color: legalOk ? '#fff' : 'rgba(255,255,255,0.55)', lineHeight: 1.6, transition: 'color 0.2s' }}>
            {t.cookies.legalCheck}{' '}
            <Link to="/legal/terms" target="_blank" rel="noreferrer" style={linkUnder}>{t.footer.legalTerms}</Link>
            {', '}
            <Link to="/legal/risk-disclosure" target="_blank" rel="noreferrer" style={linkUnder}>{t.footer.legalRisk}</Link>
            {' & '}
            <Link to="/legal/privacy" target="_blank" rel="noreferrer" style={linkUnder}>{t.footer.legalPrivacy}</Link>
          </span>
        </label>

        {/* Optional cookies */}
        <label style={{
          display: 'flex', gap: 12, alignItems: 'flex-start',
          cursor: 'pointer', marginBottom: 28,
          padding: '14px 16px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 10,
        }}>
          <input
            type="checkbox"
            checked={cookiesOk}
            onChange={e => setCookiesOk(e.target.checked)}
            style={{ marginTop: 2, width: 15, height: 15, flexShrink: 0, cursor: 'pointer', accentColor: '#fff' }}
          />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
            {t.cookies.cookieCheck}
          </span>
        </label>

        {/* Continue */}
        <button
          onClick={handleContinue}
          disabled={!legalOk}
          style={{
            width: '100%', padding: '14px',
            background: legalOk ? '#fff' : 'rgba(255,255,255,0.06)',
            color: legalOk ? '#000' : 'rgba(255,255,255,0.2)',
            border: 'none', borderRadius: 100,
            fontSize: 13, fontWeight: 600, fontFamily: FF,
            cursor: legalOk ? 'pointer' : 'default',
            transition: 'background 0.25s, color 0.25s',
            letterSpacing: '0.01em',
          }}
        >
          {t.cookies.continue}
        </button>

        {/* Footer */}
        <div style={{ marginTop: 20, display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/legal/privacy"         style={linkMuted}>{t.footer.legalPrivacy}</Link>
          <span style={{ color: '#222', fontSize: 11 }}>·</span>
          <Link to="/legal/terms"           style={linkMuted}>{t.footer.legalTerms}</Link>
          <span style={{ color: '#222', fontSize: 11 }}>·</span>
          <Link to="/legal/risk-disclosure" style={linkMuted}>{t.footer.legalRisk}</Link>
        </div>
      </div>
    </div>
  );
}
