import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import { usePageTitle } from '@/lib/usePageTitle';
import { useIsMobile } from '@/lib/useIsMobile';

const MONO = "'Courier New','SF Mono',monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',sans-serif";
const LINE = 'rgba(255,255,255,0.07)';

const SECTIONS = [
  { id: 'getting-started', label: 'GETTING STARTED' },
  { id: 'api-keys',        label: 'API KEYS' },
  { id: 'strategies',      label: 'STRATEGIES' },
  { id: 'dashboard',       label: 'DASHBOARD' },
  { id: 'faq',             label: 'FAQ' },
  { id: 'support',         label: 'SUPPORT' },
];

/* ─── Typography helpers ─── */

function H2({ children }) {
  return <h2 style={{ fontFamily: SANS, fontSize: 22, fontWeight: 700, letterSpacing: '-0.025em', margin: '0 0 16px', color: '#e8e8e8' }}>{children}</h2>;
}
function H3({ children }) {
  return <h3 style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#555', margin: '32px 0 14px', fontWeight: 400 }}>{children}</h3>;
}
function P({ children }) {
  return <p style={{ fontFamily: SANS, fontSize: 14, color: '#666', lineHeight: 1.85, margin: '0 0 14px' }}>{children}</p>;
}
function Step({ n, children }) {
  return (
    <div style={{ display: 'flex', gap: 20, marginBottom: 12, borderBottom: `1px solid ${LINE}`, paddingBottom: 12 }}>
      <span style={{ fontFamily: MONO, fontSize: 10, color: '#333', minWidth: 22, flexShrink: 0, paddingTop: 2, letterSpacing: '0.05em' }}>
        {String(n).padStart(2, '0')}
      </span>
      <div style={{ fontFamily: SANS, fontSize: 14, color: '#777', lineHeight: 1.8 }}>{children}</div>
    </div>
  );
}
function Code({ children }) {
  return <code style={{ fontFamily: MONO, fontSize: 11, background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: 3, color: '#bbb', border: `1px solid ${LINE}` }}>{children}</code>;
}
function Callout({ type, children }) {
  return (
    <div style={{ borderLeft: `2px solid ${type === 'warn' ? 'rgba(255,255,255,0.2)' : LINE}`, padding: '10px 16px', margin: '0 0 20px' }}>
      <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.18em', color: '#444', marginBottom: 6 }}>
        {type === 'warn' ? 'WARNING' : 'NOTE'}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 13, color: '#666', lineHeight: 1.75 }}>{children}</div>
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

/* ─── Section contents ─── */

function GettingStartedContent({ isMobile }) {
  const pad = isMobile ? '24px 16px 40px' : '40px 32px 60px';
  return (
    <div style={{ padding: pad }}>
      <H2>Getting Started</H2>
      <P>KADO connects to your Bybit account via API keys and automates trading on your behalf. Your funds stay on Bybit at all times — we never take custody.</P>
      <H3>Quick setup — 5 minutes</H3>
      <Step n={1}><strong style={{ color: '#ccc' }}>Create your account</strong> at <Link to="/auth" style={{ color: '#888', textDecoration: 'underline', textUnderlineOffset: 3 }}>kadoclub.net/auth</Link> and verify your email.</Step>
      <Step n={2}><strong style={{ color: '#ccc' }}>Generate Bybit API keys</strong> — Enable <em>Contract Trade</em> only. Never enable withdrawals.</Step>
      <Step n={3}><strong style={{ color: '#ccc' }}>Add your keys</strong> in the API Keys tab of your dashboard.</Step>
      <Step n={4}><strong style={{ color: '#ccc' }}>Choose a strategy</strong> in the Settings tab — Grid, Signal, Funding Rate, or Listing Sniper.</Step>
      <Step n={5}>The bot starts automatically. Monitor open positions in the Overview tab.</Step>
      <Callout>Recommended starting balance: $100–$500 USDT. The bot sizes positions as a percentage of your free balance.</Callout>
    </div>
  );
}

