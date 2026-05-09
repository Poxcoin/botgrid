import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import { useLang } from '@/lib/LangContext';
import { usePageTitle } from '@/lib/usePageTitle';

const MONO = "'Courier New','SF Mono',monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',sans-serif";
const ACC  = '#0047FF';
const LINE = 'rgba(255,255,255,0.07)';

const LOCALE_MAP = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-US', de: 'de-DE', es: 'es-ES', zh: 'zh-CN' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return `${Math.floor(diff)}s`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

const CAT_GRADIENT = {
  GEOPOLITICS: 'linear-gradient(135deg,#1a0808 0%,#2a1010 100%)',
  MACRO:       'linear-gradient(135deg,#08081a 0%,#10102a 100%)',
  COMMODITIES: 'linear-gradient(135deg,#081a08 0%,#102a10 100%)',
  MARKETS:     'linear-gradient(135deg,#1a1a08 0%,#2a2a10 100%)',
  'ON-CHAIN':  'linear-gradient(135deg,#081a1a 0%,#102a2a 100%)',
  LISTINGS:    'linear-gradient(135deg,#1a081a 0%,#2a102a 100%)',
  CRYPTO:      'linear-gradient(135deg,#080818 0%,#001028 100%)',
};

function getCategory(source = '', title = '', description = '') {
  const s    = source.toLowerCase();
  const text = (title + ' ' + (description || '')).toLowerCase();

  // ── Source-based (fast, reliable) ──────────────────────────────────────
  if (s.includes('whale_alert') || s.includes('whale alert') || s.includes('whale-b'))
    return 'ON-CHAIN';
  if (s.includes('lookonchain') || s.includes('smart wallet'))
    return 'ON-CHAIN';
  if (s.includes('oilprice') || s.includes('mining.com') || s.includes('kitco'))
    return 'COMMODITIES';
  if (s.includes('marketwatch') || s.includes('yahoo finance') || s.includes('barrons'))
    return 'MARKETS';
  if (s.includes('al jazeera') || s.includes('aljazeera'))
    return 'GEOPOLITICS';
  if (s.includes('federal reserve') || s.includes('federalreserve'))
    return 'MACRO';
  if (s.includes('binance') && (s.includes('blog') || s.includes('announcement')))
    return 'LISTINGS';
  if (s.includes('bybit') && (s.includes('blog') || s.includes('announcement')))
    return 'LISTINGS';

  // ── Content-based ──────────────────────────────────────────────────────
  const geoKw = ['war ', 'warfare', 'military', 'sanctions', 'geopolit', 'nato', 'conflict',
    'ukraine', 'russia', 'missile', 'troops', 'attack', 'invasion', 'treaty', 'coup',
    'airstrike', 'artillery', 'frontline', 'ceasefire', 'hostilities', 'bombing',
    'nuclear', 'diplomacy', 'pentagon', 'kremlin', 'white house statement'];
  if (geoKw.some(k => text.includes(k))) return 'GEOPOLITICS';

  const macroKw = ['inflation', 'recession', 'federal reserve', ' fed ', 'interest rate',
    ' cpi ', ' gdp ', 'treasury', 'central bank', 'tariff', 'fiscal', 'monetary policy',
    'rate hike', 'rate cut', 'economic crisis', 'labor market', 'unemployment',
    'consumer price', 'producer price', 'retail sales', 'trade deficit', 'imf ', 'world bank'];
  if (macroKw.some(k => text.includes(k))) return 'MACRO';

  const commKw = ['crude oil', 'wti ', 'brent', 'gold price', 'silver price', ' oil price',
    'per barrel', 'opec', 'commodit', 'natural gas', ' lng ', 'copper', 'nickel',
    'precious metal', 'oil falls', 'oil rises', 'gold falls', 'gold rises', 'iron ore'];
  if (commKw.some(k => text.includes(k))) return 'COMMODITIES';

  const marketKw = ['stock market', 's&p 500', 's&p500', 'nasdaq', 'dow jones', 'wall street',
    'earnings', 'equity', 'ipo ', 'shares rise', 'shares fall', 'market rally',
    'market selloff', 'sp500', 'stock rally', 'stock plunge'];
  if (marketKw.some(k => text.includes(k))) return 'MARKETS';

  const chainKw = ['on-chain', 'whale', 'defi', 'smart contract', 'tvl', 'dex volume',
    'protocol', 'bridged', 'staking rewards', 'validator', 'gas fee'];
  if (chainKw.some(k => text.includes(k))) return 'ON-CHAIN';

  if (s.includes('binance') || s.includes('bybit') || s.includes('coinbase') || s.includes('okx'))
    return 'LISTINGS';

  // ── Source fallback for broad news agencies ────────────────────────────
  if (s.includes('bbc') || s.includes('reuters') || s.includes('ap news') || s.includes('associated press'))
    return text.includes('economy') || text.includes('economic') || text.includes('bank') ||
           text.includes('growth') || text.includes('trade') ? 'MACRO' : 'GEOPOLITICS';

  return 'CRYPTO';
}

