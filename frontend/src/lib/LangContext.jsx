import React, { createContext, useContext, useState, useCallback } from 'react';
import { translations, LANGS, DEFAULT_LANG } from '@/i18n/translations';

const LangContext = createContext(null);

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem('kado_lang');
    return saved && translations[saved] ? saved : DEFAULT_LANG;
  });

  const setLang = useCallback((code) => {
    if (translations[code]) {
      localStorage.setItem('kado_lang', code);
      setLangState(code);
    }
  }, []);

  const t = translations[lang];

  return (
    <LangContext.Provider value={{ lang, setLang, t, LANGS }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used inside LangProvider');
  return ctx;
}

// Compact language switcher — drop into any header
export function LangSwitcher({ style }) {
  const { lang, setLang, LANGS } = useLang();
  const MONO = "'Courier New','SF Mono',monospace";
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, ...style }}>
      {LANGS.map(({ code, label }, i) => (
        <React.Fragment key={code}>
          {i > 0 && (
            <span style={{ fontFamily: MONO, fontSize: 8, color: '#2a2a2a' }}>·</span>
          )}
          <button
            onClick={() => setLang(code)}
            style={{
              fontFamily: MONO, fontSize: 9, letterSpacing: '0.1em',
              background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
              color: lang === code ? '#fff' : '#444',
              transition: 'color 130ms',
            }}
            onMouseEnter={e => { if (lang !== code) e.currentTarget.style.color = '#999'; }}
            onMouseLeave={e => { if (lang !== code) e.currentTarget.style.color = '#444'; }}
          >
            {label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
