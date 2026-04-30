import React, { useEffect } from 'react';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';

const POSTS = [
  {
    date: '2026-04-30',
    tag: 'UPDATE',
    title: 'Grid Bot v2 — ATR-adaptive spacing, DOGE & XRP added',
    readTime: '3 min',
    excerpt:
      'Replaced fixed 30-day range with ATR(14,1h)×10 dynamic spacing. Added DOGE/USDT and XRP/USDT grids at 3× leverage. All 5 grids now run in parallel with BTC dump filter and auto-rebuild logic.',
  },
  {
    date: '2026-04-30',
    tag: 'RELEASE',
    title: 'Funding Rate Arbitrage — tiered thresholds, 30 markets',
    readTime: '4 min',
    excerpt:
      'Upgraded FR strategy with three-tier entry (T1: 0.04%, T2: 0.06%, T3: 0.10%) and corresponding 0.5×/1.0×/1.5× position sizing. FR trend confirmation bonus (+1.5 score). Watchlist expanded to 30 perpetuals.',
  },
  {
    date: '2026-04-29',
    tag: 'RELEASE',
    title: 'Listing Sniper v2 — partial TP + DEX filter',
    readTime: '3 min',
    excerpt:
      'Partial TP1 limit order at +10% (50% of position) placed immediately after entry. Remaining 50% targets +20% via trailing stop. DEX filter via GeckoTerminal skips coins already pumped (>$100K 24h volume).',
  },
  {
    date: '2026-04-28',
    tag: 'UPDATE',
    title: 'News Bot — 7 improvements shipped',
    readTime: '6 min',
    excerpt:
      'Dynamic position sizing (0.4–2.0× multiplier), native Bybit trailing stop (activates at +1%), BTC correlation filter, TG timestamp validation, partial TP, liquidation cascade boost, and post-trade analyzer with adaptive thresholds.',
  },
  {
    date: '2026-04-25',
    tag: 'INFRA',
    title: 'Telegram userbot — real-time signal ingestion at ~5s latency',
    readTime: '2 min',
    excerpt:
      'Replaced RSS polling (5–30 min lag) with Telethon userbot on 6 curated crypto channels. Signal latency dropped to ~5 seconds. RSS retained as fallback. Deduplication window: 30 minutes.',
  },
];

const TAG_STYLE = {
  UPDATE: {
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#999',
  },
  RELEASE: {
    border: '1px solid rgba(34,197,94,0.3)',
    color: '#22c55e',
  },
  INFRA: {
    border: '1px solid rgba(255,255,255,0.1)',
    color: '#999',
  },
};