function toSlug(cat) { return cat.toLowerCase().replace(/\s+/g, '-'); }

const CAT_IDS = ['ALL', 'CRYPTO', 'MACRO', 'GEOPOLITICS', 'COMMODITIES', 'MARKETS', 'ON-CHAIN', 'LISTINGS'];
const AREA_CATS = ['GEOPOLITICS', 'MACRO', 'COMMODITIES', 'MARKETS', 'ON-CHAIN'];

// ─── Components ───────────────────────────────────────────────────────────────

function MetaLine({ item, accent = false, light = false }) {
  const { t } = useLang();
  const hasLink = item.link?.startsWith('http');
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent ? ACC : (light ? 'rgba(255,255,255,0.9)' : '#fff') }}>
        {t.cats[item._category] || item._category}
      </span>
      <span style={{ fontFamily: MONO, fontSize: 8, color: light ? 'rgba(255,255,255,0.5)' : '#444' }}>{timeAgo(item.published_at)}</span>
      {item.source && <span style={{ fontFamily: MONO, fontSize: 8, color: light ? 'rgba(255,255,255,0.35)' : '#333', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{item.source}</span>}
      {hasLink && <span style={{ fontFamily: MONO, fontSize: 8, color: light ? 'rgba(255,255,255,0.5)' : ACC }}>↗</span>}
    </div>
  );
}

// Full-width hero banner — shows when lead has image_url
const HeroBanner = React.memo(function HeroBanner({ item, onClick }) {
  if (!item || !item.image_url) return null;
  return (
    <div
      onClick={onClick}
      style={{
        width: '100%',
        position: 'relative',
        height: 520,
        overflow: 'hidden',
        cursor: item.link?.startsWith('http') ? 'pointer' : 'default',
        flexShrink: 0,
      }}
    >
      <img
        src={item.image_url}
        alt=""
        style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.42)', display: 'block' }}
        onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
      />
      {/* dark gradient at the bottom for text legibility */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(to bottom, transparent 20%, rgba(6,6,6,0.55) 60%, rgba(6,6,6,0.92) 100%)',
      }} />
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '0 48px 44px',
        boxSizing: 'border-box',
      }}>
        <MetaLine item={item} accent light />
        <h1 style={{
          fontFamily: SANS, fontWeight: 800, lineHeight: 1.03, letterSpacing: '-0.045em',
          fontSize: 'clamp(30px, 4vw, 60px)', color: '#fff',
          margin: '0 0 14px', maxWidth: 900, textShadow: '0 2px 20px rgba(0,0,0,0.6)',
        }}>
          {item.title}
        </h1>
        {item.description && (
          <p style={{
            fontFamily: SANS, fontSize: 16, color: 'rgba(255,255,255,0.72)', lineHeight: 1.55,
            margin: 0, maxWidth: 700,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {item.description}
          </p>
        )}
      </div>
    </div>
  );
});

