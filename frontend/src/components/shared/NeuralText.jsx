import React, { useRef, useEffect } from 'react';
import useNeuralAssemble from '@/lib/useNeuralAssemble';

function sampleContour(text, rect, fontWeight) {
  const W = Math.ceil(rect.width);
  const H = Math.ceil(rect.height);
  if (W < 2 || H < 2) return [];

  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  const ctx = off.getContext('2d');

  // Iterative scaling: find font size that fills 80–92% of element width.
  // Needed because font size is a CSS clamp() value — we only know the
  // rendered bounding rect, not the resolved px value.
  let fs = Math.round(H * 0.85);
  const face = `Arial Black, Impact, sans-serif`;
  for (let i = 0; i < 10; i++) {
    ctx.font = `${fontWeight} ${fs}px ${face}`;
    const tw = ctx.measureText(text).width;
    if (tw > W * 0.92) fs = Math.round(fs * 0.88);
    else if (tw < W * 0.78) fs = Math.round(fs * 1.08);
    else break;
  }

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, W / 2, H / 2);

  const data = ctx.getImageData(0, 0, W, H).data;
  const pts = [];
  // Step size balances density vs node count (max ~300 pts)
  const step = Math.max(5, Math.ceil(Math.sqrt((W * H) / 300)));
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      if (data[(y * W + x) * 4 + 3] > 120) {
        // Convert to absolute viewport coords
        pts.push({ x: rect.left + x, y: rect.top + y });
      }
    }
  }
  return pts;
}

export default function NeuralText({
  text,
  fontWeight = 900,
  className = '',
  style = {},
  tag: Tag = 'span',
}) {
  const [ref, triggered] = useNeuralAssemble(0.1);
  const firedRef = useRef(false);

  useEffect(() => {
    if (!triggered || firedRef.current) return;
    if (!window.__neuronField) return;
    firedRef.current = true;
    // Wait one frame so layout is painted and getBoundingClientRect is accurate
    requestAnimationFrame(() => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const pts = sampleContour(text, rect, fontWeight);
      if (pts.length > 0) window.__neuronField.assembleAt(pts);
    });
  }, [triggered, text, fontWeight]);

  useEffect(() => {
    return () => {
      if (firedRef.current) window.__neuronField?.release();
    };
  }, []);

  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        // Invisible — nodes build the visible letter
        color: 'transparent',
        display: 'inline-block',
        userSelect: 'none',
        // Keep layout identical to what CharReveal would produce
        ...style,
      }}
    >
      {text}
    </Tag>
  );
}
