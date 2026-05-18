import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import { usePageTitle } from '@/lib/usePageTitle';
import { useIsMobile } from '@/lib/useIsMobile';

const FONT = "'Inter','SF Pro Display','Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif";
const MONO = "'JetBrains Mono','SF Mono','Courier New',monospace";

const SECTIONS = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'api-keys',        label: 'API Keys' },
  { id: 'strategies',      label: 'Strategies' },
  { id: 'dashboard',       label: 'Dashboard' },
  { id: 'faq',             label: 'FAQ' },
  { id: 'support',         label: 'Support' },
];

function H2({ children }) {
  return (
    <h2 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', margin: '0 0 18px', color: '#f0f0f0' }}>
      {children}
    </h2>
  );
}

function H3({ children }) {
  return (
    <h3 style={{ fontFamily: FONT, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', margin: '28px 0 10px', color: '#d8d8d8' }}>
      {children}
    </h3>
  );
}

function P({ children }) {
  return (
    <p style={{ fontFamily: FONT, fontSize: 14, color: '#777', lineHeight: 1.85, margin: '0 0 14px' }}>
      {children}
    </p>
  );
}

function Step({ n, children }) {
  return (
    <div style={{ display: 'flex', gap: 20, marginBottom: 14, alignItems: 'flex-start' }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: '#333', minWidth: 20, flexShrink: 0, paddingTop: 3, letterSpacing: '0.05em' }}>
        {String(n).padStart(2, '0')}
      </span>
      <div style={{ fontFamily: FONT, fontSize: 14, color: '#777', lineHeight: 1.8 }}>{children}</div>
    </div>
  );
}

function Code({ children }) {
  return (
    <code style={{
      fontFamily: MONO, fontSize: 11, background: 'rgba(255,255,255,0.06)',
      padding: '2px 7px', borderRadius: 4, color: '#c8c8c8',
      border: '1px solid rgba(255,255,255,0.06)',
    }}>{children}</code>
  );
}

function Callout({ type, children }) {
  const isWarn = type === 'warn';
  return (
    <div style={{
      borderLeft: `2px solid ${isWarn ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)'}`,
      padding: '12px 18px', margin: '0 0 18px',
      background: isWarn ? 'rgba(255,255,255,0.02)' : 'transparent',
      borderRadius: '0 4px 4px 0',
    }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', color: '#444', marginBottom: 6, textTransform: 'uppercase' }}>
        {isWarn ? 'Warning' : 'Note'}
      </div>
      <div style={{ fontFamily: FONT, fontSize: 13, color: '#666', lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '32px 0' }} />;
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 0', background: 'none', border: 'none', cursor: 'pointer',
          fontFamily: FONT, fontSize: 14, fontWeight: 500, color: '#c0c0c0', textAlign: 'left',
        }}
      >
        <span>{q}</span>
        <span style={{ fontSize: 18, color: '#444', marginLeft: 16, flexShrink: 0, fontWeight: 300 }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{ paddingBottom: 18, fontFamily: FONT, fontSize: 14, color: '#666', lineHeight: 1.8 }}>
          {a}
        </div>
      )}
    </div>
  );
}

/* ─── Section contents ─── */

function GettingStartedContent() {
  return (
    <>
      <H2>Getting Started</H2>
      <P>KADO connects to your Bybit account via API keys and automates trading on your behalf. Your funds stay on Bybit at all times — we never take custody.</P>

      <H3>Quick setup (5 minutes)</H3>
      <Step n={1}>
        <strong style={{ color: '#c0c0c0' }}>Create your account</strong> at{' '}
        <Link to="/auth" style={{ color: '#888', textDecoration: 'underline', textUnderlineOffset: 3 }}>kadoclub.net/auth</Link>{' '}
        and verify your email.
      </Step>
      <Step n={2}>
        <strong style={{ color: '#c0c0c0' }}>Generate Bybit API keys</strong> — Enable <em>Contract Trade</em> only. Never enable withdrawals.
      </Step>
      <Step n={3}>
        <strong style={{ color: '#c0c0c0' }}>Add your keys</strong> in the <em>API Keys</em> tab of your dashboard.
      </Step>
      <Step n={4}>
        <strong style={{ color: '#c0c0c0' }}>Choose a strategy</strong> in the <em>Settings</em> tab — Grid, Signal, Funding Rate, or Listing Sniper.
      </Step>
      <Step n={5}>
        The bot starts automatically. Monitor your open positions in the <em>Overview</em> tab.
      </Step>

      <Callout>Recommended starting balance: $100–$500 USDT. The bot sizes positions as a percentage of your free balance.</Callout>
    </>
  );
}

