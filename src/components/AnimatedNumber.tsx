import React, { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
}

/**
 * Tweens numeric readouts smoothly via requestAnimationFrame with ease-out cubic curves,
 * jumping immediately when prefers-reduced-motion is enabled.
 */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  format,
  durationMs = 420,
  className,
}) => {
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);
  const hasMountedRef = useRef(false);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const startVal = !hasMountedRef.current ? 0 : prevRef.current;
    hasMountedRef.current = true;
    prevRef.current = value;

    if (prefersReduced || startVal === value) {
      setDisplay(value);
      return;
    }

    let rafId = 0;
    const startTime = performance.now();

    const step = (now: number) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(startVal + (value - startVal) * eased);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        setDisplay(value);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [value, durationMs]);

  return (
    <span className={className}>
      {format ? format(display) : Math.round(display).toLocaleString('en-US')}
    </span>
  );
};
