import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTheme } from '@/lib/ThemeContext';

export const cursorStateRef = { x: -9999, y: -9999, vx: 0, vy: 0, moving: false };

function buildAxons(W, H, isMobile) {
  const count = isMobile ? 12 : 28;
  return Array.from({ length: count }, () => ({
    ox: W * 0.05 + Math.random() * W * 0.28,
    oy: H * 0.62 + Math.random() * H * 0.48,
    angle: -Math.PI * 0.9 + Math.random() * Math.PI * 0.85,
    len: 320 + Math.random() * W * 0.68,
    amp: 5 + Math.random() * 20,
    freq: 0.6 + Math.random() * 2.0,
    phase: Math.random() * Math.PI * 2,
    speed: 0.10 + Math.random() * 0.26,
    w: 0.2 + Math.random() * 0.3,
    op: 0.04 + Math.random() * 0.07,
  }));
}

function makeNode(W, H) {
  return {
    x: Math.random() * W, y: Math.random() * H,
    hx: Math.random() * W, hy: Math.random() * H,
    vx: (Math.random() - 0.5) * 3.5,
    vy: (Math.random() - 0.5) * 3.5,
    r: 0.6 + Math.random() * 1.2,
    op: 0.2 + Math.random() * 0.38,
    phase: Math.random() * Math.PI * 2,
    pulseTimer: 800 + Math.random() * 6000,
    pulseActive: false, pulse: 0,
    state: 'storm',
    tx: 0, ty: 0,
    ax: 0, ay: 0,
    aProgress: 0,
    releaseT: 0,
  };
}

