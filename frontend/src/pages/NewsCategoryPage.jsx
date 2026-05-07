import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';

const MONO = "'Courier New','SF Mono',monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',sans-serif";

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function getCategory(source = '', title = '', description = '') {
  const s    = source.toLowerCase();
  const text = (title + ' ' + (description || '')).toLowerCase();

  if (s.includes('whale_alert') || s.includes('lookonchain')) return 'ON-CHAIN';
  if (s.includes('announcement') || s.includes('listing'))    return 'LISTINGS';

  const geoKw = ['war ', 'warfare', 'military', 'sanctions', 'geopolit', 'nato', 'conflict',
    'ukraine', 'russia', 'missile', 'troops', 'attack', 'invasion', 'treaty', 'coup', 'airstrike'];
  if (geoKw.some(k => text.includes(k))) return 'GEOPOLITICS';

  const macroKw = ['inflation', 'recession', 'federal reserve', ' fed ', 'interest rate',
    ' cpi ', ' gdp ', 'treasury', 'central bank', 'tariff', 'fiscal', 'monetary policy', 'rate hike', 'rate cut'];
  if (macroKw.some(k => text.includes(k))) return 'MACRO';

  const commKw = ['crude oil', 'wti ', 'brent', 'gold price', 'silver price', ' oil price',
    'per barrel', 'opec', 'commodit', 'natural gas', ' lng ', 'copper', 'nickel', 'precious metal'];
  if (commKw.some(k => text.includes(k))) return 'COMMODITIES';

  const marketKw = ['stock market', 's&p', 'nasdaq', 'dow jones', 'wall street', 'earnings', 'equity'];
  if (marketKw.some(k => text.includes(k))) return 'MARKETS';

  const chainKw = ['on-chain', 'blockchain', 'whale', 'defi', 'protocol', 'smart contract', 'tvl'];
  if (chainKw.some(k => text.includes(k))) return 'ON-CHAIN';

  if (s.includes('binance') || s.includes('bybit') || s.includes('coinbase') || s.includes('okx'))
    return 'LISTINGS';

  return 'CRYPTO';
}

const CATEGORY_META = {
  'ALL':         { label: 'All Stories',  desc: 'The latest across all markets and topics.' },
  'CRYPTO':      { label: 'Crypto',       desc: 'Bitcoin, Ethereum, altcoins and digital asset markets.' },
  'MACRO':       { label: 'Macro',        desc: 'Central banks, inflation, GDP, interest rates and monetary policy.' },
  'GEOPOLITICS': { label: 'Geopolitics',  desc: 'Wars, conflicts, sanctions and their impact on global markets.' },
  'COMMODITIES': { label: 'Commodities',  desc: 'Gold, silver, crude oil, energy and raw materials.' },
  'MARKETS':     { label: 'Markets',      desc: 'Equities, indices, earnings and traditional finance.' },
  'ON-CHAIN':    { label: 'On-Chain',     desc: 'Whale moves, DeFi, blockchain analytics and smart contracts.' },
  'LISTINGS':    { label: 'Listings',     desc: 'New exchange listings and project launches.' },
};

function fromSlug(slug = '') {
  const map = {
    'all': 'ALL', 'crypto': 'CRYPTO', 'macro': 'MACRO',
    'geopolitics': 'GEOPOLITICS', 'commodities': 'COMMODITIES',
    'markets': 'MARKETS', 'on-chain': 'ON-CHAIN', 'listings': 'LISTINGS',
    'whale-alert': 'ON-CHAIN',
  };
  return map[slug.toLowerCase()] || slug.toUpperCase();
}

