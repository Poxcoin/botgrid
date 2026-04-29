# Neural Animation System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace GlobalNeural + CharReveal with a three-layer neural engine — A4 axon strands underneath, A3 dense node field on top, A2 letter assembly when text enters viewport.

**Architecture:** Single `<canvas>` in `GlobalNeural.jsx` owns the full simulation and exposes `window.__neuronField` API. `NeuralText.jsx` samples letter contours on an offscreen canvas and calls `assembleAt()` to pull field nodes toward the letter shape. Scroll and cursor events feed into the engine via event listeners in `App.jsx`.

**Tech Stack:** React 18, Vite, Canvas 2D API, IntersectionObserver, requestAnimationFrame

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Rewrite | `src/components/global/GlobalNeural.jsx` | A4 axons + A3 nodes + cursor + scroll + `__neuronField` API |
| Create | `src/lib/useNeuralAssemble.js` | IntersectionObserver hook → one-shot `triggered` boolean |
| Create | `src/components/shared/NeuralText.jsx` | Offscreen text sampling + `assembleAt` trigger + invisible placeholder |
| Edit | `src/components/landing/Hero.jsx` | Replace `CharReveal text="KADO"` with `<NeuralText>` |
| Edit | `src/components/landing/LandingCTA.jsx` | Replace `FallingLetters` with `<NeuralText>` for "READY TO / START?" |
| Edit | `src/App.jsx` | Remove ScrollNeuron import/useEffect; add scroll → `setScrollY` listener |
| Delete | `src/lib/ScrollNeuron.js` | No longer needed — merged into GlobalNeural |

---

## Task 1 — `useNeuralAssemble.js`

**Files:**
- Create: `src/lib/useNeuralAssemble.js`

Identical pattern to `useScrollReveal.js` but never disconnects — fires once and stays triggered.

- [ ] **Step 1: Create the hook**

```js
// src/lib/useNeuralAssemble.js
import { useRef, useState, useEffect } from 'react';

export default function useNeuralAssemble(threshold = 0.1) {
  const ref = useRef(null);
  const [triggered, setTriggered] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setTriggered(true); },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);

  return [ref, triggered];
}
```

- [ ] **Step 2: Verify dev server still starts**

```bash
cd "/home/minus/Desktop/bot grid/frontend" && npm run dev -- --port 5174
```
Expected: `VITE ready` — no errors in terminal.

- [ ] **Step 3: Commit**

```bash
cd "/home/minus/Desktop/bot grid" && git add frontend/src/lib/useNeuralAssemble.js
git commit -m "feat: add useNeuralAssemble hook (IntersectionObserver, one-shot)"
```

---

## Task 2 — `NeuralText.jsx`

**Files:**
- Create: `src/components/shared/NeuralText.jsx`

Renders an invisible placeholder `<span>` (preserves layout). When `triggered`, samples the element's bounding rect → runs `fillText` on an offscreen canvas → collects filled pixel coords → calls `window.__neuronField.assembleAt(pts)`. On unmount calls `release()`.

- [ ] **Step 1: Create component**

```jsx
// src/components/shared/NeuralText.jsx
import React, { useRef, useEffect } from 'react';
import useNeuralAssemble from '@/lib/useNeuralAssemble';

function sampleContour(text, rect, fontWeight) {
  const W = Math.ceil(rect.width);
  const H = Math.ceil(rect.height);
  if (W < 2 || H < 2) return [];

  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const ctx = off.getContext('2d');

  // Binary search: find font size that fills 80–92% of element width.
  // Needed because font size is a CSS clamp() value — we only know the
  // rendered bounding rect, not the resolved px value.
  let fs = Math.round(H * 0.85);
  const face = `Arial Black, Impact, sans-serif`;
  for (let i = 0; i < 10; i++) {
    ctx.font = `${fontWeight} ${fs}px ${face}`;
    const tw = ctx.measureText(text).width;
    if (tw > W * 0.92) fs = Math.round(fs * 0.88);
    else if (tw < W * 0.78) fs = Math.round(fs * 1.08);
    else break;
  }

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2);

  const data = ctx.getImageData(0, 0, W, H).data;
  const pts = [];
  // Step size balances density vs node count (max ~300 pts)
  const step = Math.max(5, Math.ceil(Math.sqrt((W * H) / 300)));
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (data[(y * W + x) * 4 + 3] > 120) {
        // Convert to absolute viewport coords
        pts.push({ x: rect.left + x, y: rect.top + y });
      }
    }
  }
  return pts;
}

export default function NeuralText({
  text,
  fontWeight = 900,
  className = '',
  style = {},
  tag: Tag = 'span',
}) {
  const [ref, triggered] = useNeuralAssemble(0.1);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!triggered || firedRef.current) return;
    // Wait one frame so layout is painted and getBoundingClientRect is accurate
    requestAnimationFrame(() => {
      if (!ref.current || !window.__neuronField) return;
      firedRef.current = true;
      const rect = ref.current.getBoundingClientRect();
      const pts = sampleContour(text, rect, fontWeight);
      if (pts.length > 0) window.__neuronField.assembleAt(pts);
    });
  }, [triggered, text, fontWeight]);

  useEffect(() => {
    return () => {
      if (firedRef.current) window.__neuronField?.release();
    };
  }, []);

  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        // Invisible — nodes build the visible letter
        color: 'transparent',
        display: 'inline-block',
        userSelect: 'none',
        // Keep layout identical to what CharReveal would produce
        ...style,
      }}
    >
      {text}
    </Tag>
  );
}
```

