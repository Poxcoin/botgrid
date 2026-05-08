import React, { useEffect, useState } from 'react';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import { useLang } from '@/lib/LangContext';
import { usePageTitle } from '@/lib/usePageTitle';

const S = {
  page: {
    background: '#060606',
    color: '#fff',
    fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",
    minHeight: '100vh',
  },
  wrap: {
    width: '100%',
  },
  hero: {
    textAlign: 'center',
    paddingTop: '100px',
    paddingBottom: '80px',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '100px',
    padding: '6px 18px',
    fontSize: '11px',
    color: '#888',
    marginBottom: '28px',
    letterSpacing: '0.06em',
  },
  h1: {
    fontSize: 'clamp(48px,7vw,88px)',
    fontWeight: 700,
    letterSpacing: '-0.05em',
    lineHeight: 1.0,
    margin: '0 0 24px 0',
    color: '#fff',
  },
  subtitle: {
    fontSize: '16px',
    color: '#aaa',
    maxWidth: '480px',
    margin: '0 auto',
    lineHeight: 1.6,
  },
  cardsSection: {
    paddingBottom: '100px',
  },
  card: {
    background: '#0a0a0a',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    padding: '44px 36px',
    display: 'flex',
    flexDirection: 'column',
    transition: 'border-color 200ms, transform 200ms',
  },
  cardHL: {
    background: '#0a0a0a',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    padding: '44px 36px',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },
  popularPill: {
    position: 'absolute',
    top: '20px',
    right: '20px',
    background: 'rgba(0,212,170,0.12)',
    border: '1px solid rgba(0,212,170,0.25)',
    borderRadius: '4px',
    padding: '3px 10px',
    fontSize: '9px',
    color: '#00d4aa',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  cardLabel: {
    fontSize: '11px',
    color: '#666',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: '20px',
  },
  priceRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    marginBottom: '8px',
  },
  priceBig: {
    fontFamily: "'Courier New','SF Mono',monospace",
    fontSize: '64px',
    fontWeight: 800,
    color: '#fff',
    lineHeight: 1,
    letterSpacing: '-0.04em',
  },
  priceBigGradient: {
    fontFamily: "'Courier New','SF Mono',monospace",
    fontSize: '64px',
    fontWeight: 800,
    lineHeight: 1,
    letterSpacing: '-0.04em',
    background: 'linear-gradient(135deg, #00d4aa, #4299e1)',
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    color: 'transparent',
  },
  pricePer: {
    fontSize: '14px',
    color: '#666',
  },
  cardDesc: {
    fontSize: '13px',
    color: '#aaa',
    lineHeight: 1.6,
    marginBottom: '28px',
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    paddingBottom: '28px',
  },
  featureList: {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 auto 0',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    flex: 1,
  },
  featureOn: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '13px',
    color: '#aaa',
  },
  featureOff: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '13px',
    color: '#333',
  },
  featureIcon: {
    flexShrink: 0,
    width: '16px',
    fontSize: '12px',
  },
  ctaWrap: {
    marginTop: '32px',
  },
  btnGhost: {
    display: 'block',
    width: '100%',
    padding: '14px 36px',
    borderRadius: '100px',
    fontSize: '13px',
    fontWeight: 600,
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'transparent',
    color: '#fff',
    cursor: 'pointer',
    textAlign: 'center',
    textDecoration: 'none',
    letterSpacing: '0.01em',
    boxSizing: 'border-box',
  },
  btnPrimary: {
    display: 'block',
    width: '100%',
    padding: '14px 36px',
    borderRadius: '100px',
    fontSize: '13px',
    fontWeight: 600,
    border: 'none',
    background: '#fff',
    color: '#000',
    cursor: 'pointer',
    textAlign: 'center',
    textDecoration: 'none',
    letterSpacing: '0.01em',
    boxSizing: 'border-box',
  },
  faqSection: {
    paddingBottom: '100px',
  },
  faqEyebrow: {
    fontSize: '11px',
    color: '#666',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginBottom: '48px',
    textAlign: 'center',
  },
  faqItem: {
    borderTop: '1px solid rgba(255,255,255,0.06)',
    paddingTop: '24px',
  },
  faqQ: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#fff',
    marginBottom: '12px',
    letterSpacing: '-0.01em',
  },
  faqA: {
    fontSize: '14px',
    color: '#aaa',
    lineHeight: 1.7,
  },
  disclaimer: {
    textAlign: 'center',
    paddingBottom: '80px',
    paddingTop: '0',
    fontSize: '12px',
    color: '#333',
    maxWidth: '600px',
    margin: '0 auto',
    lineHeight: 1.6,
  },
};

const FREE_ON_KEYS  = ['dashboard', 'botAnalyzer', 'demoTrading', 'systemLogs', 'signalFeed'];
const FREE_OFF_KEYS = ['liveTrading', 'apiKey', 'prioritySupport'];
const PERF_ON_KEYS  = ['allBots', 'liveTrading', 'apiKey', 'noUpfront', 'hwm', 'monthlyInvoice', 'prioritySupport'];

