import React from 'react';
import { Link } from 'react-router-dom';

export default function LandingHeader() {
  return (
    <header className="w-full border-b border-kado-black bg-white sticky top-0 z-40">
      <div className="max-w-[1400px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <span className="font-black tracking-tighter text-xl">KADO</span>
          <span className="hidden md:inline text-[10px] font-mono text-kado-gray tracking-[0.2em]">
            / AI SIGNALS
          </span>
        </Link>
        <nav className="flex items-center gap-6 text-[12px] font-semibold tracking-[0.15em] uppercase">
          <a href="#how" className="hidden sm:inline hover:text-kado-blue transition-colors">How it works</a>
          <a href="#stats" className="hidden sm:inline hover:text-kado-blue transition-colors">Stats</a>
          <Link to="/auth?mode=login" className="hover:text-kado-blue transition-colors">Login</Link>
          <Link
            to="/auth?mode=register"
            className="hidden sm:inline-flex items-center h-9 px-4 bg-kado-black text-white hover:bg-kado-blue transition-colors"
          >
            Get Access
          </Link>
        </nav>
      </div>
    </header>
  );
}
