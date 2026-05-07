import React, { useEffect, useRef } from 'react';

function mkRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

function makeCandles(count, seed) {
  const r = mkRng(seed);
  let p = 55 + r() * 50;
  return Array.from({ length: count }, () => {
    const o = p;
    const c = Math.max(5, o + (r() - 0.48) * 9);
    const h = Math.max(o, c) + r() * 4;
    const l = Math.min(o, c) - r() * 3;
    p = c;
    return { o, c, h, l };
  });
}

/* Multiple sets of candles — one per scroll "scene" */
const SETS = [77, 133, 211, 317, 401, 503].map((seed, i) => makeCandles(52, seed + i));

function drawChart(ctx, candles, cx, cy, cw, ch, op) {
  if (op <= 0.005) return;
  const allP = candles.flatMap(c => [c.h, c.l]);
  const mn = Math.min(...allP), mx = Math.max(...allP);
  const sy = p => cy + ch - ((p - mn) / ((mx - mn) || 1)) * ch;
  const barW = cw / candles.length;
  const bw = Math.max(1.2, barW * 0.52);

  ctx.save();
  ctx.globalAlpha = op;

  /* Grid */
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 0.3;
  ctx.setLineDash([3, 10]);
  [0.2, 0.5, 0.8].forEach(t => {
    ctx.beginPath(); ctx.moveTo(cx, cy + ch * t); ctx.lineTo(cx + cw, cy + ch * t); ctx.stroke();
  });
  ctx.setLineDash([]);

  /* Candles + price line */
  let lineX = null, lineY = null;
  candles.forEach((c, i) => {
    const x = cx + i * barW + barW / 2;
    const bull = c.c >= c.o;
    ctx.strokeStyle = 'white'; ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(x, sy(c.h)); ctx.lineTo(x, sy(c.l)); ctx.stroke();
    const bt = sy(Math.max(c.o, c.c)), bh = Math.max(1, Math.abs(sy(c.o) - sy(c.c)));
    if (bull) { ctx.fillStyle = 'white'; ctx.fillRect(x - bw / 2, bt, bw, bh); }
    else { ctx.strokeRect(x - bw / 2, bt, bw, bh); }
    if (lineX === null) { lineX = x; lineY = sy(c.c); }
  });

  /* Price line */
  ctx.beginPath();
  candles.forEach((c, i) => {
    const x = cx + i * barW + barW / 2;
    i === 0 ? ctx.moveTo(x, sy(c.c)) : ctx.lineTo(x, sy(c.c));
  });
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();

  /* Volume bars */
  const span = mx - mn || 1;
  const volH = ch * 0.1, volY = cy + ch + 3;
  candles.forEach((c, i) => {
    const x = cx + i * barW;
    const v = Math.abs(c.c - c.o) / span;
    ctx.fillStyle = 'rgba(255,255,255,1)';
    ctx.fillRect(x + 1, volY + volH * (1 - v), Math.max(1, barW - 2), volH * v);
  });

  ctx.restore();
}

export default function GlobalCharts() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, raf;
    let scrollY = window.scrollY;
    let targetScroll = scrollY;

    const onScroll = () => { targetScroll = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    function frame() {
      raf = requestAnimationFrame(frame);

      /* Smooth scroll value */
      scrollY += (targetScroll - scrollY) * 0.06;
      const sy = scrollY;

      /* Normalized scroll: 0 = top, cycles every 600px */
      const cycle = 600;
      const t = (sy % cycle) / cycle;           // 0..1 within cycle
      const cycleIdx = Math.floor(sy / cycle);  // which cycle

      ctx.clearRect(0, 0, W, H);

      /* Layout: 4 chart slots. Scroll drives which set is shown and where. */

      /* Chart A — right large */
      const aX = W * 0.54 + Math.sin(t * Math.PI * 2) * W * 0.04;
      const aY = H * 0.04 + t * H * 0.06;
      const aOp = 0.065 * (1 - Math.abs(Math.sin(t * Math.PI)));
      const aSet = SETS[cycleIdx % SETS.length];
      drawChart(ctx, aSet.slice(0, 48), aX, aY, W * 0.43, H * 0.36, aOp + 0.04);

      /* Chart B — bottom left, fades in as you scroll */
      const bOp = 0.048 * (0.4 + 0.6 * Math.pow(Math.sin(t * Math.PI), 0.5));
      const bX = W * 0.01 - (1 - t) * W * 0.05;
      const bY = H * 0.55 + (1 - t) * H * 0.04;
      drawChart(ctx, SETS[(cycleIdx + 1) % SETS.length].slice(4, 36), bX, bY, W * 0.27, H * 0.24, bOp);

      /* Chart C — top left mini, drifts */
      const cOp = 0.036 * (0.5 + 0.5 * Math.cos(t * Math.PI * 2));
      const cX = W * 0.01 + t * W * 0.03;
      const cY = H * 0.04 + Math.sin(t * Math.PI) * H * 0.04;
      drawChart(ctx, SETS[(cycleIdx + 2) % SETS.length].slice(0, 22), cX, cY, W * 0.17, H * 0.15, cOp + 0.02);

      /* Chart D — bottom right, slides in */
      const dOp = 0.042 * (0.3 + 0.7 * t);
      const dX = W * 0.73 + (1 - t) * W * 0.06;
      const dY = H * 0.67;
      drawChart(ctx, SETS[(cycleIdx + 3) % SETS.length].slice(8, 36), dX, dY, W * 0.25, H * 0.22, dOp);
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
    />
  );
}
