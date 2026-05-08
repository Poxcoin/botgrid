import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@/lib/ThemeContext';
import { LangProvider } from '@/lib/LangContext';
import GlobalNeural from '@/components/global/GlobalNeural';
import CursorTracker from '@/components/global/CursorTracker';
import CookieBanner from '@/components/global/CookieBanner';
import Landing from '@/pages/Landing';
import ProtectedRoute from '@/lib/ProtectedRoute';
import { trackPageView } from '@/lib/metaPixel';

const BotsPage          = lazy(() => import('@/pages/BotsPage'));
const StrategiesPage    = lazy(() => import('@/pages/StrategiesPage'));
const PricingPage       = lazy(() => import('@/pages/PricingPage'));
const Auth              = lazy(() => import('@/pages/Auth'));
const Waitlist          = lazy(() => import('@/pages/Waitlist'));
const NewsPage          = lazy(() => import('@/pages/NewsPage'));
const NewsCategoryPage  = lazy(() => import('@/pages/NewsCategoryPage'));
const UserDashboard     = lazy(() => import('@/pages/UserDashboard'));
const RiskDisclosurePage = lazy(() => import('@/pages/LegalPage').then(m => ({ default: m.RiskDisclosurePage })));
const TermsOfServicePage = lazy(() => import('@/pages/LegalPage').then(m => ({ default: m.TermsOfServicePage })));

function PixelRouteTracker() {
  const location = useLocation();
  useEffect(() => { trackPageView(); }, [location.pathname]);
  return null;
}

export default function App() {
  useEffect(() => {
    const onScroll = () => window.__neuronField?.setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <ThemeProvider>
      <LangProvider>
        <Router>
        <PixelRouteTracker />
        <GlobalNeural />
        <CursorTracker />
        <CookieBanner />
        <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/bots" element={<BotsPage />} />
          <Route path="/strategies" element={<StrategiesPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/news/:category" element={<NewsCategoryPage />} />
          <Route path="/waitlist" element={<Waitlist />} />
          <Route path="/dashboard" element={<Navigate to="/account" replace />} />
          <Route path="/account" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
          <Route path="/legal/risk-disclosure" element={<RiskDisclosurePage />} />
          <Route path="/legal/terms" element={<TermsOfServicePage />} />
          <Route
            path="*"
            element={
              <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--site-bg)' }}>
                <div className="text-center" style={{ color: 'var(--site-fg)' }}>
                  <div className="font-black text-8xl mb-4" style={{ opacity: 0.1 }}>404</div>
                  <div className="font-mono text-sm tracking-widest uppercase mb-6" style={{ color: 'var(--hero-muted)' }}>Page not found</div>
                  <a href="/" className="font-mono text-xs tracking-widest uppercase px-6 py-3 transition-colors"
                    style={{ border: '1px solid var(--hero-border)', color: 'var(--site-fg)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--site-fg)'; e.currentTarget.style.color = 'var(--site-bg)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--site-fg)'; }}
                  >Go Home</a>
                </div>
              </div>
            }
          />
        </Routes>
        </Suspense>
        </Router>
      </LangProvider>
    </ThemeProvider>
  );
}

function RouteLoading() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-base, #050505)',
    }}>
      <div className="shimmer" style={{ width: 120, height: 4, borderRadius: 2 }} />
    </div>
  );
}
