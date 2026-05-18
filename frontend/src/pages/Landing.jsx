import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import SpiralText from '@/components/shared/SpiralText';
import { useLang } from '@/lib/LangContext';
import { useIsMobile } from '@/lib/useIsMobile';

const FONT = "'Inter','SF Pro Display',system-ui,sans-serif";
const MONO = "'JetBrains Mono','SF Mono',monospace";

/* ── BACKGROUND CHARTS ── */
function generateCandles(count, startPrice, volatility, seed) {
  let price = startPrice;
  let rng = seed;
  const next = () => { rng = (rng * 1664525 + 1013904223) & 0xffffffff; return (rng >>> 0) / 0xffffffff; };
  return Array.from({ length: count }, () => {
    const open = price;
    const move = (next() - 0.48) * volatility;
    const close = Math.max(10, open + move);
    const high = Math.max(open, close) + next() * volatility * 0.6;
    const low  = Math.min(open, close) - next() * volatility * 0.4;
    price = close;
    return { open, close, high, low };
  });
}

function CandleChart({ x, y, width, height, count = 40, seed = 42, opacity = 0.07 }) {
  const candles = generateCandles(count, 100, 8, seed);
  const prices = candles.flatMap(c => [c.high, c.low]);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const scaleY = p => y + height - ((p - minP) / (maxP - minP)) * height;
  const cw = width / count;
  const bodyW = Math.max(1.5, cw * 0.55);
  const closePts = candles.map((c, i) => `${x + i * cw + cw / 2},${scaleY(c.close)}`).join(' ');

  return (
    <g opacity={opacity}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <line key={t} x1={x} x2={x + width} y1={y + height * t} y2={y + height * t}
          stroke="white" strokeWidth="0.4" strokeDasharray="4 8" opacity="0.4" />
      ))}
      {/* Candles */}
      {candles.map((c, i) => {
        const cx = x + i * cw + cw / 2;
        const bull = c.close >= c.open;
        const bodyTop = scaleY(Math.max(c.open, c.close));
        const bodyH = Math.max(1, Math.abs(scaleY(c.open) - scaleY(c.close)));
        return (
          <g key={i} stroke="white" fill={bull ? 'white' : 'none'}>
            <line x1={cx} x2={cx} y1={scaleY(c.high)} y2={scaleY(c.low)} strokeWidth="0.6" />
            <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH}
              fill={bull ? 'white' : 'none'} stroke="white" strokeWidth="0.6" />
          </g>
        );
      })}
      {/* Price line */}
      <polyline points={closePts} fill="none" stroke="white" strokeWidth="0.8" opacity="0.5" />
    </g>
  );
}

function BackgroundCharts() {
  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1400 900"
    >
      {/* Main chart — right side */}
      <CandleChart x={640} y={60} width={720} height={340} count={48} seed={77} opacity={0.07} />
      {/* Secondary chart — bottom left */}
      <CandleChart x={20} y={520} width={420} height={220} count={32} seed={133} opacity={0.05} />
      {/* Micro chart — top left corner */}
      <CandleChart x={20} y={40} width={260} height={140} count={26} seed={211} opacity={0.04} />
      {/* Volume bars — right bottom */}
      {generateCandles(48, 60, 20, 99).map((c, i) => (
        <rect key={i}
          x={640 + i * 15 + 1} y={820 - c.high * 1.2} width={10} height={c.high * 1.2}
          fill="white" opacity={0.03 + (c.close > c.open ? 0.02 : 0)} />
      ))}
    </svg>
  );
}

