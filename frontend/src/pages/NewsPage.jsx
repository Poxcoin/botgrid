import React from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';

const POSTS = [
  {
    date: '2026-04-30',
    tag: 'UPDATE',
    title: 'Grid Bot v2 — ATR-adaptive spacing, DOGE & XRP added',
    excerpt: 'Replaced fixed 30-day range with ATR(14,1h)×10 dynamic spacing. Added DOGE/USDT and XRP/USDT grids at 3× leverage. All 5 grids now run in parallel with BTC dump filter and auto-rebuild logic.',
    readTime: '3 min',
  },
  {
    date: '2026-04-30',
    tag: 'RELEASE',
    title: 'Funding Rate Arbitrage — tiered thresholds, 30 markets',
    excerpt: 'Upgraded FR strategy with three-tier entry (T1: 0.04%, T2: 0.06%, T3: 0.10%) and corresponding 0.5×/1.0×/1.5× position sizing. FR trend confirmation bonus (+1.5 score when FR rising 3 cycles). Watchlist expanded from 20 to 30 perpetuals.',
    readTime: '4 min',
  },
  {
    date: '2026-04-29',
    tag: 'RELEASE',
    title: 'Listing Sniper v2 — partial TP + DEX filter',
    excerpt: 'New: partial TP1 limit order at +10% (50% of position) placed immediately after entry. Remaining 50% targets full +20% TP via trailing stop. DEX filter via GeckoTerminal skips coins already pumped on-chain (>$100K 24h volume).',
    readTime: '3 min',
  },
  {
    date: '2026-04-28',
    tag: 'UPDATE',
    title: 'News Bot — 7 improvements shipped',
    excerpt: 'Dynamic position sizing (0.4–2.0× multiplier based on score + confidence), native Bybit trailing stop (activates at +1%), BTC correlation filter, TG timestamp validation, partial TP, liquidation cascade boost, and post-trade analyzer with adaptive thresholds.',
    readTime: '6 min',
  },
  {
    date: '2026-04-25',
    tag: 'INFRA',
    title: 'Telegram userbot — real-time signal ingestion at ~5s latency',
    excerpt: 'Replaced RSS polling (5–30 min lag) with Telethon userbot monitoring 6 curated crypto channels. Signal latency dropped from 5–30 minutes to ~5 seconds. RSS retained as fallback. Deduplication window: 30 minutes with duplicate boost scoring.',
    readTime: '2 min',
  },
];

const TAG_COLORS = {
  UPDATE:  'rgba(255,255,255,0.15)',
  RELEASE: 'rgba(255,255,255,0.1)',
  INFRA:   'rgba(255,255,255,0.08)',
};

export default function NewsPage() {
  return (
    <div style={{ background: 'var(--bg)', color: 'var(--fg)', minHeight: '100vh' }}>
      <LandingHeader />

      <main>
        {/* Header */}
        <section style={{ borderBottom: '1px solid var(--border)', padding: '5rem 0 4rem' }}>
          <div className="px-6 md:px-10">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 16 }}>
              [ CHANGELOG / NEWS ]
            </div>
            <h1 className="font-black tracking-[-0.04em] leading-[0.88]"
              style={{ fontSize: 'clamp(40px, 8vw, 100px)' }}>
              What's shipping.
            </h1>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.8, color: 'var(--muted-fg)', maxWidth: 480, marginTop: 20 }}>
              Engineering updates, strategy releases, and infrastructure changes.
              No marketing fluff — just what actually changed and why.
            </p>
          </div>
        </section>

        {/* Posts */}
        <section>
          {POSTS.map((post, i) => (
            <article key={i} style={{
              borderBottom: '1px solid var(--border)',
              padding: '2.5rem 0',
              transition: 'background 200ms',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.015)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              <div className="px-6 md:px-10 grid md:grid-cols-[200px_1fr] gap-6 md:gap-16">

                {/* Meta */}
                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.25em', color: 'var(--muted)', marginBottom: 8 }}>
                    {post.date}
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.3em', textTransform: 'uppercase',
                    border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.55)',
                    padding: '2px 8px', display: 'inline-block',
                  }}>
                    {post.tag}
                  </span>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.2em', color: 'var(--muted)', marginTop: 12, opacity: 0.5 }}>
                    {post.readTime} read
                  </div>
                </div>

                {/* Content */}
                <div>
                  <h2 className="font-black text-xl mb-3" style={{ letterSpacing: '-0.02em', lineHeight: 1.2 }}>
                    {post.title}
                  </h2>
                  <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.8, color: 'var(--muted-fg)', maxWidth: 640 }}>
                    {post.excerpt}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </section>

        {/* CTA */}
        <section style={{ padding: '4rem 0', borderTop: '1px solid var(--border)' }}>
          <div className="px-6 md:px-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted-fg)' }}>
              Want to be notified when access opens?
            </div>
            <Link to="/waitlist" style={{
              display: 'inline-flex', alignItems: 'center', height: 44, padding: '0 28px',
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
              textDecoration: 'none', background: '#fff', color: '#000', fontWeight: 700,
              transition: 'all 150ms',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.85)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}>
              Join Waitlist →
            </Link>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
