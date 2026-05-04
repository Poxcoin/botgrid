import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import SpiralText from '@/components/shared/SpiralText';
import LiveChart from '@/components/landing/LiveChart';

const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif";
const MONO = "'Courier New','SF Mono',monospace";

/* ── HERO ── */
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
    <section style={{ background: '#060606' }}>
      <style>{`@keyframes kadoPulse{0%,100%{opacity:1}50%{opacity:0.4}}`}</style>

      {/* Two-column hero */}
      <div className="px-5 md:px-14" style={{
        maxWidth: 1100, margin: '0 auto',
        paddingTop: 100, paddingBottom: 80,
        display: 'flex', alignItems: 'center',
        gap: 48, flexWrap: 'wrap',
        fontFamily: FONT,
      }}>

        {/* Left — text */}
        <div style={{ flex: '1 1 340px', minWidth: 0 }}>
          <div style={fade(0, {
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 100, padding: '6px 18px', fontSize: 11, color: '#888',
            letterSpacing: '0.04em', marginBottom: 32,
          })}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0, animation: 'kadoPulse 2s ease-in-out infinite' }} />
            Private Beta · Multi-Exchange · Live
          </div>

          <div style={fade(60)}>
            <SpiralText
              text="KADO"
              style={{ fontSize: 'clamp(64px,10vw,120px)', fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.87, color: '#fff', fontFamily: MONO }}
            />
          </div>

          <div style={fade(120, { fontSize: 'clamp(16px,2vw,20px)', fontWeight: 400, color: '#999', lineHeight: 1.5, letterSpacing: '-0.02em', margin: '24px 0 14px' })}>
            Six AI-powered bots trading crypto futures<br />around the clock — while you do anything else.
          </div>

          <p style={fade(170, { fontSize: 14, color: '#666', lineHeight: 1.8, maxWidth: 440, margin: '0 0 40px' })}>
            Connect your API key. Choose a strategy. Watch the bots trade. Your funds never leave your exchange — we only send orders on your behalf.
          </p>

          <div style={fade(220, { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' })}>
            <Link to="/auth?mode=register" style={{
              background: '#fff', color: '#000', padding: '14px 36px', borderRadius: 100,
              fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
              transition: 'opacity 150ms',
            }}
              onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
              onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
              Get Started →
            </Link>
            <a href="#how-it-works" style={{
              color: '#888', fontSize: 13, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6,
              transition: 'color 150ms',
            }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = '#888'}>
              See how it works ↓
            </a>
          </div>
        </div>

        {/* Right — live chart (hidden on mobile) */}
        <div className="hidden md:block" style={fade(300, { flex: '0 0 380px' })}>
          <LiveChart />
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="grid grid-cols-3 md:grid-cols-6" style={{ maxWidth: 1100, margin: '0 auto' }} >
          {[
            { v: '6',      l: 'Autonomous bots' },
            { v: '24/7',   l: 'Runtime' },
            { v: '<5s',    l: 'Signal latency' },
            { v: '8',      l: 'Score factors' },
            { v: '<100ms', l: 'AI analysis' },
            { v: '4',      l: 'Pipeline stages' },
          ].map((s, i) => (
            <div key={i} className="px-5 md:px-0" style={{
              padding: '30px 0', textAlign: 'center',
              borderRight: i < 5 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}>
              <div style={{ fontSize: 'clamp(20px,2.2vw,28px)', fontWeight: 700, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, fontFamily: MONO }}>{s.v}</div>
              <div style={{ fontSize: 10, color: '#555', marginTop: 8, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1.4, fontFamily: FONT }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── HOW IT WORKS ── */
function HowItWorks() {
  return (
    <section id="how-it-works" style={{ background: '#060606' }}>
      <div className="px-5 md:px-14" style={{ maxWidth: 1100, margin: '0 auto', padding: '100px 56px', textAlign: 'center', fontFamily: FONT }}>
        <div style={{ fontSize: 11, color: '#666', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>Setup in 60 seconds</div>
        <div style={{ fontSize: 'clamp(36px,4.5vw,52px)', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.0, color: '#fff', marginBottom: 14 }}>Three steps. Then step back.</div>
        <div style={{ fontSize: 16, color: '#666', lineHeight: 1.7, maxWidth: 560, margin: '0 auto 60px' }}>No code. No constant monitoring. Connect once, choose your strategy, and let the bots handle everything else.</div>

        <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
          {[
            { n: '01', title: 'Connect your exchange', body: 'Generate an API key with trade permissions. Paste it into your KADO dashboard. Your funds never leave — we only place orders on your behalf.' },
            { n: '02', title: 'Choose your strategy', body: 'Run one bot or all six. Conservative grids for steady income. AI news signals for directional alpha. Full suite for maximum coverage. Change any time.' },
            { n: '03', title: 'Let the bots trade', body: 'Everything activates in under 60 seconds. Monitor live signals, open positions, and monthly PnL from your dashboard. No coding required.' },
          ].map(s => (
            <div key={s.n} style={{ background: '#0a0a0a', padding: '44px 36px', textAlign: 'left' }}>
              <div style={{ fontSize: 11, color: '#444', letterSpacing: '0.12em', fontFamily: MONO, marginBottom: 24 }}>{s.n}</div>
              <div style={{ fontSize: 19, fontWeight: 600, color: '#fff', marginBottom: 14, letterSpacing: '-0.02em' }}>{s.title}</div>
              <div style={{ fontSize: 13, color: '#777', lineHeight: 1.85 }}>{s.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── BOTS ── */
const BOTS = [
  { num: '01', tag: 'AI-SCORED', name: 'News Intelligence', hook: 'Reads the market before you can.', desc: 'Monitors 6 crypto Telegram channels with <5s latency. Groq LLaMA evaluates every event across 8 market factors — sentiment, whale activity, RSI, funding rate, OI, liquidations, volume, Fear & Greed. Only enters when confidence score reaches 8.0+.', pills: ['Score ≥ 8.0', 'Dynamic 2–5× leverage', '8 factors'] },
  { num: '02', tag: 'BTC · ETH · SOL · DOGE · XRP', name: 'Grid Trading', hook: 'Earns whether price goes up or down.', desc: 'ATR-adaptive grids running 24/7 on 5 major coins. Places layered buy and sell orders at mathematically optimal levels, capturing profit from every oscillation. BTC correlation filter auto-pauses during broad market dumps.', pills: ['5 coins', 'ATR spacing', 'Auto-pause on dumps'] },
  { num: '03', tag: 'BINANCE · BYBIT · 30s', name: 'Listing Sniper', hook: 'In before the crowd finishes reading.', desc: 'Checks Binance and Bybit listing APIs every 30 seconds. The moment a new listing goes live, it enters automatically. DEX filter skips coins already pumped >$100K. Partial take-profit at +10%, trailing stop on the remainder.', pills: ['TP1 +10%', 'DEX filter', '5× leverage'] },
  { num: '04', tag: '30 PERPS · 15-MIN CYCLE', name: 'Funding Rate Arb', hook: 'Profits when perpetuals diverge from spot.', desc: 'Scans 30 perpetual markets every 15 minutes. Elevated funding + overbought RSI → SHORT. Negative funding + oversold RSI → LONG. Three-tier position sizing amplifies on the most extreme setups.', pills: ['30 markets', 'FR >0.04%', '3-tier sizing'] },
  { num: '05', tag: '10 WALLETS · WEBSOCKET', name: 'Whale Tracker', hook: 'Follow the wallets that move markets.', desc: 'Tracks 10 high-conviction on-chain wallets via real-time Alchemy WebSocket feeds. When a whale makes a significant move, the confidence threshold drops from 8.0 to 5.0 and the bot enters immediately. Real smart money data.', pills: ['10 wallets', 'Real-time', 'Threshold 5.0'] },
  { num: '06', tag: 'BSC · PANCAKESWAP V2', name: 'DEX Sniper', hook: 'New launches, safety-checked in real time.', desc: 'Listens for PancakeSwap V2 PairCreated events on BSC. Every new token verified by GoPlus: honeypot detection, buy/sell tax check, owner renounced. Clean contracts only. Target +100%, hard stop at −50%.', pills: ['GoPlus safety', 'TP +100%', 'SL −50%'] },
];

function BotsSection() {
  return (
    <section style={{ background: '#060606' }}>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-5 md:px-14" style={{ maxWidth: 1100, margin: '0 auto', padding: '100px 56px', textAlign: 'center', fontFamily: FONT }}>
          <div style={{ fontSize: 11, color: '#666', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>The Arsenal</div>
          <div style={{ fontSize: 'clamp(36px,4.5vw,52px)', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.0, color: '#fff', marginBottom: 14 }}>Six strategies. One platform.</div>
          <div style={{ fontSize: 16, color: '#666', lineHeight: 1.7, maxWidth: 560, margin: '0 auto 60px' }}>Each bot is independent, specialized, and running 24/7. Together they cover every major market opportunity across exchanges.</div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3" style={{ gap: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
            {BOTS.map(bot => (
              <Link key={bot.num} to="/bots" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ background: '#0a0a0a', padding: '44px 36px', textAlign: 'left', transition: 'background 200ms', cursor: 'pointer', height: '100%' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#0f0f0f'}
                  onMouseLeave={e => e.currentTarget.style.background = '#0a0a0a'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                    <span style={{ fontSize: 11, color: '#444', fontFamily: MONO, letterSpacing: '0.1em' }}>{bot.num}</span>
                    <span style={{ fontSize: 9, color: '#999', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 100, padding: '3px 10px', letterSpacing: '0.05em', maxWidth: 140, textAlign: 'right', lineHeight: 1.4, fontFamily: FONT }}>{bot.tag}</span>
                  </div>
                  <div style={{ fontSize: 19, fontWeight: 700, color: '#fff', marginBottom: 8, letterSpacing: '-0.03em' }}>{bot.name}</div>
                  <div style={{ fontSize: 13, color: '#666', fontStyle: 'italic', marginBottom: 18, lineHeight: 1.5 }}>{bot.hook}</div>
                  <div style={{ fontSize: 12, color: '#777', lineHeight: 1.9 }}>{bot.desc}</div>
                  <div style={{ marginTop: 24, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {bot.pills.map(p => (
                      <span key={p} style={{ fontSize: 9, color: '#777', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 100, padding: '3px 10px', letterSpacing: '0.04em', fontFamily: FONT }}>{p}</span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── PIPELINE ── */
const PIPE_STEPS = [
  { n: '01', title: 'Ingest', body: 'Telegram userbot on 6 channels. Exchange APIs polled every 30s. 10 whale wallets via Alchemy WebSocket. Funding rates across 30 markets every 15 min.' },
  { n: '02', title: 'Score', body: 'Groq LLaMA evaluates every signal in <100ms across 8 market factors. Filters noise. Only high-confidence signals (≥8.0) move forward.' },
  { n: '03', title: 'Filter', body: 'BTC correlation check. Max 3 concurrent positions. Post-trade analysis automatically pauses underperforming coins.' },
  { n: '04', title: 'Execute', body: 'Dynamic leverage 2–5×. 50% take-profit at target, remainder trails. 3-level retry on price errors. SL via native exchange order.' },
];

function Pipeline() {
  return (
    <section style={{ background: '#060606' }}>
      <div className="px-5 md:px-14" style={{ maxWidth: 1100, margin: '0 auto', padding: '100px 56px', textAlign: 'center', fontFamily: FONT }}>
        <div style={{ fontSize: 11, color: '#666', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>Under the hood</div>
        <div style={{ fontSize: 'clamp(36px,4.5vw,52px)', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.0, color: '#fff', marginBottom: 14 }}>Signal in. Order out.</div>
        <div style={{ fontSize: 16, color: '#666', lineHeight: 1.7, maxWidth: 560, margin: '0 auto 60px' }}>Every trade passes through a four-stage pipeline — from raw market data to executed order in under 5 seconds.</div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4" style={{ gap: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
          {PIPE_STEPS.map(s => (
            <div key={s.n} style={{ background: '#0a0a0a', padding: '40px 28px', textAlign: 'left' }}>
              <div style={{ fontSize: 38, fontWeight: 700, color: 'rgba(255,255,255,0.06)', letterSpacing: '-0.04em', fontFamily: MONO, marginBottom: 18, lineHeight: 1 }}>{s.n}</div>
              <div style={{ fontSize: 17, fontWeight: 600, color: '#ccc', marginBottom: 12 }}>{s.title}</div>
              <div style={{ fontSize: 12, color: '#666', lineHeight: 1.9 }}>{s.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── STRATEGIES ── */
const STRATS = [
  { n: '01', name: 'Steady', summary: 'Consistent passive income from price oscillation. No directional bets, no speculation.', tags: ['Grid Trading'], ret: '3–8%', period: 'Est. monthly', note: 'Best for first-time users or conservative allocations.' },
  { n: '02', name: 'Balanced', summary: 'Grid income plus AI-driven news alpha and funding rate arbitrage. Three independent income streams.', tags: ['Grid Trading', 'News Intelligence', 'Funding Rate Arb'], ret: '10–25%', period: 'Est. monthly', note: 'For users who want multiple uncorrelated strategies working together.' },
  { n: '03', name: 'Full Suite', summary: 'All six bots active simultaneously. Maximum signal coverage across every market opportunity.', tags: ['All 6 bots active'], ret: '25%+', period: 'Est. monthly', note: 'For experienced traders who want complete automation.' },
];

function Strategies() {
  return (
    <section style={{ background: '#060606' }}>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-5 md:px-14" style={{ maxWidth: 1100, margin: '0 auto', padding: '100px 56px', textAlign: 'center', fontFamily: FONT }}>
          <div style={{ fontSize: 11, color: '#666', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16 }}>Strategies</div>
          <div style={{ fontSize: 'clamp(36px,4.5vw,52px)', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.0, color: '#fff', marginBottom: 14 }}>Find your match.</div>
          <div style={{ fontSize: 16, color: '#666', lineHeight: 1.7, maxWidth: 560, margin: '0 auto 60px' }}>Start with one bot. Scale to all six. Switch any time from your dashboard.</div>

          <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 16 }}>
            {STRATS.map(s => (
              <Link key={s.n} to="/strategies" style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{
                  background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16,
                  padding: '44px 36px', textAlign: 'left', transition: 'border-color 200ms', cursor: 'pointer',
                  height: '100%', display: 'flex', flexDirection: 'column',
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'}>
                  <div style={{ fontSize: 11, color: '#444', fontFamily: MONO, marginBottom: 18, letterSpacing: '0.1em' }}>{s.n}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#fff', marginBottom: 12, letterSpacing: '-0.03em' }}>{s.name}</div>
                  <div style={{ fontSize: 13, color: '#777', lineHeight: 1.75, marginBottom: 28, flex: 1 }}>{s.summary}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 32 }}>
                    {s.tags.map(t => (
                      <span key={t} style={{ fontSize: 10, color: '#888', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 100, padding: '4px 12px' }}>{t}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 'clamp(36px,4vw,48px)', fontWeight: 700, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, fontFamily: MONO, marginBottom: 6 }}>{s.ret}</div>
                  <div style={{ fontSize: 10, color: '#555', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 20 }}>{s.period}</div>
                  <div style={{ fontSize: 12, color: '#555', lineHeight: 1.7, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.05)' }}>{s.note}</div>
                </div>
              </Link>
            ))}
          </div>

          <div style={{ marginTop: 24, fontSize: 11, color: '#3a3a3a', lineHeight: 1.7 }}>
            Estimated returns are not guaranteed. Crypto trading carries inherent risk. Past performance does not guarantee future results.
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── CTA ── */
function CTA() {
  return (
    <section style={{ background: '#060606', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="px-5 md:px-14" style={{ maxWidth: 1100, margin: '0 auto', padding: '130px 56px', textAlign: 'center', fontFamily: FONT }}>
        <span style={{ fontSize: 'clamp(72px,12vw,120px)', fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.9, fontFamily: MONO, color: '#fff', display: 'block' }}>KADO</span>
        <span style={{ fontSize: 'clamp(22px,3vw,36px)', fontWeight: 700, letterSpacing: '0.22em', fontFamily: MONO, color: 'rgba(255,255,255,0.25)', display: 'block', marginTop: 10, textTransform: 'uppercase', marginBottom: 44 }}>CLUB</span>

        <div style={{ fontSize: 20, color: '#aaa', letterSpacing: '-0.02em', marginBottom: 14 }}>Your edge, automated.</div>
        <div style={{ fontSize: 14, color: '#666', lineHeight: 1.8, maxWidth: 440, margin: '0 auto 36px' }}>
          Private beta is open. Connect your exchange API key, choose a strategy, and let six bots trade for you around the clock. Your funds never leave your exchange.
        </div>

        <Link to="/auth?mode=register" style={{
          background: '#fff', color: '#000', padding: '14px 36px', borderRadius: 100,
          fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8,
          transition: 'opacity 150ms',
        }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
          Get Started →
        </Link>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
          {['No credit card required', 'Funds stay on your exchange', 'Cancel any time'].map(t => (
            <span key={t} style={{ fontSize: 10, color: '#555', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 100, padding: '4px 13px' }}>{t}</span>
          ))}
        </div>

        <div style={{ fontSize: 11, color: '#333', marginTop: 28, lineHeight: 1.6 }}>
          Estimated returns are not guaranteed. Crypto trading carries inherent risk.
        </div>
      </div>
    </section>
  );
}

/* ── EXPORT ── */
export default function Landing() {
  return (
    <div style={{ background: '#060606', color: '#fff', minHeight: '100vh' }}>
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
