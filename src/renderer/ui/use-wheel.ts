import { useEffect, useRef, type RefObject } from 'react';

/**
 * Attaches a NON-passive wheel listener (React's onWheel is passive, so it cannot stop the page from
 * scrolling). The handler may call `event.preventDefault()`; it always sees the latest closure.
 */
export function useWheel<T extends HTMLElement>(ref: RefObject<T | null>, handler: (event: WheelEvent) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const listener = (e: WheelEvent): void => latest.current(e);
    el.addEventListener('wheel', listener, { passive: false });
    return () => el.removeEventListener('wheel', listener);
  }, [ref]);
}
