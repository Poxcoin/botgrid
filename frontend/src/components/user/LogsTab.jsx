import React, { useEffect, useRef, useState } from 'react';
import { authFetch } from '@/lib/api';
import { useLang } from '@/lib/LangContext';

const B = 'rgba(255,255,255,0.06)';
const MUTED = '#555';
const MONO = "'Courier New','SF Mono',monospace";

const LINE_COLOR = {
  INFO:  '#555',
  OK:    '#4ade80',
  WARN:  '#fbbf24',
  ERROR: '#f87171',
};

function classify(line) {
  if (line.includes('ERROR') || line.includes('❌')) return 'ERROR';
  if (line.includes('WARN')  || line.includes('⚠'))  return 'WARN';
  if (line.includes('OK')    || line.includes('✅') || line.includes('Signal') || line.includes('сигнал')) return 'OK';
  return 'INFO';
}

export default function LogsTab() {
  const { t } = useLang();
  const [lines, setLines] = useState([t.dashboard.logs.loadingLogs]);
  const ref = useRef(null);

  const load = async () => {
    try {
      const res = await authFetch('/api/logs?lines=200');
      if (!res.ok) return;
      const data = await res.json();
      if (data.lines) setLines(data.lines);
    } catch {}
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden', background: 'var(--bg-surface)' }}>
      <div style={{ height: 52, padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 500 }}>{t.dashboard.logs.systemLogs}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-green)', fontWeight: 600 }}>
            <span className="pulse-dot" />
            {t.dashboard.logs.streaming}
          </span>
          <span>{t.dashboard.logs.refreshSec}</span>
          <button
            onClick={load}
            style={{
              background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)',
              padding: '6px 12px', fontSize: 10, fontFamily: MONO, letterSpacing: '0.12em', cursor: 'pointer',
              borderRadius: 6, transition: 'all 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-green)'; e.currentTarget.style.color = 'var(--accent-green)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            {t.dashboard.refresh}
          </button>
        </div>
      </div>
      <div
        ref={ref}
        style={{ background: '#050709', fontFamily: MONO, fontSize: 12, lineHeight: 1.75, padding: '18px 20px', height: '70vh', overflowY: 'auto' }}
      >
        {lines.map((line, i) => {
          const isSmart = line.includes('[SMART]');
          const cls = classify(line);
          return (
            <div
              key={i}
              style={{
                whiteSpace: 'pre-wrap',
                color: LINE_COLOR[cls] || 'var(--text-muted)',
                background: isSmart ? 'var(--accent-green-dim)' : 'transparent',
                borderLeft: isSmart ? '3px solid var(--accent-green)' : '3px solid transparent',
                paddingLeft: isSmart ? 10 : 0,
                marginLeft: isSmart ? -10 : 0,
              }}
            >
              {line}
            </div>
          );
        })}
        <div style={{ color: 'var(--accent-green)' }}>▌</div>
      </div>
    </div>
  );
}
