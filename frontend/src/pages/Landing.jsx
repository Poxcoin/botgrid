import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import { useIsMobile } from '@/lib/useIsMobile';

const MONO = "'JetBrains Mono','SF Mono',monospace";
const SANS = "'Inter',system-ui,sans-serif";
const G = '#0ecb81';
const R = '#f6465d';
const DIM = 'rgba(255,255,255,0.07)';

const BOT_ROWS = [
  { symbol: 'BTCUSDT',  bot: 'Signal Bot',     status: 'MONITORING' },
  { symbol: 'ETHUSDT',  bot: 'Signal Bot',     status: 'MONITORING' },
  { symbol: 'SOLUSDT',  bot: 'Signal Bot',     status: 'MONITORING' },
  { symbol: 'BNBUSDT',  bot: 'Funding Rate',   status: 'COLLECTING FR' },
  { symbol: 'XRPUSDT',  bot: 'Liq Sweep',      status: 'SCANNING' },
  { symbol: 'WLDUSDT',  bot: 'Signal Bot',     status: 'MONITORING' },
  { symbol: 'XAUUSD',   bot: 'Gold Bot',       status: 'MONITORING' },
  { symbol: 'EURUSD',   bot: 'Macro Forex',    status: 'MONITORING' },
];

const BOTS = [
  { id: '01', name: 'Signal Bot',     pairs: 'WLD · JUP · ARB · RUNE +6',  wr: '83%', tf: '15m–4h' },
  { id: '02', name: 'Liq Sweep',      pairs: 'ETH · SOL',                   wr: '59%', tf: '1m–15m' },
  { id: '03', name: 'Funding Rate',   pairs: 'INJ · ONDO · WLD · JUP +5',  wr: '71%', tf: '8h cycle' },
  { id: '04', name: 'Grid Bot',       pairs: 'BTC · ETH · SOL',             wr: '—',   tf: 'Range' },
  { id: '05', name: 'Cascade DCA',    pairs: 'ETH · SOL · DOGE · LINK +4', wr: '68%', tf: 'Multi-TP' },
  { id: '06', name: 'Orderflow',      pairs: 'BTC · ETH · SOL',             wr: '61%', tf: '1m–5m' },
  { id: '07', name: 'Macro Forex',    pairs: 'EUR/USD · GBP/USD',           wr: '—',   tf: 'Event' },
  { id: '08', name: 'Gold Bot',       pairs: 'XAU/USD',                     wr: '—',   tf: 'Event' },
];

/* ── LIVE TERMINAL ── */
function LiveTerminal() {
  const isMobile = useIsMobile();
  const [tickers, setTickers] = useState({});
  const [ts, setTs] = useState('');
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const symbols = ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','WLDUSDT'];
    const fetch_ = async () => {
      try {
        const r = await fetch(`https://api.bybit.com/v5/market/tickers?category=linear`);
        const d = await r.json();
        const map = {};
        (d.result?.list || []).forEach(t => { map[t.symbol] = t; });
        setTickers(map);
        setTs(new Date().toISOString().replace('T',' ').slice(0,19) + ' UTC');
      } catch {}
    };
    fetch_();
    const iv = setInterval(fetch_, 30000);
    const biv = setInterval(() => setBlink(b => !b), 800);
    return () => { clearInterval(iv); clearInterval(biv); };
  }, []);

  const rows = BOT_ROWS.filter(r => !isMobile || ['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT'].includes(r.symbol));

  return (
    <div style={{ fontFamily: MONO, border: `1px solid ${DIM}`, background: '#000' }}>
      {/* terminal header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', borderBottom: `1px solid ${DIM}`, background: 'rgba(255,255,255,0.02)' }}>
        <span style={{ fontSize: 11, color: '#555', letterSpacing: '0.12em' }}>KADO SIGNAL ENGINE</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {ts && <span style={{ fontSize: 10, color: '#333' }}>{ts}</span>}
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: G }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: blink ? G : 'transparent', transition: 'background 0.1s', display: 'inline-block' }}/>
            LIVE
          </span>
        </div>
      </div>

      {/* column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr 1fr' : '1.4fr 1fr 0.9fr 1.4fr 1.2fr', padding: '7px 16px', borderBottom: `1px solid ${DIM}` }}>
        {(!isMobile ? ['SYMBOL','PRICE','24H %','BOT','STATUS'] : ['SYMBOL','PRICE','24H %']).map(h => (
          <span key={h} style={{ fontSize: 9, color: '#444', letterSpacing: '0.18em' }}>{h}</span>
        ))}
      </div>

      {/* rows */}
      {rows.map((r, i) => {
        const t = tickers[r.symbol];
        const price = t ? parseFloat(t.lastPrice) : null;
        const chg = t ? parseFloat(t.price24hPcnt) * 100 : null;
        const up = chg == null ? null : chg >= 0;
        return (
          <div key={r.symbol} style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr 1fr 1fr' : '1.4fr 1fr 0.9fr 1.4fr 1.2fr',
            padding: '11px 16px',
            borderBottom: i < rows.length - 1 ? `1px solid rgba(255,255,255,0.03)` : 'none',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: 12, color: '#d0d0d0', fontWeight: 600 }}>{r.symbol}</span>
            <span style={{ fontSize: 12, color: '#aaa' }}>
              {price != null ? price.toLocaleString('en-US', { maximumFractionDigits: price > 100 ? 2 : 4 }) : '···'}
            </span>
            <span style={{ fontSize: 11, color: up == null ? '#444' : up ? G : R, fontWeight: 600 }}>
              {chg != null ? `${up ? '+' : ''}${chg.toFixed(2)}%` : '···'}
            </span>
            {!isMobile && <>
              <span style={{ fontSize: 10, color: '#666' }}>{r.bot}</span>
              <span style={{ fontSize: 10, color: '#444', letterSpacing: '0.06em' }}>{r.status}</span>
            </>}
          </div>
        );
      })}
    </div>
  );
}

