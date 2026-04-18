import React, { useEffect, useRef } from 'react';
import { useTheme } from '@/lib/ThemeContext';

export const cursorStateRef = { x: -9999, y: -9999, vx: 0, vy: 0, moving: false };

function buildStrands(W, H) {
  const strands = [];
  const COUNT = window.matchMedia('(pointer: coarse)').matches ? 35 : 65;
  // Focal point: bottom-left area (like Pegasus)
  const ox = W * 0.12, oy = H * 0.82;
  for (let i = 0; i < COUNT; i++) {
    // Angle spread: mostly up and right
    const angle = -Math.PI * 0.9 + (Math.random() * Math.PI * 0.85);
    strands.push({
      ox, oy, angle,
      len: 400 + Math.random() * W * 0.6,
      segments: 28,
      amp: 15 + Math.random() * 55,
      freq: 0.6 + Math.random() * 2.2,
      phase: Math.random() * Math.PI * 2,
      speed: 0.18 + Math.random() * 0.55,
      op: 0.04 + Math.random() * 0.14,
      width: 0.3 + Math.random() * 0.5,
    });
  }
  return strands;
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
    let W, H, raf;
    let strands = [];

    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const BASE = isMobile ? 80 : 200;
    const CONNECT = 120;

    const nodes = [];
    const signals = [];
    let lastSpawn = 0, cpPtr = 0;
    const MAX_CURSOR = 50;
    const cursorPool = new Array(MAX_CURSOR).fill(null);

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      strands = buildStrands(W, H);
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < BASE; i++) {
      nodes.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
        r: 1.2 + Math.random() * 1.8, op: 0.2 + Math.random() * 0.45,
        pulseTimer: 2000 + Math.random() * 7000, pulseActive: false, pulse: 0,
      });
    }

    let lastTs = 0;
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(ts - lastTs, 50);
      lastTs = ts;

      ctx.clearRect(0, 0, W, H);
      const dark = themeRef.current === 'dark';
      const rgb = dark ? '255,255,255' : '10,10,10';
      const fiberRgb = dark ? '160,130,255' : '60,60,180'; // purple tint for fibers

      // === FIBER STRANDS (Pegasus effect) ===
      const t = ts * 0.001;
      for (const s of strands) {
        ctx.beginPath();
        const perp = s.angle + Math.PI / 2;
        for (let seg = 0; seg <= s.segments; seg++) {
          const p = seg / s.segments;
          const dist = p * s.len;
          const wave = Math.sin(p * s.freq * Math.PI * 2 + s.phase + t * s.speed) * s.amp * Math.sqrt(p);
          const x = s.ox + Math.cos(s.angle) * dist + Math.cos(perp) * wave;
          const y = s.oy + Math.sin(s.angle) * dist + Math.sin(perp) * wave;
          seg === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        // Fade: bright near origin, fade at tip
        const pulse = 0.7 + 0.3 * Math.sin(t * 0.7 + s.phase);
        ctx.strokeStyle = `rgba(${fiberRgb},${s.op * pulse})`;
        ctx.lineWidth = s.width;
        ctx.stroke();
      }

      // === NODE NETWORK ===
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > W) { n.vx *= -1; n.x = Math.max(0, Math.min(W, n.x)); }
        if (n.y < 0 || n.y > H) { n.vy *= -1; n.y = Math.max(0, Math.min(H, n.y)); }
        n.pulseTimer -= dt;
        if (n.pulseTimer <= 0 && !n.pulseActive) {
          n.pulseActive = true; n.pulse = 0;
          n.pulseTimer = 2000 + Math.random() * 7000;
        }
        if (n.pulseActive) {
          n.pulse = Math.min(1, n.pulse + dt / 200);
          if (n.pulse >= 1) { n.pulseActive = false; n.pulse = 0; }
        }
      }

      if (cursorStateRef.moving && !isMobile && ts - lastSpawn >= 20) {
        lastSpawn = ts;
        const { vx, vy } = cursorStateRef;
        const slot = cpPtr++ % MAX_CURSOR;
        cursorPool[slot] = {
          x: cursorStateRef.x, y: cursorStateRef.y,
          vx: (Math.random() - 0.5) * 0.7 - vx * 0.06,
          vy: (Math.random() - 0.5) * 0.7 - vy * 0.06,
          r: 1.8, baseR: 1.8, op: 0.8,
          life: 1.0, lifeDecay: 20 / 700, alive: true, cursor: true,
        };
      }

      const allNodes = nodes.slice();
      for (const cn of cursorPool) {
        if (!cn || !cn.alive) continue;
        cn.x += cn.vx; cn.y += cn.vy;
        cn.vx *= 0.91; cn.vy *= 0.91;
        cn.life -= cn.lifeDecay;
        cn.r = cn.baseR * cn.life; cn.op = 0.8 * cn.life;
        if (cn.life <= 0) { cn.alive = false; continue; }
        allNodes.push(cn);
      }

      const cc = new Array(allNodes.length).fill(0);
      for (let i = 0; i < allNodes.length; i++) {
        if (cc[i] >= 4) continue;
        const a = allNodes[i];
        for (let j = i + 1; j < allNodes.length; j++) {
          if (cc[j] >= 4) continue;
          const b = allNodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECT) {
            ctx.strokeStyle = `rgba(${rgb},${(1 - dist / CONNECT) * 0.18})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            if (a.pulseActive && a.pulse < 0.1 && !b.cursor && signals.length < 30)
              signals.push({ x: a.x, y: a.y, tx: b.x, ty: b.y, t: 0 });
            cc[i]++; cc[j]++;
            if (cc[i] >= 4) break;
          }
        }
      }

      for (const n of allNodes) {
        const ps = n.pulseActive ? 1 + n.pulse * 0.5 : 1;
        const op = n.pulseActive ? Math.min(1, n.op + n.pulse * 0.4) : n.op;
        ctx.fillStyle = `rgba(${rgb},${op})`;
        ctx.beginPath();
        ctx.arc(n.x, n.y, Math.max(0.5, n.r * ps), 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = signals.length - 1; i >= 0; i--) {
        const s = signals[i];
        const len = Math.max(1, Math.sqrt((s.tx - s.x) ** 2 + (s.ty - s.y) ** 2));
        s.t = Math.min(1, s.t + 2 / len);
        ctx.fillStyle = `rgba(${rgb},${(1 - s.t) * 0.85})`;
        ctx.beginPath();
        ctx.arc(s.x + (s.tx - s.x) * s.t, s.y + (s.ty - s.y) * s.t, 2, 0, Math.PI * 2);
        ctx.fill();
        if (s.t >= 1) signals.splice(i, 1);
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
