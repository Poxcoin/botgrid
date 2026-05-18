import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import { usePageTitle } from '@/lib/usePageTitle';

const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif";
const MONO = "'SF Mono','Courier New',monospace";

const SECTIONS = [
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'api-keys',        label: 'Bybit API Keys' },
  { id: 'strategies',      label: 'Strategies' },
  { id: 'dashboard',       label: 'Dashboard' },
  { id: 'faq',             label: 'FAQ' },
  { id: 'support',         label: 'Support' },
];

function H2({ children }) {
  return (
    <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 20, color: 'var(--text-primary)' }}>
      {children}
    </h2>
  );
}

function H3({ children }) {
  return (
    <h3 style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', marginBottom: 10, marginTop: 28, color: 'var(--text-primary)' }}>
      {children}
    </h3>
  );
}

function P({ children }) {
  return (
    <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 14 }}>
      {children}
    </p>
  );
}

function Step({ n, children }) {
  return (
    <div style={{ display: 'flex', gap: 14, marginBottom: 14, alignItems: 'flex-start' }}>
      <div style={{
        width: 26, height: 26, borderRadius: '50%', background: 'var(--text-primary)', color: 'var(--bg-base)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, fontFamily: MONO, flexShrink: 0, marginTop: 1,
      }}>{n}</div>
      <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75 }}>{children}</div>
    </div>
  );
}

function Code({ children }) {
  return (
    <code style={{
      fontFamily: MONO, fontSize: 12, background: 'rgba(255,255,255,0.06)',
      padding: '2px 7px', borderRadius: 4, color: 'var(--text-primary)',
    }}>{children}</code>
  );
}

function Warning({ children }) {
  return (
    <div style={{
      background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)',
      borderRadius: 8, padding: '12px 16px', marginBottom: 16,
      fontSize: 13, color: '#ef4444', lineHeight: 1.65,
    }}>
      ⚠ {children}
    </div>
  );
}

function Tip({ children }) {
  return (
    <div style={{
      background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)',
      borderRadius: 8, padding: '12px 16px', marginBottom: 16,
      fontSize: 13, color: '#22c55e', lineHeight: 1.65,
    }}>
      ✓ {children}
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '40px 0' }} />;
}

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 0', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', textAlign: 'left',
          fontFamily: FONT,
        }}
      >
        <span>{q}</span>
        <span style={{ fontSize: 18, color: 'var(--text-muted)', marginLeft: 16, flexShrink: 0 }}>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{ paddingBottom: 16, fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.75 }}>
          {a}
        </div>
      )}
    </div>
  );
}

