import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import SpiralText from '@/components/shared/SpiralText';
import { useLang } from '@/lib/LangContext';
import { useIsMobile } from '@/lib/useIsMobile';

const FONT = "'Inter','SF Pro Display',system-ui,sans-serif";
const MONO = "'JetBrains Mono','SF Mono',monospace";


/* ── HERO ── */
function HomeHero() {
  const [in_, setIn] = useState(false);
  const sectionRef = useRef(null);
  const { t } = useLang();
  const isMobile = useIsMobile();
  useEffect(() => { const timer = setTimeout(() => setIn(true), 60); return () => clearTimeout(timer); }, []);

  const fade = (d, extra = {}) => ({
    opacity: in_ ? 1 : 0,
    transform: in_ ? 'none' : 'translateY(14px)',
    transition: `opacity 700ms ${d}ms ease, transform 700ms ${d}ms ease`,
    ...extra,
  });

  return (
    <section
      ref={sectionRef}
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: isMobile ? '0 16px' : '0 32px',
        position: 'relative',
        overflow: 'hidden',
        background: 'transparent',
      }}
    >
      <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h1 style={fade(0, {
          fontFamily: FONT,
          fontSize: 'clamp(80px, 16vw, 200px)',
          fontWeight: 900,
          letterSpacing: '-0.06em',
          lineHeight: 0.87,
          color: '#ffffff',
          margin: 0,
        })}>
          <SpiralText text="KADO" style={{ width: '100%' }} />
        </h1>

        <div style={fade(2000, { fontSize: 10, color: '#383838', letterSpacing: '0.22em', textTransform: 'uppercase', fontFamily: MONO, marginTop: 20 })}>
          {t.landing.tagline}
        </div>

        <p style={fade(2100, {
          fontFamily: FONT, fontSize: 'clamp(14px, 1.3vw, 17px)', fontWeight: 300,
          color: '#4a4a4a', marginTop: 22, lineHeight: 1.7, letterSpacing: '-0.01em', maxWidth: 420,
        })}>
          {t.landing.heroSub}
        </p>

        <div style={fade(2200, { display: 'flex', alignItems: 'center', gap: 20, marginTop: 36, flexWrap: 'wrap', justifyContent: 'center' })}>
          <Link to="/auth?mode=register"
            style={{ background: '#fff', color: '#000', padding: '14px 32px', borderRadius: 100, fontSize: 13, fontWeight: 700, fontFamily: FONT, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'background 200ms, color 200ms, box-shadow 200ms', letterSpacing: '0.02em' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#00d4aa'; e.currentTarget.style.color = '#080a0e'; e.currentTarget.style.boxShadow = '0 0 24px rgba(0,212,170,0.35)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#000'; e.currentTarget.style.boxShadow = 'none'; }}
          >{t.landing.cta1}</Link>
          <a href="#how-it-works"
            style={{ color: '#8b95a8', fontSize: 13, fontFamily: FONT, textDecoration: 'none', transition: 'color 150ms', letterSpacing: '-0.01em' }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = '#8b95a8'}
          >{t.landing.cta2}</a>
        </div>
      </div>
    </section>
  );
}

