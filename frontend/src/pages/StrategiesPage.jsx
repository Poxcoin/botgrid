import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import { useLang } from '@/lib/LangContext';
import { usePageTitle } from '@/lib/usePageTitle';

const FONT_BODY = "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif";
const FONT_MONO = "'Courier New','SF Mono',monospace";

const BOT_KEYS = ['b2','b3','b4','b5','b6','b7','b8'];

// s1 = Steady, s2 = Balanced, s3 = Full Suite
// boolean[] indexed [s1, s2, s3] — which bot is included in each strategy
const COMPARISON = {
  b2: [true,  true,  true],  // Grid Trading
  b3: [false, false, true],  // Listing Sniper
  b4: [false, true,  true],  // Funding Rate Arb
  b5: [false, true,  true],  // Liquidation Cascade
  b6: [false, false, true],  // On-chain Macro
  b7: [false, false, true],  // Whale Tracker
  b8: [false, false, true],  // DEX Sniper
};

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

function StrategyCard({ strategy, estMonthlyLabel }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#0f0f0f' : '#0a0a0a',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 16,
        padding: '44px 36px',
        display: 'flex',
        flexDirection: 'column',
        transition: 'background 200ms',
      }}
    >
      <div style={{ fontFamily: FONT_MONO, fontSize: 11, color: '#555', letterSpacing: '0.08em', marginBottom: 20 }}>
        {strategy.num}
      </div>

      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: '#fff', marginBottom: 12 }}>
        {strategy.name}
      </div>

      <p style={{ fontSize: 14, color: '#666', lineHeight: 1.7, marginBottom: 24, flexGrow: 1 }}>
        {strategy.summary}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 36 }}>
        {strategy.tags.map((b) => (
          <PillTag key={b} label={b} />
        ))}
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{
          fontFamily: FONT_MONO,
          fontSize: 'clamp(36px,4vw,48px)',
          fontWeight: 700,
          color: '#fff',
          letterSpacing: '-0.04em',
          lineHeight: 1.0,
        }}>
          {strategy.ret}
        </div>
        <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#555', letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 6 }}>
          {estMonthlyLabel}
        </div>
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 24, paddingTop: 20 }}>
        <p style={{ fontSize: 12, color: '#555', lineHeight: 1.6, margin: 0 }}>
          {strategy.note}
        </p>
      </div>
    </div>
  );
}

// ── Bot performance data (90-day backtests, fees included) ───────────────────
const BOTS = [
  {
    name: 'Liquidity Sweep',
    tag: 'ETH · SOL · 4H',
    symbols: 'ETH / SOL',
    tf: '4h',
    desc: 'Detects wick breakouts beyond key highs/lows followed by rejection — a classic institutional liquidity hunt. Enters reversal when price sweeps the level and closes back inside range. EMA trend filter blocks longs in downtrends.',
    wr: '52.9%',
    monthly: '+9.5%',
    period: '90d backtest',
    status: 'live',
    statusColor: '#4ade80',
    note: 'ETH 59.0% · SOL 51.4%',
  },
  {
    name: 'Order Block (SMC)',
    tag: 'BTC · 4H · SMC',
    symbols: 'BTC only',
    tf: '4h',
    desc: 'Smart Money Concepts — identifies institutional order blocks: the last bearish candle before a ≥2.5% bullish break of structure (and vice versa). Enters when price retraces into the OB zone. R:R 3:1. SOL removed (20% WR backtest).',
    wr: '55.6%',
    monthly: '+2.38%',
    period: '90d backtest',
    status: 'live',
    statusColor: '#4ade80',
    note: '9 trades, EMA200 filter',
  },
  {
    name: 'Funding Rate Extreme',
    tag: 'BTC · ETH · 8H',
    symbols: 'BTC / ETH',
    tf: '8h',
    desc: 'Fires when perpetual funding reaches extreme levels (≥0.009% SHORT, ≤-0.006% LONG) — a sign of over-leveraged positioning. Enters a reversal trade expecting funding to normalize. Position closes automatically at next funding settlement.',
    wr: '37.3%',
    monthly: '+2.38%',
    period: '90d backtest',
    status: 'live',
    statusColor: '#4ade80',
    note: '51 trades, break-even at 31.6% WR',
  },
  {
    name: 'Liquidation Cascade',
    tag: 'ETH · SOL · DOGE · LINK',
    symbols: 'ETH / SOL / DOGE / LINK',
    tf: 'Real-time',
    desc: 'Connects to the Binance liquidation WebSocket and accumulates forced orders within a 60-second window. When a symbol breaches its threshold ($300K+ for ETH), the bot enters in the cascade direction — following the momentum, not fighting it.',
    wr: '~34%',
    monthly: '—',
    period: 'Proxy estimate',
    status: 'live',
    statusColor: '#4ade80',
    note: 'Real liquidation data — OHLCV proxy not representative',
  },
  {
    name: 'Grid Trading',
    tag: 'BTC · ETH · SOL',
    symbols: 'BTC / ETH / SOL',
    tf: '15m',
    desc: 'Adaptive range grids using 8 limit levels. Hurst exponent (H<0.58) filters out trending markets. EMA50/200 and RSI determine LONG or SHORT mode. Currently frozen — all three coins are in EMA downtrend. Will resume when macro recovers.',
    wr: '5.5%',
    monthly: '—',
    period: 'Live demo (frozen)',
    status: 'frozen',
    statusColor: '#f87171',
    note: '36 trades — FROZEN: EMA50 < EMA200',
  },
  {
    name: 'Macro Forex',
    tag: 'EURUSD · GBPUSD · XAUUSD',
    symbols: 'Forex / Gold',
    tf: 'Event',
    desc: 'Trades macro news events (CPI, NFP, PCE, PPI, GDP) on IC Markets via MT5. Waits for the initial spike, then enters in the continuation direction with risk-based lot sizing. Position size scales with balance × 1.5% risk per SL.',
    wr: 'Active',
    monthly: '—',
    period: 'IC Markets demo',
    status: 'live',
    statusColor: '#4ade80',
    note: 'EURUSD / GBPUSD / XAUUSD — $10K demo',
  },
];

