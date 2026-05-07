import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';

const REFRESH_INTERVAL = 30_000;

// ─── Shared helpers (duplicated from NewsPage for module independence) ─────────

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function detectSentiment(title, desc) {
  const text = (title + ' ' + (desc || '')).toLowerCase();
  const bearishKw = ['hack', 'exploit', 'stolen', 'crash', 'ban', 'scam', 'drop', 'dump', 'fear', 'warning', 'seized', 'investigation', 'fraud', 'loses', 'loss'];
  const bullishKw = ['partnership', 'launch', 'bullish', 'etf', 'adoption', 'milestone', 'record', 'surge', 'rally', 'accumulate', 'buy', 'breakout', 'upgrade', 'growth'];
  const b = bearishKw.filter(k => text.includes(k)).length;
  const u = bullishKw.filter(k => text.includes(k)).length;
  if (b > u) return 'BEARISH';
  if (u > b) return 'BULLISH';
  return 'NEUTRAL';
}

function getCategory(source = '', title = '', description = '') {
  const s = source.toLowerCase();
  const text = (title + ' ' + (description || '')).toLowerCase();

  if (s.includes('whale_alert') || s.includes('whale alert')) return 'WHALE ALERT';
  if (s.includes('lookonchain')) return 'ON-CHAIN';
  if (s.includes('announcement') || s.includes('listing') || s.includes('binance') || s.includes('coinbase') || s.includes('okx')) return 'LISTINGS';
  if (s.includes('breaking') || s.includes('urgent')) return 'BREAKING';

  const macroKw = ['war', 'military', 'sanctions', 'geopolit', 'inflation', 'recession', 'federal reserve', ' cpi ', ' gdp ', 'tariff', 'nato', 'conflict', 'ukraine', 'russia', 'missile', 'economic crisis', 'economic collapse', 'interest rate', 'central bank', 'treasury'];
  if (macroKw.some(k => text.includes(k))) return 'MACRO';

  const commodityKw = ['crude oil', 'wti ', 'brent', 'gold price', 'silver price', ' oil price', 'per barrel', 'opec', 'commodit', 'natural gas', ' lng ', 'gold hit', 'gold falls', 'oil falls', 'oil surges'];
  if (commodityKw.some(k => text.includes(k))) return 'COMMODITIES';

  return 'MARKET';
}

function categoryColor(cat = '') {
  if (cat === 'WHALE ALERT')  return '#f59e0b';
  if (cat === 'ON-CHAIN')     return '#06b6d4';
  if (cat === 'LISTINGS')     return '#8b5cf6';
  if (cat === 'BREAKING')     return '#ef4444';
  if (cat === 'MACRO')        return '#dc2626';
  if (cat === 'COMMODITIES')  return '#d97706';
  return '#555';
}

function sentimentStyle(sent) {
  if (sent === 'BULLISH') return { color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.2)' };
  if (sent === 'BEARISH') return { color: '#ef4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)' };
  return { color: '#555', bg: 'transparent', border: 'rgba(255,255,255,0.08)' };
}

function fromSlug(slug = '') {
  return slug.toUpperCase().replace(/-/g, ' ');
}

// ─── Hover handlers (no React state) ─────────────────────────────────────────

const _hCard = {
  enter: e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.018)'; },
  leave: e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; e.currentTarget.style.background = 'transparent'; },
};

// ─── Full Article Card (no line-clamp, shows complete text) ──────────────────

