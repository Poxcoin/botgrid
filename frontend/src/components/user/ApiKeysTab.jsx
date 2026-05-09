import React, { useEffect, useState } from 'react';

const API = (path, opts) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}`, 'Content-Type': 'application/json' },
  ...opts,
}).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.detail || 'Error')));

const inp = { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '10px 14px', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box' };

function maskKey(key) {
  if (!key || key.length < 6) return '••••••••••••••••';
  return key.slice(0, 4) + '••••••••••••' + key.slice(-2);
}

export default function ApiKeysTab() {
  const [me, setMe]           = useState(null);
  const [apiKey, setApiKey]   = useState('');
  const [secret, setSecret]   = useState('');
  const [testnet, setTestnet] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showSec, setShowSec] = useState(false);
  const [saving, setSaving]   = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');
  const [maskedKey, setMaskedKey] = useState('');

  useEffect(() => {
    API('/api/users/me').then(d => {
      setMe(d);
      if (d.bybit_api_key_masked) setMaskedKey(d.bybit_api_key_masked);
    }).catch(console.error);
  }, []);

  async function save(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!apiKey || !secret) { setError('Both fields are required'); return; }
    setSaving(true);
    try {
      await API('/api/users/keys', { method: 'POST', body: JSON.stringify({ api_key: apiKey, secret, is_testnet: testnet }) });
      setMaskedKey(maskKey(apiKey));
      setSuccess('Keys saved. Bot will begin trading on your account.');
      setMe(m => ({ ...m, has_api_keys: true, api_key_testnet: testnet }));
      setApiKey(''); setSecret('');
      setShowKey(false); setShowSec(false);
    } catch (e) { setError(e); }
    finally { setSaving(false); }
  }

  async function del() {
    if (!confirm('Remove API keys? The bot will stop trading on your account.')) return;
    setError(''); setSuccess('');
    setDeleting(true);
    try {
      await API('/api/users/keys', { method: 'DELETE' });
      setSuccess('Keys removed. Trading stopped.');
      setMe(m => ({ ...m, has_api_keys: false }));
      setMaskedKey('');
    } catch (e) { setError(e); }
    finally { setDeleting(false); }
  }

  return (
    <div style={{ width: '100%', maxWidth: 600 }}>

      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: me?.has_api_keys ? 'var(--fg)' : 'var(--muted-fg)', opacity: me?.has_api_keys ? 1 : 0.4 }} />
        <span style={{ fontSize: 13 }}>Bybit API — {me?.has_api_keys ? 'Connected' : 'Not connected'}</span>
        {me?.has_api_keys && me?.api_key_testnet && (
          <span style={{ fontSize: 11, color: 'var(--muted-fg)', letterSpacing: '0.08em' }}>TESTNET</span>
        )}
        {me?.has_api_keys && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: '#22c55e', letterSpacing: '0.06em' }}>● BOT ACTIVE</span>
        )}
      </div>

      {/* Connected key display — masked, no reveal */}
      {me?.has_api_keys && (
        <div style={{ border: '1px solid rgba(34,197,94,0.15)', background: 'rgba(34,197,94,0.04)', padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--muted-fg)', marginBottom: 8, textTransform: 'uppercase' }}>Connected key</div>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg)', letterSpacing: '0.06em' }}>
            {maskedKey || '••••••••••••••••'}
          </code>
          <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginTop: 6 }}>
            Secret: ••••••••••••••••••••••••••••••••
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginTop: 4 }}>
            The bot uses your API key to execute trades automatically on your Bybit account.
            You keep full control — remove keys at any time to stop trading.
          </div>
        </div>
      )}

      {/* Security warning */}
      <div style={{ border: '1px solid var(--border)', padding: '12px 16px', marginBottom: 24, fontSize: 12, color: 'var(--muted-fg)', lineHeight: 1.6 }}>
        Grant <strong style={{ color: 'var(--fg)' }}>Trade + Position</strong> permissions only.<br />
        <strong style={{ color: 'var(--fg)' }}>Never</strong> enable Withdrawal permission.
      </div>

      {/* Save / Update form */}
      <form onSubmit={save} autoComplete="off">
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 6 }}>
            {me?.has_api_keys ? 'New API Key' : 'API Key'}
          </div>
          <div style={{ position: 'relative' }}>
            <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)}
              placeholder="Paste your Bybit API key" style={inp} name="bybit-api-key" autoComplete="new-password" />
            <button type="button" onClick={() => setShowKey(v => !v)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted-fg)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              {showKey ? 'HIDE' : 'SHOW'}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 6 }}>
            {me?.has_api_keys ? 'New Secret' : 'Secret'}
          </div>
          <div style={{ position: 'relative' }}>
            <input type={showSec ? 'text' : 'password'} value={secret} onChange={e => setSecret(e.target.value)}
              placeholder="Paste your Bybit secret" style={inp} name="bybit-api-secret" autoComplete="new-password" />
            <button type="button" onClick={() => setShowSec(v => !v)}
              style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted-fg)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
              {showSec ? 'HIDE' : 'SHOW'}
            </button>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={testnet} onChange={e => setTestnet(e.target.checked)} style={{ accentColor: 'var(--fg)' }} />
          <span>Testnet mode</span>
        </label>

        {error && <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginBottom: 12, borderLeft: '2px solid var(--border-hi)', paddingLeft: 10 }}>{error}</div>}
        {success && <div style={{ fontSize: 12, color: 'var(--fg)', marginBottom: 12 }}>{success}</div>}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" disabled={saving} style={{ background: 'var(--fg)', color: 'var(--bg)', border: 'none', padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : (me?.has_api_keys ? 'Update keys' : 'Save keys')}
          </button>
          {me?.has_api_keys && (
            <button type="button" onClick={del} disabled={deleting}
              style={{ background: 'none', border: 'none', color: 'var(--muted-fg)', fontSize: 13, cursor: 'pointer', opacity: deleting ? 0.4 : 1 }}>
              {deleting ? 'Removing…' : 'Delete'}
            </button>
          )}
        </div>
      </form>

      {/* Security info */}
      <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 10 }}>Security</div>
        <div style={{ fontSize: 12, color: 'var(--muted-fg)', lineHeight: 1.7 }}>
          Your keys are stored encrypted (AES-256/Fernet) and never logged in plaintext.<br />
          Keys are write-only — once saved they cannot be retrieved, only replaced or deleted.<br />
          {me?.totp_enabled
            ? <span style={{ color: '#22c55e' }}>✓ Two-factor authentication enabled</span>
            : <span>Two-factor authentication is <strong style={{ color: 'var(--fg)' }}>not enabled</strong> — enable it in Security settings.</span>
          }
        </div>
      </div>

    </div>
  );
}
