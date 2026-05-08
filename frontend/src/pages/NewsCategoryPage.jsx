import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';
import { useLang } from '@/lib/LangContext';

const MONO = "'Courier New','SF Mono',monospace";
const SANS = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',sans-serif";
const ACC  = '#0047FF';
const LINE = 'rgba(255,255,255,0.07)';

const LOCALE_MAP = { ru: 'ru-RU', uk: 'uk-UA', en: 'en-US', de: 'de-DE', es: 'es-ES', zh: 'zh-CN' };
const CAT_IDS    = ['ALL','CRYPTO','MACRO','GEOPOLITICS','COMMODITIES','MARKETS','ON-CHAIN','LISTINGS'];

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

function fromSlug(slug = '') {
  const map = {
    'all': 'ALL', 'crypto': 'CRYPTO', 'macro': 'MACRO', 'geopolitics': 'GEOPOLITICS',
    'commodities': 'COMMODITIES', 'markets': 'MARKETS', 'on-chain': 'ON-CHAIN',
    'listings': 'LISTINGS', 'whale-alert': 'ON-CHAIN',
  };
  return map[slug.toLowerCase()] || slug.toUpperCase();
}

// ─── Components ───────────────────────────────────────────────────────────────

const LeadCard = React.memo(function LeadCard({ item }) {
  const { t } = useLang();
  if (!item) return null;
  const hasLink = item.link?.startsWith('http');
  const img = item.image_url;
  return (
    <article
      onClick={() => hasLink && window.open(item.link, '_blank', 'noopener')}
      style={{ paddingBottom: 32, marginBottom: 32, borderBottom: `1px solid ${LINE}`, cursor: hasLink ? 'pointer' : 'default' }}
    >
      {img && (
        <div style={{ marginBottom: 20, overflow: 'hidden' }}>
          <img src={img} alt="" style={{ width: '100%', height: 280, objectFit: 'cover', display: 'block', filter: 'brightness(0.85)' }}
            onError={e => { e.currentTarget.parentElement.style.display = 'none'; }} />
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: ACC, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          — {t.cats[item._category] || item._category}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 8, color: '#444' }}>{timeAgo(item.published_at)}</span>
        <span style={{ fontFamily: MONO, fontSize: 8, color: '#333', textTransform: 'uppercase' }}>{item.source}</span>
      </div>
      <h1 style={{
        fontFamily: SANS, fontSize: 'clamp(26px, 3.2vw, 48px)', fontWeight: 700,
        lineHeight: 1.06, letterSpacing: '-0.04em', color: '#f5f5f5', margin: '0 0 16px', transition: 'opacity 180ms',
      }}
        onMouseEnter={e => { if (hasLink) e.currentTarget.style.opacity = '0.72'; }}
        onMouseLeave={e => e.currentTarget.style.opacity = '1'}
      >
        {item.title}
      </h1>
      {item.description && (
        <p style={{ fontFamily: SANS, fontSize: 15, color: '#666', lineHeight: 1.62, margin: '0 0 16px',
          display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {item.description}
        </p>
      )}
      {hasLink && <span style={{ fontFamily: MONO, fontSize: 9, color: ACC, letterSpacing: '0.12em' }}>{t.news.read}</span>}
    </article>
  );
});

const ArticleRow = React.memo(function ArticleRow({ item, last = false }) {
  const { t } = useLang();
  const hasLink = item.link?.startsWith('http');
  const img = item.image_url;
  return (
    <article
      onClick={() => hasLink && window.open(item.link, '_blank', 'noopener')}
      style={{
        display: 'flex', gap: 16, alignItems: 'flex-start',
        padding: '18px 0', borderBottom: last ? 'none' : `1px solid ${LINE}`,
        cursor: hasLink ? 'pointer' : 'default', transition: 'opacity 180ms',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 7 }}>
          <span style={{ fontFamily: MONO, fontSize: 9, color: ACC, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {t.cats[item._category] || item._category}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 8, color: '#444' }}>{timeAgo(item.published_at)}</span>
        </div>
        <h2 style={{ fontFamily: SANS, fontSize: 16, fontWeight: 600, lineHeight: 1.25, letterSpacing: '-0.025em', color: '#f0f0f0', margin: '0 0 8px' }}>
          {item.title}
        </h2>
        {item.description && (
          <p style={{ fontFamily: SANS, fontSize: 13, color: '#555', lineHeight: 1.55, margin: 0,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {item.description}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 8, color: '#333', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{item.source}</span>
          {hasLink && <span style={{ fontFamily: MONO, fontSize: 8, color: ACC }}>↗</span>}
        </div>
      </div>
      {img && (
        <div style={{ flexShrink: 0, width: 90, height: 68, overflow: 'hidden' }}>
          <img src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', filter: 'brightness(0.85)' }}
            onError={e => { e.currentTarget.parentElement.style.display = 'none'; }} />
        </div>
      )}
    </article>
  );
});

const WireItem = React.memo(function WireItem({ item, index }) {
  const hasLink = item.link?.startsWith('http');
  return (
    <div
      onClick={() => hasLink && window.open(item.link, '_blank', 'noopener')}
      style={{
        display: 'grid', gridTemplateColumns: '26px 1fr', gap: 10,
        padding: '11px 0', borderBottom: `1px solid ${LINE}`,
        cursor: hasLink ? 'pointer' : 'default', transition: 'opacity 180ms',
      }}
      onMouseEnter={e => e.currentTarget.style.opacity = '0.6'}
      onMouseLeave={e => e.currentTarget.style.opacity = '1'}
    >
      <span style={{ fontFamily: MONO, fontSize: 9, color: '#2a2a2a', paddingTop: 2 }}>
        {String(index + 1).padStart(2, '0')}
      </span>
      <div>
        <h3 style={{ fontFamily: SANS, fontSize: 12, fontWeight: 500, lineHeight: 1.38, color: '#bbb', margin: '0 0 5px' }}>
          {item.title}
        </h3>
        <span style={{ fontFamily: MONO, fontSize: 8, color: '#333' }}>{timeAgo(item.published_at)}</span>
      </div>
    </div>
  );
});

function Skeleton() {
  const bar = (w, h, mb = 8) => <div style={{ width: w, height: h, background: 'rgba(255,255,255,0.04)', marginBottom: mb }} />;
  return (
    <div style={{ paddingTop: 40 }}>
      {bar('60px', 10, 16)}{bar('80%', 36, 10)}{bar('65%', 36, 20)}
      {bar('100%', 14)}{bar('75%', 14)}{bar('55%', 14)}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NewsCategoryPage() {
  const { category: slug } = useParams();
  const catId = fromSlug(slug || '');
  const { t, lang } = useLang();
  const locale = LOCALE_MAP[lang] || 'en-US';

  const [items,     setItems]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [now,       setNow]       = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchNews = useCallback(async () => {
    try {
      const res = await fetch('/api/news/public?limit=80');
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
  }, [fetchNews, slug]);

  const enriched = useMemo(() =>
    items.map(item => ({ ...item, _category: getCategory(item.source, item.title, item.description) })),
  [items]);

  const filtered = useMemo(() =>
    catId === 'ALL' ? enriched : enriched.filter(i => i._category === catId),
  [enriched, catId]);

  const counts = useMemo(() => {
    const c = { ALL: enriched.length };
    for (const it of enriched) c[it._category] = (c[it._category] || 0) + 1;
    return c;
  }, [enriched]);

  const lead = filtered[0] || null;
  const main = filtered.slice(1, 16);
  const wire = filtered.slice(16, 30);

  const timeStr = now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div style={{ background: '#060606', color: '#f5f5f5', fontFamily: SANS, minHeight: '100vh' }}>
      <LandingHeader />

      <style>{`
        @keyframes dot-pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
        @media (max-width: 960px) {
          .jcat-grid { grid-template-columns: 1fr !important; }
          .jcat-wire { display: none !important; }
        }
        .j-catnav::-webkit-scrollbar { display: none; }
        .j-catnav { scrollbar-width: none; }
      `}</style>

      {/* ── Шапка ──────────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: `1px solid ${LINE}` }}>
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '16px 32px', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 24 }}>
          <div>
            <Link to="/news" style={{ fontFamily: MONO, fontSize: 9, color: '#fff', letterSpacing: '0.16em', textDecoration: 'none', textTransform: 'uppercase' }}>
              {t.news.brand}
            </Link>
          </div>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 20, letterSpacing: '-0.03em', textAlign: 'center', whiteSpace: 'nowrap' }}>
            {t.news.masthead}<span style={{ color: ACC }}>.</span>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', justifyContent: 'flex-end' }}>
            <span style={{ fontFamily: MONO, fontSize: 9, color: ACC, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: ACC, display: 'inline-block', animation: 'dot-pulse 1.6s ease-in-out infinite' }} />
              {t.news.live}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 9, color: '#444' }}>{timeStr}</span>
            {updatedAt && <span style={{ fontFamily: MONO, fontSize: 8, color: '#333' }}>{t.news.updated} {updatedAt}</span>}
          </div>
        </div>
      </div>

      {/* ── Навигация ──────────────────────────────────────────────────────── */}
      <div style={{ borderBottom: `1px solid ${LINE}` }}>
        <div className="j-catnav" style={{ maxWidth: 1440, margin: '0 auto', padding: '0 32px', display: 'flex', alignItems: 'stretch', overflowX: 'auto' }}>
          {CAT_IDS.map(id => {
            const on  = catId === id;
            const cnt = counts[id] || 0;
            return (
              <Link
                key={id}
                to={id === 'ALL' ? '/news' : `/news/${id.toLowerCase().replace(/\s+/g,'-')}`}
                style={{
                  fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
                  padding: '13px 16px', textDecoration: 'none',
                  borderBottom: on ? '2px solid #fff' : '2px solid transparent',
                  color: on ? '#fff' : '#444', cursor: 'pointer',
                  transition: 'color 150ms', whiteSpace: 'nowrap', marginBottom: '-1px',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.color = '#aaa'; }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.color = '#444'; }}
              >
                {t.cats[id]}
                {cnt > 0 && <span style={{ fontFamily: MONO, fontSize: 8, color: '#333' }}>{String(cnt).padStart(2,'0')}</span>}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Заголовок категории ────────────────────────────────────────────── */}
      <div style={{ borderBottom: `1px solid ${LINE}`, padding: '36px 0 28px' }}>
        <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 32px' }}>
          <div style={{ marginBottom: 14 }}>
            <Link to="/news" style={{ fontFamily: MONO, fontSize: 9, color: '#444', letterSpacing: '0.14em', textDecoration: 'none', textTransform: 'uppercase', transition: 'color 150ms' }}
              onMouseEnter={e => e.currentTarget.style.color = '#fff'}
              onMouseLeave={e => e.currentTarget.style.color = '#444'}
            >
              {t.news.allBack}
            </Link>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: MONO, fontSize: 10, color: ACC, letterSpacing: '0.16em' }}>— {catId}</span>
            <h1 style={{ fontFamily: SANS, fontSize: 'clamp(28px, 4vw, 52px)', fontWeight: 700, letterSpacing: '-0.04em', margin: 0, color: '#f5f5f5' }}>
              {t.cats[catId] || catId}
            </h1>
          </div>
          {t.catDesc[catId] && (
            <p style={{ fontFamily: SANS, fontSize: 14, color: '#555', margin: '10px 0 0', lineHeight: 1.6, maxWidth: 520 }}>
              {t.catDesc[catId]}
            </p>
          )}
          <div style={{ marginTop: 14, fontFamily: MONO, fontSize: 8, color: '#2a2a2a', letterSpacing: '0.12em' }}>
            {filtered.length} {t.news.stories} · {t.news.update30}
          </div>
        </div>
      </div>

      {/* ── Контент ────────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: '0 32px 80px' }}>
        {loading ? <Skeleton /> : filtered.length === 0 ? (
          <div style={{ paddingTop: 60, fontFamily: MONO, fontSize: 10, color: '#333', letterSpacing: '0.18em', textTransform: 'uppercase' }}>
            {t.news.noCategory}
          </div>
        ) : (
          <div className="jcat-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 320px)', gap: '0 60px', paddingTop: 40 }}>

            {/* Основная колонка */}
            <div>
              <LeadCard item={lead} />
              {main.map((item, i) => (
                <ArticleRow key={item.id} item={item} last={i === main.length - 1} />
              ))}
            </div>

            {/* Боковая панель */}
            <div className="jcat-wire">
              <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', color: '#fff', paddingBottom: 12, marginBottom: 18, borderBottom: '1px solid #fff', display: 'flex', justifyContent: 'space-between' }}>
                <span>{t.news.other}</span>
              </div>

              {CAT_IDS.filter(id => id !== catId && id !== 'ALL').map(id => {
                const cnt = counts[id] || 0;
                return (
                  <Link
                    key={id}
                    to={`/news/${id.toLowerCase().replace(/\s+/g,'-')}`}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '12px 0', borderBottom: `1px solid ${LINE}`, textDecoration: 'none',
                    }}
                    onMouseEnter={e => e.currentTarget.querySelector('.scat-lbl').style.color = '#fff'}
                    onMouseLeave={e => e.currentTarget.querySelector('.scat-lbl').style.color = '#666'}
                  >
                    <span className="scat-lbl" style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: '#666', transition: 'color 150ms' }}>
                      {t.cats[id]}
                    </span>
                    {cnt > 0 && <span style={{ fontFamily: MONO, fontSize: 8, color: '#333' }}>{cnt}</span>}
                  </Link>
                );
              })}

              {wire.length > 0 && (
                <>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.2em', color: '#fff', paddingBottom: 12, marginTop: 32, marginBottom: 4, borderBottom: '1px solid #fff' }}>
                    {t.news.wire}
                  </div>
                  {wire.map((item, i) => (
                    <WireItem key={item.id} item={item} index={i} />
                  ))}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <LandingFooter />
    </div>
  );
}
