import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import KadoButton from '@/components/shared/KadoButton';

// ── Password strength ────────────────────────────────────────────────────────
function checkStrength(pw) {
  const rules = [
    { label: '8+ characters', ok: pw.length >= 8 },
    { label: 'Uppercase letter', ok: /[A-Z]/.test(pw) },
    { label: 'Number', ok: /[0-9]/.test(pw) },
    { label: 'Special character (!@#$…)', ok: /[^A-Za-z0-9]/.test(pw) },
  ];
  const score = rules.filter(r => r.ok).length;
  return { rules, score };
}

const STRENGTH_LABEL = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const STRENGTH_COLOR = ['', '#ef4444', '#f59e0b', '#22c55e', '#0047FF'];

function StrengthMeter({ password }) {
  const { rules, score } = checkStrength(password);
  if (!password) return null;
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-1 flex-1 transition-colors" style={{
            background: i <= score ? STRENGTH_COLOR[score] : 'rgba(0,0,0,0.1)',
          }} />
        ))}
      </div>
      <div className="font-mono text-[10px]" style={{ color: STRENGTH_COLOR[score] }}>
        {STRENGTH_LABEL[score]}
      </div>
      <ul className="space-y-0.5">
        {rules.map(r => (
          <li key={r.label} className="font-mono text-[10px] flex items-center gap-1"
            style={{ color: r.ok ? '#22c55e' : 'rgba(0,0,0,0.4)' }}>
            {r.ok ? '✓' : '○'} {r.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Field ────────────────────────────────────────────────────────────────────
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

function PasswordField({ label, value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = React.useState(false);
  return (
    <label className="block">
      <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-black/60 mb-2">{label}</div>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="w-full h-12 px-4 pr-12 bg-white border border-kado-black text-kado-black text-[15px] outline-none focus:border-kado-blue transition-colors font-mono"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-kado-black/40 hover:text-kado-black transition-colors"
          tabIndex={-1}
        >
          {show ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
              <line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          )}
        </button>
      </div>
    </label>
  );
}

// ── Email OTP Screen ─────────────────────────────────────────────────────────
function EmailOtpScreen({ otpToken, onSuccess, onBack }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/users/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp_token: otpToken, code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Invalid code'); return; }
      onSuccess(data);
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-black text-4xl tracking-[-0.03em] leading-none mb-2">Check your email</h2>
        <p className="text-kado-black/60 text-[15px]">We sent a 6-digit verification code to your email address.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field
          label="Verification Code"
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          autoFocus
        />
        {error && (
          <div className="border border-red-600 px-4 py-3 text-red-600 font-mono text-[12px] tracking-wide">! {error}</div>
        )}
        {resent && (
          <div className="border border-green-600 px-4 py-3 text-green-700 font-mono text-[12px] tracking-wide">✓ Code resent. Check your inbox.</div>
        )}
        <KadoButton type="submit" variant="blue" className="w-full" disabled={loading || code.length !== 6}>
          {loading ? 'Verifying...' : 'Verify →'}
        </KadoButton>
      </form>
      <button onClick={onBack} className="font-mono text-[11px] tracking-[0.2em] uppercase text-kado-black/40 hover:text-kado-black transition-colors">
        ← Back to login
      </button>
    </div>
  );
}

// ── 2FA Screen ───────────────────────────────────────────────────────────────
function TwoFAScreen({ partialToken, onSuccess, onBack }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/users/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partial_token: partialToken, code }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Invalid code'); return; }
      onSuccess(data);
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-black text-4xl tracking-[-0.03em] leading-none mb-2">Two-Factor Auth</h2>
        <p className="text-kado-black/60 text-[15px]">Enter the 6-digit code from your authenticator app.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-5">
        <Field
          label="Authenticator Code"
          type="text"
          inputMode="numeric"
          maxLength={6}
          value={code}
          onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          placeholder="000000"
          autoFocus
        />
        {error && (
          <div className="border border-red-600 px-4 py-3 text-red-600 font-mono text-[12px] tracking-wide">! {error}</div>
        )}
        <KadoButton type="submit" variant="blue" className="w-full" disabled={loading || code.length !== 6}>
          {loading ? 'Verifying...' : 'Verify →'}
        </KadoButton>
      </form>
      <button onClick={onBack} className="font-mono text-[11px] tracking-[0.2em] uppercase text-kado-black/40 hover:text-kado-black transition-colors">
        ← Back to login
      </button>
    </div>
  );
}

// ── Email Verify Screen ──────────────────────────────────────────────────────
function VerifyEmailScreen({ token }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    async function verify() {
      try {
        const res = await fetch('/api/users/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        if (res.ok) {
          setStatus('success');
          setMessage(data.message || 'Email verified successfully.');
        } else {
          setStatus('error');
          setMessage(data.detail || 'Verification failed. The link may have expired.');
        }
      } catch {
        setStatus('error');
        setMessage('Connection error — please try again.');
      }
    }
    verify();
  }, [token]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-black text-4xl tracking-[-0.03em] leading-none mb-2">Email Verification</h2>
      </div>
      {status === 'loading' && (
        <div className="font-mono text-[13px] text-kado-black/60 tracking-wide">Verifying your email…</div>
      )}
      {status === 'success' && (
        <>
          <div className="border border-green-600 px-4 py-3 text-green-700 font-mono text-[12px] tracking-wide">
            ✓ {message}
          </div>
          <KadoButton variant="blue" className="w-full" onClick={() => navigate('/auth')}>
            Continue to Login →
          </KadoButton>
        </>
      )}
      {status === 'error' && (
        <>
          <div className="border border-red-600 px-4 py-3 text-red-600 font-mono text-[12px] tracking-wide">
            ! {message}
          </div>
          <KadoButton variant="blue" className="w-full" onClick={() => navigate('/auth')}>
            Back to Login →
          </KadoButton>
        </>
      )}
    </div>
  );
}

