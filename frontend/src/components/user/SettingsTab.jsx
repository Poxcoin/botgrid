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
        body: JSON.stringify({ invoice_id: data.invoice.id, tx_hash: txInput || undefined }),
      });
      setNotified(true);
      setData(d => ({ ...d, invoice: { ...d.invoice, notified: true } }));
    } catch (e) {
      alert(typeof e === 'string' ? e : 'Ошибка — попробуйте снова');
    } finally {
      setNotifying(false);
    }
  }

  if (!data) return <div style={{ fontSize: 12, color: 'var(--muted-fg)' }}>Загрузка…</div>;

  const mono = { fontFamily: 'var(--font-mono)', fontSize: 11, wordBreak: 'break-all' };
  const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 };
  const label = { fontSize: 11, color: 'var(--muted-fg)' };
  const value = { fontSize: 13, color: 'var(--fg)' };
  const btn = { background: 'var(--fg)', color: 'var(--bg)', border: 'none', padding: '8px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: notifying ? 0.6 : 1, marginTop: 12 };
  const txInp = { width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', color: 'var(--fg)', padding: '8px 12px', fontSize: 11, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box', marginTop: 8 };

  const { invoice, current_month_pnl, projected_fee, wallet_trc20 } = data;

  return (
    <div>
      {/* Текущий месяц */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', padding: '14px 16px', marginBottom: 16 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 10 }}>
          Этот месяц
        </div>
        <div style={row}>
          <span style={label}>Прибыль</span>
          <span style={{ ...value, color: current_month_pnl >= 0 ? '#5a5' : '#c55' }}>
            {current_month_pnl >= 0 ? '+' : ''}{current_month_pnl.toFixed(2)} USDT
          </span>
        </div>
        <div style={row}>
          <span style={label}>Прогноз комиссии (20%)</span>
          <span style={value}>{projected_fee.toFixed(2)} USDT</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginTop: 4 }}>
          Выставляется 1-го числа. Защита по отметке максимума.
        </div>
      </div>

      {/* Неоплаченный счёт */}
      {invoice && !invoice.fee_paid && (
        <div style={{ border: '1px solid rgba(200,150,0,0.3)', background: 'rgba(200,150,0,0.05)', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#c96', marginBottom: 10 }}>
            Счёт к оплате — {MONTHS[invoice.month - 1]} {invoice.year}
          </div>
          <div style={row}>
            <span style={label}>Прибыль</span>
            <span style={value}>+{invoice.gross_pnl.toFixed(2)} USDT</span>
          </div>
          <div style={row}>
            <span style={label}>Комиссия (20%)</span>
            <span style={{ ...value, fontWeight: 600 }}>{invoice.fee.toFixed(2)} USDT</span>
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: 'var(--muted-fg)' }}>Отправьте USDT (TRC-20) на адрес:</div>
          <div style={{ ...mono, color: 'var(--fg)', marginTop: 4, padding: '6px 10px', background: 'var(--bg2)', border: '1px solid var(--border)' }}>
            {wallet_trc20 || '—'}
          </div>

          {invoice.notified || notified ? (
            <div style={{ fontSize: 12, color: '#5a5', marginTop: 12 }}>
              ✓ Уведомление отправлено — администратор подтвердит в течение 24ч
            </div>
          ) : (
            <>
              <input
                style={txInp}
                placeholder="TX хэш (необязательно, напр. a1b2c3...)"
                value={txInput}
                onChange={e => setTxInput(e.target.value)}
              />
              <button disabled={notifying} onClick={handleNotify} style={btn}>
                {notifying ? 'Отправка…' : 'Я оплатил →'}
              </button>
            </>
          )}
        </div>
      )}

      {invoice && invoice.fee_paid && (
        <div style={{ fontSize: 12, color: '#5a5' }}>✓ Последний счёт оплачен</div>
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
          Пробный период — <span style={{ color: '#aaa' }}>осталось {trialDaysLeft} {trialDaysLeft === 1 ? 'день' : trialDaysLeft < 5 ? 'дня' : 'дней'}</span>
        </div>
        <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginBottom: 12 }}>
          Торговля на демо-счёте активна. Подключите API-ключ и напишите нам для активации Performance.
        </div>
        <a href="mailto:support@kadoclub.net" style={{ ...btn, textDecoration: 'none', display: 'inline-block' }}>
          Перейти на Performance — 20% от прибыли
        </a>
      </div>
    );
  }

  if (plan === 'free') {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--fg)', marginBottom: 8 }}>Бесплатный — демо-торговля</div>
        <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginBottom: 12 }}>
          Перейдите на Performance для реальной торговли. Платите только когда в плюсе.
        </div>
        <a href="mailto:support@kadoclub.net" style={{ ...btn, textDecoration: 'none', display: 'inline-block' }}>
          Начать торговлю — Performance 20%
        </a>
      </div>
    );
  }

  if (plan === 'performance') {
    return (
      <div>
        <div style={{ fontSize: 13, color: 'var(--fg)', marginBottom: 12 }}>
          Performance — 20% от месячной прибыли
          <span style={{ fontSize: 11, color: '#5a5', marginLeft: 8 }}>Активен</span>
        </div>
        <InvoicePanel />
      </div>
    );
  }

  return null;
}

