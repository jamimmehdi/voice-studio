import { useEffect, useRef, type RefObject } from 'react';

/**
 * Attaches a NON-passive wheel listener (React's onWheel is passive, so it cannot stop the page from
 * scrolling). The handler may call `event.preventDefault()`; it always sees the latest closure.
 *
 * Pass `enabled = false` while the control should not take the wheel: no listener is attached at
 * all then, so the browser can scroll the page on its fast path. (A non-passive wheel listener on
 * every one of dozens of knobs makes page scrolling stutter.)
 */
export function useWheel<T extends HTMLElement>(
  ref: RefObject<T | null>,
  handler: (event: WheelEvent) => void,
  enabled = true,
): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;
    const listener = (e: WheelEvent): void => latest.current(e);
    el.addEventListener('wheel', listener, { passive: false });
    return () => el.removeEventListener('wheel', listener);
  }, [ref, enabled]);
}
