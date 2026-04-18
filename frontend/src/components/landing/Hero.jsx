import React, { useRef, useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import NeuronReveal from '@/components/shared/NeuronReveal';

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

      <div className="relative flex flex-col items-center justify-center text-center px-6 md:px-10"
        style={{ minHeight: '100vh', zIndex: 10, paddingBottom: '3.5rem', paddingTop: '2rem' }}>

        {/* label */}
        <NeuronReveal delay={0} tag="div" style={{ marginBottom: '2.5rem' }}>
          <span
            className="font-mono text-[11px] md:text-[12px] tracking-[0.35em] uppercase select-none"
            style={{
              color: 'var(--hero-muted)',
              display: 'inline-block',
              padding: '6px 14px',
              border: '1px solid currentColor',
              animation: labelDrawn ? 'labelPulse 4s ease-in-out infinite' : 'none',
              clipPath: labelDrawn ? 'inset(0 0% 0 0)' : 'inset(0 100% 0 0)',
              transition: 'clip-path 600ms ease-out',
            }}
          >
            AI-DRIVEN CRYPTO SIGNAL INTELLIGENCE
          </span>
        </NeuronReveal>

        {/* KADO with scan-line */}
        <NeuronReveal delay={150} tag="div" style={{ position: 'relative', padding: '0.15em 0.05em' }}>
          <h1
            className="font-black leading-none select-none"
            style={{ fontSize: 'clamp(80px, 18vw, 220px)', letterSpacing: '-0.06em', color: 'var(--hero-fg)' }}
          >
            KADO
          </h1>
          <div style={{
            position: 'absolute', left: 0, right: 0, height: '2px',
            background: 'var(--hero-fg)', opacity: 0, pointerEvents: 'none',
            animation: 'scanLine 4s ease-in-out 1.5s infinite',
          }} />
        </NeuronReveal>

        {/* subtitle */}
        <NeuronReveal delay={350} tag="div" style={{ marginTop: '2.5rem', display: 'flex', alignItems: 'center' }}>
          <div style={{
            width: 2, background: 'var(--hero-fg)', alignSelf: 'stretch', marginRight: 16,
            transformOrigin: 'top', animation: 'scaleYIn 600ms ease 500ms both',
          }} />
          <p className="text-sm md:text-base leading-relaxed text-left max-w-xs" style={{ color: 'var(--hero-muted-fg)' }}>
            A quantitative newsroom that listens to the market — scores every headline,
            validates every move, and executes with discipline.
          </p>
        </NeuronReveal>

        {/* CTA */}
        <NeuronReveal delay={500} tag="div" style={{ marginTop: '3rem', display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Link
            to="/auth?mode=register"
            onMouseEnter={() => { setArrowHover(true); setCtaHover(true); }}
            onMouseLeave={() => { setArrowHover(false); setCtaHover(false); }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 28px',
              background: ctaHover ? '#0047FF' : 'var(--hero-fg)',
              color: ctaHover ? '#fff' : 'var(--hero-bg, #fff)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              border: '1px solid var(--hero-fg)',
              transition: 'background 200ms ease, color 200ms ease',
              userSelect: 'none',
            }}
          >
            Get Access
            <span style={{ display: 'inline-block', transform: arrowHover ? 'translateX(4px)' : 'translateX(0)', transition: 'transform 200ms ease' }}>→</span>
          </Link>
          <a
            href="#how"
            className="font-mono text-[12px] tracking-[0.2em] uppercase"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '12px 20px',
              color: 'var(--hero-muted-fg)',
              border: '1px solid var(--hero-border)',
              textDecoration: 'none',
              transition: 'border-color 200ms ease, color 200ms ease',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#0047FF'; e.currentTarget.style.color = '#0047FF'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--hero-border)'; e.currentTarget.style.color = 'var(--hero-muted-fg)'; }}
          >
            Learn how it works
          </a>
        </NeuronReveal>

        {/* bottom bar */}
        <div className="absolute bottom-0 left-0 right-0" style={{ borderTop: '1px solid var(--hero-border)', zIndex: 10 }}>
          <div className="max-w-[1400px] mx-auto px-6 md:px-10 h-10 flex items-center justify-between font-mono text-[10px] tracking-[0.25em] uppercase" style={{ color: 'var(--hero-muted)' }}>
            {['// Scroll', 'Intelligence feeds. Signals execute.', 'EST. 2026'].map((txt, i) => (
              <span key={txt} className={i === 1 ? 'hidden md:inline' : ''}
                style={{ border: '1px solid rgba(128,128,128,0.25)', padding: '2px 8px', animation: `flickerBox ${2 + i * 1.3}s ease-in-out ${i * 0.7}s infinite` }}>
                {txt}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
