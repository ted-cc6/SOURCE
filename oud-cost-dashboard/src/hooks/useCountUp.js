// src/hooks/useCountUp.js
import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from its previous value to `target` over `duration` ms.
 * Respects prefers-reduced-motion by snapping instantly.
 */
export function useCountUp(target, duration = 1200) {
  const [value, setValue] = useState(target ?? 0);
  const fromRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (target == null) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setValue(target);
      return;
    }

    const from = fromRef.current;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(from + (target - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = target;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, duration]);

  return value;
}
