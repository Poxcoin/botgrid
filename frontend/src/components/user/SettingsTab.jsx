import React, { useEffect, useState } from 'react';
import { useLang } from '@/lib/LangContext';

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

// ── Invoice panel (Performance plan only) ─────────────────────────────────────
function InvoicePanel() {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [notifying, setNotifying] = useState(false);
  const [txInput, setTxInput] = useState('');
  const [notified, setNotified] = useState(false);

  useEffect(() => {
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
      alert(typeof e === 'string' ? e : t.dashboard.settings.errorTryAgain);
    } finally {
      setNotifying(false);
    }
  }

  if (!data) return <div style={{ fontSize: 12, color: 'var(--muted-fg)' }}>{t.dashboard.settings.loading}</div>;

  const mono = { fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' };
  const row  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 };
  const lbl  = { fontSize: 11, color: 'var(--muted-fg)' };
  const val  = { fontSize: 13, color: 'var(--fg)' };
  const btn  = { background: 'var(--fg)', color: 'var(--bg)', border: 'none', padding: '8px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: notifying ? 0.6 : 1, marginTop: 12 };
  const txInp = { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '8px 12px', fontSize: 11, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box', marginTop: 8 };

  const { invoice, current_week_pnl, projected_fee, wallet_trc20, week_label } = data;

  return (
    <div>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 10 }}>
          {t.dashboard.settings.thisWeek} {week_label}
        </div>
        <div style={row}>
          <span style={lbl}>{t.dashboard.settings.profit}</span>
          <span style={{ ...val, color: current_week_pnl >= 0 ? '#4ade80' : '#e55' }}>
            {current_week_pnl >= 0 ? '+' : ''}{current_week_pnl.toFixed(2)} USDT
          </span>
        </div>
        <div style={row}>
          <span style={lbl}>{t.dashboard.settings.projectedFee}</span>
          <span style={val}>{projected_fee.toFixed(2)} USDT</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginTop: 4 }}>
          {t.dashboard.settings.billedMonday}
        </div>
      </div>

      {invoice && !invoice.fee_paid && (
        <div style={{ border: '1px solid rgba(200,150,0,0.3)', background: 'rgba(200,150,0,0.05)', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c96', marginBottom: 10 }}>
            {t.dashboard.settings.invoiceDue} {invoice.label}
          </div>
          <div style={row}>
            <span style={lbl}>{t.dashboard.settings.weekProfit}</span>
            <span style={val}>+{invoice.gross_pnl.toFixed(2)} USDT</span>
          </div>
          <div style={row}>
            <span style={lbl}>{t.dashboard.settings.feeShort}</span>
            <span style={{ ...val, fontWeight: 600 }}>{invoice.fee.toFixed(2)} USDT</span>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--muted-fg)' }}>{t.dashboard.settings.sendUsdtTo}</div>
          <div style={{ ...mono, color: 'var(--fg)', marginTop: 4, padding: '6px 10px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            {wallet_trc20 || '—'}
          </div>

          {invoice.notified || notified ? (
            <div style={{ fontSize: 12, color: '#4ade80', marginTop: 12 }}>
              ✓ {t.dashboard.settings.paymentSent}
            </div>
          ) : (
            <>
              <input
                style={txInp}
                placeholder={t.dashboard.settings.txHashPlaceholder}
                value={txInput}
                onChange={e => setTxInput(e.target.value)}
              />
              <button disabled={notifying} onClick={handleNotify} style={btn}>
                {notifying ? t.dashboard.settings.sending : t.dashboard.settings.iPaid}
              </button>
            </>
          )}
        </div>
      )}

      {invoice && invoice.fee_paid && (
        <div style={{ fontSize: 12, color: '#4ade80' }}>{t.dashboard.settings.lastPaid}</div>
      )}
    </div>
  );
}

// ── Billing section ───────────────────────────────────────────────────────────
function BillingSection({ plan, trialDaysLeft }) {
  const { t } = useLang();
  const btn = {
    background: 'var(--fg)', color: 'var(--bg)', border: 'none',
    padding: '8px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    marginTop: 12, marginRight: 8,
  };

  if (plan === 'trial') {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--fg)', marginBottom: 8 }}>
          {t.dashboard.settings.trial} — <span style={{ color: '#aaa' }}>{trialDaysLeft} {trialDaysLeft === 1 ? t.dashboard.settings.day : t.dashboard.settings.days} {t.dashboard.settings.leftSuffix}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginBottom: 12 }}>
          {t.dashboard.settings.trialDesc}
        </div>
        <a href="mailto:support@kadoclub.net" style={{ ...btn, textDecoration: 'none', display: 'inline-block' }}>
          {t.dashboard.settings.upgradeBtn}
        </a>
      </div>
    );
  }

  if (plan === 'free') {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--fg)', marginBottom: 8 }}>{t.dashboard.settings.freeDemo}</div>
        <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginBottom: 12 }}>
          {t.dashboard.settings.freeDesc}
        </div>
        <a href="mailto:support@kadoclub.net" style={{ ...btn, textDecoration: 'none', display: 'inline-block' }}>
          {t.dashboard.settings.startTradingBtn}
        </a>
      </div>
    );
  }

  if (plan === 'performance') {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--fg)', marginBottom: 12 }}>
          {t.dashboard.settings.performanceWeekly}
          <span style={{ fontSize: 11, color: '#4ade80', marginLeft: 8 }}>{t.dashboard.settings.active}</span>
        </div>
        <InvoicePanel />
      </div>
    );
  }

  return null;
}

