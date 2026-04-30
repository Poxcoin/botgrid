import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import SpiralText from '@/components/shared/SpiralText';

const W = { maxWidth: 1120, margin: '0 auto', padding: '0 40px' };

/* ─────────────────────────────────────────────────────────────────── Hero ── */
function HomeHero() {
  const [in_, setIn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setIn(true), 80); return () => clearTimeout(t); }, []);
  const fade = (d, extra = {}) => ({
    opacity: in_ ? 1 : 0,
    transform: in_ ? 'none' : 'translateY(22px)',
    transition: `opacity 700ms ${d}ms ease, transform 700ms ${d}ms ease`,
    ...extra,
  });

  return (
    <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--border)', position: 'relative' }}>

      {/* corner labels */}
      <div style={{ position: 'absolute', top: 24, left: 44, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', zIndex: 2 }}>
        EST. 2026
      </div>
      <div style={{ position: 'absolute', top: 24, right: 44, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', zIndex: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'blink 2s ease-in-out infinite' }} />
        BYBIT · LIVE
      </div>

      {/* main content */}
      <div style={{ ...W, flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 130, paddingBottom: 80 }}>

        <div style={fade(0, { display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 52, border: '1px solid var(--border)', padding: '6px 14px', width: 'fit-content' })}>
          Private Beta · Bybit Perpetual Futures
        </div>

        <div style={fade(60, { marginBottom: 36 })}>
          <SpiralText
            text="KADO"
            style={{ fontSize: 'clamp(88px, 17vw, 210px)', fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.85 }}
          />
        </div>

        <h1 style={fade(120, { fontSize: 'clamp(19px, 2.6vw, 30px)', fontWeight: 400, letterSpacing: '-0.02em', lineHeight: 1.35, color: 'var(--muted-fg)', margin: '0 0 28px', maxWidth: 600 })}>
          Six AI-powered bots trading Bybit futures<br />
          around the clock — while you do anything else.
        </h1>

        <p style={fade(170, { fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 2.1, color: 'var(--muted)', maxWidth: 460, margin: '0 0 56px' })}>
          News scanner · Grid trader · Listing sniper<br />
          Funding rate arb · Whale tracker · DEX sniper<br />
          Connect your API key. Your funds stay on Bybit.
        </p>

        <div style={fade(220, { display: 'flex', flexWrap: 'wrap', gap: 12 })}>
          <Link to="/waitlist"
            style={{ display: 'inline-flex', alignItems: 'center', height: 52, padding: '0 40px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', textDecoration: 'none', background: 'var(--fg)', color: 'var(--bg)', fontWeight: 700 }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.8'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
            Join Waitlist →
          </Link>
          <a href="#how-it-works"
            style={{ display: 'inline-flex', alignItems: 'center', height: 52, padding: '0 40px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', textDecoration: 'none', border: '1px solid var(--border)', color: 'var(--fg)' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--fg)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
            See how it works
          </a>
        </div>
      </div>

      {/* stats strip */}
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <div style={{ ...W, padding: '0 40px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)' }}>
            {[
              { val: '6',    lab: 'Autonomous bots' },
              { val: '24/7', lab: 'Runtime' },
              { val: '<5s',  lab: 'Signal latency' },
              { val: '30',   lab: 'FR markets' },
              { val: '10',   lab: 'Whale wallets' },
              { val: '30s',  lab: 'Listing scan' },
            ].map((s, i) => (
              <div key={s.lab} style={{ padding: '26px 0', textAlign: 'center', borderRight: i < 5 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(17px, 2.2vw, 26px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 8 }}>{s.lab}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────── How it works (new) ── */
function HowItWorks() {
  return (
    <section id="how-it-works" style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ ...W }}>

        <div style={{ padding: '88px 0 56px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 18 }}>01 — Setup in 60 seconds</div>
          <h2 style={{ fontSize: 'clamp(34px, 5vw, 62px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.92, margin: 0 }}>
            Three steps.<br />Then step back.
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {[
            {
              n: '01', title: 'Connect your exchange',
              body: 'Create a Bybit API key with trade permissions. Paste it into your KADO dashboard. Your funds never leave Bybit — we only send orders on your behalf.',
            },
            {
              n: '02', title: 'Choose your strategy',
              body: 'Run the grid bot for passive income. Add AI news signals for directional alpha. Enable all six bots for maximum market coverage. Change any time.',
            },
            {
              n: '03', title: 'Let the bots trade',
              body: 'Everything activates in under 60 seconds. Monitor live signals, open positions, and monthly PnL from your dashboard. No coding. No constant watching.',
            },
          ].map((s, i) => (
            <div key={s.n} style={{
              padding: '52px 0',
              paddingRight: i < 2 ? 44 : 0,
              paddingLeft: i > 0 ? 44 : 0,
              borderRight: i < 2 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.3em', color: 'var(--muted)', marginBottom: 28 }}>{s.n}</div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 20 }}>{s.title}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 2, color: 'var(--muted-fg)' }}>{s.body}</div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────────── The Bots ── */
const BOTS = [
  {
    num: '01', name: 'News Intelligence',
    tag: 'AI-SCORED · BYBIT PERP',
    hook: 'Reads the market before you can.',
    desc: 'Monitors 6 crypto Telegram channels with <5s latency. Groq LLaMA evaluates each event across 8 market factors — sentiment, whale activity, RSI, funding rate, open interest, liquidations, volume, Fear & Greed. Only trades when confidence is high.',
  },
  {
    num: '02', name: 'Grid Trading',
    tag: 'BTC · ETH · SOL · DOGE · XRP',
    hook: 'Earns whether price goes up or down.',
    desc: 'ATR-adaptive grids running 24/7 on 5 major coins. Places layered buy and sell orders at mathematically optimal levels, capturing profit from every oscillation. BTC correlation filter auto-pauses during broad market dumps.',
  },
  {
    num: '03', name: 'Listing Sniper',
    tag: 'BINANCE · BYBIT · 30s SCAN',
    hook: 'In before the crowd finishes reading.',
    desc: 'Checks Binance and Bybit listing APIs every 30 seconds. The moment a new listing goes live, it enters the position automatically. DEX filter skips coins already pumped >$100K. Takes partial profit at +10%, trails the rest.',
  },
  {
    num: '04', name: 'Funding Rate Arb',
    tag: '30 PERPS · 15-MIN CYCLE',
    hook: 'Profits when perpetuals diverge from spot.',
    desc: 'Scans 30 perpetual markets every 15 minutes for extreme funding rates. Elevated funding + overbought RSI signals a SHORT. Negative funding + oversold RSI signals a LONG. Three-tier position sizing on the most extreme setups.',
  },
  {
    num: '05', name: 'Whale Tracker',
    tag: '10 WALLETS · WEBSOCKET',
    hook: 'Follow the wallets that move markets.',
    desc: 'Tracks 10 high-conviction on-chain wallets via real-time Alchemy WebSocket. When a whale makes a significant move, the confidence threshold drops from 8.0 to 5.0 and the bot enters immediately. Real smart money data, not social noise.',
  },
  {
    num: '06', name: 'DEX Sniper',
    tag: 'BSC · PANCAKESWAP V2',
    hook: 'New launches, safety-checked in real time.',
    desc: 'Listens for PancakeSwap V2 PairCreated events on BSC. Every new token is verified by GoPlus: honeypot detection, buy/sell tax check, owner renounced. Clean contracts only. Target +100%, hard stop at −50%.',
  },
];

function BotsSection() {
  return (
    <section style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ ...W }}>

        <div style={{ padding: '88px 0 56px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 18 }}>02 — The Arsenal</div>
            <h2 style={{ fontSize: 'clamp(34px, 5vw, 62px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.92, margin: 0 }}>
              Six strategies.<br />One platform.
            </h2>
          </div>
          <Link to="/bots"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', textDecoration: 'none', flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--fg)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
            Full details →
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {BOTS.map((bot, i) => (
            <Link key={bot.num} to="/bots"
              style={{
                display: 'block', textDecoration: 'none', color: 'var(--fg)',
                padding: '44px 0',
                paddingRight: i % 3 < 2 ? 44 : 0,
                paddingLeft: i % 3 > 0 ? 44 : 0,
                borderRight: i % 3 < 2 ? '1px solid var(--border)' : 'none',
                borderBottom: i < 3 ? '1px solid var(--border)' : 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--fg) 4%, transparent)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.3em', color: 'var(--muted)' }}>{bot.num}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '0.15em', color: 'var(--muted)', border: '1px solid var(--border)', padding: '3px 9px' }}>{bot.tag}</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 10 }}>{bot.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', marginBottom: 18, fontStyle: 'italic' }}>{bot.hook}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.95, color: 'var(--muted-fg)' }}>{bot.desc}</div>
            </Link>
          ))}
        </div>

      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────── Signal Pipeline ── */
function Pipeline() {
  return (
    <section style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ ...W }}>

        <div style={{ padding: '88px 0 56px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 18 }}>03 — Under the hood</div>
          <h2 style={{ fontSize: 'clamp(34px, 5vw, 62px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.92, margin: 0 }}>
            Signal in.<br />Order out.
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {[
            {
              n: '01', title: 'Ingest',
              body: 'Telegram userbot on 6 channels. Exchange APIs polled every 30s. 10 whale wallets tracked via Alchemy WebSocket. Funding rates refreshed every 15 min on 30 markets.',
            },
            {
              n: '02', title: 'Score',
              body: 'Groq LLaMA evaluates every event in <100ms across 8 market factors. Filters out noise. Only high-confidence signals (≥8.0) move to execution.',
            },
            {
              n: '03', title: 'Filter',
              body: 'BTC correlation check blocks entries during dumps. Maximum 3 concurrent positions. Post-trade analysis automatically pauses underperforming coins.',
            },
            {
              n: '04', title: 'Execute',
              body: 'Dynamic leverage 2–5×. 50% take-profit at target, remainder trails. 3-level retry for price-range errors. Stop loss via native exchange order.',
            },
          ].map((s, i) => (
            <div key={s.n} style={{
              padding: '52px 0',
              paddingRight: i < 3 ? 40 : 0,
              paddingLeft: i > 0 ? 40 : 0,
              borderRight: i < 3 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.3em', color: 'var(--muted)', marginBottom: 28 }}>{s.n}</div>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 18 }}>{s.title}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 2, color: 'var(--muted-fg)' }}>{s.body}</div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

/* ──────────────────────────────────────────────────────────── Strategies ── */
const STRATS = [
  {
    n: '01', name: 'Steady',
    returns: '3–8%', period: 'est. monthly',
    summary: 'Consistent passive income from price oscillation. No directional bets, no speculation.',
    bots: ['Grid Trading'],
    note: 'Best for: first-time users or conservative allocations.',
  },
  {
    n: '02', name: 'Balanced',
    returns: '10–25%', period: 'est. monthly',
    summary: 'Grid income plus AI-driven news alpha and funding rate arbitrage. Three independent income streams.',
    bots: ['Grid Trading', 'News Intelligence', 'Funding Rate Arb'],
    note: 'Best for: users who want multiple uncorrelated strategies.',
  },
  {
    n: '03', name: 'Full Suite',
    returns: '25%+', period: 'est. monthly',
    summary: 'All six bots active simultaneously. Maximum signal coverage across every market opportunity.',
    bots: ['All 6 bots active'],
    note: 'Best for: experienced traders who want full automation.',
  },
];

function Strategies() {
  return (
    <section style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ ...W }}>

        <div style={{ padding: '88px 0 56px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 18 }}>04 — Strategies</div>
            <h2 style={{ fontSize: 'clamp(34px, 5vw, 62px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.92, margin: 0 }}>
              Find your<br />match.
            </h2>
          </div>
          <Link to="/pricing"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', textDecoration: 'none', flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--fg)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
            View pricing →
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {STRATS.map((s, i) => (
            <Link key={s.n} to="/strategies"
              style={{
                display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'var(--fg)',
                padding: '52px 0',
                paddingRight: i < 2 ? 44 : 0,
                paddingLeft: i > 0 ? 44 : 0,
                borderRight: i < 2 ? '1px solid var(--border)' : 'none',
                borderBottom: '1px solid var(--border)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'color-mix(in srgb, var(--fg) 4%, transparent)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.3em', color: 'var(--muted)', marginBottom: 24 }}>{s.n}</div>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 14 }}>{s.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.9, color: 'var(--muted-fg)', flex: 1, marginBottom: 28 }}>{s.summary}</div>

              {/* Active bots */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 36 }}>
                {s.bots.map(b => (
                  <span key={b} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', border: '1px solid var(--border)', padding: '4px 10px', color: 'var(--muted)' }}>{b}</span>
                ))}
              </div>

              {/* Returns — prominent */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 6 }}>{s.returns}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 20 }}>{s.period}</div>

              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.8, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                {s.note}
              </div>
            </Link>
          ))}
        </div>

        {/* Risk disclaimer — small, bottom */}
        <div style={{ padding: '18px 0', display: 'flex', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted)', letterSpacing: '0.04em', textAlign: 'center' }}>
            Estimated returns are not guaranteed. Crypto trading carries inherent risk. Past performance does not guarantee future results.
          </span>
        </div>

      </div>
    </section>
  );
}

/* ────────────────────────────────────────────────────────────────── CTA ── */
function CTA() {
  return (
    <section>
      <div style={{ ...W, padding: '120px 40px' }}>

        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 64 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 32 }}>05 — Access</div>
            <h2 style={{ fontSize: 'clamp(44px, 7vw, 96px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.9, margin: '0 0 32px' }}>
              Your edge.<br />
              <span style={{ opacity: 0.25 }}>Automated.</span>
            </h2>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 2.1, color: 'var(--muted-fg)', maxWidth: 400, margin: 0 }}>
              Private beta is open. Connect your Bybit API key,
              choose a strategy, and let six bots trade for you.
              Your funds never leave your exchange.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'flex-start' }}>
            <Link to="/waitlist"
              style={{ display: 'inline-flex', alignItems: 'center', height: 56, padding: '0 48px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', textDecoration: 'none', background: 'var(--fg)', color: 'var(--bg)', fontWeight: 700 }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.82'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              Join Waitlist →
            </Link>
            <Link to="/pricing"
              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', textDecoration: 'none' }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--fg)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
              View pricing →
            </Link>
          </div>
        </div>

      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────── Export ── */
export default function Landing() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--fg)', minHeight: '100vh' }}>
      <LandingHeader />
      <HomeHero />
      <HowItWorks />
      <BotsSection />
      <Pipeline />
      <Strategies />
      <CTA />
      <LandingFooter />
    </div>
  );
}
