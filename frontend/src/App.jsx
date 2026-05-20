import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from '@/lib/ThemeContext';
import { LangProvider } from '@/lib/LangContext';
import GlobalNeural from '@/components/global/GlobalNeural';
import CursorTracker from '@/components/global/CursorTracker';
import CookieBanner from '@/components/global/CookieBanner';
import ErrorBoundary from '@/components/global/ErrorBoundary';
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
const BotsControlPage   = lazy(() => import('@/pages/BotsControlPage'));
const NotFoundPage      = lazy(() => import('@/pages/NotFoundPage'));
const RiskDisclosurePage = lazy(() => import('@/pages/LegalPage').then(m => ({ default: m.RiskDisclosurePage })));
const TermsOfServicePage = lazy(() => import('@/pages/LegalPage').then(m => ({ default: m.TermsOfServicePage })));
const PrivacyPolicyPage  = lazy(() => import('@/pages/LegalPage').then(m => ({ default: m.PrivacyPolicyPage })));
const DocsPage           = lazy(() => import('@/pages/DocsPage'));

function PixelRouteTracker() {
  const location = useLocation();
  useEffect(() => { trackPageView(); }, [location.pathname]);
  return null;
}

function ScrollToHash() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) { window.scrollTo({ top: 0 }); return; }
    const id = hash.slice(1);
    const attempt = (tries = 0) => {
      const el = document.getElementById(id);
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      else if (tries < 6) setTimeout(() => attempt(tries + 1), 200);
    };
    attempt();
  }, [pathname, hash]);
  return null;
}

export default function App() {
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        window.__neuronField?.setScrollY(window.scrollY);
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <ThemeProvider>
      <LangProvider>
        <Router>
        <PixelRouteTracker />
        <ScrollToHash />
        <GlobalNeural />
        <CursorTracker />
        <CookieBanner />
        <ErrorBoundary>
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
          <Route path="/trade" element={<ProtectedRoute><BotsControlPage /></ProtectedRoute>} />
          <Route path="/legal/risk-disclosure" element={<RiskDisclosurePage />} />
          <Route path="/legal/terms" element={<TermsOfServicePage />} />
          <Route path="/legal/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
        </ErrorBoundary>
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
