import React, { useEffect, useState, useCallback } from 'react';

const API = (path, opts) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}`, 'Content-Type': 'application/json' },
  ...opts,
}).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.detail || 'Error')));

const inp = { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '10px 14px', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box' };
const monoSm = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em' };

// ─── 2FA Modal ────────────────────────────────────────────────────────────────

function TwoFAModal({ mode, onClose, onDone }) {
  const [step, setStep]           = useState(mode === 'setup' ? 'password' : 'disable');
  const [password, setPassword]   = useState('');
  const [qr, setQr]               = useState('');
  const [secret, setSecret]       = useState('');
  const [code, setCode]           = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState('');
  const [copied, setCopied]       = useState(false);

  const overlay  = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 };
  const modal    = { background: 'var(--bg)', border: '1px solid var(--border)', padding: '28px 28px 24px', width: '100%', maxWidth: 400, maxHeight: '90vh', overflowY: 'auto' };
  const title    = { fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 6 };
  const sub      = { fontSize: 12, color: 'var(--muted-fg)', marginBottom: 20, lineHeight: 1.5 };
  const btnPrimary   = { background: 'var(--fg)', color: 'var(--bg)', border: 'none', padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', width: '100%', opacity: loading ? 0.6 : 1 };
  const btnSecondary = { background: 'none', border: '1px solid var(--border)', color: 'var(--muted-fg)', padding: '8px 16px', fontSize: 12, cursor: 'pointer', marginTop: 8, width: '100%' };

  async function submitPassword(e) {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const data = await API('/api/users/2fa/setup', { method: 'POST', body: JSON.stringify({ password }) });
      setQr(data.qr); setSecret(data.secret); setStep('scan');
    } catch (e) { setErr(typeof e === 'string' ? e : 'Wrong password'); }
    finally { setLoading(false); }
  }

  async function submitCode(e) {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const data = await API('/api/users/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
      setRecoveryCodes(data.recovery_codes || []); setStep('codes');
    } catch (e) { setErr(typeof e === 'string' ? e : 'Wrong code'); }
    finally { setLoading(false); }
  }

  async function submitDisable(e) {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      await API('/api/users/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) });
      onDone(false);
    } catch (e) { setErr(typeof e === 'string' ? e : 'Wrong code'); }
    finally { setLoading(false); }
  }

  function copyAll() {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        {step === 'password' && (
          <form onSubmit={submitPassword}>
            <div style={title}>Enable 2FA</div>
            <div style={sub}>Enter your account password to continue.</div>
            <input type="password" autoFocus required placeholder="Your password" value={password} onChange={e => setPassword(e.target.value)} style={{ ...inp, marginBottom: 12 }} />
            {err && <div style={{ fontSize: 12, color: '#e55', marginBottom: 10 }}>{err}</div>}
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? 'Checking…' : 'Continue →'}</button>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          </form>
        )}

        {step === 'scan' && (
          <form onSubmit={submitCode}>
            <div style={title}>Scan QR Code</div>
            <div style={sub}>Open Google Authenticator, Authy, or any TOTP app and scan the code below.</div>
            {qr && <div style={{ textAlign: 'center', marginBottom: 16 }}><img src={qr} alt="2FA QR" style={{ width: 180, height: 180, imageRendering: 'pixelated' }} /></div>}
            <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginBottom: 4 }}>Or enter the secret manually:</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', background: 'var(--bg2)', border: '1px solid var(--border)', padding: '8px 10px', wordBreak: 'break-all', marginBottom: 16 }}>{secret}</div>
            <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginBottom: 6 }}>Enter the 6-digit code from your app:</div>
            <input type="text" autoFocus required inputMode="numeric" placeholder="000000" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} style={{ ...inp, letterSpacing: '0.2em', textAlign: 'center', fontSize: 18, marginBottom: 12 }} />
            {err && <div style={{ fontSize: 12, color: '#e55', marginBottom: 10 }}>{err}</div>}
            <button type="submit" disabled={loading || code.length < 6} style={{ ...btnPrimary, opacity: (loading || code.length < 6) ? 0.5 : 1 }}>{loading ? 'Checking…' : 'Verify →'}</button>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          </form>
        )}

        {step === 'codes' && (
          <div>
            <div style={title}>2FA Enabled</div>
            <div style={sub}>Save these recovery codes — each is single-use if you lose access to your authenticator app. They won't be shown again after closing this window.</div>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '12px 14px', marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
              {recoveryCodes.map((c, i) => <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg)' }}>{c}</span>)}
            </div>
            <button onClick={copyAll} style={{ ...btnSecondary, marginTop: 0, marginBottom: 12, color: copied ? '#5a5' : 'var(--muted-fg)' }}>{copied ? '✓ Copied' : 'Copy all'}</button>
            <button onClick={() => onDone(true)} style={btnPrimary}>Done</button>
          </div>
        )}

        {step === 'disable' && (
          <form onSubmit={submitDisable}>
            <div style={title}>Disable 2FA</div>
            <div style={sub}>Enter the 6-digit code from your authenticator app to confirm.</div>
            <input type="text" autoFocus required inputMode="numeric" placeholder="000000" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} style={{ ...inp, letterSpacing: '0.2em', textAlign: 'center', fontSize: 18, marginBottom: 12 }} />
            {err && <div style={{ fontSize: 12, color: '#e55', marginBottom: 10 }}>{err}</div>}
            <button type="submit" disabled={loading || code.length < 6} style={{ ...btnPrimary, background: '#c55', opacity: (loading || code.length < 6) ? 0.5 : 1 }}>{loading ? 'Checking…' : 'Disable 2FA'}</button>
            <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          </form>
        )}
      </div>
    </div>
  );
}

// ─── API Keys section (inline, no separate file needed) ───────────────────────

function ApiKeysSection({ me, onUpdate }) {
  const [apiKey, setApiKey]     = useState('');
  const [secret, setSecret]     = useState('');
  const [testnet, setTestnet]   = useState(false);
  const [showKey, setShowKey]   = useState(false);
  const [showSec, setShowSec]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');
  const [revealMode, setRevealMode]       = useState(false);
  const [revealPwd, setRevealPwd]         = useState('');
  const [revealLoading, setRevealLoading] = useState(false);
  const [revealed, setRevealed]           = useState(null);

  const copyText = useCallback((text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      setSuccess(`${label} copied`);
      setTimeout(() => setSuccess(''), 1500);
    });
  }, []);

  async function save(e) {
    e.preventDefault(); setError(''); setSuccess('');
    if (!apiKey || !secret) { setError('Both fields are required'); return; }
    setSaving(true);
    try {
      await API('/api/users/keys', { method: 'POST', body: JSON.stringify({ api_key: apiKey, secret, is_testnet: testnet }) });
      setSuccess('Keys saved. Bot will begin trading on your account.');
      onUpdate({ has_api_keys: true, api_key_testnet: testnet });
      setApiKey(''); setSecret(''); setRevealed(null);
    } catch (e) { setError(e); }
    finally { setSaving(false); }
  }

  async function del() {
    if (!confirm('Remove API keys? The bot will stop trading on your account.')) return;
    setError(''); setSuccess(''); setDeleting(true);
    try {
      await API('/api/users/keys', { method: 'DELETE' });
      setSuccess('Keys removed. Trading stopped.');
      onUpdate({ has_api_keys: false });
      setRevealed(null); setRevealMode(false);
    } catch (e) { setError(e); }
    finally { setDeleting(false); }
  }

  async function reveal(e) {
    e.preventDefault(); if (!revealPwd) return;
    setRevealLoading(true); setError('');
    try {
      const data = await API('/api/users/keys/reveal', { method: 'POST', body: JSON.stringify({ password: revealPwd }) });
      setRevealed(data); setRevealPwd(''); setRevealMode(false);
    } catch (e) { setError(typeof e === 'string' ? e : 'Wrong password'); }
    finally { setRevealLoading(false); }
  }

  return (
    <div>
      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: me?.has_api_keys ? '#22c55e' : 'var(--muted-fg)', opacity: me?.has_api_keys ? 1 : 0.35 }} />
        <span style={{ fontSize: 13 }}>Bybit API — {me?.has_api_keys ? 'Connected' : 'Not connected'}</span>
        {me?.has_api_keys && me?.api_key_testnet && <span style={{ fontSize: 10, color: 'var(--muted-fg)', letterSpacing: '0.1em' }}>TESTNET</span>}
        {me?.has_api_keys && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#22c55e', letterSpacing: '0.08em' }}>● ACTIVE</span>}
      </div>

      {/* Revealed key */}
      {revealed && (
        <div style={{ border: '1px solid var(--border)', padding: 16, marginBottom: 20, background: 'var(--bg2)' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--muted-fg)', marginBottom: 10, textTransform: 'uppercase' }}>Connected key</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--muted-fg)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>API Key</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ ...monoSm, flex: 1, wordBreak: 'break-all', color: 'var(--fg)' }}>{revealed.api_key}</code>
              <button onClick={() => copyText(revealed.api_key, 'API key')} style={{ ...monoSm, background: 'none', border: '1px solid var(--border)', color: 'var(--muted-fg)', padding: '3px 8px', cursor: 'pointer' }}>COPY</button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted-fg)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Secret (masked)</div>
            <code style={{ ...monoSm, color: 'var(--fg)' }}>{revealed.masked_secret}</code>
          </div>
          <button onClick={() => setRevealed(null)} style={{ marginTop: 12, fontSize: 10, background: 'none', border: 'none', color: 'var(--muted-fg)', cursor: 'pointer', letterSpacing: '0.06em' }}>HIDE</button>
        </div>
      )}

      {/* Reveal password form */}
      {me?.has_api_keys && revealMode && !revealed && (
        <form onSubmit={reveal} style={{ border: '1px solid var(--border)', padding: 16, marginBottom: 20, background: 'var(--bg2)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginBottom: 10, lineHeight: 1.5 }}>Enter your account password to reveal the connected API key.</div>
          <input type="password" value={revealPwd} onChange={e => setRevealPwd(e.target.value)} placeholder="Account password" style={{ ...inp, marginBottom: 10 }} autoComplete="current-password" autoFocus />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={revealLoading || !revealPwd} style={{ background: 'var(--fg)', color: 'var(--bg)', border: 'none', padding: '8px 18px', fontSize: 12, fontFamily: 'var(--font-mono)', cursor: 'pointer', opacity: (revealLoading || !revealPwd) ? 0.5 : 1 }}>
              {revealLoading ? 'Checking…' : 'Confirm'}
            </button>
            <button type="button" onClick={() => { setRevealMode(false); setRevealPwd(''); }} style={{ background: 'none', border: 'none', color: 'var(--muted-fg)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          </div>
        </form>
      )}

      {/* Permission warning */}
      <div style={{ border: '1px solid var(--border)', padding: '10px 14px', marginBottom: 20, fontSize: 12, color: 'var(--muted-fg)', lineHeight: 1.6 }}>
        Grant <strong style={{ color: 'var(--fg)' }}>Trade + Position</strong> permissions only.{' '}
        <strong style={{ color: 'var(--fg)' }}>Never</strong> enable Withdrawal.
      </div>

      {/* Key form */}
      <form onSubmit={save} autoComplete="off">
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 5 }}>API Key</div>
          <div style={{ position: 'relative' }}>
            <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste your Bybit API key" style={inp} name="bybit-api-key" autoComplete="new-password" />
            <button type="button" onClick={() => setShowKey(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted-fg)', cursor: 'pointer', fontSize: 10 }}>{showKey ? 'HIDE' : 'SHOW'}</button>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 5 }}>Secret</div>
          <div style={{ position: 'relative' }}>
            <input type={showSec ? 'text' : 'password'} value={secret} onChange={e => setSecret(e.target.value)} placeholder="Paste your Bybit secret" style={inp} name="bybit-api-secret" autoComplete="new-password" />
            <button type="button" onClick={() => setShowSec(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted-fg)', cursor: 'pointer', fontSize: 10 }}>{showSec ? 'HIDE' : 'SHOW'}</button>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={testnet} onChange={e => setTestnet(e.target.checked)} style={{ accentColor: 'var(--fg)' }} />
          <span>Testnet mode</span>
        </label>

        {error && <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginBottom: 12, borderLeft: '2px solid var(--border-hi)', paddingLeft: 10 }}>{error}</div>}
        {success && <div style={{ fontSize: 12, color: '#22c55e', marginBottom: 12 }}>{success}</div>}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" disabled={saving} style={{ background: 'var(--fg)', color: 'var(--bg)', border: 'none', padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : (me?.has_api_keys ? 'Update keys' : 'Save keys')}
          </button>
          {me?.has_api_keys && !revealMode && !revealed && (
            <button type="button" onClick={() => setRevealMode(true)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted-fg)', fontSize: 11, padding: '8px 14px', cursor: 'pointer', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
              VIEW KEY
            </button>
          )}
          {me?.has_api_keys && (
            <button type="button" onClick={del} disabled={deleting} style={{ background: 'none', border: 'none', color: 'var(--muted-fg)', fontSize: 12, cursor: 'pointer', opacity: deleting ? 0.4 : 1 }}>
              {deleting ? 'Removing…' : 'Remove'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ─── Security row component ───────────────────────────────────────────────────

function SecurityRow({ label, status, statusColor, action, actionLabel, description }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: 'var(--muted-fg)', lineHeight: 1.5 }}>{description}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {status && (
          <span style={{ fontSize: 11, letterSpacing: '0.08em', padding: '3px 8px', border: `1px solid ${statusColor}33`, color: statusColor }}>
            {status}
          </span>
        )}
        {action && (
          <button onClick={action} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted-fg)', padding: '6px 14px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SecurityTab() {
  const [me, setMe]           = useState(null);
  const [modal2fa, setModal2fa] = useState(null);
  const [section, setSection] = useState('overview'); // 'overview' | 'apikeys'

  useEffect(() => {
    API('/api/users/me').then(setMe).catch(console.error);
  }, []);

  function updateMe(patch) {
    setMe(m => ({ ...m, ...patch }));
  }

  function on2faDone(enabled) {
    updateMe({ totp_enabled: enabled });
    setModal2fa(null);
  }

  const secScore = !me ? 0 : (me.totp_enabled ? 50 : 0) + (me.has_api_keys ? 30 : 0) + 20;

  return (
    <div style={{ maxWidth: 560 }}>
      {modal2fa && <TwoFAModal mode={modal2fa} onClose={() => setModal2fa(null)} onDone={on2faDone} />}

      {/* Sub-nav */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'overview', label: 'Security' },
          { id: 'apikeys',  label: 'API Keys' },
        ].map(s => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            style={{
              background: 'none', border: 'none',
              borderBottom: `2px solid ${section === s.id ? 'var(--fg)' : 'transparent'}`,
              color: section === s.id ? 'var(--fg)' : 'var(--muted-fg)',
              padding: '0 0 12px', marginRight: 24,
              fontSize: 13, cursor: 'pointer',
              fontFamily: 'var(--font-sans)',
              transition: 'color 150ms',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* ── SECURITY OVERVIEW ── */}
      {section === 'overview' && (
        <div>
          {/* Score */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28, padding: '16px 20px', border: '1px solid var(--border)', background: 'var(--bg2)' }}>
            <div style={{ position: 'relative', width: 52, height: 52, flexShrink: 0 }}>
              <svg viewBox="0 0 52 52" style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
                <circle cx="26" cy="26" r="22" fill="none" stroke="var(--border)" strokeWidth="4" />
                <circle cx="26" cy="26" r="22" fill="none" stroke={secScore >= 80 ? '#22c55e' : secScore >= 50 ? '#eab308' : '#ef4444'} strokeWidth="4" strokeDasharray={`${2 * Math.PI * 22 * secScore / 100} ${2 * Math.PI * 22}`} strokeLinecap="round" />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{secScore}</div>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>
                {secScore >= 80 ? 'Strong' : secScore >= 50 ? 'Medium' : 'Weak'} security
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted-fg)', lineHeight: 1.5 }}>
                {secScore < 100 && 'Enable 2FA and connect API keys to improve your score.'}
                {secScore === 100 && 'All security features are active.'}
              </div>
            </div>
          </div>

          {/* Rows */}
          <SecurityRow
            label="Two-Factor Authentication"
            description={me?.totp_enabled ? 'Google Authenticator or Authy. Required on every login.' : 'Protect your account with an authenticator app.'}
            status={me?.totp_enabled ? 'Enabled' : 'Disabled'}
            statusColor={me?.totp_enabled ? '#22c55e' : '#ef4444'}
            action={() => setModal2fa(me?.totp_enabled ? 'disable' : 'setup')}
            actionLabel={me?.totp_enabled ? 'Disable' : 'Enable →'}
          />

          <SecurityRow
            label="Bybit API Keys"
            description={me?.has_api_keys
              ? `Bot is trading on your Bybit ${me.api_key_testnet ? 'testnet' : 'live'} account.`
              : 'Connect your Bybit API keys to start automated trading.'}
            status={me?.has_api_keys ? 'Connected' : 'Not connected'}
            statusColor={me?.has_api_keys ? '#22c55e' : '#555'}
            action={() => setSection('apikeys')}
            actionLabel={me?.has_api_keys ? 'Manage' : 'Connect →'}
          />

          <SecurityRow
            label="Encryption"
            description="All API keys are stored encrypted with AES-256 (Fernet). Keys are never logged in plaintext."
            status="Active"
            statusColor="#22c55e"
          />

          {/* Email */}
          <div style={{ padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 3 }}>Account email</div>
            <div style={{ fontSize: 12, color: 'var(--muted-fg)', fontFamily: 'var(--font-mono)' }}>{me?.email || '—'}</div>
          </div>
        </div>
      )}

      {/* ── API KEYS ── */}
      {section === 'apikeys' && (
        <ApiKeysSection me={me} onUpdate={updateMe} />
      )}
    </div>
  );
}
