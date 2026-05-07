import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import SpiralText from '@/components/shared/SpiralText';

const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Inter','Segoe UI',sans-serif";
const MONO = "'JetBrains Mono','SF Mono','Fira Code',monospace";

/* ── HERO ── */
function HomeHero() {
  const [in_, setIn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setIn(true), 60); return () => clearTimeout(t); }, []);
  const fade = (d, extra = {}) => ({
    opacity: in_ ? 1 : 0,
    transform: in_ ? 'none' : 'translateY(20px)',
    transition: `opacity 800ms ${d}ms ease, transform 800ms ${d}ms ease`,
    ...extra,
  });

  return (
    <section style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: '0 32px',
      position: 'relative',
      background: 'transparent',
    }}>
      {/* KADO — spiral particle assembly then bold reveal */}
      <h1 style={fade(0, {
        fontFamily: MONO,
        fontSize: 'clamp(64px, 10vw, 120px)',
        fontWeight: 900,
        letterSpacing: '-0.06em',
        lineHeight: 0.87,
        color: '#ffffff',
        margin: 0,
      })}>
        <SpiralText text="KADO" style={{ width: '100%' }} />
      </h1>

      {/* Tagline */}
      <p style={fade(2000, {
        fontFamily: FONT,
        fontSize: 'clamp(15px, 1.6vw, 18px)',
        fontWeight: 400,
        color: '#555',
        marginTop: 48,
        marginBottom: 0,
        lineHeight: 1.75,
        maxWidth: 420,
        letterSpacing: '-0.01em',
      })}>
        Six AI-powered bots trading crypto futures<br />
        around the clock — while you do anything else.
      </p>

      {/* CTA */}
      <div style={fade(2200, {
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        marginTop: 52,
        flexWrap: 'wrap',
        justifyContent: 'center',
      })}>
        <Link
          to="/auth?mode=register"
          style={{
            background: '#fff',
            color: '#000',
            padding: '13px 38px',
            borderRadius: 100,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: FONT,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            transition: 'opacity 150ms',
            letterSpacing: '-0.01em',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.82'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          Get started →
        </Link>
        <a
          href="#how-it-works"
          style={{
            color: '#444',
            fontSize: 13,
            fontFamily: FONT,
            textDecoration: 'none',
            transition: 'color 150ms',
            letterSpacing: '-0.01em',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#fff'}
          onMouseLeave={e => e.currentTarget.style.color = '#444'}
        >
          How it works ↓
        </a>
      </div>

      {/* Scroll hint */}
      <div style={fade(2600, {
        position: 'absolute',
        bottom: 40,
        left: '50%',
        transform: in_ ? 'translateX(-50%)' : 'translateX(-50%) translateY(20px)',
        fontSize: 9,
        color: '#2a2a2a',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        fontFamily: FONT,
        whiteSpace: 'nowrap',
      })}>
        Scroll to explore
      </div>
    </section>
  );
}

/* ── STATS BAR ── */
const STATS = [
  { v: '8',      l: 'Autonomous bots' },
  { v: '24/7',   l: 'Runtime' },
  { v: '<10s',   l: 'Signal latency' },
  { v: '9',      l: 'Score factors' },
  { v: '<100ms', l: 'AI analysis' },
  { v: '3',      l: 'Pipeline stages' },
];

function StatsBar() {
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(5,5,5,0.85)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${STATS.length}, 1fr)` }}>
        {STATS.map((s, i) => (
          <div key={i} style={{
            padding: '32px 0',
            textAlign: 'center',
            borderRight: i < STATS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
          }}>
            <div style={{ fontSize: 'clamp(18px, 2vw, 26px)', fontWeight: 600, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, fontFamily: MONO }}>{s.v}</div>
            <div style={{ fontSize: 10, color: '#444', marginTop: 8, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: FONT }}>{s.l}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── HOW IT WORKS ── */
const STEPS = [
  { n: '01', title: 'Connect your exchange', body: 'Generate an API key on Bybit with trade permissions only. Paste it into your dashboard. Your funds stay on your exchange at all times — KADO only sends orders.' },
  { n: '02', title: 'Choose your strategy', body: 'Run one bot or all eight. Conservative grid for passive income. AI news signals for directional alpha. Full suite for maximum coverage. Switch any time.' },
  { n: '03', title: 'Let the bots trade', body: 'Everything activates in under 60 seconds. Monitor live signals, open positions, and real PnL from your dashboard. No code. No manual work.' },
];

function HowItWorks() {
  return (
    <section id="how-it-works" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
      <div style={{ padding: '120px 64px' }}>
        <SectionHeader label="Setup in 60 seconds" title="Three steps. Then step back." sub="No code. No constant monitoring. Connect once, choose your strategy, and let the bots handle everything else." />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 12, overflow: 'hidden' }}>
          {STEPS.map(s => (
            <div key={s.n} style={{ background: 'rgba(5,5,5,0.92)', padding: '48px 40px' }}>
              <div style={{ fontSize: 11, color: '#333', letterSpacing: '0.1em', fontFamily: MONO, marginBottom: 28 }}>{s.n}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#e0e0e0', marginBottom: 16, letterSpacing: '-0.02em', fontFamily: FONT }}>{s.title}</div>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 1.9, fontFamily: FONT }}>{s.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── BOTS ── */
const BOTS = [
  {
    num: '01', tag: 'ALT COINS ONLY',
    name: 'News Intelligence',
    hook: 'Reads the market before you can.',
    desc: 'Monitors crypto Telegram channels with real-time latency. Groq LLaMA evaluates every event across 9 factors — sentiment, whale activity, RSI, funding rate, open interest, liquidations, volume, Fear & Greed, on-chain macro. Only alts — BTC/ETH/SOL are priced in microseconds by institutions, edge is zero.',
    pills: ['Score ≥ 11.0', '9 score factors', 'Alt coins only'],
  },
  {
    num: '02', tag: 'BTC · ETH · SOL',
    name: 'Grid Trading',
    hook: 'Earns whether price goes up or down.',
    desc: 'Adaptive grids running 24/7 on BTC, ETH, and SOL. Places layered limit orders at optimal levels, capturing profit from every oscillation. Trend confirmed via EMA50 + RSI(4h) before entry. Maker-only orders minimize fees.',
    pills: ['EMA50 filter', 'Maker-only', 'BTC correlation guard'],
  },
  {
    num: '03', tag: 'BINANCE · BYBIT · 10s',
    name: 'Listing Sniper',
    hook: 'In before the crowd finishes reading.',
    desc: 'Polls exchange listing APIs every 10 seconds. The moment a new listing appears, it enters immediately. DEX filter skips coins already pumped on-chain. Two-stage exit: 50% at +10%, remainder rides to +20%.',
    pills: ['TP1 +10% · TP2 +20%', 'DEX staleness filter', '5× leverage'],
  },
  {
    num: '04', tag: '30 PERPS · 15-MIN CYCLE',
    name: 'Funding Rate Arbitrage',
    hook: 'Profits when perpetuals diverge from spot.',
    desc: 'Scans 30 perpetual markets every 15 minutes. Elevated funding rate combined with overbought RSI signals a SHORT. Negative funding with oversold RSI signals a LONG. Three-tier position sizing amplifies on extreme setups.',
    pills: ['30 markets', 'FR > 0.04%', '3-tier sizing'],
  },
  {
    num: '05', tag: 'BINANCE WEBSOCKET · REAL-TIME',
    name: 'Liquidation Cascade',
    hook: 'Trades the momentum that lasts minutes, not milliseconds.',
    desc: 'Connected to Binance liquidation feed 24/7. When $300K+ of shorts are liquidated in 5 minutes with a 2.5:1 directional dominance — the bot enters the cascade direction. Cascades unfold over minutes, not microseconds. Real edge.',
    pills: ['22 alt coins', '$300K threshold', 'TP 6% · SL 2.5%'],
  },
  {
    num: '06', tag: 'ALCHEMY WEBSOCKET · ETH',
    name: 'On-chain Macro',
    hook: 'Follow where the real money flows.',
    desc: 'Tracks ETH whale movements to and from exchange wallets in real time. When 500+ ETH is withdrawn from Binance or Bybit — macro bullish signal activates for AAVE, UNI, LDO, LINK, CRV and other ETH-ecosystem alts for 45 minutes.',
    pills: ['ETH ecosystem alts', '45-min signal window', 'Alchemy WebSocket'],
  },
  {
    num: '07', tag: '10 WALLETS · WEBSOCKET',
    name: 'Whale Tracker',
    hook: 'Follow the wallets that move markets.',
    desc: 'Tracks 10 identified smart money wallets — Paradigm, Jump Trading, Wintermute and others — via real-time Alchemy WebSocket feeds. When a whale makes a significant on-chain move, it generates a directional signal for the related assets.',
    pills: ['10 smart wallets', 'Real-time', 'Lower score threshold'],
  },
  {
    num: '08', tag: 'BSC · PANCAKESWAP V2',
    name: 'DEX Sniper',
    hook: 'New launches, safety-checked in real time.',
    desc: 'Listens for new PairCreated events on PancakeSwap V2. Every token checked for honeypots, buy/sell tax, locked LP, and deployer history. Clean contracts only. Trailing stop activates after +30%.',
    pills: ['Honeypot check', 'TP +100% · SL −50%', 'Trailing stop at +30%'],
  },
];

function BotsSection() {
  return (
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
      <div style={{ padding: '120px 64px' }}>
        <SectionHeader label="The Arsenal" title="Eight strategies. One platform." sub="Each bot is independent, specialized, and running 24/7. Together they cover every major market opportunity." />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 12, overflow: 'hidden' }}>
          {BOTS.map(bot => (
            <Link key={bot.num} to="/bots" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div
                style={{ background: 'rgba(5,5,5,0.92)', padding: '40px 32px', textAlign: 'left', transition: 'background 200ms', height: '100%', boxSizing: 'border-box' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(12,12,12,0.97)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(5,5,5,0.92)'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                  <span style={{ fontSize: 10, color: '#333', fontFamily: MONO, letterSpacing: '0.08em' }}>{bot.num}</span>
                  <span style={{ fontSize: 9, color: '#777', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 100, padding: '3px 10px', letterSpacing: '0.04em', maxWidth: 130, textAlign: 'right', lineHeight: 1.4, fontFamily: FONT }}>{bot.tag}</span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#e0e0e0', marginBottom: 6, letterSpacing: '-0.02em', fontFamily: FONT }}>{bot.name}</div>
                <div style={{ fontSize: 12, color: '#555', fontStyle: 'italic', marginBottom: 16, lineHeight: 1.5, fontFamily: FONT }}>{bot.hook}</div>
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.9, fontFamily: FONT }}>{bot.desc}</div>
                <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {bot.pills.map(p => (
                    <span key={p} style={{ fontSize: 9, color: '#666', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 100, padding: '3px 10px', letterSpacing: '0.03em', fontFamily: FONT }}>{p}</span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── RISK MANAGEMENT ── */
const RISK = [
  { title: 'Hard loss cap', body: 'Every open position is monitored every 5 minutes. If unrealized loss exceeds $20 — position is force-closed instantly. Prevents single-trade disasters.' },
  { title: 'Coin cooldown', body: 'The same coin cannot be traded more than once every 2 hours. Prevents over-exposure to a single asset after a losing trade.' },
  { title: 'Max exposure', body: 'No more than 15% of balance in simultaneously open positions. Calculated in real time before every entry.' },
  { title: 'Adaptive pause', body: 'Post-trade analyzer tracks each coin independently. After a losing streak, the bot temporarily skips that coin until performance recovers.' },
];

function RiskSection() {
  return (
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
      <div style={{ padding: '120px 64px' }}>
        <SectionHeader label="Risk Management" title="Your capital is protected." sub="Multiple independent safeguards run on every trade. No single bet can wipe an account." />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 12, overflow: 'hidden' }}>
          {RISK.map(r => (
            <div key={r.title} style={{ background: 'rgba(5,5,5,0.92)', padding: '40px 32px' }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#d0d0d0', marginBottom: 14, letterSpacing: '-0.02em', fontFamily: FONT }}>{r.title}</div>
              <div style={{ fontSize: 12, color: '#666', lineHeight: 1.9, fontFamily: FONT }}>{r.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── STRATEGIES ── */
const STRATS = [
  { n: '01', name: 'Steady', summary: 'Consistent passive income from price oscillation. No directional bets, no speculation.', tags: ['Grid Trading'], ret: '3–8%', note: 'Best for first-time users or conservative allocations.' },
  { n: '02', name: 'Balanced', summary: 'Grid income plus AI-driven news alpha, liquidation cascade, and funding rate arbitrage.', tags: ['Grid', 'News Intelligence', 'Liq Cascade', 'Funding Rate'], ret: '10–25%', note: 'Multiple uncorrelated income streams working simultaneously.' },
  { n: '03', name: 'Full Suite', summary: 'All eight bots active simultaneously. Maximum signal coverage across every market structure.', tags: ['All 8 bots active'], ret: '25%+', note: 'For experienced traders who want complete automation.' },
];

function Strategies() {
  return (
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
      <div style={{ padding: '120px 64px' }}>
        <SectionHeader label="Strategies" title="Find your match." sub="Start with one bot. Scale to all eight. Switch any time from your dashboard." />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {STRATS.map(s => (
            <Link key={s.n} to="/strategies" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div
                style={{ background: 'rgba(8,8,8,0.92)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: '48px 40px', textAlign: 'left', transition: 'border-color 180ms', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
              >
                <div style={{ fontSize: 10, color: '#333', fontFamily: MONO, marginBottom: 20, letterSpacing: '0.08em' }}>{s.n}</div>
                <div style={{ fontSize: 22, fontWeight: 600, color: '#e0e0e0', marginBottom: 14, letterSpacing: '-0.03em', fontFamily: FONT }}>{s.name}</div>
                <div style={{ fontSize: 13, color: '#666', lineHeight: 1.8, marginBottom: 28, flex: 1, fontFamily: FONT }}>{s.summary}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 36 }}>
                  {s.tags.map(t => (
                    <span key={t} style={{ fontSize: 9, color: '#777', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 100, padding: '4px 12px', fontFamily: FONT }}>{t}</span>
                  ))}
                </div>
                <div style={{ fontSize: 'clamp(40px,4vw,56px)', fontWeight: 600, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, fontFamily: MONO, marginBottom: 6 }}>{s.ret}</div>
                <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 20, fontFamily: FONT }}>Est. monthly</div>
                <div style={{ fontSize: 12, color: '#444', lineHeight: 1.7, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.05)', fontFamily: FONT }}>{s.note}</div>
              </div>
            </Link>
          ))}
        </div>
        <div style={{ marginTop: 24, fontSize: 11, color: '#2d2d2d', lineHeight: 1.7, textAlign: 'center', fontFamily: FONT }}>
          Estimated returns are not guaranteed. Crypto trading carries inherent risk.
        </div>
      </div>
    </section>
  );
}

/* ── CTA ── */
function CTA() {
  return (
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
      <div style={{ padding: '160px 64px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: MONO, fontSize: 'clamp(64px,10vw,120px)', fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.87, color: '#fff', margin: '0 0 48px' }}>
          KADO
        </h2>
        <p style={{ fontSize: 16, color: '#555', letterSpacing: '-0.01em', marginBottom: 12, fontFamily: FONT }}>Your edge, automated.</p>
        <p style={{ fontSize: 13, color: '#444', lineHeight: 1.8, maxWidth: 400, margin: '0 auto 44px', fontFamily: FONT }}>
          Private beta is open. Connect your exchange API key, choose a strategy, and let eight bots trade for you. Your funds never leave your exchange.
        </p>
        <Link
          to="/auth?mode=register"
          style={{ background: '#fff', color: '#000', padding: '14px 40px', borderRadius: 100, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'opacity 150ms', fontFamily: FONT, letterSpacing: '-0.01em' }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.82'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          Get started →
        </Link>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
          {['No credit card required', 'Funds stay on your exchange', 'Cancel any time'].map(t => (
            <span key={t} style={{ fontSize: 10, color: '#444', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 100, padding: '4px 14px', fontFamily: FONT }}>{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── SHARED ── */
function SectionHeader({ label, title, sub }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 64 }}>
      <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 18, fontFamily: FONT }}>{label}</div>
      <div style={{ fontSize: 'clamp(32px,4vw,48px)', fontWeight: 600, letterSpacing: '-0.04em', lineHeight: 1.05, color: '#e0e0e0', marginBottom: 16, fontFamily: FONT }}>{title}</div>
      <div style={{ fontSize: 15, color: '#555', lineHeight: 1.75, maxWidth: 520, margin: '0 auto', fontFamily: FONT }}>{sub}</div>
    </div>
  );
}

/* ── EXPORT ── */
export default function Landing() {
  return (
    <div style={{ color: '#fff', minHeight: '100vh' }}>
      <LandingHeader />
      <HomeHero />
      <StatsBar />
      <HowItWorks />
      <BotsSection />
      <RiskSection />
      <Strategies />
      <CTA />
      <LandingFooter />
    </div>
  );
}
