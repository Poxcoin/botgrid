import React, { useEffect } from 'react';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';

const S = {
  page: {
    background: '#060606',
    color: '#fff',
    fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",
    minHeight: '100vh',
  },
  wrap: {
    maxWidth: '1100px',
    margin: '0 auto',
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
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '16px',
    padding: '44px 36px',
    display: 'flex',
    flexDirection: 'column',
  },
  cardHL: {
    background: '#0a0a0a',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '16px',
    padding: '44px 36px',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
  },
  popularPill: {
    position: 'absolute',
    top: '20px',
    right: '20px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '100px',
    padding: '3px 10px',
    fontSize: '9px',
    color: '#999',
    letterSpacing: '0.08em',
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
    fontSize: '52px',
    fontWeight: 700,
    color: '#fff',
    lineHeight: 1,
    letterSpacing: '-0.03em',
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

const FREE_ON  = ['Dashboard access', 'Live signal feed (read-only)', 'Bot analyzer & backtester', 'System logs'];
const FREE_OFF = ['Automated trading', 'API key integration', 'Priority support'];

const BASIC_ON  = ['Everything in Free', 'News Intelligence Bot', 'Grid Trading (BTC · ETH · SOL · DOGE · XRP)', 'Demo + live modes', 'API key integration'];
const BASIC_OFF = ['Listing Sniper', 'DEX Sniper', 'Whale Tracker'];

const PRO_ON = ['Everything in Basic', 'All 6 bots', 'Listing Sniper', 'DEX Sniper', 'Whale Tracker', 'Priority support', 'Performance analytics'];

const FAQS = [
  {
    q: 'Is my money safe?',
    a: 'Yes. We only use your exchange API key to place orders. Your funds stay on your exchange at all times. We never have custody.',
  },
  {
    q: 'What exchanges do you support?',
    a: 'Currently Bybit Perpetual Futures. More exchanges are coming — join the waitlist to get notified.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. No contracts, no lock-in. Cancel from your dashboard whenever you want.',
  },
  {
    q: 'What is the performance fee?',
    a: 'There is no performance fee on Basic. Pro plan includes advanced analytics — pricing may include a performance component in the future.',
  },
];

function FeatureRow({ on, text }) {
  return (
    <li style={on ? S.featureOn : S.featureOff}>
      <span style={{ ...S.featureIcon, color: on ? '#aaa' : '#333' }}>{on ? '✓' : '✗'}</span>
      {text}
    </li>
  );
}

export default function PricingPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div style={S.page}>
      <LandingHeader />

      {/* Hero */}
      <div style={S.wrap} className="px-5 md:px-14">
        <div style={S.hero}>
          <div style={S.badge}>3 Plans · Cancel Anytime</div>
          <h1 style={S.h1}>SIMPLE PRICING.</h1>
          <p style={S.subtitle}>
            No hidden fees. No lock-in. Start free and upgrade when you're ready.
          </p>
        </div>
      </div>

      {/* Cards */}
      <div style={S.wrap} className="px-5 md:px-14">
        <div style={S.cardsSection}>
          <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: '16px' }}>

            {/* FREE */}
            <div style={S.card}>
              <div style={S.cardLabel}>FREE</div>
              <div style={S.priceRow}>
                <span style={S.priceBig}>$0</span>
                <span style={S.pricePer}>/forever</span>
              </div>
              <p style={S.cardDesc}>
                Explore the platform. View live signals without trading.
              </p>
              <ul style={S.featureList}>
                {FREE_ON.map((f)  => <FeatureRow key={f} on={true}  text={f} />)}
                {FREE_OFF.map((f) => <FeatureRow key={f} on={false} text={f} />)}
              </ul>
              <div style={S.ctaWrap}>
                <a href="/waitlist" style={S.btnGhost}>Join Waitlist →</a>
              </div>
            </div>

            {/* BASIC — highlighted */}
            <div style={S.cardHL}>
              <span style={S.popularPill}>MOST POPULAR</span>
              <div style={S.cardLabel}>BASIC</div>
              <div style={S.priceRow}>
                <span style={S.priceBig}>$29</span>
                <span style={S.pricePer}>/month</span>
              </div>
              <p style={S.cardDesc}>
                News bot + grid bot running on your account. Demo mode available.
              </p>
              <ul style={S.featureList}>
                {BASIC_ON.map((f)  => <FeatureRow key={f} on={true}  text={f} />)}
                {BASIC_OFF.map((f) => <FeatureRow key={f} on={false} text={f} />)}
              </ul>
              <div style={S.ctaWrap}>
                <a href="/waitlist" style={S.btnPrimary}>Join Waitlist →</a>
              </div>
            </div>

            {/* PRO */}
            <div style={S.card}>
              <div style={S.cardLabel}>PRO</div>
              <div style={S.priceRow}>
                <span style={S.priceBig}>$79</span>
                <span style={S.pricePer}>/month</span>
              </div>
              <p style={S.cardDesc}>
                All six bots. Maximum automation. Priority support.
              </p>
              <ul style={S.featureList}>
                {PRO_ON.map((f) => <FeatureRow key={f} on={true} text={f} />)}
              </ul>
              <div style={S.ctaWrap}>
                <a href="/waitlist" style={S.btnGhost}>Join Waitlist →</a>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* FAQ */}
      <div style={S.wrap} className="px-5 md:px-14">
        <div style={S.faqSection}>
          <p style={S.faqEyebrow}>FAQ</p>
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
          Trading cryptocurrency involves significant risk. Past performance of any strategy or bot
          does not guarantee future results. You are responsible for your own trading decisions.
          KADO does not provide financial advice.
        </p>
      </div>

      <LandingFooter />
    </div>
  );
}
