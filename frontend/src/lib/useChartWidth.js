import { useRef, useState, useCallback, useEffect } from 'react';

export function useChartWidth() {
  const [width, setWidth] = useState(0);
  const roRef    = useRef(null);
  const rafRef   = useRef(0);
  const pendingW = useRef(0);

  const ref = useCallback(node => {
    if (roRef.current)  { roRef.current.disconnect(); roRef.current = null; }
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = 0; }
    if (!node) return;

    setWidth(node.offsetWidth);

    roRef.current = new ResizeObserver(e => {
      pendingW.current = e[0].contentRect.width;
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        setWidth(w => (Math.abs(w - pendingW.current) < 1 ? w : pendingW.current));
      });
    });
    roRef.current.observe(node);
  }, []);

  useEffect(() => () => {
    if (roRef.current)  roRef.current.disconnect();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  return [ref, width];
}