function ApiKeysContent() {
  return (
    <>
      <H2>Bybit API Keys</H2>
      <P>API keys let KADO place orders on your Bybit account without ever accessing your funds. This is the most important setup step.</P>

      <Callout type="warn">Never enable <strong style={{ color: '#c0c0c0' }}>Withdrawal</strong> permission. KADO only needs Contract Trade rights. If an app ever asks for withdrawal permissions, do not use it.</Callout>

      <H3>Step-by-step: creating API keys on Bybit</H3>
      <Step n={1}>Log in to <strong style={{ color: '#c0c0c0' }}>bybit.com</strong> and go to <strong style={{ color: '#c0c0c0' }}>Account → API Management</strong>.</Step>
      <Step n={2}>Click <strong style={{ color: '#c0c0c0' }}>Create New Key</strong>. Choose <em>System-generated API Keys</em>.</Step>
      <Step n={3}>
        Set a name (e.g. <Code>KADO Bot</Code>) and configure permissions:
        <ul style={{ marginTop: 10, paddingLeft: 20, lineHeight: 2.2, color: '#666', fontSize: 14, fontFamily: FONT }}>
          <li>Read Only — <strong style={{ color: '#aaa' }}>enable</strong></li>
          <li>Unified Trading (Contract Trade) — <strong style={{ color: '#aaa' }}>enable</strong></li>
          <li>Wallet — <strong style={{ color: '#555' }}>do not enable</strong></li>
          <li>Withdraw — <strong style={{ color: '#555' }}>do not enable</strong></li>
        </ul>
      </Step>
      <Step n={4}>Leave <strong style={{ color: '#c0c0c0' }}>IP Restriction</strong> blank (or add our VPS IP for extra security).</Step>
      <Step n={5}>Copy both the <strong style={{ color: '#c0c0c0' }}>API Key</strong> and <strong style={{ color: '#c0c0c0' }}>Secret Key</strong>. The secret is shown only once.</Step>
      <Step n={6}>Paste both into the <strong style={{ color: '#c0c0c0' }}>API Keys</strong> tab in your KADO dashboard and click <em>Save</em>.</Step>

      <Divider />

      <H3>Demo vs Live trading</H3>
      <P>Bybit offers a Demo account with paper money. Toggle <em>Demo mode</em> on in KADO settings to practice without real funds. We recommend testing for at least 48 hours on demo before enabling live trading.</P>
    </>
  );
}

