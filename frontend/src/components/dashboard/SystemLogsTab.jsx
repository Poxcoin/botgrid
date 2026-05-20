import React, { useEffect, useRef, useState } from 'react';
import { authFetch } from '@/lib/api';

const COLOR = {
  INFO: 'text-gray-400',
  OK:   'text-green-400',
  WARN: 'text-yellow-400',
  ERROR:'text-red-400',
};

function classifyLine(line) {
  if (line.includes('ERROR') || line.includes('❌')) return 'ERROR';
  if (line.includes('WARN')  || line.includes('⚠'))  return 'WARN';
  if (line.includes('OK')    || line.includes('✅')
   || line.includes('Signal') || line.includes('сигнал')) return 'OK';
  return 'INFO';
}

export default function SystemLogsTab() {
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
    <div className="p-4 md:p-8">
      <div className="border border-kado-black">
        <div className="h-12 px-5 flex items-center justify-between border-b border-kado-black">
          <h3 className="font-black tracking-tight text-lg">System Logs</h3>
          <div className="flex items-center gap-4 font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">
            <span>streaming</span>
            <span>refresh 5s</span>
          </div>
        </div>

        <div
          ref={ref}
          className="bg-[#0A0A0A] text-gray-300 font-mono text-[12px] leading-[1.7] p-5 h-[70vh] overflow-y-auto"
        >
          {lines.map((line, i) => {
            const t = classifyLine(line);
            return (
              <div key={i} className="whitespace-pre-wrap">
                <span className={COLOR[t] || 'text-gray-400'}>{line}</span>
              </div>
            );
          })}
          <div className="text-kado-blue">▌<span className="animate-blink">_</span></div>
        </div>
      </div>
    </div>
  );
}
