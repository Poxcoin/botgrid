import React, { useEffect, useRef, useState } from 'react';

/**
 * CharReveal — animates text character by character on scroll.
 * Each char materializes with a blur+scatter particle effect (neural synapse style).
 *
 * Props:
 *   text        — string to animate
 *   tag         — wrapper element ('h1','h2','p','span','div')
 *   delay       — ms before first char starts (after section enters viewport)
 *   charDelay   — ms between each character (default 38ms)
 *   className   — className on wrapper
 *   style       — style on wrapper
 *   once        — re-trigger on every scroll (default true = once)
 *   splitWords  — if true, wraps words so line breaks work naturally
 */
export default function CharReveal({
  text = '',
  tag: Tag = 'span',
  delay = 0,
  charDelay = 38,
  className = '',
  style = {},
  once = true,
  splitWords = false,
  children,
}) {
  const wrapRef = useRef(null);
  const [revealed, setRevealed] = useState(false);
  const [charCount, setCharCount] = useState(0);
  const timerRef = useRef(null);

  const content = text || (typeof children === 'string' ? children : '');
  const chars = content.split('');

  const runAnimation = () => {
    setRevealed(false);
    setCharCount(0);
    clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      setRevealed(true);
      let i = 0;
      const tick = () => {
        i++;
        setCharCount(i);
        if (i < chars.length) {
          timerRef.current = setTimeout(tick, charDelay);
        }
      };
      tick();
    }, delay);
  };

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          runAnimation();
          if (once) obs.disconnect();
        }
      },
      { threshold: 0.01, rootMargin: '0px 0px -10px 0px' }
    );
    obs.observe(el);
    return () => { obs.disconnect(); clearTimeout(timerRef.current); };
  }, [text, delay, charDelay, once]);

  if (!content) {
    // If no text prop, render children normally but with NeuronReveal-style fade
    return (
      <Tag ref={wrapRef} className={className} style={style}>
        {children}
      </Tag>
    );
  }

  return (
    <Tag ref={wrapRef} className={className} style={{ display: 'inline', ...style }}>
      {chars.map((ch, i) => {
        const isVisible = i < charCount;
        const isNext = i === charCount; // currently materializing
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              whiteSpace: ch === ' ' ? 'pre' : 'normal',
              opacity: isVisible ? 1 : isNext ? 0.6 : 0,
              transform: isVisible
                ? 'translateY(0) scale(1)'
                : isNext
                ? 'translateY(6px) scale(1.08)'
                : 'translateY(12px) scale(0.85)',
              filter: isVisible ? 'blur(0px)' : isNext ? 'blur(1px)' : 'blur(3px)',
              transition: isVisible
                ? 'opacity 120ms ease, transform 160ms ease, filter 120ms ease'
                : 'none',
              textShadow: isNext
                ? '0 0 12px currentColor, 0 0 24px currentColor'
                : 'none',
            }}
          >
            {ch === ' ' ? '\u00A0' : ch}
          </span>
        );
      })}
    </Tag>
  );
}
