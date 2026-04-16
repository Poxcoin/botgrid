import React, { useState, useEffect } from 'react';
import KadoButton from '@/components/shared/KadoButton';
import { ShieldAlert, Check } from 'lucide-react';

const STORAGE_KEY = 'kado_exchange_key';

function mask(key) {
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return `${key.slice(0, 4)}${'•'.repeat(Math.max(4, key.length - 8))}${key.slice(-4)}`;
}

export default function ExchangeKeysTab() {
  const [form, setForm] = useState({ api_key: '', api_secret: '', environment: 'testnet' });
  const [saved, setSaved] = useState(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSaved(JSON.parse(raw));
    } catch {}
  }, []);

  const save = (e) => {
    e.preventDefault();
    if (!form.api_key || !form.api_secret) return;
    const record = { ...form, saved_at: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    setSaved(record);
    setForm({ api_key: '', api_secret: '', environment: form.environment });
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  };

  const remove = () => { localStorage.removeItem(STORAGE_KEY); setSaved(null); };

  return (
    <div className="p-4 md:p-8 max-w-3xl space-y-8">
      <div className="border border-kado-black bg-kado-black text-white p-5 flex gap-4">
        <ShieldAlert size={22} className="flex-shrink-0 mt-0.5 text-kado-blue" />
        <div>
          <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-white/60 mb-1">NOTICE</div>
          <div className="text-[14px] leading-relaxed">
            Keys are stored locally in your browser. Never share your secret key with anyone.
          </div>
        </div>
      </div>

      {saved && (
        <div className="border border-kado-black">
          <div className="px-5 h-12 flex items-center justify-between border-b border-kado-black">
            <h3 className="font-black tracking-tight text-lg">Active Key</h3>
            <span className={`font-mono text-[10px] tracking-[0.25em] uppercase ${saved.environment === 'mainnet' ? 'text-kado-blue' : 'text-kado-gray'}`}>
              {saved.environment}
            </span>
          </div>
          <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray mb-2">API Key</div>
              <div className="font-mono text-[15px] font-bold">{mask(saved.api_key)}</div>
            </div>
            <div>
              <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray mb-2">API Secret</div>
              <div className="font-mono text-[15px] font-bold">{mask(saved.api_secret)}</div>
            </div>
          </div>
          <div className="border-t border-kado-black p-5 flex justify-end">
            <button onClick={remove} className="font-mono text-[11px] tracking-[0.25em] uppercase text-red-600 hover:underline">
              Remove Key
            </button>
          </div>
        </div>
      )}

      <form onSubmit={save} className="border border-kado-black">
        <div className="px-5 h-12 flex items-center justify-between border-b border-kado-black">
          <h3 className="font-black tracking-tight text-lg">{saved ? 'Replace' : 'Add'} Bybit Keys</h3>
          <span className="font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">V5 · PERP</span>
        </div>
        <div className="p-5 space-y-5">
          <label className="block">
            <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray mb-2">API Key</div>
            <input value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              placeholder="bybit-api-key-xxxx"
              className="w-full h-11 px-4 bg-white border border-kado-black font-mono text-[13px] outline-none focus:border-kado-blue" />
          </label>
          <label className="block">
            <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray mb-2">API Secret</div>
            <input type="password" value={form.api_secret} onChange={(e) => setForm({ ...form, api_secret: e.target.value })}
              placeholder="••••••••••••••••"
              className="w-full h-11 px-4 bg-white border border-kado-black font-mono text-[13px] outline-none focus:border-kado-blue" />
          </label>
          <div>
            <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-kado-gray mb-2">Environment</div>
            <div className="inline-flex border border-kado-black">
              {['testnet', 'mainnet'].map((env) => (
                <button type="button" key={env} onClick={() => setForm({ ...form, environment: env })}
                  className={`h-10 px-6 font-mono text-[11px] tracking-[0.25em] uppercase transition-colors ${form.environment === env ? 'bg-kado-black text-white' : 'bg-white text-kado-black hover:bg-kado-black/5'}`}>
                  {env}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-kado-black p-5 flex items-center justify-between gap-4">
          {justSaved
            ? <span className="flex items-center gap-2 font-mono text-[11px] tracking-[0.25em] uppercase text-kado-blue"><Check size={14} /> Saved</span>
            : <span />}
          <KadoButton type="submit" variant="blue">Save Key</KadoButton>
        </div>
      </form>
    </div>
  );
}