const ArticleCard = React.memo(function ArticleCard({ item, rank }) {
  const sentSty = sentimentStyle(item._sentiment);
  const hasLink = item.link && item.link.startsWith('http');
  const accentColor = categoryColor(item._category);

  return (
    <article
      onMouseEnter={_hCard.enter}
      onMouseLeave={_hCard.leave}
      style={{
        border: '1px solid rgba(255,255,255,0.05)',
        background: 'transparent',
        padding: '24px 28px',
        transition: 'border-color 200ms, background 200ms',
        cursor: hasLink ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
      onClick={() => hasLink && window.open(item.link, '_blank', 'noopener')}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {rank != null && (
            <span style={{ fontFamily: "'Courier New',monospace", fontSize: 9, color: '#333', letterSpacing: '0.06em', minWidth: 20 }}>
              {String(rank + 1).padStart(2, '0')}
            </span>
          )}
          <div style={{ width: 3, height: 3, borderRadius: '50%', background: accentColor }} />
          <span style={{
            fontFamily: "'Courier New',monospace", fontSize: 8, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: accentColor,
            border: `1px solid ${accentColor}44`, padding: '2px 7px',
            background: `${accentColor}10`,
          }}>
            {item._category}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: "'Courier New',monospace", fontSize: 8, letterSpacing: '0.12em',
            padding: '2px 7px', border: `1px solid ${sentSty.border}`,
            background: sentSty.bg, color: sentSty.color, textTransform: 'uppercase',
          }}>
            {item._sentiment}
          </span>
          <span style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#444', letterSpacing: '0.08em' }}>
            {timeAgo(item.published_at)}
          </span>
        </div>
      </div>

      {/* Title */}
      <h2 style={{
        fontSize: 'clamp(16px,1.6vw,22px)', fontWeight: 700, lineHeight: 1.25,
        letterSpacing: '-0.025em', color: '#fff', margin: 0,
        fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",
      }}>
        {item.title}
        {hasLink && <span style={{ fontSize: 13, color: '#0047FF', marginLeft: 8, fontWeight: 400 }}>↗</span>}
      </h2>

      {/* Full description — no clamp */}
      {item.description && (
        <p style={{ fontSize: 14, color: '#888', lineHeight: 1.7, margin: 0 }}>
          {item.description}
        </p>
      )}

      {hasLink && (
        <div style={{ paddingTop: 4 }}>
          <span style={{
            fontFamily: "'Courier New',monospace", fontSize: 8, letterSpacing: '0.12em',
            color: '#0047FF', border: '1px solid rgba(0,71,255,0.3)', padding: '3px 10px',
            textTransform: 'uppercase',
          }}>
            READ FULL ARTICLE ↗
          </span>
        </div>
      )}
    </article>
  );
});

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonArticle() {
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.04)', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ width: 70, height: 12, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ width: 50, height: 12, background: 'rgba(255,255,255,0.04)' }} />
      </div>
      <div style={{ height: 24, background: 'rgba(255,255,255,0.07)', width: '75%' }} />
      <div style={{ height: 14, background: 'rgba(255,255,255,0.04)', width: '90%' }} />
      <div style={{ height: 14, background: 'rgba(255,255,255,0.03)', width: '70%' }} />
      <div style={{ height: 14, background: 'rgba(255,255,255,0.02)', width: '55%' }} />
    </div>
  );
}

// ─── Category description labels ──────────────────────────────────────────────