// ── Telegram link section ─────────────────────────────────────────────────────
function TelegramLinkSection({ me, onChange }) {
  const { t } = useLang();
  const [linking, setLinking] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [err, setErr] = useState('');

  async function connect() {
    setErr(''); setLinking(true);
    try {
      const data = await API('/api/tg/link-token', { method: 'POST' });
      window.open(data.url, '_blank', 'noopener');
    } catch (e) {
      setErr(typeof e === 'string' ? e : t.dashboard.settings.failedLink);
    } finally {
      setLinking(false);
    }
  }

  async function disconnect() {
    if (!confirm(t.dashboard.settings.disconnectConfirm)) return;
    setErr(''); setDisconnecting(true);
    try {
      await API('/api/tg/disconnect', { method: 'POST' });
      onChange();
    } catch (e) {
      setErr(typeof e === 'string' ? e : t.dashboard.settings.errorGeneric);
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
          {me.tg_username
            ? <>{t.dashboard.settings.connectedAs} <span style={{ fontFamily: 'var(--font-mono)' }}>@{me.tg_username}</span></>
            : t.dashboard.settings.connectedShort}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginBottom: 12 }}>
          {t.dashboard.settings.notifsArrive}
        </div>
        <button onClick={disconnect} disabled={disconnecting} style={btnSecondary}>
          {disconnecting ? t.dashboard.settings.disconnecting : t.dashboard.settings.disconnect}
        </button>
        {err && <div style={{ fontSize: 12, color: '#e55', marginTop: 8 }}>{err}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginBottom: 12, lineHeight: 1.5 }}>
        {t.dashboard.settings.notifsSetup}
      </div>
      <button onClick={connect} disabled={linking} style={btnPrimary}>
        {linking ? t.dashboard.settings.opening : t.dashboard.settings.connectTelegram}
      </button>
      {err && <div style={{ fontSize: 12, color: '#e55', marginTop: 8 }}>{err}</div>}
    </div>
  );
}

// ── Main SettingsTab ──────────────────────────────────────────────────────────
export default function SettingsTab() {
  const { t } = useLang();
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

        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 20, fontFamily: 'var(--font-mono)' }}>{t.dashboard.settings.profile}</div>

          <Field label={t.dashboard.settings.email}>
            <input type="text" value={me?.email || ''} disabled style={{ ...inp, opacity: 0.45, cursor: 'not-allowed' }} />
          </Field>

          <Field label={t.dashboard.settings.plan}>
            <span style={{ fontSize: 11, letterSpacing: '0.12em', padding: '3px 8px', border: '1px solid var(--border)', color: 'var(--muted-fg)' }}>
              {me?.plan?.toUpperCase() || '—'}
            </span>
            {me?.subscription_expires && (
              <span style={{ fontSize: 12, color: 'var(--muted-fg)', marginLeft: 10 }}>
                {t.dashboard.settings.expires} {new Date(me.subscription_expires).toLocaleDateString()}
              </span>
            )}
          </Field>

          <Field label={t.dashboard.settings.telegram}>
            <TelegramLinkSection me={me} onChange={reload} />
          </Field>
        </div>

        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 20, fontFamily: 'var(--font-mono)' }}>{t.dashboard.settings.billing}</div>
          <BillingSection plan={me?.plan} trialDaysLeft={me?.trial_days_left} />
        </div>

      </div>
    </div>
  );
}
