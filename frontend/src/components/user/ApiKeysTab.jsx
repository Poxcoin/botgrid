import React, { useEffect, useState } from 'react';

const MONO = "'Courier New','SF Mono',monospace";
const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif";

const API = (path, opts) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}`, 'Content-Type': 'application/json' },
  ...opts,
}).then(async r => {
  const json = await r.json();
  if (!r.ok) throw new Error(json.detail || 'Error');
  return json;
});

function mask(key) {
  if (!key || key.length < 8) return '••••••••••••••••••••';
  return key.slice(0, 6) + '••••••••••••' + key.slice(-4);
}

const inp = {
  width: '100%', background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)', padding: '10px 14px',
  fontSize: 13, fontFamily: MONO, outline: 'none',
  boxSizing: 'border-box', borderRadius: 6,
};

function KeyForm({ existing, onSaved, onCancel }) {
  const [apiKey,   setApiKey]   = useState('');
  const [secret,   setSecret]   = useState('');
  const [testnet,  setTestnet]  = useState(false);
  const [showKey,  setShowKey]  = useState(false);
  const [showSec,  setShowSec]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!apiKey.trim() || !secret.trim()) { setError('Both fields are required'); return; }
    setError(''); setSaving(true);
    try {
      await API('/api/users/keys', {
        method: 'POST',
        body: JSON.stringify({ api_key: apiKey.trim(), secret: secret.trim(), is_testnet: testnet }),
      });
      onSaved(apiKey.trim(), testnet);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} autoComplete="off" style={{ marginTop: existing ? 20 : 0 }}>
      {existing && (
        <div style={{ fontSize: 11, fontFamily: MONO, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 16 }}>
          Replace existing key
        </div>
      )}

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: MONO, marginBottom: 6 }}>
          API Key
        </div>
        <div style={{ position: 'relative' }}>
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey} onChange={e => setApiKey(e.target.value)}
            placeholder="Paste Bybit API key" style={inp}
            autoComplete="new-password"
          />
          <button type="button" onClick={() => setShowKey(v => !v)} style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 10, fontFamily: MONO, letterSpacing: '0.1em',
          }}>{showKey ? 'HIDE' : 'SHOW'}</button>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', fontFamily: MONO, marginBottom: 6 }}>
          Secret
        </div>
        <div style={{ position: 'relative' }}>
          <input
            type={showSec ? 'text' : 'password'}
            value={secret} onChange={e => setSecret(e.target.value)}
            placeholder="Paste Bybit secret" style={inp}
            autoComplete="new-password"
          />
          <button type="button" onClick={() => setShowSec(v => !v)} style={{
            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: 10, fontFamily: MONO, letterSpacing: '0.1em',
          }}>{showSec ? 'HIDE' : 'SHOW'}</button>
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, cursor: 'pointer', fontSize: 13, fontFamily: FONT, color: 'var(--text-secondary)' }}>
        <input type="checkbox" checked={testnet} onChange={e => setTestnet(e.target.checked)} style={{ accentColor: 'var(--accent-green)', width: 14, height: 14 }} />
        Testnet (demo trading only)
      </label>

      {error && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          border: '1px solid rgba(255,77,109,0.3)',
          background: 'rgba(255,77,109,0.06)',
          color: 'var(--accent-red)', fontSize: 12, fontFamily: MONO,
          borderRadius: 6, lineHeight: 1.5,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button type="submit" disabled={saving} style={{
          background: 'var(--text-primary)', color: 'var(--bg-base)',
          border: 'none', padding: '10px 24px',
          fontFamily: FONT, fontSize: 13, fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.6 : 1, borderRadius: 6,
        }}>
          {saving ? 'Validating…' : (existing ? 'Replace key' : 'Save key')}
        </button>
        {existing && onCancel && (
          <button type="button" onClick={onCancel} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            fontFamily: FONT, fontSize: 13, cursor: 'pointer', padding: '10px 0',
          }}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function KeyCard({ maskedKey, isTestnet, onReplace, onDelete, deleting }) {
  return (
    <div style={{
      border: '1px solid rgba(0,212,170,0.2)',
      background: 'rgba(0,212,170,0.04)',
      borderRadius: 8, padding: '18px 20px',
    }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-green)' }} />
          <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--accent-green)', letterSpacing: '0.08em' }}>
            BYBIT · ACTIVE
          </span>
          {isTestnet && (
            <span style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em',
              padding: '2px 7px', border: '1px solid var(--border-strong)',
              color: 'var(--text-muted)', textTransform: 'uppercase',
              borderRadius: 100,
            }}>
              TESTNET
            </span>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onReplace} style={{
            background: 'none', border: '1px solid var(--border-default)',
            color: 'var(--text-secondary)', fontFamily: FONT, fontSize: 12,
            padding: '6px 14px', cursor: 'pointer', borderRadius: 6,
            transition: 'border-color 150ms, color 150ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            Replace
          </button>
          <button onClick={onDelete} disabled={deleting} style={{
            background: 'none', border: '1px solid rgba(255,77,109,0.25)',
            color: 'var(--accent-red)', fontFamily: FONT, fontSize: 12,
            padding: '6px 14px', cursor: deleting ? 'not-allowed' : 'pointer',
            borderRadius: 6, opacity: deleting ? 0.5 : 1,
            transition: 'border-color 150ms',
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,77,109,0.6)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,77,109,0.25)'; }}
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>

      {/* Key display */}
      <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-primary)', letterSpacing: '0.06em', marginBottom: 6 }}>
        {maskedKey}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)' }}>
        Secret: ••••••••••••••••••••••••••••••••
      </div>
    </div>
  );
}

export default function ApiKeysTab() {
  const [me,        setMe]        = useState(null);
  const [maskedKey, setMaskedKey] = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  const [success,   setSuccess]   = useState('');

  useEffect(() => {
    API('/api/users/me').then(d => {
      setMe(d);
      if (d.bybit_api_key_masked) setMaskedKey(d.bybit_api_key_masked);
    }).catch(console.error);
  }, []);

  function onSaved(rawKey, testnet) {
    setMaskedKey(mask(rawKey));
    setMe(m => ({ ...m, has_api_keys: true, api_key_demo: testnet }));
    setShowForm(false);
    setSuccess('Key saved and verified successfully. Bot will start trading on your account.');
    setTimeout(() => setSuccess(''), 5000);
  }

  async function onDelete() {
    if (!confirm('Remove API key? The bot will stop trading on your account.')) return;
    setDeleting(true);
    try {
      await API('/api/users/keys', { method: 'DELETE' });
      setMe(m => ({ ...m, has_api_keys: false, api_key_demo: false }));
      setMaskedKey('');
      setShowForm(false);
    } catch (e) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  }

  const hasKey = me?.has_api_keys;

  return (
    <div style={{ width: '100%', maxWidth: 580, fontFamily: FONT }}>

      {/* Title */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          API Keys
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Connect your Bybit account to enable live trading and analytics.
        </div>
      </div>

      {/* Success message */}
      {success && (
        <div style={{
          marginBottom: 20, padding: '10px 16px',
          border: '1px solid rgba(0,212,170,0.3)',
          background: 'rgba(0,212,170,0.06)',
          color: 'var(--accent-green)', fontSize: 12, fontFamily: MONO,
          borderRadius: 6,
        }}>
          ✓ {success}
        </div>
      )}

      {/* Connected key card */}
      {hasKey && !showForm && (
        <div style={{ marginBottom: 24 }}>
          <KeyCard
            maskedKey={maskedKey || '••••••' + '••••••••••••' + '••••'}
            isTestnet={me?.api_key_demo}
            onReplace={() => setShowForm(true)}
            onDelete={onDelete}
            deleting={deleting}
          />
        </div>
      )}

      {/* Replace/add form */}
      {(!hasKey || showForm) && (
        <KeyForm
          existing={hasKey && showForm}
          onSaved={onSaved}
          onCancel={showForm ? () => setShowForm(false) : null}
        />
      )}

      {/* Add another key — placeholder for future multi-key support */}
      {hasKey && !showForm && (
        <div style={{ marginTop: 20 }}>
          <button
            onClick={() => setShowForm(true)}
            style={{
              background: 'none', border: '1px dashed var(--border-default)',
              color: 'var(--text-muted)', fontFamily: FONT, fontSize: 13,
              padding: '10px 20px', cursor: 'pointer', borderRadius: 6, width: '100%',
              transition: 'border-color 150ms, color 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            + Replace / update key
          </button>
        </div>
      )}

      {/* Security note */}
      <div style={{
        marginTop: 32, paddingTop: 20,
        borderTop: '1px solid var(--border-subtle)',
        fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7,
      }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>Security</div>
        Grant <strong style={{ color: 'var(--text-secondary)' }}>Trade + Position</strong> permissions only. Never enable Withdrawal.<br />
        Keys are stored encrypted (AES-256) and validated against Bybit before saving.<br />
        Keys are write-only — once saved they cannot be retrieved.
        {me?.totp_enabled
          ? <div style={{ color: 'var(--accent-green)', marginTop: 6 }}>✓ Two-factor authentication enabled</div>
          : <div style={{ marginTop: 6 }}>2FA is <strong style={{ color: 'var(--text-primary)' }}>not enabled</strong> — enable it in Security settings.</div>
        }
      </div>
    </div>
  );
}
