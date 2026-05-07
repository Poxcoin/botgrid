import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import { useLang } from '@/lib/LangContext';

const FONT_BODY = "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif";
const FONT_MONO = "'Courier New','SF Mono',monospace";

const BOTS = [
  {
    num: '01',
    tag: 'ALT COINS ONLY',
    name: 'News Intelligence',
    tagline: 'Reads the market before you can.',
    desc: 'Monitors crypto Telegram channels with real-time latency. Groq LLaMA evaluates every event across 9 market factors — sentiment, whale activity, RSI, funding rate, open interest, liquidations, volume, Fear & Greed, on-chain macro. Only alt coins — BTC/ETH/SOL are priced by institutions in microseconds, edge is zero.',
    pills: ['Score ≥ 11.0', '9 score factors', 'Alt coins only'],
  },
  {
    num: '02',
    tag: 'BTC · ETH · SOL',
    name: 'Grid Trading',
    tagline: 'Earns whether price goes up or down.',
    desc: 'Adaptive grids running 24/7 on BTC, ETH, and SOL. Places layered limit orders at mathematically optimal levels, capturing profit from every oscillation. Trend confirmed via EMA50 + RSI(4h) before entry. Maker-only orders minimize fees.',
    pills: ['EMA50 filter', 'Maker-only', 'BTC correlation guard'],
  },
  {
    num: '03',
    tag: 'BINANCE · BYBIT · 10s',
    name: 'Listing Sniper',
    tagline: 'In before the crowd finishes reading.',
    desc: 'Polls Binance and Bybit listing APIs every 10 seconds. The moment a new listing appears, it enters automatically. DEX filter skips coins already pumped on-chain. Two-stage exit: 50% at +10%, remainder rides to +20%.',
    pills: ['TP1 +10% · TP2 +20%', 'DEX staleness filter', '5× leverage'],
  },
  {
    num: '04',
    tag: '30 PERPS · 15-MIN CYCLE',
    name: 'Funding Rate Arb',
    tagline: 'Profits when perpetuals diverge from spot.',
    desc: 'Scans 30 perpetual markets every 15 minutes. Elevated funding rate combined with overbought RSI signals a SHORT. Negative funding with oversold RSI signals a LONG. Three-tier position sizing amplifies on extreme setups.',
    pills: ['30 markets', 'FR > 0.04%', '3-tier sizing'],
  },
  {
    num: '05',
    tag: 'BINANCE WEBSOCKET',
    name: 'Liquidation Cascade',
    tagline: 'Trades the momentum that lasts minutes, not milliseconds.',
    desc: 'Connected to Binance liquidation feed 24/7. When $300K+ of shorts are liquidated in 5 minutes with 2.5:1 directional dominance — the bot enters the cascade direction. Cascades unfold over minutes, not microseconds. Real edge.',
    pills: ['22 alt coins', '$300K threshold', 'TP 6% · SL 2.5%'],
  },
  {
    num: '06',
    tag: 'ALCHEMY WEBSOCKET · ETH',
    name: 'On-chain Macro',
    tagline: 'Follow where the real money flows.',
    desc: 'Tracks ETH whale movements to and from exchange wallets in real time. When 500+ ETH is withdrawn from Binance or Bybit — a macro bullish signal activates for AAVE, UNI, LDO, LINK, CRV and other ETH-ecosystem alts for 45 minutes.',
    pills: ['ETH ecosystem alts', '45-min window', 'Alchemy WebSocket'],
  },
  {
    num: '07',
    tag: '10 WALLETS · WEBSOCKET',
    name: 'Whale Tracker',
    tagline: 'Follow the wallets that move markets.',
    desc: 'Tracks 10 identified smart money wallets — Paradigm, Jump Trading, Wintermute and others — via real-time Alchemy WebSocket feeds. When a whale makes a significant on-chain move, the confidence threshold drops and the bot enters immediately.',
    pills: ['10 smart wallets', 'Real-time', 'Lower score threshold'],
  },
  {
    num: '08',
    tag: 'BSC · PANCAKESWAP V2',
    name: 'DEX Sniper',
    tagline: 'New launches, safety-checked in real time.',
    desc: 'Listens for new PairCreated events on PancakeSwap V2. Every token verified by GoPlus: honeypot detection, buy/sell tax check, locked LP, and deployer history. Clean contracts only. Trailing stop activates after +30%.',
    pills: ['Honeypot check', 'TP +100% · SL −50%', 'Trailing stop at +30%'],
  },
];

const STATS = [
  { value: '8',      label: 'Active Bots' },
  { value: '24/7',   label: 'Uptime' },
  { value: '<5s',    label: 'Signal Latency' },
  { value: '9',      label: 'Score Factors' },
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
  const { t } = useLang();

  return (
    <div style={{ background: '#060606', minHeight: '100vh', fontFamily: FONT_BODY, color: '#fff' }}>
      <LandingHeader />

      {/* Hero */}
      <section style={{ paddingTop: 100, paddingBottom: 80, textAlign: 'center' }}>
        <div className="px-5 md:px-14" style={{ width: "100%" }}>
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
            {t.bots.badge}
          </div>

          <h1 style={{
            fontSize: 'clamp(48px,7vw,88px)',
            fontWeight: 700,
            letterSpacing: '-0.05em',
            lineHeight: 1.0,
            margin: '0 0 24px',
          }}>
            {t.bots.h1}
          </h1>

          <p style={{ fontSize: 16, color: '#666', lineHeight: 1.7, maxWidth: 520, margin: '0 auto' }}>
            {t.bots.sub}
          </p>
        </div>
      </section>

      {/* Stats bar */}
      <div className="px-5 md:px-14" style={{ width: '100%', paddingBottom: 80 }}>
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
      <div className="px-5 md:px-14" style={{ width: '100%', paddingBottom: 100 }}>
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
        <div className="px-5 md:px-14" style={{ width: "100%" }}>
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
        <div className="px-5 md:px-14" style={{ width: "100%" }}>
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
            Start trading with all eight bots.
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
