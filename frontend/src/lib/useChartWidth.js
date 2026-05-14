import { useRef, useState, useEffect } from 'react';

export function useChartWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    setWidth(ref.current.offsetWidth);
    const ro = new ResizeObserver(e => setWidth(e[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
