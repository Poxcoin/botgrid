import React, { useEffect, useRef, useState } from 'react';
import LandingHeader from '@/components/landing/LandingHeader';
import BotSections from '@/components/landing/BotSections';
import LandingFooter from '@/components/landing/LandingFooter';

function PageHero() {
  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '4rem 0 3rem' }}>
      <div className="px-6 md:px-10 flex items-end justify-between">
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>
            [ KADO / BOTS ]
          </div>
          <h1 className="font-black tracking-[-0.05em] leading-[0.85]" style={{ fontSize: 'clamp(52px, 10vw, 120px)', color: 'var(--fg)' }}>
            The<br />
            <span style={{ color: 'var(--neon-green)', textShadow: '0 0 60px rgba(255,255,255,0.25)' }}>Arsenal.</span>
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.8, color: 'var(--muted-fg)', maxWidth: 520, marginTop: 20 }}>
            Four autonomous trading systems running in parallel 24/7. Each bot specializes in a different market opportunity — from AI news signals to DEX sniping.
          </p>
        </div>
        <div className="hidden md:block" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--muted)', textAlign: 'right' }}>
          <div>4 BOTS</div>
          <div style={{ marginTop: 6 }}>BYBIT · BSC</div>
          <div style={{ marginTop: 6, color: 'var(--neon-green)', animation: 'labelPulse 3s infinite' }}>LIVE</div>
        </div>
      </div>
    </div>
  );
}

const TICKER_ITEMS = [
  { label: 'NEWS BOT',    val: '+2.3%',  sub: 'last trade' },
  { label: 'GRID BTC',    val: '+0.8%',  sub: '24h PnL' },
  { label: 'GRID DOGE',   val: '+1.4%',  sub: '24h PnL' },
  { label: 'FR ARB',      val: '0.08%',  sub: 'avg funding' },
  { label: 'LISTING BOT', val: '5 snipes', sub: 'this week' },
  { label: 'LATENCY',     val: '~5s',    sub: 'signal→order' },
  { label: 'UPTIME',      val: '99.9%',  sub: '30d' },
];

function StatTicker() {
  return (
    <div style={{ borderBottom: '1px solid var(--border)', overflow: 'hidden', position: 'relative', height: 36 }}>
      <div style={{
        display: 'flex', gap: 0, position: 'absolute',
        animation: 'dataScroll 28s linear infinite',
        whiteSpace: 'nowrap',
      }}>
        {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
          <div key={i} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '0 28px', height: 36,
            borderRight: '1px solid var(--border)',
            fontFamily: 'var(--font-mono)',
          }}>
            <span style={{ fontSize: 8, letterSpacing: '0.3em', color: 'var(--muted)', textTransform: 'uppercase' }}>{item.label}</span>
            <span style={{ fontSize: 11, color: 'var(--fg)', fontWeight: 600 }}>{item.val}</span>
            <span style={{ fontSize: 8, color: 'var(--muted)', opacity: 0.5 }}>{item.sub}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function VideoIntroSection() {
  const [hovered, setHovered] = useState(false);

  return (
    <section style={{ borderBottom: '1px solid var(--border)', padding: '5rem 0' }}>
      <div className="px-6 md:px-10">

        {/* Section label */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 32 }}>
          [ HOW IT WORKS ]
        </div>

        {/* Main video + side stats layout */}
        <div className="grid md:grid-cols-[1fr_280px] gap-8">

          {/* Video placeholder */}
          <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              position: 'relative', aspectRatio: '16/9',
              background: 'var(--bg2)',
              border: `1px solid ${hovered ? 'rgba(255,255,255,0.3)' : 'var(--border)'}`,
              cursor: 'pointer',
              transition: 'border-color 200ms',
              overflow: 'hidden',
            }}>

            {/* Fake chart lines */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.08 }} viewBox="0 0 800 450" preserveAspectRatio="none">
              <polyline points="0,300 80,280 160,260 200,290 260,180 320,160 380,200 440,140 500,170 560,120 620,150 680,100 760,80 800,90"
                fill="none" stroke="white" strokeWidth="1.5" />
              <polyline points="0,380 100,360 200,370 280,340 360,310 420,320 500,290 580,270 660,250 800,230"
                fill="none" stroke="white" strokeWidth="0.8" strokeDasharray="4 4" />
            </svg>

            {/* Grid lines */}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.04 }} viewBox="0 0 800 450" preserveAspectRatio="none">
              {[1,2,3,4].map(i => <line key={i} x1="0" y1={i*90} x2="800" y2={i*90} stroke="white" strokeWidth="1" />)}
              {[1,2,3,4,5,6,7].map(i => <line key={i} x1={i*100} y1="0" x2={i*100} y2="450" stroke="white" strokeWidth="1" />)}
            </svg>

            {/* Signal dots */}
            {[{x:'33%',y:'40%'},{x:'55%',y:'30%'},{x:'75%',y:'22%'}].map((dot, i) => (
              <div key={i} style={{
                position: 'absolute', left: dot.x, top: dot.y,
                width: 8, height: 8, borderRadius: '50%',
                background: 'rgba(255,255,255,0.7)',
                boxShadow: '0 0 12px rgba(255,255,255,0.5)',
                transform: 'translate(-50%,-50%)',
                animation: `labelPulse ${2 + i * 0.5}s infinite`,
              }} />
            ))}

            {/* Play button */}
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 16,
            }}>
              <div style={{
                width: 64, height: 64,
                border: '1px solid rgba(255,255,255,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
                transition: 'background 200ms',
              }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <polygon points="6,4 17,10 6,16" fill="rgba(255,255,255,0.8)" />
                </svg>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
                DEMO VIDEO — COMING SOON
              </div>
            </div>

            {/* Corner label */}
            <div style={{
              position: 'absolute', top: 12, left: 12,
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.25em',
              textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
            }}>
              LIVE TRADING · BYBIT FUTURES
            </div>
          </div>

          {/* Side steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            {[
              { n: '01', title: 'Signal Ingestion', body: 'Telethon userbot monitors 6 crypto channels. New article in ~5s.' },
              { n: '02', title: 'AI Scoring', body: 'Groq LLM scores sentiment 0–10. Confidence + keyword boost.' },
              { n: '03', title: 'Risk Filters', body: 'BTC dump check, whale wallet correlation, duplicate window.' },
              { n: '04', title: 'Execution', body: 'Market order → TP1 limit (50%) + trailing stop on Bybit.' },
            ].map((step, i) => (
              <div key={i} style={{
                padding: '20px 0',
                borderBottom: i < 3 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.2)', flexShrink: 0, paddingTop: 2 }}>
                    {step.n}
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--fg)', marginBottom: 6 }}>
                      {step.title}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.7, color: 'var(--muted-fg)' }}>
                      {step.body}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function BotsPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--fg)', minHeight: '100vh' }}>
      <LandingHeader />
      <PageHero />
      <StatTicker />
      <VideoIntroSection />
      <BotSections />
      <LandingFooter />
    </div>
  );
}
