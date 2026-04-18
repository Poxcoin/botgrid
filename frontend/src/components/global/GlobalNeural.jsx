import React, { useEffect, useRef } from 'react';
import { useTheme } from '@/lib/ThemeContext';

export const cursorStateRef = { x: -9999, y: -9999, vx: 0, vy: 0, moving: false };

function buildAxons(W, H, isMobile) {
  const count = isMobile ? 22 : 48;
  return Array.from({ length: count }, () => ({
    ox: W * 0.05 + Math.random() * W * 0.28,
    oy: H * 0.62 + Math.random() * H * 0.48,
    angle: -Math.PI * 0.9 + Math.random() * Math.PI * 0.85,
    len: 320 + Math.random() * W * 0.68,
    amp: 5 + Math.random() * 20,
    freq: 0.6 + Math.random() * 2.0,
    phase: Math.random() * Math.PI * 2,
    speed: 0.10 + Math.random() * 0.26,
    // Thinner than A4 demo: 0.2–0.5px width, 0.04–0.11 opacity
    w: 0.2 + Math.random() * 0.3,
    op: 0.04 + Math.random() * 0.07,
  }));
}

export default function GlobalNeural() {
  const canvasRef = useRef(null);
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    let W, H, raf, axons = [];

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      axons = buildAxons(W, H, isMobile);
    }
    resize();
    window.addEventListener('resize', resize);

    let lastTs = 0;
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(ts - lastTs, 40);
      lastTs = ts;
      const t = ts * 0.001;

      ctx.clearRect(0, 0, W, H);
      const rgb = themeRef.current === 'dark' ? '255,255,255' : '10,10,10';

      // ── A4 Axon strands (bottom layer) ──
      for (const s of axons) {
        ctx.beginPath();
        const perp = s.angle + Math.PI / 2;
        for (let seg = 0; seg <= 30; seg++) {
          const p = seg / 30;
          const dist = p * s.len;
          // Cursor warp: ±3px max deflection within 300px
          const wx = s.ox + Math.cos(s.angle) * dist;
          const wy = s.oy + Math.sin(s.angle) * dist;
          const cdx = wx - cursorStateRef.x, cdy = wy - cursorStateRef.y;
          const cd = Math.sqrt(cdx * cdx + cdy * cdy);
          const warp = cd < 300 && cd > 0 ? (1 - cd / 300) * 3 : 0;
          const warpX = cd > 0 ? (cdx / cd) * warp : 0;
          const warpY = cd > 0 ? (cdy / cd) * warp : 0;
          const wave = Math.sin(p * s.freq * Math.PI * 2 + s.phase + t * s.speed) * s.amp * Math.sqrt(p);
          const x = wx + Math.cos(perp) * wave + warpX;
          const y = wy + Math.sin(perp) * wave + warpY;
          seg === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${rgb},${s.op * (0.7 + 0.3 * Math.sin(t * 0.7 + s.phase))})`;
        ctx.lineWidth = s.w;
        ctx.stroke();
      }
    }
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
    />
  );
}