export default function DocsPage() {
  usePageTitle('Documentation', 'Step-by-step guides for connecting Bybit API, choosing trading strategies, and getting the most out of KADO.');
  const [active, setActive] = useState('getting-started');

  useEffect(() => {
    window.scrollTo(0, 0);
    const obs = new IntersectionObserver(
      entries => {
        entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); });
      },
      { rootMargin: '-30% 0px -60% 0px' }
    );
    SECTIONS.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <div style={{ background: 'var(--bg-base)', color: 'var(--text-primary)', fontFamily: FONT, minHeight: '100vh' }}>
      <LandingHeader />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '60px 24px 120px', display: 'flex', gap: 60, alignItems: 'flex-start' }}>

        {/* sidebar */}
        <aside style={{ width: 180, flexShrink: 0, position: 'sticky', top: 90 }}>
          <div style={{ fontSize: 10, fontFamily: MONO, letterSpacing: '0.15em', color: 'var(--text-muted)', marginBottom: 14 }}>
            CONTENTS
          </div>
          {SECTIONS.map(s => (
            <a
              key={s.id}
              href={'#' + s.id}
              onClick={() => setActive(s.id)}
              style={{
                display: 'block', padding: '6px 0',
                fontSize: 13, textDecoration: 'none',
                color: active === s.id ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: active === s.id ? 500 : 400,
                borderLeft: active === s.id ? '2px solid var(--text-primary)' : '2px solid transparent',
                paddingLeft: 12,
                transition: 'color 0.15s',
              }}
            >
              {s.label}
            </a>
          ))}
        </aside>

        {/* content */}
        <main style={{ flex: 1, minWidth: 0 }}>

          {/* Getting Started */}
          <section id="getting-started" style={{ marginBottom: 60 }}>
            <H2>Getting Started</H2>
            <P>KADO connects to your Bybit account via API keys and automates trading on your behalf. Your funds stay on Bybit at all times — we never take custody.</P>

            <H3>Quick setup (5 minutes)</H3>
            <Step n={1}>
              <strong>Create your account</strong> at <Link to="/auth" style={{ color: 'var(--text-primary)' }}>kadoclub.net/auth</Link> and verify your email.
            </Step>
            <Step n={2}>
              <strong>Generate Bybit API keys</strong> — read the <a href="#api-keys" style={{ color: 'var(--text-primary)' }}>API Keys guide</a> below. Enable <em>Contract Trade</em> only. Never enable withdrawals.
            </Step>
            <Step n={3}>
              <strong>Add your keys</strong> in the <em>API Keys</em> tab of your dashboard.
            </Step>
            <Step n={4}>
              <strong>Choose a strategy</strong> in the <em>Settings</em> tab — Grid, Signal, Funding Rate, or Listing Sniper.
            </Step>
            <Step n={5}>
              The bot starts automatically. Monitor your open positions in the <em>Overview</em> tab.
            </Step>

            <Tip>Recommended starting balance: $100–$500 USDT. The bot sizes positions as a percentage of your free balance.</Tip>
          </section>

          <Divider />

          {/* API Keys */}
          <section id="api-keys" style={{ marginBottom: 60 }}>
            <H2>Bybit API Keys</H2>
            <P>API keys let KADO place orders on your Bybit account without ever accessing your funds. This is the most important setup step.</P>

            <Warning>Never enable <strong>Withdrawal</strong> permission. KADO only needs Contract Trade rights. If an app ever asks for withdrawal permissions, do not use it.</Warning>

            <H3>Step-by-step: creating API keys on Bybit</H3>
            <Step n={1}>Log in to <strong>bybit.com</strong> and go to <strong>Account → API Management</strong>.</Step>
            <Step n={2}>Click <strong>Create New Key</strong>. Choose <em>System-generated API Keys</em>.</Step>
            <Step n={3}>
              Set a name (e.g. <Code>KADO Bot</Code>) and configure permissions:
              <ul style={{ marginTop: 8, paddingLeft: 20, lineHeight: 2 }}>
                <li>✅ Read Only</li>
                <li>✅ Unified Trading (Contract Trade)</li>
                <li>❌ Wallet — <strong>do not enable</strong></li>
                <li>❌ Withdraw — <strong>do not enable</strong></li>
              </ul>
            </Step>
            <Step n={4}>Leave <strong>IP Restriction</strong> blank (or add our VPS IP for extra security).</Step>
            <Step n={5}>Copy both the <strong>API Key</strong> and <strong>Secret Key</strong>. The secret is shown only once.</Step>
            <Step n={6}>Paste both into the <strong>API Keys</strong> tab in your KADO dashboard and click <em>Save</em>.</Step>

            <H3>Demo vs Live trading</H3>
            <P>Bybit offers a Demo account with paper money. Toggle <em>Demo mode</em> on in KADO settings to practice without real funds. We recommend testing for at least 48 hours on demo before enabling live trading.</P>
          </section>

          <Divider />

          {/* Strategies */}
          <section id="strategies" style={{ marginBottom: 60 }}>
            <H2>Strategies</H2>

            <H3>Signal Bot</H3>
            <P>Monitors crypto news and social feeds in real time. An AI model (Claude Haiku) scores each news item for trading relevance, direction, and urgency. High-scoring events trigger trades on altcoin perpetual futures.</P>
            <P><strong>Best for:</strong> active altcoin trading. <strong>Risk:</strong> medium–high (news-driven moves can reverse). Stop-loss is always set.</P>

            <H3>Grid Bot</H3>
            <P>Places a ladder of buy and sell orders around a price range. Profits from price oscillations in sideways markets — it buys dips and sells rips automatically.</P>
            <P><strong>Best for:</strong> BTC/ETH in range-bound markets. <strong>Risk:</strong> low–medium in sideways conditions; can lose in strong trends.</P>

            <H3>Funding Rate Bot</H3>
            <P>Perpetual futures have an 8-hour funding rate. When funding becomes extremely positive or negative, traders on the paying side are incentivised to close. The bot fades these extremes for mean-reversion trades.</P>
            <P><strong>Best for:</strong> experienced users who understand funding mechanics. <strong>Risk:</strong> medium.</P>

            <H3>Listing Sniper</H3>
            <P>Detects new token listings on Bybit within seconds and opens a position anticipating the listing pump. Positions are small (2% of balance) with a wide TP (20%) and a 7% SL.</P>
            <P><strong>Best for:</strong> high-risk/reward speculation. <strong>Risk:</strong> high — new listings are volatile and can dump as fast as they pump.</P>

            <H3>DEX Sniper (BSC)</H3>
            <P>Monitors Binance Smart Chain for new PancakeSwap liquidity pairs. Snipes new tokens with on-chain safety checks (LP lock, tax analysis, deployer history). Buys in BNB and auto-sells at target.</P>
            <P><strong>Best for:</strong> users familiar with DeFi risk. <strong>Risk:</strong> very high — memecoins and new tokens frequently go to zero.</P>
          </section>

          <Divider />

          {/* Dashboard */}
          <section id="dashboard" style={{ marginBottom: 60 }}>
            <H2>Dashboard</H2>

            <H3>Overview tab</H3>
            <P>Shows your live account balance, unrealized PnL on open positions, a list of open positions from Bybit, and your recent trade history with results (WIN / LOSS / BE).</P>

            <H3>API Keys tab</H3>
            <P>Add, update, or remove your Bybit API credentials. You can toggle between Demo and Live mode here. Keys are encrypted with AES-256 before storage.</P>

            <H3>Settings tab</H3>
            <P>Choose which bots are active and configure risk parameters: leverage, take-profit %, stop-loss %, and position size as a % of free balance.</P>

            <H3>Account tab</H3>
            <P>Update your email, username, or password. You can also delete your account here (all data is removed within 30 days per GDPR).</P>

            <H3>Security tab</H3>
            <P>Enable Two-Factor Authentication (TOTP) using any authenticator app (Google Authenticator, Authy). Strongly recommended for live trading accounts.</P>
          </section>

          <Divider />

          {/* FAQ */}
          <section id="faq" style={{ marginBottom: 60 }}>
            <H2>FAQ</H2>

            <FaqItem q="Is KADO safe to use?"
              a="Your funds remain on Bybit at all times. KADO connects using trade-only API keys — withdrawal permissions are never requested. We use AES-256 encryption for stored keys and bcrypt for passwords. We do not take custody of any assets." />

            <FaqItem q="How much can I earn?"
              a="Returns depend entirely on market conditions. Past performance does not guarantee future results. Automated bots can win and lose. Always trade only funds you can afford to lose." />

            <FaqItem q="What happens if the bot makes a losing trade?"
              a="Every trade has a stop-loss. If the market moves against you beyond the SL threshold, the position is closed automatically. The maximum loss per trade is capped (default: 3% of margin for altcoins). You can adjust SL levels in Settings." />

            <FaqItem q="Where are my funds?"
              a="Always on your Bybit account. KADO cannot move or withdraw funds — our API keys do not have that permission. If you remove your API keys, KADO immediately loses access to your account." />

            <FaqItem q="How do I pause the bot?"
              a="Go to your dashboard → Settings → toggle the bot off. Open positions are not automatically closed when you pause — they will be managed by their existing TP/SL levels." />

            <FaqItem q="What is the minimum balance?"
              a="Technically $1, but we recommend at least $100 USDT for the position sizing to make economic sense. Below $50 the fixed fees can eat into returns significantly." />

            <FaqItem q="Does KADO work with exchanges other than Bybit?"
              a="Currently only Bybit (USDT Perpetuals on the Unified account). Support for additional exchanges is on the roadmap." />

            <FaqItem q="What is the Performance plan fee?"
              a="On the Performance plan, KADO charges 25% of net new profits monthly under a high-water-mark policy. No fee in losing months. Settled in USDT." />

            <FaqItem q="How do I get signals in Telegram?"
              a="Connect your Telegram in the Settings tab. KADO's bot (@KADO_c_BOT) will send you a notification for every trade: open, update, and close." />

            <FaqItem q="Can I use KADO on a Demo account?"
              a="Yes. Add your Bybit Demo API keys and toggle Demo mode in the API Keys tab. Demo trades use paper money and do not affect your real balance." />
          </section>

          <Divider />

          {/* Support */}
          <section id="support" style={{ marginBottom: 40 }}>
            <H2>Support</H2>
            <P>We aim to respond to all requests within 24 hours on business days.</P>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginTop: 24 }}>
              {[
                { label: 'Email', value: 'support@kadoclub.net', href: 'mailto:support@kadoclub.net' },
                { label: 'Telegram Bot', value: '@KADO_c_BOT', href: 'https://t.me/KADO_c_BOT' },
                { label: 'Privacy / GDPR', value: 'privacy@kadoclub.net', href: 'mailto:privacy@kadoclub.net' },
              ].map(item => (
                <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  <div style={{
                    border: '1px solid var(--border-subtle)', borderRadius: 10, padding: '16px 18px',
                    transition: 'border-color 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--text-muted)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
                  >
                    <div style={{ fontSize: 10, fontFamily: MONO, letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: 6 }}>
                      {item.label.toUpperCase()}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{item.value}</div>
                  </div>
                </a>
              ))}
            </div>
          </section>

        </main>
      </div>

      <LandingFooter />
    </div>
  );
}