/* ── LOCAL NEURAL CANVAS (hero-only, 80 nodes, mouse-reactive) ── */
function HeroLocalCanvas({ mouseRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, raf;
    const nodes = [];

    function init(w, h) {
      nodes.length = 0;
      for (let i = 0; i < 80; i++) {
        const hx = Math.random() * w, hy = Math.random() * h;
        nodes.push({
          x: hx, y: hy, hx, hy, vx: 0, vy: 0,
          r: 1.2 + Math.random() * 1.4,
          op: 0.2 + Math.random() * 0.35,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    function resize() {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
      init(W, H);
    }

    function frame(ts) {
      raf = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, W, H);
      const col = '255,255,255';
      const mouse = mouseRef?.current ?? { x: -9999, y: -9999 };

      for (const n of nodes) {
        n.vx += (n.hx - n.x) * 0.014;
        n.vy += (n.hy - n.y) * 0.014;
        const dx = n.x - mouse.x, dy = n.y - mouse.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 140 && d > 0) {
          const f = (1 - d / 140) * 0.055;
          n.vx += (dx / d) * f * 50;
          n.vy += (dy / d) * f * 50;
        }
        n.vx *= 0.87; n.vy *= 0.87;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(0, Math.min(W, n.x));
        n.y = Math.max(0, Math.min(H, n.y));
      }

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130) {
            ctx.strokeStyle = `rgba(${col},${(1 - dist / 130) * 0.16})`;
            ctx.lineWidth = 0.4;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const n of nodes) {
        const flicker = 0.7 + 0.3 * Math.sin(ts * 0.001 + n.phase);
        ctx.fillStyle = `rgba(${col},${n.op * flicker})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      }
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
    />
  );
}

/* ── HERO ── */
function HomeHero() {
  const [in_, setIn] = useState(false);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const sectionRef = useRef(null);
  const { t } = useLang();
  const isMobile = useIsMobile();
  useEffect(() => { const timer = setTimeout(() => setIn(true), 60); return () => clearTimeout(timer); }, []);

  const onMouseMove = useCallback((e) => {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);
  const onMouseLeave = useCallback(() => { mouseRef.current = { x: -9999, y: -9999 }; }, []);

  const fade = (d, extra = {}) => ({
    opacity: in_ ? 1 : 0,
    transform: in_ ? 'none' : 'translateY(14px)',
    transition: `opacity 700ms ${d}ms ease, transform 700ms ${d}ms ease`,
    ...extra,
  });

  return (
    <section
      ref={sectionRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
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
      <BackgroundCharts />
      <HeroLocalCanvas mouseRef={mouseRef} />

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
    <section id="how-it-works" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
      <div style={{ padding: isMobile ? '60px 20px' : '120px 64px' }}>
        <SectionHeader label={t.landing.stepsLabel} title={t.landing.stepsTitle} sub={t.landing.stepsSub} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
          {STEPS.map(s => (
            <div key={s.n} style={{ background: '#0a0a0a', padding: isMobile ? '28px 20px' : '48px 40px', transition: 'background 200ms' }}
              onMouseEnter={e => e.currentTarget.style.background = '#0f0f0f'}
              onMouseLeave={e => e.currentTarget.style.background = '#0a0a0a'}
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
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
      <div style={{ padding: isMobile ? '60px 20px' : '120px 64px' }}>
        <SectionHeader label={t.landing.arsenalLabel} title={t.landing.arsenalTitle} sub={t.landing.arsenalSub} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(4, minmax(0, 1fr))', gap: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden', alignItems: 'stretch' }}>
          {BOTS.map(bot => (
            <Link key={bot.num} to="/bots" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div
                style={{
                  background: '#0a0a0a',
                  padding: isMobile ? '24px 18px 20px' : '32px 28px 28px',
                  textAlign: 'left',
                  height: '100%',
                  boxSizing: 'border-box',
                  display: 'flex', flexDirection: 'column',
                  transition: 'background 200ms',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#0f0f0f'}
                onMouseLeave={e => e.currentTarget.style.background = '#0a0a0a'}
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
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
      <div style={{ padding: isMobile ? '60px 20px' : '120px 64px' }}>
        <SectionHeader label={t.landing.riskLabel} title={t.landing.riskTitle} sub={t.landing.riskSub} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
          {RISK.map(r => (
            <div key={r.title} style={{ background: '#0a0a0a', padding: isMobile ? '28px 20px' : '44px 36px', transition: 'background 200ms' }}
              onMouseEnter={e => e.currentTarget.style.background = '#0f0f0f'}
              onMouseLeave={e => e.currentTarget.style.background = '#0a0a0a'}
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
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
      <div style={{ padding: isMobile ? '60px 20px' : '120px 64px' }}>
        <SectionHeader label={t.landing.stratLabel} title={t.landing.stratTitle} sub={t.landing.stratSub} />
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 1, background: 'rgba(255,255,255,0.06)', borderRadius: 16, overflow: 'hidden' }}>
          {STRATS.map(s => (
            <Link key={s.n} to="/strategies" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div
                style={{ background: '#0a0a0a', padding: isMobile ? '40px 28px' : '56px 44px', textAlign: 'left', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', transition: 'background 200ms' }}
                onMouseEnter={e => e.currentTarget.style.background = '#0f0f0f'}
                onMouseLeave={e => e.currentTarget.style.background = '#0a0a0a'}
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
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
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