- [ ] **Step 2: Check import resolves in dev server**

Open `http://localhost:5174` — no console errors about missing module.

- [ ] **Step 3: Commit**

```bash
cd "/home/minus/Desktop/bot grid" && git add frontend/src/components/shared/NeuralText.jsx
git commit -m "feat: add NeuralText component (offscreen contour sampling + assembleAt)"
```

---

## Task 3 — `GlobalNeural.jsx` rewrite — A4 axon layer

**Files:**
- Rewrite: `src/components/global/GlobalNeural.jsx`

Start fresh. Write the canvas setup, resize handler, and A4 axon render only. No nodes yet. Verify axons appear before adding complexity.

- [ ] **Step 1: Replace file with axon-only skeleton**

```jsx
// src/components/global/GlobalNeural.jsx
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
```

- [ ] **Step 2: Visual check — axon strands visible**

Open `http://localhost:5174`. Verify: thin flowing white fibers visible on black background, no console errors.

- [ ] **Step 3: Commit**

```bash
cd "/home/minus/Desktop/bot grid" && git add frontend/src/components/global/GlobalNeural.jsx
git commit -m "feat(neural): A4 axon layer — thin strands with cursor warp"
```

---

## Task 4 — `GlobalNeural.jsx` — A3 node field + storm + cursor + scroll

**Files:**
- Modify: `src/components/global/GlobalNeural.jsx`

Add 250–350 nodes on top of axons. Storm phase on load (turbulent for 800ms → settles). Cursor attraction. Scroll shift. Synaptic signals.

- [ ] **Step 1: Replace the full file with A3+A4 combined (no assembly API yet)**

