import React, { useState, useEffect, useCallback } from 'react';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';

const REFRESH_INTERVAL = 30_000;

const SOURCE_COLORS = {
  coindesk:  { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  text: '#22c55e' },
  reuters:   { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  text: '#22c55e' },
  theblock:  { bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.25)',  text: '#22c55e' },
  telegram:  { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', text: '#60a5fa' },
  newsapi:   { bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.25)', text: '#c084fc' },
  default:   { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)', text: '#888' },
};

function sourceColor(source = '') {
  const s = source.toLowerCase();
  if (s.startsWith('telegram')) return SOURCE_COLORS.telegram;
  if (s.includes('coindesk'))  return SOURCE_COLORS.coindesk;
  if (s.includes('reuters'))   return SOURCE_COLORS.reuters;
  if (s.includes('block'))     return SOURCE_COLORS.theblock;
  if (s.includes('newsapi'))   return SOURCE_COLORS.newsapi;
  return SOURCE_COLORS.default;
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)   return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function shortSource(source = '') {
  if (source.startsWith('Telegram:')) return source.replace('Telegram:', 'TG:');
  return source;
}

function SkeletonRow() {
  return (
    <div style={{ padding: '20px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <div style={{ width: 70, height: 18, background: 'rgba(255,255,255,0.06)', borderRadius: 100, flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ height: 16, background: 'rgba(255,255,255,0.06)', borderRadius: 4, marginBottom: 8, width: '75%' }} />
          <div style={{ height: 13, background: 'rgba(255,255,255,0.04)', borderRadius: 4, width: '50%' }} />
        </div>
      </div>
    </div>
  );
}

function NewsItem({ item }) {
  const col = sourceColor(item.source);
  const ago = timeAgo(item.published_at);
  const src = shortSource(item.source);
  const hasLink = item.link && item.link.startsWith('http');

  return (
    <div style={{ padding: '18px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
        {/* Source + time */}
        <div style={{ flexShrink: 0, width: 90, paddingTop: 1 }}>
          <div style={{
            display: 'inline-block',
            background: col.bg,
            border: `1px solid ${col.border}`,
            borderRadius: 100,
            padding: '2px 8px',
            fontSize: 10,
            color: col.text,
            letterSpacing: '0.05em',
            marginBottom: 5,
            maxWidth: 90,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>{src}</div>
          <div style={{ fontFamily: "'Courier New',monospace", fontSize: 10, color: '#444', letterSpacing: '0.02em' }}>{ago}</div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {hasLink ? (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none', color: '#fff' }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, marginBottom: 5, letterSpacing: '-0.01em' }}
                onMouseEnter={e => e.currentTarget.style.textDecoration = 'underline'}
                onMouseLeave={e => e.currentTarget.style.textDecoration = 'none'}
              >
                {item.title} <span style={{ fontSize: 11, color: '#555', marginLeft: 4 }}>↗</span>
              </div>
            </a>
          ) : (
            <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.4, marginBottom: 5, color: '#fff', letterSpacing: '-0.01em' }}>
              {item.title}
            </div>
          )}
          {item.description && (
            <div style={{
              fontSize: 12,
              color: '#666',
              lineHeight: 1.5,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}>
              {item.description}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const FILTERS = ['ALL', 'TELEGRAM', 'COINDESK', 'NEWSAPI', 'OTHER'];

export default function NewsPage() {
  const [items, setItems]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [lastFetch, setLastFetch] = useState(null);
  const [elapsed, setElapsed]   = useState(0);
  const [filter, setFilter]     = useState('ALL');
  const [isMock, setIsMock]     = useState(false);

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

  const filtered = items.filter(item => {
    if (filter === 'ALL') return true;
    const s = (item.source || '').toLowerCase();
    if (filter === 'TELEGRAM') return s.startsWith('telegram');
    if (filter === 'COINDESK') return s.includes('coindesk') || s.includes('reuters') || s.includes('block');
    if (filter === 'NEWSAPI')  return item.from_newsapi === 1;
    if (filter === 'OTHER')    return !s.startsWith('telegram') && !s.includes('coindesk') && !s.includes('reuters') && !s.includes('block') && item.from_newsapi !== 1;
    return true;
  });

  return (
    <div style={{ background: '#060606', color: '#fff', fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif", minHeight: '100vh' }}>
      <LandingHeader />

      <div style={{ maxWidth: 1100, margin: '0 auto' }} className="px-5 md:px-14">

        {/* Hero */}
        <div style={{ paddingTop: 80, paddingBottom: 48 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16, marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Pulsing dot */}
              <div style={{ position: 'relative', width: 8, height: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                <div style={{
                  position: 'absolute', inset: -3,
                  borderRadius: '50%',
                  border: '1px solid rgba(34,197,94,0.4)',
                  animation: 'pulse 2s infinite',
                }} />
              </div>
              <span style={{ fontFamily: "'Courier New',monospace", fontSize: 11, color: '#22c55e', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
                Live Feed
              </span>
              {isMock && (
                <span style={{ fontFamily: "'Courier New',monospace", fontSize: 10, color: '#555', letterSpacing: '0.08em' }}>
                  · demo data
                </span>
              )}
            </div>
            {lastFetch && (
              <span style={{ fontFamily: "'Courier New',monospace", fontSize: 10, color: '#444', letterSpacing: '0.06em' }}>
                Updated {elapsed}s ago · refreshes every 30s
              </span>
            )}
          </div>

          <h1 style={{ fontSize: 'clamp(28px,3.5vw,44px)', fontWeight: 700, letterSpacing: '-0.04em', margin: '0 0 12px 0', lineHeight: 1.0 }}>
            CRYPTO INTELLIGENCE FEED
          </h1>
          <p style={{ fontSize: 14, color: '#666', maxWidth: 440, lineHeight: 1.6, margin: 0 }}>
            Real-time news processed by AI signal engine · {items.length} items loaded
          </p>
        </div>

        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                fontFamily: "'Courier New',monospace",
                fontSize: 10,
                letterSpacing: '0.12em',
                padding: '5px 14px',
                borderRadius: 100,
                border: filter === f ? '1px solid rgba(255,255,255,0.3)' : '1px solid rgba(255,255,255,0.08)',
                background: filter === f ? 'rgba(255,255,255,0.08)' : 'transparent',
                color: filter === f ? '#fff' : '#555',
                cursor: 'pointer',
                transition: 'all 150ms',
                textTransform: 'uppercase',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Feed */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', minHeight: 400 }}>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
          ) : filtered.length === 0 ? (
            <div style={{ padding: '60px 0', textAlign: 'center', fontFamily: "'Courier New',monospace", fontSize: 11, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              No items for this filter
            </div>
          ) : (
            filtered.map(item => <NewsItem key={item.id} item={item} />)
          )}
        </div>

        {/* CTA */}
        <div style={{ paddingTop: 72, paddingBottom: 100, textAlign: 'center' }}>
          <p style={{ fontSize: 15, color: '#666', marginBottom: 24 }}>
            Our AI analyzes this feed 24/7 and executes trades in under 100ms.
          </p>
          <a href="/waitlist" style={{
            display: 'inline-block', padding: '13px 32px', borderRadius: 100,
            background: '#fff', color: '#000', fontSize: 13, fontWeight: 600,
            textDecoration: 'none', letterSpacing: '0.01em',
          }}>
            Join Waitlist →
          </a>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 0; transform: scale(1.8); }
        }
      `}</style>

      <LandingFooter />
    </div>
  );
}
