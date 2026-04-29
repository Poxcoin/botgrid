import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';

/* ── Hero ──────────────────────────────────────────────────────────────────── */
function HomeHero() {
  const [glitch, setGlitch] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setTimeout(() => setMounted(true), 80); }, []);

  return (
    <section style={{
      minHeight: '100vh', position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      borderBottom: '1px solid var(--border)',
    }}>
      {/* Corner tags */}
      <div style={{ position: 'absolute', top: 24, left: 32, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', animation: 'labelPulse 4s ease-in-out infinite' }}>
        [ LIVE / v1.0 ]
      </div>
      <div style={{ position: 'absolute', top: 24, right: 32, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 6, height: 6, background: 'var(--neon-green)', borderRadius: '50%', animation: 'blink 1.5s ease-in-out infinite' }} />
        BYBIT · PERP
      </div>
      <div style={{ position: 'absolute', bottom: 56, left: 32, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', opacity: 0.5 }}>
        KADO.AI
      </div>
      <div style={{ position: 'absolute', bottom: 56, right: 32, fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)', opacity: 0.5 }}>
        EST. 2026
      </div>

      {/* Main centered block */}
      <div style={{ textAlign: 'center', position: 'relative', zIndex: 2, padding: '0 24px', maxWidth: 900, width: '100%' }}>

        {/* Label */}
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.4em', textTransform: 'uppercase',
          color: 'var(--muted)', marginBottom: 32, display: 'inline-block',
          border: '1px solid rgba(128,128,128,0.25)', padding: '4px 14px',
          animation: 'labelPulse 4s ease-in-out infinite',
          opacity: mounted ? 1 : 0, transition: 'opacity 500ms',
        }}>
          AI-DRIVEN SIGNAL INTELLIGENCE
        </div>

        {/* KADO — massive neon green centered */}
        <h1
          onMouseEnter={() => setGlitch(true)}
          onMouseLeave={() => setGlitch(false)}
          style={{
            fontSize: 'clamp(88px, 22vw, 280px)',
            fontWeight: 900,
            letterSpacing: '-0.06em',
            lineHeight: 0.82,
            margin: '0 auto',
            color: 'var(--neon-green)',
            textShadow: '0 0 80px rgba(0,255,136,0.45), 0 0 160px rgba(0,255,136,0.2)',
            cursor: 'default',
            userSelect: 'none',
            animation: glitch ? 'glitch 0.35s linear' : 'none',
            opacity: mounted ? 1 : 0,
            transform: mounted ? 'translateY(0)' : 'translateY(24px)',
            transition: 'opacity 600ms ease 100ms, transform 600ms ease 100ms',
          }}
        >
          KADO
        </h1>

        {/* Subtitle */}
        <p style={{
          fontFamily: 'var(--font-mono)', fontSize: 13, letterSpacing: '0.05em', lineHeight: 1.8,
          color: 'var(--muted-fg)', marginTop: 32, maxWidth: 540, marginLeft: 'auto', marginRight: 'auto',
          opacity: mounted ? 1 : 0, transition: 'opacity 600ms ease 300ms',
        }}>
          Four autonomous bots — news scanner, grid trader, listing sniper, DEX hunter — running 24/7 on Bybit Futures.
        </p>

        {/* Tags */}
        <div style={{
          display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginTop: 24,
          opacity: mounted ? 1 : 0, transition: 'opacity 600ms ease 450ms',
        }}>
          {['Claude AI', '4 Bots Active', '30s Scan', 'Bybit Futures', 'Live 24/7'].map((t, i) => (
            <span key={t} style={{
              fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase',
              border: '1px solid rgba(0,255,136,0.2)', padding: '4px 12px', color: 'var(--muted)',
              animation: `flickerBox ${2.5 + i * 0.4}s ease-in-out ${i * 0.2}s infinite`,
            }}>
              {t}
            </span>
          ))}
        </div>

        {/* CTA buttons */}
        <div style={{
          display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 12, marginTop: 44,
          opacity: mounted ? 1 : 0, transition: 'opacity 600ms ease 600ms',
        }}>
          <Link to="/waitlist" style={{
            display: 'inline-flex', alignItems: 'center', gap: 10, height: 46, padding: '0 32px',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase',
            textDecoration: 'none', background: 'var(--neon-green)', color: '#000', fontWeight: 700,
            transition: 'all 200ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = '#00cc6a'; e.currentTarget.style.boxShadow = '0 0 32px rgba(0,255,136,0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--neon-green)'; e.currentTarget.style.boxShadow = 'none'; }}>
            Join Waitlist →
          </Link>
          <Link to="/bots" style={{
            display: 'inline-flex', alignItems: 'center', gap: 10, height: 46, padding: '0 32px',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.25em', textTransform: 'uppercase',
            textDecoration: 'none', border: '1px solid rgba(0,255,136,0.35)', color: 'var(--neon-green)',
            transition: 'all 200ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,255,136,0.08)'; e.currentTarget.style.boxShadow = '0 0 16px rgba(0,255,136,0.2)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}>
            Explore Bots
          </Link>
        </div>
      </div>

      {/* Bottom scroll hint */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 32px', height: 40,
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'var(--muted)',
      }}>
        <span style={{ animation: 'blink 2s ease-in-out infinite' }}>↓ Scroll to explore</span>
        <span className="hidden md:inline">Intelligence feeds. Signals execute. Risk is managed.</span>
        <span>4 BOTS · 1 SYSTEM</span>
      </div>
    </section>
  );
}

/* ── Bot Preview Cards ─────────────────────────────────────────────────────── */
const G = 'var(--neon-green)';
const BOT_CARDS = [
  { num: '01', name: 'News Intelligence', desc: 'Claude AI scores signals from 6 Telegram channels every 30 seconds.', stat: 'Score ≥ 8 / 10', href: '/bots' },
  { num: '02', name: 'Grid Trading',       desc: 'Parallel grids on SOL · BTC · ETH. Earns on every price oscillation.', stat: '3 grids · 2× lev', href: '/bots' },
  { num: '03', name: 'Listing Sniper',     desc: 'Detects Binance & Bybit listings, enters before the initial pump.', stat: '5× · 20% TP', href: '/bots' },
  { num: '04', name: 'DEX Sniper',         desc: 'Hunts new PancakeSwap pools with GoPlus contract safety checks.', stat: 'BSC · +100% TP', href: '/bots' },
];

function BotPreview() {
  return (
    <section style={{ borderBottom: '1px solid var(--border)', color: 'var(--fg)' }}>
      {/* Section header */}
      <div className="px-6 md:px-10 py-12 flex items-end justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>[ 01 / BOTS ]</div>
          <h2 className="font-black tracking-[-0.04em] leading-[0.88]" style={{ fontSize: 'clamp(36px, 6vw, 72px)' }}>The Arsenal.</h2>
        </div>
        <Link to="/bots" style={{
          display: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
          color: 'var(--neon-green)', textDecoration: 'none', transition: 'text-shadow 200ms',
        }} className="md:block"
          onMouseEnter={e => { e.currentTarget.style.textShadow = '0 0 16px rgba(0,255,136,0.6)'; }}
          onMouseLeave={e => { e.currentTarget.style.textShadow = 'none'; }}>
          Full Documentation →
        </Link>
      </div>

      {/* Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        {BOT_CARDS.map((bot, i) => (
          <Link key={bot.num} to={bot.href} style={{
            textDecoration: 'none', color: 'var(--fg)',
            borderRight: i < 3 ? '1px solid var(--border)' : 'none',
            padding: '2rem 2rem 2.5rem',
            display: 'block',
            transition: 'background 200ms',
            position: 'relative',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: G, marginBottom: 20, opacity: 0.7 }}>{bot.num}</div>
            <div className="font-black text-xl mb-3" style={{ letterSpacing: '-0.02em', lineHeight: 1.1 }}>{bot.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7, color: 'var(--muted-fg)', marginBottom: 24 }}>{bot.desc}</div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase',
              border: '1px solid rgba(0,255,136,0.35)', color: G, padding: '3px 10px', display: 'inline-block',
            }}>
              {bot.stat}
            </div>
            <div style={{ position: 'absolute', bottom: 20, right: 20, fontFamily: 'var(--font-mono)', fontSize: 10, color: G, opacity: 0.4 }}>→</div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── Strategy Preview ──────────────────────────────────────────────────────── */
const STRAT_CARDS = [
  { num: '01', name: 'Conservative', return: '3–8%',   risk: 25, bots: ['Grid Bot'],    desc: 'Grid bot only. Steady yield, no directional bias.' },
  { num: '02', name: 'Moderate',     return: '10–25%', risk: 55, bots: ['Grid', 'News'], desc: 'Grid base + AI news signals. Two independent income streams.' },
  { num: '03', name: 'Aggressive',   return: '50%+',   risk: 90, bots: ['All 4'],        desc: 'All four bots active. Maximum edge. High variance.' },
];

function StrategyPreview() {
  return (
    <section style={{ borderBottom: '1px solid var(--border)', color: 'var(--fg)' }}>
      <div className="px-6 md:px-10 py-12 flex items-end justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 12 }}>[ 02 / STRATEGIES ]</div>
          <h2 className="font-black tracking-[-0.04em] leading-[0.88]" style={{ fontSize: 'clamp(36px, 6vw, 72px)' }}>Pick your<br />risk profile.</h2>
        </div>
        <Link to="/strategies" style={{
          display: 'none', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
          color: 'var(--neon-green)', textDecoration: 'none', transition: 'text-shadow 200ms',
        }} className="md:block"
          onMouseEnter={e => { e.currentTarget.style.textShadow = '0 0 16px rgba(0,255,136,0.6)'; }}
          onMouseLeave={e => { e.currentTarget.style.textShadow = 'none'; }}>
          Compare All →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3">
        {STRAT_CARDS.map((s, i) => (
          <Link key={s.num} to="/strategies" style={{
            textDecoration: 'none', color: 'var(--fg)',
            borderRight: i < 2 ? '1px solid var(--border)' : 'none',
            padding: '2rem 2rem 2.5rem',
            display: 'flex', flexDirection: 'column',
            transition: 'background 200ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.3em', textTransform: 'uppercase', color: G, marginBottom: 16, opacity: 0.7 }}>{s.num}</div>
            <div className="font-black text-2xl mb-2" style={{ letterSpacing: '-0.03em' }}>{s.name}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.7, color: 'var(--muted-fg)', marginBottom: 24, flex: 1 }}>{s.desc}</div>

            {/* Return */}
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 900, letterSpacing: '-0.04em', color: G, lineHeight: 1, marginBottom: 4, textShadow: '0 0 30px rgba(0,255,136,0.3)' }}>{s.return}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>EST. / MONTH</div>

            {/* Risk bar */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>
                <span>Risk</span><span style={{ color: G }}>{s.risk}%</span>
              </div>
              <div style={{ height: 2, background: 'var(--border)' }}>
                <div style={{ height: '100%', width: `${s.risk}%`, background: G, opacity: 0.7 }} />
              </div>
            </div>

            {/* Bot tags */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {s.bots.map(b => (
                <span key={b} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', border: '1px solid rgba(0,255,136,0.3)', color: G, padding: '2px 8px', opacity: 0.7 }}>{b}</span>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ── Stats Bar ─────────────────────────────────────────────────────────────── */
function StatsRow() {
  const stats = [
    { val: '4', label: 'Active Bots' },
    { val: '30s', label: 'Scan Interval' },
    { val: '24/7', label: 'Uptime' },
    { val: '6', label: 'Signal Sources' },
    { val: '3%', label: 'Max Daily Loss' },
    { val: '$0', label: 'Start Free' },
  ];
  return (
    <section style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="grid grid-cols-3 md:grid-cols-6">
        {stats.map((s, i) => (
          <div key={s.label} style={{
            padding: '2rem 1.5rem', textAlign: 'center',
            borderRight: i < 5 ? '1px solid var(--border)' : 'none',
          }}>
            <div className="font-black" style={{ fontSize: 'clamp(24px, 4vw, 40px)', letterSpacing: '-0.04em', color: 'var(--neon-green)', lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.25em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 8 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Home CTA ──────────────────────────────────────────────────────────────── */
function HomeCTA() {
  return (
    <section style={{ borderBottom: '1px solid var(--border)', padding: '5rem 0' }}>
      <div className="px-6 md:px-10 flex flex-col md:flex-row items-start md:items-end justify-between gap-10">
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>[ 03 / ACCESS ]</div>
          <h2 className="font-black tracking-[-0.04em] leading-[0.88]" style={{ fontSize: 'clamp(40px, 7vw, 88px)' }}>
            Start trading.<br />
            <span style={{ color: 'var(--neon-green)', textShadow: '0 0 40px rgba(0,255,136,0.4)' }}>Intelligently.</span>
          </h2>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.8, color: 'var(--muted-fg)', maxWidth: 460, marginTop: 20 }}>
            Join the waitlist. When access opens, connect your Bybit API key and choose a strategy. The bots do the rest.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <Link to="/waitlist" style={{
            display: 'inline-flex', alignItems: 'center', gap: 12, height: 52, padding: '0 36px',
            fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.25em', textTransform: 'uppercase',
            textDecoration: 'none', background: 'var(--neon-green)', color: '#000', fontWeight: 700,
            transition: 'all 200ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = '#00cc6a'; e.currentTarget.style.boxShadow = '0 0 40px rgba(0,255,136,0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--neon-green)'; e.currentTarget.style.boxShadow = 'none'; }}>
            Join Waitlist →
          </Link>
          <Link to="/pricing" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--muted)', textDecoration: 'none', transition: 'color 150ms' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--fg)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--muted)'; }}>
            View Pricing →
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── Page ──────────────────────────────────────────────────────────────────── */
export default function Landing() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--fg)', minHeight: '100vh' }}>
      <LandingHeader />
      <HomeHero />
      <BotPreview />
      <StrategyPreview />
      <StatsRow />
      <HomeCTA />
      <LandingFooter />
    </div>
  );
}
