import { useEffect } from 'react';
import { cursorStateRef } from './GlobalNeural';

export default function CursorTracker() {
  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    let lastX = -9999, lastY = -9999, timer = null;

    const onMove = (e) => {
      cursorStateRef.vx = e.clientX - lastX;
      cursorStateRef.vy = e.clientY - lastY;
      lastX = cursorStateRef.x = e.clientX;
      lastY = cursorStateRef.y = e.clientY;
      cursorStateRef.moving = true;
      clearTimeout(timer);
      timer = setTimeout(() => { cursorStateRef.moving = false; }, 80);
    };
    const onLeave = () => {
      cursorStateRef.moving = false;
      cursorStateRef.x = cursorStateRef.y = -9999;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      clearTimeout(timer);
    };
  }, []);

  return null;
}
