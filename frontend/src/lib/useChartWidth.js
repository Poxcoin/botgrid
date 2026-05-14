import { useRef, useState, useCallback, useEffect } from 'react';

export function useChartWidth() {
  const [width, setWidth] = useState(0);
  const roRef = useRef(null);

  const ref = useCallback(node => {
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    if (!node) return;
    setWidth(node.offsetWidth);
    roRef.current = new ResizeObserver(e => setWidth(e[0].contentRect.width));
    roRef.current.observe(node);
  }, []);

  useEffect(() => () => { if (roRef.current) roRef.current.disconnect(); }, []);

  return [ref, width];
}
