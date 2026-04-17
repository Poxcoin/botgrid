import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useTheme } from '@/lib/ThemeContext';

export default function NeuronReveal({ children, delay = 0, tag: Tag = 'div', className = '', style = {}, once = true }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  const animRef = useRef(false);
  const [textVisible, setTextVisible] = useState(false);

  useEffect(() => { themeRef.current = theme; }, [theme]);

  const run = useCallback(() => {
    if (animRef.current) return;
    animRef.current = true;

    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) { setTextVisible(true); return; }

    const { width, height } = wrap.getBoundingClientRect();
    if (!width || !height) { setTextVisible(true); animRef.current = false; return; }

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const dark = themeRef.current === 'dark';
    const rgb = dark ? '255,255,255' : '10,10,10';

    const count = Math.max(8, Math.min(55, Math.floor((width * height) / 900)));
    const cx = width / 2, cy = height / 2;

    const dots = Array.from({ length: count }, () => {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const angle = Math.atan2(y - cy, x - cx);
      const speed = 1.5 + Math.random() * 2.5;
      return {
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.3,
        r: 1 + Math.random() * 1.5,
        op: 0.5 + Math.random() * 0.4,
      };
    });

    let startTs = null, raf;

    function tick(ts) {
      if (!startTs) startTs = ts;
      const el = ts - startTs;

      ctx.clearRect(0, 0, width, height);

      if (el >= 700) { animRef.current = false; return; }

      raf = requestAnimationFrame(tick);

      const scatter = Math.max(0, (el - 180) / 520);
      if (el > 280 && !textVisible) setTextVisible(true);

      dots.forEach(d => {
        if (el > 180) { d.x += d.vx; d.y += d.vy; }
        const op = d.op * (1 - scatter);
        if (op <= 0.01) return;
        ctx.fillStyle = `rgba(${rgb},${op})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    raf = requestAnimationFrame(tick);
  }, []);

  // re-trigger support (for tab changes)
  const triggerReveal = useCallback(() => {
    animRef.current = false;
    setTextVisible(false);
    setTimeout(run, 50);
  }, [run]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(run, delay);
          if (once) obs.disconnect();
        }
      },
      { threshold: 0.08 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [delay, once, run]);

  return (
    <Tag ref={wrapRef} className={className} style={{ position: 'relative', ...style }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}
      />
      <span style={{ position: 'relative', zIndex: 1, opacity: textVisible ? 1 : 0, transition: 'opacity 280ms ease', display: 'contents' }}>
        {children}
      </span>
    </Tag>
  );
}
