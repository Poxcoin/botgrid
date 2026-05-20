import React, { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import { usePageTitle } from '@/lib/usePageTitle';
import { useIsMobile } from '@/lib/useIsMobile';

const MONO = "'Courier New','SF Mono',monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',sans-serif";
const LINE = 'rgba(255,255,255,0.07)';

const SECTIONS = [
  { id: 'overview',  label: 'DOCUMENTS' },
  { id: 'faq',       label: 'FAQ' },
  { id: 'support',   label: 'SUPPORT' },
];

const LEGAL_DOCS = [
  {
    id: 'terms',
    title: 'Terms of Service',
    desc: 'Usage rules, eligibility, performance fees, referral program, prohibited conduct, liability.',
    updated: '2026-05-18',
    to: '/legal/terms',
  },
  {
    id: 'privacy',
    title: 'Privacy Policy',
    desc: 'What personal data we collect, how it is stored, GDPR rights, sub-processors, cookies.',
    updated: '2026-05-18',
    to: '/legal/privacy',
  },
  {
    id: 'risk',
    title: 'Risk Disclosure',
    desc: 'Market risk, leverage, liquidation, exchange counterparty risk, technical risk, limitations.',
    updated: '2026-05-18',
    to: '/legal/risk-disclosure',
  },
  {
    id: 'cookie',
    title: 'Cookie Policy',
    desc: 'We use two cookies: session JWT and consent preference. No advertising or tracking cookies.',
    updated: '2026-05-18',
    to: '/legal/privacy#section-9',
  },
  {
    id: 'gdpr',
    title: 'GDPR / Data Rights',
    desc: 'Access, rectification, erasure, portability, restriction, objection — exercise any right by email.',
    updated: '2026-05-18',
    to: '/legal/privacy#section-6',
  },
];

function DocCard({ doc, isMobile }) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      to={doc.to}
      style={{ textDecoration: 'none' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{
        border: `1px solid ${hover ? 'rgba(255,255,255,0.14)' : LINE}`,
        padding: isMobile ? '22px 18px' : '28px 24px',
        display: 'flex', flexDirection: 'column', gap: 12,
        background: hover ? 'rgba(255,255,255,0.02)' : 'transparent',
        transition: 'border-color 150ms, background 150ms',
        height: '100%', boxSizing: 'border-box',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 600, color: '#d8d8d8', letterSpacing: '-0.02em', lineHeight: 1.25 }}>
            {doc.title}
          </div>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginTop: 3, opacity: hover ? 0.7 : 0.25, transition: 'opacity 150ms' }}>
            <path d="M2.5 9.5l7-7M5 2.5h4.5V7" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 13, color: '#555', lineHeight: 1.75, flex: 1 }}>
          {doc.desc}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 9, color: '#2d2d2d', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          Updated {doc.updated}
        </div>
      </div>
    </Link>
  );
}

function OverviewContent({ isMobile }) {
  return (
    <div style={{ padding: isMobile ? '32px 16px 60px' : '48px 32px 80px' }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontFamily: SANS, fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.03em', color: '#e8e8e8', margin: '0 0 12px' }}>
          Company Documents
        </h1>
        <p style={{ fontFamily: SANS, fontSize: 14, color: '#555', margin: 0, lineHeight: 1.7 }}>
          Legal agreements, privacy disclosures, and data rights information for KADO users.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
        gap: 1,
        background: LINE,
      }}>
        {LEGAL_DOCS.map(doc => (
          <div key={doc.id} style={{ background: '#060606' }}>
            <DocCard doc={doc} isMobile={isMobile} />
          </div>
        ))}
        {/* Fill last cell if odd count on 2-col grid */}
        {!isMobile && LEGAL_DOCS.length % 2 !== 0 && (
          <div style={{ background: '#060606' }} />
        )}
      </div>

      {/* Company info strip */}
      <div style={{ marginTop: 48, borderTop: `1px solid ${LINE}`, paddingTop: 32, display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 32 }}>
        {[
          { label: 'COMPANY', value: 'KADO' },
          { label: 'INFRASTRUCTURE', value: 'Hetzner VPS · Falkenstein, Germany (EU)' },
          { label: 'LEGAL CONTACT', value: 'legal@kadoclub.net' },
          { label: 'PRIVACY CONTACT', value: 'privacy@kadoclub.net' },
        ].map(item => (
          <div key={item.label} style={{ flex: 1 }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: '#333', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>{item.label}</div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: '#666', lineHeight: 1.6 }}>{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: `1px solid ${LINE}` }}>
      <button onClick={() => setOpen(v => !v)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 0', background: 'none', border: 'none', cursor: 'pointer',
        fontFamily: SANS, fontSize: 14, fontWeight: 500, color: '#bbb', textAlign: 'left',
      }}>
        <span>{q}</span>
        <span style={{ fontFamily: MONO, fontSize: 14, color: '#444', marginLeft: 16, flexShrink: 0 }}>{open ? '−' : '+'}</span>
      </button>
      {open && <div style={{ paddingBottom: 14, fontFamily: SANS, fontSize: 14, color: '#666', lineHeight: 1.8 }}>{a}</div>}
    </div>
  );
}

