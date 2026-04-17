import React from 'react';
import { useTheme } from '@/lib/ThemeContext';

export default function ThemeToggle({ className = '' }) {
  const { theme, toggle } = useTheme();

  return (
    <button
      onClick={toggle}
      className={className}
      style={{
        background: 'none',
        border: '1px solid var(--hero-border)',
        color: 'var(--site-fg)',
        fontFamily: 'var(--font-mono)',
        fontSize: '10px',
        letterSpacing: '0.2em',
        padding: '4px 10px',
        cursor: 'pointer',
        textTransform: 'uppercase',
        transition: 'border-color 200ms, color 200ms',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = '#0047FF'; e.currentTarget.style.color = '#0047FF'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--hero-border)'; e.currentTarget.style.color = 'var(--site-fg)'; }}
    >
      {theme === 'dark' ? '◑ LIGHT' : '◐ DARK'}
    </button>
  );
}
