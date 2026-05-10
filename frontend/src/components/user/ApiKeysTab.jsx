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

const inp = {
  width: '100%', background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)', padding: '10px 14px',
  fontSize: 13, fontFamily: MONO, outline: 'none',
  boxSizing: 'border-box', borderRadius: 6,
};

function KeyForm({ isTestnet, existing, onSaved, onCancel }) {
  const [apiKey,  setApiKey]  = useState('');
  const [secret,  setSecret]  = useState('');
  const [showKey, setShowKey] = useState(false);
  const [showSec, setShowSec] = useState(false);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  async function submit(e) {
    e.preventDefault();
    if (!apiKey.trim() || !secret.trim()) { setError('Both fields are required'); return; }
    setError(''); setSaving(true);
    try {
      await API('/api/users/keys', {
        method: 'POST',
        body: JSON.stringify({ api_key: apiKey.trim(), secret: secret.trim(), is_testnet: isTestnet }),
      });
      onSaved(apiKey.trim());
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

      <div style={{ marginBottom: 20 }}>
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

      <div style={{ fontFamily: MONO, fontSize: 13, color: 'var(--text-primary)', letterSpacing: '0.06em', marginBottom: 6 }}>
        {maskedKey}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-muted)' }}>
        Secret: ••••••••••••••••••••••••••••••••
      </div>
    </div>
  );
}

function KeySection({ title, subtitle, isTestnet, maskedKey, onSaved, onDeleted }) {
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [success,  setSuccess]  = useState('');
  const [localMasked, setLocalMasked] = useState(maskedKey || null);

  useEffect(() => {
    setLocalMasked(maskedKey || null);
  }, [maskedKey]);

  const hasKey = Boolean(localMasked);

  function handleSaved(rawKey) {
    const masked = rawKey.length < 8
      ? '••••••••••••••••••••'
      : rawKey.slice(0, 6) + '••••••••••••' + rawKey.slice(-4);
    setLocalMasked(masked);
    setShowForm(false);
    setSuccess('Key saved and verified successfully.');
    setTimeout(() => setSuccess(''), 5000);
    onSaved && onSaved();
  }

  async function handleDelete() {
    if (!confirm(`Remove ${title} key? ${isTestnet ? 'Demo trading will stop.' : 'The bot will stop trading on your live account.'}`)) return;
    setDeleting(true);
    try {
      await API(`/api/users/keys?is_testnet=${isTestnet}`, { method: 'DELETE' });
      setLocalMasked(null);
      setShowForm(false);
      onDeleted && onDeleted();
    } catch (e) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{
      border: '1px solid var(--border-default)',
      borderRadius: 10, padding: '20px 22px', marginBottom: 16,
    }}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
          {title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {subtitle}
        </div>
      </div>

      {success && (
        <div style={{
          marginBottom: 14, padding: '10px 14px',
          border: '1px solid rgba(0,212,170,0.3)',
          background: 'rgba(0,212,170,0.06)',
          color: 'var(--accent-green)', fontSize: 12, fontFamily: MONO,
          borderRadius: 6,
        }}>
          {success}
        </div>
      )}

      {hasKey && !showForm && (
        <div style={{ marginBottom: 12 }}>
          <KeyCard
            maskedKey={localMasked}
            isTestnet={isTestnet}
            onReplace={() => setShowForm(true)}
            onDelete={handleDelete}
            deleting={deleting}
          />
        </div>
      )}

      {(!hasKey || showForm) && (
        <KeyForm
          isTestnet={isTestnet}
          existing={hasKey && showForm}
          onSaved={handleSaved}
          onCancel={showForm ? () => setShowForm(false) : null}
        />
      )}

      {hasKey && !showForm && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => setShowForm(true)}
            style={{
              background: 'none', border: '1px dashed var(--border-default)',
              color: 'var(--text-muted)', fontFamily: FONT, fontSize: 12,
              padding: '8px 16px', cursor: 'pointer', borderRadius: 6, width: '100%',
              transition: 'border-color 150ms, color 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
          >
            + Replace / update key
          </button>
        </div>
      )}
    </div>
  );
}

export default function ApiKeysTab() {
  const [me, setMe] = useState(null);

  useEffect(() => {
    API('/api/users/me').then(d => setMe(d)).catch(console.error);
  }, []);

  function reload() {
    API('/api/users/me').then(d => setMe(d)).catch(console.error);
  }

  return (
    <div style={{ width: '100%', maxWidth: 580, fontFamily: FONT }}>

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>
          API Keys
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          Connect your Bybit accounts to enable trading and analytics.
        </div>
      </div>

      <KeySection
        title="Demo Account"
        subtitle="Test strategies with paper money — Bybit Testnet"
        isTestnet={true}
        maskedKey={me?.bybit_demo_key_masked || null}
        onSaved={reload}
        onDeleted={reload}
      />

      <KeySection
        title="Live Account"
        subtitle="Real funds — Bybit Mainnet. Grant Trade + Position permissions only."
        isTestnet={false}
        maskedKey={me?.bybit_live_key_masked || null}
        onSaved={reload}
        onDeleted={reload}
      />

      <div style={{
        marginTop: 16, paddingTop: 20,
        borderTop: '1px solid var(--border-subtle)',
        fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7,
      }}>
        <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8 }}>Security</div>
        Grant <strong style={{ color: 'var(--text-secondary)' }}>Trade + Position</strong> permissions only. Never enable Withdrawal.<br />
        Keys are stored encrypted (AES-256) and validated against Bybit before saving.<br />
        Keys are write-only — once saved they cannot be retrieved.
        {me?.totp_enabled
          ? <div style={{ color: 'var(--accent-green)', marginTop: 6 }}>Two-factor authentication enabled</div>
          : <div style={{ marginTop: 6 }}>2FA is <strong style={{ color: 'var(--text-primary)' }}>not enabled</strong> — enable it in Security settings.</div>
        }
      </div>
    </div>
  );
}
