import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import NeuralText from '@/components/shared/NeuralText';
import LandingHeader from '@/components/landing/LandingHeader';
import LandingFooter from '@/components/landing/LandingFooter';

const API = import.meta.env.VITE_API_BASE ?? '';

export default function Waitlist() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [message, setMessage] = useState('');
  const [count, setCount] = useState(null);

  useEffect(() => {
    fetch(`${API}/api/waitlist/count`)
      .then(r => r.json())
      .then(d => setCount(d.count))
      .catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('loading');
    try {
      const res = await fetch(`${API}/api/waitlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus('success');
        setMessage(data.message || "You're on the list.");
        setCount(c => c !== null ? c + 1 : null);
      } else {
        setStatus('error');
        setMessage(data.detail || 'Something went wrong.');
      }
    } catch {
      setStatus('error');
      setMessage('Network error. Try again.');
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--site-bg)', color: 'var(--site-fg)' }}>
      <LandingHeader />

      <main className="max-w-[1400px] mx-auto px-6 md:px-10 pt-32 pb-40">
        {/* Label */}
        <div className="font-mono text-[11px] tracking-[0.3em] uppercase mb-10"
          style={{ color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.1)', display: 'inline-block', padding: '3px 10px' }}>
          [ EARLY ACCESS ]
        </div>

        {/* Heading */}
        <h1 className="font-black tracking-[-0.05em] leading-[0.85] mb-10">
          <span style={{ display: 'block' }}>
            <NeuralText text="JOIN THE" fontWeight={900}
              style={{ fontSize: 'clamp(48px,10vw,140px)', letterSpacing: '-0.05em' }} />
          </span>
          <span style={{ display: 'block' }}>
            <NeuralText text="WAITLIST" fontWeight={900}
              style={{ fontSize: 'clamp(48px,10vw,140px)', letterSpacing: '-0.05em' }} />
          </span>
        </h1>

        {/* Subtext */}
        <p className="max-w-lg text-lg leading-relaxed mb-16" style={{ color: 'rgba(255,255,255,0.55)' }}>
          Kado is currently in private beta. Drop your email and we'll notify you
          when your spot is ready. No spam. No credit card.
        </p>

        {/* Counter */}
        {count !== null && (
          <div className="font-mono text-[11px] tracking-[0.25em] uppercase mb-10"
            style={{ color: 'rgba(255,255,255,0.3)' }}>
            {count} {count === 1 ? 'person' : 'people'} already waiting
          </div>
        )}

        {/* Form */}
        {status !== 'success' ? (
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4 max-w-xl">
            <input
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="flex-1 h-12 px-5 font-mono text-[13px] outline-none"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff',
              }}
            />
            <button
              type="submit"
              disabled={status === 'loading'}
              className="h-12 px-8 font-mono text-[13px] tracking-[0.2em] uppercase transition-colors"
              style={{
                background: status === 'loading' ? 'rgba(255,255,255,0.7)' : '#fff',
                color: '#0A0A0A',
                border: '1px solid #fff',
                cursor: status === 'loading' ? 'not-allowed' : 'pointer',
              }}
            >
              {status === 'loading' ? '...' : 'Join Waitlist'}
            </button>
          </form>
        ) : (
          <div className="flex items-center gap-4 max-w-xl">
            <div className="font-mono text-[13px] tracking-[0.1em]"
              style={{ color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', padding: '12px 24px' }}>
              ✓ {message}
            </div>
          </div>
        )}

        {status === 'error' && (
          <p className="mt-4 font-mono text-[12px]" style={{ color: '#f87171' }}>{message}</p>
        )}

        {/* Links */}
        <div className="mt-20 pt-8 flex flex-wrap gap-6 font-mono text-[11px] tracking-[0.25em] uppercase"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' }}>
          <Link to="/" style={{ color: 'inherit', textDecoration: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}>
            ← Back to Home
          </Link>
          <Link to="/auth?mode=register" style={{ color: 'inherit', textDecoration: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; }}>
            Already have access? Sign In →
          </Link>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
