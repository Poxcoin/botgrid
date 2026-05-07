import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';

const REFRESH_INTERVAL = 30_000;
const MONO = "'Courier New','SF Mono',monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',sans-serif";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function getCategory(source = '', title = '', description = '') {
  const s    = source.toLowerCase();
  const text = (title + ' ' + (description || '')).toLowerCase();

  if (s.includes('whale_alert') || s.includes('whale alert')) return 'ON-CHAIN';
  if (s.includes('lookonchain'))                               return 'ON-CHAIN';
  if (s.includes('announcement') || s.includes('listing'))    return 'LISTINGS';

  const geoKw = ['war ', 'warfare', 'military', 'sanctions', 'geopolit', 'nato', 'conflict',
    'ukraine', 'russia', 'missile', 'troops', 'attack', 'invasion', 'treaty', 'coup',
    'airstrike', 'artillery', 'frontline', 'ceasefire', 'hostilities'];
  if (geoKw.some(k => text.includes(k))) return 'GEOPOLITICS';

  const macroKw = ['inflation', 'recession', 'federal reserve', ' fed ', 'interest rate',
    ' cpi ', ' gdp ', 'treasury', 'central bank', 'tariff', 'fiscal', 'monetary policy',
    'rate hike', 'rate cut', 'economic crisis', 'economic collapse', 'labor market'];
  if (macroKw.some(k => text.includes(k))) return 'MACRO';

  const commKw = ['crude oil', 'wti ', 'brent', 'gold price', 'silver price', ' oil price',
    'per barrel', 'opec', 'commodit', 'natural gas', ' lng ', 'gold hit', 'gold falls',
    'oil falls', 'oil surges', 'copper', 'nickel', 'zinc', 'iron ore', 'precious metal'];
  if (commKw.some(k => text.includes(k))) return 'COMMODITIES';

  const marketKw = ['stock market', 's&p', 'nasdaq', 'dow jones', 'wall street', 'earnings',
    ' ipo ', 'equity', 'shares', 'dividend', 'hedge fund'];
  if (marketKw.some(k => text.includes(k))) return 'MARKETS';

  const chainKw = ['on-chain', 'blockchain', 'whale', 'transaction', 'wallet', 'defi',
    'protocol', 'smart contract', 'gas fee', 'tvl'];
  if (chainKw.some(k => text.includes(k))) return 'ON-CHAIN';

  if (s.includes('binance') || s.includes('bybit') || s.includes('coinbase') || s.includes('okx'))
    return 'LISTINGS';

  return 'CRYPTO';
}

function toSlug(cat) { return cat.toLowerCase().replace(/\s+/g, '-'); }

const CATEGORIES = [
  { id: 'ALL',         label: 'All' },
  { id: 'CRYPTO',      label: 'Crypto' },
  { id: 'MACRO',       label: 'Macro' },
  { id: 'GEOPOLITICS', label: 'Geopolitics' },
  { id: 'COMMODITIES', label: 'Commodities' },
  { id: 'MARKETS',     label: 'Markets' },
  { id: 'ON-CHAIN',    label: 'On-Chain' },
  { id: 'LISTINGS',    label: 'Listings' },
];

// ─── Category label (inline text, no badge box) ───────────────────────────────

function CatLabel({ cat, linked = false }) {
  const style = {
    fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em',
    textTransform: 'uppercase', color: '#0047FF', textDecoration: 'none',
  };
  if (!linked) return <span style={style}>{cat}</span>;
  return <Link to={`/news/${toSlug(cat)}`} style={style} onClick={e => e.stopPropagation()}>{cat}</Link>;
}

// ─── Lead story ───────────────────────────────────────────────────────────────