const S = {
  page: {
    background: '#060606',
    color: '#fff',
    fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",
    minHeight: '100vh',
  },
  wrap: {
    maxWidth: '1100px',
    margin: '0 auto',
  },
  hero: {
    textAlign: 'center',
    paddingTop: '100px',
    paddingBottom: '80px',
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '100px',
    padding: '6px 18px',
    fontSize: '11px',
    color: '#888',
    marginBottom: '28px',
    letterSpacing: '0.06em',
  },
  h1: {
    fontSize: 'clamp(36px,4.5vw,52px)',
    fontWeight: 700,
    letterSpacing: '-0.04em',
    lineHeight: 1.0,
    margin: '0 0 24px 0',
    color: '#fff',
  },
  subtitle: {
    fontSize: '16px',
    color: '#aaa',
    maxWidth: '480px',
    margin: '0 auto',
    lineHeight: 1.6,
  },
  articleList: {
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },
  article: {
    borderBottom: '1px solid rgba(255,255,255,0.06)',
    transition: 'background 180ms',
    cursor: 'default',
  },
  articleInner: {
    paddingTop: '32px',
    paddingBottom: '32px',
    display: 'flex',
    gap: '48px',
    alignItems: 'flex-start',
  },
  metaCol: {
    flexShrink: 0,
    width: '180px',
  },
  metaDate: {
    fontFamily: "'Courier New','SF Mono',monospace",
    fontSize: '11px',
    color: '#555',
    marginBottom: '10px',
    letterSpacing: '0.04em',
  },
  tagPill: {
    display: 'inline-block',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '100px',
    padding: '3px 10px',
    fontSize: '9px',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    marginBottom: '10px',
  },
  metaRead: {
    fontFamily: "'Courier New','SF Mono',monospace",
    fontSize: '10px',
    color: '#555',
    marginTop: '4px',
  },
  contentCol: {
    flex: 1,
    minWidth: 0,
  },
  articleTitle: {
    fontSize: '20px',
    fontWeight: 700,
    color: '#fff',
    letterSpacing: '-0.02em',
    lineHeight: 1.3,
    marginBottom: '12px',
  },
  articleExcerpt: {
    fontSize: '14px',
    color: '#aaa',
    lineHeight: 1.7,
    maxWidth: '640px',
  },
  ctaStrip: {
    paddingTop: '72px',
    paddingBottom: '100px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '24px',
    textAlign: 'center',
  },
  ctaText: {
    fontSize: '16px',
    color: '#aaa',
  },
  btnPrimary: {
    display: 'inline-block',
    padding: '14px 36px',
    borderRadius: '100px',
    fontSize: '13px',
    fontWeight: 600,
    border: 'none',
    background: '#fff',
    color: '#000',
    cursor: 'pointer',
    textDecoration: 'none',
    letterSpacing: '0.01em',
  },
};

function Article({ post }) {
  const tagS = TAG_STYLE[post.tag] || TAG_STYLE.INFRA;

  return (
    <article
      style={S.article}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <div className="px-5 md:px-14" style={{ maxWidth: '1100px', margin: '0 auto' }}>
        {/* Desktop layout */}
        <div className="hidden md:flex" style={S.articleInner}>
          <div style={S.metaCol}>
            <div style={S.metaDate}>{post.date}</div>
            <span style={{ ...S.tagPill, ...tagS }}>{post.tag}</span>
            <div style={S.metaRead}>{post.readTime} read</div>
          </div>
          <div style={S.contentCol}>
            <h2 style={S.articleTitle}>{post.title}</h2>
            <p style={S.articleExcerpt}>{post.excerpt}</p>
          </div>
        </div>

        {/* Mobile layout */}
        <div className="flex flex-col md:hidden" style={{ paddingTop: '28px', paddingBottom: '28px', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ ...S.tagPill, ...tagS }}>{post.tag}</span>
            <span style={S.metaDate}>{post.date}</span>
            <span style={S.metaRead}>{post.readTime} read</span>
          </div>
          <h2 style={{ ...S.articleTitle, fontSize: '17px' }}>{post.title}</h2>
          <p style={{ ...S.articleExcerpt, fontSize: '13px' }}>{post.excerpt}</p>
        </div>
      </div>
    </article>
  );
}

export default function NewsPage() {
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <div style={S.page}>
      <LandingHeader />

      {/* Hero */}
      <div style={S.wrap} className="px-5 md:px-14">
        <div style={S.hero}>
          <div style={S.badge}>Changelog · Engineering Updates</div>
          <h1 style={S.h1}>WHAT'S SHIPPING.</h1>
          <p style={S.subtitle}>
            Real updates on what changed and why. No marketing fluff.
          </p>
        </div>
      </div>

      {/* Articles */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        {POSTS.map((post, i) => (
          <Article key={i} post={post} />
        ))}
      </div>

      {/* CTA strip */}
      <div style={S.wrap} className="px-5 md:px-14">
        <div style={S.ctaStrip}>
          <p style={S.ctaText}>Want to be notified when access opens?</p>
          <a href="/waitlist" style={S.btnPrimary}>Join Waitlist →</a>
        </div>
      </div>

      <LandingFooter />
    </div>
  );
}
