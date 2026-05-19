import React, { useEffect, useRef, useState } from 'react';
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

// ── Shared style atoms ────────────────────────────────────────────────────────
const sectionHeader = {
  fontSize: 10,
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  marginBottom: 10,
};

const divider = { height: 1, background: 'var(--border-subtle)', margin: '24px 0' };

const rowLabel = {
  fontSize: 10,
  fontFamily: 'var(--font-mono)',
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  minWidth: 100,
  flexShrink: 0,
};

const rowValue = {
  fontSize: 14,
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-sans)',
};

const inp = {
  width: '100%',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  borderRadius: 6,
  color: 'var(--text-primary)',
  padding: '10px 14px',
  fontSize: 14,
  fontFamily: 'var(--font-sans)',
  outline: 'none',
  boxSizing: 'border-box',
};

// ── Invoice panel ─────────────────────────────────────────────────────────────
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

  if (!data) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.dashboard.settings.loading}</div>;

  const mono = { fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' };
  const row  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 };
  const lbl  = { fontSize: 11, color: 'var(--text-muted)' };
  const val  = { fontSize: 13, color: 'var(--text-primary)' };
  const btn  = {
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    borderRadius: 4,
    padding: '8px 20px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    opacity: notifying ? 0.6 : 1,
    marginTop: 12,
  };
  const txInp = {
    width: '100%',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-default)',
    borderRadius: 6,
    color: 'var(--text-primary)',
    padding: '8px 12px',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    boxSizing: 'border-box',
    marginTop: 8,
  };

  const { invoice, current_week_pnl, projected_fee, wallet_trc20, week_label } = data;

  return (
    <div>
      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
          {t.dashboard.settings.thisWeek} {week_label}
        </div>
        <div style={row}>
          <span style={lbl}>{t.dashboard.settings.profit}</span>
          <span style={{ ...val, color: current_week_pnl >= 0 ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
            {current_week_pnl >= 0 ? '+' : ''}{current_week_pnl.toFixed(2)} USDT
          </span>
        </div>
        <div style={row}>
          <span style={lbl}>{t.dashboard.settings.projectedFee}</span>
          <span style={val}>{projected_fee.toFixed(2)} USDT</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          {t.dashboard.settings.billedMonday}
        </div>
      </div>

      {invoice && !invoice.fee_paid && (
        <div style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', padding: '14px 16px', borderRadius: 8 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 10 }}>
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
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>{t.dashboard.settings.sendUsdtTo}</div>
          <div style={{ ...mono, color: 'var(--text-primary)', marginTop: 4, padding: '6px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-default)', borderRadius: 4 }}>
            {wallet_trc20 || '—'}
          </div>

          {invoice.notified || notified ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12 }}>
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
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-surface)',
                  color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-mono)',
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
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.dashboard.settings.lastPaid}</div>
      )}
    </div>
  );
}

// ── Billing block ─────────────────────────────────────────────────────────────
function BillingBlock({ plan, trialDaysLeft }) {
  const { t } = useLang();
  const btn = {
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    borderRadius: 4,
    padding: '8px 20px',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: 12,
  };

  if (plan === 'trial') {
    const hasDays = typeof trialDaysLeft === 'number' && trialDaysLeft >= 0;
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 8 }}>
          {t.dashboard.settings.trial}
          {hasDays && (
            <> — <span style={{ color: 'var(--text-muted)' }}>{trialDaysLeft} {trialDaysLeft === 1 ? t.dashboard.settings.day : t.dashboard.settings.days} {t.dashboard.settings.leftSuffix}</span></>
          )}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {t.dashboard.settings.trialDesc}
        </div>
        <button onClick={() => window.open('mailto:support@kadoclub.net', '_blank')} style={btn}>
          {t.dashboard.settings.upgradeBtn}
        </button>
      </div>
    );
  }

  if (plan === 'free') {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 8 }}>{t.dashboard.settings.freeDemo}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {t.dashboard.settings.freeDesc}
        </div>
        <button onClick={() => window.open('mailto:support@kadoclub.net', '_blank')} style={btn}>
          {t.dashboard.settings.startTradingBtn}
        </button>
      </div>
    );
  }

  if (plan === 'performance') {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--text-primary)', marginBottom: 12 }}>
          {t.dashboard.settings.performanceWeekly}
          <span style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>{t.dashboard.settings.active}</span>
        </div>
        <InvoicePanel />
      </div>
    );
  }

  return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</div>;
}

