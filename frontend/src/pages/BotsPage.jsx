import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import { useLang } from '@/lib/LangContext';
import { usePageTitle } from '@/lib/usePageTitle';
import { useIsMobile } from '@/lib/useIsMobile';

const FONT_BODY = "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif";
const FONT_MONO = "'Courier New','SF Mono',monospace";

const STAT_KEYS = [
  { key: 'activeBots',     value: '8' },
  { key: 'uptime',         value: '24/7' },
  { key: 'signalLatency',  value: '<5s' },
  { key: 'scoreFactors',   value: '9' },
  { key: 'aiEval',         value: '<100ms' },
  { key: 'pipelineStages', value: '4' },
];

function PillTag({ label }) {
  return (
    <span style={{
      fontFamily: FONT_MONO,
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 100,
      padding: '3px 10px',
      fontSize: 9,
      color: '#999',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function BotCard({ bot }) {
  const [hovered, setHovered] = React.useState(false);
  const isMobile = useIsMobile();
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#0f0f0f' : '#0a0a0a',
        padding: isMobile ? '28px 20px' : '44px 36px',
        display: 'flex',
        flexDirection: 'column',
        transition: 'background 200ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#555', letterSpacing: '0.08em' }}>
          {bot.num}
        </span>
        <span style={{
          fontFamily: FONT_MONO,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 100,
          padding: '3px 10px',
          fontSize: 9,
          color: '#999',
          letterSpacing: '0.06em',
        }}>
          {bot.tag}
        </span>
      </div>

      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: '#fff', marginBottom: 8 }}>
        {bot.name}
      </div>

      <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#aaa', marginBottom: 20, lineHeight: 1.5 }}>
        "{bot.hook}"
      </div>

      <p style={{ fontSize: 13, color: '#666', lineHeight: 1.75, marginBottom: 28, flexGrow: 1, margin: '0 0 28px' }}>
        {bot.desc}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {bot.pills.map((p) => (
          <PillTag key={p} label={p} />
        ))}
      </div>
    </div>
  );
}

function PipelineCard({ step }) {
  const [hovered, setHovered] = React.useState(false);
  const isMobile = useIsMobile();
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? '#0f0f0f' : '#0a0a0a', padding: isMobile ? '28px 20px' : '44px 36px', transition: 'background 200ms' }}
    >
      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#555', letterSpacing: '0.08em', marginBottom: 16 }}>
        {step.num}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: '#fff', marginBottom: 16 }}>
        {step.name}
      </div>
      <p style={{ fontSize: 13, color: '#666', lineHeight: 1.75, margin: 0 }}>
        {step.desc}
      </p>
    </div>
  );
}

export default function BotsPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const { t } = useLang();
  usePageTitle(t.nav.bots);

  const BOTS = ['b1','b2','b3','b4','b5','b6','b7','b8'].map((k, i) => ({
    num: String(i + 1).padStart(2, '0'),
    ...t.landing.arsenalBots[k],
  }));

  const STATS = STAT_KEYS.map(s => ({ value: s.value, label: t.bots.stats[s.key] }));

  const PIPELINE = ['p1','p2','p3','p4'].map((k, i) => ({
    num: String(i + 1).padStart(2, '0'),
    ...t.bots.pipeline[k],
  }));

  return (
    <div style={{ background: '#060606', minHeight: '100vh', fontFamily: FONT_BODY, color: '#fff' }}>
      <LandingHeader />

      {/* Hero */}
      <section style={{ paddingTop: 100, paddingBottom: 80, textAlign: 'center' }}>
        <div className="px-5 md:px-14" style={{ width: "100%" }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 100,
            padding: '6px 18px',
            fontSize: 11,
            color: '#888',
            fontFamily: FONT_MONO,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 32,
          }}>
            {t.bots.badge}
          </div>

          <h1 style={{
            fontSize: 'clamp(48px,7vw,88px)',
            fontWeight: 700,
            letterSpacing: '-0.05em',
            lineHeight: 1.0,
            margin: '0 0 24px',
          }}>
            {t.bots.h1}
          </h1>

          <p style={{ fontSize: 16, color: '#666', lineHeight: 1.7, maxWidth: 520, margin: '0 auto' }}>
            {t.bots.sub}
          </p>
        </div>
      </section>

      {/* Stats bar */}
      <div className="px-5 md:px-14" style={{ width: '100%', paddingBottom: 80 }}>
        <div
          className="grid grid-cols-3 md:grid-cols-6"
          style={{
            gap: 1,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          {STATS.map((s) => (
            <div key={s.label} style={{ background: '#0a0a0a', padding: '28px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 'clamp(18px,2.5vw,24px)', fontWeight: 700, color: '#fff', marginBottom: 6 }}>
                {s.value}
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bots grid */}
      <div className="px-5 md:px-14" style={{ width: '100%', paddingBottom: 100 }}>
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          style={{
            gap: 1,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          {BOTS.map((bot) => (
            <BotCard key={bot.num} bot={bot} />
          ))}
        </div>
      </div>

      {/* Pipeline section */}
      <section style={{ paddingTop: 100, paddingBottom: 100, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-5 md:px-14" style={{ width: "100%" }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{
              fontSize: 11,
              color: '#666',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 16,
              fontFamily: FONT_MONO,
            }}>
              {t.bots.pipelineLabel}
            </div>
            <h2 style={{
              fontSize: 'clamp(36px,4.5vw,52px)',
              fontWeight: 700,
              letterSpacing: '-0.04em',
              lineHeight: 1.0,
              margin: '0 0 16px',
            }}>
              {t.bots.pipelineTitle}
            </h2>
            <p style={{ fontSize: 16, color: '#666', lineHeight: 1.7, maxWidth: 480, margin: '0 auto' }}>
              {t.bots.pipelineSub}
            </p>
          </div>

          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
            style={{
              gap: 1,
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 16,
              overflow: 'hidden',
            }}
          >
            {PIPELINE.map((step) => (
              <PipelineCard key={step.num} step={step} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section style={{ paddingTop: 100, paddingBottom: 100, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-5 md:px-14" style={{ width: "100%" }}>
          <div style={{
            fontSize: 11,
            color: '#666',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 16,
            fontFamily: FONT_MONO,
          }}>
            {t.bots.ctaLabel}
          </div>
          <h2 style={{
            fontSize: 'clamp(36px,4.5vw,52px)',
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1.0,
            margin: '0 0 40px',
          }}>
            {t.bots.ctaTitle}
          </h2>
          <Link
            to="/auth?mode=register"
            style={{
              display: 'inline-block',
              background: '#fff',
              color: '#000',
              padding: '14px 36px',
              borderRadius: 100,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              fontFamily: FONT_BODY,
              transition: 'opacity 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          >
            {t.bots.ctaBtn}
          </Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
