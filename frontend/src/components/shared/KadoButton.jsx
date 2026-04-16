import React from 'react';

export default function KadoButton({
  children,
  variant = 'primary',
  className = '',
  ...props
}) {
  const base =
    'inline-flex items-center justify-center gap-2 px-7 h-12 text-[13px] font-semibold tracking-[0.12em] uppercase transition-colors border outline-none disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary:     'bg-kado-black text-white border-kado-black hover:bg-kado-blue hover:border-kado-blue',
    blue:        'bg-kado-blue text-white border-kado-blue hover:bg-kado-black hover:border-kado-black',
    outline:     'bg-transparent text-kado-black border-kado-black hover:bg-kado-black hover:text-white',
    invertSolid: 'bg-white text-kado-black border-white hover:bg-kado-blue hover:text-white hover:border-kado-blue',
    invertGhost: 'bg-transparent text-white border-white hover:bg-white hover:text-kado-black',
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
