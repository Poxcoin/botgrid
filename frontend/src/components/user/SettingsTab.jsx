import React, { useState } from 'react';
import { useLang } from '@/lib/LangContext';
import { useTheme } from '@/lib/ThemeContext';
import { useIsMobile } from '@/lib/useIsMobile';
import { LANGS } from '@/i18n/translations';

const LANG_FULL = {
  en: 'English', es: 'Español', uk: 'Українська', ru: 'Русский', de: 'Deutsch', zh: '中文',
};

const TZ_OPTIONS = [
  'auto',
  'UTC',
  'Europe/Kyiv',
  'Europe/Warsaw',
  'Europe/Berlin',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Singapore',
  'Asia/Shanghai',
  'Asia/Tokyo',
];

const sectionHeaderStyle = {
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  marginBottom: 4,
};

const rowStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 0',
  gap: 16,
};

const labelStyle = {
  fontFamily: 'var(--font-sans)',
  fontSize: 14,
  color: 'var(--text-primary)',
  fontWeight: 500,
  flex: 1,
  minWidth: 0,
};

const descStyle = {
  fontFamily: 'var(--font-sans)',
  fontSize: 12,
  color: 'var(--text-muted)',
  marginTop: 2,
  lineHeight: 1.5,
};

const selectStyle = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: 14,
  fontFamily: 'var(--font-sans)',
  outline: 'none',
  cursor: 'pointer',
  minWidth: 160,
  flexShrink: 0,
};

const dividerStyle = {
  height: 1,
  background: 'var(--border-subtle)',
  margin: '8px 0',
};

// ── Notifications block ──────────────────────────────────────────────────────
function NotificationsBlock() {
  const { t } = useLang();
  const [prefs, setPrefs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kado_notifs') || '{}'); }
    catch { return {}; }
  });
  const channels = [
    { key: 'telegram', label: t.dashboard.settingsPrefs.notifTelegram, desc: t.dashboard.settingsPrefs.notifTelegramDesc },
    { key: 'email',    label: t.dashboard.settingsPrefs.notifEmail,    desc: t.dashboard.settingsPrefs.notifEmailDesc },
    { key: 'browser',  label: t.dashboard.settingsPrefs.notifBrowser,  desc: t.dashboard.settingsPrefs.notifBrowserDesc },
  ];

  function toggle(key) {
    setPrefs(p => {
      const next = { ...p, [key]: !p[key] };
      localStorage.setItem('kado_notifs', JSON.stringify(next));
      return next;
    });
  }

  return (
    <>
      {channels.map((c, i) => (
        <React.Fragment key={c.key}>
          <label style={{ ...rowStyle, cursor: 'pointer', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={labelStyle}>{c.label}</div>
              <div style={descStyle}>{c.desc}</div>
            </div>
            <span style={{
              position: 'relative',
              width: 36,
              height: 20,
              flexShrink: 0,
              background: prefs[c.key] ? 'var(--text-secondary)' : 'var(--border-default)',
              borderRadius: 100,
              transition: 'background 150ms',
              display: 'inline-block',
              marginTop: 2,
            }}>
              <span style={{
                position: 'absolute',
                top: 2,
                left: prefs[c.key] ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: 'var(--bg-surface)',
                transition: 'left 150ms',
              }} />
              <input
                type="checkbox"
                checked={!!prefs[c.key]}
                onChange={() => toggle(c.key)}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
              />
            </span>
          </label>
          {i < channels.length - 1 && (
            <div style={{ height: 1, background: 'var(--border-subtle)' }} />
          )}
        </React.Fragment>
      ))}
    </>
  );
}

// ── Main SettingsTab (preferences) ───────────────────────────────────────────
export default function SettingsTab() {
  const { t, lang, setLang } = useLang();
  const { theme, toggle: toggleTheme } = useTheme();
  const isMobile = useIsMobile();
  const [tz, setTz] = useState(() => localStorage.getItem('kado_tz') || 'auto');

  function changeTz(v) {
    setTz(v);
    localStorage.setItem('kado_tz', v);
  }

  function changeTheme(v) {
    if (v !== theme) toggleTheme();
  }

  return (
    <div style={{ width: '100%', maxWidth: 640 }}>

      {/* LANGUAGE */}
      <div style={sectionHeaderStyle}>{t.dashboard.settingsPrefs.languageTitle}</div>
      <div style={rowStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={labelStyle}>{t.dashboard.settingsPrefs.languageTitle}</div>
          <div style={descStyle}>{t.dashboard.settingsPrefs.languageDesc}</div>
        </div>
        <select value={lang} onChange={e => setLang(e.target.value)} style={selectStyle}>
          {LANGS.map(l => (
            <option key={l.code} value={l.code}>{LANG_FULL[l.code]}</option>
          ))}
        </select>
      </div>

      <div style={dividerStyle} />

      {/* THEME */}
      <div style={{ ...sectionHeaderStyle, marginTop: 16 }}>{t.dashboard.settingsPrefs.themeTitle}</div>
      <div style={rowStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={labelStyle}>{t.dashboard.settingsPrefs.themeTitle}</div>
          <div style={descStyle}>{t.dashboard.settingsPrefs.themeDesc}</div>
        </div>
        <select value={theme} onChange={e => changeTheme(e.target.value)} style={selectStyle}>
          <option value="dark">{t.dashboard.settingsPrefs.themeDark}</option>
          <option value="light">{t.dashboard.settingsPrefs.themeLight}</option>
        </select>
      </div>

      <div style={dividerStyle} />

      {/* TIMEZONE */}
      <div style={{ ...sectionHeaderStyle, marginTop: 16 }}>{t.dashboard.settingsPrefs.timezoneTitle}</div>
      <div style={rowStyle}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={labelStyle}>{t.dashboard.settingsPrefs.timezoneTitle}</div>
          <div style={descStyle}>{t.dashboard.settingsPrefs.timezoneDesc}</div>
        </div>
        <select value={tz} onChange={e => changeTz(e.target.value)} style={selectStyle}>
          {TZ_OPTIONS.map(z => (
            <option key={z} value={z}>{z === 'auto' ? t.dashboard.settingsPrefs.tzAuto : z}</option>
          ))}
        </select>
      </div>

      <div style={dividerStyle} />

      {/* NOTIFICATIONS */}
      <div style={{ ...sectionHeaderStyle, marginTop: 16 }}>{t.dashboard.settingsPrefs.notifsTitle}</div>
      <NotificationsBlock />

    </div>
  );
}
