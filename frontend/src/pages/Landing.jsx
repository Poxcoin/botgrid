import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';

const W = '#ffffff';
const WD = 'rgba(255,255,255,0.55)';

/* ── Hero ──────────────────────────────────────────────────────────────────── */
function HomeHero() {
  const [glitch, setGlitch] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 80); }, []);

  return (
    <section style={{
      minHeight: '100vh', position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Corner tags */}
      <div style={{ position: 'absolute', top: 24, left: 32, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', animation: 'labelPulse 4s ease-in-out infinite' }}>
        [ LIVE / v1.0 ]
      </div>
      <div style={{ position: 'absolute', top: 24, right: 32, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 6, height: 6, background: W, borderRadius: '50%', animation: 'blink 1.5s ease-in-out infinite', opacity: 0.8 }} />
        BYBIT · PERP FUTURES
      </div>
      <div style={{ position: 'absolute', bottom: 56, left: 32, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', opacity: 0.5 }}>
        KADO.AI
      </div>
      <div style={{ position: 'absolute', bottom: 56, right: 32, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', opacity: 0.5 }}>
        EST. 2026
      </div>

      <div style={{ textAlign: 'center', position: 'relative', zIndex: 2, padding: '0 24px', maxWidth: 900, width: '100%' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.4em', textTransform: 'uppercase',
          color: 'var(--muted)', marginBottom: 32, display: 'inline-block',
          border: '1px solid rgba(255,255,255,0.15)', padding: '4px 14px',
          animation: 'labelPulse 4s ease-in-out infinite',
          opacity: mounted ? 1 : 0, transition: 'opacity 500ms',
        }}>
          AI-DRIVEN SIGNAL INTELLIGENCE
        </div>

        <h1
          onMouseEnter={() => setGlitch(true)}
          onMouseLeave={() => setGlitch(false)}
          style={{
            fontSize: 'clamp(88px, 22vw, 280px)',
            fontWeight: 900,
            letterSpacing: '-0.06em',
            lineHeight: 0.82,
            margin: '0 auto',
            color: W,
            cursor: 'default',
            userSelect: 'none',
            animation: glitch ? 'glitch 0.35s linear' : 'none',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity 600ms ease 100ms, transform 600ms ease 100ms',
          }}
        >
          KADO
        </h1>

        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '0.05em', lineHeight: 1.8,
          color: WD, marginTop: 32, maxWidth: 580, marginLeft: 'auto', marginRight: 'auto',
          opacity: mounted ? 1 : 0, transition: 'opacity 600ms ease 300ms',
        }}>
          5 autonomous trading bots — AI news scanner, 5-coin grid, listing sniper, funding rate arb, DEX hunter —
          running 24/7 on Bybit Perpetual Futures.
        </p>

        <div style={{
          display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 24,
          opacity: mounted ? 1 : 0, transition: 'opacity 600ms ease 450ms',
        }}>
          {['Claude Haiku AI', '5s Signal Latency', 'Whale Tracking', 'Funding Rate Arb', 'Live 24/7'].map((t, i) => (
            <span key={t} style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase',
              border: '1px solid rgba(255,255,255,0.15)', padding: '4px 12px', color: 'var(--muted)',
              animation: `flickerBox ${2.5 + i * 0.4}s ease-in-out ${i * 0.2}s infinite`,
            }}>
              {t}
            </span>
          ))}
        </div>

        <div style={{
          display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 12, marginTop: 44,
          opacity: mounted ? 1 : 0, transition: 'opacity 600ms ease 600ms',
        }}>
          <Link to="/waitlist" style={{
            display: 'inline-flex', alignItems: 'center', gap: 10, height: 46, padding: '0 32px',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase',
            textDecoration: 'none', background: W, color: '#000', fontWeight: 700,
            transition: 'all 200ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.85)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = W; }}>
            Join Waitlist →
          </Link>
          <Link to="/bots" style={{
            display: 'inline-flex', alignItems: 'center', gap: 10, height: 46, padding: '0 32px',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase',
            textDecoration: 'none', border: '1px solid rgba(255,255,255,0.25)', color: W,
            transition: 'all 200ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            Explore Bots
          </Link>
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 40,
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)',
      }}>
        <span style={{ animation: 'blink 2s ease-in-out infinite' }}>↓ Scroll to explore</span>
        <span className="hidden md:inline">Intelligence feeds. Signals execute. Risk is managed.</span>
        <span>5 BOTS · 1 SYSTEM</span>
      </div>
    </section>
  );
}

/* ── Bot Preview Cards ─────────────────────────────────────────────────────── */
const BOT_CARDS = [
  {
    num: '01', name: 'News Intelligence', href: '/bots',
    desc: 'Monitors 6 Telegram channels in real-time via Telethon userbot (~5s latency). Claude Haiku scores every signal through an 8-factor formula: sentiment, whale activity, volume spike, RSI, funding rate, OI, liquidations, Fear & Greed.',
    stat: 'Score ≥ 8.0 · Dynamic Leverage',
  },
  {
    num: '02', name: 'Grid Trading', href: '/bots',
    desc: 'Parallel ATR-adaptive grids on SOL · BTC · ETH · DOGE · XRP. Buys at each level down, sells at each level up. BTC correlation filter pauses new longs during market dumps. Hard stop at −3% daily loss.',
    stat: '5 Coins · 2–3× Lev · ATR-spaced',
  },
  {
    num: '03', name: 'Listing Sniper', href: '/bots',
    desc: 'Polls Binance & Bybit announcement APIs every 30s. Filters DEX-pumped coins via GeckoTerminal (>$100K volume = skip). Partial TP1 at +10%, full TP2 at +20% via trailing stop. Enters before the retail crowd.',
    stat: '5× · TP1 +10% · TP2 +20%',
  },
  {
    num: '04', name: 'Funding Rate Arb', href: '/bots',
    desc: 'Mean-reversion strategy across 30 perpetual markets. FR > 0.04% + RSI > 65 → SHORT (longs overpaying). FR < −0.04% + RSI < 35 → LONG (shorts getting squeezed). Tiered size: T3 (>0.10%) gets 1.5× position.',
    stat: '30 coins · 15m cycle · Tiered',
  },
  {
    num: '05', name: 'Whale Tracker', href: '/bots',
    desc: 'Tracks 10 known whale wallet addresses via Alchemy WebSocket on-chain. Any large buy or sell triggers an immediate signal with reduced score threshold (5.0 vs 8.0). Real smart money — not lagged exchange data.',
    stat: '10 Wallets · WebSocket · Live',
  },
  {
    num: '06', name: 'DEX Sniper', href: '/bots',
    desc: 'Subscribes to PancakeSwap V2 PairCreated events on BSC. Each new pool passes GoPlus safety check: honeypot detection, buy/sell tax, owner renounced. Clean contracts get 0.03 BNB entry. TP +100%, SL −50%.',
    stat: 'BSC · GoPlus Safety · +100% TP',
  },
];

function BotPreview() {
  return (
    <section style={{ borderBottom: '1px solid var(--border)', color: 'var(--fg)' }}>
      <div className="px-6 md:px-10 py-12 flex items-end justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>[ 01 / BOTS ]</div>
          <h2 className="font-black tracking-[-0.04em] leading-[0.88]" style={{ fontSize: 'clamp(36px, 6vw, 72px)' }}>The Arsenal.</h2>
        </div>
        <Link to="/bots" style={{
          display: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
          color: W, textDecoration: 'none', opacity: 0.5, transition: 'opacity 200ms',
        }} className="md:block"
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; }}>
          Full Documentation →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {BOT_CARDS.map((bot, i) => (
          <Link key={bot.num} to={bot.href} style={{
            textDecoration: 'none', color: 'var(--fg)',
            borderRight: (i % 3 < 2) ? '1px solid var(--border)' : 'none',
            borderBottom: i < 3 ? '1px solid var(--border)' : 'none',
            padding: '2rem 2rem 2.5rem',
            display: 'block',
            transition: 'background 200ms',
            position: 'relative',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: WD, marginBottom: 20, opacity: 0.6 }}>{bot.num}</div>
            <div className="font-black text-xl mb-3" style={{ letterSpacing: '-0.02em', lineHeight: 1.1 }}>{bot.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.8, color: 'var(--muted-fg)', marginBottom: 24 }}>{bot.desc}</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
              border: '1px solid rgba(255,255,255,0.2)', color: W, padding: '3px 10px', display: 'inline-block', opacity: 0.7,
            }}>
              {bot.stat}
            </div>
            <div style={{ position: 'absolute', bottom: 20, right: 20, fontFamily: 'var(--font-mono)', fontSize: 10, color: W, opacity: 0.3 }}>→</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── How it works ──────────────────────────────────────────────────────────── */
const SIGNAL_FLOW = [
  { step: '01', title: 'Signal Ingestion', body: 'Telegram userbot receives breaking news across 6 curated crypto channels. Binance & Bybit announcement APIs polled every 30s. 10 whale wallets streamed live via Alchemy WebSocket. Funding rates scanned every 15 minutes across 30 perpetuals.' },
  { step: '02', title: 'AI Scoring', body: 'Groq LLaMA pre-filters noise in <100ms. Claude Haiku deep-analyzes each signal and scores coin, direction, confidence. 8-factor formula adds market context: volume spike, RSI, BTC correlation, Fear & Greed, OI delta, liquidation cascade, whale side.' },
  { step: '03', title: 'Risk Filtering', body: 'Score must clear 8.0 threshold (9.0 for BTC/ETH). BTC correlation filter blocks altcoin longs when BTC drops >2.5% in 2h. Post-trade analyzer pauses underperforming coins. Exposure cap: max 3 concurrent positions = 15% of balance.' },
  { step: '04', title: 'Execution', body: 'Dynamic leverage: base 2× (BTC/ETH) or 3× (alts), +1 at score ≥12, +2 at score ≥14. 3-level TP/SL retry handles Bybit price-range errors. Partial TP: 50% closes at target, remaining 50% trails at 2.5–3%. Position monitor force-closes stale trades.' },
];

function HowItWorks() {
  return (
    <section style={{ borderBottom: '1px solid var(--border)', color: 'var(--fg)' }}>
      <div className="px-6 md:px-10 py-12" style={{ borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>[ 02 / PIPELINE ]</div>
        <h2 className="font-black tracking-[-0.04em] leading-[0.88]" style={{ fontSize: 'clamp(36px, 6vw, 72px)' }}>From news<br />to order.</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {SIGNAL_FLOW.map((s, i) => (
          <div key={s.step} style={{
            borderRight: i < 3 ? '1px solid var(--border)' : 'none',
            padding: '2rem 2rem 2.5rem',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: WD, marginBottom: 16, opacity: 0.55 }}>{s.step}</div>
            <div className="font-black text-lg mb-4" style={{ letterSpacing: '-0.02em' }}>{s.title}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.8, color: 'var(--muted-fg)' }}>{s.body}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Strategy Preview ──────────────────────────────────────────────────────── */
const STRAT_CARDS = [
  {
    num: '01', name: 'Conservative', return: '3–8%', risk: 25,
    bots: ['Grid Bot'],
    desc: 'Grid bot only — SOL, BTC, ETH, DOGE, XRP running ATR-adaptive grids 24/7. No directional bias. Earns on every oscillation. Hard stop at −3% daily. Ideal for set-and-forget.',
  },
  {
    num: '02', name: 'Moderate', return: '10–25%', risk: 55,
    bots: ['Grid', 'News', 'Funding Rate'],
    desc: 'Grid base + AI news signals + funding rate arbitrage. Three independent income streams. News bot adds directional alpha on high-confidence events. FR arb captures mean-reversion on 30 perpetuals.',
  },
  {
    num: '03', name: 'Aggressive', return: '50%+', risk: 90,
    bots: ['All 5 Bots'],
    desc: 'Full stack active: grid + news + listing sniper + funding rate + DEX sniper. Maximum signal coverage. Listing sniper targets 10–40% pumps within hours of CEX announcements. High variance, high ceiling.',
  },
];

function StrategyPreview() {
  return (
    <section style={{ borderBottom: '1px solid var(--border)', color: 'var(--fg)' }}>
      <div className="px-6 md:px-10 py-12 flex items-end justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>[ 03 / STRATEGIES ]</div>
          <h2 className="font-black tracking-[-0.04em] leading-[0.88]" style={{ fontSize: 'clamp(36px, 6vw, 72px)' }}>Pick your<br />risk profile.</h2>
        </div>
        <Link to="/strategies" style={{
          display: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
          color: W, textDecoration: 'none', opacity: 0.5, transition: 'opacity 200ms',
        }} className="md:block"
          onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '0.5'; }}>
          Compare All →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3">
        {STRAT_CARDS.map((s, i) => (
          <Link key={s.num} to="/strategies" style={{
            textDecoration: 'none', color: 'var(--fg)',
            borderRight: i < 2 ? '1px solid var(--border)' : 'none',
            padding: '2rem 2rem 2.5rem',
            display: 'flex', flexDirection: 'column',
            transition: 'background 200ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: WD, marginBottom: 16, opacity: 0.55 }}>{s.num}</div>
            <div className="font-black text-2xl mb-3" style={{ letterSpacing: '-0.03em' }}>{s.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.8, color: 'var(--muted-fg)', marginBottom: 24, flex: 1 }}>{s.desc}</div>

            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 900, letterSpacing: '-0.04em', color: W, lineHeight: 1, marginBottom: 4 }}>{s.return}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>EST. / MONTH</div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
                <span>Risk</span><span style={{ color: W, opacity: 0.7 }}>{s.risk}%</span>
              </div>
              <div style={{ height: 2, background: 'var(--border)' }}>
                <div style={{ height: '100%', width: `${s.risk}%`, background: W, opacity: 0.5 }} />
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {s.bots.map(b => (
                <span key={b} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', border: '1px solid rgba(255,255,255,0.2)', color: W, padding: '2px 8px', opacity: 0.6 }}>{b}</span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── Stats Bar ─────────────────────────────────────────────────────────────── */
function StatsRow() {
  const stats = [
    { val: '5', label: 'Active Bots' },
    { val: '~5s', label: 'Signal Latency' },
    { val: '30', label: 'FR Markets' },
    { val: '10', label: 'Whale Wallets' },
    { val: '3%', label: 'Max Daily Loss' },
    { val: '24/7', label: 'Uptime' },
  ];
  return (
    <section style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="grid grid-cols-3 md:grid-cols-6">
        {stats.map((s, i) => (
          <div key={s.label} style={{
            padding: '2rem 1.5rem', textAlign: 'center',
            borderRight: i < 5 ? '1px solid var(--border)' : 'none',
          }}>
            <div className="font-black" style={{ fontSize: 'clamp(24px, 4vw, 40px)', letterSpacing: '-0.04em', color: W, lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 8 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Home CTA ──────────────────────────────────────────────────────────────── */
function HomeCTA() {
  return (
    <section style={{ borderBottom: '1px solid var(--border)', padding: '5rem 0' }}>
      <div className="px-6 md:px-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-10">
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>[ 04 / ACCESS ]</div>
          <h2 className="font-black tracking-[-0.04em] leading-[0.88]" style={{ fontSize: 'clamp(40px, 7vw, 88px)' }}>
            Start trading.<br />
            <span style={{ color: W, opacity: 0.6 }}>Intelligently.</span>
          </h2>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.9, color: 'var(--muted-fg)', maxWidth: 460, marginTop: 20 }}>
            Currently in private beta. Join the waitlist — when your spot opens,
            connect your Bybit API key and pick a strategy. Your funds stay on
            your exchange. We never custody assets.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <Link to="/waitlist" style={{
            display: 'inline-flex', alignItems: 'center', gap: 12, height: 52, padding: '0 36px',
            fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.25em', textTransform: 'uppercase',
            textDecoration: 'none', background: W, color: '#000', fontWeight: 700,
            transition: 'all 200ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.85)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = W; }}>
            Join Waitlist →
          </Link>
          <Link to="/pricing" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', textDecoration: 'none', transition: 'color 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.color = W; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; }}>
            View Pricing →
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */
export default function Landing() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--fg)', minHeight: '100vh' }}>
      <LandingHeader />
      <HomeHero />
      <BotPreview />
      <HowItWorks />
      <StrategyPreview />
      <StatsRow />
      <HomeCTA />
      <LandingFooter />
    </div>
  );
}
