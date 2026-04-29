import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export default function ProtectedRoute({ children }) {
  const token = localStorage.getItem('kado_token');
  const location = useLocation();
  const [status, setStatus] = useState('checking'); // checking | ok | invalid

  useEffect(() => {
    if (!token) { setStatus('invalid'); return; }
    fetch('/api/users/me', {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => {
      if (r.ok) {
        r.json().then(data => {
          localStorage.setItem('kado_user', JSON.stringify(data));
          setStatus('ok');
        });
      } else {
        localStorage.removeItem('kado_token');
        localStorage.removeItem('kado_user');
        setStatus('invalid');
      }
    }).catch(() => {
      // Network error — assume still valid, let them in
      setStatus('ok');
    });
  }, [token]);

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0A0A' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, border: '2px solid rgba(255,255,255,0.1)',
            borderTop: '2px solid #0047FF', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
          }} />
          <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: '0.3em', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
            Verifying session...
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (status === 'invalid') {
    return <Navigate to="/auth?mode=login" state={{ from: location }} replace />;
  }

  return children;
}
