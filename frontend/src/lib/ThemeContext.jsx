import React, { createContext, useContext, useState, useEffect } from 'react';

const Ctx = createContext({ theme: 'dark', setTheme: () => {}, toggle: () => {} });

const STORAGE_KEY = 'kado_theme';

function resolveInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
  } catch {}
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(resolveInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    try { localStorage.setItem(STORAGE_KEY, theme); } catch {}
  }, [theme]);

  // React to system theme changes, but only if the user hasn't explicitly chosen one.
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    function handle(e) {
      try {
        if (localStorage.getItem(STORAGE_KEY)) return; // user has an explicit choice
      } catch { return; }
      setThemeState(e.matches ? 'light' : 'dark');
    }
    mq.addEventListener?.('change', handle);
    return () => mq.removeEventListener?.('change', handle);
  }, []);

  const setTheme = (t) => setThemeState(t === 'light' ? 'light' : 'dark');
  const toggle = () => setThemeState(t => (t === 'dark' ? 'light' : 'dark'));

  return <Ctx.Provider value={{ theme, setTheme, toggle }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
