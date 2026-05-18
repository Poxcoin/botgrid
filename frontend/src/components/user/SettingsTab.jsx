import React, { useState } from 'react';
import { useLang } from '@/lib/LangContext';
import { useTheme } from '@/lib/ThemeContext';
import { useIsMobile } from '@/lib/useIsMobile';
import { LANGS } from '@/i18n/translations';

const LANG_FULL = {
  en: 'English', es: 'Español', uk: 'Українська', ru: 'Русский', de: 'Deutsch', zh: '中文',
};

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
        aria-label={`${title} settings`}
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '16px 20px', background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--fg)', textAlign: 'left',
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{title}</div>
          {sub && <div style={{ fontSize: 13, color: 'var(--muted-fg)', marginTop: 4 }}>{sub}</div>}
        </div>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 180ms', opacity: 0.5 }}>
          <path d="M2 4l3.5 3L9 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && <div style={{ padding: '4px 20px 20px', borderTop: '1px solid var(--border)' }}>{children}</div>}
    </div>
  );
}

const selectStyle = {
  width: '100%', maxWidth: 360,
  background: 'var(--bg2)', border: '1px solid var(--border)',
  color: 'var(--fg)', padding: '12px 16px', fontSize: 14,
  fontFamily: 'var(--font-sans)', outline: 'none', cursor: 'pointer',
  appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none',
  backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'11\' height=\'11\' viewBox=\'0 0 11 11\' fill=\'none\'><path d=\'M2 4l3.5 3L9 4\' stroke=\'%23999\' stroke-width=\'1.4\' stroke-linecap=\'round\' stroke-linejoin=\'round\'/></svg>")',
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
  paddingRight: 36,
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
    <div>
      {channels.map(c => (
        <label key={c.key} style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          padding: '12px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer',
          gap: 16,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--fg)', marginBottom: 4 }}>{c.label}</div>
            <div style={{ fontSize: 13, color: 'var(--muted-fg)', lineHeight: 1.5 }}>{c.desc}</div>
          </div>
          <span style={{
            position: 'relative', width: 36, height: 20, flexShrink: 0,
            background: prefs[c.key] ? 'var(--fg)' : 'var(--border)',
            borderRadius: 100, transition: 'background 150ms',
            display: 'inline-block', marginTop: 2,
          }}>
            <span style={{
              position: 'absolute', top: 2, left: prefs[c.key] ? 18 : 2,
              width: 16, height: 16, borderRadius: '50%',
              background: prefs[c.key] ? 'var(--bg)' : 'var(--fg)',
              transition: 'left 150ms', opacity: 0.95,
            }} />
            <input
              type="checkbox"
              checked={!!prefs[c.key]}
              onChange={() => toggle(c.key)}
              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
            />
          </span>
        </label>
      ))}
    </div>
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
    <div style={{
      width: '100%',
      display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))',
      gap: 16, alignItems: 'start',
    }}>

      {/* Language */}
      <Section
        title={t.dashboard.settingsPrefs.languageTitle}
        sub={LANG_FULL[lang]}
        defaultOpen
      >
        <div style={{ fontSize: 13, color: 'var(--muted-fg)', marginBottom: 12, lineHeight: 1.5 }}>
          {t.dashboard.settingsPrefs.languageDesc}
        </div>
        <select value={lang} onChange={e => setLang(e.target.value)} style={selectStyle}>
          {LANGS.map(l => (
            <option key={l.code} value={l.code}>{LANG_FULL[l.code]}</option>
          ))}
        </select>
      </Section>

      {/* Theme */}
      <Section
        title={t.dashboard.settingsPrefs.themeTitle}
        sub={theme === 'dark' ? t.dashboard.settingsPrefs.themeDark : t.dashboard.settingsPrefs.themeLight}
        defaultOpen
      >
        <div style={{ fontSize: 13, color: 'var(--muted-fg)', marginBottom: 12, lineHeight: 1.5 }}>
          {t.dashboard.settingsPrefs.themeDesc}
        </div>
        <select value={theme} onChange={e => changeTheme(e.target.value)} style={selectStyle}>
          <option value="dark">{t.dashboard.settingsPrefs.themeDark}</option>
          <option value="light">{t.dashboard.settingsPrefs.themeLight}</option>
        </select>
      </Section>

      {/* Timezone */}
      <Section
        title={t.dashboard.settingsPrefs.timezoneTitle}
        sub={tz === 'auto' ? t.dashboard.settingsPrefs.tzAuto : tz}
        defaultOpen
      >
        <div style={{ fontSize: 13, color: 'var(--muted-fg)', marginBottom: 12, lineHeight: 1.5 }}>
          {t.dashboard.settingsPrefs.timezoneDesc}
        </div>
        <select value={tz} onChange={e => changeTz(e.target.value)} style={selectStyle}>
          {TZ_OPTIONS.map(z => (
            <option key={z} value={z}>{z === 'auto' ? t.dashboard.settingsPrefs.tzAuto : z}</option>
          ))}
        </select>
      </Section>

      {/* Notifications */}
      <Section
        title={t.dashboard.settingsPrefs.notifsTitle}
        sub={t.dashboard.settingsPrefs.notifsSub}
        defaultOpen
      >
        <NotificationsBlock />
      </Section>

    </div>
  );
}
