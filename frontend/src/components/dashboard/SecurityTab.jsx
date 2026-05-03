import React, { useState, useEffect } from 'react';
import { authFetch } from '@/lib/api';
import { ShieldCheck, ShieldOff, QrCode, Smartphone } from 'lucide-react';

function Section({ title, icon: Icon, children }) {
  return (
    <div className="border border-kado-black p-6">
      <div className="flex items-center gap-3 mb-6 pb-4 border-b border-kado-black">
        <Icon size={16} />
        <h3 className="font-mono text-[11px] tracking-[0.3em] uppercase">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export default function SecurityTab() {
  const [user, setUser] = useState(null);
  const [step, setStep] = useState('idle'); // idle | confirm-pw | setup | enable | disable
  const [qr, setQr] = useState(null);
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    authFetch('/api/users/me').then(r => r.json()).then(setUser);
  }, []);

  function notice(text, type = 'ok') {
    setMsg({ text, type });
    setTimeout(() => setMsg({ text: '', type: '' }), 4000);
  }

  async function confirmPasswordAndSetup() {
    if (!pw) { notice('Введите пароль', 'err'); return; }
    const r = await authFetch('/api/users/2fa/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    });
    const d = await r.json();
    if (!r.ok) { notice(d.detail, 'err'); return; }
    setPw('');
    setQr(d.qr);
    setSecret(d.secret);
    setStep('setup');
  }

  async function enableTotp() {
    const r = await authFetch('/api/users/2fa/enable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const d = await r.json();
    if (!r.ok) { notice(d.detail, 'err'); return; }
    notice('2FA enabled successfully!');
    setUser(u => ({ ...u, totp_enabled: true }));
    setStep('idle');
    setCode('');
  }

  async function disableTotp() {
    const r = await authFetch('/api/users/2fa/disable', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const d = await r.json();
    if (!r.ok) { notice(d.detail, 'err'); return; }
    notice('2FA disabled.');
    setUser(u => ({ ...u, totp_enabled: false }));
    setStep('idle');
    setCode('');
  }

  if (!user) return <div className="p-8 font-mono text-sm text-kado-black/40">Loading...</div>;

  return (
    <div className="p-4 md:p-8 max-w-2xl space-y-6">
      {/* Email verification */}
      <Section title="Email Verification" icon={ShieldCheck}>
        <div className="flex items-center justify-between">
          <div>
            <div className="font-mono text-[13px] mb-1">{user.email}</div>
            <div className="font-mono text-[11px]" style={{ color: user.email_verified ? '#22c55e' : '#f59e0b' }}>
              {user.email_verified ? '✓ Verified' : '⚠ Not verified'}
            </div>
          </div>
          {!user.email_verified && (
            <div className="font-mono text-[10px] tracking-widest uppercase text-kado-black/40 border border-kado-black/20 px-3 py-1">
              Check inbox
            </div>
          )}
        </div>
      </Section>

      {/* 2FA */}
      <Section title="Two-Factor Authentication" icon={Smartphone}>
        {msg.text && (
          <div className={`mb-4 px-4 py-3 font-mono text-[12px] border ${msg.type === 'err' ? 'border-red-400 text-red-600' : 'border-green-400 text-green-700'}`}>
            {msg.text}
          </div>
        )}

        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="font-mono text-[13px] mb-1">Authenticator App (TOTP)</div>
            <div className="font-mono text-[11px] text-kado-black/50">
              Google Authenticator, Authy, or any TOTP app
            </div>
          </div>
          <div className={`font-mono text-[11px] tracking-widest uppercase px-3 py-1 border ${user.totp_enabled ? 'border-green-400 text-green-700 bg-green-50' : 'border-kado-black/20 text-kado-black/40'}`}>
            {user.totp_enabled ? '● Active' : '○ Off'}
          </div>
        </div>

        {/* Setup flow */}
        {!user.totp_enabled && step === 'idle' && (
          <button
            onClick={() => setStep('confirm-pw')}
            className="h-10 px-6 font-mono text-[11px] tracking-[0.2em] uppercase bg-kado-black text-white hover:bg-kado-blue transition-colors"
          >
            Enable 2FA →
          </button>
        )}

        {!user.totp_enabled && step === 'confirm-pw' && (
          <div className="space-y-3">
            <p className="font-mono text-[12px] text-kado-black/60">Подтвердите пароль для включения 2FA:</p>
            <div className="flex gap-3">
              <input
                type="password"
                value={pw}
                onChange={e => setPw(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && confirmPasswordAndSetup()}
                placeholder="Ваш пароль"
                className="flex-1 h-10 px-4 border border-kado-black font-mono text-[13px] outline-none focus:border-kado-blue"
              />
              <button
                onClick={confirmPasswordAndSetup}
                className="h-10 px-6 font-mono text-[11px] tracking-[0.2em] uppercase bg-kado-black text-white hover:bg-kado-blue transition-colors"
              >
                Далее →
              </button>
              <button
                onClick={() => { setStep('idle'); setPw(''); }}
                className="h-10 px-4 font-mono text-[11px] tracking-[0.2em] uppercase border border-kado-black text-kado-black/50 hover:text-kado-black transition-colors"
              >
                Отмена
              </button>
            </div>
          </div>
        )}

        {step === 'setup' && qr && (
          <div className="space-y-4">
            <p className="font-mono text-[12px] text-kado-black/60">
              1. Scan this QR code with your authenticator app:
            </p>
            <img src={qr} alt="2FA QR" className="border border-kado-black/20" style={{ width: 180, height: 180 }} />
            <p className="font-mono text-[11px] text-kado-black/50">
              Or enter manually: <span className="text-kado-black font-bold tracking-wider">{secret}</span>
            </p>
            <p className="font-mono text-[12px] text-kado-black/60">
              2. Enter the 6-digit code to confirm:
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-36 h-10 px-4 border border-kado-black font-mono text-[15px] outline-none focus:border-kado-blue"
              />
              <button
                onClick={enableTotp}
                disabled={code.length !== 6}
                className="h-10 px-6 font-mono text-[11px] tracking-[0.2em] uppercase bg-kado-blue text-white disabled:opacity-40 transition-opacity"
              >
                Confirm
              </button>
              <button
                onClick={() => { setStep('idle'); setCode(''); }}
                className="h-10 px-4 font-mono text-[11px] tracking-[0.2em] uppercase border border-kado-black text-kado-black/50 hover:text-kado-black transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {user.totp_enabled && step === 'idle' && (
          <button
            onClick={() => setStep('disable')}
            className="h-10 px-6 font-mono text-[11px] tracking-[0.2em] uppercase border border-red-400 text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2"
          >
            <ShieldOff size={13} /> Disable 2FA
          </button>
        )}

        {step === 'disable' && (
          <div className="space-y-3">
            <p className="font-mono text-[12px] text-red-600">Enter your current authenticator code to disable 2FA:</p>
            <div className="flex gap-3">
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-36 h-10 px-4 border border-red-400 font-mono text-[15px] outline-none"
                autoFocus
              />
              <button
                onClick={disableTotp}
                disabled={code.length !== 6}
                className="h-10 px-6 font-mono text-[11px] tracking-[0.2em] uppercase bg-red-500 text-white disabled:opacity-40"
              >
                Disable
              </button>
              <button
                onClick={() => { setStep('idle'); setCode(''); }}
                className="h-10 px-4 font-mono text-[11px] uppercase border border-kado-black text-kado-black/50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}
