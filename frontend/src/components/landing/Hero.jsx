import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import NeuronReveal from '@/components/shared/NeuronReveal';
import CharReveal from '@/components/shared/CharReveal';
import SpiralText from '@/components/shared/SpiralText';

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
        nodes.push({ x: hx, y: hy, hx, hy, vx: 0, vy: 0, r: 1.5 + Math.random() * 1.5, op: 0.25 + Math.random() * 0.35 });
      }
    }

    function resize() {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
      init(W, H);
    }

    function frame() {
      raf = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, W, H);

      const isDark = document.documentElement.classList.contains('dark');
      const col = isDark ? '255,255,255' : '10,10,10';
      const mouse = mouseRef.current;

      for (const n of nodes) {
        n.vx += (n.hx - n.x) * 0.016;
        n.vy += (n.hy - n.y) * 0.016;
        const dx = n.x - mouse.x, dy = n.y - mouse.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 130 && d > 0) {
          const f = (1 - d / 130) * 0.06;
          n.vx += (dx / d) * f * 50;
          n.vy += (dy / d) * f * 50;
        }
        n.vx *= 0.87; n.vy *= 0.87;
        n.x += n.vx; n.y += n.vy;
      }

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            ctx.strokeStyle = `rgba(${col},${(1 - dist / 120) * 0.18})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const n of nodes) {
        ctx.fillStyle = `rgba(${col},${n.op})`;
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
    <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }} />
  );
}

export default function Hero() {
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const sectionRef = useRef(null);
  const [labelDrawn, setLabelDrawn] = useState(false);
  const [arrowHover, setArrowHover] = useState(false);
  const [ctaHover, setCtaHover] = useState(false);

  useEffect(() => { setTimeout(() => setLabelDrawn(true), 300); }, []);

  const onMouseMove = useCallback((e) => {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);
  const onMouseLeave = useCallback(() => { mouseRef.current = { x: -9999, y: -9999 }; }, []);

  return (
    <section
      ref={sectionRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{ position: 'relative', minHeight: '100vh', overflow: 'hidden', background: 'transparent', borderBottom: '1px solid var(--hero-border)' }}
    >
      <HeroLocalCanvas mouseRef={mouseRef} />

      {/* corner ticker */}
      <div className="absolute top-5 left-5 md:left-8 z-20 font-mono text-[11px] tracking-[0.25em] uppercase"
        style={{ color: 'var(--hero-muted)', animation: 'labelPulse 3s ease-in-out infinite' }}>
        [ LIVE / v1.0 ]
      </div>
      <div className="absolute top-5 right-5 md:right-8 z-20 font-mono text-[11px] tracking-[0.25em] uppercase flex items-center gap-2"
        style={{ color: 'var(--hero-muted)' }}>
        <span className="w-1.5 h-1.5 bg-kado-blue animate-blink" />
        BYBIT · PERP
      </div>

      {/* Main content — left-aligned, pinned to edges */}
      <div className="relative px-6 md:px-10" style={{ minHeight: '100vh', zIndex: 10, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', paddingTop: '5rem', paddingBottom: '3rem' }}>

        {/* Top row */}
        <div className="flex items-start justify-between">
          <span
            className="font-mono text-[11px] tracking-[0.3em] uppercase select-none"
            style={{ color: 'var(--hero-muted)', border: '1px solid currentColor', padding: '4px 10px', animation: labelDrawn ? 'labelPulse 4s ease-in-out infinite' : 'none' }}
          >
            <CharReveal text="AI-DRIVEN SIGNAL INTELLIGENCE" delay={80} charDelay={22} tag="span" />
          </span>
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase flex items-center gap-2" style={{ color: 'var(--hero-muted)' }}>
            <span className="w-1.5 h-1.5 bg-kado-blue animate-blink" /> BYBIT · PERP · LIVE
          </span>
        </div>

        {/* Giant title — left-aligned */}
        <div style={{ position: 'relative' }}>
          <h1 className="font-black leading-none select-none" style={{ fontSize: 'clamp(72px, 16vw, 200px)', letterSpacing: '-0.06em', color: 'var(--hero-fg)' }}>
            <SpiralText text="KADO" style={{ fontSize: 'clamp(72px, 16vw, 200px)', letterSpacing: '-0.06em', fontWeight: 900 }} />
          </h1>
          <div style={{ position: 'absolute', left: 0, right: 0, height: '2px', background: 'var(--hero-fg)', opacity: 0, pointerEvents: 'none', animation: 'scanLine 4s ease-in-out 1.5s infinite' }} />
        </div>

        {/* Bottom row — description left, CTA right */}
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-10 md:gap-0">
          {/* Left: tagline + steps */}
          <div style={{ maxWidth: 460 }}>
            <div style={{ width: 2, height: 40, background: 'var(--hero-fg)', marginBottom: 16, animation: 'scaleYIn 600ms ease 600ms both' }} />
            <p className="text-base md:text-lg leading-relaxed" style={{ color: 'var(--hero-muted-fg)', marginBottom: '1.5rem' }}>
              <CharReveal
                text="Four autonomous bots — news scanner, grid trader, listing sniper, DEX hunter — running 24/7 on Bybit Futures."
                delay={700} charDelay={14} tag="span"
              />
            </p>
            <div className="flex gap-6 font-mono text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--hero-muted)' }}>
              {['Scan 30s', 'Claude AI', '4 Bots'].map((t, i) => (
                <span key={t} style={{ border: '1px solid rgba(128,128,128,0.3)', padding: '3px 8px', animation: `flickerBox ${2.5 + i}s ease-in-out ${i * 0.6}s infinite` }}>{t}</span>
              ))}
            </div>
          </div>

          {/* Right: CTA */}
          <NeuronReveal delay={500} tag="div" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.75rem' }}>
            <Link
              to="/auth?mode=register"
              onMouseEnter={() => { setArrowHover(true); setCtaHover(true); }}
              onMouseLeave={() => { setArrowHover(false); setCtaHover(false); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '10px',
                padding: '14px 32px',
                background: ctaHover ? '#0047FF' : 'var(--hero-fg)',
                color: ctaHover ? '#fff' : 'var(--hero-bg, #fff)',
                fontFamily: 'var(--font-mono)', fontSize: '12px',
                letterSpacing: '0.2em', textTransform: 'uppercase',
                textDecoration: 'none', border: '1px solid var(--hero-fg)',
                transition: 'background 200ms, color 200ms',
              }}
            >
              Get Started
              <span style={{ display: 'inline-block', transform: arrowHover ? 'translateX(4px)' : 'translateX(0)', transition: 'transform 200ms' }}>→</span>
            </Link>
            <a href="#bots" className="font-mono text-[11px] tracking-[0.2em] uppercase"
              style={{ color: 'var(--hero-muted)', textDecoration: 'none' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--site-fg)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--hero-muted)'; }}>
              See all bots ↓
            </a>
          </NeuronReveal>
        </div>

        {/* Bottom edge bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, borderTop: '1px solid var(--hero-border)', zIndex: 10 }}>
          <div className="px-6 md:px-10 h-9 flex items-center justify-between font-mono text-[9px] tracking-[0.25em] uppercase" style={{ color: 'var(--hero-muted)' }}>
            <span>↓ Scroll to explore</span>
            <span className="hidden md:inline">Intelligence feeds. Signals execute. Risk is managed.</span>
            <span>EST. 2026</span>
          </div>
        </div>
      </div>
    </section>
  );
}
