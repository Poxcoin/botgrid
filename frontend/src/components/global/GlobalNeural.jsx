import React, { useEffect, useRef } from 'react';
import { useTheme } from '@/lib/ThemeContext';

export const cursorStateRef = { x: -9999, y: -9999, vx: 0, vy: 0, moving: false };

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

    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const BASE = isMobile ? 120 : 280;
    const MAX_CURSOR = 60;
    const CONNECT = 130;

    const nodes = [];
    const cursorPool = new Array(MAX_CURSOR).fill(null);
    const signals = [];
    let cpPtr = 0, lastSpawn = 0;

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < BASE; i++) {
      nodes.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        r: 1.5 + Math.random() * 2,
        op: 0.3 + Math.random() * 0.55,
        pulseTimer: 2000 + Math.random() * 6000,
        pulseActive: false, pulse: 0,
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

      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > W) { n.vx *= -1; n.x = Math.max(0, Math.min(W, n.x)); }
        if (n.y < 0 || n.y > H) { n.vy *= -1; n.y = Math.max(0, Math.min(H, n.y)); }
        n.pulseTimer -= dt;
        if (n.pulseTimer <= 0 && !n.pulseActive) {
          n.pulseActive = true; n.pulse = 0;
          n.pulseTimer = 2000 + Math.random() * 6000;
        }
        if (n.pulseActive) {
          n.pulse = Math.min(1, n.pulse + dt / 200);
          if (n.pulse >= 1) { n.pulseActive = false; n.pulse = 0; }
        }
      }

      // spawn cursor trail
      if (cursorStateRef.moving && !isMobile && ts - lastSpawn >= 16) {
        lastSpawn = ts;
        const { vx, vy } = cursorStateRef;
        const fast = Math.sqrt(vx * vx + vy * vy) > 8;
        const bv = fast ? 0.9 : 0.35;
        const slot = cpPtr++ % MAX_CURSOR;
        cursorPool[slot] = {
          x: cursorStateRef.x, y: cursorStateRef.y,
          vx: (Math.random() - 0.5) * bv * 2 * (fast ? 1.3 : 1) - vx * 0.08,
          vy: (Math.random() - 0.5) * bv * 2 * (fast ? 1.3 : 1) - vy * 0.08,
          r: 1.8, baseR: 1.8, op: 0.85,
          life: 1.0, lifeDecay: 16 / 700,
          alive: true, cursor: true,
        };
      }

      const allNodes = nodes.slice();
      for (const cn of cursorPool) {
        if (!cn || !cn.alive) continue;
        cn.x += cn.vx; cn.y += cn.vy;
        cn.vx *= 0.90; cn.vy *= 0.90;
        cn.life -= cn.lifeDecay;
        cn.r = cn.baseR * cn.life;
        cn.op = 0.85 * cn.life;
        if (cn.life <= 0) { cn.alive = false; continue; }
        allNodes.push(cn);
      }

      // connections
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
            const lo = (1 - dist / CONNECT) * 0.22;
            ctx.strokeStyle = `rgba(${rgb},${lo})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
            if (a.pulseActive && a.pulse < 0.1 && !b.cursor && signals.length < 40)
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
