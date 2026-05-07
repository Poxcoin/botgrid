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
          stroke="white" strokeWidth="0.3" strokeDasharray="3 10" opacity="0.4" />
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

function VolBars({ x, y, w, h, seed, op }) {
  const r = rng(seed);
  const bars = Array.from({ length: 32 }, () => ({ v: 0.15 + r() * 0.85 }));
  const bw = w / bars.length;
  return (
    <g opacity={op}>
      {bars.map((b, i) => (
        <rect key={i} x={x + i * bw + 1} y={y + h - b.v * h} width={Math.max(1, bw - 2)} height={b.v * h}
          fill="white" />
      ))}
    </g>
  );
}

/* Набір графіків для конкретної сторінки/теми */
const LAYOUTS = {
  landing: (
    <>
      <Chart x={780} y={40}  w={640} h={320} count={52} seed={77}  op={0.065} />
      <Chart x={10}  y={500} w={400} h={210} count={34} seed={133} op={0.045} />
      <Chart x={10}  y={30}  w={240} h={130} count={24} seed={211} op={0.035} />
      <Chart x={1060} y={620} w={360} h={200} count={30} seed={317} op={0.04} />
      <VolBars x={780} y={800} w={640} h={75} seed={99} op={0.04} />
    </>
  ),
  dashboard: (
    <>
      <Chart x={20}  y={60}  w={320} h={200} count={40} seed={501} op={0.04} />
      <Chart x={1080} y={80}  w={340} h={220} count={36} seed={502} op={0.04} />
      <Chart x={560} y={680} w={480} h={180} count={44} seed={503} op={0.035} />
      <VolBars x={20}  y={820} w={380} h={60} seed={504} op={0.03} />
      <VolBars x={1050} y={830} w={370} h={55} seed={505} op={0.03} />
    </>
  ),
  bots: (
    <>
      <Chart x={900} y={20}  w={520} h={280} count={44} seed={201} op={0.055} />
      <Chart x={10}  y={400} w={360} h={200} count={30} seed={202} op={0.04} />
      <VolBars x={900} y={750} w={520} h={65} seed={203} op={0.035} />
    </>
  ),
  strategies: (
    <>
      <Chart x={20}  y={50}  w={400} h={240} count={38} seed={301} op={0.05} />
      <Chart x={960} y={300} w={460} h={260} count={42} seed={302} op={0.05} />
      <VolBars x={20}  y={780} w={420} h={70} seed={303} op={0.035} />
    </>
  ),
  default: (
    <>
      <Chart x={820} y={50}  w={580} h={300} count={48} seed={401} op={0.055} />
      <Chart x={10}  y={480} w={380} h={200} count={32} seed={402} op={0.04} />
      <VolBars x={820} y={800} w={580} h={70} seed={403} op={0.035} />
    </>
  ),
};

/**
 * Вставляй як перший дочірній елемент у root-div сторінки.
 * Root div повинен мати position: relative та overflow: hidden.
 * variant: 'landing' | 'dashboard' | 'bots' | 'strategies' | 'default'
 */
export default function PageCharts({ variant = 'default', style = {} }) {
  return (
    <svg
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 0,
        ...style,
      }}
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1440 900"
    >
      {LAYOUTS[variant] ?? LAYOUTS.default}
    </svg>
  );
}
