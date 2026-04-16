import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, User, Settings, LogOut } from 'lucide-react';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function TopBar() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const now = useClock();

  const user = (() => {
    try { return JSON.parse(localStorage.getItem('kado_user') || '{}'); }
    catch { return {}; }
  })();
  const email = user.email || 'trader@kado.io';
  const initial = email[0]?.toUpperCase() || 'K';
  const name = email.split('@')[0];

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const logout = () => {
    localStorage.removeItem('kado_token');
    localStorage.removeItem('kado_user');
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-kado-black">
      <div className="h-16 px-4 md:px-8 flex items-center justify-between">
        <Link to="/dashboard" className="flex items-center gap-3">
          <span className="font-black tracking-tighter text-xl">KADO</span>
          <span className="hidden md:inline font-mono text-[10px] tracking-[0.25em] text-kado-gray">/ TERMINAL</span>
        </Link>

        <div className="hidden md:flex items-center gap-4 font-mono text-[12px] tracking-[0.2em] uppercase">
          <span className="flex items-center gap-2 text-kado-gray">
            <span className="w-1.5 h-1.5 bg-kado-blue animate-blink" /> LIVE
          </span>
          <span className="text-kado-gray">·</span>
          <span className="text-kado-black">{now.toISOString().slice(0, 10)}</span>
          <span className="text-kado-gray">·</span>
          <span className="text-kado-black tabular-nums">{now.toLocaleTimeString('en-GB', { hour12: false })} UTC</span>
        </div>

        <div className="relative" ref={ref}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-3 h-10 pl-2 pr-3 border border-kado-black hover:bg-kado-black hover:text-white transition-colors"
          >
            <span className="w-7 h-7 bg-kado-blue text-white flex items-center justify-center font-mono font-bold text-[13px]">
              {initial}
            </span>
            <span className="hidden sm:inline font-mono text-[11px] tracking-[0.2em] uppercase">{name}</span>
            <ChevronDown size={14} />
          </button>
          {open && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-kado-black shadow-none z-50">
              <div className="px-4 py-3 border-b border-kado-black font-mono text-[10px] tracking-[0.25em] uppercase text-kado-gray">
                {email}
              </div>
              {[{ icon: User, label: 'Profile' }, { icon: Settings, label: 'Settings' }].map((it) => (
                <button key={it.label} onClick={() => setOpen(false)} className="w-full flex items-center gap-3 px-4 h-10 text-[13px] hover:bg-kado-black hover:text-white transition-colors">
                  <it.icon size={14} /> {it.label}
                </button>
              ))}
              <button onClick={logout} className="w-full flex items-center gap-3 px-4 h-10 text-[13px] border-t border-kado-black hover:bg-kado-blue hover:text-white transition-colors">
                <LogOut size={14} /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
