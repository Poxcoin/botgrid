import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import PageCharts from '@/components/global/GlobalCharts';

const FONT_BODY = "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif";
const FONT_MONO = "'Courier New','SF Mono',monospace";

const BOTS = [
  {
    num: '01',
    tag: 'AI-SCORED',
    name: 'News Intelligence',
    tagline: 'Reads the market before you can.',
    desc: 'Monitors 6 crypto Telegram channels with <5s latency. Groq LLaMA evaluates every event across 8 market factors — sentiment, whale activity, RSI, funding rate, OI, liquidations, volume, Fear & Greed. Only enters when confidence score reaches 8.0+.',
    pills: ['Score ≥ 8.0', 'Dynamic 2–5× leverage', '8 factors'],
  },
  {
    num: '02',
    tag: 'BTC · ETH · SOL · DOGE · XRP',
    name: 'Grid Trading',
    tagline: 'Earns whether price goes up or down.',
    desc: 'ATR-adaptive grids running 24/7 on 5 major coins. Places layered buy and sell orders at mathematically optimal levels, capturing profit from every oscillation. BTC correlation filter auto-pauses during broad market dumps.',
    pills: ['5 coins', 'ATR spacing', 'Auto-pause on dumps'],
  },
  {
    num: '03',
    tag: 'BINANCE · BYBIT · 30s',
    name: 'Listing Sniper',
    tagline: 'In before the crowd finishes reading.',
    desc: 'Checks Binance and Bybit listing APIs every 30 seconds. The moment a new listing goes live, it enters automatically. DEX filter skips coins already pumped >$100K. Partial take-profit at +10%, trailing stop on the remainder.',
    pills: ['TP1 +10%', 'DEX filter', '5× leverage'],
  },
  {
    num: '04',
    tag: '30 PERPS · 15-MIN CYCLE',
    name: 'Funding Rate Arb',
    tagline: 'Profits when perpetuals diverge from spot.',
    desc: 'Scans 30 perpetual markets every 15 minutes. Elevated funding + overbought RSI → SHORT. Negative funding + oversold RSI → LONG. Three-tier position sizing amplifies on the most extreme setups.',
    pills: ['30 markets', 'FR >0.04%', '3-tier sizing'],
  },
  {
    num: '05',
    tag: '10 WALLETS · WEBSOCKET',
    name: 'Whale Tracker',
    tagline: 'Follow the wallets that move markets.',
    desc: 'Tracks 10 high-conviction on-chain wallets via real-time Alchemy WebSocket feeds. When a whale makes a significant move, the confidence threshold drops from 8.0 to 5.0 and the bot enters immediately. Real smart money data.',
    pills: ['10 wallets', 'Real-time', 'Threshold 5.0'],
  },
  {
    num: '06',
    tag: 'BSC · PANCAKESWAP V2',
    name: 'DEX Sniper',
    tagline: 'New launches, safety-checked in real time.',
    desc: 'Listens for PancakeSwap V2 PairCreated events on BSC. Every new token verified by GoPlus: honeypot detection, buy/sell tax check, owner renounced. Clean contracts only. Target +100%, hard stop at −50%.',
    pills: ['GoPlus safety', 'TP +100%', 'SL −50%'],
  },
];

const STATS = [
  { value: '6',      label: 'Active Bots' },
  { value: '24/7',   label: 'Uptime' },
  { value: '<5s',    label: 'Signal Latency' },
  { value: '8',      label: 'Score Factors' },
  { value: '<100ms', label: 'AI Eval' },
  { value: '4',      label: 'Pipeline Stages' },
];

const PIPELINE = [
  {
    num: '01',
    name: 'Ingest',
    desc: 'Telegram channels, exchange APIs, on-chain feeds, and WebSocket streams feed data continuously into the system.',
  },
  {
    num: '02',
    name: 'Score',
    desc: 'Groq LLaMA evaluates each event across 8 market factors and outputs a confidence score in under 100ms.',
  },
  {
    num: '03',
    name: 'Filter',
    desc: 'Position limits, BTC correlation gates, DEX pumped-coin exclusions, and RSI guards block low-quality setups.',
  },
  {
    num: '04',
    name: 'Execute',
    desc: 'Orders placed via ccxt with dynamic leverage, take-profit tiers, and trailing stops managed automatically.',
  },
];