/* ── HOW IT WORKS ── */
function HowItWorks() {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const STEPS = [
    { n: '01', title: t.landing.step1Title, body: t.landing.step1Body },
    { n: '02', title: t.landing.step2Title, body: t.landing.step2Body },
    { n: '03', title: t.landing.step3Title, body: t.landing.step3Body },
  ];
  return (
    <section id="how-it-works" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent', contentVisibility: 'auto', containIntrinsicSize: '0 600px' }}>
      <div style={{ padding: isMobile ? '60px 20px' : '120px 64px' }}>
        <SectionHeader label={t.landing.stepsLabel} title={t.landing.stepsTitle} sub={t.landing.stepsSub} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden' }}>
          {STEPS.map(s => (
            <div key={s.n}
              style={{ background: 'rgba(5,5,5,0.92)', padding: isMobile ? '28px 20px' : '48px 40px', transition: 'background 180ms, box-shadow 180ms' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(20,20,20,1)'; e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(5,5,5,0.92)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
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
function BotsSection() {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const BOTS = ['b1','b2','b3','b4','b5','b6','b7','b8'].map((k, i) => ({
    num: String(i + 1).padStart(2, '0'),
    ...t.landing.arsenalBots[k],
  }));
  return (
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent', contentVisibility: 'auto', containIntrinsicSize: '0 800px' }}>
      <div style={{ padding: isMobile ? '60px 20px' : '120px 64px' }}>
        <SectionHeader label={t.landing.arsenalLabel} title={t.landing.arsenalTitle} sub={t.landing.arsenalSub} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden', alignItems: 'stretch' }}>
          {BOTS.map(bot => (
            <Link key={bot.num} to="/bots" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div
                style={{
                  background: 'rgba(5,5,5,0.92)',
                  padding: isMobile ? '18px 14px 16px' : '28px 28px 24px',
                  textAlign: 'left',
                  height: '100%',
                  boxSizing: 'border-box',
                  display: 'flex', flexDirection: 'column',
                  transition: 'background 180ms, box-shadow 180ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(22,22,22,1)'; e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(5,5,5,0.92)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
                  <span style={{ fontSize: 12, color: '#444', fontFamily: MONO, letterSpacing: '0.08em' }}>{bot.num}</span>
                  <span style={{ fontSize: 9, color: '#777', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 100, padding: '4px 12px', maxWidth: 160, textAlign: 'right', lineHeight: 1.4, fontFamily: FONT }}>{bot.tag}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#f0f0f0', marginBottom: 8, letterSpacing: '-0.02em', fontFamily: FONT }}>{bot.name}</div>
                <div style={{ fontSize: 14, color: '#7a7a7a', fontStyle: 'italic', marginBottom: 16, lineHeight: 1.5, fontFamily: FONT }}>{bot.hook}</div>
                <div style={{ fontSize: 13, color: '#8a8a8a', lineHeight: 1.75, fontFamily: FONT, flex: 1 }}>{bot.desc}</div>
                <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {bot.pills.map(p => (
                    <span key={p} style={{ fontSize: 9, color: '#777', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 100, padding: '4px 12px', fontFamily: FONT }}>{p}</span>
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

/* ── RISK ── */
function RiskSection() {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const RISK = ['r1','r2','r3','r4'].map(k => t.landing.risks[k]);
  return (
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent', contentVisibility: 'auto', containIntrinsicSize: '0 500px' }}>
      <div style={{ padding: isMobile ? '60px 20px' : '120px 64px' }}>
        <SectionHeader label={t.landing.riskLabel} title={t.landing.riskTitle} sub={t.landing.riskSub} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden' }}>
          {RISK.map(r => (
            <div key={r.title}
              style={{ background: 'rgba(5,5,5,0.92)', padding: isMobile ? '24px 18px' : '40px 32px', transition: 'background 180ms, box-shadow 180ms' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(20,20,20,1)'; e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,0.08)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(5,5,5,0.92)'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: '#d0d0d0', marginBottom: 14, letterSpacing: '-0.02em', fontFamily: FONT }}>{r.title}</div>
              <div style={{ fontSize: 12, color: '#666', lineHeight: 1.9, fontFamily: FONT }}>{r.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── STRATEGIES ── */
function Strategies() {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const STRATS = ['s1','s2','s3'].map((k, i) => ({
    n: String(i + 1).padStart(2, '0'),
    ...t.landing.strats[k],
  }));
  return (
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent', contentVisibility: 'auto', containIntrinsicSize: '0 700px' }}>
      <div style={{ padding: isMobile ? '60px 20px' : '120px 64px' }}>
        <SectionHeader label={t.landing.stratLabel} title={t.landing.stratTitle} sub={t.landing.stratSub} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden' }}>
          {STRATS.map(s => (
            <Link key={s.n} to="/strategies" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div
                style={{ background: 'rgba(5,5,5,0.92)', padding: isMobile ? '32px 24px' : '48px 40px', textAlign: 'left', transition: 'background 180ms, box-shadow 180ms', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(22,22,22,1)'; e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(255,255,255,0.1)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(5,5,5,0.92)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={{ fontSize: 10, color: '#333', fontFamily: MONO, marginBottom: 20, letterSpacing: '0.08em' }}>{s.n}</div>
                <div style={{ fontSize: 22, fontWeight: 600, color: '#e0e0e0', marginBottom: 14, letterSpacing: '-0.03em', fontFamily: FONT }}>{s.name}</div>
                <div style={{ fontSize: 13, color: '#666', lineHeight: 1.8, marginBottom: 28, flex: 1, fontFamily: FONT }}>{s.summary}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 32 }}>
                  {s.tags.map(t => (
                    <span key={t} style={{ fontSize: 9, color: '#777', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 100, padding: '4px 12px', fontFamily: FONT }}>{t}</span>
                  ))}
                </div>
                <div style={{ fontSize: 'clamp(36px,4vw,52px)', fontWeight: 700, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, fontFamily: MONO, marginBottom: 6 }}>{s.ret}</div>
                <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16, fontFamily: FONT }}>{t.landing.estMonthly}</div>
                <div style={{ fontSize: 12, color: '#444', lineHeight: 1.7, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.05)', fontFamily: FONT }}>{s.note}</div>
              </div>
            </Link>
          ))}
        </div>
        <div style={{ marginTop: 24, fontSize: 11, color: '#2a2a2a', lineHeight: 1.7, textAlign: 'center', fontFamily: FONT }}>
          {t.landing.returnsDisclaimer}
        </div>
      </div>
    </section>
  );
}

/* ── CTA ── */
function CtaInner() {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const badges = [t.landing.ctaBadge1, t.landing.ctaBadge2, t.landing.ctaBadge3];
  return (
    <div style={{ padding: isMobile ? '80px 24px' : '140px 64px', textAlign: 'center' }}>
      <h2 style={{ fontFamily: FONT, fontSize: 'clamp(80px,14vw,180px)', fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.87, color: '#fff', margin: '0 0 40px' }}>
        KADO
      </h2>
      <p style={{ fontSize: 15, color: '#555', letterSpacing: '-0.01em', marginBottom: 10, fontFamily: FONT }}>{t.landing.ctaTagline}</p>
      <p style={{ fontSize: 13, color: '#444', lineHeight: 1.8, maxWidth: 380, margin: '0 auto 40px', fontFamily: FONT }}>
        {t.landing.ctaText}
      </p>
      <Link
        to="/auth?mode=register"
        style={{ background: '#fff', color: '#000', padding: '13px 38px', borderRadius: 100, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'opacity 150ms', fontFamily: FONT, letterSpacing: '-0.01em' }}
        onMouseEnter={e => e.currentTarget.style.opacity = '0.82'}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        {t.landing.ctaBtn}
      </Link>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
        {badges.map(b => (
          <span key={b} style={{ fontSize: 10, color: '#444', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 100, padding: '4px 14px', fontFamily: FONT }}>{b}</span>
        ))}
      </div>
    </div>
  );
}

function CTA() {
  return (
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent', contentVisibility: 'auto', containIntrinsicSize: '0 500px' }}>
      <CtaInner />
    </section>
  );
}

/* ── SHARED ── */
function SectionHeader({ label, title, sub }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 64 }}>
      <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 18, fontFamily: FONT }}>{label}</div>
      <div style={{ fontSize: 'clamp(28px,3.5vw,44px)', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.05, color: '#e0e0e0', marginBottom: 16, fontFamily: FONT }}>{title}</div>
      <div style={{ fontSize: 14, color: '#555', lineHeight: 1.75, maxWidth: 500, margin: '0 auto', fontFamily: FONT }}>{sub}</div>
    </div>
  );
}

/* ── EXPORT ── */
export default function Landing() {
  return (
    <div style={{ color: '#fff', minHeight: '100vh' }}>
      <LandingHeader />
      <HomeHero />
      <HowItWorks />
      <BotsSection />
      <RiskSection />
      <Strategies />
      <CTA />
      <LandingFooter />
    </div>
  );
}
