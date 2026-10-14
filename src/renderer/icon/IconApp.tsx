import { useRef } from 'react';
import type { QuickApi } from '@shared/ipc';
import { useQuickState } from '../quick/use-quick-state';
import styles from './IconApp.module.css';
import iconUrl from './icon.png';

/** Pixels the pointer may travel before a press counts as a drag instead of a click. */
export const DRAG_THRESHOLD = 5;

interface IconAppProps {
  api?: Pick<QuickApi, 'send' | 'onState' | 'iconDrag' | 'iconDragEnd'>;
}

/** The floating icon: click opens the compact panel, drag moves it. Glows green while the engine is live. */
export function IconApp({ api = window.quick }: IconAppProps): React.ReactElement {
  const state = useQuickState(api);
  const press = useRef<{ x: number; y: number; moved: number } | null>(null);
  const live = !!state?.running;

  return (
    <div className={styles.root}>
      <div
        role="button"
        tabIndex={0}
        aria-label="Open the compact panel"
        title="Voice Studio – click for the compact panel"
        className={`${styles.orb} ${live ? styles.live : ''}`}
        style={{ backgroundImage: `url(${iconUrl})` }}
        onPointerDown={(e) => {
          press.current = { x: e.screenX, y: e.screenY, moved: 0 };
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            /* pointer released */
          }
        }}
        onPointerMove={(e) => {
          const p = press.current;
          if (!p) return;
          const dx = e.screenX - p.x;
          const dy = e.screenY - p.y;
          p.x = e.screenX;
          p.y = e.screenY;
          p.moved += Math.abs(dx) + Math.abs(dy);
          if (dx || dy) api.iconDrag(dx, dy);
        }}
        onPointerUp={() => {
          const p = press.current;
          press.current = null;
          if (!p) return;
          if (p.moved < DRAG_THRESHOLD) api.send({ type: 'openCompact' });
          else api.iconDragEnd();
        }}
        onPointerCancel={() => {
          press.current = null;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') api.send({ type: 'openCompact' });
        }}
      />
      <span className={`${styles.dot} ${live ? styles.dotLive : ''}`} />
    </div>
  );
}
