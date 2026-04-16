import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Landing from '@/pages/Landing';
import Auth from '@/pages/Auth';
import Dashboard from '@/pages/Dashboard';
import ProtectedRoute from '@/lib/ProtectedRoute';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<Auth />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="*"
          element={
            <div className="min-h-screen flex items-center justify-center">
              <div className="text-center">
                <div className="font-black text-8xl text-kado-black/10 mb-4">404</div>
                <div className="font-mono text-sm tracking-widest uppercase text-kado-gray mb-6">Page not found</div>
                <a href="/" className="font-mono text-xs tracking-widest uppercase border border-kado-black px-6 py-3 hover:bg-kado-black hover:text-white transition-colors">
                  Go Home
                </a>
              </div>
            </div>
          }
        />
      </Routes>
    </Router>
  );
}
