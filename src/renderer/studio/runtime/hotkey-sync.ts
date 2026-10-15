import type { HotkeyBindings } from '@shared/features';
import type { StudioApi } from '@shared/ipc';
import type { StudioState, StudioStoreApi } from '../store/studio-store';

/** What the main process needs, derived from the store. Pure. */
export function bindingsFrom(s: Pick<StudioState, 'hotkeys' | 'sounds'>): HotkeyBindings {
  const soundIds = new Set(s.sounds.map((x) => x.id));
  const sounds: Record<string, string> = {};
  for (const [id, accelerator] of Object.entries(s.hotkeys.sounds)) {
    if (soundIds.has(id)) sounds[id] = accelerator;
  }
  const { preset, accelerator } = s.hotkeys.quick;
  return {
    voices: { ...s.hotkeys.voices },
    sounds,
    quick: preset && accelerator ? { preset, accelerator } : null,
  };
}

/** Sends the hotkey bindings to the main process whenever they change. */
export function startHotkeySync(
  store: StudioStoreApi,
  api: Pick<StudioApi, 'hotkeys'>,
  debounceMs = 250,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastKey = '';

  const push = (): void => {
    timer = null;
    const bindings = bindingsFrom(store.getState());
    const key = JSON.stringify(bindings);
    if (key === lastKey) return;
    lastKey = key;
    void api.hotkeys.set(bindings).then((result) => {
      if (!result.ok) {
        store.getState().setStatus(`Shortcut not available: ${result.failed.join(', ')}`);
      }
    });
  };

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(push, debounceMs);
  };

  let last = store.getState();
  const unsubscribe = store.subscribe((s) => {
    if (s.hotkeys !== last.hotkeys || s.sounds !== last.sounds) schedule();
    last = s;
  });
  push();

  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}