```jsx
// src/components/global/GlobalNeural.jsx
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
    w: 0.2 + Math.random() * 0.3,
    op: 0.04 + Math.random() * 0.07,
  }));
}

function makeNode(W, H) {
  return {
    x: Math.random() * W, y: Math.random() * H,
    hx: Math.random() * W, hy: Math.random() * H,
    // Storm: high initial velocity, settles after STORM_MS
    vx: (Math.random() - 0.5) * 3.5,
    vy: (Math.random() - 0.5) * 3.5,
    r: 0.6 + Math.random() * 1.2,
    op: 0.2 + Math.random() * 0.38,
    phase: Math.random() * Math.PI * 2,
    pulseTimer: 800 + Math.random() * 6000,
    pulseActive: false, pulse: 0,
    // Assembly state
    state: 'storm', // storm | free | assembling | assembled | releasing
    tx: 0, ty: 0,   // assembly target
    ax: 0, ay: 0,   // assembly origin
    aProgress: 0,
    releaseT: 0,
  };
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
    const BASE = isMobile ? 130 : 300;
    const CONN = isMobile ? 72 : 95;
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

    // Expose scroll setter — filled in Task 5
    window.__neuronField = { setScrollY: () => {}, assembleAt: () => {}, release: () => {}, pulse: () => {}, _lastScrollY: 0 };

    let lastTs = 0;
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(ts - lastTs, 40);
      lastTs = ts;
      const t = ts * 0.001;
      const stormOver = ts - stormStart > STORM_MS;
      const rgb = themeRef.current === 'dark' ? '255,255,255' : '10,10,10';

      ctx.clearRect(0, 0, W, H);

      // ── Layer 1: Axons ──────────────────────────────────
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

      // ── Layer 2: Nodes ──────────────────────────────────
      for (const n of nodes) {
        if (n.state === 'storm') {
          if (stormOver) {
            n.state = 'free';
            n.vx *= 0.25; n.vy *= 0.25; // dampen storm velocity
          } else {
            n.x += n.vx; n.y += n.vy;
            if (n.x < 0 || n.x > W) { n.vx *= -1; n.x = Math.max(0, Math.min(W, n.x)); }
            if (n.y < 0 || n.y > H) { n.vy *= -1; n.y = Math.max(0, Math.min(H, n.y)); }
            continue; // skip draw during storm (nodes are spread out)
          }
        }

        if (n.state === 'free') {
          // Spring to home
          n.vx += (n.hx - n.x) * 0.013;
          n.vy += (n.hy - n.y) * 0.013;
          // Cursor attraction (desktop only)
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
              // Home drifts back
              const ox = n.hx - n.x, oy = n.hy - n.y;
              if (Math.abs(ox) > 2 || Math.abs(oy) > 2) { n.hx -= ox * 0.005; n.hy -= oy * 0.005; }
            }
          }
          n.vx *= 0.87; n.vy *= 0.87;
          n.x += n.vx; n.y += n.vy;
          if (n.x < 0 || n.x > W) { n.vx *= -1; n.x = Math.max(0, Math.min(W, n.x)); }
          if (n.y < 0 || n.y > H) { n.vy *= -1; n.y = Math.max(0, Math.min(H, n.y)); }
          // Pulse
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
          const e = 1 - Math.pow(1 - n.aProgress, 3); // easeOutCubic
          n.x = n.ax + (n.tx - n.ax) * e;
          n.y = n.ay + (n.ty - n.ay) * e;
          if (n.aProgress >= 1) n.state = 'assembled';
        }

        if (n.state === 'assembled') {
          // Subtle breathing (±1.2px)
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

      // Build allNodes (field + trail)
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

      // ── Connections ─────────────────────────────────────
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

      // ── Signals ─────────────────────────────────────────
      for (let i = signals.length - 1; i >= 0; i--) {
        const s = signals[i]; s.t = Math.min(1, s.t + 0.048);
        ctx.fillStyle = `rgba(${rgb},${(1 - s.t) * 0.82})`;
        ctx.beginPath();
        ctx.arc(s.x + (s.tx - s.x) * s.t, s.y + (s.ty - s.y) * s.t, 1.5, 0, Math.PI * 2);
        ctx.fill();
        if (s.t >= 1) signals.splice(i, 1);
      }

      // ── Draw nodes ──────────────────────────────────────
      for (const n of allNodes) {
        const pulse = n.pulseActive ? Math.sin(n.pulse * Math.PI) : 0;
        const assembled = n.state === 'assembled';
        const r = Math.max(0.5, (n.r || 1.0) * (1 + pulse * 0.3) * (assembled ? 1.4 : 1));
        const op = (n.op || 0.5) + (assembled ? 0.35 : 0) + pulse * 0.15;
        ctx.fillStyle = `rgba(${rgb},${Math.min(1, op)})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2); ctx.fill();
        if (pulse > 0.05) {
          ctx.strokeStyle = `rgba(${rgb},${pulse * 0.18})`;
          ctx.lineWidth = 0.6;
          ctx.beginPath(); ctx.arc(n.x, n.y, r * (1 + pulse * 3.5), 0, Math.PI * 2); ctx.stroke();
        }
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
```

- [ ] **Step 2: Visual check — storm + settle visible**

Open `http://localhost:5174`. Verify:
- On load: brief chaos (nodes scattered, fast movement)
- After ~0.8s: field settles into soft drifting pattern
- Moving mouse: nearby nodes lean toward cursor
- No console errors

- [ ] **Step 3: Commit**

```bash
cd "/home/minus/Desktop/bot grid" && git add frontend/src/components/global/GlobalNeural.jsx
git commit -m "feat(neural): A3 node field — storm, cursor attraction, scroll, synaptic signals"
```

