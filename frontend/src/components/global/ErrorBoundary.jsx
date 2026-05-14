import React from 'react';

const FONT = "-apple-system,BlinkMacSystemFont,'SF Pro Display',sans-serif";
const MONO = "'Courier New','SF Mono',monospace";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, errorMsg: String(error?.message || error) };
  }

  componentDidCatch(error, info) {
    if (typeof console !== 'undefined') {
      console.error('[ErrorBoundary]', error, info);
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    // Translations may not be available (LangProvider could itself be the cause).
    // Read directly from localStorage with safe fallback to English.
    const lang = (() => {
      try { return localStorage.getItem('kado_lang') || 'en'; } catch { return 'en'; }
    })();
    const STR = STRINGS[lang] || STRINGS.en;

    return (
      <div style={{
        minHeight: '100vh',
        background: '#050505',
        color: '#f0f2f5',
        fontFamily: FONT,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 32, textAlign: 'center',
      }}>
        <div style={{ maxWidth: 480 }}>
          <div style={{
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.3em',
            textTransform: 'uppercase', color: '#ff4d6d', marginBottom: 18,
          }}>
            ! {STR.title}
          </div>
          <div style={{ fontSize: 16, lineHeight: 1.55, color: '#cbd5e1', marginBottom: 28 }}>
            {STR.body}
          </div>
          {this.state.errorMsg && (
            <div style={{ fontFamily: MONO, fontSize: 11, color: '#ff4d6d', marginBottom: 20, wordBreak: 'break-all', textAlign: 'left', background: 'rgba(255,77,109,0.07)', padding: '10px 14px' }}>
              {this.state.errorMsg}
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              background: '#fff', color: '#050505', border: 'none', borderRadius: 4,
              padding: '12px 24px', fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em',
              textTransform: 'uppercase', fontWeight: 700, cursor: 'pointer',
            }}
          >
            {STR.reload}
          </button>
        </div>
      </div>
    );
  }
}

const STRINGS = {
  en: { title: 'Something broke', body: 'A page error stopped this view from rendering. Try reloading — your data is safe on the exchange.', reload: 'Reload page' },
  es: { title: 'Algo se ha roto', body: 'Un error impidió mostrar esta vista. Recarga — tus datos están seguros en el exchange.', reload: 'Recargar página' },
  uk: { title: 'Щось зламалось', body: 'Помилка перешкодила відображенню. Перезавантажте — ваші дані в безпеці на біржі.', reload: 'Перезавантажити' },
  ru: { title: 'Что-то сломалось', body: 'Ошибка помешала отобразить страницу. Перезагрузите — ваши данные в безопасности на бирже.', reload: 'Перезагрузить' },
  de: { title: 'Etwas ist abgestürzt', body: 'Ein Fehler hat das Rendern verhindert. Lade neu — deine Daten liegen sicher auf der Börse.', reload: 'Seite neu laden' },
  zh: { title: '出了点问题', body: '错误阻止了渲染。请刷新 — 您的数据在交易所是安全的。', reload: '刷新页面' },
};
