import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';

/* ── Hero ── */
function HomeHero() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 60); }, []);

  const fade = (delay) => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0)' : 'translateY(16px)',
    transition: `opacity 500ms ease ${delay}ms, transform 500ms ease ${delay}ms`,
  });

  return (
    <section style={{
      minHeight: '92vh',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      borderBottom: '1px solid var(--border)',
      padding: '0 0 80px',
    }}>
      <div className="px-6 md:px-10" style={{ maxWidth: 1100, paddingTop: 80 }}>

        {/* Eyebrow */}
        <div style={{ ...fade(0), fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 28, display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 6, height: 6, background: 'var(--fg)', display: 'inline-block', borderRadius: '50%', animation: 'blink 2s ease-in-out infinite' }} />
          BYBIT PERPETUAL FUTURES · PRIVATE BETA
        </div>

        {/* Main heading */}
        <h1 style={{
          ...fade(80),
          fontSize: 'clamp(56px, 10vw, 128px)',
          fontWeight: 900,
          letterSpacing: '-0.04em',
          lineHeight: 0.92,
          color: 'var(--fg)',
          margin: 0,
          maxWidth: 900,
        }}>
          Autonomous<br />
          trading<br />
          intelligence.
        </h1>

        {/* Description */}
        <p style={{
          ...fade(180),
          fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.9,
          color: 'var(--muted-fg)', marginTop: 36, maxWidth: 520,
        }}>
          Five specialized bots running in parallel 24/7 on Bybit Futures.
          AI news scanner, ATR grid, listing sniper, funding rate arb, DEX hunter.
          Connect your API key — no custody, no lock-in.
        </p>

        {/* CTAs */}
        <div style={{ ...fade(280), display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 44 }}>
          <Link to="/waitlist" style={{
            display: 'inline-flex', alignItems: 'center', height: 48, padding: '0 32px',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
            textDecoration: 'none', background: 'var(--fg)', color: 'var(--bg)', fontWeight: 700,
            transition: 'opacity 150ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
            Join Waitlist →
          </Link>
          <Link to="/bots" style={{
            display: 'inline-flex', alignItems: 'center', height: 48, padding: '0 32px',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
            textDecoration: 'none', border: '1px solid var(--border)', color: 'var(--fg)',
            transition: 'border-color 150ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--fg)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}>
            Explore Bots
          </Link>
        </div>
      </div>

      {/* Stats strip */}
      <div style={{ ...fade(380), marginTop: 80, borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="grid grid-cols-3 md:grid-cols-6">
          {[
            { val: '5',   label: 'Active bots' },
            { val: '~5s', label: 'Signal latency' },
            { val: '30',  label: 'FR markets' },
            { val: '10',  label: 'Whale wallets' },
            { val: '3%',  label: 'Max daily loss' },
            { val: '24/7',label: 'Uptime' },
          ].map((s, i) => (
            <div key={s.label} style={{
              padding: '28px 24px', textAlign: 'center',
              borderRight: i < 5 ? '1px solid var(--border)' : 'none',
            }}>
              <div className="font-black" style={{ fontSize: 'clamp(22px, 3.5vw, 36px)', letterSpacing: '-0.04em', color: 'var(--fg)', lineHeight: 1 }}>{s.val}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 6 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── Bots ── */
const BOTS = [
  { num: '01', name: 'News Intelligence', stat: 'Score ≥ 8.0 · Dynamic leverage', desc: 'Monitors 6 Telegram channels via Telethon userbot (~5s latency). Claude Haiku scores each signal with an 8-factor formula: sentiment, whale activity, volume spike, RSI, funding rate, OI, liquidations, Fear & Greed.' },
  { num: '02', name: 'Grid Trading',       stat: '5 Coins · 2–3× lev · ATR-spaced', desc: 'Parallel ATR-adaptive grids on SOL · BTC · ETH · DOGE · XRP. Buys each level down, sells each level up. BTC correlation filter pauses new longs during market dumps. Hard stop at −3% daily.' },
  { num: '03', name: 'Listing Sniper',     stat: '5× · TP1 +10% · TP2 +20%', desc: 'Polls Binance & Bybit announcement APIs every 30s. DEX filter skips coins already pumped (GeckoTerminal >$100K). Partial TP1 at +10%, trailing stop on remainder to +20%.' },
  { num: '04', name: 'Funding Rate Arb',   stat: '30 coins · 15m cycle · Tiered', desc: 'Mean-reversion on 30 perpetuals. FR > 0.04% + RSI > 65 → SHORT. FR < −0.04% + RSI < 35 → LONG. Three-tier sizing: T3 (FR > 0.10%) gets 1.5× position.' },
  { num: '05', name: 'Whale Tracker',      stat: '10 wallets · WebSocket · Live', desc: 'Tracks 10 whale wallets via Alchemy WebSocket on-chain. Large buy/sell triggers immediate signal at reduced threshold (5.0 vs 8.0). Real smart money, not lagged exchange data.' },
  { num: '06', name: 'DEX Sniper',         stat: 'BSC · GoPlus safety · +100% TP', desc: 'Subscribes to PancakeSwap V2 PairCreated events on BSC. GoPlus safety check: honeypot, buy/sell tax, owner renounced. Clean contracts get 0.03 BNB entry. TP +100%, SL −50%.' },
];

function BotsSection() {
  return (
    <section style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="px-6 md:px-10 py-12" style={{ borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>01 / Bots</div>
          <h2 className="font-black" style={{ fontSize: 'clamp(32px, 5vw, 64px)', letterSpacing: '-0.04em', lineHeight: 0.92 }}>The Arsenal.</h2>
        </div>
        <Link to="/bots" className="hidden md:inline" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', textDecoration: 'none', transition: 'color 150ms', flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; }}>
          Full docs →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {BOTS.map((bot, i) => (
          <Link key={bot.num} to="/bots" style={{
            display: 'block', textDecoration: 'none', color: 'var(--fg)',
            padding: '2rem',
            borderRight: (i % 3 < 2) ? '1px solid var(--border)' : 'none',
            borderBottom: i < 3 ? '1px solid var(--border)' : 'none',
            transition: 'background 180ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.3em', color: 'var(--muted)', marginBottom: 16 }}>{bot.num}</div>
            <div className="font-black text-lg mb-3" style={{ letterSpacing: '-0.02em', lineHeight: 1.1 }}>{bot.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.8, color: 'var(--muted-fg)', marginBottom: 20 }}>{bot.desc}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', border: '1px solid var(--border)', padding: '3px 10px', display: 'inline-block' }}>
              {bot.stat}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── Pipeline ── */
const PIPELINE = [
  { n: '01', title: 'Ingestion', body: 'Telegram userbot, exchange announcement APIs, 10 whale wallets via Alchemy WebSocket, funding rates on 30 perpetuals every 15 min.' },
  { n: '02', title: 'AI Scoring', body: 'Groq pre-filters noise in <100ms. Claude Haiku scores coin, direction, confidence with 8 market-context factors.' },
  { n: '03', title: 'Risk Filter', body: 'Score threshold 8.0+ (9.0 BTC/ETH). BTC dump block. Max 3 concurrent positions. Post-trade analyzer pauses underperformers.' },
  { n: '04', title: 'Execution', body: 'Dynamic leverage 2–5×. Partial TP: 50% at target, remainder trails. 3-level retry for Bybit price-range errors.' },
];

function Pipeline() {
  return (
    <section style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="px-6 md:px-10 py-12" style={{ borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>02 / Pipeline</div>
        <h2 className="font-black" style={{ fontSize: 'clamp(32px, 5vw, 64px)', letterSpacing: '-0.04em', lineHeight: 0.92 }}>
          From news<br />to order.
        </h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4">
        {PIPELINE.map((s, i) => (
          <div key={s.n} style={{ padding: '2rem', borderRight: i < 3 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.3em', color: 'var(--muted)', marginBottom: 16 }}>{s.n}</div>
            <div className="font-black text-lg mb-4" style={{ letterSpacing: '-0.02em' }}>{s.title}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.8, color: 'var(--muted-fg)' }}>{s.body}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Strategies ── */
const STRATS = [
  { n: '01', name: 'Conservative', returns: '3–8%',  risk: 25, desc: 'Grid bot only — 5 coins running ATR-adaptive grids 24/7. No directional bias. Earns on every oscillation. Hard stop −3% daily.' },
  { n: '02', name: 'Moderate',     returns: '10–25%', risk: 55, desc: 'Grid + AI news signals + funding rate arb. Three independent income streams. News bot adds directional alpha on high-confidence events.' },
  { n: '03', name: 'Aggressive',   returns: '50%+',   risk: 90, desc: 'All 5 bots active. Listing sniper targets 10–40% pumps within hours of CEX announcements. Maximum signal coverage, high variance.' },
];

function Strategies() {
  return (
    <section style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="px-6 md:px-10 py-12" style={{ borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>03 / Strategies</div>
          <h2 className="font-black" style={{ fontSize: 'clamp(32px, 5vw, 64px)', letterSpacing: '-0.04em', lineHeight: 0.92 }}>Pick your<br />risk profile.</h2>
        </div>
        <Link to="/strategies" className="hidden md:inline" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', textDecoration: 'none', transition: 'color 150ms', flexShrink: 0 }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; }}>
          Compare all →
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3">
        {STRATS.map((s, i) => (
          <Link key={s.n} to="/strategies" style={{
            display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'var(--fg)',
            padding: '2rem',
            borderRight: i < 2 ? '1px solid var(--border)' : 'none',
            transition: 'background 180ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.3em', color: 'var(--muted)', marginBottom: 16 }}>{s.n}</div>
            <div className="font-black text-2xl mb-3" style={{ letterSpacing: '-0.03em' }}>{s.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.8, color: 'var(--muted-fg)', flex: 1, marginBottom: 24 }}>{s.desc}</div>
            <div className="font-black" style={{ fontSize: 'clamp(32px, 4vw, 48px)', letterSpacing: '-0.04em', lineHeight: 1, marginBottom: 4 }}>{s.returns}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>Est. / month</div>
            <div style={{ height: 1, background: 'var(--border)' }}>
              <div style={{ height: '100%', width: `${s.risk}%`, background: 'var(--fg)', opacity: 0.4 }} />
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 6 }}>Risk {s.risk}%</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── CTA ── */
function CTA() {
  return (
    <section style={{ padding: '6rem 0' }}>
      <div className="px-6 md:px-10">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 24 }}>04 / Access</div>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-10">
          <div>
            <h2 className="font-black" style={{ fontSize: 'clamp(40px, 7vw, 88px)', letterSpacing: '-0.04em', lineHeight: 0.92 }}>
              Start trading.<br />
              <span style={{ opacity: 0.4 }}>Intelligently.</span>
            </h2>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.9, color: 'var(--muted-fg)', maxWidth: 440, marginTop: 20 }}>
              Private beta. Connect your Bybit API key,
              pick a strategy. Funds stay on your exchange — we never custody assets.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', flexShrink: 0 }}>
            <Link to="/waitlist" style={{
              display: 'inline-flex', alignItems: 'center', height: 52, padding: '0 36px',
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase',
              textDecoration: 'none', background: 'var(--fg)', color: 'var(--bg)', fontWeight: 700,
              transition: 'opacity 150ms',
            }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}>
              Join Waitlist →
            </Link>
            <Link to="/pricing" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)', textDecoration: 'none', transition: 'color 150ms' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; }}>
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