---

## Task 5 — `GlobalNeural.jsx` — `window.__neuronField` full API

**Files:**
- Modify: `src/components/global/GlobalNeural.jsx`

Replace the stub `window.__neuronField` (set in Task 4) with the real implementation. The API must be set up **inside** the useEffect so it has closure access to `nodes`, `W`, `H`.

- [ ] **Step 1: Replace the stub with full API — find this line in Task 4's code:**

```js
// Expose scroll setter — filled in Task 5
window.__neuronField = { setScrollY: () => {}, assembleAt: () => {}, release: () => {}, pulse: () => {}, _lastScrollY: 0 };
```

Replace it with:

```js
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
      // Vertical wrap
      if (n.hy < -80) n.hy += H + 160;
      if (n.hy > H + 80) n.hy -= H + 160;
    });
  },

  assembleAt(pts) {
    const free = nodes.filter(n => n.state === 'free');
    const count = Math.min(pts.length, free.length, 300);
    // Shuffle both arrays to distribute assignment evenly
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
    // Find nearest free node and trigger its pulse
    let best = null, bd = Infinity;
    for (const n of nodes) {
      if (n.state !== 'free') continue;
      const d = (n.x - x) ** 2 + (n.y - y) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    if (best) { best.pulseActive = true; best.pulse = 0; }
  },
};
```

- [ ] **Step 2: Visual check — scroll wires up**

Open `http://localhost:5174`, scroll down slowly. Verify the node field shifts vertically with the page (not stuck in place).

- [ ] **Step 3: Commit**

```bash
cd "/home/minus/Desktop/bot grid" && git add frontend/src/components/global/GlobalNeural.jsx
git commit -m "feat(neural): wire __neuronField API — assembleAt, release, setScrollY, pulse"
```

---

## Task 6 — `Hero.jsx` — KADO assembles from nodes

**Files:**
- Modify: `src/components/landing/Hero.jsx`

Replace the `CharReveal text="KADO"` inside `<h1>` with `<NeuralText>`. The h1 keeps its existing font size and styles — NeuralText just makes the text transparent and calls `assembleAt` on mount.

- [ ] **Step 1: Add NeuralText import and swap the h1 content**

Find the existing import block at top of `Hero.jsx`:
```js
import NeuronReveal from '@/components/shared/NeuronReveal';
import CharReveal from '@/components/shared/CharReveal';
```

Add:
```js
import NeuralText from '@/components/shared/NeuralText';
```

Find the existing h1:
```jsx
<h1
  className="font-black leading-none select-none"
  style={{ fontSize: 'clamp(80px, 18vw, 220px)', letterSpacing: '-0.06em', color: 'var(--hero-fg)' }}
>
  <CharReveal text="KADO" delay={200} charDelay={120} tag="span" />
</h1>
```

Replace with:
```jsx
<h1
  className="font-black leading-none select-none"
  style={{ fontSize: 'clamp(80px, 18vw, 220px)', letterSpacing: '-0.06em', color: 'var(--hero-fg)' }}
>
  <NeuralText
    text="KADO"
    fontWeight={900}
    style={{ fontSize: 'clamp(80px, 18vw, 220px)', letterSpacing: '-0.06em' }}
  />
</h1>
```

- [ ] **Step 2: Visual check — KADO assembles from nodes**

Open `http://localhost:5174`. Verify:
- On page load, nodes from the field fly toward the KADO letter shapes
- Letters are not typed — they emerge from particle migration
- Layout height of h1 is preserved (invisible placeholder holds space)
- No console errors

- [ ] **Step 3: Commit**

```bash
cd "/home/minus/Desktop/bot grid" && git add frontend/src/components/landing/Hero.jsx
git commit -m "feat(hero): KADO assembles from neural field via NeuralText"
```

---

## Task 7 — `LandingCTA.jsx` — "READY TO START?" assembles on scroll

**Files:**
- Modify: `src/components/landing/LandingCTA.jsx`

Replace the `FallingLetters` component usage with `NeuralText`. Two separate NeuralText instances for each line — each gets its own `assembleAt` call when the section scrolls into view.

- [ ] **Step 1: Add NeuralText import**

At top of `LandingCTA.jsx`, add:
```js
import NeuralText from '@/components/shared/NeuralText';
```

