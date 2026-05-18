import { useEffect, useState } from 'react';

export function useIsMobile(breakpoint = 768) {
  const [v, setV] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const h = () => setV(window.innerWidth < breakpoint);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, [breakpoint]);
  return v;
}
