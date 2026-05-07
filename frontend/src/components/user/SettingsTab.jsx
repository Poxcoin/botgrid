import React, { useEffect, useState } from 'react';

const API = (path, opts) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}`, 'Content-Type': 'application/json' },
  ...opts,
}).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.detail || 'Ошибка')));

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

const inp = { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '10px 14px', fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' };

const MONTHS = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек'];

function InvoicePanel() {
  const [data, setData] = React.useState(null);
  const [notifying, setNotifying] = React.useState(false);
  const [txInput, setTxInput] = React.useState('');
  const [notified, setNotified] = React.useState(false);

  React.useEffect(() => {
    API('/api/billing/invoice/current').then(setData).catch(() => {});
  }, []);

  async function handleNotify() {
    if (!data?.invoice) return;
    setNotifying(true);
    try {
      await API('/api/billing/invoice/notify', {
        method: 'POST',
        body: JSON.stringify({ invoice_id: data.invoice.id, tx_hash: txInput || undefined, invoice_type: 'weekly' }),
      });
      setNotified(true);
      setData(d => ({ ...d, invoice: { ...d.invoice, notified: true } }));
    } catch (e) {
      alert(typeof e === 'string' ? e : 'Error — please try again');
    } finally {
      setNotifying(false);
    }
  }

  if (!data) return <div style={{ fontSize: 12, color: 'var(--muted-fg)' }}>Loading…</div>;

  const mono = { fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' };
  const row  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 };
  const lbl  = { fontSize: 11, color: 'var(--muted-fg)' };
  const val  = { fontSize: 13, color: 'var(--fg)' };
  const btn  = { background: 'var(--fg)', color: 'var(--bg)', border: 'none', padding: '8px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: notifying ? 0.6 : 1, marginTop: 12 };
  const txInp = { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '8px 12px', fontSize: 11, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box', marginTop: 8 };

  const { invoice, current_week_pnl, projected_fee, wallet_trc20, week_label } = data;

  return (
    <div>
      {/* This week */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 10 }}>
          This week — {week_label}
        </div>
        <div style={row}>
          <span style={lbl}>Profit</span>
          <span style={{ ...val, color: current_week_pnl >= 0 ? '#4ade80' : '#e55' }}>
            {current_week_pnl >= 0 ? '+' : ''}{current_week_pnl.toFixed(2)} USDT
          </span>
        </div>
        <div style={row}>
          <span style={lbl}>Projected fee (20%)</span>
          <span style={val}>{projected_fee.toFixed(2)} USDT</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginTop: 4 }}>
          Billed every Monday. High-water mark protection applies.
        </div>
      </div>

      {/* Unpaid invoice */}
      {invoice && !invoice.fee_paid && (
        <div style={{ border: '1px solid rgba(200,150,0,0.3)', background: 'rgba(200,150,0,0.05)', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c96', marginBottom: 10 }}>
            Invoice due — {invoice.label}
          </div>
          <div style={row}>
            <span style={lbl}>Week profit</span>
            <span style={val}>+{invoice.gross_pnl.toFixed(2)} USDT</span>
          </div>
          <div style={row}>
            <span style={lbl}>Fee (20%)</span>
            <span style={{ ...val, fontWeight: 600 }}>{invoice.fee.toFixed(2)} USDT</span>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--muted-fg)' }}>Send USDT (TRC-20) to:</div>
          <div style={{ ...mono, color: 'var(--fg)', marginTop: 4, padding: '6px 10px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            {wallet_trc20 || '—'}
          </div>

          {invoice.notified || notified ? (
            <div style={{ fontSize: 12, color: '#4ade80', marginTop: 12 }}>
              ✓ Payment notification sent — we'll confirm within 24h
            </div>
          ) : (
            <>
              <input
                style={txInp}
                placeholder="TX hash (optional, e.g. a1b2c3...)"
                value={txInput}
                onChange={e => setTxInput(e.target.value)}
              />
              <button disabled={notifying} onClick={handleNotify} style={btn}>
                {notifying ? 'Sending…' : "I've paid →"}
              </button>
            </>
          )}
        </div>
      )}

      {invoice && invoice.fee_paid && (
        <div style={{ fontSize: 12, color: '#4ade80' }}>✓ Last invoice paid</div>
      )}
    </div>
  );
}

function BillingSection({ plan, trialDaysLeft }) {
  const btn = {
    background: 'var(--fg)', color: 'var(--bg)', border: 'none',
    padding: '8px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    marginTop: 12, marginRight: 8,
  };

  if (plan === 'trial') {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--fg)', marginBottom: 8 }}>
          Trial — <span style={{ color: '#aaa' }}>{trialDaysLeft} {trialDaysLeft === 1 ? 'day' : 'days'} left</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginBottom: 12 }}>
          Demo trading is active. Connect your API key and contact us to upgrade to Performance.
        </div>
        <a href="mailto:support@kadoclub.net" style={{ ...btn, textDecoration: 'none', display: 'inline-block' }}>
          Upgrade to Performance — 20% of profit
        </a>
      </div>
    );
  }

  if (plan === 'free') {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--fg)', marginBottom: 8 }}>Free — demo trading</div>
        <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginBottom: 12 }}>
          Switch to Performance for real trading. Pay only when in profit.
        </div>
        <a href="mailto:support@kadoclub.net" style={{ ...btn, textDecoration: 'none', display: 'inline-block' }}>
          Start trading — Performance 20%
        </a>
      </div>
    );
  }

  if (plan === 'performance') {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--fg)', marginBottom: 12 }}>
          Performance — 20% of weekly profit
          <span style={{ fontSize: 11, color: '#4ade80', marginLeft: 8 }}>Active</span>
        </div>
        <InvoicePanel />
      </div>
    );
  }

  return null;
}

// ── 2FA Modal ─────────────────────────────────────────────────────────────────
function TwoFAModal({ mode, onClose, onDone }) {
  // mode: 'setup' | 'disable'
  // setup steps: 'password' → 'scan' → 'codes'
  const [step, setStep] = useState(mode === 'setup' ? 'password' : 'disable');
  const [password, setPassword] = useState('');
  const [qr, setQr] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: '20px',
  };
  const modal = {
    background: 'var(--bg)', border: '1px solid var(--border)',
    padding: '28px 28px 24px', width: '100%', maxWidth: 400,
    maxHeight: '90vh', overflowY: 'auto',
  };
  const title = { fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em', marginBottom: 6 };
  const sub = { fontSize: 12, color: 'var(--muted-fg)', marginBottom: 20, lineHeight: 1.5 };
  const btnPrimary = {
    background: 'var(--fg)', color: 'var(--bg)', border: 'none',
    padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    width: '100%', opacity: loading ? 0.6 : 1,
  };
  const btnSecondary = {
    background: 'none', border: '1px solid var(--border)', color: 'var(--muted-fg)',
    padding: '8px 16px', fontSize: 12, cursor: 'pointer', marginTop: 8, width: '100%',
  };

  async function submitPassword(e) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const data = await API('/api/users/2fa/setup', { method: 'POST', body: JSON.stringify({ password }) });
      setQr(data.qr);
      setSecret(data.secret);
      setStep('scan');
    } catch (e) { setErr(typeof e === 'string' ? e : 'Неверный пароль'); }
    finally { setLoading(false); }
  }

  async function submitCode(e) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      const data = await API('/api/users/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
      setRecoveryCodes(data.recovery_codes || []);
      setStep('codes');
    } catch (e) { setErr(typeof e === 'string' ? e : 'Неверный код'); }
    finally { setLoading(false); }
  }

  async function submitDisable(e) {
    e.preventDefault();
    setErr(''); setLoading(true);
    try {
      await API('/api/users/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) });
      onDone(false);
    } catch (e) { setErr(typeof e === 'string' ? e : 'Неверный код'); }
    finally { setLoading(false); }
  }

  function copyAll() {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>

        {/* STEP: password */}
        {step === 'password' && (
          <form onSubmit={submitPassword}>
            <div style={title}>Включить 2FA</div>
            <div style={sub}>Введите пароль аккаунта для продолжения.</div>
            <input
              type="password" autoFocus required
              placeholder="Ваш пароль"
              value={password} onChange={e => setPassword(e.target.value)}
              style={{ ...inp, marginBottom: 12 }}
            />
            {err && <div style={{ fontSize: 12, color: '#e55', marginBottom: 10 }}>{err}</div>}
            <button type="submit" disabled={loading} style={btnPrimary}>
              {loading ? 'Проверка…' : 'Продолжить →'}
            </button>
            <button type="button" onClick={onClose} style={btnSecondary}>Отмена</button>
          </form>
        )}

        {/* STEP: scan QR */}
        {step === 'scan' && (
          <form onSubmit={submitCode}>
            <div style={title}>Отсканируйте QR-код</div>
            <div style={sub}>
              Откройте Google Authenticator, Authy или любое TOTP-приложение и отсканируйте код ниже.
            </div>
            {qr && (
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <img src={qr} alt="2FA QR" style={{ width: 180, height: 180, imageRendering: 'pixelated' }} />
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginBottom: 4 }}>
              Или введите секрет вручную:
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em',
              background: 'var(--bg2)', border: '1px solid var(--border)',
              padding: '8px 10px', wordBreak: 'break-all', marginBottom: 16,
            }}>
              {secret}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginBottom: 6 }}>
              Введите 6-значный код из приложения:
            </div>
            <input
              type="text" autoFocus required inputMode="numeric"
              placeholder="000000" maxLength={6}
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              style={{ ...inp, letterSpacing: '0.2em', textAlign: 'center', fontSize: 18, marginBottom: 12 }}
            />
            {err && <div style={{ fontSize: 12, color: '#e55', marginBottom: 10 }}>{err}</div>}
            <button type="submit" disabled={loading || code.length < 6} style={{ ...btnPrimary, opacity: (loading || code.length < 6) ? 0.5 : 1 }}>
              {loading ? 'Проверка…' : 'Подтвердить →'}
            </button>
            <button type="button" onClick={onClose} style={btnSecondary}>Отмена</button>
          </form>
        )}

        {/* STEP: recovery codes */}
        {step === 'codes' && (
          <div>
            <div style={title}>2FA включена</div>
            <div style={sub}>
              Сохраните коды восстановления — каждый используется один раз, если потеряете доступ к приложению. После закрытия этого окна они больше не будут показаны.
            </div>
            <div style={{
              background: 'var(--bg2)', border: '1px solid var(--border)',
              padding: '12px 14px', marginBottom: 12,
              display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px',
            }}>
              {recoveryCodes.map((c, i) => (
                <span key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg)' }}>{c}</span>
              ))}
            </div>
            <button onClick={copyAll} style={{ ...btnSecondary, marginTop: 0, marginBottom: 12, color: copied ? '#5a5' : 'var(--muted-fg)' }}>
              {copied ? '✓ Скопировано' : 'Копировать все'}
            </button>
            <button onClick={() => onDone(true)} style={btnPrimary}>Готово</button>
          </div>
        )}

        {/* MODE: disable */}
        {step === 'disable' && (
          <form onSubmit={submitDisable}>
            <div style={title}>Отключить 2FA</div>
            <div style={sub}>Введите 6-значный код из приложения-аутентификатора для подтверждения.</div>
            <input
              type="text" autoFocus required inputMode="numeric"
              placeholder="000000" maxLength={6}
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              style={{ ...inp, letterSpacing: '0.2em', textAlign: 'center', fontSize: 18, marginBottom: 12 }}
            />
            {err && <div style={{ fontSize: 12, color: '#e55', marginBottom: 10 }}>{err}</div>}
            <button type="submit" disabled={loading || code.length < 6} style={{ ...btnPrimary, background: '#c55', opacity: (loading || code.length < 6) ? 0.5 : 1 }}>
              {loading ? 'Проверка…' : 'Отключить 2FA'}
            </button>
            <button type="button" onClick={onClose} style={btnSecondary}>Отмена</button>
          </form>
        )}

      </div>
    </div>
  );
}

// ── Telegram link section ──────────────────────────────────────────────────────
function TelegramLinkSection({ me, onChange }) {
  const [linking, setLinking] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [err, setErr] = useState('');

  async function connect() {
    setErr(''); setLinking(true);
    try {
      const data = await API('/api/tg/link-token', { method: 'POST' });
      window.open(data.url, '_blank', 'noopener');
    } catch (e) {
      setErr(typeof e === 'string' ? e : 'Failed to create link');
    } finally {
      setLinking(false);
    }
  }

  async function disconnect() {
    if (!confirm('Disconnect Telegram from your account?')) return;
    setErr(''); setDisconnecting(true);
    try {
      await API('/api/tg/disconnect', { method: 'POST' });
      onChange();
    } catch (e) {
      setErr(typeof e === 'string' ? e : 'Error');
    } finally {
      setDisconnecting(false);
    }
  }

  const btnPrimary = {
    background: 'var(--fg)', color: 'var(--bg)', border: 'none',
    padding: '10px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    opacity: linking ? 0.6 : 1,
  };
  const btnSecondary = {
    background: 'none', border: '1px solid var(--border)', color: 'var(--muted-fg)',
    padding: '8px 16px', fontSize: 11, cursor: 'pointer',
  };

  if (me?.tg_connected) {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--fg)', marginBottom: 4 }}>
          <span style={{ color: '#4ade80', marginRight: 6 }}>✓</span>
          Connected{me.tg_username ? <> as <span style={{ fontFamily: 'var(--font-mono)' }}>@{me.tg_username}</span></> : ''}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginBottom: 12 }}>
          Trade, profit and invoice notifications will arrive in Telegram.
        </div>
        <button onClick={disconnect} disabled={disconnecting} style={btnSecondary}>
          {disconnecting ? 'Disconnecting…' : 'Disconnect'}
        </button>
        {err && <div style={{ fontSize: 12, color: '#e55', marginTop: 8 }}>{err}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginBottom: 12, lineHeight: 1.5 }}>
        Get notifications about trades, profit and invoices in Telegram. One click — no chat IDs to copy.
      </div>
      <button onClick={connect} disabled={linking} style={btnPrimary}>
        {linking ? 'Opening…' : 'Connect Telegram →'}
      </button>
      {err && <div style={{ fontSize: 12, color: '#e55', marginTop: 8 }}>{err}</div>}
    </div>
  );
}


// ── Main SettingsTab ───────────────────────────────────────────────────────────
export default function SettingsTab() {
  const [me, setMe] = useState(null);

  function reload() {
    API('/api/users/me').then(setMe).catch(console.error);
  }

  useEffect(() => { reload(); }, []);

  return (
    <div style={{ width: '100%' }}>
      <style>{`
        .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 48px; }
        @media (max-width: 900px) { .settings-grid { grid-template-columns: 1fr !important; } }
      `}</style>
      <div className="settings-grid">

        {/* Left: profile */}
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 20, fontFamily: 'var(--font-mono)' }}>Profile</div>

          <Field label="Email">
            <input type="text" value={me?.email || ''} disabled style={{ ...inp, opacity: 0.45, cursor: 'not-allowed' }} />
          </Field>

          <Field label="Plan">
            <span style={{ fontSize: 11, letterSpacing: '0.12em', padding: '3px 8px', border: '1px solid var(--border)', color: 'var(--muted-fg)' }}>
              {me?.plan?.toUpperCase() || '—'}
            </span>
            {me?.subscription_expires && (
              <span style={{ fontSize: 12, color: 'var(--muted-fg)', marginLeft: 10 }}>
                expires {new Date(me.subscription_expires).toLocaleDateString('en-US')}
              </span>
            )}
          </Field>

          <Field label="Telegram">
            <TelegramLinkSection me={me} onChange={reload} />
          </Field>
        </div>

        {/* Right: billing */}
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 20, fontFamily: 'var(--font-mono)' }}>Billing</div>
          <BillingSection plan={me?.plan} trialDaysLeft={me?.trial_days_left} />
        </div>

      </div>
    </div>
  );
}