// Fallback lead (text-only, when no image on lead)
const LeadStoryText = React.memo(function LeadStoryText({ item }) {
  if (!item) return null;
  const hasLink = item.link?.startsWith('http');
  return (
    <article
      onClick={() => hasLink && window.open(item.link, '_blank', 'noopener')}
      style={{ cursor: hasLink ? 'pointer' : 'default' }}
    >
      <MetaLine item={item} accent />
      <h1 className="j-lead-h1" style={{
        fontFamily: SANS, fontWeight: 700, lineHeight: 1.04, letterSpacing: '-0.04em',
        fontSize: 'clamp(28px, 3.5vw, 52px)', color: '#f5f5f5',
        margin: '0 0 18px', transition: 'opacity 180ms',
      }}>
        {item.title}
      </h1>
      {item.description && (
        <p style={{
          fontFamily: SANS, fontSize: 15, color: '#666', lineHeight: 1.6, margin: '0 0 20px',
          display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {item.description}
        </p>
      )}
      {item.image_url && (
        <div style={{ width: '100%', aspectRatio: '16/9', overflow: 'hidden', borderRadius: 3, marginTop: 4 }}>
          <img
            src={item.image_url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
          />
        </div>
      )}
    </article>
  );
});

const SecItem = React.memo(function SecItem({ item, last = false }) {
  const hasLink = item.link?.startsWith('http');
  const img = item.image_url;
  return (
    <article
      onClick={() => hasLink && window.open(item.link, '_blank', 'noopener')}
      style={{
        padding: '14px 0', cursor: hasLink ? 'pointer' : 'default',
        borderBottom: last ? 'none' : `1px solid ${LINE}`,
        transition: 'opacity 180ms',
        display: 'flex', gap: 12, alignItems: 'flex-start',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <MetaLine item={item} />
        <h3 style={{ fontFamily: SANS, fontSize: 17, fontWeight: 600, lineHeight: 1.22, letterSpacing: '-0.025em', color: '#f0f0f0', margin: '0 0 6px' }}>
          {item.title}
        </h3>
        {item.description && (
          <p style={{ fontFamily: SANS, fontSize: 13, color: '#555', lineHeight: 1.55, margin: 0,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {item.description}
          </p>
        )}
      </div>
      <div style={{
        flexShrink: 0, width: 80, height: 60, overflow: 'hidden', borderRadius: 2,
        background: img ? '#0d0d0d' : (CAT_GRADIENT[item._category] || CAT_GRADIENT.CRYPTO),
      }}>
        {img && (
          <img
            src={img}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        )}
      </div>
    </article>
  );
});

const WireItem = React.memo(function WireItem({ item, index }) {
  const { t } = useLang();
  const hasLink = item.link?.startsWith('http');
  return (
    <div
      onClick={() => hasLink && window.open(item.link, '_blank', 'noopener')}
      style={{
        display: 'grid', gridTemplateColumns: '28px 1fr', gap: 10,
        padding: '12px 0', borderBottom: `1px solid ${LINE}`,
        cursor: hasLink ? 'pointer' : 'default', transition: 'opacity 180ms',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.6'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      <span style={{ fontFamily: MONO, fontSize: 9, color: '#2a2a2a', paddingTop: 2, letterSpacing: '0.06em' }}>
        {String(index + 1).padStart(2, '0')}
      </span>
      <div>
        <h3 style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, lineHeight: 1.35, letterSpacing: '-0.015em', color: '#ccc', margin: '0 0 5px' }}>
          {item.title}
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 8, color: '#333', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            {t.cats[item._category] || item._category}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 8, color: '#2a2a2a' }}>·</span>
          <span style={{ fontFamily: MONO, fontSize: 8, color: '#333' }}>{timeAgo(item.published_at)}</span>
        </div>
      </div>
    </div>
  );
});

const AreaCard = React.memo(function AreaCard({ item, first = false }) {
  const hasLink = item.link?.startsWith('http');
  const img = item.image_url;
  return (
    <article
      onClick={() => hasLink && window.open(item.link, '_blank', 'noopener')}
      style={{
        padding: first ? '0' : '0 24px',
        borderLeft: first ? 'none' : `1px solid ${LINE}`,
        cursor: hasLink ? 'pointer' : 'default', transition: 'opacity 180ms',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      <div style={{
        width: '100%', height: 160, overflow: 'hidden', marginBottom: 14, borderRadius: 2, flexShrink: 0,
        background: img ? '#0d0d0d' : (CAT_GRADIENT[item._category] || CAT_GRADIENT.CRYPTO),
      }}>
        {img && (
          <img
            src={img}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <span style={{ fontFamily: MONO, fontSize: 8, color: '#fff', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {timeAgo(item.published_at)}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 8, color: '#333', textTransform: 'uppercase' }}>{item.source}</span>
      </div>
      <h3 style={{ fontFamily: SANS, fontSize: 16, fontWeight: 600, lineHeight: 1.22, letterSpacing: '-0.025em', color: '#f0f0f0', margin: '0 0 8px' }}>
        {item.title}
      </h3>
      {item.description && (
        <p style={{ fontFamily: SANS, fontSize: 12, color: '#555', lineHeight: 1.55, margin: 0,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.description}
        </p>
      )}
    </article>
  );
});

function Skeleton() {
  const bar = (w, h, mb = 8) => (
    <div style={{ width: w, height: h, background: 'rgba(255,255,255,0.04)', marginBottom: mb }} />
  );
  return (
    <div style={{ paddingTop: 40 }}>
      {bar('60px', 10, 16)}{bar('80%', 42, 10)}{bar('65%', 42, 20)}
      {bar('100%', 14)}{bar('75%', 14)}{bar('55%', 14)}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewsPage() {
  const { t, lang } = useLang();
  const locale = LOCALE_MAP[lang] || 'en-US';
  usePageTitle(t.nav.news);

  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [filter,    setFilter]    = useState('ALL');
  const [now,       setNow]       = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch('/api/news/public?limit=120');
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.items || []);
      setUpdatedAt(new Date().toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }));
    } catch {}
    finally { setLoading(false); }
  }, [locale]);

  useEffect(() => {
    window.scrollTo(0, 0);
    fetchNews();
    const iv = setInterval(fetchNews, 30_000);
    return () => clearInterval(iv);
  }, [fetchNews]);

  const enriched = useMemo(() =>
    items.map(item => ({ ...item, _category: getCategory(item.source, item.title, item.description) })),
  [items]);

  const filtered = useMemo(() =>
    filter === 'ALL' ? enriched : enriched.filter(i => i._category === filter),
  [enriched, filter]);

  const display   = filtered.length > 0 ? filtered : enriched;
  const leadIdx   = display.findIndex(i => i.image_url);
  const lead      = leadIdx >= 0 ? display[leadIdx] : (display[0] || null);
  const rest      = leadIdx > 0 ? [...display.slice(0, leadIdx), ...display.slice(leadIdx + 1)] : display.slice(1);
  const secondary = rest.slice(0, 6);
  const wire      = rest.slice(6, 22);
  // IDs already used in main grid — exclude from category sections to avoid repeats
  const usedIds   = new Set([lead?.id, ...secondary.map(i => i.id), ...wire.map(i => i.id)]);

  const counts = useMemo(() => {
    const c = { ALL: enriched.length };
    for (const it of enriched) c[it._category] = (c[it._category] || 0) + 1;
    return c;
  }, [enriched]);

  const dateStr = now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });


  return (
    <div style={{ background: '#060606', color: '#f5f5f5', fontFamily: SANS, minHeight: '100vh' }}>
      <LandingHeader />

      <style>{`
        @keyframes dot-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        .j-lead-h1:hover { opacity: .72; }
        @media (max-width: 1100px) {
          .j-main-grid { grid-template-columns: 1fr 1fr !important; }
          .j-col-wire { grid-column: 1 / -1; padding: 24px 0 0 !important; border-left: none !important; border-top: 1px solid rgba(255,255,255,0.07) !important; }
          .j-area-grid { grid-template-columns: 1fr 1fr !important; }
          .j-area-card:nth-child(3) { border-left: none !important; padding-left: 0 !important; }
        }
        @media (max-width: 720px) {
          .j-main-grid { grid-template-columns: 1fr !important; }
          .j-col-sec { border-left: none !important; padding-left: 0 !important; border-top: 1px solid rgba(255,255,255,0.07) !important; padding-top: 24px !important; margin-top: 24px; }
          .j-area-grid { grid-template-columns: 1fr !important; }
          .j-area-card { border-left: none !important; padding: 16px 0 !important; border-top: 1px solid rgba(255,255,255,0.07) !important; }
          .j-area-card:first-child { border-top: none !important; padding-top: 0 !important; }
          .j-ticker { display: none !important; }
          .j-catnav { overflow-x: auto; scrollbar-width: none; }
          .j-hero { height: 300px !important; }
        }
        .j-catnav::-webkit-scrollbar { display: none; }
      `}</style>

      {/* ── Навигация по категориям ──────────────────────────────────────── */}
      <div style={{ borderBottom: `1px solid ${LINE}` }}>
        <div className="j-catnav" style={{ padding: '0 32px', display: 'flex', alignItems: 'stretch' }}>
          {CAT_IDS.map(id => {
            const on  = filter === id;
            const cnt = counts[id];
            return (
              <button key={id} onClick={() => setFilter(id)}
                style={{
                  fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                  padding: '13px 16px', background: 'none', border: 'none',
                  borderBottom: on ? '2px solid #fff' : '2px solid transparent',
                  color: on ? '#fff' : '#444', cursor: 'pointer',
                  transition: 'color 150ms, border-color 150ms', whiteSpace: 'nowrap', marginBottom: '-1px',
                }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.color = '#aaa'; }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.color = '#444'; }}
              >
                {t.cats[id]}
                {cnt > 0 && (
                  <span style={{ fontFamily: MONO, fontSize: 8, color: '#333', marginLeft: 6 }}>
                    {String(cnt).padStart(2, '0')}
                  </span>
                )}
              </button>
            );
          })}
          <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 8, color: '#2a2a2a', alignSelf: 'center', letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
            {display.length} {t.news.stories} · 30s
          </span>
        </div>
      </div>

      {/* ── Основной контент ─────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ padding: '0 32px 80px' }}>
          <Skeleton />
        </div>
      ) : display.length === 0 ? (
        <div style={{ padding: '0 32px 80px' }}>
          <div style={{ padding: '80px 0', textAlign: 'center', fontFamily: MONO, fontSize: 10, color: '#333', letterSpacing: '0.18em' }}>
            {t.news.noFilter}
          </div>
        </div>
      ) : (
        <>
          {/* ── 3-col grid + category sections ── */}
          <div style={{ padding: '0 32px 80px' }}>

            {/* 3 колонки */}
            <div className="j-main-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 0.85fr)',
              borderBottom: `1px solid ${LINE}`,
              paddingBottom: 40,
              paddingTop: 36,
            }}>
              <div style={{ paddingRight: 36 }}>
                <LeadStoryText item={lead} />
              </div>

              <div className="j-col-sec" style={{ paddingLeft: 36, paddingRight: 36, borderLeft: `1px solid ${LINE}` }}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', color: '#fff', paddingBottom: 12, marginBottom: 18, borderBottom: '1px solid #fff', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span>{t.news.headlines}</span>
                  <span style={{ color: '#333', fontWeight: 400 }}>{String(secondary.length).padStart(2, '0')}</span>
                </div>
                {secondary.map((item, i) => (
                  <SecItem key={item.id} item={item} last={i === secondary.length - 1} />
                ))}
              </div>

              <div className="j-col-wire" style={{ paddingLeft: 36, borderLeft: `1px solid ${LINE}` }}>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', color: '#fff', paddingBottom: 12, marginBottom: 18, borderBottom: '1px solid #fff', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span>{t.news.wire}</span>
                  <span style={{ color: '#333', fontWeight: 400 }}>{String(wire.length).padStart(2, '0')}</span>
                </div>
                {wire.map((item, i) => (
                  <WireItem key={item.id} item={item} index={i} />
                ))}
              </div>
            </div>

            {/* Секции по категориям */}
            {filter === 'ALL' && AREA_CATS.map(catId => {
              const stories = enriched.filter(i => i._category === catId && !usedIds.has(i.id)).slice(0, 4);
              if (stories.length < 1) return null;
              return (
                <section key={catId} style={{ padding: '44px 0', borderBottom: `1px solid ${LINE}` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, paddingBottom: 14, marginBottom: 28, borderBottom: '1px solid #fff' }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, color: ACC, letterSpacing: '0.14em' }}>— {catId}</span>
                    <h2 style={{ fontFamily: SANS, fontSize: 28, fontWeight: 700, letterSpacing: '-0.035em', margin: 0, color: '#f5f5f5' }}>
                      {t.cats[catId]}
                    </h2>
                    <Link
                      to={`/news/${toSlug(catId)}`}
                      style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 9, color: '#444', letterSpacing: '0.14em', textDecoration: 'none', transition: 'color 150ms' }}
                      onMouseEnter={e => e.currentTarget.style.color = ACC}
                      onMouseLeave={e => e.currentTarget.style.color = '#444'}
                    >
                      {t.news.viewAll}
                    </Link>
                  </div>
                  <div className="j-area-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0 }}>
                    {stories.map((item, i) => (
                      <div key={item.id} className="j-area-card">
                        <AreaCard item={item} first={i === 0} />
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

            {/* CTA */}
            <div style={{ marginTop: 64, paddingTop: 32, borderTop: `1px solid ${LINE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20 }}>
              <div>
                <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', color: '#444', marginBottom: 8, textTransform: 'uppercase' }}>
                  {t.news.cta.label}
                </div>
                <p style={{ fontFamily: SANS, fontSize: 14, color: '#555', margin: 0, lineHeight: 1.6, maxWidth: 420 }}>
                  {t.news.cta.text}
                </p>
              </div>
              <a href="/auth?mode=register" style={{
                fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
                padding: '12px 28px', background: ACC, color: '#fff', textDecoration: 'none', flexShrink: 0,
              }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                {t.news.cta.btn}
              </a>
            </div>
          </div>
        </>
      )}

      <LandingFooter />
    </div>
  );
}