function FaqContent({ isMobile }) {
  const pad = isMobile ? '32px 16px 60px' : '48px 32px 80px';
  const groups = [
    {
      label: 'SECURITY & SAFETY',
      items: [
        { q: 'Is KADO safe to use?', a: 'Yes. KADO is non-custodial — your funds never leave your Bybit account. We connect using trade-only API keys which cannot withdraw funds. All stored API keys are encrypted with AES-256 Fernet before being saved to the database. Passwords are hashed with bcrypt (cost factor 12). Connections use TLS 1.3. We do not share your data with third parties for commercial purposes.' },
        { q: 'Can KADO withdraw my funds?', a: 'No. KADO API keys are configured with trade-only permissions. Withdrawal permission is never required and you should never grant it to any API key connected to KADO. Even if our systems were fully compromised, an attacker could not withdraw your funds through KADO — the exchange rejects any withdrawal request from our API keys by design.' },
        { q: 'Should I enable 2FA on KADO?', a: 'Yes, strongly recommended. Go to Dashboard → Security → Enable 2FA. We support TOTP using any authenticator app: Google Authenticator, Authy, 1Password, Bitwarden. Scan the QR code, save your backup codes, and 2FA will be required on every login.' },
        { q: 'What API key permissions should I give KADO?', a: 'Only enable: Read Only (account info) and Unified Trading / Contract Trade (to place orders). Never enable Withdrawals. Wallet permission is not needed.' },
      ],
    },
    {
      label: 'TRADING & BOTS',
      items: [
        { q: 'How does the Signal Bot decide when to trade?', a: 'The Signal Bot monitors real-time crypto news and social media feeds. Each item is scored by an AI model on trading relevance, direction, and urgency. If the composite score exceeds the configured threshold, a trade is opened on the relevant altcoin perpetual with a strict stop-loss and take-profit.' },
        { q: 'What does the Grid Bot do?', a: 'The Grid Bot creates a ladder of limit buy and sell orders at fixed intervals around a price range. When market dips it buys; when it rises it sells. Each cycle captures a small spread. Works best in sideways markets.' },
        { q: 'How risky is the Listing Sniper?', a: 'High risk. The bot detects new token listings on Bybit within seconds and opens a small long (2% of balance) to capture the initial pump. TP is 20%, SL is 7%. Not all listings pump — position size is deliberately small.' },
        { q: 'What happens during a flash crash?', a: 'All KADO bots use stop-loss orders. In a flash crash, stop-losses may experience slippage. We recommend starting with lower leverage (3–5×) until you are comfortable with bot behavior under volatile conditions.' },
      ],
    },
    {
      label: 'ACCOUNTS & BILLING',
      items: [
        { q: 'What is the high-water mark policy?', a: 'You only pay performance fees when your account reaches a new equity peak. Example: HWM = $10,000. Balance reaches $11,200 → fee = 25% × $1,200 = $300. Next month balance drops to $10,800 → no fee. You never pay twice for the same profit.' },
        { q: 'Is there a free plan?', a: 'Yes. The Free plan allows you to connect Bybit and view signals. See the Pricing page for the full feature comparison. No credit card required to start.' },
        { q: 'What is the Referral Program?', a: 'Refer a friend via your unique link (Dashboard → Account → Referral). When they generate performance fees, you receive 5% of their fees for the lifetime of their subscription. Payouts monthly in USDT. No cap on earnings.' },
        { q: 'How do I delete my account?', a: 'Remove your API keys from Dashboard → API Keys, then email support@kadoclub.net requesting account deletion. All personal data removed within 30 days per GDPR.' },
      ],
    },
  ];

  return (
    <div style={{ padding: pad }}>
      <div style={{ marginBottom: 36 }}>
        <h1 style={{ fontFamily: SANS, fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.03em', color: '#e8e8e8', margin: '0 0 12px' }}>
          Frequently Asked Questions
        </h1>
        <p style={{ fontFamily: SANS, fontSize: 14, color: '#555', margin: 0, lineHeight: 1.7 }}>
          Security, trading strategy, billing, and account management.
        </p>
      </div>
      {groups.map(g => (
        <div key={g.label} style={{ marginTop: 36 }}>
          <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', color: '#333', marginBottom: 4, textTransform: 'uppercase' }}>
            {g.label}
          </div>
          <div style={{ borderTop: `1px solid ${LINE}` }}>
            {g.items.map(item => <FaqItem key={item.q} q={item.q} a={item.a} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function SupportContent({ isMobile }) {
  const pad = isMobile ? '32px 16px 60px' : '48px 32px 80px';
  const contacts = [
    { label: 'GENERAL SUPPORT', value: 'support@kadoclub.net', href: 'mailto:support@kadoclub.net', note: 'Response within 24h on business days' },
    { label: 'TELEGRAM BOT', value: '@KADO_c_BOT', href: 'https://t.me/KADO_c_BOT', note: 'Trade alerts and quick commands' },
    { label: 'COMMUNITY', value: '@kadoclub07', href: 'https://t.me/kadoclub07', note: 'Telegram community channel' },
    { label: 'PRIVACY / GDPR', value: 'privacy@kadoclub.net', href: 'mailto:privacy@kadoclub.net', note: 'Data rights and deletion requests' },
    { label: 'LEGAL', value: 'legal@kadoclub.net', href: 'mailto:legal@kadoclub.net', note: 'Terms, disputes, compliance' },
  ];

  return (
    <div style={{ padding: pad }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontFamily: SANS, fontSize: isMobile ? 26 : 34, fontWeight: 700, letterSpacing: '-0.03em', color: '#e8e8e8', margin: '0 0 12px' }}>
          Contact & Support
        </h1>
        <p style={{ fontFamily: SANS, fontSize: 14, color: '#555', margin: 0, lineHeight: 1.7 }}>
          We respond to all requests within 24 hours on business days.
        </p>
      </div>

      <div style={{ border: `1px solid ${LINE}` }}>
        {contacts.map((c, i) => (
          <a key={c.label} href={c.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : '180px 1fr 1fr',
              gap: isMobile ? 4 : 24,
              padding: isMobile ? '18px 16px' : '20px 24px',
              borderBottom: i < contacts.length - 1 ? `1px solid ${LINE}` : 'none',
              transition: 'background 120ms',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ fontFamily: MONO, fontSize: 9, color: '#333', letterSpacing: '0.12em', textTransform: 'uppercase', paddingTop: isMobile ? 0 : 2 }}>{c.label}</div>
              <div style={{ fontFamily: SANS, fontSize: 14, color: '#888' }}>{c.value}</div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: '#3a3a3a' }}>{c.note}</div>
            </div>
          </a>
        ))}
      </div>

      <div style={{ marginTop: 48, borderTop: `1px solid ${LINE}`, paddingTop: 32 }}>
        <div style={{ fontFamily: MONO, fontSize: 9, color: '#2a2a2a', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 16 }}>Legal documents</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          {[
            { label: 'Terms of Service', to: '/legal/terms' },
            { label: 'Privacy Policy', to: '/legal/privacy' },
            { label: 'Risk Disclosure', to: '/legal/risk-disclosure' },
          ].map(l => (
            <Link key={l.label} to={l.to} style={{
              fontFamily: SANS, fontSize: 13, color: '#555', textDecoration: 'none',
              border: `1px solid ${LINE}`, padding: '8px 16px',
              transition: 'color 150ms, border-color 150ms',
            }}
              onMouseEnter={e => { e.currentTarget.style.color = '#bbb'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#555'; e.currentTarget.style.borderColor = LINE; }}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DocsPage() {
  usePageTitle('Documents', 'Legal agreements, privacy policy, risk disclosure and company documents for KADO users.');
  const [searchParams] = useSearchParams();
  const initialSection = searchParams.get('section') || 'overview';
  const VALID = ['overview', 'faq', 'support'];
  const [active, setActive] = useState(VALID.includes(initialSection) ? initialSection : 'overview');
  const isMobile = useIsMobile();

  useEffect(() => {
    const s = searchParams.get('section');
    if (s && VALID.includes(s)) setActive(s);
  }, [searchParams]);

  function handleNav(id) {
    setActive(id);
    window.scrollTo(0, 0);
  }

  function renderSection() {
    switch (active) {
      case 'overview': return <OverviewContent isMobile={isMobile} />;
      case 'faq':      return <FaqContent isMobile={isMobile} />;
      case 'support':  return <SupportContent isMobile={isMobile} />;
      default: return null;
    }
  }

  return (
    <div style={{ background: '#060606', color: '#f5f5f5', fontFamily: SANS, minHeight: '100vh' }}>
      <LandingHeader />

      <style>{`.j-docsnav { overflow-x: auto; scrollbar-width: none; } .j-docsnav::-webkit-scrollbar { display: none; }`}</style>

      <div style={{ borderBottom: `1px solid ${LINE}` }}>
        <div className="j-docsnav" style={{ padding: '0 32px', display: 'flex', alignItems: 'stretch' }}>
          {SECTIONS.map(s => {
            const on = active === s.id;
            return (
              <button key={s.id} onClick={() => handleNav(s.id)}
                style={{
                  fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                  padding: '13px 16px', background: 'none', border: 'none',
                  borderBottom: on ? '2px solid #fff' : '2px solid transparent',
                  color: on ? '#fff' : '#444', cursor: 'pointer',
                  transition: 'color 150ms, border-color 150ms', whiteSpace: 'nowrap', marginBottom: '-1px',
                }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.color = '#aaa'; }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.color = '#444'; }}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', minHeight: 'calc(100vh - 200px)' }}>
        {renderSection()}
      </div>

      <LandingFooter />
    </div>
  );
}
