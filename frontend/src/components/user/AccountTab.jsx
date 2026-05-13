import React, { useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/LangContext';

const API = (path, opts) => fetch(path, {
  headers: { Authorization: `Bearer ${localStorage.getItem('kado_token')}`, 'Content-Type': 'application/json' },
  ...opts,
}).then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.detail || 'Error')));

// ── Card section ─────────────────────────────────────────────────────────────
function Section({ title, sub, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 10,
      background: 'var(--bg-elevated, var(--bg2))',
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={`${title} section`}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--fg)', textAlign: 'left',
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginTop: 3 }}>{sub}</div>}
        </div>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms', opacity: 0.5 }}>
          <path d="M2 4l3.5 3L9 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div style={{ padding: '4px 20px 20px', borderTop: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  );
}

const inp = { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg)', padding: '10px 14px', fontSize: 13, fontFamily: 'var(--font-sans)', outline: 'none', boxSizing: 'border-box' };

// ── Invoice panel ────────────────────────────────────────────────────────────
function InvoicePanel() {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [notifying, setNotifying] = useState(false);
  const [txInput, setTxInput] = useState('');
  const [notified, setNotified] = useState(false);
  const [notifyErr, setNotifyErr] = useState('');

  useEffect(() => {
    API('/api/billing/invoice/current').then(setData).catch(() => {});
  }, []);

  async function handleNotify() {
    if (!data?.invoice) return;
    setNotifying(true); setNotifyErr('');
    try {
      await API('/api/billing/invoice/notify', {
        method: 'POST',
        body: JSON.stringify({ invoice_id: data.invoice.id, tx_hash: txInput || undefined, invoice_type: 'weekly' }),
      });
      setNotified(true);
      setData(d => ({ ...d, invoice: { ...d.invoice, notified: true } }));
    } catch (e) {
      setNotifyErr(typeof e === 'string' ? e : t.dashboard.settings.errorTryAgain);
    } finally {
      setNotifying(false);
    }
  }

  if (!data) return <div style={{ fontSize: 12, color: 'var(--muted-fg)' }}>{t.dashboard.settings.loading}</div>;

  const mono = { fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' };
  const row  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 };
  const lbl  = { fontSize: 11, color: 'var(--muted-fg)' };
  const val  = { fontSize: 13, color: 'var(--fg)' };
  const btn  = { background: 'var(--fg)', color: 'var(--bg)', border: 'none', borderRadius: 4, padding: '8px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: notifying ? 0.6 : 1, marginTop: 12 };
  const txInp = { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--fg)', padding: '8px 12px', fontSize: 11, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box', marginTop: 8 };

  const { invoice, current_week_pnl, projected_fee, wallet_trc20, week_label } = data;

  return (
    <div>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
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
            <div style={{ fontSize: 12, color: 'var(--accent-green)', marginTop: 12 }}>
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
              {notifyErr && (
                <div role="alert" style={{
                  marginTop: 10, padding: '8px 12px',
                  border: '1px solid rgba(255,77,109,0.35)',
                  background: 'rgba(255,77,109,0.08)',
                  color: '#ff8a9b', fontSize: 12, fontFamily: 'var(--font-mono)',
                  borderRadius: 4,
                }}>
                  ! {notifyErr}
                </div>
              )}
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

// ── Billing block ────────────────────────────────────────────────────────────
function BillingBlock({ plan, trialDaysLeft }) {
  const { t } = useLang();
  const btn = {
    background: 'var(--fg)', color: 'var(--bg)', border: 'none', borderRadius: 4,
    padding: '8px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    marginTop: 12,
  };

  if (plan === 'trial') {
    const hasDays = typeof trialDaysLeft === 'number' && trialDaysLeft >= 0;
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--fg)', marginBottom: 8 }}>
          {t.dashboard.settings.trial}
          {hasDays && (
            <> — <span style={{ color: '#aaa' }}>{trialDaysLeft} {trialDaysLeft === 1 ? t.dashboard.settings.day : t.dashboard.settings.days} {t.dashboard.settings.leftSuffix}</span></>
          )}
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

  return <div style={{ fontSize: 12, color: 'var(--muted-fg)' }}>—</div>;
}

// ── Telegram link block (with polling) ───────────────────────────────────────
function TelegramBlock({ me, onChange }) {
  const { t } = useLang();
  const [linking, setLinking] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [err, setErr] = useState('');
  const pollRef = useRef(null);

  // Cleanup polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    setWaiting(true);
    let attempts = 0;
    const max = 30; // 30 × 3s = 90s
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const fresh = await API('/api/users/me');
        if (fresh?.tg_connected) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setWaiting(false);
          onChange();
          return;
        }
      } catch { /* keep polling */ }
      if (attempts >= max) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setWaiting(false);
      }
    }, 3000);
  }

  async function connect() {
    setErr(''); setLinking(true);
    try {
      const data = await API('/api/tg/link-token', { method: 'POST' });
      const win = window.open(data.url, '_blank', 'noopener');
      if (!win) {
        // popup blocked → fall back to same-tab navigation
        window.location.href = data.url;
        return;
      }
      startPolling();
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
    background: 'var(--fg)', color: 'var(--bg)', border: 'none', borderRadius: 4,
    padding: '10px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    opacity: linking ? 0.6 : 1,
  };
  const btnSecondary = {
    background: 'none', border: '1px solid var(--border)', color: 'var(--muted-fg)', borderRadius: 4,
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
      <button onClick={connect} disabled={linking || waiting} style={btnPrimary}>
        {linking ? t.dashboard.settings.opening : waiting ? t.dashboard.account.waitingTg : t.dashboard.settings.connectTelegram}
      </button>
      {waiting && (
        <div style={{ fontSize: 11, color: '#aaa', marginTop: 10, lineHeight: 1.5 }}>
          {t.dashboard.account.tgPressStart}
        </div>
      )}
      {err && <div style={{ fontSize: 12, color: '#e55', marginTop: 8 }}>{err}</div>}
    </div>
  );
}

