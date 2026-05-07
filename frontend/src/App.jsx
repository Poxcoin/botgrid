import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@/lib/ThemeContext';
import GlobalNeural from '@/components/global/GlobalNeural';
import GlobalCharts from '@/components/global/GlobalCharts';
import CursorTracker from '@/components/global/CursorTracker';
import Landing from '@/pages/Landing';
import BotsPage from '@/pages/BotsPage';
import StrategiesPage from '@/pages/StrategiesPage';
import PricingPage from '@/pages/PricingPage';
import Auth from '@/pages/Auth';
import Dashboard from '@/pages/Dashboard';
import Waitlist from '@/pages/Waitlist';
import NewsPage from '@/pages/NewsPage';
import ProtectedRoute from '@/lib/ProtectedRoute';
import UserDashboard from '@/pages/UserDashboard';

export default function App() {
  useEffect(() => {
    const onScroll = () => window.__neuronField?.setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <ThemeProvider>
      <Router>
        <GlobalCharts />
        <GlobalNeural />
        <CursorTracker />
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/bots" element={<BotsPage />} />
          <Route path="/strategies" element={<StrategiesPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/waitlist" element={<Waitlist />} />
          <Route path="/dashboard" element={<Navigate to="/account" replace />} />
          <Route path="/account" element={<ProtectedRoute><UserDashboard /></ProtectedRoute>} />
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
      </Router>
    </ThemeProvider>
  );
}