function ApiKeysContent({ isMobile }) {
  const pad = isMobile ? '24px 16px 40px' : '40px 32px 60px';
  return (
    <div style={{ padding: pad }}>
      <H2>Bybit API Keys</H2>
      <P>API keys let KADO place orders on your Bybit account without ever accessing your funds. This is the most important setup step.</P>
      <Callout type="warn">Never enable <strong style={{ color: '#bbb' }}>Withdrawal</strong> permission. KADO only needs Contract Trade rights.</Callout>
      <H3>Step-by-step</H3>
      <Step n={1}>Log in to <strong style={{ color: '#ccc' }}>bybit.com</strong> → <strong style={{ color: '#ccc' }}>Account → API Management</strong>.</Step>
      <Step n={2}>Click <strong style={{ color: '#ccc' }}>Create New Key</strong>. Choose <em>System-generated API Keys</em>.</Step>
      <Step n={3}>
        Name it <Code>KADO Bot</Code> and set permissions:
        <ul style={{ marginTop: 10, paddingLeft: 18, lineHeight: 2.2, color: '#666', fontSize: 14, fontFamily: SANS }}>
          <li>Read Only — <strong style={{ color: '#aaa' }}>enable</strong></li>
          <li>Unified Trading (Contract Trade) — <strong style={{ color: '#aaa' }}>enable</strong></li>
          <li>Wallet / Withdraw — <strong style={{ color: '#444' }}>do not enable</strong></li>
        </ul>
      </Step>
      <Step n={4}>Leave IP Restriction blank.</Step>
      <Step n={5}>Copy <strong style={{ color: '#ccc' }}>API Key</strong> and <strong style={{ color: '#ccc' }}>Secret Key</strong> — secret shown only once.</Step>
      <Step n={6}>Paste both in your KADO dashboard → API Keys tab → Save.</Step>
      <H3>Demo mode</H3>
      <P>Bybit offers a Demo account with paper money. Toggle Demo mode in KADO settings. We recommend 48h demo before going live.</P>
    </div>
  );
}