function StrategiesContent() {
  const strategies = [
    {
      name: 'Signal Bot',
      risk: 'Medium–High',
      desc: 'Monitors crypto news and social feeds in real time. An AI model (Claude Haiku) scores each news item for trading relevance, direction, and urgency. High-scoring events trigger trades on altcoin perpetual futures.',
      best: 'Active altcoin trading. Stop-loss is always set.',
    },
    {
      name: 'Grid Bot',
      risk: 'Low–Medium',
      desc: 'Places a ladder of buy and sell orders around a price range. Profits from price oscillations in sideways markets — it buys dips and sells rips automatically.',
      best: 'BTC/ETH in range-bound markets. Can lose in strong trends.',
    },
    {
      name: 'Funding Rate Bot',
      risk: 'Medium',
      desc: 'Perpetual futures have an 8-hour funding rate. When funding becomes extremely positive or negative, the bot fades these extremes for mean-reversion trades.',
      best: 'Experienced users who understand funding mechanics.',
    },
    {
      name: 'Listing Sniper',
      risk: 'High',
      desc: 'Detects new token listings on Bybit within seconds and opens a position anticipating the listing pump. Positions are small (2% of balance) with a wide TP (20%) and 7% SL.',
      best: 'High-risk/reward speculation. New listings are volatile.',
    },
    {
      name: 'DEX Sniper (BSC)',
      risk: 'Very High',
      desc: 'Monitors Binance Smart Chain for new PancakeSwap liquidity pairs. Snipes new tokens with on-chain safety checks (LP lock, tax analysis, deployer history).',
      best: 'Users familiar with DeFi risk. Memecoins frequently go to zero.',
    },
  ];

  return (
    <>
      <H2>Strategies</H2>
      <P>KADO supports five distinct trading strategies. Each can be individually enabled in your dashboard Settings tab.</P>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, overflow: 'hidden', marginTop: 24 }}>
        {strategies.map(s => (
          <div key={s.name} style={{ background: 'rgba(5,5,5,0.96)', padding: '24px 28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10, gap: 16 }}>
              <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 600, color: '#d8d8d8', letterSpacing: '-0.01em' }}>{s.name}</div>
              <div style={{ fontFamily: MONO, fontSize: 9, color: '#444', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 100, padding: '3px 10px', flexShrink: 0, letterSpacing: '0.06em' }}>
                RISK: {s.risk.toUpperCase()}
              </div>
            </div>
            <div style={{ fontFamily: FONT, fontSize: 13, color: '#666', lineHeight: 1.8, marginBottom: 8 }}>{s.desc}</div>
            <div style={{ fontFamily: FONT, fontSize: 12, color: '#4a4a4a', lineHeight: 1.6 }}>
              <strong style={{ color: '#555' }}>Best for:</strong> {s.best}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function DashboardContent() {
  const tabs = [
    { name: 'Overview', desc: 'Live account balance, unrealized PnL, open positions from Bybit, and recent trade history with results (WIN / LOSS / BE).' },
    { name: 'API Keys', desc: 'Add, update, or remove your Bybit API credentials. Toggle between Demo and Live mode. Keys are encrypted with AES-256 before storage.' },
    { name: 'Settings', desc: 'Choose which bots are active and configure risk parameters: leverage, take-profit %, stop-loss %, and position size as a % of free balance.' },
    { name: 'Account', desc: 'Update your email, username, or password. Delete your account here — all data removed within 30 days per GDPR.' },
    { name: 'Security', desc: 'Enable Two-Factor Authentication (TOTP) using any authenticator app (Google Authenticator, Authy). Strongly recommended for live trading accounts.' },
  ];

  return (
    <>
      <H2>Dashboard</H2>
      <P>Your KADO dashboard has five tabs. Each controls a different aspect of your trading setup.</P>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, overflow: 'hidden', marginTop: 24 }}>
        {tabs.map(tab => (
          <div key={tab.name} style={{ background: 'rgba(5,5,5,0.96)', padding: '22px 24px' }}>
            <div style={{ fontFamily: MONO, fontSize: 10, color: '#555', letterSpacing: '0.1em', marginBottom: 10, textTransform: 'uppercase' }}>{tab.name}</div>
            <div style={{ fontFamily: FONT, fontSize: 13, color: '#666', lineHeight: 1.8 }}>{tab.desc}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function FaqContent() {
  return (
    <>
      <H2>FAQ</H2>
      <div style={{ marginTop: 8 }}>
        <FaqItem q="Is KADO safe to use?" a="Your funds remain on Bybit at all times. KADO connects using trade-only API keys — withdrawal permissions are never requested. We use AES-256 encryption for stored keys and bcrypt for passwords. We do not take custody of any assets." />
        <FaqItem q="How much can I earn?" a="Returns depend entirely on market conditions. Past performance does not guarantee future results. Automated bots can win and lose. Always trade only funds you can afford to lose." />
        <FaqItem q="What happens if the bot makes a losing trade?" a="Every trade has a stop-loss. If the market moves against you beyond the SL threshold, the position is closed automatically. The maximum loss per trade is capped (default: 3% of margin for altcoins). You can adjust SL levels in Settings." />
        <FaqItem q="Where are my funds?" a="Always on your Bybit account. KADO cannot move or withdraw funds — our API keys do not have that permission. If you remove your API keys, KADO immediately loses access to your account." />
        <FaqItem q="How do I pause the bot?" a="Go to your dashboard → Settings → toggle the bot off. Open positions are not automatically closed when you pause — they will be managed by their existing TP/SL levels." />
        <FaqItem q="What is the minimum balance?" a="Technically $1, but we recommend at least $100 USDT for the position sizing to make economic sense. Below $50 the fixed fees can eat into returns significantly." />
        <FaqItem q="Does KADO work with exchanges other than Bybit?" a="Currently only Bybit (USDT Perpetuals on the Unified account). Support for additional exchanges is on the roadmap." />
        <FaqItem q="What is the Performance plan fee?" a="On the Performance plan, KADO charges 25% of net new profits monthly under a high-water-mark policy. No fee in losing months. Settled in USDT." />
        <FaqItem q="How do I get signals in Telegram?" a="Connect your Telegram in the Settings tab. KADO's bot (@KADO_c_BOT) will send you a notification for every trade: open, update, and close." />
        <FaqItem q="Can I use KADO on a Demo account?" a="Yes. Add your Bybit Demo API keys and toggle Demo mode in the API Keys tab. Demo trades use paper money and do not affect your real balance." />
      </div>
    </>
  );
}

function SupportContent() {
  return (
    <>
      <H2>Support</H2>
      <P>We aim to respond to all requests within 24 hours on business days.</P>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 8, overflow: 'hidden', marginTop: 24 }}>
        {[
          { label: 'Email', value: 'support@kadoclub.net', href: 'mailto:support@kadoclub.net' },
          { label: 'Telegram Bot', value: '@KADO_c_BOT', href: 'https://t.me/KADO_c_BOT' },
          { label: 'Privacy / GDPR', value: 'privacy@kadoclub.net', href: 'mailto:privacy@kadoclub.net' },
        ].map(item => (
          <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
            <div
              style={{ background: 'rgba(5,5,5,0.96)', padding: '22px 24px', transition: 'background 150ms' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(18,18,18,1)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(5,5,5,0.96)'; }}
            >
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.15em', color: '#444', marginBottom: 8, textTransform: 'uppercase' }}>{item.label}</div>
              <div style={{ fontFamily: FONT, fontSize: 14, color: '#888' }}>{item.value}</div>
            </div>
          </a>
        ))}
      </div>
    </>
  );
}

/* ─── Main component ─── */

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
      case 'getting-started': return <GettingStartedContent />;
      case 'api-keys':        return <ApiKeysContent />;
      case 'strategies':      return <StrategiesContent />;
      case 'dashboard':       return <DashboardContent />;
      case 'faq':             return <FaqContent />;
      case 'support':         return <SupportContent />;
      default: return null;
    }
  }

  return (
    <div style={{ background: '#060606', color: '#f0f0f0', fontFamily: FONT, minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <LandingHeader />

      {/* Top nav bar */}
      <div style={{
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        background: '#060606',
        position: 'sticky', top: 0, zIndex: 50,
        paddingTop: isMobile ? 68 : 72,
      }}>
        <div style={{
          maxWidth: 900, margin: '0 auto',
          padding: isMobile ? '0 20px' : '0 40px',
          display: 'flex', gap: isMobile ? 0 : 2,
          overflowX: 'auto',
        }}>
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => handleNav(s.id)}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: FONT, fontSize: isMobile ? 13 : 14,
                color: active === s.id ? '#f0f0f0' : '#444',
                fontWeight: active === s.id ? 500 : 400,
                padding: isMobile ? '14px 14px' : '16px 20px',
                borderBottom: `2px solid ${active === s.id ? '#f0f0f0' : 'transparent'}`,
                transition: 'color 150ms, border-color 150ms',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.01em',
                marginBottom: -1,
              }}
              onMouseEnter={e => { if (active !== s.id) e.currentTarget.style.color = '#888'; }}
              onMouseLeave={e => { if (active !== s.id) e.currentTarget.style.color = '#444'; }}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, maxWidth: 900, margin: '0 auto', width: '100%', padding: isMobile ? '40px 20px 80px' : '56px 40px 100px' }}>
        {renderSection()}
      </div>

      <LandingFooter />
    </div>
  );
}
