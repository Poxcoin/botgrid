import React from 'react';
import { Link } from 'react-router-dom';

export default function LandingFooter() {
  return (
    <footer className="bg-white border-t border-kado-black">
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between flex-wrap gap-3">
        <div className="font-mono text-[11px] tracking-[0.25em] uppercase text-kado-black/70">
          Kado © 2026
        </div>
        <div className="flex items-center gap-6 font-mono text-[11px] tracking-[0.25em] uppercase">
          <a href="#" className="hover:text-kado-blue transition-colors">Docs</a>
          <Link to="/auth?mode=login" className="hover:text-kado-blue transition-colors">Login</Link>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-kado-blue animate-blink" /> Status
          </span>
        </div>
      </div>
    </footer>
  );
}
