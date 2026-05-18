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
  const MONO_LOCAL = "'Courier New','SF Mono',monospace";
  const groups = [
    {
      label: 'SECURITY & SAFETY',
      items: [
        { q: 'Is KADO safe to use?', a: 'Yes. KADO is non-custodial — your funds never leave your Bybit account. We connect using trade-only API keys which cannot withdraw funds. All stored API keys are encrypted with AES-256 Fernet before being saved to the database. Passwords are hashed with bcrypt (cost factor 12). Connections use TLS 1.3. We do not share your data with third parties for commercial purposes.' },
        { q: 'Can KADO withdraw my funds?', a: 'No. KADO API keys are configured with trade-only permissions. Withdrawal permission is never required and you should never grant it to any API key connected to KADO. Even if our systems were fully compromised, an attacker could not withdraw your funds through KADO — the exchange rejects any withdrawal request from our API keys by design.' },
        { q: 'What if someone hacks KADO\'s servers?', a: 'API keys are stored encrypted — an attacker who accessed our database would only see AES-256 ciphertext, not your actual keys. Even with decrypted keys, withdrawal is impossible. We recommend enabling IP restriction on your Bybit API key (whitelist our VPS IP) and setting up 2FA on your Bybit account for maximum protection.' },
        { q: 'Should I enable 2FA on KADO?', a: 'Yes, strongly recommended. Go to Dashboard → Security → Enable 2FA. We support TOTP (Time-based One-Time Password) using any authenticator app: Google Authenticator, Authy, 1Password, Bitwarden, etc. Scan the QR code, save your backup codes, and 2FA will be required on every login.' },
        { q: 'What API key permissions should I give KADO?', a: 'Only enable: Read Only (account info) and Unified Trading / Contract Trade (to place orders). Never enable Withdrawals. Wallet permission is not needed. For extra security, enable IP restriction on the Bybit API key and whitelist our VPS IP address.' },
      ],
    },
    {
      label: 'TRADING & BOTS',
      items: [
        { q: 'How does the Signal Bot decide when to trade?', a: 'The Signal Bot monitors real-time crypto news and social media feeds. Each item is scored by an AI model (Claude Haiku) on three dimensions: trading relevance (0–10), direction (bullish/bearish), and urgency (0–10). A composite score is calculated. If it exceeds the configured threshold (default: 13/20), a trade is opened on the relevant altcoin perpetual. The bot uses a strict stop-loss and takes profit as soon as the signal target is hit.' },
        { q: 'What does the Grid Bot do exactly?', a: 'The Grid Bot creates a ladder of limit buy and sell orders at fixed intervals above and below a central price. When the market dips, it buys. When the market rises back up, it sells. Each buy-sell cycle captures a small spread. In sideways or ranging markets this generates consistent small profits. In strong trending markets the bot can suffer losses as price moves outside the grid range.' },
        { q: 'What is the Funding Rate Bot?', a: 'Perpetual futures contracts charge a funding fee every 8 hours between long and short holders to keep price anchored to spot. When funding rates become extremely positive (longs pay shorts), it means the market is overcrowded on the long side and a correction is likely. The bot fades these extremes: it shorts when funding is too positive and longs when it is too negative, targeting a mean-reversion move.' },
        { q: 'How risky is the Listing Sniper?', a: 'High risk. The bot detects new token listings on Bybit within seconds of the announcement and opens a small long position (2% of balance) to capture the initial pump. However, not all listings pump — some dump immediately or have very low liquidity. Position size is deliberately small. TP is 20%, SL is 7%. The bot uses very tight time exits (position closes within minutes if TP/SL is not hit) to avoid getting stuck in illiquid markets.' },
        { q: 'What happens during a flash crash?', a: 'All KADO bots use stop-loss orders. In a flash crash, stop-loss orders may experience slippage — executing at a worse price than set. For leveraged positions (Grid, Signal), this could mean a larger-than-expected loss. KADO does not use strategies without stops. We recommend starting with lower leverage (3–5×) until you are comfortable with bot behavior under volatile conditions.' },
        { q: 'Can I run multiple bots simultaneously?', a: 'Yes. The Signal Bot, Grid Bot, Funding Rate Bot, Listing Sniper, and DEX Sniper can all run at the same time. Each manages its own position size as a percentage of your free USDT balance. If multiple bots trigger simultaneously, they each take their configured allocation — make sure your total allocation across all bots does not exceed 100% of your available balance.' },
        { q: 'What leverage do the bots use?', a: 'Configurable in Settings. Defaults: Signal Bot 5×, Grid Bot 3×, Funding Rate Bot 5×, Listing Sniper 3×. We recommend starting at default or lower. Higher leverage means larger profits AND larger losses — a 10× leveraged position can be liquidated by a 10% adverse move. The DEX Sniper does not use leverage (it trades on-chain in spot BNB/token pairs).' },
      ],
    },
    {
      label: 'ACCOUNTS & BILLING',
      items: [
        { q: 'What is the high-water mark policy?', a: 'The high-water mark (HWM) means you only pay performance fees when your account reaches a new equity peak. Example: your balance starts at $1,000. The bot earns $200 → new HWM = $1,200. Fee = 25% × $200 = $50. Next month the balance drops to $1,100. No fee. Month after, balance rises to $1,350. Fee = 25% × ($1,350 − $1,200) = $37.50. You never pay twice for the same profit.' },
        { q: 'What if I withdraw from Bybit while using KADO?', a: 'If you withdraw funds from Bybit, your balance decreases. KADO detects the reduced balance and adjusts position sizing accordingly. Withdrawal does not reset the high-water mark — the HWM remains at the previous equity peak. If your balance is now lower than the HWM, no fees are charged until your balance returns above the previous peak and then continues rising.' },
        { q: 'Is there a free plan?', a: 'Yes. The Free plan allows you to connect Bybit and use the Signal Bot with limited features. See the Pricing page for the current feature comparison between Free, Standard, and Performance plans. No credit card is required to start.' },
        { q: 'How do I upgrade or downgrade my plan?', a: 'Go to Dashboard → Account → Subscription. Changes take effect at the start of the next billing period. If you downgrade from Performance to Standard, any outstanding performance fees are settled immediately.' },
        { q: 'What is the Referral Program?', a: 'Refer a friend using your unique referral link (Dashboard → Account → Referral). When they join and generate performance fees, you receive 5% of their fees for the lifetime of their active subscription. Payouts are made monthly alongside your own fee settlement in USDT. There is no cap on referral earnings.' },
        { q: 'How do I cancel my account?', a: 'Remove your API keys from Dashboard → API Keys, then email support@kadoclub.net requesting account deletion. We will confirm deletion within 2 business days and remove all personal data within 30 days per GDPR. Any outstanding performance fees are settled before deletion.' },
      ],
    },
    {
      label: 'TECHNICAL',
      items: [
        { q: 'How does KADO connect to Bybit?', a: 'KADO uses the official Bybit REST API v5 and WebSocket streams. Your API key and secret are used to authenticate order requests. The bot runs on a Hetzner VPS in Germany with 24/7 uptime monitoring. Orders are placed directly on your exchange account — KADO is purely an instruction-sender, not a custodian.' },
        { q: 'What happens if the server goes down?', a: 'Open positions on your Bybit account continue running with their existing TP and SL orders — these are exchange-side orders and do not depend on KADO being online. The bot cannot open new trades while offline, but your risk is managed by the exchange-side stop orders. We run redundant monitoring and aim for 99.9% uptime.' },
        { q: 'Does KADO work with Bybit Demo accounts?', a: 'Yes. Bybit offers a fully functional Demo account with paper money that mirrors live market prices. To use it: create a Demo API key on Bybit, add it to KADO in Dashboard → API Keys, and toggle Demo mode on. Demo trading is a great way to test strategy settings before committing real funds.' },
        { q: 'Can I use KADO on mobile?', a: 'The KADO dashboard is fully mobile-responsive. You can monitor positions, review trade history, and adjust settings from any mobile browser. The bots run on our server 24/7 regardless of whether you are logged in or which device you are using.' },
        { q: 'Is there an API for developers?', a: 'Not yet. A public API for programmatic access to KADO configuration and trade data is on the roadmap for Q3 2026. For now, all configuration is done through the web dashboard. Contact support@kadoclub.net if you have specific developer integration needs.' },
      ],
    },
  ];

  return (
    <div style={{ padding: pad }}>
      <H2>FAQ</H2>
      <P>Frequently asked questions about security, trading, billing, and technical setup.</P>
      {groups.map(g => (
        <div key={g.label} style={{ marginTop: 36 }}>
          <div style={{ fontFamily: MONO_LOCAL, fontSize: 9, letterSpacing: '0.16em', color: '#333', marginBottom: 4, textTransform: 'uppercase' }}>
            {g.label}
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginBottom: 0 }}>
            {g.items.map(item => <FaqItem key={item.q} q={item.q} a={item.a} />)}
          </div>
        </div>
      ))}
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