const STATUS_LABELS = { live: 'Active', testing: 'In Testing', frozen: 'Frozen' };

function BotCard({ bot, t }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#0f0f0f' : '#090909',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        padding: '28px 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        transition: 'background 200ms',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <div style={{ fontFamily: FONT_MONO, fontSize: 9, color: '#555', letterSpacing: '0.1em', marginBottom: 6 }}>
            {bot.tag}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
            {bot.name}
          </div>
        </div>
        <span style={{
          fontFamily: FONT_MONO,
          fontSize: 9,
          background: `${bot.statusColor}18`,
          color: bot.statusColor,
          border: `1px solid ${bot.statusColor}44`,
          borderRadius: 100,
          padding: '3px 10px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {STATUS_LABELS[bot.status]}
        </span>
      </div>

      {/* Description */}
      <p style={{ fontSize: 12, color: '#555', lineHeight: 1.7, margin: 0 }}>
        {bot.desc}
      </p>

      {/* Metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gap: 1,
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        {[
          { label: t.strategies.perfWr, val: bot.wr },
          { label: t.strategies.perfMonthly, val: bot.monthly },
          { label: t.strategies.perfPeriod, val: bot.period },
        ].map(({ label, val }) => (
          <div key={label} style={{ padding: '10px 12px', background: '#0a0a0a' }}>
            <div style={{ fontFamily: FONT_MONO, fontSize: 8, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, color: '#ccc' }}>
              {val}
            </div>
          </div>
        ))}
      </div>

      {/* Note */}
      <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: '#444', lineHeight: 1.5 }}>
        {bot.note}
      </div>
    </div>
  );
}