Remove the `FallingLetters` function definition (the whole function — it's no longer needed).

- [ ] **Step 2: Replace the h2 content**

Find the existing h2:
```jsx
<h2 className="font-black tracking-[-0.05em] leading-[0.85] text-6xl md:text-[140px]">
  <span style={{ display: 'block' }}>
    <FallingLetters text="READY TO" visible={visible} baseDelay={80} />
  </span>
  <span style={{ display: 'block' }}>
    <FallingLetters text="START?" visible={visible} baseDelay={200} />
  </span>
</h2>
```

Replace with:
```jsx
<h2 className="font-black tracking-[-0.05em] leading-[0.85] text-6xl md:text-[140px]">
  <span style={{ display: 'block' }}>
    <NeuralText
      text="READY TO"
      fontWeight={900}
      style={{ fontSize: 'clamp(48px,10vw,140px)', letterSpacing: '-0.05em' }}
    />
  </span>
  <span style={{ display: 'block' }}>
    <NeuralText
      text="START?"
      fontWeight={900}
      style={{ fontSize: 'clamp(48px,10vw,140px)', letterSpacing: '-0.05em' }}
    />
  </span>
</h2>
```

- [ ] **Step 3: Visual check — CTA assembles on scroll**

Scroll to the bottom of `http://localhost:5174`. Verify "READY TO" and "START?" assemble from nodes when the section comes into view.

- [ ] **Step 4: Commit**

```bash
cd "/home/minus/Desktop/bot grid" && git add frontend/src/components/landing/LandingCTA.jsx
git commit -m "feat(cta): READY TO START? assembles from neural field on scroll"
```

---

## Task 8 — `App.jsx` — scroll listener + cleanup

**Files:**
- Modify: `src/App.jsx`
- Delete: `src/lib/ScrollNeuron.js`

- [ ] **Step 1: Remove ScrollNeuron from App.jsx**

Find and remove these lines from `App.jsx`:
```js
import { initScrollNeuron, destroyScrollNeuron } from '@/lib/ScrollNeuron';
```
And remove the useEffect that calls them:
```js
useEffect(() => {
  initScrollNeuron();
  return () => destroyScrollNeuron();
}, []);
```

- [ ] **Step 2: Add scroll listener**

In `App.jsx`, add a new useEffect after the existing ones (or as the only useEffect if ScrollNeuron's was the only one):

```js
useEffect(() => {
  const onScroll = () => window.__neuronField?.setScrollY(window.scrollY);
  window.addEventListener('scroll', onScroll, { passive: true });
  return () => window.removeEventListener('scroll', onScroll);
}, []);
```

- [ ] **Step 3: Delete ScrollNeuron.js**

```bash
rm "/home/minus/Desktop/bot grid/frontend/src/lib/ScrollNeuron.js"
```

- [ ] **Step 4: Visual check — full page scroll**

Open `http://localhost:5174`. Scroll through all sections:
- Node field shifts with scroll
- KADO assembled in hero
- READY TO / START? assemble in CTA section
- No console errors on any scroll position

- [ ] **Step 5: Commit**

```bash
cd "/home/minus/Desktop/bot grid" && git add -A frontend/src/
git commit -m "feat(app): wire scroll → __neuronField.setScrollY, remove ScrollNeuron"
```

---

## Task 9 — Final QA checklist

- [ ] **Load page cold** — storm phase visible for ~0.8s, then field settles
- [ ] **Move mouse slowly across hero** — nodes lean/follow cursor smoothly
- [ ] **Move mouse fast** — cursor trail visible, ripple at cursor
- [ ] **Scroll to Features section** — node field shifts, axon fibers visible throughout
- [ ] **Scroll to CTA** — "READY TO START?" assembles from field nodes
- [ ] **Light mode** — switch via ThemeToggle, nodes/axons switch to dark-on-white
- [ ] **Mobile (DevTools device sim)** — 130 nodes, no cursor interaction, still smooth
- [ ] **No FOUC** — KADO placeholder holds layout during assembly, no jumping
- [ ] **Dev server final check**: `npm run dev -- --port 5174` → no warnings
- [ ] **Build check**: `npm run build` → no errors
- [ ] **Final commit**

```bash
cd "/home/minus/Desktop/bot grid" && git add -A
git commit -m "feat: neural animation system complete — A4 axons + A3 field + A2 letter assembly"
```