// ── Forgot Password Screen ───────────────────────────────────────────────────
function ForgotPasswordScreen({ onBack }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/users/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) { setDone(true); }
      else { const d = await res.json(); setError(d.detail || 'Something went wrong'); }
    } catch { setError('Connection error'); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-black text-4xl tracking-[-0.03em] leading-none mb-2">Reset password</h2>
        <p className="text-kado-black/60 text-[15px]">Enter your email — we'll send a link to reset your password.</p>
      </div>
      {done ? (
        <div className="border border-green-600 px-4 py-3 text-green-700 font-mono text-[12px] tracking-wide">
          ✓ If this email is registered, a reset link has been sent. Check your inbox.
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <Field label="Email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@domain.com" autoFocus />
          {error && <div className="border border-red-600 px-4 py-3 text-red-600 font-mono text-[12px] tracking-wide">! {error}</div>}
          <KadoButton type="submit" variant="blue" className="w-full" disabled={loading || !email}>
            {loading ? 'Sending…' : 'Send reset link →'}
          </KadoButton>
        </form>
      )}
      <button onClick={onBack} className="font-mono text-[11px] tracking-[0.2em] uppercase text-kado-black/40 hover:text-kado-black transition-colors">
        ← Back to login
      </button>
    </div>
  );
}

// ── Reset Password Screen ─────────────────────────────────────────────────────
function ResetPasswordScreen({ token }) {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const { score } = checkStrength(password);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (score < 4) { setError('Password too weak'); return; }
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/users/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (res.ok) { setDone(true); }
      else { setError(data.detail || 'Ошибка'); }
    } catch { setError('Connection error'); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-black text-4xl tracking-[-0.03em] leading-none mb-2">New password</h2>
        <p className="text-kado-black/60 text-[15px]">Choose a new password for your account.</p>
      </div>
      {done ? (
        <>
          <div className="border border-green-600 px-4 py-3 text-green-700 font-mono text-[12px] tracking-wide">
            ✓ Password changed! Log in with your new password.
          </div>
          <KadoButton variant="blue" className="w-full" onClick={() => navigate('/auth')}>
            Log in →
          </KadoButton>
        </>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <PasswordField label="New password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            <StrengthMeter password={password} />
          </div>
          <PasswordField label="Confirm password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
          {error && <div className="border border-red-600 px-4 py-3 text-red-600 font-mono text-[12px] tracking-wide">! {error}</div>}
          <KadoButton type="submit" variant="blue" className="w-full" disabled={loading || !password || !confirm}>
            {loading ? 'Saving…' : 'Save password →'}
          </KadoButton>
        </form>
      )}
    </div>
  );
}

