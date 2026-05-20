import React, { useEffect, useRef, useState, useMemo } from 'react';
import { authFetch } from '@/lib/api';

const LEVELS = ['ALL', 'OK', 'WARN', 'ERROR'];

const LEVEL_CLS = {
  INFO:  'text-gray-400',
  OK:    'text-green-400',
  WARN:  'text-yellow-400',
  ERROR: 'text-red-400',
};

const LEVEL_ACTIVE = {
  OK:    'border-green-500 text-green-400',
  WARN:  'border-yellow-400 text-yellow-400',
  ERROR: 'border-red-500 text-red-400',
};

function classifyLine(line) {
  if (line.includes('ERROR') || line.includes('❌')) return 'ERROR';
  if (line.includes('WARN')  || line.includes('⚠'))  return 'WARN';
  if (line.includes('OK')    || line.includes('✅')
   || line.includes('Signal') || line.includes('сигнал')) return 'OK';
  return 'INFO';
}

export default function SystemLogsTab() {
  const [lines,      setLines]      = useState(['Loading logs...']);
  const [search,     setSearch]     = useState('');
  const [level,      setLevel]      = useState('ALL');
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
      if (level !== 'ALL' && classifyLine(line) !== level) return false;
      if (lc && !line.toLowerCase().includes(lc)) return false;
      return true;
    });
  }, [lines, search, level]);

  const btnBase = 'font-mono text-[10px] tracking-[0.12em] px-2 py-1 border cursor-pointer transition-colors duration-100';

  return (
    <div className="p-4 md:p-8">
      <div className="border border-kado-black">
        {/* Header */}
        <div className="h-12 px-5 flex items-center justify-between border-b border-kado-black">
          <h3 className="font-black tracking-tight text-lg">System Logs</h3>
          <div className="flex items-center gap-4 font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">
            <span className="text-green-400">streaming</span>
            <span>refresh 5s</span>
            <button
              onClick={load}
              className="border border-gray-700 text-gray-400 hover:border-gray-400 hover:text-gray-200 px-3 py-1 font-mono text-[10px] tracking-wider transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="px-5 py-2 flex items-center gap-2 border-b border-kado-black bg-[#0d0d0d] flex-wrap">
          {LEVELS.map(l => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              className={`${btnBase} ${level === l
                ? (LEVEL_ACTIVE[l] || 'border-gray-400 text-gray-200')
                : 'border-gray-800 text-gray-600 hover:border-gray-600'
              }`}
            >
              {l}
            </button>
          ))}
          <div className="w-px h-4 bg-gray-800 mx-1" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="bg-transparent border border-gray-800 text-gray-300 font-mono text-[10px] px-2 py-1 outline-none w-36 placeholder-gray-700 focus:border-gray-600"
          />
          <span className="font-mono text-[10px] text-gray-600 ml-1">
            {filtered.length !== lines.length ? `${filtered.length} / ${lines.length}` : lines.length}
          </span>
          <button
            onClick={() => setAutoScroll(a => !a)}
            className={`${btnBase} ml-auto ${autoScroll ? 'border-green-600 text-green-400' : 'border-gray-800 text-gray-600'}`}
          >
            Auto-scroll
          </button>
        </div>

        {/* Log content */}
        <div
          ref={ref}
          className="bg-[#0A0A0A] text-gray-300 font-mono text-[12px] leading-[1.7] p-5 h-[65vh] overflow-y-auto"
        >
          {filtered.map((line, i) => {
            const t = classifyLine(line);
            const isSmart = line.includes('[SMART]');
            return (
              <div
                key={i}
                className={`whitespace-pre-wrap ${isSmart ? 'border-l-2 border-green-500 pl-2 -ml-2 bg-green-950/20' : ''}`}
              >
                <span className={LEVEL_CLS[t] || 'text-gray-400'}>{line}</span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-gray-700 text-xs">— no matching lines —</div>
          )}
          <div className="text-green-500">▌</div>
        </div>
      </div>
    </div>
  );
}
