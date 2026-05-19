import React, { useEffect, useState, useCallback } from 'react';
import { useLang } from '@/lib/LangContext';

function maskEmail(e) {
  if (!e) return '—';
  const [l, d] = e.split('@');
  const ext = d ? d.slice(d.lastIndexOf('.')) : '';
  return (l?.[0] || '*') + '***@***' + ext;
}

const API = (path, opts) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}`, 'Content-Type': 'application/json' },
  ...opts,
}).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.detail || 'Error')));

const inp = { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '10px 14px', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box' };
const monoSm = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em' };

function TwoFAModal({ mode, onClose, onDone }) {
  const { t } = useLang();
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
    } catch (e) { setErr(typeof e === 'string' ? e : t.dashboard.security.wrongPassword); }
    finally { setLoading(false); }
  }

  async function submitCode(e) {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      const data = await API('/api/users/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
      setRecoveryCodes(data.recovery_codes || []); setStep('codes');
    } catch (e) { setErr(typeof e === 'string' ? e : t.dashboard.security.wrongCode); }
    finally { setLoading(false); }
  }

  async function submitDisable(e) {
    e.preventDefault(); setErr(''); setLoading(true);
    try {
      await API('/api/users/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) });
      onDone(false);
    } catch (e) { setErr(typeof e === 'string' ? e : t.dashboard.security.wrongCode); }
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
            <div style={title}>{t.dashboard.security.enable2faTitle}</div>
            <div style={sub}>{t.dashboard.security.enable2faSub}</div>
            <input type="password" autoFocus required placeholder={t.dashboard.security.yourPassword} value={password} onChange={e => setPassword(e.target.value)} style={{ ...inp, marginBottom: 12 }} />
            {err && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{err}</div>}
            <button type="submit" disabled={loading} style={btnPrimary}>{loading ? t.dashboard.security.checking : t.dashboard.security.continueArrow}</button>
            <button type="button" onClick={onClose} style={btnSecondary}>{t.dashboard.security.cancel}</button>
          </form>
        )}

        {step === 'scan' && (
          <form onSubmit={submitCode}>
            <div style={title}>{t.dashboard.security.scanQrTitle}</div>
            <div style={sub}>{t.dashboard.security.scanQrSub}</div>
            {qr && <div style={{ textAlign: 'center', marginBottom: 16 }}><img src={qr} alt="2FA QR" style={{ width: 180, height: 180, imageRendering: 'pixelated' }} /></div>}
            <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginBottom: 4 }}>{t.dashboard.security.enterSecretManually}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', background: 'var(--bg2)', border: '1px solid var(--border)', padding: '8px 10px', wordBreak: 'break-all', marginBottom: 16 }}>{secret}</div>
            <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginBottom: 6 }}>{t.dashboard.security.enterAppCode}</div>
            <input type="text" autoFocus required inputMode="numeric" placeholder="000000" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} style={{ ...inp, letterSpacing: '0.2em', textAlign: 'center', fontSize: 18, marginBottom: 12 }} />
            {err && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{err}</div>}
            <button type="submit" disabled={loading || code.length < 6} style={{ ...btnPrimary, opacity: (loading || code.length < 6) ? 0.5 : 1 }}>{loading ? t.dashboard.security.checking : t.dashboard.security.verifyArrow}</button>
            <button type="button" onClick={onClose} style={btnSecondary}>{t.dashboard.security.cancel}</button>
          </form>
        )}

        {step === 'codes' && (
          <div>
            <div style={title}>{t.dashboard.security.twofaEnabledTitle}</div>
            <div style={sub}>{t.dashboard.security.saveRecoveryCodes}</div>
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '12px 14px', marginBottom: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
              {recoveryCodes.map((c, i) => <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg)' }}>{c}</span>)}
            </div>
            <button onClick={copyAll} style={{ ...btnSecondary, marginTop: 0, marginBottom: 12, color: copied ? 'var(--text-secondary)' : 'var(--muted-fg)' }}>{copied ? t.dashboard.security.copied : t.dashboard.security.copyAll}</button>
            <button onClick={() => onDone(true)} style={btnPrimary}>{t.dashboard.security.done}</button>
          </div>
        )}

        {step === 'disable' && (
          <form onSubmit={submitDisable}>
            <div style={title}>{t.dashboard.security.disable2faTitle}</div>
            <div style={sub}>{t.dashboard.security.disable2faSub}</div>
            <input type="text" autoFocus required inputMode="numeric" placeholder="000000" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} style={{ ...inp, letterSpacing: '0.2em', textAlign: 'center', fontSize: 18, marginBottom: 12 }} />
            {err && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{err}</div>}
            <button type="submit" disabled={loading || code.length < 6} style={{ ...btnPrimary, background: 'var(--fg)', opacity: (loading || code.length < 6) ? 0.5 : 1 }}>{loading ? t.dashboard.security.checking : t.dashboard.security.disable2faTitle}</button>
            <button type="button" onClick={onClose} style={btnSecondary}>{t.dashboard.security.cancel}</button>
          </form>
        )}
      </div>
    </div>
  );
}

// NOTE: API-keys management lives in its own tab (ApiKeysTab.jsx). This block
// is kept here only so the read-only "Bybit Keys" status row in SecurityRow
// stays accurate. The full editor moved out for clearer separation of concerns.
// eslint-disable-next-line no-unused-vars
function ApiKeysSection_DEPRECATED({ me, onUpdate }) {
  const { t } = useLang();
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
      setSuccess(label);
      setTimeout(() => setSuccess(''), 1500);
    });
  }, []);

  async function save(e) {
    e.preventDefault(); setError(''); setSuccess('');
    if (!apiKey || !secret) { setError(t.dashboard.security.bothFieldsRequired); return; }
    setSaving(true);
    try {
      await API('/api/users/keys', { method: 'POST', body: JSON.stringify({ api_key: apiKey, secret, is_testnet: testnet }) });
      setSuccess(t.dashboard.security.keysSaved);
      onUpdate({ has_api_keys: true, api_key_testnet: testnet });
      setApiKey(''); setSecret(''); setRevealed(null);
    } catch (e) { setError(e); }
    finally { setSaving(false); }
  }

  async function del() {
    if (!confirm(t.dashboard.security.removeKeysConfirm)) return;
    setError(''); setSuccess(''); setDeleting(true);
    try {
      await API('/api/users/keys', { method: 'DELETE' });
      setSuccess(t.dashboard.security.keysRemoved);
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
    } catch (e) { setError(typeof e === 'string' ? e : t.dashboard.security.wrongPassword); }
    finally { setRevealLoading(false); }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: me?.has_api_keys ? 'var(--text-secondary)' : 'var(--muted-fg)', opacity: me?.has_api_keys ? 1 : 0.35 }} />
        <span style={{ fontSize: 13 }}>{t.dashboard.security.bybitApiPrefix} {me?.has_api_keys ? t.dashboard.security.connected : t.dashboard.security.notConnected}</span>
        {me?.has_api_keys && me?.api_key_testnet && <span style={{ fontSize: 10, color: 'var(--muted-fg)', letterSpacing: '0.1em' }}>{t.dashboard.security.testnetTag}</span>}
        {me?.has_api_keys && <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-secondary)', letterSpacing: '0.08em' }}>{t.dashboard.security.activeStatus}</span>}
      </div>

      {revealed && (
        <div style={{ border: '1px solid var(--border)', padding: 16, marginBottom: 20, background: 'var(--bg2)' }}>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--muted-fg)', marginBottom: 10, textTransform: 'uppercase' }}>{t.dashboard.security.connectedKey}</div>
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--muted-fg)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t.dashboard.security.apiKeyLabel}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <code style={{ ...monoSm, flex: 1, wordBreak: 'break-all', color: 'var(--fg)' }}>{revealed.api_key}</code>
              <button onClick={() => copyText(revealed.api_key, t.dashboard.security.apiKeyCopied)} style={{ ...monoSm, background: 'none', border: '1px solid var(--border)', color: 'var(--muted-fg)', padding: '3px 8px', cursor: 'pointer' }}>{t.dashboard.security.copyBtn}</button>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: 'var(--muted-fg)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t.dashboard.security.secretMasked}</div>
            <code style={{ ...monoSm, color: 'var(--fg)' }}>{revealed.masked_secret}</code>
          </div>
          <button onClick={() => setRevealed(null)} style={{ marginTop: 12, fontSize: 10, background: 'none', border: 'none', color: 'var(--muted-fg)', cursor: 'pointer', letterSpacing: '0.06em' }}>{t.dashboard.security.hideBtn}</button>
        </div>
      )}

      {me?.has_api_keys && revealMode && !revealed && (
        <form onSubmit={reveal} style={{ border: '1px solid var(--border)', padding: 16, marginBottom: 20, background: 'var(--bg2)' }}>
          <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginBottom: 10, lineHeight: 1.5 }}>{t.dashboard.security.enterPwToReveal}</div>
          <input type="password" value={revealPwd} onChange={e => setRevealPwd(e.target.value)} placeholder={t.dashboard.security.accountPassword} style={{ ...inp, marginBottom: 10 }} autoComplete="current-password" autoFocus />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" disabled={revealLoading || !revealPwd} style={{ background: 'var(--fg)', color: 'var(--bg)', border: 'none', padding: '8px 18px', fontSize: 12, fontFamily: 'var(--font-mono)', cursor: 'pointer', opacity: (revealLoading || !revealPwd) ? 0.5 : 1 }}>
              {revealLoading ? t.dashboard.security.checking : t.dashboard.security.confirm}
            </button>
            <button type="button" onClick={() => { setRevealMode(false); setRevealPwd(''); }} style={{ background: 'none', border: 'none', color: 'var(--muted-fg)', fontSize: 12, cursor: 'pointer' }}>{t.dashboard.security.cancel}</button>
          </div>
        </form>
      )}

      <div style={{ border: '1px solid var(--border)', padding: '10px 14px', marginBottom: 20, fontSize: 12, color: 'var(--muted-fg)', lineHeight: 1.6 }}>
        {t.dashboard.security.permGrant}<strong style={{ color: 'var(--fg)' }}>{t.dashboard.security.permTradePos}</strong>{t.dashboard.security.permOnly}<strong style={{ color: 'var(--fg)' }}>{t.dashboard.security.permNever}</strong>{t.dashboard.security.permEnableWith}
      </div>

      <form onSubmit={save} autoComplete="off">
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 5 }}>{t.dashboard.security.apiKeyLabel}</div>
          <div style={{ position: 'relative' }}>
            <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={t.dashboard.security.pasteApiKey} style={inp} name="bybit-api-key" autoComplete="new-password" />
            <button type="button" onClick={() => setShowKey(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted-fg)', cursor: 'pointer', fontSize: 10 }}>{showKey ? t.dashboard.security.hideBtn : t.dashboard.security.showBtn}</button>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 5 }}>{t.dashboard.security.secretLabel}</div>
          <div style={{ position: 'relative' }}>
            <input type={showSec ? 'text' : 'password'} value={secret} onChange={e => setSecret(e.target.value)} placeholder={t.dashboard.security.pasteSecret} style={inp} name="bybit-api-secret" autoComplete="new-password" />
            <button type="button" onClick={() => setShowSec(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--muted-fg)', cursor: 'pointer', fontSize: 10 }}>{showSec ? t.dashboard.security.hideBtn : t.dashboard.security.showBtn}</button>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, cursor: 'pointer', fontSize: 13 }}>
          <input type="checkbox" checked={testnet} onChange={e => setTestnet(e.target.checked)} style={{ accentColor: 'var(--fg)' }} />
          <span>{t.dashboard.security.testnetMode}</span>
        </label>

        {error && <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginBottom: 12, borderLeft: '2px solid var(--border-hi)', paddingLeft: 10 }}>{error}</div>}
        {success && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>{success}</div>}

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="submit" disabled={saving} style={{ background: 'var(--fg)', color: 'var(--bg)', border: 'none', padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? t.dashboard.security.saving : (me?.has_api_keys ? t.dashboard.security.updateKeys : t.dashboard.security.saveKeys)}
          </button>
          {me?.has_api_keys && !revealMode && !revealed && (
            <button type="button" onClick={() => setRevealMode(true)} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted-fg)', fontSize: 11, padding: '8px 14px', cursor: 'pointer', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
              {t.dashboard.security.viewKey}
            </button>
          )}
          {me?.has_api_keys && (
            <button type="button" onClick={del} disabled={deleting} style={{ background: 'none', border: 'none', color: 'var(--muted-fg)', fontSize: 12, cursor: 'pointer', opacity: deleting ? 0.4 : 1 }}>
              {deleting ? t.dashboard.security.removing : t.dashboard.security.remove}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function SecurityRow({ label, status, action, actionLabel, description }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16,
      padding: '14px 0',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>{label}</div>
        {description && <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>{description}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        {status && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
            {status}
          </span>
        )}
        {action && (
          <button onClick={action} style={{ background: 'none', border: '1px solid var(--border-default)', color: 'var(--text-muted)', padding: '6px 14px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}

function ChangePasswordRow() {
  const [open,    setOpen]    = useState(false);
  const [oldPw,   setOldPw]   = useState('');
  const [newPw,   setNewPw]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [msg,     setMsg]     = useState('');

  const inpSt = { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '9px 12px', fontSize: 13, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box', borderRadius: 4 };

  async function submit(e) {
    e.preventDefault();
    if (!oldPw || !newPw) { setMsg('Fill both fields'); return; }
    if (newPw.length < 8) { setMsg('Min 8 characters'); return; }
    setSaving(true); setMsg('');
    try {
      await API('/api/users/change-password', { method: 'POST', body: JSON.stringify({ old_password: oldPw, new_password: newPw }) });
      setMsg('✓ Password changed');
      setOldPw(''); setNewPw('');
      setTimeout(() => { setOpen(false); setMsg(''); }, 2000);
    } catch(e) { setMsg(typeof e === 'string' ? e : 'Incorrect password'); }
    setSaving(false);
  }

  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 3 }}>Password</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>Change your account password.</div>
        </div>
        <button onClick={() => { setOpen(o => !o); setMsg(''); }} style={{ background: 'none', border: '1px solid var(--border-default)', color: 'var(--text-muted)', padding: '6px 14px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {open ? 'Cancel' : 'Change'}
        </button>
      </div>
      {open && (
        <form onSubmit={submit} style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 360 }}>
          <input type="password" placeholder="Current password" value={oldPw} onChange={e => setOldPw(e.target.value)} style={inpSt} autoComplete="current-password" autoFocus />
          <input type="password" placeholder="New password" value={newPw} onChange={e => setNewPw(e.target.value)} style={inpSt} autoComplete="new-password" />
          {msg && <div style={{ fontSize: 12, color: msg.startsWith('✓') ? 'var(--text-secondary)' : 'var(--accent-red)', fontFamily: 'var(--font-mono)' }}>{msg}</div>}
          <button type="submit" disabled={saving} style={{ alignSelf: 'flex-start', background: 'var(--text-primary)', color: 'var(--bg-base)', border: 'none', padding: '9px 22px', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, borderRadius: 4 }}>
            {saving ? 'Saving…' : 'Update password'}
          </button>
        </form>
      )}
    </div>
  );
}

export default function SecurityTab() {
  const { t } = useLang();
  const [me, setMe]             = useState(null);
  const [modal2fa, setModal2fa] = useState(null);

  useEffect(() => {
    API('/api/users/me').then(setMe).catch(console.error);
  }, []);

  function updateMe(patch) { setMe(m => ({ ...m, ...patch })); }
  function on2faDone(enabled) { updateMe({ totp_enabled: enabled }); setModal2fa(null); }

  return (
    <div style={{ width: '100%' }}>
      {modal2fa && <TwoFAModal mode={modal2fa} onClose={() => setModal2fa(null)} onDone={on2faDone} />}

      <div style={{ width: '100%' }}>

        <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 16, fontFamily: 'var(--font-mono)' }}>{t.dashboard.security.header}</div>

        <div style={{ borderTop: '1px solid var(--border-subtle)' }}>
          <SecurityRow
            label={t.dashboard.security.twoFactorAuth}
            description={me?.totp_enabled ? t.dashboard.security.totpEnabledDesc : t.dashboard.security.totpDisabledDesc}
            status={me?.totp_enabled ? t.dashboard.security.enabled : t.dashboard.security.disabled}
            action={() => setModal2fa(me?.totp_enabled ? 'disable' : 'setup')}
            actionLabel={me?.totp_enabled ? t.dashboard.security.disable : t.dashboard.security.enable}
          />

          <ChangePasswordRow />

          <SecurityRow
            label={t.dashboard.security.bybitKeysHeader}
            description={me?.has_api_keys
              ? (me.api_key_testnet ? t.dashboard.security.apiKeysActiveTestnet : t.dashboard.security.apiKeysActiveLive)
              : t.dashboard.security.apiKeysInactive}
            status={me?.has_api_keys ? t.dashboard.security.connected : t.dashboard.security.notConnected}
            action={() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'api-keys' }))}
            actionLabel={me?.has_api_keys ? t.dashboard.security.manage : t.dashboard.security.connect}
          />

          <SecurityRow
            label={t.dashboard.security.encryption}
            description={t.dashboard.security.encryptionDesc}
            status={t.dashboard.security.active}
          />

        </div>

      </div>
    </div>
  );
}
