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
  const [mounted,   setMounted]   = useState(false);
  const [legalOk,   setLegalOk]   = useState(false);
  const [cookiesOk, setCookiesOk] = useState(true);

  useEffect(() => {
    if (!isLegalAccepted()) {
      setVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)));
    }
  }, []);

  function handleContinue() {
    if (!legalOk) return;
    saveConsent({ legal: true, cookies: cookiesOk });
    setMounted(false);
    setTimeout(() => setVisible(false), 350);
  }

  if (!visible) return null;

  const linkUnder  = { color: '#fff',  textDecoration: 'underline', textUnderlineOffset: 2 };
  const linkMuted  = { color: '#555',  textDecoration: 'none', fontSize: 11, fontFamily: FF };
  const checkLabel = (checked) => ({
    display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer',
    padding: '12px 14px',
    background: checked ? 'rgba(255,255,255,0.04)' : '#0d0d0d',
    border: `1px solid ${checked ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)'}`,
    borderRadius: 8, marginBottom: 10,
    transition: 'background 0.15s, border-color 0.15s',
  });

  return (
    <>
      {/* Backdrop — semi-transparent, blocks interaction with page */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        opacity: mounted ? 1 : 0,
        transition: 'opacity 0.35s ease',
      }} />

      {/* Bottom panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Legal consent"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          zIndex: 9999,
          transform: mounted ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.4s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      >
        <div style={{
          margin: '0 auto',
          maxWidth: 560,
          background: '#0a0a0a',
          border: '1px solid rgba(255,255,255,0.1)',
          borderBottom: 'none',
          borderRadius: '16px 16px 0 0',
          padding: '28px 28px 32px',
          fontFamily: FF, color: '#fff',
          boxShadow: '0 -24px 64px rgba(0,0,0,0.7)',
        }}>

          {/* Handle bar */}
          <div style={{ width: 36, height: 4, background: 'rgba(255,255,255,0.12)', borderRadius: 2, margin: '0 auto 22px' }} />

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.3em', color: '#fff' }}>KADO</div>
            <div style={{ fontSize: 10, color: '#444', fontFamily: MONO, letterSpacing: '0.15em' }}>LEGAL CONSENT REQUIRED</div>
          </div>

          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 6 }}>
            {t.cookies.title}
          </div>
          <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: '0 0 20px' }}>
            {t.cookies.body}
          </p>

          {/* Required: ToS + Risk Disclosure */}
          <label style={checkLabel(legalOk)}>
            <input
              type="checkbox"
              checked={legalOk}
              onChange={e => setLegalOk(e.target.checked)}
              style={{ marginTop: 2, cursor: 'pointer', accentColor: '#fff', width: 15, height: 15, flexShrink: 0 }}
            />
            <span style={{ fontSize: 13, color: '#ccc', lineHeight: 1.6 }}>
              {t.cookies.legalCheck}{' '}
              <Link to="/legal/terms" target="_blank" rel="noreferrer" style={linkUnder}>{t.footer.legalTerms}</Link>
              {', '}
              <Link to="/legal/risk-disclosure" target="_blank" rel="noreferrer" style={linkUnder}>{t.footer.legalRisk}</Link>
              {' & '}
              <Link to="/legal/privacy" target="_blank" rel="noreferrer" style={linkUnder}>{t.footer.legalPrivacy}</Link>
              {'  '}
              <span style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', borderRadius: 4, fontWeight: 600, verticalAlign: 'middle' }}>
                {t.cookies.required}
              </span>
            </span>
          </label>

          {/* Optional: analytics cookies */}
          <label style={checkLabel(cookiesOk)}>
            <input
              type="checkbox"
              checked={cookiesOk}
              onChange={e => setCookiesOk(e.target.checked)}
              style={{ marginTop: 2, cursor: 'pointer', accentColor: '#fff', width: 15, height: 15, flexShrink: 0 }}
            />
            <span style={{ fontSize: 13, color: '#666', lineHeight: 1.55 }}>
              {t.cookies.cookieCheck}
            </span>
          </label>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
            <button
              onClick={handleContinue}
              disabled={!legalOk}
              style={{
                flex: 1, padding: '13px',
                background: legalOk ? '#fff' : '#1a1a1a',
                color: legalOk ? '#000' : '#444',
                border: 'none', borderRadius: 100,
                fontSize: 13, fontWeight: 600, fontFamily: FF,
                cursor: legalOk ? 'pointer' : 'not-allowed',
                transition: 'background 0.2s, color 0.2s',
              }}
            >
              {t.cookies.continue}
            </button>
          </div>

          {/* Footer links */}
          <div style={{ marginTop: 16, textAlign: 'center', display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/legal/privacy"          style={linkMuted}>{t.footer.legalPrivacy}</Link>
            <span style={{ color: '#2a2a2a', fontSize: 11 }}>·</span>
            <Link to="/legal/terms"            style={linkMuted}>{t.footer.legalTerms}</Link>
            <span style={{ color: '#2a2a2a', fontSize: 11 }}>·</span>
            <Link to="/legal/risk-disclosure"  style={linkMuted}>{t.footer.legalRisk}</Link>
          </div>
        </div>
      </div>
    </>
  );
}
