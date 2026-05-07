import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import SpiralText from '@/components/shared/SpiralText';

const FONT = "'Inter','SF Pro Display',system-ui,sans-serif";
const MONO = "'JetBrains Mono','SF Mono',monospace";

/* ── BACKGROUND CHARTS ── */
function generateCandles(count, startPrice, volatility, seed) {
  let price = startPrice;
  let rng = seed;
  const next = () => { rng = (rng * 1664525 + 1013904223) & 0xffffffff; return (rng >>> 0) / 0xffffffff; };
  return Array.from({ length: count }, () => {
    const open = price;
    const move = (next() - 0.48) * volatility;
    const close = Math.max(10, open + move);
    const high = Math.max(open, close) + next() * volatility * 0.6;
    const low  = Math.min(open, close) - next() * volatility * 0.4;
    price = close;
    return { open, close, high, low };
  });
}

function CandleChart({ x, y, width, height, count = 40, seed = 42, opacity = 0.07 }) {
  const candles = generateCandles(count, 100, 8, seed);
  const prices = candles.flatMap(c => [c.high, c.low]);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const scaleY = p => y + height - ((p - minP) / (maxP - minP)) * height;
  const cw = width / count;
  const bodyW = Math.max(1.5, cw * 0.55);
  const closePts = candles.map((c, i) => `${x + i * cw + cw / 2},${scaleY(c.close)}`).join(' ');

  return (
    <g opacity={opacity}>
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(t => (
        <line key={t} x1={x} x2={x + width} y1={y + height * t} y2={y + height * t}
          stroke="white" strokeWidth="0.4" strokeDasharray="4 8" opacity="0.4" />
      ))}
      {/* Candles */}
      {candles.map((c, i) => {
        const cx = x + i * cw + cw / 2;
        const bull = c.close >= c.open;
        const bodyTop = scaleY(Math.max(c.open, c.close));
        const bodyH = Math.max(1, Math.abs(scaleY(c.open) - scaleY(c.close)));
        return (
          <g key={i} stroke="white" fill={bull ? 'white' : 'none'}>
            <line x1={cx} x2={cx} y1={scaleY(c.high)} y2={scaleY(c.low)} strokeWidth="0.6" />
            <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH}
              fill={bull ? 'white' : 'none'} stroke="white" strokeWidth="0.6" />
          </g>
        );
      })}
      {/* Price line */}
      <polyline points={closePts} fill="none" stroke="white" strokeWidth="0.8" opacity="0.5" />
    </g>
  );
}

function BackgroundCharts() {
  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 1400 900"
    >
      {/* Main chart — right side */}
      <CandleChart x={640} y={60} width={720} height={340} count={48} seed={77} opacity={0.07} />
      {/* Secondary chart — bottom left */}
      <CandleChart x={20} y={520} width={420} height={220} count={32} seed={133} opacity={0.05} />
      {/* Micro chart — top left corner */}
      <CandleChart x={20} y={40} width={260} height={140} count={26} seed={211} opacity={0.04} />
      {/* Volume bars — right bottom */}
      {generateCandles(48, 60, 20, 99).map((c, i) => (
        <rect key={i}
          x={640 + i * 15 + 1} y={820 - c.high * 1.2} width={10} height={c.high * 1.2}
          fill="white" opacity={0.03 + (c.close > c.open ? 0.02 : 0)} />
      ))}
    </svg>
  );
}

/* ── LOCAL NEURAL CANVAS (hero-only, 80 nodes, mouse-reactive) ── */
function HeroLocalCanvas({ mouseRef }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, raf;
    const nodes = [];

    function init(w, h) {
      nodes.length = 0;
      for (let i = 0; i < 80; i++) {
        const hx = Math.random() * w, hy = Math.random() * h;
        nodes.push({
          x: hx, y: hy, hx, hy, vx: 0, vy: 0,
          r: 1.2 + Math.random() * 1.4,
          op: 0.2 + Math.random() * 0.35,
          phase: Math.random() * Math.PI * 2,
        });
      }
    }

    function resize() {
      W = canvas.width = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
      init(W, H);
    }

    function frame(ts) {
      raf = requestAnimationFrame(frame);
      ctx.clearRect(0, 0, W, H);
      const col = '255,255,255';
      const mouse = mouseRef?.current ?? { x: -9999, y: -9999 };

      for (const n of nodes) {
        n.vx += (n.hx - n.x) * 0.014;
        n.vy += (n.hy - n.y) * 0.014;
        const dx = n.x - mouse.x, dy = n.y - mouse.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 140 && d > 0) {
          const f = (1 - d / 140) * 0.055;
          n.vx += (dx / d) * f * 50;
          n.vy += (dy / d) * f * 50;
        }
        n.vx *= 0.87; n.vy *= 0.87;
        n.x += n.vx; n.y += n.vy;
        n.x = Math.max(0, Math.min(W, n.x));
        n.y = Math.max(0, Math.min(H, n.y));
      }

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x, dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130) {
            ctx.strokeStyle = `rgba(${col},${(1 - dist / 130) * 0.16})`;
            ctx.lineWidth = 0.4;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const n of nodes) {
        const flicker = 0.7 + 0.3 * Math.sin(ts * 0.001 + n.phase);
        ctx.fillStyle = `rgba(${col},${n.op * flicker})`;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      }
    }

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
    />
  );
}

