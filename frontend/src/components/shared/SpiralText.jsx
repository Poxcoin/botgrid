import React, { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/lib/ThemeContext';

export default function SpiralText({ text = 'KADO', style = {}, className = '' }) {
  const canvasRef = useRef(null);
  const wrapRef  = useRef(null);
  const { theme } = useTheme();
  const [done, setDone] = useState(false);

  useEffect(() => {
    const wrap   = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const rect = wrap.getBoundingClientRect();
    const W = Math.ceil(rect.width)  || 700;
    const H = Math.ceil(rect.height) || 200;
    const dpr = window.devicePixelRatio || 1;

    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const rgb = theme === 'dark' ? '240,240,240' : '10,10,10';

    // Sample target points from text shape
    const off  = document.createElement('canvas');
    off.width  = W; off.height = H;
    const octx = off.getContext('2d');
    let fs = Math.round(H * 0.85);
    const face = '"Arial Black", Impact, sans-serif';
    for (let i = 0; i < 12; i++) {
      octx.font = `900 ${fs}px ${face}`;
      const tw = octx.measureText(text).width;
      if      (tw > W * 0.92) fs = Math.round(fs * 0.88);
      else if (tw < W * 0.78) fs = Math.round(fs * 1.08);
      else break;
    }
    octx.fillStyle = '#fff';
    octx.textAlign = 'center';
    octx.textBaseline = 'middle';
    octx.fillText(text, W / 2, H / 2);
    const data = octx.getImageData(0, 0, W, H).data;
    const step = Math.max(4, Math.ceil(Math.sqrt((W * H) / 400)));
    const targets = [];
    for (let y = 0; y < H; y += step)
      for (let x = 0; x < W; x += step)
        if (data[(y * W + x) * 4 + 3] > 120) targets.push({ x, y });

    if (targets.length === 0) { setDone(true); return; }

    // Each particle starts on a spiral around the center
    const cx = W / 2, cy = H / 2;
    const particles = targets.map((t, i) => {
      const angle  = (i / targets.length) * Math.PI * 14;
      const spread = 280 + Math.random() * 120;
      return {
        x:  cx + Math.cos(angle) * spread,
        y:  cy + Math.sin(angle) * spread * 0.45,
        tx: t.x, ty: t.y,
        r:  1.0 + Math.random() * 0.8,
        delay: i * 0.8,   // ms stagger
      };
    });

    const SETTLE = 1800; // ms to fully settle
    let startTs = null, raf;

    function tick(ts) {
      if (!startTs) startTs = ts;
      const el = ts - startTs;

      ctx.clearRect(0, 0, W, H);

      let allSettled = true;
      for (const p of particles) {
        const progress = Math.max(0, Math.min(1, (el - p.delay) / (SETTLE * 0.9)));
        // ease-out cubic
        const e = 1 - Math.pow(1 - progress, 3);

        p.x += (p.tx - p.x) * (e > 0.001 ? e * 0.09 : 0.1);
        p.y += (p.ty - p.y) * (e > 0.001 ? e * 0.09 : 0.1);

        const dist = Math.hypot(p.x - p.tx, p.y - p.ty);
        if (dist > 0.8) allSettled = false;

        const op = 0.25 + e * 0.75;
        ctx.fillStyle = `rgba(${rgb},${op})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }

      if (allSettled || el > SETTLE + 600) {
        ctx.clearRect(0, 0, W, H);
        setDone(true);
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [theme, text]);

  return (
    <span ref={wrapRef} className={className} style={{ position: 'relative', display: 'inline-block', ...style }}>
      {/* Canvas overlay — fades out when done */}
      <canvas ref={canvasRef} style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 2,
        opacity: done ? 0 : 1,
        transition: 'opacity 500ms ease',
      }} />
      {/* Real text — fades in when animation ends */}
      <span style={{
        display: 'block',
        opacity: done ? 1 : 0,
        transition: 'opacity 500ms ease 150ms',
        color: 'inherit',
        fontWeight: 'inherit',
        letterSpacing: 'inherit',
      }}>
        {text}
      </span>
    </span>
  );
}
