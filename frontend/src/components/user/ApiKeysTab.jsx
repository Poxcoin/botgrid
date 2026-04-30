import React, { useEffect, useState } from 'react';

const API = (path, opts) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}`, 'Content-Type': 'application/json' },
  ...opts,
}).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.detail || 'Error')));

export default function ApiKeysTab() {
  const [me, setMe] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [secret, setSecret] = useState('');
  const [testnet, setTestnet] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    API('/api/users/me').then(setMe).catch(console.error);
  }, []);

  async function save(e) {
    e.preventDefault();
    setError(''); setSuccess('');
    if (!apiKey || !secret) { setError('Both fields are required'); return; }
    setSaving(true);
    try {
      await API('/api/users/keys', { method: 'POST', body: JSON.stringify({ api_key: apiKey, secret, is_testnet: testnet }) });
      setSuccess('Keys saved successfully');
      setMe(m => ({ ...m, has_api_keys: true, api_key_testnet: testnet }));
      setApiKey(''); setSecret('');
    } catch (e) { setError(e); }
    finally { setSaving(false); }
  }

  async function del() {
    if (!confirm('Remove API keys?')) return;
    setError(''); setSuccess('');
    setDeleting(true);
    try {
      await API('/api/users/keys', { method: 'DELETE' });
      setSuccess('Keys removed');
      setMe(m => ({ ...m, has_api_keys: false }));
    } catch (e) { setError(e); }
    finally { setDeleting(false); }
  }

  const inp = { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '10px 14px', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box' };

  return (
    <div style={{ maxWidth: 480 }}>
      {/* Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: me?.has_api_keys ? 'var(--fg)' : 'var(--muted-fg)', opacity: me?.has_api_keys ? 1 : 0.4 }} />
        <span style={{ fontSize: 13 }}>Bybit API — {me?.has_api_keys ? 'Connected' : 'Not connected'}</span>
        {me?.has_api_keys && me?.api_key_testnet && (
          <span style={{ fontSize: 11, color: 'var(--muted-fg)', letterSpacing: '0.08em' }}>TESTNET</span>
        )}
      </div>

      {/* Warning */}
      <div style={{ border: '1px solid var(--border)', padding: '12px 16px', marginBottom: 24, fontSize: 12, color: 'var(--muted-fg)', lineHeight: 1.6 }}>
        Grant <strong style={{ color: 'var(--fg)' }}>Trade + Position</strong> permissions only.<br />
        <strong style={{ color: 'var(--fg)' }}>Never</strong> enable Withdrawal permission.
      </div>

      {/* Form */}
      <form onSubmit={save}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 6 }}>API Key</div>
          <div style={{ position: 'relative' }}>
            <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste your Bybit API key" style={inp} />
            <button type="button" onClick={() => setShowKey(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted-fg)', cursor: 'pointer', fontSize: 11 }}>
              {showKey ? 'HIDE' : 'SHOW'}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 6 }}>Secret</div>
          <div style={{ position: 'relative' }}>
            <input type={showSecret ? 'text' : 'password'} value={secret} onChange={e => setSecret(e.target.value)} placeholder="Paste your Bybit secret" style={inp} />
            <button type="button" onClick={() => setShowSecret(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted-fg)', cursor: 'pointer', fontSize: 11 }}>
              {showSecret ? 'HIDE' : 'SHOW'}
            </button>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={testnet} onChange={e => setTestnet(e.target.checked)} style={{ accentColor: 'var(--fg)' }} />
          <span>Testnet mode</span>
        </label>

        {error && <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginBottom: 12, borderLeft: '2px solid var(--border-hi)', paddingLeft: 10 }}>{error}</div>}
        {success && <div style={{ fontSize: 12, color: 'var(--fg)', marginBottom: 12 }}>{success}</div>}

        <div style={{ display: 'flex', gap: 12 }}>
          <button type="submit" disabled={saving} style={{ background: 'var(--fg)', color: 'var(--bg)', border: 'none', padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save keys'}
          </button>
          {me?.has_api_keys && (
            <button type="button" onClick={del} disabled={deleting} style={{ background: 'none', border: 'none', color: 'var(--muted-fg)', fontSize: 13, cursor: 'pointer', opacity: deleting ? 0.4 : 1 }}>
              {deleting ? 'Removing…' : 'Delete'}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
