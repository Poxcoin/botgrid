import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/lib/LangContext';
import { initPixel } from '@/lib/metaPixel';

const CONSENT_KEY = 'kado_consent_v1';
const LEGACY_KEY  = 'kado_cookie_consent';
const FF   = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif";
const MONO = "'Courier New','SF Mono',monospace";

function saveConsent({ legal, cookies }) {
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
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  }
}

export default function CookieBanner() {
  const { t } = useLang();
  const [visible,   setVisible]   = useState(false);
  const [legalOk,   setLegalOk]   = useState(false);
  const [cookiesOk, setCookiesOk] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CONSENT_KEY);
      if (raw && JSON.parse(raw)?.legal === true) return;
    } catch {}
    setVisible(true);
  }, []);

  function handleContinue() {
    if (!legalOk) return;
    saveConsent({ legal: true, cookies: cookiesOk });
    setVisible(false);
  }

  if (!visible) return null;

  const linkStyle = { color: '#fff', textDecoration: 'underline', textUnderlineOffset: 2 };
  const mutedLink = { color: '#555', textDecoration: 'none', fontSize: 11 };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Consent"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.9)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div style={{
        background: '#0a0a0a',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        padding: '36px 32px',
        width: '100%', maxWidth: 480,
        fontFamily: FF, color: '#fff',
      }}>
        <div style={{ fontFamily: MONO, fontSize: 14, fontWeight: 700, letterSpacing: '0.3em', marginBottom: 28, color: '#fff' }}>
          KADO
        </div>

        <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 10 }}>
          {t.cookies.title}
        </div>
        <p style={{ fontSize: 13, color: '#777', lineHeight: 1.6, margin: '0 0 28px' }}>
          {t.cookies.body}
        </p>

        {/* Required: ToS + Risk */}
        <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 16, padding: '14px 16px', background: '#111', border: `1px solid ${legalOk ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 10, transition: 'border-color 0.2s' }}>
          <input
            type="checkbox"
            checked={legalOk}
            onChange={e => setLegalOk(e.target.checked)}
            style={{ marginTop: 2, cursor: 'pointer', accentColor: '#fff', width: 16, height: 16, flexShrink: 0 }}
          />
          <span style={{ fontSize: 13, color: '#ccc', lineHeight: 1.6 }}>
            {t.cookies.legalCheck}{' '}
            <Link to="/legal/terms" target="_blank" rel="noreferrer" style={linkStyle}>{t.footer.legalTerms}</Link>
            {' & '}
            <Link to="/legal/risk-disclosure" target="_blank" rel="noreferrer" style={linkStyle}>{t.footer.legalRisk}</Link>
            {'  '}
            <span style={{ fontSize: 10, padding: '2px 6px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', borderRadius: 4, fontWeight: 600, verticalAlign: 'middle' }}>
              {t.cookies.required}
            </span>
          </span>
        </label>

        {/* Optional: cookies */}
        <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer', marginBottom: 28, padding: '14px 16px', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10 }}>
          <input
            type="checkbox"
            checked={cookiesOk}
            onChange={e => setCookiesOk(e.target.checked)}
            style={{ marginTop: 2, cursor: 'pointer', accentColor: '#fff', width: 16, height: 16, flexShrink: 0 }}
          />
          <span style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
            {t.cookies.cookieCheck}
          </span>
        </label>

        <button
          onClick={handleContinue}
          disabled={!legalOk}
          style={{
            width: '100%', padding: '13px',
            background: legalOk ? '#fff' : '#191919',
            color: legalOk ? '#000' : '#444',
            border: 'none', borderRadius: 100,
            fontSize: 13, fontWeight: 600, fontFamily: FF,
            cursor: legalOk ? 'pointer' : 'not-allowed',
            transition: 'background 0.2s, color 0.2s',
          }}
        >
          {t.cookies.continue}
        </button>

        <div style={{ marginTop: 18, textAlign: 'center', display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link to="/legal/privacy" style={mutedLink}>{t.footer.legalPrivacy}</Link>
          <span style={{ color: '#333', fontSize: 11 }}>·</span>
          <Link to="/legal/terms" style={mutedLink}>{t.footer.legalTerms}</Link>
          <span style={{ color: '#333', fontSize: 11 }}>·</span>
          <Link to="/legal/risk-disclosure" style={mutedLink}>{t.footer.legalRisk}</Link>
        </div>
      </div>
    </div>
  );
}
