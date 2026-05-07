import React, { useState, useEffect, useCallback, useRef } from 'react';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';

const REFRESH_INTERVAL = 30_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function shortSource(source = '') {
  const s = source.replace('Telegram @', '').replace('Telegram:', '').trim();
  return s.length > 22 ? s.slice(0, 22) + '…' : s;
}

function detectSentiment(title, desc) {
  const text = (title + ' ' + (desc || '')).toLowerCase();
  const bearishKw = ['hack', 'exploit', 'stolen', 'crash', 'ban', 'scam', 'drop', 'dump', 'fear', 'warning', 'seized', 'investigation', 'fraud', 'loses', 'loss'];
  const bullishKw = ['partnership', 'launch', 'bullish', 'etf', 'adoption', 'milestone', 'record', 'surge', 'rally', 'accumulate', 'buy', 'breakout', 'upgrade', 'growth'];
  const bearishScore = bearishKw.filter(k => text.includes(k)).length;
  const bullishScore = bullishKw.filter(k => text.includes(k)).length;
  if (bearishScore > bullishScore) return 'BEARISH';
  if (bullishScore > bearishScore) return 'BULLISH';
  return 'NEUTRAL';
}

function getCategory(source = '') {
  const s = source.toLowerCase();
  if (s.includes('whale_alert') || s.includes('whale alert')) return 'WHALE ALERT';
  if (s.includes('lookonchain')) return 'ON-CHAIN';
  if (s.includes('announcement') || s.includes('listing') || s.includes('binance') || s.includes('coinbase') || s.includes('okx')) return 'LISTINGS';
  if (s.includes('breaking') || s.includes('urgent')) return 'BREAKING';
  return 'MARKET';
}

function sourceColorDot(source = '') {
  const s = source.toLowerCase();
  if (s.includes('whale')) return '#f59e0b';
  if (s.includes('coindesk') || s.includes('reuters')) return '#22c55e';
  if (s.includes('block')) return '#8b5cf6';
  if (s.startsWith('telegram') || s.includes('@')) return '#60a5fa';
  if (s.includes('lookonchain')) return '#06b6d4';
  return '#555';
}