export default function GlobalNeural() {
  const canvasRef = useRef(null);
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  const location = useLocation();
  useEffect(() => { themeRef.current = theme; }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    const BASE = isMobile ? 40 : 80;
    const CONN = isMobile ? 60 : 80;
    const STORM_MS = 800;

    let W, H, raf;
    let axons = [];
    let nodes = [];
    const signals = [];
    let stormStart = 0;

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      axons = buildAxons(W, H, isMobile);
    }

    function init() {
      stormStart = performance.now();
      nodes = Array.from({ length: BASE }, () => makeNode(W, H));
    }

    resize();
    init();
    window.addEventListener('resize', resize);

    // Cursor trail pool
    const MAX_TRAIL = 40;
    const trail = new Array(MAX_TRAIL).fill(null);
    let trailPtr = 0, lastTrailSpawn = 0;

    // __neuronField API
    let assembledGroup = [];
    window.__neuronField = {
      _lastScrollY: 0,

      setScrollY(scrollY) {
        const dy = scrollY - this._lastScrollY;
        this._lastScrollY = scrollY;
        nodes.forEach(n => {
          if (n.state !== 'free' && n.state !== 'storm') return;
          n.hy -= dy * 0.4;
          n.vy -= dy * 0.007;
          if (n.hy < -80) n.hy += H + 160;
          if (n.hy > H + 80) n.hy -= H + 160;
        });
      },

      assembleAt(pts) {
        const free = nodes.filter(n => n.state === 'free');
        const count = Math.min(pts.length, free.length, 300);
        const sp = pts.slice().sort(() => Math.random() - 0.5).slice(0, count);
        const sn = free.slice().sort(() => Math.random() - 0.5).slice(0, count);
        assembledGroup = sn;
        sn.forEach((n, i) => {
          n.state = 'assembling';
          n.tx = sp[i].x; n.ty = sp[i].y;
          n.ax = n.x; n.ay = n.y;
          n.aProgress = 0;
        });
      },

      release() {
        assembledGroup.forEach(n => {
          if (n.state !== 'assembled' && n.state !== 'assembling') return;
          n.state = 'releasing';
          n.hx = Math.random() * W;
          n.hy = Math.random() * H;
          n.releaseT = 0;
        });
        assembledGroup = [];
      },

      pulse(x, y) {
        let best = null, bd = Infinity;
        for (const n of nodes) {
          if (n.state !== 'free') continue;
          const d = (n.x - x) ** 2 + (n.y - y) ** 2;
          if (d < bd) { bd = d; best = n; }
        }
        if (best) { best.pulseActive = true; best.pulse = 0; }
      },
    };

    let lastTs = 0;
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(ts - lastTs, 40);
      lastTs = ts;
      const t = ts * 0.001;
      const stormOver = ts - stormStart > STORM_MS;
      const rgb = themeRef.current === 'dark' ? '255,255,255' : '10,10,10';

      ctx.clearRect(0, 0, W, H);

      // ── Layer 1: Axon strands ──
      for (const s of axons) {
        ctx.beginPath();
        const perp = s.angle + Math.PI / 2;
        for (let seg = 0; seg <= 30; seg++) {
          const p = seg / 30;
          const dist = p * s.len;
          const wx = s.ox + Math.cos(s.angle) * dist;
          const wy = s.oy + Math.sin(s.angle) * dist;
          const cdx = wx - cursorStateRef.x, cdy = wy - cursorStateRef.y;
          const cd = Math.sqrt(cdx * cdx + cdy * cdy);
          const warp = cd < 300 && cd > 0 ? (1 - cd / 300) * 3 : 0;
          const wave = Math.sin(p * s.freq * Math.PI * 2 + s.phase + t * s.speed) * s.amp * Math.sqrt(p);
          const x = wx + Math.cos(perp) * wave + (cd > 0 ? (cdx / cd) * warp : 0);
          const y = wy + Math.sin(perp) * wave + (cd > 0 ? (cdy / cd) * warp : 0);
          seg === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.strokeStyle = `rgba(${rgb},${s.op * (0.7 + 0.3 * Math.sin(t * 0.7 + s.phase))})`;
        ctx.lineWidth = s.w;
        ctx.stroke();
      }

      // ── Layer 2: Nodes ──
      for (const n of nodes) {
        if (n.state === 'storm') {
          if (stormOver) {
            n.state = 'free';
            n.vx *= 0.25; n.vy *= 0.25;
          } else {
            n.x += n.vx; n.y += n.vy;
            if (n.x < 0 || n.x > W) { n.vx *= -1; n.x = Math.max(0, Math.min(W, n.x)); }
            if (n.y < 0 || n.y > H) { n.vy *= -1; n.y = Math.max(0, Math.min(H, n.y)); }
            continue;
          }
        }

        if (n.state === 'free') {
          n.vx += (n.hx - n.x) * 0.013;
          n.vy += (n.hy - n.y) * 0.013;
          if (!isMobile && cursorStateRef.x > 0) {
            const dx = cursorStateRef.x - n.x, dy = cursorStateRef.y - n.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            const R = 180;
            if (d < R && d > 1) {
              const f = Math.pow(1 - d / R, 1.5) * 1.5;
              n.vx += (dx / d) * f * dt * 0.0009;
              n.vy += (dy / d) * f * dt * 0.0009;
              n.hx += (cursorStateRef.x - n.hx) * 0.0018;
              n.hy += (cursorStateRef.y - n.hy) * 0.0018;
            } else if (d >= R) {
              const ox = n.hx - n.x, oy = n.hy - n.y;
              if (Math.abs(ox) > 2 || Math.abs(oy) > 2) { n.hx -= ox * 0.005; n.hy -= oy * 0.005; }
            }
          }
          n.vx *= 0.87; n.vy *= 0.87;
          n.x += n.vx; n.y += n.vy;
          if (n.x < 0 || n.x > W) { n.vx *= -1; n.x = Math.max(0, Math.min(W, n.x)); }
          if (n.y < 0 || n.y > H) { n.vy *= -1; n.y = Math.max(0, Math.min(H, n.y)); }
          n.pulseTimer -= dt;
          if (n.pulseTimer <= 0 && !n.pulseActive) {
            n.pulseActive = true; n.pulse = 0;
            n.pulseTimer = 1800 + Math.random() * 5000;
          }
          if (n.pulseActive) {
            n.pulse = Math.min(1, n.pulse + dt / 260);
            if (n.pulse >= 1) { n.pulseActive = false; n.pulse = 0; }
          }
        }

        if (n.state === 'assembling') {
          n.aProgress = Math.min(1, n.aProgress + dt * 0.0017);
          const e = 1 - Math.pow(1 - n.aProgress, 3);
          n.x = n.ax + (n.tx - n.ax) * e;
          n.y = n.ay + (n.ty - n.ay) * e;
          if (n.aProgress >= 1) n.state = 'assembled';
        }

        if (n.state === 'assembled') {
          n.x = n.tx + Math.sin(ts * 0.0005 + n.phase) * 1.2;
          n.y = n.ty + Math.cos(ts * 0.00042 + n.phase) * 1.2;
        }

        if (n.state === 'releasing') {
          n.x += (n.hx - n.x) * 0.035;
          n.y += (n.hy - n.y) * 0.035;
          n.releaseT += dt;
          if (n.releaseT > 1200) { n.state = 'free'; n.releaseT = 0; }
        }
      }

      // Cursor trail
      if (cursorStateRef.moving && !isMobile && ts - lastTrailSpawn > 22) {
        lastTrailSpawn = ts;
        const slot = trailPtr++ % MAX_TRAIL;
        trail[slot] = {
          x: cursorStateRef.x, y: cursorStateRef.y,
          vx: (Math.random() - 0.5) * 0.7 - cursorStateRef.vx * 0.05,
          vy: (Math.random() - 0.5) * 0.7 - cursorStateRef.vy * 0.05,
          r: 1.3, op: 0.75, life: 1.0, alive: true, cursor: true,
        };
      }

      const allNodes = nodes.filter(n => n.state !== 'storm');
      for (const tn of trail) {
        if (!tn || !tn.alive) continue;
        tn.x += tn.vx; tn.y += tn.vy;
        tn.vx *= 0.91; tn.vy *= 0.91;
        tn.life -= dt / 700; tn.op = 0.75 * tn.life;
        tn.r = 1.3 * tn.life;
        if (tn.life <= 0) { tn.alive = false; continue; }
        allNodes.push(tn);
      }

      // Connections
      const cc = new Array(allNodes.length).fill(0);
      for (let i = 0; i < allNodes.length; i++) {
        if (cc[i] >= 5) continue;
        const a = allNodes[i];
        for (let j = i + 1; j < allNodes.length; j++) {
          if (cc[j] >= 5) continue;
          const b = allNodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          if (Math.abs(dx) > CONN || Math.abs(dy) > CONN) continue;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist >= CONN) continue;
          const both = a.state === 'assembled' && b.state === 'assembled';
          ctx.strokeStyle = `rgba(${rgb},${(1 - dist / CONN) * (both ? 0.32 : 0.10)})`;
          ctx.lineWidth = both ? 0.7 : 0.3;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          if (a.pulseActive && a.pulse < 0.08 && !b.cursor && signals.length < 25)
            signals.push({ x: a.x, y: a.y, tx: b.x, ty: b.y, t: 0 });
          cc[i]++; cc[j]++;
          if (cc[i] >= 5) break;
        }
      }

      // Signals
      for (let i = signals.length - 1; i >= 0; i--) {
        const s = signals[i]; s.t = Math.min(1, s.t + 0.048);
        ctx.fillStyle = `rgba(${rgb},${(1 - s.t) * 0.82})`;
        ctx.beginPath();
        ctx.arc(s.x + (s.tx - s.x) * s.t, s.y + (s.ty - s.y) * s.t, 1.5, 0, Math.PI * 2);
        ctx.fill();
        if (s.t >= 1) signals.splice(i, 1);
      }

      // Draw nodes
      for (const n of allNodes) {
        const pulse = n.pulseActive ? Math.sin(n.pulse * Math.PI) : 0;
        const assembled = n.state === 'assembled';
        const r = Math.max(0.5, (n.r || 1.0) * (1 + pulse * 0.3) * (assembled ? 1.4 : 1));
        const op = Math.min(1, (n.op || 0.5) + (assembled ? 0.35 : 0) + pulse * 0.15);
        ctx.fillStyle = `rgba(${rgb},${op})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
        if (pulse > 0.05) {
          ctx.strokeStyle = `rgba(${rgb},${pulse * 0.18})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.arc(n.x, n.y, r * (1 + pulse * 3.5), 0, Math.PI * 2); ctx.stroke();
        }
      }
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      delete window.__neuronField;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
    />
  );
}