const ArticleCard = React.memo(function ArticleCard({ item, index }) {
  const hasLink = item.link?.startsWith('http');
  const isLead  = index === 0;

  return (
    <article
      onClick={() => hasLink && window.open(item.link, '_blank', 'noopener')}
      style={{
        padding: isLead ? '28px 0 24px' : '20px 0',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        cursor: hasLink ? 'pointer' : 'default',
      }}
      onMouseEnter={e => { e.currentTarget.querySelector('.art-hl').style.opacity = hasLink ? '0.7' : '1'; }}
      onMouseLeave={e => { e.currentTarget.querySelector('.art-hl').style.opacity = '1'; }}
    >
      <div style={{ marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#0047FF' }}>
          {item._category}
        </span>
      </div>

      <h2 className="art-hl" style={{
        fontFamily: SANS,
        fontSize: isLead ? 'clamp(20px, 2.5vw, 32px)' : 16,
        fontWeight: isLead ? 700 : 600,
        lineHeight: isLead ? 1.12 : 1.35,
        letterSpacing: isLead ? '-0.04em' : '-0.02em',
        color: '#f5f5f5', margin: '0 0 10px 0',
        transition: 'opacity 180ms',
      }}>
        {item.title}
      </h2>

      {item.description && (
        <p style={{
          fontFamily: SANS, fontSize: isLead ? 14 : 13, color: '#666', lineHeight: 1.65,
          margin: '0 0 12px 0',
          display: '-webkit-box', WebkitLineClamp: isLead ? 4 : 2,
          WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {item.description}
        </p>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ fontFamily: MONO, fontSize: 8, color: '#3a3a3a', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {item.source}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 8, color: '#252525' }}>·</span>
        <span style={{ fontFamily: MONO, fontSize: 8, color: '#3a3a3a' }}>{timeAgo(item.published_at)}</span>
        {hasLink && <span style={{ fontFamily: MONO, fontSize: 8, color: '#0047FF', letterSpacing: '0.1em' }}>↗</span>}
      </div>
    </article>
  );
});

export default function NewsCategoryPage() {
  const { category: slug } = useParams();
  const catId = fromSlug(slug || '');
  const meta  = CATEGORY_META[catId] || { label: catId, desc: '' };

  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);

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
    const iv = setInterval(fetchNews, 30_000);
    return () => clearInterval(iv);
  }, [fetchNews, slug]);

  const enriched = useMemo(() =>
    items.map(item => ({ ...item, _category: getCategory(item.source, item.title, item.description) })),
  [items]);

  const filtered = useMemo(() =>
    catId === 'ALL' ? enriched : enriched.filter(i => i._category === catId),
  [enriched, catId]);

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ background: '#060606', color: '#f5f5f5', fontFamily: SANS, minHeight: '100vh' }}>
      <LandingHeader />

      {/* Header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '11px 0' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Link to="/news" style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', fontWeight: 700, color: '#fff', textDecoration: 'none' }}>
              KADO INTELLIGENCE
            </Link>
            <span style={{ fontFamily: MONO, fontSize: 9, color: '#333' }}>·</span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: '#444', letterSpacing: '0.06em' }}>{dateStr}</span>
          </div>
          {updatedAt && (
            <span style={{ fontFamily: MONO, fontSize: 8, color: '#333', letterSpacing: '0.1em' }}>UPDATED {updatedAt}</span>
          )}
        </div>
      </div>

      {/* Category title */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', padding: '32px 0 24px' }}>
        <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 28px' }}>
          <div style={{ marginBottom: 12 }}>
            <Link to="/news" style={{ fontFamily: MONO, fontSize: 9, color: '#444', letterSpacing: '0.14em', textDecoration: 'none', textTransform: 'uppercase' }}>
              ← All stories
            </Link>
          </div>
          <h1 style={{ fontFamily: SANS, fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 700, letterSpacing: '-0.04em', margin: '0 0 10px 0', color: '#f5f5f5' }}>
            {meta.label}
          </h1>
          {meta.desc && (
            <p style={{ fontFamily: SANS, fontSize: 14, color: '#555', margin: 0, lineHeight: 1.6, maxWidth: 500 }}>
              {meta.desc}
            </p>
          )}
          <div style={{ marginTop: 16, fontFamily: MONO, fontSize: 8, color: '#2a2a2a', letterSpacing: '0.12em' }}>
            {filtered.length} STORIES · LIVE UPDATE 30s
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1240, margin: '0 auto', padding: '0 28px 80px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,300px)', gap: '0 60px' }}>

          <div>
            {loading ? (
              <div style={{ paddingTop: 40 }}>
                {[0,1,2,3].map(i => (
                  <div key={i} style={{ padding: '20px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div style={{ width: 60, height: 9, background: 'rgba(255,255,255,0.04)', marginBottom: 14 }} />
                    <div style={{ width: '80%', height: i === 0 ? 30 : 18, background: 'rgba(255,255,255,0.06)', marginBottom: 10 }} />
                    <div style={{ width: '65%', height: 14, background: 'rgba(255,255,255,0.04)' }} />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ paddingTop: 60, fontFamily: MONO, fontSize: 10, color: '#333', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
                No stories in this category yet.
              </div>
            ) : (
              filtered.map((item, i) => <ArticleCard key={item.id} item={item} index={i} />)
            )}
          </div>

          {/* Sidebar */}
          <div style={{ paddingTop: 32 }}>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.2em', color: '#333', marginBottom: 20, textTransform: 'uppercase' }}>
              Other Sections
            </div>
            {Object.entries(CATEGORY_META)
              .filter(([id]) => id !== catId && id !== 'ALL')
              .map(([id, m]) => {
                const count = enriched.filter(i => i._category === id).length;
                return (
                  <Link
                    key={id}
                    to={`/news/${id.toLowerCase().replace(/\s+/g, '-')}`}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', textDecoration: 'none' }}
                    onMouseEnter={e => e.currentTarget.querySelector('.scat-label').style.color = '#fff'}
                    onMouseLeave={e => e.currentTarget.querySelector('.scat-label').style.color = '#777'}
                  >
                    <span className="scat-label" style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: '#777', transition: 'color 140ms' }}>
                      {m.label}
                    </span>
                    {count > 0 && (
                      <span style={{ fontFamily: MONO, fontSize: 8, color: '#333', letterSpacing: '0.08em' }}>{count}</span>
                    )}
                  </Link>
                );
              })}
          </div>

        </div>
      </div>

      <LandingFooter />
    </div>
  );
}
