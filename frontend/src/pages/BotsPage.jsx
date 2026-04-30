import React, { useEffect, useState } from 'react';
import LandingHeader from '@/components/landing/LandingHeader';
import BotSections from '@/components/landing/BotSections';
import LandingFooter from '@/components/landing/LandingFooter';

function PageHero() {
  return (
    <div style={{ borderBottom: '1px solid var(--border)', padding: '5rem 0 4rem' }}>
      <div className="px-6 md:px-10 flex items-end justify-between gap-8">
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>
            KADO / BOTS
          </div>
          <h1 className="font-black" style={{ fontSize: 'clamp(52px, 10vw, 120px)', letterSpacing: '-0.05em', lineHeight: 0.88 }}>
            The<br />Arsenal.
          </h1>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.8, color: 'var(--muted-fg)', maxWidth: 480, marginTop: 20 }}>
            Five autonomous trading systems running in parallel 24/7. Each specializes in a different market opportunity.
          </p>
        </div>
        <div className="hidden md:flex flex-col items-end gap-2" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--muted)', flexShrink: 0 }}>
          <div>5 BOTS</div>
          <div>BYBIT · BSC</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, background: 'var(--fg)', borderRadius: '50%', animation: 'blink 2s ease-in-out infinite' }} />
            LIVE
          </div>
        </div>
      </div>
    </div>
  );
}

function VideoSection() {
  const [hovered, setHovered] = useState(false);

  return (
    <section style={{ borderBottom: '1px solid var(--border)', padding: '4rem 0' }}>
      <div className="px-6 md:px-10">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 28 }}>
          HOW IT WORKS
        </div>
        <div className="grid md:grid-cols-[1fr_260px] gap-8">

          {/* Video placeholder */}
          <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              position: 'relative', aspectRatio: '16/9',
              background: 'var(--bg2)',
              border: `1px solid ${hovered ? 'var(--border-hi)' : 'var(--border)'}`,
              transition: 'border-color 200ms',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 14,
              cursor: 'pointer',
            }}>
            <div style={{
              width: 56, height: 56,
              border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: hovered ? 'var(--bg3)' : 'transparent',
              transition: 'background 200ms',
            }}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <polygon points="5,3 15,9 5,15" fill="var(--fg)" opacity="0.7" />
              </svg>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              DEMO VIDEO — COMING SOON
            </div>
            <div style={{ position: 'absolute', top: 12, left: 12, fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', opacity: 0.5 }}>
              LIVE TRADING · BYBIT FUTURES
            </div>
          </div>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {[
              { n: '01', title: 'Signal Ingestion',  body: 'Telethon userbot monitors 6 crypto channels. New article in ~5 seconds.' },
              { n: '02', title: 'AI Scoring',        body: 'Groq pre-filters. Claude Haiku scores sentiment, confidence, 8 factors.' },
              { n: '03', title: 'Risk Filters',      body: 'BTC dump check, whale correlation, duplicate window, max 3 positions.' },
              { n: '04', title: 'Execution',         body: 'Market order → partial TP1 limit (50%) + trailing stop on remainder.' },
            ].map((step, i) => (
              <div key={i} style={{ padding: '18px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none', display: 'flex', gap: 14 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--muted)', flexShrink: 0, paddingTop: 2 }}>{step.n}</div>
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--fg)', marginBottom: 4 }}>{step.title}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.7, color: 'var(--muted-fg)' }}>{step.body}</div>
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
      <VideoSection />
      <BotSections />
      <LandingFooter />
    </div>
  );
}