const LeadStory = React.memo(function LeadStory({ item }) {
  if (!item) return null;
  const hasLink = item.link?.startsWith('http');
  return (
    <article
      onClick={() => hasLink && window.open(item.link, '_blank', 'noopener')}
      style={{ padding: '28px 0 24px', cursor: hasLink ? 'pointer' : 'default' }}
      onMouseEnter={e => { if (hasLink) e.currentTarget.querySelector('.lead-hl').style.opacity = '0.75'; }}
      onMouseLeave={e => { if (hasLink) e.currentTarget.querySelector('.lead-hl').style.opacity = '1'; }}
    >
      <div style={{ marginBottom: 12 }}>
        <CatLabel cat={item._category} linked />
      </div>
      <h1 className="lead-hl" style={{
        fontFamily: SANS, fontSize: 'clamp(22px, 2.8vw, 38px)',
        fontWeight: 700, lineHeight: 1.12, letterSpacing: '-0.04em',
        color: '#f5f5f5', margin: '0 0 14px 0',
        transition: 'opacity 180ms',
      }}>
        {item.title}
      </h1>
      {item.description && (
        <p style={{
          fontFamily: SANS, fontSize: 15, color: '#777', lineHeight: 1.65,
          margin: '0 0 16px 0',
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {item.description}
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {item.source}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: '#333' }}>·</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: '#444', letterSpacing: '0.08em' }}>
          {timeAgo(item.published_at)} ago
        </span>
        {hasLink && <span style={{ fontFamily: MONO, fontSize: 9, color: '#0047FF', letterSpacing: '0.1em' }}>READ ↗</span>}
      </div>
    </article>
  );
});

// ─── Secondary story (list-style, no card box) ────────────────────────────────

const StoryRow = React.memo(function StoryRow({ item, size = 'md', divider = true }) {
  const hasLink = item.link?.startsWith('http');
  const fsMap = { lg: 17, md: 14, sm: 12 };
  const fs = fsMap[size] || 14;

  return (
    <article
      onClick={() => hasLink && window.open(item.link, '_blank', 'noopener')}
      style={{
        padding: '14px 0',
        borderBottom: divider ? '1px solid rgba(255,255,255,0.055)' : 'none',
        cursor: hasLink ? 'pointer' : 'default',
      }}
      onMouseEnter={e => e.currentTarget.querySelector('.story-hl').style.color = '#fff'}
      onMouseLeave={e => e.currentTarget.querySelector('.story-hl').style.color = '#ccc'}
    >
      <div style={{ marginBottom: 6 }}>
        <CatLabel cat={item._category} linked />
      </div>
      <p className="story-hl" style={{
        fontFamily: SANS, fontSize: fs, fontWeight: 600, lineHeight: 1.38,
        letterSpacing: '-0.02em', color: '#ccc', margin: '0 0 7px 0',
        transition: 'color 150ms',
      }}>
        {item.title}
      </p>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span style={{ fontFamily: MONO, fontSize: 8, color: '#3a3a3a', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {item.source}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 8, color: '#2a2a2a' }}>·</span>
        <span style={{ fontFamily: MONO, fontSize: 8, color: '#3a3a3a' }}>{timeAgo(item.published_at)} ago</span>
      </div>
    </article>
  );
});

// ─── Feed item (numbered, compact) ────────────────────────────────────────────

const FeedItem = React.memo(function FeedItem({ item, index }) {
  const hasLink = item.link?.startsWith('http');
  return (
    <div
      onClick={() => hasLink && window.open(item.link, '_blank', 'noopener')}
      style={{
        display: 'flex', gap: 12, alignItems: 'flex-start',
        padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: hasLink ? 'pointer' : 'default',
      }}
      onMouseEnter={e => e.currentTarget.querySelector('.feed-hl').style.color = '#ddd'}
      onMouseLeave={e => e.currentTarget.querySelector('.feed-hl').style.color = '#888'}
    >
      <span style={{ fontFamily: MONO, fontSize: 8, color: '#2a2a2a', flexShrink: 0, paddingTop: 3, minWidth: 18, textAlign: 'right' }}>
        {String(index + 1).padStart(2, '0')}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="feed-hl" style={{
          fontFamily: SANS, fontSize: 11, fontWeight: 500, lineHeight: 1.4,
          color: '#888', margin: '0 0 4px 0', transition: 'color 150ms',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {item.title}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 7, color: '#2e2e2e', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {item._category}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 7, color: '#252525' }}>·</span>
          <span style={{ fontFamily: MONO, fontSize: 7, color: '#2e2e2e' }}>{timeAgo(item.published_at)}</span>
        </div>
      </div>
    </div>
  );
});

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonLine({ width = '100%', height = 14, mb = 8 }) {
  return <div style={{ width, height, background: 'rgba(255,255,255,0.04)', marginBottom: mb }} />;
}

