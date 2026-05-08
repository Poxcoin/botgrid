import React, { useEffect, useState, useCallback } from 'react';
import { useLang } from '@/lib/LangContext';

const API = (path, opts) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}`, 'Content-Type': 'application/json' },
  ...opts,
}).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.detail || 'Error')));

const inp = { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '10px 14px', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box' };
const monoSm = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em' };

export default function ApiKeysTab() {
  const { t } = useLang();
  const sec = t.dashboard.security;

  const [me, setMe]             = useState(null);
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

  useEffect(() => {
    API('/api/users/me').then(setMe).catch(console.error);
  }, []);

  const copyText = useCallback((text, label) => {
    navigator.clipboard.writeText(text).then(() => {
      setSuccess(label);
      setTimeout(() => setSuccess(''), 1500);
    });
  }, []);

  async function save(e) {
    e.preventDefault(); setError(''); setSuccess('');
    if (!apiKey || !secret) { setError(sec.bothFieldsRequired); return; }
    setSaving(true);
    try {
      await API('/api/users/keys', { method: 'POST', body: JSON.stringify({ api_key: apiKey, secret, is_testnet: testnet }) });
      setSuccess(sec.keysSaved);
      setMe(m => ({ ...m, has_api_keys: true, api_key_testnet: testnet }));
      setApiKey(''); setSecret(''); setRevealed(null);
    } catch (e) { setError(typeof e === 'string' ? e : sec.wrongPassword); }
    finally { setSaving(false); }
  }

  async function del() {
    if (!window.confirm(sec.removeKeysConfirm)) return;
    setError(''); setSuccess(''); setDeleting(true);
    try {
      await API('/api/users/keys', { method: 'DELETE' });
      setSuccess(sec.keysRemoved);
      setMe(m => ({ ...m, has_api_keys: false }));
      setRevealed(null); setRevealMode(false);
    } catch (e) { setError(typeof e === 'string' ? e : sec.wrongPassword); }
    finally { setDeleting(false); }
  }

  async function reveal(e) {
    e.preventDefault(); if (!revealPwd) return;
    setRevealLoading(true); setError('');
    try {
      const data = await API('/api/users/keys/reveal', { method: 'POST', body: JSON.stringify({ password: revealPwd }) });
      setRevealed(data); setRevealPwd(''); setRevealMode(false);
    } catch (e) { setError(typeof e === 'string' ? e : sec.wrongPassword); }
    finally { setRevealLoading(false); }
  }

  return (
    <div style={{ width: '100%', maxWidth: 640 }}>
      {/* Status row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: me?.has_api_keys ? 'var(--accent-green)' : 'var(--text-muted)', opacity: me?.has_api_keys ? 1 : 0.4 }} />
        <span style={{ fontSize: 13 }}>
          {sec.bybitApiPrefix} {me?.has_api_keys ? sec.connected : sec.notConnected}
        </span>
        {me?.has_api_keys && me?.api_key_testnet && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>{sec.testnetTag}</span>
        )}
        {me?.has_api_keys && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--accent-green)', letterSpacing: '0.08em' }}>
            {sec.activeStatus}
          </span>
        )}
      </div>

      {/* Revealed key display */}
      {revealed && (
        <div style={{ border: '1px solid var(--border-subtle)', padding: 16, marginBottom: 20, background: 'var(--bg-elevated)', borderRadius: 8 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase' }}>{sec.connectedKey}</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{sec.apiKeyLabel}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ ...monoSm, flex: 1, wordBreak: 'break-all', color: 'var(--text-primary)' }}>{revealed.api_key}</code>
              <button onClick={() => copyText(revealed.api_key, sec.apiKeyCopied)} style={{ ...monoSm, background: 'none', border: '1px solid var(--border-default)', color: 'var(--text-muted)', padding: '3px 8px', cursor: 'pointer', borderRadius: 4 }}>
                {sec.copyBtn}
              </button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{sec.secretMasked}</div>
            <code style={{ ...monoSm, color: 'var(--text-primary)' }}>{revealed.masked_secret}</code>
          </div>
          <button onClick={() => setRevealed(null)} style={{ marginTop: 12, fontSize: 10, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', letterSpacing: '0.06em' }}>
            {sec.hideBtn}
          </button>
        </div>
      )}

      {/* Reveal form */}
      {me?.has_api_keys && revealMode && !revealed && (
        <form onSubmit={reveal} style={{ border: '1px solid var(--border-subtle)', padding: 16, marginBottom: 20, background: 'var(--bg-elevated)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.5 }}>{sec.enterPwToReveal}</div>
          <input type="password" value={revealPwd} onChange={e => setRevealPwd(e.target.value)} placeholder={sec.accountPassword} style={{ ...inp, marginBottom: 10 }} autoComplete="current-password" autoFocus />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={revealLoading || !revealPwd} style={{ background: 'var(--text-primary)', color: 'var(--bg-base)', border: 'none', padding: '8px 18px', fontSize: 12, fontFamily: 'var(--font-mono)', cursor: 'pointer', opacity: (revealLoading || !revealPwd) ? 0.5 : 1, borderRadius: 4 }}>
              {revealLoading ? sec.checking : sec.confirm}
            </button>
            <button type="button" onClick={() => { setRevealMode(false); setRevealPwd(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
              {sec.cancel}
            </button>
          </div>
        </form>
      )}

      {/* Permissions warning */}
      <div style={{ border: '1px solid var(--border-subtle)', padding: '10px 14px', marginBottom: 20, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, borderRadius: 8 }}>
        {sec.permGrant}<strong style={{ color: 'var(--text-primary)' }}>{sec.permTradePos}</strong>{sec.permOnly}
        <strong style={{ color: 'var(--text-primary)' }}>{sec.permNever}</strong>{sec.permEnableWith}
      </div>

      {/* Save form */}
      <form onSubmit={save} autoComplete="off">
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 5 }}>{sec.apiKeyLabel}</div>
          <div style={{ position: 'relative' }}>
            <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={sec.pasteApiKey} style={inp} name="bybit-api-key" autoComplete="new-password" />
            <button type="button" onClick={() => setShowKey(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10 }}>
              {showKey ? sec.hideBtn : sec.showBtn}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 5 }}>{sec.secretLabel}</div>
          <div style={{ position: 'relative' }}>
            <input type={showSec ? 'text' : 'password'} value={secret} onChange={e => setSecret(e.target.value)} placeholder={sec.pasteSecret} style={inp} name="bybit-api-secret" autoComplete="new-password" />
            <button type="button" onClick={() => setShowSec(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 10 }}>
              {showSec ? sec.hideBtn : sec.showBtn}
            </button>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={testnet} onChange={e => setTestnet(e.target.checked)} style={{ accentColor: 'var(--accent-green)' }} />
          <span>{sec.testnetMode}</span>
        </label>

        {error && (
          <div role="alert" style={{ fontSize: 12, color: 'var(--accent-red)', marginBottom: 12, borderLeft: '2px solid var(--accent-red)', paddingLeft: 10 }}>
            {error}
          </div>
        )}
        {success && <div style={{ fontSize: 12, color: 'var(--accent-green)', marginBottom: 12 }}>{success}</div>}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" disabled={saving} style={{ background: 'var(--text-primary)', color: 'var(--bg-base)', border: 'none', padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1, borderRadius: 4 }}>
            {saving ? sec.saving : (me?.has_api_keys ? sec.updateKeys : sec.saveKeys)}
          </button>
          {me?.has_api_keys && !revealMode && !revealed && (
            <button type="button" onClick={() => setRevealMode(true)} style={{ background: 'none', border: '1px solid var(--border-default)', color: 'var(--text-muted)', fontSize: 11, padding: '8px 14px', cursor: 'pointer', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', borderRadius: 4 }}>
              {sec.viewKey}
            </button>
          )}
          {me?.has_api_keys && (
            <button type="button" onClick={del} disabled={deleting} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer', opacity: deleting ? 0.4 : 1 }}>
              {deleting ? sec.removing : sec.remove}
            </button>
          )}
        </div>
      </form>

      {/* Footer security info */}
      <div style={{ marginTop: 32, paddingTop: 20, borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>{sec.encryption}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.7 }}>
          {sec.encryptionDesc}
        </div>
      </div>
    </div>
  );
}