function FeatureRow({ on, text }) {
  return (
    <li style={on ? S.featureOn : S.featureOff}>
      <span style={{ ...S.featureIcon, color: on ? '#00d4aa' : '#4a5568', fontWeight: 700 }}>{on ? '✓' : '✗'}</span>
      {text}
    </li>
  );
}

export default function PricingPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const [loading, setLoading] = useState(null);
  const { t } = useLang();
  usePageTitle(t.nav.pricing);

  const FAQS = [
    { q: t.pricing.faq.q1, a: t.pricing.faq.a1 },
    { q: t.pricing.faq.q2, a: t.pricing.faq.a2 },
    { q: t.pricing.faq.q3, a: t.pricing.faq.a3 },
    { q: t.pricing.faq.q4, a: t.pricing.faq.a4 },
  ];

  async function startCheckout(plan) {
    const token = localStorage.getItem('kado_token');
    if (!token) { window.location.href = `/auth?mode=register&plan=${plan}`; return; }
    // Performance plan: fee-on-profit settled in USDT, no upfront checkout — send to billing panel.
    if (plan === 'performance') { window.location.href = '/account#billing'; return; }
    setLoading(plan);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || t.pricing.checkoutFailed);
        setLoading(null);
        return;
      }
      const { url } = await res.json();
      if (url) { window.location.href = url; return; }
      window.location.href = '/account#billing';
    } catch {
      alert(t.pricing.checkoutUnavailable);
      setLoading(null);
    }
  }

  return (
    <div style={S.page}>
      <LandingHeader />

      {/* Hero */}
      <div style={S.wrap} className="px-5 md:px-14">
        <div style={S.hero}>
          <div style={S.badge}>{t.pricing.badge}</div>
          <h1 style={S.h1}>{t.pricing.h1.toUpperCase()}</h1>
          <p style={S.subtitle}>
            {t.pricing.sub}
          </p>
        </div>
      </div>

      {/* Cards */}
      <div style={S.wrap} className="px-5 md:px-14">
        <div style={S.cardsSection}>
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '16px' }}>

            {/* FREE */}
            <div style={S.card}>
              <div style={S.cardLabel}>{t.pricing.freeLabel}</div>
              <div style={S.priceRow}>
                <span style={S.priceBig}>$0</span>
                <span style={S.pricePer}>{t.pricing.freeUnit}</span>
              </div>
              <p style={S.cardDesc}>
                {t.pricing.freeDesc}
              </p>
              <ul style={S.featureList}>
                {FREE_ON_KEYS.map((k)  => <FeatureRow key={k} on={true}  text={t.pricing.features[k]} />)}
                {FREE_OFF_KEYS.map((k) => <FeatureRow key={k} on={false} text={t.pricing.features[k]} />)}
              </ul>
              <div style={S.ctaWrap}>
                <a href="/auth?mode=register" style={S.btnGhost}>{t.pricing.starterCta}</a>
              </div>
            </div>

            {/* PERFORMANCE — highlighted */}
            <div style={S.cardHL}>
              <span style={S.popularPill}>{t.pricing.recommendedPill}</span>
              <div style={S.cardLabel}>{t.pricing.perfLabel}</div>
              <div style={S.priceRow}>
                <span style={S.priceBigGradient}>20%</span>
                <span style={S.pricePer}>{t.pricing.perfUnit}</span>
              </div>
              <p style={S.cardDesc}>
                {t.pricing.perfDesc}
              </p>
              <ul style={S.featureList}>
                {PERF_ON_KEYS.map((k) => <FeatureRow key={k} on={true} text={t.pricing.features[k]} />)}
              </ul>
              <div style={S.ctaWrap}>
                <button
                  onClick={() => startCheckout('performance')}
                  disabled={!!loading}
                  style={{ ...S.btnPrimary, opacity: loading === 'performance' ? 0.6 : 1, cursor: loading ? 'default' : 'pointer' }}
                >
                  {loading === 'performance' ? t.pricing.redirecting : t.pricing.perfCta}
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* FAQ */}
      <div style={S.wrap} className="px-5 md:px-14">
        <div style={S.faqSection}>
          <p style={S.faqEyebrow}>{t.pricing.faqLabel}</p>
          <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: '32px 48px' }}>
            {FAQS.map((item) => (
              <div key={item.q} style={S.faqItem}>
                <p style={S.faqQ}>{item.q}</p>
                <p style={S.faqA}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Disclaimer */}
      <div style={S.wrap} className="px-5 md:px-14">
        <p style={S.disclaimer}>
          {t.pricing.disclaimer}
        </p>
      </div>

      <LandingFooter />
    </div>
  );
}