function PillTag({ label }) {
  return (
    <span style={{
      fontFamily: FONT_MONO,
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 100,
      padding: '3px 10px',
      fontSize: 9,
      color: '#999',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

function BotCard({ bot }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#0f0f0f' : '#0a0a0a',
        padding: '44px 36px',
        display: 'flex',
        flexDirection: 'column',
        transition: 'background 200ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#555', letterSpacing: '0.08em' }}>
          {bot.num}
        </span>
        <span style={{
          fontFamily: FONT_MONO,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 100,
          padding: '3px 10px',
          fontSize: 9,
          color: '#999',
          letterSpacing: '0.06em',
        }}>
          {bot.tag}
        </span>
      </div>

      <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: '#fff', marginBottom: 8 }}>
        {bot.name}
      </div>

      <div style={{ fontFamily: FONT_MONO, fontSize: 12, color: '#aaa', marginBottom: 20, lineHeight: 1.5 }}>
        "{bot.tagline}"
      </div>

      <p style={{ fontSize: 13, color: '#666', lineHeight: 1.75, marginBottom: 28, flexGrow: 1, margin: '0 0 28px' }}>
        {bot.desc}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {bot.pills.map((p) => (
          <PillTag key={p} label={p} />
        ))}
      </div>
    </div>
  );
}

function PipelineCard({ step }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background: hovered ? '#0f0f0f' : '#0a0a0a', padding: '44px 36px', transition: 'background 200ms' }}
    >
      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#555', letterSpacing: '0.08em', marginBottom: 16 }}>
        {step.num}
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', color: '#fff', marginBottom: 16 }}>
        {step.name}
      </div>
      <p style={{ fontSize: 13, color: '#666', lineHeight: 1.75, margin: 0 }}>
        {step.desc}
      </p>
    </div>
  );
}

export default function BotsPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div style={{ background: '#060606', minHeight: '100vh', fontFamily: FONT_BODY, color: '#fff', position: 'relative', overflow: 'hidden' }}>
      <PageCharts variant="bots" />
      <LandingHeader />

      {/* Hero */}
      <section style={{ paddingTop: 100, paddingBottom: 80, textAlign: 'center' }}>
        <div className="px-5 md:px-14" style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 100,
            padding: '6px 18px',
            fontSize: 11,
            color: '#888',
            fontFamily: FONT_MONO,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 32,
          }}>
            6 Bots · Multi-Exchange · 24/7
          </div>

          <h1 style={{
            fontSize: 'clamp(48px,7vw,88px)',
            fontWeight: 700,
            letterSpacing: '-0.05em',
            lineHeight: 1.0,
            margin: '0 0 24px',
          }}>
            THE ARSENAL.
          </h1>

          <p style={{ fontSize: 16, color: '#666', lineHeight: 1.7, maxWidth: 520, margin: '0 auto' }}>
            Six specialized bots. Every market opportunity covered — from AI news alpha to on-chain whale signals.
          </p>
        </div>
      </section>

      {/* Stats bar */}
      <div className="px-5 md:px-14" style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 80 }}>
        <div
          className="grid grid-cols-3 md:grid-cols-6"
          style={{
            gap: 1,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          {STATS.map((s) => (
            <div key={s.label} style={{ background: '#0a0a0a', padding: '28px 20px', textAlign: 'center' }}>
              <div style={{ fontFamily: FONT_MONO, fontSize: 'clamp(18px,2.5vw,24px)', fontWeight: 700, color: '#fff', marginBottom: 6 }}>
                {s.value}
              </div>
              <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bots grid */}
      <div className="px-5 md:px-14" style={{ maxWidth: 1100, margin: '0 auto', paddingBottom: 100 }}>
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          style={{
            gap: 1,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          {BOTS.map((bot) => (
            <BotCard key={bot.num} bot={bot} />
          ))}
        </div>
      </div>

      {/* Pipeline section */}
      <section style={{ paddingTop: 100, paddingBottom: 100, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-5 md:px-14" style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{
              fontSize: 11,
              color: '#666',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              marginBottom: 16,
              fontFamily: FONT_MONO,
            }}>
              Execution Pipeline
            </div>
            <h2 style={{
              fontSize: 'clamp(36px,4.5vw,52px)',
              fontWeight: 700,
              letterSpacing: '-0.04em',
              lineHeight: 1.0,
              margin: '0 0 16px',
            }}>
              Signal in. Order out.
            </h2>
            <p style={{ fontSize: 16, color: '#666', lineHeight: 1.7, maxWidth: 480, margin: '0 auto' }}>
              Every signal travels through four deterministic stages before a single order is placed.
            </p>
          </div>

          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
            style={{
              gap: 1,
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 16,
              overflow: 'hidden',
            }}
          >
            {PIPELINE.map((step) => (
              <PipelineCard key={step.num} step={step} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section style={{ paddingTop: 100, paddingBottom: 100, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="px-5 md:px-14" style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            fontSize: 11,
            color: '#666',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            marginBottom: 16,
            fontFamily: FONT_MONO,
          }}>
            Get Started
          </div>
          <h2 style={{
            fontSize: 'clamp(36px,4.5vw,52px)',
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1.0,
            margin: '0 0 40px',
          }}>
            Start trading with all six bots.
          </h2>
          <Link
            to="/auth?mode=register"
            style={{
              display: 'inline-block',
              background: '#fff',
              color: '#000',
              padding: '14px 36px',
              borderRadius: 100,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              fontFamily: FONT_BODY,
              transition: 'opacity 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
          >
            Get Started →
          </Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
