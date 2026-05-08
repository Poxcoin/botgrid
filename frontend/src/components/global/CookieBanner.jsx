import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/lib/LangContext';
import { initPixel } from '@/lib/metaPixel';

const KEY = 'kado_cookie_consent';
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif";
const MONO = "'Courier New','SF Mono',monospace";

export default function CookieBanner() {
  const { t } = useLang();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (!stored) setVisible(true);
    } catch {}
  }, []);

  function decide(value) {
    try { localStorage.setItem(KEY, value); } catch {}
    setVisible(false);
    if (value === 'accepted') initPixel();
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      style={{
        position: 'fixed', left: 16, right: 16, bottom: 16,
        maxWidth: 520, marginLeft: 'auto',
        background: 'rgba(10,10,10,0.95)',
        backdropFilter: 'blur(18px)',
        WebkitBackdropFilter: 'blur(18px)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        padding: '16px 18px',
        zIndex: 1000,
        fontFamily: FONT, color: '#e5e7eb',
        boxShadow: '0 18px 48px rgba(0,0,0,0.6)',
      }}
    >
      <p style={{ fontSize: 13, lineHeight: 1.55, margin: 0, color: '#cbd5e1' }}>
        {t.cookies.body}{' '}
        <Link to="/legal/terms" style={{ color: '#9ca3af', textDecoration: 'underline' }}>
          {t.cookies.learnMore}
        </Link>
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button
          onClick={() => decide('accepted')}
          style={{
            background: '#fff', color: '#050505', border: 'none', borderRadius: 4,
            padding: '8px 16px', fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em',
            textTransform: 'uppercase', fontWeight: 700, cursor: 'pointer',
          }}
        >
          {t.cookies.accept}
        </button>
        <button
          onClick={() => decide('rejected')}
          style={{
            background: 'transparent', color: '#cbd5e1',
            border: '1px solid rgba(255,255,255,0.18)', borderRadius: 4,
            padding: '8px 16px', fontFamily: MONO, fontSize: 11, letterSpacing: '0.08em',
            textTransform: 'uppercase', cursor: 'pointer',
          }}
        >
          {t.cookies.reject}
        </button>
      </div>
    </div>
  );
}
