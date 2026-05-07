import React, { useEffect, useRef } from 'react';

function mkRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

function initCandles(count, seed) {
  const r = mkRng(seed);
  let p = 60 + r() * 40;
  return Array.from({ length: count }, () => {
    const o = p;
    const c = Math.max(5, o + (r() - 0.48) * 8);
    const h = Math.max(o, c) + r() * 4;
    const l = Math.min(o, c) - r() * 3;
    p = c;
    return { o, c, h, l };
  });
}

/* Chart descriptor — coords in 0..1 relative to canvas */
const CHARTS = [
  { rx: 0.54, ry: 0.04, rw: 0.44, rh: 0.37, count: 48, seed: 77,  op: 0.065, candleMs: 1800 },
  { rx: 0.01, ry: 0.55, rw: 0.28, rh: 0.25, count: 32, seed: 133, op: 0.048, candleMs: 2200 },
  { rx: 0.01, ry: 0.03, rw: 0.17, rh: 0.15, count: 22, seed: 211, op: 0.036, candleMs: 2600 },
  { rx: 0.73, ry: 0.67, rw: 0.26, rh: 0.22, count: 28, seed: 317, op: 0.042, candleMs: 2000 },
];

export default function GlobalCharts() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, raf;

    /* Initialise live state per chart */
    const states = CHARTS.map(cfg => {
      const r = mkRng(cfg.seed + 9999);
      return {
        cfg,
        r,
        candles: initCandles(cfg.count, cfg.seed),
        liveOpen: 0,
        livePrice: 0,
        elapsed: 0,
        init: false,
      };
    });

    function resize() {
      W = canvas.width = window.innerWidth;
      H = canvas.height = window.innerHeight;
      /* seed livePrice from last candle */
      states.forEach(st => {
        const last = st.candles[st.candles.length - 1];
        st.liveOpen = last.c;
        st.livePrice = last.c;
        st.init = true;
      });
    }

    function drawChart(st, dt) {
      const { cfg, candles, r } = st;
      const cx = cfg.rx * W, cy = cfg.ry * H;
      const cw = cfg.rw * W, ch = cfg.rh * H;

      /* Advance live candle */
      st.elapsed += dt;
      /* Tiny random walk — slow and smooth */
      st.livePrice += (r() - 0.495) * 0.5;

      if (st.elapsed >= cfg.candleMs) {
        st.elapsed = 0;
        const nc = {
          o: st.liveOpen,
          c: st.livePrice,
          h: Math.max(st.liveOpen, st.livePrice) + r() * 3,
          l: Math.min(st.liveOpen, st.livePrice) - r() * 2,
        };
        candles.push(nc);
        if (candles.length > cfg.count + 2) candles.shift();
        st.liveOpen = st.livePrice;
      }

      const progress = st.elapsed / cfg.candleMs; // 0..1 within current candle

      /* Price range */
      const allPrices = candles.flatMap(c => [c.h, c.l]).concat([st.livePrice]);
      const mn = Math.min(...allPrices), mx = Math.max(...allPrices);
      const span = mx - mn || 1;
      const sy = p => cy + ch - ((p - mn) / span) * ch;

      const barW = cw / cfg.count;
      const bw   = Math.max(1.2, barW * 0.52);

      /* offset so newest candle is always at right edge */
      const offset = (candles.length - cfg.count - 1 + progress) * barW;

      ctx.save();
      ctx.globalAlpha = cfg.op;

      /* Grid */
      ctx.strokeStyle = 'rgba(255,255,255,1)';
      ctx.lineWidth = 0.3;
      ctx.setLineDash([3, 10]);
      [0.2, 0.5, 0.8].forEach(t => {
        ctx.beginPath();
        ctx.moveTo(cx, cy + ch * t);
        ctx.lineTo(cx + cw, cy + ch * t);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      /* Past candles */
      let lineStarted = false;
      ctx.beginPath(); /* price line path */

      candles.forEach((c, i) => {
        const x = cx + i * barW - offset + barW / 2;
        if (x < cx - barW || x > cx + cw + barW) return;

        const bull = c.c >= c.o;
        ctx.strokeStyle = 'rgba(255,255,255,1)';
        ctx.lineWidth = 0.5;

        /* wick */
        ctx.beginPath();
        ctx.moveTo(x, sy(c.h));
        ctx.lineTo(x, sy(c.l));
        ctx.stroke();

        /* body */
        const bt = sy(Math.max(c.o, c.c));
        const bh = Math.max(1, Math.abs(sy(c.o) - sy(c.c)));
        if (bull) {
          ctx.fillStyle = 'rgba(255,255,255,1)';
          ctx.fillRect(x - bw / 2, bt, bw, bh);
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,1)';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x - bw / 2, bt, bw, bh);
        }

        /* price line point */
        if (!lineStarted) {
          ctx.beginPath();
          ctx.moveTo(x, sy(c.c));
          lineStarted = true;
        } else {
          ctx.lineTo(x, sy(c.c));
        }
      });

      /* Live candle */
      const lx = cx + candles.length * barW - offset + barW / 2;
      if (lx >= cx && lx <= cx + cw) {
        const lBull = st.livePrice >= st.liveOpen;
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(lx, sy(Math.max(st.liveOpen, st.livePrice) + 1));
        ctx.lineTo(lx, sy(Math.min(st.liveOpen, st.livePrice) - 1));
        ctx.stroke();

        const lbt = sy(Math.max(st.liveOpen, st.livePrice));
        const lbh = Math.max(2, Math.abs(sy(st.liveOpen) - sy(st.livePrice)));
        if (lBull) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.fillRect(lx - bw / 2, lbt, bw, lbh);
        } else {
          ctx.strokeRect(lx - bw / 2, lbt, bw, lbh);
        }

        if (lineStarted) ctx.lineTo(lx, sy(st.livePrice));
      }

      /* Draw price line */
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 0.7;
      ctx.stroke();

      /* Volume bars */
      const volH = ch * 0.12;
      const volY = cy + ch + 4;
      candles.forEach((c, i) => {
        const x = cx + i * barW - offset;
        if (x < cx - barW || x > cx + cw) return;
        const v = Math.abs(c.c - c.o) / span;
        ctx.fillStyle = 'rgba(255,255,255,1)';
        ctx.fillRect(x + 1, volY + volH - v * volH, Math.max(1, barW - 2), v * volH);
      });

      ctx.restore();
    }

    resize();
    window.addEventListener('resize', resize);

    let last = null;
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      if (last === null) { last = ts; return; }
      const dt = Math.min(ts - last, 80);
      last = ts;
      ctx.clearRect(0, 0, W, H);
      states.forEach(st => { if (st.init) drawChart(st, dt); });
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
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