function sentimentStyle(sent) {
  if (sent === 'BULLISH') return { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.25)' };
  if (sent === 'BEARISH') return { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',  border: 'rgba(239,68,68,0.25)' };
  return { color: '#666', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.1)' };
}

const CATEGORIES = ['ALL', 'BREAKING', 'WHALE ALERT', 'MARKET', 'ON-CHAIN', 'LISTINGS', 'OTHER'];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard({ height = 180 }) {
  return (
    <div style={{
      height,
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.04)',
      padding: 20,
    }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <div style={{ width: 60, height: 12, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ width: 40, height: 12, background: 'rgba(255,255,255,0.04)' }} />
      </div>
      <div style={{ height: 20, background: 'rgba(255,255,255,0.06)', marginBottom: 10, width: '80%' }} />
      <div style={{ height: 14, background: 'rgba(255,255,255,0.04)', marginBottom: 6, width: '65%' }} />
      <div style={{ height: 14, background: 'rgba(255,255,255,0.03)', width: '45%' }} />
    </div>
  );
}

// ─── Featured Card ─────────────────────────────────────────────────────────────

function FeaturedCard({ item }) {
  const [hovered, setHovered] = useState(false);
  if (!item) return null;
  const sent = detectSentiment(item.title, item.description);
  const sentSty = sentimentStyle(sent);
  const hasLink = item.link && item.link.startsWith('http');

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.06)'}`,
        background: hovered ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.01)',
        padding: '28px 28px 24px',
        transition: 'border-color 180ms, background 180ms',
        cursor: hasLink ? 'pointer' : 'default',
      }}
      onClick={() => hasLink && window.open(item.link, '_blank', 'noopener')}
    >
      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: "'Courier New',monospace",
            fontSize: 9,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#0047FF',
            border: '1px solid rgba(0,71,255,0.35)',
            padding: '2px 8px',
            background: 'rgba(0,71,255,0.08)',
          }}>
            {getCategory(item.source)}
          </span>
          <span style={{
            fontFamily: "'Courier New',monospace",
            fontSize: 9,
            letterSpacing: '0.12em',
            color: '#555',
          }}>
            {shortSource(item.source)}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: "'Courier New',monospace",
            fontSize: 9,
            letterSpacing: '0.12em',
            padding: '2px 8px',
            border: `1px solid ${sentSty.border}`,
            background: sentSty.bg,
            color: sentSty.color,
            textTransform: 'uppercase',
          }}>
            {sent}
          </span>
          <span style={{ fontFamily: "'Courier New',monospace", fontSize: 9, color: '#444', letterSpacing: '0.08em' }}>
            {timeAgo(item.published_at)}
          </span>
        </div>
      </div>

      {/* Headline */}
      <h2 style={{
        fontSize: 'clamp(20px,2.2vw,32px)',
        fontWeight: 700,
        lineHeight: 1.18,
        letterSpacing: '-0.035em',
        color: '#fff',
        margin: '0 0 14px 0',
        fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",
      }}>
        {item.title}
        {hasLink && <span style={{ fontSize: 14, color: '#0047FF', marginLeft: 8, fontWeight: 400 }}>↗</span>}
      </h2>

      {/* Excerpt */}
      {item.description && (
        <p style={{
          fontSize: 14,
          color: '#888',
          lineHeight: 1.65,
          margin: '0 0 20px 0',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {item.description}
        </p>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: sourceColorDot(item.source), flexShrink: 0 }} />
          <span style={{ fontFamily: "'Courier New',monospace", fontSize: 9, color: '#555', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {shortSource(item.source)}
          </span>
        </div>
        {hasLink && (
          <span style={{
            fontFamily: "'Courier New',monospace",
            fontSize: 9,
            letterSpacing: '0.12em',
            color: '#0047FF',
            border: '1px solid rgba(0,71,255,0.3)',
            padding: '3px 10px',
            textTransform: 'uppercase',
          }}>
            READ ↗
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Secondary Card ────────────────────────────────────────────────────────────

function SecondaryCard({ item }) {
  const [hovered, setHovered] = useState(false);
  if (!item) return null;
  const sent = detectSentiment(item.title, item.description);
  const sentSty = sentimentStyle(sent);
  const hasLink = item.link && item.link.startsWith('http');

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'}`,
        background: hovered ? 'rgba(255,255,255,0.022)' : 'transparent',
        padding: '18px 20px 16px',
        transition: 'border-color 180ms, background 180ms',
        cursor: hasLink ? 'pointer' : 'default',
        height: '100%',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
      }}
      onClick={() => hasLink && window.open(item.link, '_blank', 'noopener')}
    >
      {/* Meta */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 6 }}>
        <span style={{
          fontFamily: "'Courier New',monospace",
          fontSize: 8,
          letterSpacing: '0.12em',
          color: '#0047FF',
          border: '1px solid rgba(0,71,255,0.25)',
          padding: '2px 6px',
          background: 'rgba(0,71,255,0.06)',
          textTransform: 'uppercase',
          flexShrink: 0,
        }}>
          {getCategory(item.source)}
        </span>
        <span style={{
          fontFamily: "'Courier New',monospace",
          fontSize: 8,
          padding: '2px 6px',
          border: `1px solid ${sentSty.border}`,
          background: sentSty.bg,
          color: sentSty.color,
          textTransform: 'uppercase',
          flexShrink: 0,
        }}>
          {sent}
        </span>
      </div>

      {/* Title */}
      <p style={{
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1.4,
        letterSpacing: '-0.02em',
        color: '#e5e5e5',
        margin: '0 0 10px 0',
        flex: 1,
        display: '-webkit-box',
        WebkitLineClamp: 3,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {item.title}
        {hasLink && <span style={{ fontSize: 10, color: '#0047FF', marginLeft: 4 }}>↗</span>}
      </p>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto' }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: sourceColorDot(item.source), flexShrink: 0 }} />
        <span style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#555', letterSpacing: '0.08em', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {shortSource(item.source)}
        </span>
        <span style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#444', letterSpacing: '0.06em', flexShrink: 0 }}>
          {timeAgo(item.published_at)}
        </span>
      </div>
    </div>
  );
}

// ─── Quick Feed Item ──────────────────────────────────────────────────────────

function QuickFeedItem({ item, index }) {
  const [hovered, setHovered] = useState(false);
  const sent = detectSentiment(item.title, item.description);
  const sentSty = sentimentStyle(sent);
  const hasLink = item.link && item.link.startsWith('http');

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '12px 0',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        cursor: hasLink ? 'pointer' : 'default',
        transition: 'opacity 150ms',
        opacity: hovered ? 1 : 0.85,
      }}
      onClick={() => hasLink && window.open(item.link, '_blank', 'noopener')}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        {/* Index number */}
        <span style={{
          fontFamily: "'Courier New',monospace",
          fontSize: 9,
          color: '#333',
          letterSpacing: '0.05em',
          flexShrink: 0,
          paddingTop: 2,
          width: 16,
          textAlign: 'right',
        }}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{
            fontSize: 11,
            fontWeight: 500,
            lineHeight: 1.45,
            color: hovered ? '#fff' : '#ccc',
            margin: '0 0 5px 0',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            transition: 'color 150ms',
          }}>
            {item.title}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: sourceColorDot(item.source), flexShrink: 0 }} />
            <span style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#444', letterSpacing: '0.06em' }}>
              {timeAgo(item.published_at)}
            </span>
            <span style={{
              fontFamily: "'Courier New',monospace",
              fontSize: 7,
              padding: '1px 5px',
              border: `1px solid ${sentSty.border}`,
              color: sentSty.color,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}>
              {sent}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function NewsPage() {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [lastFetch, setLastFetch] = useState(null);
  const [elapsed, setElapsed]     = useState(0);
  const [filter, setFilter]       = useState('ALL');
  const [isMock, setIsMock]       = useState(false);
  const [now, setNow]             = useState(new Date());
  const tickerRef                 = useRef(null);

  // ── Data fetching (identical to original) ────────────────────────────────
  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch('/api/news/public?limit=50');
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items || []);
      setIsMock(data.mock || false);
      setLastFetch(Date.now());
      setElapsed(0);
    } catch {
      // keep previous items
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchNews();
    const interval = setInterval(fetchNews, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchNews]);

  useEffect(() => {
    if (!lastFetch) return;
    const tick = setInterval(() => {
      setElapsed(Math.floor((Date.now() - lastFetch) / 1000));
    }, 1000);
    return () => clearInterval(tick);
  }, [lastFetch]);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(tick);
  }, []);

  // ── Filtering ────────────────────────────────────────────────────────────
  const filtered = items.filter(item => {
    if (filter === 'ALL') return true;
    const cat = getCategory(item.source);
    if (filter === 'OTHER') return !['WHALE ALERT', 'ON-CHAIN', 'LISTINGS', 'BREAKING', 'MARKET'].includes(cat) || cat === 'MARKET' && !item.source;
    return cat === filter;
  });

  const displayItems = filtered.length > 0 ? filtered : items;
  const featured     = displayItems[0] || null;
  const secondary    = displayItems.slice(1, 5);
  const quickFeed    = displayItems.slice(5, 25);

  // ── Date/time formatting ─────────────────────────────────────────────────
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const nextRefresh = lastFetch ? Math.max(0, 30 - elapsed) : 30;

  return (
    <div style={{
      background: '#060606',
      color: '#fff',
      fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif",
      minHeight: '100vh',
    }}>
      <LandingHeader />

      <style>{`
        @keyframes pulseGreen {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.3; transform: scale(1.9); }
        }
        @keyframes marqueeScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes fadein {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .news-grid-secondary {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          background: rgba(255,255,255,0.04);
        }
        .news-grid-secondary > * {
          background: #060606;
        }
        @media (max-width: 768px) {
          .news-main-layout { flex-direction: column !important; }
          .news-right-col   { display: none !important; }
          .news-ticker-strip { display: none !important; }
          .news-grid-secondary { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ── Intelligence Header Bar ─────────────────────────────────────────── */}
      <div style={{
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        padding: '10px 0',
        marginTop: 0,
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          {/* Left: brand + live dot */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{
                fontFamily: "'Courier New',monospace",
                fontSize: 11,
                letterSpacing: '0.18em',
                color: '#fff',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}>
                KADO INTELLIGENCE
              </span>
              <span style={{ fontFamily: "'Courier New',monospace", fontSize: 9, color: '#444', letterSpacing: '0.1em' }}>
                ·
              </span>
              <span style={{
                fontFamily: "'Courier New',monospace",
                fontSize: 8,
                letterSpacing: '0.12em',
                color: '#0047FF',
                border: '1px solid rgba(0,71,255,0.3)',
                padding: '2px 7px',
                background: 'rgba(0,71,255,0.06)',
                textTransform: 'uppercase',
              }}>
                CRYPTO MARKETS
              </span>
            </div>

            {/* Live pulsing indicator */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ position: 'relative', width: 7, height: 7 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
                <div style={{
                  position: 'absolute', inset: -3,
                  borderRadius: '50%',
                  border: '1px solid rgba(34,197,94,0.45)',
                  animation: 'pulseGreen 2s ease-in-out infinite',
                }} />
              </div>
              <span style={{ fontFamily: "'Courier New',monospace", fontSize: 9, color: '#22c55e', letterSpacing: '0.2em' }}>
                LIVE
              </span>
              {isMock && (
                <span style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#444', letterSpacing: '0.1em' }}>
                  · DEMO
                </span>
              )}
            </div>
          </div>

          {/* Right: date + refresh timer */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <span style={{ fontFamily: "'Courier New',monospace", fontSize: 9, color: '#555', letterSpacing: '0.1em' }}>
              {dateStr}
            </span>
            <span style={{ fontFamily: "'Courier New',monospace", fontSize: 10, color: '#666', letterSpacing: '0.08em' }}>
              {timeStr}
            </span>
            <span style={{ fontFamily: "'Courier New',monospace", fontSize: 9, color: '#333', letterSpacing: '0.08em' }}>
              REFRESH IN {nextRefresh}s
            </span>
            <button
              onClick={fetchNews}
              style={{
                fontFamily: "'Courier New',monospace",
                fontSize: 8,
                letterSpacing: '0.14em',
                color: '#0047FF',
                border: '1px solid rgba(0,71,255,0.3)',
                background: 'transparent',
                padding: '3px 10px',
                cursor: 'pointer',
                textTransform: 'uppercase',
              }}
            >
              ↺ REFRESH
            </button>
          </div>
        </div>
      </div>

      {/* ── Ticker Marquee ──────────────────────────────────────────────────── */}
      <div
        className="news-ticker-strip"
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.04)',
          padding: '7px 0',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          background: 'rgba(0,71,255,0.025)',
        }}
      >
        {items.length > 0 && (
          <div ref={tickerRef} style={{ display: 'inline-block', animation: 'marqueeScroll 90s linear infinite' }}>
            {/* doubled for seamless loop */}
            {[...items.slice(0, 20), ...items.slice(0, 20)].map((item, i) => (
              <span key={i} style={{ fontFamily: "'Courier New',monospace", fontSize: 10, color: '#555', letterSpacing: '0.06em' }}>
                <span style={{ color: '#0047FF', marginRight: 6 }}>◆</span>
                <span style={{ color: '#888', marginRight: 6 }}>
                  [{getCategory(item.source)}]
                </span>
                {item.title}
                <span style={{ color: '#2a2a2a', margin: '0 28px' }}>·</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Category Filter Bar ─────────────────────────────────────────────── */}
      <div style={{
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        padding: '12px 0',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px', display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          {CATEGORIES.map((cat, i) => (
            <React.Fragment key={cat}>
              <button
                onClick={() => setFilter(cat)}
                style={{
                  fontFamily: "'Courier New',monospace",
                  fontSize: 9,
                  letterSpacing: '0.14em',
                  padding: '5px 14px',
                  border: 'none',
                  background: filter === cat ? '#0047FF' : 'transparent',
                  color: filter === cat ? '#fff' : '#555',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  transition: 'background 140ms, color 140ms',
                }}
              >
                {cat}
              </button>
              {i < CATEGORIES.length - 1 && (
                <span style={{ color: '#222', fontFamily: 'monospace', fontSize: 10, padding: '0 2px' }}>|</span>
              )}
            </React.Fragment>
          ))}
          <span style={{
            fontFamily: "'Courier New',monospace",
            fontSize: 9,
            color: '#333',
            letterSpacing: '0.1em',
            marginLeft: 'auto',
          }}>
            {filtered.length > 0 ? filtered.length : items.length} ITEMS
          </span>
        </div>
      </div>

      {/* ── Main Content ────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 24px 80px' }}>

        {loading ? (
          /* Loading skeletons */
          <div style={{ display: 'flex', gap: 1, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ flex: 2, background: '#060606', padding: 1, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <SkeletonCard height={300} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(255,255,255,0.04)' }}>
                {[0,1,2,3].map(i => <div key={i} style={{ background: '#060606' }}><SkeletonCard height={180} /></div>)}
              </div>
            </div>
            <div style={{ flex: 1, background: '#060606', display: 'flex', flexDirection: 'column', gap: 12, padding: 20 }}>
              {[0,1,2,3,4,5,6,7].map(i => <SkeletonCard key={i} height={60} />)}
            </div>
          </div>
        ) : displayItems.length === 0 ? (
          <div style={{ padding: '80px 0', textAlign: 'center', fontFamily: "'Courier New',monospace", fontSize: 11, color: '#333', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            NO ITEMS FOR THIS FILTER
          </div>
        ) : (
          /* ── 3-col layout ─────────────────────────────────────────────── */
          <div
            className="news-main-layout"
            style={{ display: 'flex', gap: 1, background: 'rgba(255,255,255,0.04)', animation: 'fadein 300ms ease-out' }}
          >
            {/* Left: featured + secondary grid (2/3 width) */}
            <div style={{ flex: 2, background: '#060606', display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>

              {/* Section label */}
              <div style={{
                padding: '8px 28px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#0047FF', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                  TOP STORY
                </span>
                <div style={{ flex: 1, height: 1, background: 'rgba(0,71,255,0.15)' }} />
              </div>

              {/* Featured */}
              <FeaturedCard item={featured} />

              {/* Divider label */}
              <div style={{
                padding: '8px 28px',
                borderTop: '1px solid rgba(255,255,255,0.04)',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <span style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#555', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                  LATEST INTELLIGENCE
                </span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.05)' }} />
              </div>

              {/* Secondary 2x2 grid */}
              <div className="news-grid-secondary" style={{ flex: 1 }}>
                {secondary.length > 0
                  ? secondary.map(item => (
                      <div key={item.id} style={{ background: '#060606' }}>
                        <SecondaryCard item={item} />
                      </div>
                    ))
                  : [0,1,2,3].map(i => (
                      <div key={i} style={{ background: '#060606' }}>
                        <SkeletonCard height={160} />
                      </div>
                    ))
                }
              </div>
            </div>

            {/* Right: quick feed + signals (1/3 width) */}
            <div
              className="news-right-col"
              style={{ flex: 1, background: '#060606', display: 'flex', flexDirection: 'column', minWidth: 0, borderLeft: '1px solid rgba(255,255,255,0.04)' }}
            >
              {/* Quick feed header */}
              <div style={{
                padding: '8px 18px',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <span style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#fff', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                  QUICK FEED
                </span>
                <span style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#333', letterSpacing: '0.1em' }}>
                  {quickFeed.length} ITEMS
                </span>
              </div>

              {/* Quick feed list */}
              <div style={{ flex: 1, padding: '4px 18px', overflowY: 'auto', maxHeight: 520 }}>
                {quickFeed.map((item, i) => (
                  <QuickFeedItem key={item.id} item={item} index={i} />
                ))}
              </div>

              {/* Market Signals section */}
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{
                  padding: '8px 18px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}>
                  <span style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#fff', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
                    MARKET SIGNALS
                  </span>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22c55e' }} />
                </div>
                <div style={{ padding: '10px 18px 18px' }}>
                  {/* Derive signals from sentiment of recent items */}
                  {displayItems.slice(0, 8).filter(item => {
                    const s = detectSentiment(item.title, item.description);
                    return s !== 'NEUTRAL';
                  }).slice(0, 3).map((item, i) => {
                    const sent = detectSentiment(item.title, item.description);
                    const sentSty = sentimentStyle(sent);
                    return (
                      <div key={item.id} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 0',
                        borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{
                            fontSize: 10,
                            color: '#aaa',
                            margin: '0 0 3px 0',
                            display: '-webkit-box',
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            letterSpacing: '-0.01em',
                          }}>
                            {item.title.slice(0, 42)}{item.title.length > 42 ? '…' : ''}
                          </p>
                          <span style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#444', letterSpacing: '0.06em' }}>
                            {timeAgo(item.published_at)}
                          </span>
                        </div>
                        <span style={{
                          fontFamily: "'Courier New',monospace",
                          fontSize: 8,
                          letterSpacing: '0.14em',
                          color: sentSty.color,
                          border: `1px solid ${sentSty.border}`,
                          background: sentSty.bg,
                          padding: '2px 7px',
                          flexShrink: 0,
                          marginLeft: 8,
                          textTransform: 'uppercase',
                        }}>
                          {sent === 'BULLISH' ? '▲ BULL' : '▼ BEAR'}
                        </span>
                      </div>
                    );
                  })}
                  {displayItems.slice(0, 8).filter(item => detectSentiment(item.title, item.description) !== 'NEUTRAL').length === 0 && (
                    <p style={{ fontFamily: "'Courier New',monospace", fontSize: 9, color: '#333', letterSpacing: '0.1em', textAlign: 'center', padding: '12px 0' }}>
                      NO SIGNALS DETECTED
                    </p>
                  )}
                </div>
              </div>

              {/* Stats footer */}
              <div style={{
                borderTop: '1px solid rgba(255,255,255,0.05)',
                padding: '10px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#333', letterSpacing: '0.1em' }}>
                  {items.length} ITEMS LOADED
                </span>
                <span style={{
                  fontFamily: "'Courier New',monospace",
                  fontSize: 8,
                  color: '#0047FF',
                  letterSpacing: '0.1em',
                  border: '1px solid rgba(0,71,255,0.2)',
                  padding: '2px 7px',
                  background: 'rgba(0,71,255,0.04)',
                }}>
                  AI PROCESSED
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── All Items Overflow (below the grid) ──────────────────────────── */}
        {!loading && displayItems.length > 25 && (
          <div style={{ marginTop: 1, background: 'rgba(255,255,255,0.04)', padding: 1 }}>
            <div style={{ background: '#060606', padding: '8px 28px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: "'Courier New',monospace", fontSize: 8, color: '#555', letterSpacing: '0.2em' }}>
                MORE INTELLIGENCE
              </span>
              <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 1, background: 'rgba(255,255,255,0.04)' }}>
              {displayItems.slice(25).map(item => (
                <div key={item.id} style={{ background: '#060606' }}>
                  <SecondaryCard item={item} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <div style={{ paddingTop: 80, paddingBottom: 40, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', marginTop: 48 }}>
          <span style={{
            fontFamily: "'Courier New',monospace",
            fontSize: 9,
            color: '#0047FF',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            display: 'block',
            marginBottom: 18,
          }}>
            KADO AI ENGINE
          </span>
          <p style={{ fontSize: 15, color: '#666', marginBottom: 10, lineHeight: 1.6 }}>
            Our AI analyzes this feed 24/7 and executes trades in under 100ms.
          </p>
          <p style={{ fontFamily: "'Courier New',monospace", fontSize: 10, color: '#444', letterSpacing: '0.08em', marginBottom: 32 }}>
            Real-time news processed by AI signal engine · {items.length} items loaded
          </p>
          <a
            href="/auth?mode=register"
            style={{
              display: 'inline-block',
              padding: '12px 32px',
              background: '#0047FF',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              textDecoration: 'none',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontFamily: "'Courier New',monospace",
              border: '1px solid rgba(0,71,255,0.6)',
              transition: 'background 150ms',
            }}
          >
            GET STARTED ↗
          </a>
        </div>
      </div>

      <LandingFooter />
    </div>
  );
}