const CAT_DESCRIPTIONS = {
  'BREAKING':     'Breaking news and urgent market events',
  'MACRO':        'Wars, geopolitics, central banks, inflation, economic crises',
  'COMMODITIES':  'Oil, gold, silver, natural gas and commodity markets',
  'WHALE ALERT':  'Large on-chain transfers and wallet movements',
  'ON-CHAIN':     'Blockchain activity, smart contracts, protocol data',
  'MARKET':       'General crypto market news and analysis',
  'LISTINGS':     'Exchange listings, delistings, and announcements',
};

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function NewsCategoryPage() {
  const { category } = useParams();
  const categoryName = fromSlug(category);
  const accentColor  = categoryColor(categoryName);

  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [liveCount, setLiveCount] = useState(0);

  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch('/api/news/public?limit=100');
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items || []);
      setUpdatedAt(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }));
    } catch {
      // keep previous
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    setLoading(true);
    fetchNews();
    const iv = setInterval(fetchNews, REFRESH_INTERVAL);
    return () => clearInterval(iv);
  }, [fetchNews, category]);

  const enriched = useMemo(() =>
    items.map(item => ({
      ...item,
      _sentiment: detectSentiment(item.title, item.description),
      _category:  getCategory(item.source, item.title, item.description),
    })),
  [items]);

  const filtered = useMemo(() => {
    const result = enriched.filter(item => item._category === categoryName);
    setLiveCount(result.length);
    return result;
  }, [enriched, categoryName]);

  return (
    <div style={{
      background: '#060606', color: '#fff',
      fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",
      minHeight: '100vh',
    }}>
      <LandingHeader />

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .cat-article { animation: fadeSlideIn 260ms ease both; }
      `}</style>

      {/* ── Category Header ─────────────────────────────────────────────────── */}
      <div style={{
        borderBottom: `1px solid ${accentColor}22`,
        borderTop: '1px solid rgba(255,255,255,0.04)',
        background: `linear-gradient(180deg, ${accentColor}06 0%, transparent 100%)`,
        padding: '32px 0 28px',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 24px' }}>

          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <Link
              to="/news"
              style={{
                fontFamily: "'Courier New',monospace", fontSize: 9, color: '#555',
                letterSpacing: '0.14em', textTransform: 'uppercase', textDecoration: 'none',
                transition: 'color 150ms',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = '#0047FF'; }}
              onMouseLeave={e => { e.currentTarget.style.color = '#555'; }}
            >
              KADO INTELLIGENCE
            </Link>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: '#333' }}>/</span>
            <span style={{
              fontFamily: "'Courier New',monospace", fontSize: 9, color: accentColor,
              letterSpacing: '0.14em', textTransform: 'uppercase',
            }}>
              {categoryName}
            </span>
          </div>

          {/* Title + meta */}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <div style={{ width: 4, height: 28, background: accentColor }} />
                <h1 style={{
                  fontSize: 'clamp(22px,3vw,38px)', fontWeight: 900, letterSpacing: '-0.04em',
                  color: '#fff', margin: 0, fontFamily: "'Courier New',monospace",
                }}>
                  {categoryName}
                </h1>
              </div>
              {CAT_DESCRIPTIONS[categoryName] && (
                <p style={{ fontSize: 13, color: '#555', margin: '0 0 0 16px', letterSpacing: '0.02em' }}>
                  {CAT_DESCRIPTIONS[categoryName]}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: "'Courier New',monospace", fontSize: 22, fontWeight: 700, color: accentColor, lineHeight: 1 }}>
                  {liveCount}
                </div>
                <div style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#555', letterSpacing: '0.14em', marginTop: 3 }}>
                  ARTICLES
                </div>
              </div>
              {updatedAt && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: "'Courier New',monospace", fontSize: 9, color: '#444', letterSpacing: '0.1em' }}>
                    UPDATED {updatedAt}
                  </div>
                  <div style={{ fontFamily: "'Courier New',monospace", fontSize: 7, color: '#333', letterSpacing: '0.1em', marginTop: 3 }}>
                    AUTO-REFRESH 30s
                  </div>
                </div>
              )}
              <button
                onClick={fetchNews}
                style={{
                  fontFamily: "'Courier New',monospace", fontSize: 8, letterSpacing: '0.14em',
                  color: accentColor, border: `1px solid ${accentColor}44`,
                  background: 'transparent', padding: '5px 12px', cursor: 'pointer', textTransform: 'uppercase',
                }}
              >
                ↺ REFRESH
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Article List ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px 80px' }}>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {[0,1,2,3,4,5].map(i => <SkeletonArticle key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '100px 0', textAlign: 'center' }}>
            <div style={{ fontFamily: "'Courier New',monospace", fontSize: 11, color: '#333', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 20 }}>
              NO {categoryName} STORIES RIGHT NOW
            </div>
            <p style={{ fontSize: 13, color: '#555', marginBottom: 28 }}>
              The feed updates every 30 seconds. Check back shortly.
            </p>
            <Link
              to="/news"
              style={{
                fontFamily: "'Courier New',monospace", fontSize: 9, letterSpacing: '0.14em',
                color: '#0047FF', border: '1px solid rgba(0,71,255,0.3)',
                padding: '8px 20px', textTransform: 'uppercase', textDecoration: 'none',
                background: 'rgba(0,71,255,0.06)',
              }}
            >
              ← ALL INTELLIGENCE
            </Link>
          </div>
        ) : (
          <>
            {/* Top article — larger */}
            <div style={{ marginBottom: 1, background: `linear-gradient(135deg, ${accentColor}08 0%, transparent 60%)` }}>
              <ArticleCard item={filtered[0]} rank={0} />
            </div>

            {/* Rest — compact list */}
            {filtered.length > 1 && (
              <>
                <div style={{ padding: '10px 28px', borderTop: '1px solid rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: 10, background: '#060606', marginTop: 1 }}>
                  <span style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#555', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                    ALL {categoryName} STORIES
                  </span>
                  <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
                  <span style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#333', letterSpacing: '0.1em' }}>
                    {filtered.length - 1} MORE
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'rgba(255,255,255,0.03)' }}>
                  {filtered.slice(1).map((item, i) => (
                    <div key={item.id} className="cat-article" style={{ background: '#060606', animationDelay: `${i * 30}ms` }}>
                      <ArticleCard item={item} rank={i + 1} />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Footer row */}
            <div style={{ marginTop: 40, padding: '20px 0', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <Link
                to="/news"
                style={{
                  fontFamily: "'Courier New',monospace", fontSize: 9, letterSpacing: '0.14em',
                  color: '#555', textDecoration: 'none', textTransform: 'uppercase',
                  transition: 'color 150ms',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = '#0047FF'; }}
                onMouseLeave={e => { e.currentTarget.style.color = '#555'; }}
              >
                ← BACK TO ALL INTELLIGENCE
              </Link>
              <span style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#333', letterSpacing: '0.1em' }}>
                {filtered.length} ARTICLES · AUTO-REFRESH 30s
              </span>
            </div>
          </>
        )}
      </div>

      <LandingFooter />
    </div>
  );
}