/* ── HERO ── */
function HomeHero() {
  const [in_, setIn] = useState(false);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const sectionRef = useRef(null);
  useEffect(() => { const t = setTimeout(() => setIn(true), 60); return () => clearTimeout(t); }, []);

  const onMouseMove = useCallback((e) => {
    const rect = sectionRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);
  const onMouseLeave = useCallback(() => { mouseRef.current = { x: -9999, y: -9999 }; }, []);

  const fade = (d, extra = {}) => ({
    opacity: in_ ? 1 : 0,
    transform: in_ ? 'none' : 'translateY(18px)',
    transition: `opacity 800ms ${d}ms ease, transform 800ms ${d}ms ease`,
    ...extra,
  });

  return (
    <section
      ref={sectionRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '0 32px',
        position: 'relative',
        overflow: 'hidden',
        background: 'transparent',
      }}
    >
      <HeroLocalCanvas mouseRef={mouseRef} />

      {/* Center: KADO + label + CTA */}
      <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <h1 style={fade(0, {
          fontFamily: FONT,
          fontSize: 'clamp(80px, 16vw, 200px)',
          fontWeight: 900,
          letterSpacing: '-0.06em',
          lineHeight: 0.87,
          color: '#ffffff',
          margin: 0,
        })}>
          <SpiralText text="KADO" style={{ width: '100%' }} />
        </h1>

        <div style={fade(2000, {
          fontSize: 10, color: '#383838', letterSpacing: '0.22em',
          textTransform: 'uppercase', fontFamily: MONO, marginTop: 20,
        })}>
          AI-DRIVEN SIGNAL INTELLIGENCE
        </div>

        <p style={fade(2100, {
          fontFamily: FONT,
          fontSize: 'clamp(15px, 1.4vw, 18px)',
          fontWeight: 300,
          color: '#4a4a4a',
          marginTop: 24,
          lineHeight: 1.7,
          letterSpacing: '-0.01em',
          maxWidth: 460,
        })}>
          Eight autonomous strategies running in parallel —<br />
          news, grid, cascades, funding, on-chain. While you sleep.
        </p>

        <div style={fade(2200, {
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          marginTop: 40,
          flexWrap: 'wrap',
          justifyContent: 'center',
        })}>
          <Link
            to="/auth?mode=register"
            style={{
              background: '#fff', color: '#000', padding: '12px 36px',
              borderRadius: 100, fontSize: 13, fontWeight: 600, fontFamily: FONT,
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center',
              gap: 8, transition: 'opacity 150ms', letterSpacing: '-0.01em',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.82'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            Get started →
          </Link>
          <a
            href="#how-it-works"
            style={{ color: '#444', fontSize: 13, fontFamily: FONT, textDecoration: 'none', transition: 'color 150ms', letterSpacing: '-0.01em' }}
            onMouseEnter={e => e.currentTarget.style.color = '#fff'}
            onMouseLeave={e => e.currentTarget.style.color = '#444'}
          >
            How it works ↓
          </a>
        </div>
      </div>

    </section>
  );
}

/* ── HOW IT WORKS ── */
const STEPS = [
  { n: '01', title: 'Connect your exchange', body: 'Generate an API key on Bybit with trade permissions only. Paste it into your dashboard. Your funds stay on your exchange at all times — KADO only sends orders.' },
  { n: '02', title: 'Choose your strategy', body: 'Run one bot or all eight. Conservative grid for passive income. AI news signals for directional alpha. Full suite for maximum coverage. Switch any time.' },
  { n: '03', title: 'Let the bots trade', body: 'Everything activates in under 60 seconds. Monitor live signals, open positions, and real PnL from your dashboard. No code. No manual work.' },
];

function HowItWorks() {
  return (
    <section id="how-it-works" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
      <div style={{ padding: '120px 64px' }}>
        <SectionHeader label="Setup in 60 seconds" title="Three steps. Then step back." sub="No code. No constant monitoring. Connect once, choose your strategy, and let the bots handle everything else." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden' }}>
          {STEPS.map(s => (
            <div key={s.n} style={{ background: 'rgba(5,5,5,0.92)', padding: '48px 40px' }}>
              <div style={{ fontSize: 11, color: '#333', letterSpacing: '0.1em', fontFamily: MONO, marginBottom: 28 }}>{s.n}</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#e0e0e0', marginBottom: 16, letterSpacing: '-0.02em', fontFamily: FONT }}>{s.title}</div>
              <div style={{ fontSize: 13, color: '#666', lineHeight: 1.9, fontFamily: FONT }}>{s.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── BOTS ── */
const BOTS = [
  { num: '01', tag: 'ALT COINS ONLY', name: 'News Intelligence', hook: 'Reads the market before you can.', desc: 'Monitors crypto Telegram channels with real-time latency. Groq LLaMA evaluates every event across 9 factors — sentiment, whale activity, RSI, funding rate, open interest, liquidations, volume, Fear & Greed, on-chain macro. Only alts — BTC/ETH/SOL are priced in microseconds by institutions, edge is zero.', pills: ['Score ≥ 11.0', '9 score factors', 'Alt coins only'] },
  { num: '02', tag: 'BTC · ETH · SOL', name: 'Grid Trading', hook: 'Earns whether price goes up or down.', desc: 'Adaptive grids running 24/7 on BTC, ETH, and SOL. Places layered limit orders at optimal levels, capturing profit from every oscillation. Trend confirmed via EMA50 + RSI(4h) before entry. Maker-only orders minimize fees.', pills: ['EMA50 filter', 'Maker-only', 'BTC correlation guard'] },
  { num: '03', tag: 'BINANCE · BYBIT · 10s', name: 'Listing Sniper', hook: 'In before the crowd finishes reading.', desc: 'Polls exchange listing APIs every 10 seconds. The moment a new listing appears, it enters immediately. DEX filter skips coins already pumped on-chain. Two-stage exit: 50% at +10%, remainder rides to +20%.', pills: ['TP1 +10% · TP2 +20%', 'DEX staleness filter', '5× leverage'] },
  { num: '04', tag: '30 PERPS · 15-MIN CYCLE', name: 'Funding Rate Arb', hook: 'Profits when perpetuals diverge from spot.', desc: 'Scans 30 perpetual markets every 15 minutes. Elevated funding rate combined with overbought RSI signals a SHORT. Negative funding with oversold RSI signals a LONG. Three-tier position sizing amplifies on extreme setups.', pills: ['30 markets', 'FR > 0.04%', '3-tier sizing'] },
  { num: '05', tag: 'BINANCE WEBSOCKET', name: 'Liquidation Cascade', hook: 'Trades the momentum that lasts minutes, not milliseconds.', desc: 'Connected to Binance liquidation feed 24/7. When $300K+ of shorts are liquidated in 5 minutes with 2.5:1 directional dominance — the bot enters the cascade direction. Cascades unfold over minutes, not microseconds. Real edge.', pills: ['22 alt coins', '$300K threshold', 'TP 6% · SL 2.5%'] },
  { num: '06', tag: 'ALCHEMY WEBSOCKET · ETH', name: 'On-chain Macro', hook: 'Follow where the real money flows.', desc: 'Tracks ETH whale movements to and from exchange wallets in real time. When 500+ ETH is withdrawn from Binance or Bybit — macro bullish signal activates for AAVE, UNI, LDO, LINK, CRV and other ETH-ecosystem alts for 45 minutes.', pills: ['ETH ecosystem alts', '45-min window', 'Alchemy WebSocket'] },
  { num: '07', tag: '10 WALLETS · WEBSOCKET', name: 'Whale Tracker', hook: 'Follow the wallets that move markets.', desc: 'Tracks 10 identified smart money wallets — Paradigm, Jump Trading, Wintermute and others — via real-time Alchemy WebSocket feeds. When a whale makes a significant on-chain move, it generates a directional signal for the related assets.', pills: ['10 smart wallets', 'Real-time', 'Lower score threshold'] },
  { num: '08', tag: 'BSC · PANCAKESWAP V2', name: 'DEX Sniper', hook: 'New launches, safety-checked in real time.', desc: 'Listens for new PairCreated events on PancakeSwap V2. Every token checked for honeypots, buy/sell tax, locked LP, and deployer history. Clean contracts only. Trailing stop activates after +30%.', pills: ['Honeypot check', 'TP +100% · SL −50%', 'Trailing stop at +30%'] },
];

function BotsSection() {
  return (
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
      <div style={{ padding: '120px 64px' }}>
        <SectionHeader label="The Arsenal" title="Eight strategies. One platform." sub="Each bot is independent, specialized, and running 24/7. Together they cover every major market opportunity." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden' }}>
          {BOTS.map(bot => (
            <Link key={bot.num} to="/bots" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div
                style={{ background: 'rgba(5,5,5,0.92)', padding: '40px 32px', textAlign: 'left', transition: 'background 200ms', height: '100%', boxSizing: 'border-box' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(12,12,12,0.97)'}
                onMouseLeave={e => e.currentTarget.style.background = 'rgba(5,5,5,0.92)'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                  <span style={{ fontSize: 10, color: '#333', fontFamily: MONO, letterSpacing: '0.08em' }}>{bot.num}</span>
                  <span style={{ fontSize: 9, color: '#777', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 100, padding: '3px 10px', letterSpacing: '0.04em', maxWidth: 130, textAlign: 'right', lineHeight: 1.4, fontFamily: FONT }}>{bot.tag}</span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#e0e0e0', marginBottom: 6, letterSpacing: '-0.02em', fontFamily: FONT }}>{bot.name}</div>
                <div style={{ fontSize: 12, color: '#555', fontStyle: 'italic', marginBottom: 14, lineHeight: 1.5, fontFamily: FONT }}>{bot.hook}</div>
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.9, fontFamily: FONT }}>{bot.desc}</div>
                <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {bot.pills.map(p => (
                    <span key={p} style={{ fontSize: 9, color: '#666', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 100, padding: '3px 10px', letterSpacing: '0.03em', fontFamily: FONT }}>{p}</span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── RISK ── */
const RISK = [
  { title: 'Hard loss cap', body: 'Every open position is monitored every 5 minutes. If unrealized loss exceeds $20 — position is force-closed instantly. Prevents single-trade disasters.' },
  { title: 'Coin cooldown', body: 'The same coin cannot be traded more than once every 2 hours. Prevents over-exposure to a single asset after a losing trade.' },
  { title: 'Max exposure', body: 'No more than 15% of balance in simultaneously open positions. Calculated in real time before every entry.' },
  { title: 'Adaptive pause', body: 'Post-trade analyzer tracks each coin independently. After a losing streak, the bot temporarily skips that coin until performance recovers.' },
];

function RiskSection() {
  return (
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
      <div style={{ padding: '120px 64px' }}>
        <SectionHeader label="Risk Management" title="Your capital is protected." sub="Multiple independent safeguards run on every trade. No single bet can wipe an account." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'rgba(255,255,255,0.05)', borderRadius: 8, overflow: 'hidden' }}>
          {RISK.map(r => (
            <div key={r.title} style={{ background: 'rgba(5,5,5,0.92)', padding: '40px 32px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#d0d0d0', marginBottom: 14, letterSpacing: '-0.02em', fontFamily: FONT }}>{r.title}</div>
              <div style={{ fontSize: 12, color: '#666', lineHeight: 1.9, fontFamily: FONT }}>{r.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── STRATEGIES ── */
const STRATS = [
  { n: '01', name: 'Steady', summary: 'Consistent passive income from price oscillation. No directional bets, no speculation.', tags: ['Grid Trading'], ret: '3–8%', note: 'Best for first-time users or conservative allocations.' },
  { n: '02', name: 'Balanced', summary: 'Grid income plus AI-driven news alpha, liquidation cascade, and funding rate arbitrage.', tags: ['Grid', 'News Intelligence', 'Liq Cascade', 'Funding Rate'], ret: '10–25%', note: 'Multiple uncorrelated income streams working simultaneously.' },
  { n: '03', name: 'Full Suite', summary: 'All eight bots active simultaneously. Maximum signal coverage across every market structure.', tags: ['All 8 bots active'], ret: '25%+', note: 'For experienced traders who want complete automation.' },
];

function Strategies() {
  return (
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
      <div style={{ padding: '120px 64px' }}>
        <SectionHeader label="Strategies" title="Find your match." sub="Start with one bot. Scale to all eight. Switch any time from your dashboard." />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {STRATS.map(s => (
            <Link key={s.n} to="/strategies" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div
                style={{ background: 'rgba(8,8,8,0.92)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '48px 40px', textAlign: 'left', transition: 'border-color 180ms', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
              >
                <div style={{ fontSize: 10, color: '#333', fontFamily: MONO, marginBottom: 20, letterSpacing: '0.08em' }}>{s.n}</div>
                <div style={{ fontSize: 22, fontWeight: 600, color: '#e0e0e0', marginBottom: 14, letterSpacing: '-0.03em', fontFamily: FONT }}>{s.name}</div>
                <div style={{ fontSize: 13, color: '#666', lineHeight: 1.8, marginBottom: 28, flex: 1, fontFamily: FONT }}>{s.summary}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 32 }}>
                  {s.tags.map(t => (
                    <span key={t} style={{ fontSize: 9, color: '#777', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 100, padding: '4px 12px', fontFamily: FONT }}>{t}</span>
                  ))}
                </div>
                <div style={{ fontSize: 'clamp(36px,4vw,52px)', fontWeight: 700, letterSpacing: '-0.04em', color: '#fff', lineHeight: 1, fontFamily: MONO, marginBottom: 6 }}>{s.ret}</div>
                <div style={{ fontSize: 9, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16, fontFamily: FONT }}>Est. monthly</div>
                <div style={{ fontSize: 12, color: '#444', lineHeight: 1.7, paddingTop: 18, borderTop: '1px solid rgba(255,255,255,0.05)', fontFamily: FONT }}>{s.note}</div>
              </div>
            </Link>
          ))}
        </div>
        <div style={{ marginTop: 24, fontSize: 11, color: '#2a2a2a', lineHeight: 1.7, textAlign: 'center', fontFamily: FONT }}>
          Estimated returns are not guaranteed. Crypto trading carries inherent risk.
        </div>
      </div>
    </section>
  );
}

/* ── CTA ── */
function CTA() {
  return (
    <section style={{ borderTop: '1px solid rgba(255,255,255,0.05)', background: 'transparent' }}>
      <div style={{ padding: '140px 64px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: FONT, fontSize: 'clamp(80px,14vw,180px)', fontWeight: 900, letterSpacing: '-0.06em', lineHeight: 0.87, color: '#fff', margin: '0 0 40px' }}>
          KADO
        </h2>
        <p style={{ fontSize: 15, color: '#555', letterSpacing: '-0.01em', marginBottom: 10, fontFamily: FONT }}>Your edge, automated.</p>
        <p style={{ fontSize: 13, color: '#444', lineHeight: 1.8, maxWidth: 380, margin: '0 auto 40px', fontFamily: FONT }}>
          Private beta is open. Connect your exchange API key, choose a strategy, and let eight bots trade for you. Your funds never leave your exchange.
        </p>
        <Link
          to="/auth?mode=register"
          style={{ background: '#fff', color: '#000', padding: '13px 38px', borderRadius: 100, fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, transition: 'opacity 150ms', fontFamily: FONT, letterSpacing: '-0.01em' }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.82'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          Get started →
        </Link>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
          {['No credit card required', 'Funds stay on your exchange', 'Cancel any time'].map(t => (
            <span key={t} style={{ fontSize: 10, color: '#444', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 100, padding: '4px 14px', fontFamily: FONT }}>{t}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── SHARED ── */
function SectionHeader({ label, title, sub }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 64 }}>
      <div style={{ fontSize: 10, color: '#444', letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 18, fontFamily: FONT }}>{label}</div>
      <div style={{ fontSize: 'clamp(28px,3.5vw,44px)', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.05, color: '#e0e0e0', marginBottom: 16, fontFamily: FONT }}>{title}</div>
      <div style={{ fontSize: 14, color: '#555', lineHeight: 1.75, maxWidth: 500, margin: '0 auto', fontFamily: FONT }}>{sub}</div>
    </div>
  );
}

/* ── EXPORT ── */
export default function Landing() {
  return (
    <div style={{ color: '#fff', minHeight: '100vh' }}>
      <LandingHeader />
      <HomeHero />
      <HowItWorks />
      <BotsSection />
      <RiskSection />
      <Strategies />
      <CTA />
      <LandingFooter />
    </div>
  );
}