function BotPerfSection({ t }) {
  return (
    <section style={{ paddingTop: 100, paddingBottom: 100, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="px-5 md:px-14" style={{ width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <div style={{
            fontSize: 11, color: '#666', letterSpacing: '0.12em',
            textTransform: 'uppercase', marginBottom: 16, fontFamily: FONT_MONO,
          }}>
            {t.strategies.perfLabel}
          </div>
          <h2 style={{
            fontSize: 'clamp(36px,4.5vw,52px)', fontWeight: 700,
            letterSpacing: '-0.04em', lineHeight: 1.0, margin: '0 0 16px',
          }}>
            How each bot works.
          </h2>
          <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
            {t.strategies.perfSub}
          </p>
        </div>

        {/* Bot grid */}
        <div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          style={{ gap: 12 }}
        >
          {BOTS.map((bot) => (
            <BotCard key={bot.name} bot={bot} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default function StrategiesPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);
  const { t } = useLang();
  usePageTitle(t.nav.strategies);

  const STRATEGIES = ['s1','s2','s3'].map((k, i) => ({
    num: String(i + 1).padStart(2, '0'),
    ...t.landing.strats[k],
  }));

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
            {t.strategies.badge}
          </div>

          <h1 style={{
            fontSize: 'clamp(48px,7vw,88px)',
            fontWeight: 700,
            letterSpacing: '-0.05em',
            lineHeight: 1.0,
            margin: '0 0 24px',
          }}>
            {t.strategies.h1}
          </h1>

          <p style={{ fontSize: 16, color: '#666', lineHeight: 1.7, maxWidth: 520, margin: '0 auto' }}>
            {t.strategies.sub}
          </p>
        </div>
      </section>

      {/* Strategy cards */}
      <div className="px-5 md:px-14" style={{ width: '100%', paddingBottom: 100 }}>
        <div
          className="grid grid-cols-1 md:grid-cols-3"
          style={{ gap: 16 }}
        >
          {STRATEGIES.map((s) => (
            <StrategyCard key={s.num} strategy={s} estMonthlyLabel={t.landing.estMonthly} />
          ))}
        </div>
      </div>

      {/* Comparison table */}
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
              {t.strategies.compare}
            </div>
            <h2 style={{
              fontSize: 'clamp(36px,4.5vw,52px)',
              fontWeight: 700,
              letterSpacing: '-0.04em',
              lineHeight: 1.0,
              margin: 0,
            }}>
              {t.strategies.whats}
            </h2>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontFamily: FONT_BODY,
              minWidth: 560,
            }}>
              <thead>
                <tr>
                  <th style={{
                    textAlign: 'left',
                    padding: '14px 20px',
                    fontFamily: FONT_MONO,
                    fontSize: 10,
                    color: '#555',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    fontWeight: 400,
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                  }}>
                    {t.strategies.tableHeader}
                  </th>
                  {STRATEGIES.map((s) => (
                    <th key={s.num} style={{
                      textAlign: 'center',
                      padding: '14px 20px',
                      fontFamily: FONT_MONO,
                      fontSize: 11,
                      color: '#aaa',
                      letterSpacing: '0.06em',
                      fontWeight: 600,
                      borderBottom: '1px solid rgba(255,255,255,0.07)',
                    }}>
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {BOT_KEYS.map((botKey, i) => {
                  const botName = t.landing.arsenalBots[botKey].name;
                  return (
                    <tr key={botKey}>
                      <td style={{
                        padding: '16px 20px',
                        fontSize: 13,
                        color: '#aaa',
                        borderBottom: i < BOT_KEYS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                      }}>
                        {botName}
                      </td>
                      {COMPARISON[botKey].map((included, colIdx) => (
                        <td key={colIdx} style={{
                          textAlign: 'center',
                          padding: '16px 20px',
                          borderBottom: i < BOT_KEYS.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                          fontFamily: FONT_MONO,
                          fontSize: 14,
                          color: included ? '#fff' : '#333',
                        }}>
                          {included ? '✓' : '✗'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Bot Performance Section */}
      <BotPerfSection t={t} />

      {/* Risk disclaimer */}
      <div className="px-5 md:px-14" style={{ width: '100%', paddingBottom: 80, textAlign: 'center' }}>
        <p style={{
          fontFamily: FONT_MONO,
          fontSize: 11,
          color: '#444',
          lineHeight: 1.8,
          maxWidth: 640,
          margin: '0 auto',
        }}>
          {t.strategies.riskDisclaimer}
        </p>
      </div>

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
            {t.strategies.ctaLabel}
          </div>
          <h2 style={{
            fontSize: 'clamp(36px,4.5vw,52px)',
            fontWeight: 700,
            letterSpacing: '-0.04em',
            lineHeight: 1.0,
            margin: '0 0 40px',
          }}>
            {t.strategies.ctaTitle}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
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
              {t.strategies.ctaBtn}
            </Link>
            <Link
              to="/pricing"
              style={{
                display: 'inline-block',
                background: 'transparent',
                color: '#aaa',
                padding: '14px 36px',
                borderRadius: 100,
                fontSize: 13,
                fontWeight: 600,
                textDecoration: 'none',
                fontFamily: FONT_BODY,
                border: '1px solid rgba(255,255,255,0.12)',
                transition: 'border-color 150ms, color 150ms',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                e.currentTarget.style.color = '#aaa';
              }}
            >
              {t.strategies.viewPricing}
            </Link>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