// ── Main Auth Page ───────────────────────────────────────────────────────────
export default function Auth() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const action = params.get('action');
  const verifyToken = params.get('token');
  const [mode, setMode] = useState(params.get('mode') === 'register' ? 'register' : 'login');
  const [form, setForm] = useState({ email: '', username: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [partialToken, setPartialToken] = useState(null);
  const [otpToken, setOtpToken] = useState(null);
  const [forgotMode, setForgotMode] = useState(false);

  useEffect(() => {
    setMode(params.get('mode') === 'register' ? 'register' : 'login');
    setPartialToken(null);
    setOtpToken(null);
  }, [params]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mode === 'register') {
      if (!form.username) { setError('Username required'); return; }
      const { score } = checkStrength(form.password);
      if (score < 4) { setError('Password too weak — must have 8+ chars, uppercase, number, and special character'); return; }
      if (form.password !== form.confirm) { setError('Passwords do not match'); return; }
    }
    if (!form.email || !form.password) { setError('All fields required'); return; }

    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/users/login' : '/api/users/register';
      const body = mode === 'login'
        ? { email: form.email, password: form.password }
        : { email: form.email, username: form.username, password: form.password, referral_source: 'direct' };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || 'Something went wrong'); return; }

      if (data.requires_2fa) {
        setPartialToken(data.partial_token);
        return;
      }

      if (data.requires_otp) {
        setOtpToken(data.otp_token);
        return;
      }

      localStorage.setItem('kado_token', data.token);
      localStorage.setItem('kado_user', JSON.stringify(data.user));
      navigate('/account');
    } catch {
      setError('Connection error — server unreachable');
    } finally {
      setLoading(false);
    }
  };

  function onAuthSuccess(data) {
    localStorage.setItem('kado_token', data.token);
    localStorage.setItem('kado_user', JSON.stringify(data.user));
    navigate('/account');
  }

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
          {action === 'verify' && verifyToken ? (
            <VerifyEmailScreen token={verifyToken} />
          ) : action === 'reset' && verifyToken ? (
            <ResetPasswordScreen token={verifyToken} />
          ) : otpToken ? (
            <EmailOtpScreen otpToken={otpToken} onSuccess={onAuthSuccess} onBack={() => setOtpToken(null)} />
          ) : partialToken ? (
            <TwoFAScreen partialToken={partialToken} onSuccess={onAuthSuccess} onBack={() => setPartialToken(null)} />
          ) : forgotMode ? (
            <ForgotPasswordScreen onBack={() => setForgotMode(false)} />
          ) : (
            <>
              <div className="flex border-b border-kado-black mb-10">
                {['login', 'register'].map((m) => (
                  <button
                    key={m}
                    onClick={() => { setMode(m); setError(''); }}
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
                <Field label="Email" type="email" value={form.email} onChange={set('email')} placeholder="you@domain.com" autoComplete="email" />
                {mode === 'register' && (
                  <Field label="Username" type="text" value={form.username} onChange={set('username')} placeholder="yourname" autoComplete="username" />
                )}
                <div>
                  <PasswordField label="Password" value={form.password} onChange={set('password')} placeholder="••••••••" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
                  {mode === 'register' && <StrengthMeter password={form.password} />}
                  {mode === 'login' && (
                    <button type="button" onClick={() => { setForgotMode(true); setError(''); }} className="mt-1.5 font-mono text-[10px] tracking-[0.2em] uppercase text-kado-black/40 hover:text-kado-blue transition-colors">
                      Forgot password?
                    </button>
                  )}
                </div>
                {mode === 'register' && (
                  <PasswordField label="Confirm Password" value={form.confirm} onChange={set('confirm')} placeholder="••••••••" autoComplete="new-password" />
                )}
                {error && (
                  <div className="border border-red-600 px-4 py-3 text-red-600 font-mono text-[12px] tracking-wide">
                    ! {error}
                  </div>
                )}
                <KadoButton type="submit" variant="blue" className="w-full" disabled={loading}>
                  {loading ? 'Please wait...' : mode === 'login' ? 'Login →' : 'Create Account →'}
                </KadoButton>
              </form>

              <div className="mt-8 font-mono text-[11px] tracking-[0.2em] uppercase text-kado-black/60 flex flex-col gap-3">
                {mode === 'login' ? (
                  <button type="button" onClick={() => { setMode('register'); setError(''); }} className="hover:text-kado-blue transition-colors text-left">
                    No account? Sign up →
                  </button>
                ) : (
                  <button type="button" onClick={() => { setMode('login'); setError(''); }} className="hover:text-kado-blue transition-colors text-left">
                    Already have an account? Log in →
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
