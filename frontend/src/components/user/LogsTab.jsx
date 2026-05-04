import React, { useEffect, useRef, useState } from 'react';
import { authFetch } from '@/lib/api';

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
  const [lines, setLines] = useState(['Loading logs...']);
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
    <div style={{ border: `1px solid ${B}` }}>
      <div style={{ height: 48, padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${B}` }}>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED }}>System Logs</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontFamily: MONO, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: MUTED }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block' }} />
            streaming
          </span>
          <span>5s refresh</span>
          <button onClick={load} style={{ background: 'none', border: `1px solid ${B}`, color: MUTED, padding: '3px 10px', fontSize: 10, fontFamily: MONO, letterSpacing: '0.1em', cursor: 'pointer' }}>
            Refresh
          </button>
        </div>
      </div>
      <div
        ref={ref}
        style={{ background: '#050505', fontFamily: MONO, fontSize: 12, lineHeight: 1.7, padding: '16px 20px', height: '70vh', overflowY: 'auto' }}
      >
        {lines.map((line, i) => (
          <div key={i} style={{ whiteSpace: 'pre-wrap', color: LINE_COLOR[classify(line)] || '#555' }}>
            {line}
          </div>
        ))}
        <div style={{ color: '#4ade80' }}>▌</div>
      </div>
    </div>
  );
}