function StrategiesContent({ isMobile }) {
  const pad = isMobile ? '24px 16px 40px' : '40px 32px 60px';
  const rows = [
    { name: 'Signal Bot',       risk: 'MEDIUM–HIGH', desc: 'Monitors crypto news in real time. AI scores each item for relevance and triggers trades on altcoin perpetuals.' },
    { name: 'Grid Bot',         risk: 'LOW–MEDIUM',  desc: 'Places buy/sell order ladder around a range. Profits from oscillations. Best in sideways markets.' },
    { name: 'Funding Rate Bot', risk: 'MEDIUM',       desc: 'Fades extreme funding rates on perpetuals for mean-reversion entries.' },
    { name: 'Listing Sniper',   risk: 'HIGH',         desc: 'Opens a position on new Bybit listings within seconds. 2% size, 20% TP, 7% SL.' },
    { name: 'DEX Sniper (BSC)', risk: 'VERY HIGH',    desc: 'Snipes new PancakeSwap pairs with on-chain safety checks. Auto-sells at target.' },
  ];
  return (
    <div style={{ padding: pad }}>
      <H2>Strategies</H2>
      <P>Five distinct strategies, each independently configurable in your Settings tab.</P>
      <div style={{ marginTop: 24 }}>
        {rows.map((r, i) => (
          <div key={r.name} style={{ display: 'flex', gap: isMobile ? 12 : 32, padding: '18px 0', borderBottom: `1px solid ${LINE}`, alignItems: 'flex-start' }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: '#333', minWidth: isMobile ? 22 : 28, letterSpacing: '0.05em', paddingTop: 3 }}>{String(i + 1).padStart(2, '0')}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: SANS, fontSize: 15, fontWeight: 600, color: '#d0d0d0' }}>{r.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 8, color: '#444', letterSpacing: '0.1em' }}>{r.risk}</span>
              </div>
              <p style={{ fontFamily: SANS, fontSize: 13, color: '#666', lineHeight: 1.8, margin: 0 }}>{r.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardContent({ isMobile }) {
  const pad = isMobile ? '24px 16px 40px' : '40px 32px 60px';
  const tabs = [
    { name: 'OVERVIEW',  desc: 'Live balance, unrealized PnL, open positions from Bybit, recent trade history (WIN / LOSS / BE).' },
    { name: 'API KEYS',  desc: 'Add, update, or remove Bybit credentials. Toggle Demo ↔ Live. Keys encrypted with AES-256.' },
    { name: 'SETTINGS',  desc: 'Enable bots, set leverage, TP %, SL %, and position size as % of free balance.' },
    { name: 'ACCOUNT',   desc: 'Update email, username, password. Delete account — all data removed within 30 days (GDPR).' },
    { name: 'SECURITY',  desc: 'Enable TOTP 2FA with any authenticator (Google Authenticator, Authy). Strongly recommended.' },
  ];
  return (
    <div style={{ padding: pad }}>
      <H2>Dashboard</H2>
      <P>Five tabs control different aspects of your trading setup.</P>
      <div style={{ marginTop: 24 }}>
        {tabs.map(tab => (
          <div key={tab.name} style={{ display: 'flex', gap: isMobile ? 12 : 32, padding: '18px 0', borderBottom: `1px solid ${LINE}` }}>
            <div style={{ fontFamily: MONO, fontSize: 9, color: '#444', minWidth: isMobile ? 80 : 100, letterSpacing: '0.1em', paddingTop: 2, flexShrink: 0 }}>{tab.name}</div>
            <div style={{ fontFamily: SANS, fontSize: 13, color: '#666', lineHeight: 1.8 }}>{tab.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FaqContent({ isMobile }) {
  const pad = isMobile ? '24px 16px 40px' : '40px 32px 60px';
  return (
    <div style={{ padding: pad }}>
      <H2>FAQ</H2>
      <div style={{ marginTop: 8 }}>
        <FaqItem q="Is KADO safe to use?" a="Your funds remain on Bybit at all times. KADO connects using trade-only API keys — withdrawal permissions are never requested. AES-256 encryption for stored keys, bcrypt for passwords." />
        <FaqItem q="How much can I earn?" a="Returns depend entirely on market conditions. Past performance does not guarantee future results. Always trade only funds you can afford to lose." />
        <FaqItem q="What happens if the bot makes a losing trade?" a="Every trade has a stop-loss. The position closes automatically. Maximum loss per trade is capped (default: 3% of margin for altcoins). Adjustable in Settings." />
        <FaqItem q="Where are my funds?" a="Always on your Bybit account. KADO cannot move or withdraw funds — our API keys do not have withdrawal permission." />
        <FaqItem q="How do I pause the bot?" a="Dashboard → Settings → toggle bot off. Open positions are not closed automatically — they run until their existing TP/SL levels." />
        <FaqItem q="What is the minimum balance?" a="Technically $1, but we recommend at least $100 USDT. Below $50 fixed fees eat into returns significantly." />
        <FaqItem q="Does KADO work with other exchanges?" a="Currently Bybit only (USDT Perpetuals, Unified account). More exchanges are on the roadmap." />
        <FaqItem q="What is the Performance plan fee?" a="25% of net new profits monthly under a high-water-mark policy. No fee in losing months. Settled in USDT." />
        <FaqItem q="How do I get Telegram signals?" a="Connect Telegram in Settings. @KADO_c_BOT sends a notification for every trade: open, update, close." />
        <FaqItem q="Can I use a Demo account?" a="Yes. Add Bybit Demo API keys and toggle Demo mode in the API Keys tab. Paper money only." />
      </div>
    </div>
  );
}

function SupportContent({ isMobile }) {
  const pad = isMobile ? '24px 16px 40px' : '40px 32px 60px';
  const contacts = [
    { label: 'EMAIL', value: 'support@kadoclub.net', href: 'mailto:support@kadoclub.net' },
    { label: 'TELEGRAM', value: '@KADO_c_BOT', href: 'https://t.me/KADO_c_BOT' },
    { label: 'PRIVACY / GDPR', value: 'privacy@kadoclub.net', href: 'mailto:privacy@kadoclub.net' },
  ];
  return (
    <div style={{ padding: pad }}>
      <H2>Support</H2>
      <P>We respond to all requests within 24 hours on business days.</P>
      <div style={{ marginTop: 24 }}>
        {contacts.map(c => (
          <a key={c.label} href={c.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <div style={{ display: 'flex', gap: isMobile ? 12 : 32, padding: '16px 0', borderBottom: `1px solid ${LINE}`, transition: 'opacity 150ms' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}
            >
              <div style={{ fontFamily: MONO, fontSize: 9, color: '#444', minWidth: isMobile ? 90 : 120, letterSpacing: '0.12em', paddingTop: 2, flexShrink: 0 }}>{c.label}</div>
              <div style={{ fontFamily: SANS, fontSize: 14, color: '#888' }}>{c.value}</div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

/* ─── Main ─── */

export default function DocsPage() {
  usePageTitle('Documentation', 'Step-by-step guides for connecting Bybit API, choosing trading strategies, and getting the most out of KADO.');
  const [active, setActive] = useState('getting-started');
  const isMobile = useIsMobile();

  function handleNav(id) {
    setActive(id);
    window.scrollTo(0, 0);
  }

  function renderSection() {
    switch (active) {
      case 'getting-started': return <GettingStartedContent isMobile={isMobile} />;
      case 'api-keys':        return <ApiKeysContent isMobile={isMobile} />;
      case 'strategies':      return <StrategiesContent isMobile={isMobile} />;
      case 'dashboard':       return <DashboardContent isMobile={isMobile} />;
      case 'faq':             return <FaqContent isMobile={isMobile} />;
      case 'support':         return <SupportContent isMobile={isMobile} />;
      default: return null;
    }
  }

  return (
    <div style={{ background: '#060606', color: '#f5f5f5', fontFamily: SANS, minHeight: '100vh' }}>
      <LandingHeader />

      <style>{`.j-docsnav { overflow-x: auto; scrollbar-width: none; } .j-docsnav::-webkit-scrollbar { display: none; }`}</style>

      {/* Tab nav — identical structure to NewsPage */}
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

      {/* Content */}
      <div style={{ minHeight: 'calc(100vh - 200px)' }}>
        {renderSection()}
      </div>

      <LandingFooter />
    </div>
  );
}
