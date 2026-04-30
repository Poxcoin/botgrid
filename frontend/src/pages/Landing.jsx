import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import SpiralText from '@/components/shared/SpiralText';

const W = { maxWidth: 1120, margin: '0 auto', padding: '0 40px' };

/* ── Hero ─────────────────────────────────────────────────────────────────── */
function HomeHero() {
  const [in_, setIn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setIn(true), 80); return () => clearTimeout(t); }, []);
  const f = d => ({ opacity: in_ ? 1 : 0, transform: in_ ? 'none' : 'translateY(20px)', transition: `opacity 600ms ${d}ms ease, transform 600ms ${d}ms ease` });

  return (
    <section style={{ minHeight: '96vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', borderBottom: '1px solid var(--border)' }}>
      <div style={{ ...W, paddingTop: 120, paddingBottom: 80 }}>

        {/* Live badge */}
        <div style={{ ...f(0), display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 48 }}>
          <span style={{ width: 6, height: 6, background: 'var(--fg)', display: 'inline-block', borderRadius: '50%', animation: 'blink 2s ease-in-out infinite' }} />
          BYBIT PERPETUAL FUTURES · PRIVATE BETA
        </div>

        {/* KADO — big spiral reveal */}
        <div style={{ ...f(60), marginBottom: 32 }}>
          <SpiralText
            text="KADO"
            style={{ fontSize: 'clamp(96px, 18vw, 220px)', fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.85, color: 'var(--fg)' }}
          />
        </div>

        {/* Tagline */}
        <h1 style={{ ...f(100), fontSize: 'clamp(18px, 2.5vw, 28px)', fontWeight: 400, letterSpacing: '-0.01em', lineHeight: 1.3, color: 'var(--muted-fg)', margin: '0 0 20px', maxWidth: 640 }}>
          Autonomous trading intelligence.<br />
          Five bots, one platform, no custody.
        </h1>

        {/* Description */}
        <p style={{ ...f(160), fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.9, color: 'var(--muted)', maxWidth: 500, margin: '0 0 48px' }}>
          AI news scanner · ATR grid · listing sniper · funding rate arb · DEX hunter.<br />
          Connect your API key. We never touch your funds.
        </p>

        {/* CTAs */}
        <div style={{ ...f(220), display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <Link to="/waitlist" style={{ display: 'inline-flex', alignItems: 'center', height: 50, padding: '0 36px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', textDecoration: 'none', background: 'var(--fg)', color: 'var(--bg)', fontWeight: 700 }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.82'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
            Join Waitlist →
          </Link>
          <Link to="/pricing" style={{ display: 'inline-flex', alignItems: 'center', height: 50, padding: '0 36px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', textDecoration: 'none', border: '1px solid var(--border)', color: 'var(--fg)' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--fg)'}
            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}>
            View Pricing
          </Link>
        </div>
      </div>

      {/* Stats strip — full width */}
      <div style={{ borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
        <div style={{ ...W, padding: '0 40px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)' }}>
            {[
              { val: '5',    label: 'Active bots' },
              { val: '~5s',  label: 'Signal latency' },
              { val: '30',   label: 'FR markets' },
              { val: '10',   label: 'Whale wallets' },
              { val: '3%',   label: 'Max daily loss' },
              { val: '24/7', label: 'Uptime' },
            ].map((s, i) => (
              <div key={s.label} style={{ padding: '28px 0', textAlign: 'center', borderRight: i < 5 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(20px, 2.8vw, 32px)', fontWeight: 900, letterSpacing: '-0.04em', color: 'var(--fg)', lineHeight: 1 }}>{s.val}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 8 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Bots ─────────────────────────────────────────────────────────────────── */
const BOTS = [
  { num: '01', name: 'News Intelligence', stat: 'Score ≥ 8.0 · Dynamic lev', desc: 'Monitors 6 Telegram channels via Telethon (~5s latency). Groq LLaMA scores each signal with 8 factors: sentiment, whale activity, volume, RSI, funding rate, OI, liquidations, Fear & Greed.' },
  { num: '02', name: 'Grid Trading',      stat: '5 coins · 2–3× · ATR-spaced', desc: 'Parallel ATR-adaptive grids on BTC · ETH · SOL · DOGE · XRP. Buys each level down, sells up. BTC correlation filter pauses during dumps. Hard stop at −3% daily.' },
  { num: '03', name: 'Listing Sniper',    stat: '5× · TP +10% / +20%', desc: 'Polls Binance & Bybit APIs every 30s. DEX filter skips coins already pumped >$100K. Partial TP1 at +10%, trailing stop on remainder.' },
  { num: '04', name: 'Funding Rate Arb',  stat: '30 coins · 15m cycle', desc: 'Mean-reversion on 30 perpetuals. FR > 0.04% + RSI > 65 → SHORT. FR < −0.04% + RSI < 35 → LONG. Three-tier sizing up to 1.5× on extreme rates.' },
  { num: '05', name: 'Whale Tracker',     stat: '10 wallets · WebSocket', desc: 'Tracks 10 whale wallets via Alchemy WebSocket on-chain. Large buy/sell triggers immediate signal at reduced threshold (5.0 vs 8.0). Real smart money data.' },
  { num: '06', name: 'DEX Sniper',        stat: 'BSC · GoPlus safety', desc: 'Subscribes to PancakeSwap V2 PairCreated events. GoPlus safety check: honeypot, buy/sell tax, owner renounced. Clean contracts only. TP +100%, SL −50%.' },
];

function BotsSection() {
  return (
    <section style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ ...W }}>
        {/* Section header */}
        <div style={{ padding: '72px 0 48px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>01 — The Arsenal</div>
            <h2 style={{ fontSize: 'clamp(36px, 5vw, 72px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.9, margin: 0 }}>Six bots.<br />One edge.</h2>
          </div>
          <Link to="/bots" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', textDecoration: 'none', flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--fg)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
            Full docs →
          </Link>
        </div>
      </div>

      {/* Grid — no max-width constraint */}
      <div style={{ borderBottom: '1px solid var(--border)' }}>
        <div style={{ ...W }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            {BOTS.map((bot, i) => (
              <Link key={bot.num} to="/bots" style={{
                display: 'block', textDecoration: 'none', color: 'var(--fg)',
                padding: '40px 0',
                paddingRight: (i % 3 < 2) ? 40 : 0,
                paddingLeft: (i % 3 > 0) ? 40 : 0,
                borderRight: (i % 3 < 2) ? '1px solid var(--border)' : 'none',
                borderBottom: i < 3 ? '1px solid var(--border)' : 'none',
                transition: 'opacity 150ms',
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.3em', color: 'var(--muted)', marginBottom: 20 }}>{bot.num}</div>
                <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, marginBottom: 14 }}>{bot.name}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.85, color: 'var(--muted-fg)', marginBottom: 24 }}>{bot.desc}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', border: '1px solid var(--border)', padding: '4px 12px', display: 'inline-block' }}>
                  {bot.stat}
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Pipeline ─────────────────────────────────────────────────────────────── */
const PIPELINE = [
  { n: '01', title: 'Ingestion',   body: 'Telegram userbot, exchange announcement APIs, 10 whale wallets via Alchemy WebSocket, funding rates on 30 perpetuals every 15 min.' },
  { n: '02', title: 'AI Scoring',  body: 'Groq LLaMA pre-filters noise in <100ms. 8 market-context factors: sentiment, whale signal, RSI, funding rate, OI, liquidations, volume, Fear & Greed.' },
  { n: '03', title: 'Risk Filter', body: 'Score threshold 8.0+ (9.0 for BTC/ETH). BTC dump block. Max 3 concurrent positions. Post-trade analyzer pauses underperforming coins.' },
  { n: '04', title: 'Execution',   body: 'Dynamic leverage 2–5×. Partial TP: 50% at target, remainder trails. 3-level retry for Bybit price-range errors. SL via exchange native order.' },
];

function Pipeline() {
  return (
    <section style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ ...W }}>
        <div style={{ padding: '72px 0 48px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>02 — Signal Pipeline</div>
          <h2 style={{ fontSize: 'clamp(36px, 5vw, 72px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.9, margin: 0 }}>
            From news<br />to order.
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {PIPELINE.map((s, i) => (
            <div key={s.n} style={{
              padding: '40px 0',
              paddingRight: i < 3 ? 40 : 0,
              paddingLeft: i > 0 ? 40 : 0,
              borderRight: i < 3 ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.3em', color: 'var(--muted)', marginBottom: 20 }}>{s.n}</div>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 16 }}>{s.title}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.85, color: 'var(--muted-fg)' }}>{s.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Strategies ───────────────────────────────────────────────────────────── */
const STRATS = [
  { n: '01', name: 'Conservative', returns: '3–8%',  risk: 25, desc: 'Grid bot only — 5 coins running ATR-adaptive grids 24/7. No directional bias. Earns on every oscillation. Hard stop −3% daily.' },
  { n: '02', name: 'Moderate',     returns: '10–25%', risk: 55, desc: 'Grid + AI news signals + funding rate arb. Three independent income streams. News bot adds directional alpha on high-confidence events.' },
  { n: '03', name: 'Aggressive',   returns: '50%+',   risk: 90, desc: 'All 5 bots active. Listing sniper targets 10–40% pumps within hours of CEX announcements. Maximum signal coverage, high variance.' },
];

function Strategies() {
  return (
    <section style={{ borderBottom: '1px solid var(--border)' }}>
      <div style={{ ...W }}>
        <div style={{ padding: '72px 0 48px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>03 — Strategies</div>
            <h2 style={{ fontSize: 'clamp(36px, 5vw, 72px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.9, margin: 0 }}>Pick your<br />risk profile.</h2>
          </div>
          <Link to="/strategies" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', textDecoration: 'none', flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--fg)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--muted)'}>
            Compare all →
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {STRATS.map((s, i) => (
            <Link key={s.n} to="/strategies" style={{
              display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'var(--fg)',
              padding: '40px 0',
              paddingRight: i < 2 ? 40 : 0,
              paddingLeft: i > 0 ? 40 : 0,
              borderRight: i < 2 ? '1px solid var(--border)' : 'none',
              transition: 'opacity 150ms',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.3em', color: 'var(--muted)', marginBottom: 20 }}>{s.n}</div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 16 }}>{s.name}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.85, color: 'var(--muted-fg)', flex: 1, marginBottom: 32 }}>{s.desc}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 6 }}>{s.returns}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 20 }}>Est. monthly</div>
              <div style={{ height: 1, background: 'var(--border)' }}>
                <div style={{ height: '100%', width: `${s.risk}%`, background: 'var(--fg)', opacity: 0.35 }} />
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 8 }}>Risk {s.risk}%</div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── CTA ──────────────────────────────────────────────────────────────────── */
function CTA() {
  return (
    <section>
      <div style={{ ...W, padding: '100px 40px' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 32 }}>04 — Access</div>
        <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 48 }}>
          <div>
            <h2 style={{ fontSize: 'clamp(48px, 7vw, 96px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 0.9, margin: '0 0 24px' }}>
              Start trading.<br />
              <span style={{ opacity: 0.35 }}>Intelligently.</span>
            </h2>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.9, color: 'var(--muted-fg)', maxWidth: 420 }}>
              Private beta. Connect your Bybit API key,
              pick a strategy. Funds stay on your exchange — we never custody assets.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start' }}>
            <Link to="/waitlist" style={{ display: 'inline-flex', alignItems: 'center', height: 52, padding: '0 40px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', textDecoration: 'none', background: 'var(--fg)', color: 'var(--bg)', fontWeight: 700 }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.82'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              Join Waitlist →
            </Link>
            <Link to="/pricing" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', textDecoration: 'none' }}
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

export default function Landing() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--fg)', minHeight: '100vh' }}>
      <LandingHeader />
      <HomeHero />
      <BotsSection />
      <Pipeline />
      <Strategies />
      <CTA />
      <LandingFooter />
    </div>
  );
}
