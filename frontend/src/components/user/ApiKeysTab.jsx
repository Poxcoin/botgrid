import React, { useEffect, useState } from 'react';
import { useIsMobile } from '@/lib/useIsMobile';

const FM = "'JetBrains Mono','Courier New',monospace";
const FF = "-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif";

const SUPPORT_EMAIL = 'support@kadoclub.net';

const API = (path, opts) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}`, 'Content-Type': 'application/json' },
  ...opts,
}).then(async r => {
  const json = await r.json();
  if (!r.ok) throw new Error(json.detail || 'Error');
  return json;
});

// ── Icons ──────────────────────────────────────────────────────────────────
const ChevronIcon = ({ open }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ transition: 'transform 200ms', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0 }}>
    <path d="M3 5.5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const CopyIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <rect x="4.5" y="4.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M2.5 8.5H2a1 1 0 01-1-1V2a1 1 0 011-1h5.5a1 1 0 011 1v.5" stroke="currentColor" strokeWidth="1.2"/>
  </svg>
);

const CheckIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <path d="M2.5 7l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ── Step-by-step guide ─────────────────────────────────────────────────────
const STEPS = [
  {
    n: 1,
    title: 'Open Bybit API Management',
    body: 'Log in to Bybit → click your avatar (top right) → select API Management.',
  },
  {
    n: 2,
    title: 'Create a new key',
    body: 'Click "Create New Key" → choose System-generated API Keys → give it a name (e.g. "Kado Bot").',
  },
  {
    n: 3,
    title: 'Set permissions',
    body: (
      <div>
        <div style={{ marginBottom: 8 }}>Enable exactly these permissions:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            [true,  'Unified Trading Account — Read'],
            [true,  'Derivatives / Contract — Read + Trade'],
            [true,  'Position — Read'],
            [false, 'Withdrawal — NEVER enable'],
            [false, 'Internal Transfer — leave off'],
          ].map(([allow, text], i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FM, fontSize: 11 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: allow ? 'var(--border-strong)' : 'var(--border-default)', flexShrink: 0, display: 'inline-block' }}/>
              <span style={{ color: allow ? 'var(--text-secondary)' : 'var(--text-muted)' }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    n: 4,
    title: 'IP restriction (recommended)',
    body: (
      <div style={{ lineHeight: 1.6 }}>
        Enable IP restriction and add the trading server IP. Contact support to get the exact address —{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>{SUPPORT_EMAIL}</a>.
      </div>
    ),
  },
  {
    n: 5,
    title: 'Confirm with 2FA and copy the secret',
    body: 'Complete the 2FA verification. Bybit shows the Secret only once — copy it immediately and paste both API Key + Secret into the form below.',
  },
];


function SetupGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: 10, marginBottom: 24, overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', background: 'var(--bg-surface)', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-muted)' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M6 5v4M6 3.5v.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </div>
          <div>
            <div style={{ fontFamily: FF, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>How to create a Bybit API key</div>
            <div style={{ fontFamily: FF, fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>Step-by-step guide — takes ~2 minutes</div>
          </div>
        </div>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div style={{ padding: '0 18px 20px', background: 'var(--bg-base)' }}>
          <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 0 20px' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {STEPS.map(s => (
              <div key={s.n} style={{ display: 'flex', gap: 14 }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                  <span style={{ fontFamily: FM, fontSize: 10, color: 'var(--text-muted)' }}>{s.n}</span>
                </div>
                <div>
                  <div style={{ fontFamily: FF, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontFamily: FF, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>{s.body}</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 20, padding: '12px 14px', background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 7, display: 'flex', gap: 10 }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 14, flexShrink: 0 }}>⚠</span>
            <div style={{ fontFamily: FF, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-secondary)' }}>Never enable Withdrawal permission.</strong> The bot only needs to open/close positions and read your balance. Withdrawal access is unnecessary and a security risk.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Key form ───────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)', padding: '10px 44px 10px 14px',
  fontSize: 13, fontFamily: FM, outline: 'none',
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
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const EyeBtn = ({ show, onToggle }) => (
    <button type="button" onClick={onToggle} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}>
      {show
        ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" stroke="currentColor" strokeWidth="1.2"/><circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/><line x1="2" y1="2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
        : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 7s2.5-5 6-5 6 5 6 5-2.5 5-6 5-6-5-6-5z" stroke="currentColor" strokeWidth="1.2"/><circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2"/></svg>
      }
    </button>
  );

  return (
    <form onSubmit={submit} autoComplete="off">
      {existing && (
        <div style={{ fontFamily: FM, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--border-subtle)' }}>
          Replace existing key
        </div>
      )}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: FM, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>API Key</div>
        <div style={{ position: 'relative' }}>
          <input type={showKey ? 'text' : 'password'} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Paste your Bybit API key" style={inputStyle} autoComplete="new-password"/>
          <EyeBtn show={showKey} onToggle={() => setShowKey(v => !v)} />
        </div>
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: FM, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>Secret</div>
        <div style={{ position: 'relative' }}>
          <input type={showSec ? 'text' : 'password'} value={secret} onChange={e => setSecret(e.target.value)} placeholder="Paste your Bybit secret" style={inputStyle} autoComplete="new-password"/>
          <EyeBtn show={showSec} onToggle={() => setShowSec(v => !v)} />
        </div>
      </div>
      {error && (
        <div style={{ marginBottom: 14, padding: '10px 14px', border: '1px solid rgba(255,77,109,0.3)', background: 'rgba(255,77,109,0.06)', color: 'var(--accent-red)', fontSize: 12, fontFamily: FM, borderRadius: 6, lineHeight: 1.5 }}>
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button type="submit" disabled={saving} style={{ background: 'var(--text-primary)', color: 'var(--bg-base)', border: 'none', padding: '10px 24px', fontFamily: FF, fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1, borderRadius: 6 }}>
          {saving ? 'Validating…' : existing ? 'Replace key' : 'Save key'}
        </button>
        {existing && onCancel && (
          <button type="button" onClick={onCancel} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontFamily: FF, fontSize: 13, cursor: 'pointer', padding: '10px 0' }}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

// ── Key card (existing key) ────────────────────────────────────────────────
function KeyCard({ maskedKey, isTestnet, onReplace, onDelete, deleting }) {
  return (
    <div style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', borderRadius: 8, padding: '14px 16px', marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--border-strong)' }} />
          <span style={{ fontFamily: FM, fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>CONNECTED</span>
          {isTestnet && <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.12em', padding: '2px 7px', border: '1px solid var(--border-strong)', color: 'var(--text-muted)', textTransform: 'uppercase', borderRadius: 100 }}>DEMO</span>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onReplace} style={{ background: 'none', border: '1px solid var(--border-default)', color: 'var(--text-secondary)', fontFamily: FF, fontSize: 11, padding: '5px 12px', cursor: 'pointer', borderRadius: 5 }}>Replace</button>
          <button onClick={onDelete} disabled={deleting} style={{ background: 'none', border: '1px solid rgba(255,77,109,0.25)', color: 'var(--accent-red)', fontFamily: FF, fontSize: 11, padding: '5px 12px', cursor: deleting ? 'not-allowed' : 'pointer', borderRadius: 5, opacity: deleting ? 0.5 : 1 }}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
      <div style={{ fontFamily: FM, fontSize: 12, color: 'var(--text-primary)', letterSpacing: '0.06em', marginBottom: 4 }}>{maskedKey}</div>
      <div style={{ fontFamily: FM, fontSize: 11, color: 'var(--text-muted)' }}>Secret: ••••••••••••••••••••••••••••••••</div>
    </div>
  );
}

// ── Key section (live / demo) ──────────────────────────────────────────────
function KeySection({ title, badge, subtitle, isTestnet, maskedKey, onSaved, onDeleted }) {
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [success,  setSuccess]  = useState('');
  const [localMasked, setLocalMasked] = useState(maskedKey || null);

  useEffect(() => { setLocalMasked(maskedKey || null); }, [maskedKey]);

  const hasKey = Boolean(localMasked);

  function handleSaved(rawKey) {
    const masked = rawKey.length < 8 ? '••••••••••••••••••••' : rawKey.slice(0, 6) + '••••••••••••' + rawKey.slice(-4);
    setLocalMasked(masked); setShowForm(false);
    setSuccess('Key saved and verified successfully.');
    setTimeout(() => setSuccess(''), 5000);
    onSaved?.();
  }

  async function handleDelete() {
    if (!confirm(`Remove ${title}? The bot will stop trading on this account.`)) return;
    setDeleting(true);
    try {
      await API(`/api/users/keys?is_testnet=${isTestnet}`, { method: 'DELETE' });
      setLocalMasked(null); setShowForm(false);
      onDeleted?.();
    } catch (e) {
      alert(e.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: 10, padding: '20px 22px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <div style={{ fontFamily: FF, fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
        {badge && <span style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.12em', padding: '2px 8px', border: '1px solid var(--border-default)', color: 'var(--text-muted)', borderRadius: 100 }}>{badge.text}</span>}
      </div>
      <div style={{ fontFamily: FF, fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>{subtitle}</div>

      {success && (
        <div style={{ marginBottom: 14, padding: '10px 14px', border: '1px solid var(--border-default)', background: 'var(--bg-surface)', color: 'var(--text-secondary)', fontSize: 12, fontFamily: FM, borderRadius: 6 }}>
          ✓ {success}
        </div>
      )}

      {hasKey && !showForm && <KeyCard maskedKey={localMasked} isTestnet={isTestnet} onReplace={() => setShowForm(true)} onDelete={handleDelete} deleting={deleting} />}
      {(!hasKey || showForm) && <KeyForm isTestnet={isTestnet} existing={hasKey && showForm} onSaved={handleSaved} onCancel={showForm ? () => setShowForm(false) : null} />}
    </div>
  );
}

// ── MT5 Keys ───────────────────────────────────────────────────────────────
function Mt5KeysSection() {
  const [data,    setData]    = React.useState(null);
  const [login,   setLogin]   = React.useState('');
  const [pass,    setPass]    = React.useState('');
  const [server,  setServer]  = React.useState('');
  const [saving,  setSaving]  = React.useState(false);
  const [msg,     setMsg]     = React.useState('');

  React.useEffect(() => {
    API('/api/users/mt5-keys').then(d => {
      setData(d);
      if (d.configured) { setLogin(d.login); setServer(d.server); }
    }).catch(() => {});
  }, []);

  const save = async () => {
    if (!login || !pass || !server) { setMsg('Fill all fields'); return; }
    setSaving(true);
    try {
      await API('/api/users/mt5-keys', { method: 'POST', body: JSON.stringify({ login, password: pass, server }) });
      setData({ configured: true, login, server });
      setMsg('✓ MT5 credentials saved');
      setPass('');
    } catch(e) { setMsg(e.message); }
    setSaving(false);
  };

  const remove = async () => {
    await API('/api/users/mt5-keys', { method: 'DELETE' }).catch(() => {});
    setData({ configured: false }); setLogin(''); setPass(''); setServer(''); setMsg('Removed');
  };

  return (
    <div style={{ border: '1px solid var(--border-default)', borderRadius: 10, overflow: 'hidden', marginTop: 24 }}>
      <div style={{ padding: '14px 18px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-default)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: FM, fontSize: 13, fontWeight: 600 }}>MT5 / MetaApi Integration</span>
        {data?.configured && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: FM }}>Connected</span>}
      </div>
      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: FF, lineHeight: 1.5 }}>
          Connect your IC Markets MT5 demo account to trade EURUSD, GBPUSD, XAUUSD on macro news events (CPI, NFP, PCE).
        </div>
        {[
          { label: 'MT5 Login (account number)', val: login, set: setLogin, ph: '52886576', type: 'text' },
          { label: 'MT5 Password', val: pass, set: setPass, ph: '••••••••••', type: 'password' },
          { label: 'MT5 Server', val: server, set: setServer, ph: 'ICMarketsSC-Demo', type: 'text' },
        ].map(({ label, val, set, ph, type }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: FM, letterSpacing: '0.05em' }}>{label}</label>
            <input
              type={type}
              value={val}
              onChange={e => set(e.target.value)}
              placeholder={ph}
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 6, padding: '8px 12px', fontFamily: FM, fontSize: 12, color: 'var(--text-primary)', outline: 'none', width: '100%', boxSizing: 'border-box' }}
            />
          </div>
        ))}
        {msg && <div style={{ fontSize: 12, color: msg.startsWith('✓') ? 'var(--accent-green)' : 'var(--accent-red)', fontFamily: FM }}>{msg}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: '10px 0', background: 'var(--accent-green)', color: '#000', border: 'none', borderRadius: 6, fontFamily: FM, fontSize: 12, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
            {saving ? 'Saving…' : data?.configured ? 'Update' : 'Connect MT5'}
          </button>
          {data?.configured && (
            <button onClick={remove} style={{ padding: '10px 16px', background: 'transparent', color: 'var(--accent-red)', border: '1px solid var(--accent-red)', borderRadius: 6, fontFamily: FM, fontSize: 12, cursor: 'pointer' }}>
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main export ────────────────────────────────────────────────────────────
export default function ApiKeysTab() {
  const [me, setMe] = useState(null);
  const isMobile = useIsMobile();
  const reload = () => API('/api/users/me').then(setMe).catch(console.error);
  useEffect(() => { reload(); }, []);

  return (
    <div style={{ width: '100%', fontFamily: FF, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em', marginBottom: 6 }}>API Keys</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Connect your Bybit account so the bot can open and close trades on your behalf. Keys are encrypted with AES-256 and never stored in plain text.
        </div>
      </div>

      {/* Live Account only */}
      <KeySection
        title="Live Account"
        subtitle="Real funds. The bot will trade with real money once this key is connected."
        isTestnet={false}
        maskedKey={me?.bybit_live_key_masked || null}
        onSaved={reload}
        onDeleted={reload}
      />

      {/* Security note */}
      <div style={{ padding: '16px 18px', border: '1px solid var(--border-subtle)', borderRadius: 8, background: 'var(--bg-surface)' }}>
        <div style={{ fontFamily: FM, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>Security</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {[
            'Grant Trade + Position permissions only. Never enable Withdrawal.',
            'Restrict key to the trading server IP — contact support for the address.',
            'Keys are stored encrypted — once saved they cannot be read back.',
            me?.totp_enabled
              ? '✓ Two-factor authentication is enabled on your account.'
              : '2FA is not enabled — enable it in Settings for better protection.',
          ].map((line, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontFamily: FF, fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              <span style={{ marginTop: 2, flexShrink: 0 }}>·</span>
              {line}
            </div>
          ))}
        </div>
      </div>

      {/* ── MT5 Keys ── */}
      <Mt5KeysSection />

    </div>
  );
}
