import { useEffect, useState } from 'react';
import type { QuickApi } from '@shared/ipc';
import type { QuickState } from '@shared/protocols';

/** Latest engine snapshot pushed from the studio window (null until the first one arrives). */
export function useQuickState(api: Pick<QuickApi, 'onState'> = window.quick): QuickState | null {
  const [state, setState] = useState<QuickState | null>(null);
  useEffect(() => api.onState(setState), [api]);
  return state;
}
