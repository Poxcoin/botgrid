import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import { useLang } from '@/lib/LangContext';
import { usePageTitle } from '@/lib/usePageTitle';

const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif";
const MONO = "'Courier New','SF Mono',monospace";

export default function NotFoundPage() {
  const { t } = useLang();
  usePageTitle(t.errors.pageNotFoundTitle);
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div style={{
      background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: FONT,
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
    }}>
      <LandingHeader />
      <main style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '80px 32px', textAlign: 'center',
      }}>
        <div style={{ maxWidth: 520 }}>
          <div style={{
            fontFamily: MONO, fontWeight: 800,
            fontSize: 'clamp(96px, 18vw, 200px)',
            letterSpacing: '-0.06em', lineHeight: 1, opacity: 0.08,
            marginBottom: -16,
          }}>
            404
          </div>
          <h1 style={{
            fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700,
            letterSpacing: '-0.03em', margin: '0 0 14px',
          }}>
            {t.errors.pageNotFoundTitle}
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--text-secondary)', margin: '0 0 32px' }}>
            {t.errors.pageNotFoundBody}
          </p>
          <Link
            to="/"
            style={{
              display: 'inline-block',
              background: '#fff', color: '#050505',
              padding: '12px 24px', borderRadius: 4,
              fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em',
              textTransform: 'uppercase', fontWeight: 700, textDecoration: 'none',
            }}
          >
            {t.errors.goHome}
          </Link>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