// ── Main AccountTab ──────────────────────────────────────────────────────────
export default function AccountTab() {
  const { t } = useLang();
  const [me, setMe] = useState(null);

  function reload() {
    API('/api/users/me').then(setMe).catch(console.error);
  }

  useEffect(() => { reload(); }, []);

  const planUpper = me?.plan?.toUpperCase() || '—';
  const expires = me?.subscription_expires ? new Date(me.subscription_expires).toLocaleDateString() : null;

  return (
    <div style={{
      width: '100%',
      display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      gap: 16, alignItems: 'start',
    }}>

      {/* Profile section */}
      <Section
        title={t.dashboard.account.profileTitle}
        sub={me?.email || ''}
        defaultOpen
      >
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 6 }}>
            {t.dashboard.settings.email}
          </div>
          <input
            type="text"
            id="account-email"
            aria-label="Email address"
            value={me?.email || ''}
            disabled
            readOnly
            style={{ ...inp, opacity: 0.45, cursor: 'not-allowed' }}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 6 }}>
            {t.dashboard.settings.plan}
          </div>
          <span style={{ fontSize: 11, letterSpacing: '0.12em', padding: '3px 8px', border: '1px solid var(--border)', color: 'var(--muted-fg)' }}>
            {planUpper}
          </span>
          {expires && (
            <span style={{ fontSize: 12, color: 'var(--muted-fg)', marginLeft: 10 }}>
              {t.dashboard.settings.expires} {expires}
            </span>
          )}
        </div>

        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 6 }}>
            {t.dashboard.account.security2fa}
          </div>
          <div style={{ fontSize: 13, color: 'var(--fg)' }}>
            {me?.totp_enabled ? <span style={{ color: '#4ade80' }}>✓ {t.dashboard.account.enabled}</span> : <span style={{ color: 'var(--muted-fg)' }}>{t.dashboard.account.disabled}</span>}
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'security' }))}
            style={{
              marginTop: 10, background: 'none', border: '1px solid var(--border)', color: 'var(--fg)', borderRadius: 4,
              padding: '7px 14px', fontSize: 11, cursor: 'pointer', letterSpacing: '0.04em',
            }}
          >
            {t.dashboard.account.manageSecurity} →
          </button>
        </div>
      </Section>

      {/* Telegram section */}
      <Section
        title={t.dashboard.account.telegramTitle}
        sub={me?.tg_connected ? `@${me.tg_username || '—'}` : t.dashboard.account.telegramSubDisconnected}
        defaultOpen
      >
        <TelegramBlock me={me} onChange={reload} />
      </Section>

      {/* Billing section — full width */}
      <div style={{ gridColumn: '1 / -1' }}>
        <Section
          title={t.dashboard.account.billingTitle}
          sub={planUpper}
          defaultOpen
        >
          <BillingBlock plan={me?.plan} trialDaysLeft={me?.trial_days_left} />
        </Section>
      </div>

    </div>
  );
}
