import React, { useEffect, useState } from 'react';

const API = (path, opts) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}`, 'Content-Type': 'application/json' },
  ...opts,
}).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.detail || 'Error')));

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const inp = { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '10px 14px', fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' };

export default function SettingsTab() {
  const [me, setMe] = useState(null);
  const [tgId, setTgId] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    API('/api/users/me').then(d => { setMe(d); setTgId(d.tg_chat_id || ''); }).catch(console.error);
  }, []);

  async function saveProfile(e) {
    e.preventDefault();
    setMsg(''); setSaving(true);
    try {
      await API('/api/users/me', { method: 'PUT', body: JSON.stringify({ tg_chat_id: tgId }) });
      setMsg('Saved');
    } catch (e) { setMsg(e); }
    finally { setSaving(false); }
  }

  async function setup2fa() {
    try {
      const { qr, secret } = await API('/api/users/2fa/setup');
      const code = prompt(`Scan this QR in your authenticator app.\nOr enter secret manually: ${secret}\n\nThen enter the 6-digit code:`);
      if (!code) return;
      await API('/api/users/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
      setMe(m => ({ ...m, totp_enabled: true }));
      alert('2FA enabled');
    } catch (e) { alert(typeof e === 'string' ? e : 'Failed to enable 2FA'); }
  }

  async function disable2fa() {
    const code = prompt('Enter your 6-digit authenticator code to disable 2FA:');
    if (!code) return;
    try {
      await API('/api/users/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) });
      setMe(m => ({ ...m, totp_enabled: false }));
      alert('2FA disabled');
    } catch (e) { alert(typeof e === 'string' ? e : 'Failed'); }
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <form onSubmit={saveProfile}>
        <Field label="Email">
          <input type="text" value={me?.email || ''} disabled style={{ ...inp, opacity: 0.45, cursor: 'not-allowed' }} />
        </Field>

        <Field label="Plan">
          <span style={{ fontSize: 11, letterSpacing: '0.12em', padding: '3px 8px', border: '1px solid var(--border)', color: 'var(--muted-fg)' }}>
            {me?.plan?.toUpperCase() || '—'}
          </span>
          {me?.subscription_expires && (
            <span style={{ fontSize: 12, color: 'var(--muted-fg)', marginLeft: 10 }}>
              expires {new Date(me.subscription_expires).toLocaleDateString()}
            </span>
          )}
        </Field>

        <Field label="Telegram Chat ID">
          <input type="text" value={tgId} onChange={e => setTgId(e.target.value)} placeholder="e.g. 123456789" style={inp} />
          <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginTop: 4 }}>Get it from @userinfobot on Telegram</div>
        </Field>

        {msg && <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginBottom: 12 }}>{msg}</div>}

        <button type="submit" disabled={saving} style={{ background: 'var(--fg)', color: 'var(--bg)', border: 'none', padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1, marginBottom: 32 }}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </form>

      {/* 2FA */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 12 }}>Two-factor auth</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: me?.totp_enabled ? 'var(--fg)' : 'var(--muted-fg)' }}>
            {me?.totp_enabled ? 'Enabled' : 'Disabled'}
          </span>
          {me?.totp_enabled ? (
            <button onClick={disable2fa} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted-fg)', padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
              Disable 2FA
            </button>
          ) : (
            <button onClick={setup2fa} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--fg)', padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
              Enable 2FA
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
