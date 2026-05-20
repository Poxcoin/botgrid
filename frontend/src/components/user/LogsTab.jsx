import React, { useEffect, useMemo, useRef, useState } from 'react';
import { authFetch } from '@/lib/api';
import { useLang } from '@/lib/LangContext';

const MONO = "'Courier New','SF Mono',monospace";

const LINE_COLOR = {
  INFO:  '#555',
  OK:    '#4ade80',
  WARN:  '#fbbf24',
  ERROR: '#f87171',
};

const LEVELS = ['ALL', 'OK', 'WARN', 'ERROR'];

function classify(line) {
  if (line.includes('ERROR') || line.includes('❌')) return 'ERROR';
  if (line.includes('WARN')  || line.includes('⚠'))  return 'WARN';
  if (line.includes('OK')    || line.includes('✅') || line.includes('Signal') || line.includes('сигнал')) return 'OK';
  return 'INFO';
}

export default function LogsTab() {
  const { t } = useLang();
  const [lines, setLines]       = useState([t.dashboard.logs.loadingLogs]);
  const [search, setSearch]     = useState('');
  const [level, setLevel]       = useState('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
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
    if (autoScroll && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines, autoScroll]);

  const filtered = useMemo(() => {
    const lc = search.toLowerCase();
    return lines.filter(line => {
      if (level !== 'ALL' && classify(line) !== level) return false;
      if (lc && !line.toLowerCase().includes(lc)) return false;
      return true;
    });
  }, [lines, search, level]);

  const btnBase = {
    background: 'transparent',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-muted)',
    padding: '4px 10px',
    fontSize: 10,
    fontFamily: MONO,
    letterSpacing: '0.12em',
    cursor: 'pointer',
    borderRadius: 3,
    transition: 'all 120ms',
  };

  const levelColor = { OK: '#4ade80', WARN: '#fbbf24', ERROR: '#f87171' };

  return (
    <div style={{ border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden', background: 'var(--bg-surface)' }}>
      {/* Header */}
      <div style={{ height: 52, padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)' }}>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 500 }}>{t.dashboard.logs.systemLogs}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent-green)', fontWeight: 600 }}>
            {t.dashboard.logs.streaming}
          </span>
          <span>{t.dashboard.logs.refreshSec}</span>
          <button
            onClick={load}
            style={{
              background: 'transparent', border: '1px solid var(--border-default)', color: 'var(--text-secondary)',
              padding: '6px 12px', fontSize: 10, fontFamily: MONO, letterSpacing: '0.12em', cursor: 'pointer',
              borderRadius: 4, transition: 'all 150ms',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent-green)'; e.currentTarget.style.color = 'var(--accent-green)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            {t.dashboard.refresh}
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ padding: '8px 20px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-elevated)', flexWrap: 'wrap' }}>
        {LEVELS.map(l => (
          <button key={l} onClick={() => setLevel(l)} style={{
            ...btnBase,
            borderColor: level === l ? (levelColor[l] || 'var(--border-default)') : 'var(--border-subtle)',
            color: level === l ? (levelColor[l] || 'var(--text-primary)') : 'var(--text-muted)',
          }}>
            {l}
          </button>
        ))}
        <div style={{ width: 1, height: 16, background: 'var(--border-subtle)', margin: '0 2px' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.dashboard.logs.searchLogs}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 4,
            color: 'var(--text-primary)', fontFamily: MONO, fontSize: 10, padding: '4px 10px',
            outline: 'none', width: 160, letterSpacing: '0.04em',
          }}
        />
        <span style={{ fontFamily: MONO, fontSize: 10, color: 'var(--text-muted)', marginLeft: 4 }}>
          {filtered.length !== lines.length ? `${filtered.length} / ${lines.length}` : `${lines.length}`}
        </span>
        <button
          onClick={() => setAutoScroll(a => !a)}
          style={{ ...btnBase, marginLeft: 'auto', borderColor: autoScroll ? 'var(--accent-green)' : 'var(--border-subtle)', color: autoScroll ? 'var(--accent-green)' : 'var(--text-muted)' }}
        >
          {t.dashboard.logs.autoScroll}
        </button>
      </div>

      {/* Log content */}
      <div
        ref={ref}
        style={{ background: '#050709', fontFamily: MONO, fontSize: 12, lineHeight: 1.75, padding: '18px 20px', height: '65vh', overflowY: 'auto' }}
      >
        {filtered.map((line, i) => {
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
        {filtered.length === 0 && (
          <div style={{ color: '#333', fontSize: 12 }}>— no matching lines —</div>
        )}
        <div style={{ color: 'var(--accent-green)' }}>▌</div>
      </div>
    </div>
  );
}