/* ── HERO ── */
function Hero() {
  const isMobile = useIsMobile();
  return (
    <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: isMobile ? '80px 20px 60px' : '100px 64px 80px', maxWidth: 1200, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
      {/* label */}
      <div style={{ fontFamily: MONO, fontSize: 10, color: '#444', letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 28 }}>
        Bybit Futures · 8 Autonomous Bots · 24/7
      </div>

      {/* headline */}
      <h1 style={{ fontFamily: MONO, fontSize: isMobile ? 'clamp(38px,10vw,60px)' : 'clamp(52px,6vw,88px)', fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1.0, color: '#f0f2f5', margin: '0 0 40px', maxWidth: 820 }}>
        Your capital.<br />Automated.
      </h1>

      {/* terminal */}
      <div style={{ width: '100%', marginBottom: 40 }}>
        <LiveTerminal />
      </div>

      {/* CTA row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <Link to="/auth?mode=register" style={{
          fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
          color: '#000', background: '#fff', padding: '13px 28px',
          textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10,
          transition: 'background 150ms',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = G; }}
        onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
          ACCESS TERMINAL →
        </Link>
        <Link to="/bots" style={{ fontFamily: MONO, fontSize: 11, color: '#444', textDecoration: 'none', letterSpacing: '0.08em', transition: 'color 150ms' }}
          onMouseEnter={e => e.currentTarget.style.color = '#aaa'}
          onMouseLeave={e => e.currentTarget.style.color = '#444'}>
          VIEW BOTS ↓
        </Link>
      </div>
    </section>
  );
}

/* ── STATS BAR ── */
function StatsBar() {
  const isMobile = useIsMobile();
  const stats = [
    { val: '8',    label: 'Active Bots' },
    { val: '83%',  label: 'Signal Win Rate' },
    { val: '24/7', label: 'Uptime' },
    { val: '2+yr', label: 'Live Trading' },
  ];
  return (
    <div style={{ borderTop: `1px solid ${DIM}`, borderBottom: `1px solid ${DIM}` }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', maxWidth: 1200, margin: '0 auto' }}>
        {stats.map((s, i) => (
          <div key={s.label} style={{ padding: isMobile ? '28px 20px' : '36px 64px', borderRight: i < stats.length - 1 ? `1px solid ${DIM}` : 'none', borderBottom: isMobile && i < 2 ? `1px solid ${DIM}` : 'none' }}>
            <div style={{ fontFamily: MONO, fontSize: isMobile ? 32 : 42, fontWeight: 700, letterSpacing: '-0.04em', color: '#f0f2f5', lineHeight: 1 }}>{s.val}</div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: '#444', letterSpacing: '0.16em', textTransform: 'uppercase', marginTop: 10 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── BOTS TABLE ── */
function BotsTable() {
  const isMobile = useIsMobile();
  return (
    <section style={{ borderBottom: `1px solid ${DIM}` }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '60px 20px' : '80px 64px' }}>
        {/* section header */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 40, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: '#444', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Active Strategies</span>
          <div style={{ flex: 1, height: 1, background: DIM, minWidth: 40 }} />
          <span style={{ fontFamily: MONO, fontSize: 10, color: '#333' }}>8 / 8 RUNNING</span>
        </div>

        {/* table */}
        <div style={{ border: `1px solid ${DIM}` }}>
          {/* header row */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '0.4fr 1fr 1fr' : '0.4fr 1.4fr 2fr 0.8fr 0.8fr', padding: '9px 20px', borderBottom: `1px solid ${DIM}`, background: 'rgba(255,255,255,0.02)' }}>
            {(isMobile ? ['#','BOT','PAIRS'] : ['#','BOT','PAIRS','WIN RATE','TIMEFRAME']).map(h => (
              <span key={h} style={{ fontFamily: MONO, fontSize: 9, color: '#444', letterSpacing: '0.18em' }}>{h}</span>
            ))}
          </div>
          {BOTS.map((b, i) => (
            <div key={b.id}
              style={{ display: 'grid', gridTemplateColumns: isMobile ? '0.4fr 1fr 1fr' : '0.4fr 1.4fr 2fr 0.8fr 0.8fr', padding: '16px 20px', borderBottom: i < BOTS.length - 1 ? `1px solid rgba(255,255,255,0.03)` : 'none', alignItems: 'center', cursor: 'pointer', transition: 'background 120ms' }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: '#333' }}>{b.id}</span>
              <span style={{ fontFamily: MONO, fontSize: 13, color: '#d0d0d0', fontWeight: 600 }}>{b.name}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: '#666' }}>{b.pairs}</span>
              {!isMobile && <>
                <span style={{ fontFamily: MONO, fontSize: 12, color: b.wr === '—' ? '#333' : G, fontWeight: 600 }}>{b.wr}</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: '#555' }}>{b.tf}</span>
              </>}
            </div>
          ))}
        </div>

        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end' }}>
          <Link to="/bots" style={{ fontFamily: MONO, fontSize: 10, color: '#444', textDecoration: 'none', letterSpacing: '0.12em', transition: 'color 150ms' }}
            onMouseEnter={e => e.currentTarget.style.color = '#aaa'}
            onMouseLeave={e => e.currentTarget.style.color = '#444'}>
            FULL BOT DETAILS →
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ── HOW IT WORKS ── */
function HowItWorks() {
  const isMobile = useIsMobile();
  const steps = [
    { n: '01', title: 'Connect your Bybit account', body: 'Add your API keys with trading permissions. Read-only view stays private — we never withdraw.' },
    { n: '02', title: 'Bots scan markets 24/7', body: '8 strategies run in parallel: news events, liquidity sweeps, funding rates, on-chain flow, macro data.' },
    { n: '03', title: 'Signals execute automatically', body: 'Entry, SL and TP are placed in milliseconds. Position sizing scales to your balance. You review the log.' },
  ];
  return (
    <section style={{ borderBottom: `1px solid ${DIM}` }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '60px 20px' : '80px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 48, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: '#444', letterSpacing: '0.2em', textTransform: 'uppercase' }}>How It Works</span>
          <div style={{ flex: 1, height: 1, background: DIM, minWidth: 40 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: isMobile ? 0 : 1, background: isMobile ? 'transparent' : DIM }}>
          {steps.map((s, i) => (
            <div key={s.n} style={{ background: '#000', padding: isMobile ? '32px 0' : '40px 40px', borderBottom: isMobile && i < steps.length - 1 ? `1px solid ${DIM}` : 'none' }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: '#333', letterSpacing: '0.1em', marginBottom: 20 }}>{s.n}</div>
              <div style={{ fontFamily: SANS, fontSize: 17, fontWeight: 600, color: '#d0d0d0', marginBottom: 14, letterSpacing: '-0.02em', lineHeight: 1.3 }}>{s.title}</div>
              <div style={{ fontFamily: SANS, fontSize: 13, color: '#555', lineHeight: 1.8 }}>{s.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── RISK ── */
function Risk() {
  const isMobile = useIsMobile();
  const items = [
    { title: 'Non-custodial', body: 'API keys with trade-only permissions. We cannot withdraw funds or access your account balance.' },
    { title: 'Hard stops on every trade', body: 'Every signal has a stop-loss. No naked positions, no runaway drawdowns.' },
    { title: 'Crypto is volatile', body: 'Bots can and do lose trades. Past win rates are not a guarantee of future performance.' },
    { title: 'You control the kill switch', body: 'Revoke API access instantly from Bybit. Positions close, bots go offline in seconds.' },
  ];
  return (
    <section style={{ borderBottom: `1px solid ${DIM}`, contentVisibility: 'auto', containIntrinsicSize: '0 400px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '60px 20px' : '80px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 40, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: '#444', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Risk Disclosure</span>
          <div style={{ flex: 1, height: 1, background: DIM, minWidth: 40 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: 1, background: DIM }}>
          {items.map(item => (
            <div key={item.title} style={{ background: '#000', padding: isMobile ? '24px 18px' : '36px 32px' }}>
              <div style={{ fontFamily: MONO, fontSize: 12, color: '#888', fontWeight: 600, marginBottom: 12, letterSpacing: '-0.01em' }}>{item.title}</div>
              <div style={{ fontFamily: SANS, fontSize: 12, color: '#444', lineHeight: 1.8 }}>{item.body}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── PRICING PREVIEW ── */
function PricingPreview() {
  const isMobile = useIsMobile();
  const plans = [
    { name: 'Free', price: '$0', desc: 'Signal feed only. View signals, no auto-execution.', cta: 'Start free', href: '/auth?mode=register', active: false },
    { name: 'Pro',  price: '$29', desc: 'All 8 bots running. Full automation, trade history, Telegram alerts.', cta: 'Start Pro', href: '/auth?mode=register', active: true },
    { name: 'VIP',  price: '$79', desc: 'Priority execution, higher position sizing, dedicated support.', cta: 'Contact', href: '/auth?mode=register', active: false },
  ];
  return (
    <section style={{ contentVisibility: 'auto', containIntrinsicSize: '0 500px', borderBottom: `1px solid ${DIM}` }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '60px 20px' : '80px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 40, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, color: '#444', letterSpacing: '0.2em', textTransform: 'uppercase' }}>Pricing</span>
          <div style={{ flex: 1, height: 1, background: DIM, minWidth: 40 }} />
          <Link to="/pricing" style={{ fontFamily: MONO, fontSize: 10, color: '#333', textDecoration: 'none', letterSpacing: '0.12em' }}>FULL DETAILS →</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3,1fr)', gap: 1, background: DIM }}>
          {plans.map(p => (
            <div key={p.name} style={{ background: p.active ? 'rgba(14,203,129,0.04)' : '#000', padding: isMobile ? '32px 20px' : '40px 36px', display: 'flex', flexDirection: 'column', gap: 0, borderTop: p.active ? `1px solid ${G}` : '1px solid transparent' }}>
              <div style={{ fontFamily: MONO, fontSize: 10, color: '#444', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 16 }}>{p.name}</div>
              <div style={{ fontFamily: MONO, fontSize: 36, fontWeight: 700, letterSpacing: '-0.04em', color: '#f0f2f5', lineHeight: 1, marginBottom: 6 }}>{p.price}<span style={{ fontSize: 12, color: '#444', letterSpacing: '0.04em' }}>/mo</span></div>
              <div style={{ fontFamily: SANS, fontSize: 13, color: '#555', lineHeight: 1.8, flex: 1, marginTop: 16, marginBottom: 28 }}>{p.desc}</div>
              <Link to={p.href} style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: p.active ? '#000' : '#555', background: p.active ? G : 'transparent', border: `1px solid ${p.active ? G : DIM}`, padding: '11px 0', textAlign: 'center', textDecoration: 'none', transition: 'all 150ms' }}
                onMouseEnter={e => { if (!p.active) { e.currentTarget.style.borderColor = '#555'; e.currentTarget.style.color = '#ccc'; } }}
                onMouseLeave={e => { if (!p.active) { e.currentTarget.style.borderColor = DIM; e.currentTarget.style.color = '#555'; } }}>
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── FINAL CTA ── */
function FinalCTA() {
  const isMobile = useIsMobile();
  return (
    <section style={{ contentVisibility: 'auto', containIntrinsicSize: '0 300px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '80px 20px' : '100px 64px', display: 'flex', flexDirection: 'column', gap: 32 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, color: '#333', letterSpacing: '0.22em', textTransform: 'uppercase' }}>Ready to automate?</div>
        <div style={{ fontFamily: MONO, fontSize: isMobile ? 28 : 44, fontWeight: 700, letterSpacing: '-0.04em', color: '#f0f2f5', lineHeight: 1.1, maxWidth: 600 }}>
          8 bots.<br />One account.<br />Zero manual trades.
        </div>
        <div>
          <Link to="/auth?mode=register" style={{
            fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
            color: '#000', background: '#fff', padding: '14px 32px',
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10,
            transition: 'background 150ms',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = G; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
            ACCESS TERMINAL →
          </Link>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: '#2a2a2a', letterSpacing: '0.06em', lineHeight: 2 }}>
          Non-custodial · Bybit Futures · API key trading only · Past performance ≠ future results
        </div>
      </div>
    </section>
  );
}

/* ── EXPORT ── */
export default function Landing() {
  return (
    <div style={{ color: '#fff', minHeight: '100vh', background: '#000' }}>
      <LandingHeader />
      <Hero />
      <StatsBar />
      <BotsTable />
      <HowItWorks />
      <Risk />
      <PricingPreview />
      <FinalCTA />
      <LandingFooter />
    </div>
  );
}