// ── Telegram link block (with polling) ────────────────────────────────────────
function TelegramBlock({ me, onChange }) {
  const { t } = useLang();
  const [linking, setLinking] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [err, setErr] = useState('');
  const pollRef = useRef(null);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  function startPolling() {
    if (pollRef.current) clearInterval(pollRef.current);
    setWaiting(true);
    let attempts = 0;
    const max = 30;
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
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-default)',
    borderRadius: 4,
    padding: '10px 22px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
    opacity: linking ? 0.6 : 1,
  };
  const btnSecondary = {
    background: 'var(--bg)',
    border: '1px solid var(--border-default)',
    color: 'var(--text-muted)',
    borderRadius: 4,
    padding: '8px 18px',
    fontSize: 13,
    cursor: 'pointer',
  };

  if (me?.tg_connected) {
    return (
      <div>
        <div style={{ fontSize: 14, color: 'var(--text-primary)', marginBottom: 6 }}>
          {me.tg_username
            ? <>{t.dashboard.settings.connectedAs} <span style={{ fontFamily: 'var(--font-mono)' }}>@{me.tg_username}</span></>
            : t.dashboard.settings.connectedShort}
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
          {t.dashboard.settings.notifsArrive}
        </div>
        <button onClick={disconnect} disabled={disconnecting} style={btnSecondary}>
          {disconnecting ? t.dashboard.settings.disconnecting : t.dashboard.settings.disconnect}
        </button>
        {err && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>{err}</div>}
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        {t.dashboard.settings.notifsSetup}
      </div>
      <button onClick={connect} disabled={linking || waiting} style={btnPrimary}>
        {linking ? t.dashboard.settings.opening : waiting ? t.dashboard.account.waitingTg : t.dashboard.settings.connectTelegram}
      </button>
      {waiting && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5 }}>
          {t.dashboard.account.tgPressStart}
        </div>
      )}
      {err && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{err}</div>}
    </div>
  );
}

// ── Main AccountTab ───────────────────────────────────────────────────────────
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
    <div style={{ maxWidth: 640, width: '100%' }}>

      {/* ── PROFILE ── */}
      <div style={sectionHeader}>Profile</div>
      <div style={{ height: 1, background: 'var(--border-subtle)', marginBottom: 20 }} />


      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 16 }}>
        <span style={rowLabel}>{t.dashboard.settings.plan}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '0.12em',
            padding: '4px 10px',
            border: '1px solid var(--border-default)',
            color: 'var(--text-muted)',
            borderRadius: 3,
          }}>
            {planUpper}
          </span>
          {expires && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {t.dashboard.settings.expires} {expires}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
        <span style={{ ...rowLabel, paddingTop: 3 }}>{t.dashboard.account.security2fa}</span>
        <div>
          <div style={{ ...rowValue, marginBottom: 10 }}>
            {me?.totp_enabled
              ? <span style={{ color: 'var(--text-secondary)' }}>{t.dashboard.account.enabled}</span>
              : <span style={{ color: 'var(--text-muted)' }}>{t.dashboard.account.disabled}</span>}
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('switch-tab', { detail: 'security' }))}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
              borderRadius: 4,
              padding: '7px 14px',
              fontSize: 12,
              cursor: 'pointer',
              letterSpacing: '0.04em',
            }}
          >
            {t.dashboard.account.manageSecurity} →
          </button>
        </div>
      </div>

      {/* ── TELEGRAM ── */}
      <div style={divider} />
      <div style={sectionHeader}>Telegram</div>
      <div style={{ height: 1, background: 'var(--border-subtle)', marginBottom: 20 }} />

      <TelegramBlock me={me} onChange={reload} />

      {/* ── BILLING ── */}
      <div style={divider} />
      <div style={sectionHeader}>Billing</div>
      <div style={{ height: 1, background: 'var(--border-subtle)', marginBottom: 20 }} />

      <BillingBlock plan={me?.plan} trialDaysLeft={me?.trial_days_left} />

    </div>
  );
}
