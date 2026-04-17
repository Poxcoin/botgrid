import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import KadoButton from '@/components/shared/KadoButton';

function Field({ label, ...props }) {
  return (
    <label className="block">
      <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-black/60 mb-2">{label}</div>
      <input
        {...props}
        className="w-full h-12 px-4 bg-white border border-kado-black text-kado-black text-[15px] outline-none focus:border-kado-blue transition-colors font-mono"
      />
    </label>
  );
}

export default function Auth() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState(params.get('mode') === 'register' ? 'register' : 'login');
  const [form, setForm] = useState({ email: '', password: '', confirm: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    setMode(params.get('mode') === 'register' ? 'register' : 'login');
  }, [params]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.password) { setError('Password required'); return; }
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: form.password }),
      });
      if (!res.ok) { setError('Invalid password'); return; }
      const { token } = await res.json();
      localStorage.setItem('kado_token', token);
      localStorage.setItem('kado_user', JSON.stringify({ email: form.email || 'admin' }));
      navigate('/dashboard');
    } catch {
      setError('Connection error — server unreachable');
    }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-white">
      {/* Left black panel */}
      <div className="md:w-1/2 bg-kado-black text-white flex flex-col justify-between p-8 md:p-14 min-h-[40vh] md:min-h-screen">
        <Link to="/" className="font-mono text-[11px] tracking-[0.3em] uppercase text-white/60 hover:text-kado-blue transition-colors w-fit">
          ← Back
        </Link>
        <div>
          <div className="font-mono text-[11px] tracking-[0.3em] uppercase text-white/50 mb-8 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-kado-blue animate-blink" /> KADO / AUTH
          </div>
          <h1 className="font-black text-[22vw] md:text-[14vw] leading-[0.82] tracking-[-0.06em]">KADO</h1>
          <p className="mt-8 text-lg md:text-2xl font-semibold max-w-md leading-tight">
            Intelligence feeds.<br />Signals execute.
          </p>
        </div>
        <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-white/40 flex justify-between">
          <span>// SECURE ENDPOINT</span>
          <span>v1.0</span>
        </div>
      </div>

      {/* Right form */}
      <div className="md:w-1/2 flex flex-col justify-center p-8 md:p-14">
        <div className="max-w-md w-full mx-auto">
          <div className="flex border-b border-kado-black mb-10">
            {['login', 'register'].map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 h-12 font-mono text-[11px] tracking-[0.25em] uppercase transition-colors border-b-2 -mb-px ${mode === m ? 'border-kado-blue text-kado-black' : 'border-transparent text-kado-black/40 hover:text-kado-black'}`}
              >
                {m === 'login' ? 'Login' : 'Create account'}
              </button>
            ))}
          </div>

          <h2 className="font-black text-4xl md:text-5xl tracking-[-0.03em] leading-none mb-2">
            {mode === 'login' ? 'Welcome back.' : 'Get access.'}
          </h2>
          <p className="text-kado-black/60 mb-10 text-[15px]">
            {mode === 'login' ? 'Log in to view your live signal feed.' : 'Create an account to access Kado intelligence.'}
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <Field label="Email" type="email" value={form.email} onChange={set('email')} placeholder="you@domain.com" />
            <Field label="Password" type="password" value={form.password} onChange={set('password')} placeholder="••••••••" />
            {mode === 'register' && (
              <Field label="Confirm Password" type="password" value={form.confirm} onChange={set('confirm')} placeholder="••••••••" />
            )}
            {error && (
              <div className="border border-red-600 px-4 py-3 text-red-600 font-mono text-[12px] tracking-wide">
                ! {error}
              </div>
            )}
            <KadoButton type="submit" variant="blue" className="w-full">
              {mode === 'login' ? 'Login →' : 'Create Account →'}
            </KadoButton>
          </form>

          <div className="mt-8 font-mono text-[11px] tracking-[0.2em] uppercase text-kado-black/60">
            {mode === 'login' ? (
              <button type="button" onClick={() => setMode('register')} className="hover:text-kado-blue transition-colors">
                No account? Register →
              </button>
            ) : (
              <button type="button" onClick={() => setMode('login')} className="hover:text-kado-blue transition-colors">
                Already have an account? Login →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