// ─── Category section header ──────────────────────────────────────────────────

function SectionHead({ label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '36px 0 0 0', paddingBottom: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#fff', fontWeight: 700 }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function NewsPage() {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [filter, setFilter]       = useState('ALL');

  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch('/api/news/public?limit=60');
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items || []);
      setUpdatedAt(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }));
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchNews();
    const iv = setInterval(fetchNews, REFRESH_INTERVAL);
    return () => clearInterval(iv);
  }, [fetchNews]);

  const enriched = useMemo(() =>
    items.map(item => ({
      ...item,
      _category: getCategory(item.source, item.title, item.description),
    })),
  [items]);

  const filtered = useMemo(() =>
    filter === 'ALL' ? enriched : enriched.filter(i => i._category === filter),
  [enriched, filter]);

  const display   = filtered.length > 0 ? filtered : enriched;
  const lead      = display[0] || null;
  const main      = display.slice(1, 5);   // 4 primary stories
  const sidebar   = display.slice(5, 30);  // 25 feed items
  const more      = display.slice(30);

  // Today's date for header
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ background: '#060606', color: '#f5f5f5', fontFamily: SANS, minHeight: '100vh' }}>
      <LandingHeader />

      <style>{`
        @keyframes ticker { 0% { transform: translateX(0) } 100% { transform: translateX(-50%) } }
        @media (max-width: 900px) {
          .news-3col { flex-direction: column !important; }
          .news-sidebar { display: none !important; }
          .news-ticker { display: none !important; }
        }
      `}</style>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '11px 0' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', fontWeight: 700, textTransform: 'uppercase', color: '#fff' }}>
              KADO INTELLIGENCE
            </span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: '#333' }}>·</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: '#444', letterSpacing: '0.06em' }}>{dateStr}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {updatedAt && (
              <span style={{ fontFamily: MONO, fontSize: 8, color: '#333', letterSpacing: '0.1em' }}>
                UPDATED {updatedAt}
              </span>
            )}
            <button
              onClick={fetchNews}
              style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.12em', color: '#555', background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', padding: 0 }}
            >
              ↺ Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ── Ticker ──────────────────────────────────────────────────────────── */}
      {enriched.length > 0 && (
        <div className="news-ticker" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', padding: '7px 0', overflow: 'hidden', whiteSpace: 'nowrap' }}>
          <div style={{ display: 'inline-block', animation: 'ticker 110s linear infinite' }}>
            {[...enriched.slice(0, 20), ...enriched.slice(0, 20)].map((item, i) => (
              <span key={i} style={{ fontFamily: MONO, fontSize: 9, color: '#3a3a3a', letterSpacing: '0.04em' }}>
                <span style={{ color: '#222', margin: '0 12px' }}>◆</span>
                <span style={{ color: '#3a3a3a', marginRight: 8 }}>{item._category}</span>
                {item.title}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Category nav ─────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 28px', display: 'flex', alignItems: 'stretch', gap: 0 }}>
          {CATEGORIES.map(cat => {
            const active = filter === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => setFilter(cat.id)}
                style={{
                  fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase',
                  padding: '13px 18px', background: 'none', border: 'none',
                  borderBottom: active ? '2px solid #fff' : '2px solid transparent',
                  color: active ? '#fff' : '#444',
                  cursor: 'pointer', transition: 'color 140ms, border-color 140ms',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#888'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#444'; }}
              >
                {cat.label}
              </button>
            );
          })}
          <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 8, color: '#2a2a2a', alignSelf: 'center', letterSpacing: '0.1em' }}>
            {display.length} STORIES
          </span>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 28px 80px' }}>

        {loading ? (
          <div style={{ paddingTop: 40 }}>
            <SkeletonLine width="60px" height={10} mb={16} />
            <SkeletonLine width="80%" height={38} mb={12} />
            <SkeletonLine width="65%" height={38} mb={20} />
            <SkeletonLine height={14} mb={8} />
            <SkeletonLine width="75%" height={14} mb={8} />
            <SkeletonLine width="55%" height={14} />
          </div>
        ) : display.length === 0 ? (
          <div style={{ padding: '80px 0', textAlign: 'center', fontFamily: MONO, fontSize: 10, color: '#333', letterSpacing: '0.18em' }}>
            NO STORIES FOR THIS FILTER
          </div>
        ) : (
          <div className="news-3col" style={{ display: 'flex', gap: 0, paddingTop: 0 }}>

            {/* ── Left: lead + main stories ─────────────────────────────────── */}
            <div style={{ flex: '0 0 54%', minWidth: 0, paddingRight: 40, borderRight: '1px solid rgba(255,255,255,0.06)' }}>
              <LeadStory item={lead} />

              {main.length > 0 && (
                <>
                  <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0 0 0' }} />
                  {main.map((item, i) => (
                    <StoryRow key={item.id} item={item} size="md" divider={i < main.length - 1} />
                  ))}
                </>
              )}
            </div>

            {/* ── Center: more stories ──────────────────────────────────────── */}
            <div style={{ flex: '0 0 28%', minWidth: 0, padding: '28px 28px 0', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.2em', color: '#333', marginBottom: 16, textTransform: 'uppercase' }}>
                More Stories
              </div>
              {sidebar.slice(0, 12).map((item, i) => (
                <StoryRow key={item.id} item={item} size="sm" divider={i < 11} />
              ))}
            </div>

            {/* ── Right: numbered feed ──────────────────────────────────────── */}
            <div className="news-sidebar" style={{ flex: '0 0 18%', minWidth: 0, padding: '28px 0 0 24px' }}>
              <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.2em', color: '#333', marginBottom: 16, textTransform: 'uppercase' }}>
                Latest
              </div>
              {sidebar.slice(12).map((item, i) => (
                <FeedItem key={item.id} item={item} index={i} />
              ))}
            </div>

          </div>
        )}

        {/* ── Category sections (ALL view only, below fold) ──────────────────── */}
        {!loading && filter === 'ALL' && more.length > 0 && (
          <div style={{ marginTop: 48, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 0 }}>
            {['GEOPOLITICS', 'MACRO', 'COMMODITIES', 'ON-CHAIN', 'LISTINGS'].map(cat => {
              const catItems = more.filter(i => i._category === cat).slice(0, 4);
              if (catItems.length === 0) return null;
              return (
                <div key={cat}>
                  <SectionHead label={CATEGORIES.find(c => c.id === cat)?.label || cat} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0 40px' }}>
                    {catItems.map((item, i) => (
                      <StoryRow key={item.id} item={item} size="sm" divider={i < catItems.length - 1} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── CTA ─────────────────────────────────────────────────────────────── */}
        <div style={{ marginTop: 72, paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', color: '#444', marginBottom: 8, textTransform: 'uppercase' }}>
              Kado AI Engine
            </div>
            <p style={{ fontSize: 14, color: '#555', margin: 0, lineHeight: 1.6, maxWidth: 420 }}>
              Our AI analyzes this feed in real-time and executes trades in under 100ms across your Bybit account.
            </p>
          </div>
          <a
            href="/auth?mode=register"
            style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
              padding: '12px 28px', background: '#0047FF', color: '#fff',
              textDecoration: 'none', border: '1px solid rgba(0,71,255,0.6)',
              flexShrink: 0,
            }}
          >
            Get started ↗
          </a>
        </div>
      </div>

      <LandingFooter />
    </div>
  );
}