export default function SettingsTab() {
  const [me, setMe] = useState(null);
  const [tgId, setTgId] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    API('/api/users/me').then(d => { setMe(d); setTgId(d.tg_chat_id || ''); }).catch(console.error);
  }, []);

  async function saveProfile(e) {
    e.preventDefault();
    setMsg(''); setSaving(true);
    try {
      await API('/api/users/me', { method: 'PUT', body: JSON.stringify({ tg_chat_id: tgId }) });
      setMsg('Сохранено');
    } catch (e) { setMsg(e); }
    finally { setSaving(false); }
  }

  async function setup2fa() {
    try {
      const { qr, secret } = await API('/api/users/2fa/setup');
      const code = prompt(`Отсканируйте QR в приложении-аутентификаторе.\nИли введите секрет вручную: ${secret}\n\nЗатем введите 6-значный код:`);
      if (!code) return;
      await API('/api/users/2fa/enable', { method: 'POST', body: JSON.stringify({ code }) });
      setMe(m => ({ ...m, totp_enabled: true }));
      alert('2FA включена');
    } catch (e) { alert(typeof e === 'string' ? e : 'Не удалось включить 2FA'); }
  }

  async function disable2fa() {
    const code = prompt('Введите 6-значный код из приложения для отключения 2FA:');
    if (!code) return;
    try {
      await API('/api/users/2fa/disable', { method: 'POST', body: JSON.stringify({ code }) });
      setMe(m => ({ ...m, totp_enabled: false }));
      alert('2FA отключена');
    } catch (e) { alert(typeof e === 'string' ? e : 'Ошибка'); }
  }

  return (
    <div style={{ maxWidth: 420 }}>
      <form onSubmit={saveProfile}>
        <Field label="Email">
          <input type="text" value={me?.email || ''} disabled style={{ ...inp, opacity: 0.45, cursor: 'not-allowed' }} />
        </Field>

        <Field label="Тариф">
          <span style={{ fontSize: 11, letterSpacing: '0.12em', padding: '3px 8px', border: '1px solid var(--border)', color: 'var(--muted-fg)' }}>
            {me?.plan?.toUpperCase() || '—'}
          </span>
          {me?.subscription_expires && (
            <span style={{ fontSize: 12, color: 'var(--muted-fg)', marginLeft: 10 }}>
              истекает {new Date(me.subscription_expires).toLocaleDateString('ru-RU')}
            </span>
          )}
        </Field>

        <Field label="Telegram Chat ID">
          <input type="text" value={tgId} onChange={e => setTgId(e.target.value)} placeholder="напр. 123456789" style={inp} />
          <div style={{ fontSize: 11, color: 'var(--muted-fg)', marginTop: 4 }}>Узнать у @userinfobot в Telegram</div>
        </Field>

        {msg && <div style={{ fontSize: 12, color: 'var(--muted-fg)', marginBottom: 12 }}>{msg}</div>}

        <button type="submit" disabled={saving} style={{ background: 'var(--fg)', color: 'var(--bg)', border: 'none', padding: '10px 24px', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1, marginBottom: 32 }}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </form>

      {/* 2FA */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 12 }}>Двухфакторная авторизация</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 13, color: me?.totp_enabled ? 'var(--fg)' : 'var(--muted-fg)' }}>
            {me?.totp_enabled ? 'Включена' : 'Отключена'}
          </span>
          {me?.totp_enabled ? (
            <button onClick={disable2fa} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--muted-fg)', padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
              Отключить 2FA
            </button>
          ) : (
            <button onClick={setup2fa} style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--fg)', padding: '6px 14px', fontSize: 12, cursor: 'pointer' }}>
              Включить 2FA
            </button>
          )}
        </div>
      </div>

      {/* Подписка */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 24, marginTop: 8 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted-fg)', marginBottom: 16 }}>
          Подписка
        </div>
        <BillingSection plan={me?.plan} trialDaysLeft={me?.trial_days_left} />
      </div>
    </div>
  );
}
