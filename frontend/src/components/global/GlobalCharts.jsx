import React, { useMemo } from 'react';

function rng(seed) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
}

function makeCandles(count, start, vol, seed) {
  const r = rng(seed);
  let p = start;
  return Array.from({ length: count }, () => {
    const o = p;
    const c = Math.max(4, o + (r() - 0.48) * vol);
    const h = Math.max(o, c) + r() * vol * 0.5;
    const l = Math.min(o, c) - r() * vol * 0.3;
    p = c;
    return { o, c, h, l };
  });
}

function Chart({ x, y, w, h, count, seed, op }) {
  const candles = useMemo(() => makeCandles(count, 80, 9, seed), [count, seed]);
  const allP = candles.flatMap(c => [c.h, c.l]);
  const mn = Math.min(...allP), mx = Math.max(...allP);
  const sy = p => y + h - ((p - mn) / (mx - mn || 1)) * h;
  const cw = w / count;
  const bw = Math.max(1.2, cw * 0.5);
  const line = candles.map((c, i) => `${x + i * cw + cw / 2},${sy(c.c)}`).join(' ');

  return (
    <g opacity={op}>
      {[0.2, 0.5, 0.8].map(t => (
        <line key={t} x1={x} x2={x + w} y1={y + h * t} y2={y + h * t}
          stroke="white" strokeWidth="0.3" strokeDasharray="3 10" opacity="0.35" />
      ))}
      {candles.map((c, i) => {
        const cx = x + i * cw + cw / 2;
        const bull = c.c >= c.o;
        const bt = sy(Math.max(c.o, c.c));
        const bh = Math.max(1, Math.abs(sy(c.o) - sy(c.c)));
        return (
          <g key={i}>
            <line x1={cx} x2={cx} y1={sy(c.h)} y2={sy(c.l)} stroke="white" strokeWidth="0.5" />
            <rect x={cx - bw / 2} y={bt} width={bw} height={bh}
              fill={bull ? 'white' : 'none'} stroke="white" strokeWidth="0.5" />
          </g>
        );
      })}
      <polyline points={line} fill="none" stroke="white" strokeWidth="0.7" opacity="0.45" />
    </g>
  );
}

function VolumeBar({ x, y, w, h, seed, op }) {
  const r = rng(seed);
  const bars = Array.from({ length: 30 }, () => ({ v: 0.2 + r() * 0.8 }));
  const bw = w / bars.length;
  return (
    <g opacity={op}>
      {bars.map((b, i) => (
        <rect key={i} x={x + i * bw + 1} y={y + h - b.v * h} width={bw - 2} height={b.v * h}
          fill="white" />
      ))}
    </g>
  );
}

export default function GlobalCharts() {
  return (
    <svg
      style={{
        position: 'fixed', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 0,
      }}
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1440 900"
    >
      {/* Right large chart */}
      <Chart x={780} y={40}  w={640} h={320} count={52} seed={77}  op={0.06} />
      {/* Bottom-left chart */}
      <Chart x={10}  y={530} w={400} h={210} count={34} seed={133} op={0.045} />
      {/* Top-left mini */}
      <Chart x={10}  y={30}  w={240} h={130} count={24} seed={211} op={0.035} />
      {/* Bottom-right mini */}
      <Chart x={1060} y={640} w={360} h={180} count={30} seed={317} op={0.04} />
      {/* Volume bars bottom-right */}
      <VolumeBar x={780} y={800} w={640} h={70} seed={99} op={0.04} />
      {/* Volume bars bottom-left */}
      <VolumeBar x={10}  y={820} w={380} h={55} seed={44} op={0.03} />
    </svg>
  );
}
