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


// ── Referral block ────────────────────────────────────────────────────────────
function ReferralBlock() {
  const { t } = useLang();
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    API('/api/users/referrals').then(setData).catch(() => {});
  }, []);

  function copyLink() {
    if (!data?.ref_link) return;
    navigator.clipboard.writeText(data.ref_link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const at = t.dashboard.account;

  if (!data) return <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t.dashboard.settings.loading}</div>;

  const statCard = { display: 'flex', flexDirection: 'column', gap: 2, padding: '10px 16px', border: '1px solid var(--border-subtle)', borderRadius: 6, minWidth: 100 };
  const statVal  = { fontSize: 18, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', fontWeight: 700 };
  const statLbl  = { fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' };

  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{at.referralLink}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
        <div style={{
          flex: 1,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-default)',
          borderRadius: 6,
          padding: '9px 12px',
          fontSize: 12,
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
        }}>
          {data.ref_link || '—'}
        </div>
        <button
          onClick={copyLink}
          style={{
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            color: copied ? 'var(--text-secondary)' : 'var(--text-primary)',
            borderRadius: 4,
            padding: '9px 16px',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {copied ? at.copied : at.copyLink}
        </button>
      </div>

      {data.invited_count === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{at.noReferrals}</div>
      ) : (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <div style={statCard}>
            <span style={statVal}>{data.invited_count ?? 0}</span>
            <span style={statLbl}>{at.invitedCount}</span>
          </div>
          <div style={statCard}>
            <span style={statVal}>{data.active_count ?? 0}</span>
            <span style={statLbl}>{at.activeCount}</span>
          </div>
          <div style={statCard}>
            <span style={{ ...statVal, color: 'var(--text-secondary)' }}>{(data.total_earned ?? 0).toFixed(2)}</span>
            <span style={statLbl}>{at.totalEarned} USDT</span>
          </div>
          <div style={statCard}>
            <span style={statVal}>{(data.pending ?? 0).toFixed(2)}</span>
            <span style={statLbl}>{at.pendingEarned} USDT</span>
          </div>
        </div>
      )}
    </div>
  );
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
    API('/api/users/me').then(setMe).catch(() => {});
  }

  useEffect(() => { reload(); }, []);

  return (
    <div style={{ width: '100%' }}>

      {/* ── PROFILE ── */}
      <div style={sectionHeader}>{t.dashboard.account.profileTitle}</div>
      <div style={{ height: 1, background: 'var(--border-subtle)', marginBottom: 20 }} />

      {me?.email && (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14, gap: 16 }}>
          <span style={rowLabel}>{t.dashboard.settings.accountEmail}</span>
          <span style={{ ...rowValue, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-muted)' }}>{maskEmail(me.email)}</span>
        </div>
      )}

      {me?.username && (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14, gap: 16 }}>
          <span style={rowLabel}>{t.dashboard.settings.usernameLabel}</span>
          <span style={{ ...rowValue, fontFamily: 'var(--font-mono)', fontSize: 13 }}>{me.username}</span>
        </div>
      )}

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
      <div style={sectionHeader}>{t.dashboard.account.telegramTitle}</div>
      <div style={{ height: 1, background: 'var(--border-subtle)', marginBottom: 20 }} />

      <TelegramBlock me={me} onChange={reload} />

      {/* ── REFERRAL ── */}
      <div style={divider} />
      <div style={sectionHeader}>{t.dashboard.account.referralTitle}</div>
      <div style={{ height: 1, background: 'var(--border-subtle)', marginBottom: 20 }} />

      <ReferralBlock />

    </div>
  );
}
