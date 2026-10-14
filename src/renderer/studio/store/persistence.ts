import {
  migratePersisted,
  STORAGE_KEY,
  USER_PRESETS_KEY,
  type PersistedState,
} from '@shared/persisted-state';
import type { StudioParams } from '@shared/params';
import { mergeDeep, createDefaultParams, type DeepPartial } from '@shared/params';
import { toPersisted, type StoreSeed, type StudioStoreApi } from './studio-store';

/** Minimal Storage subset (so tests can pass an in-memory object). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class MemoryStorage implements KeyValueStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

function readJson(storage: KeyValueStorage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function loadUserPresets(storage: KeyValueStorage): Record<string, StudioParams> {
  const raw = readJson(storage, USER_PRESETS_KEY);
  const out: Record<string, StudioParams> = {};
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    for (const [name, value] of Object.entries(raw)) {
      if (typeof value === 'object' && value !== null) {
        out[name] = mergeDeep(createDefaultParams(), value as DeepPartial<StudioParams>);
      }
    }
  }
  return out;
}

/** Reads everything needed to seed a new store. */
export function loadSeed(storage: KeyValueStorage): StoreSeed {
  const { state, migrated } = migratePersisted(readJson(storage, STORAGE_KEY));
  return { persisted: state, migrated, userPresets: loadUserPresets(storage) };
}

/**
 * Writes the persisted subset whenever it changes (debounced). Returns a function that flushes
 * synchronously and stops listening.
 */
export function startPersistence(
  store: StudioStoreApi,
  storage: KeyValueStorage,
  debounceMs = 300,
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastState: PersistedState | null = null;
  let lastPresets: Record<string, StudioParams> | null = null;

  const write = (): void => {
    timer = null;
    const s = store.getState();
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(toPersisted(s)));
      storage.setItem(USER_PRESETS_KEY, JSON.stringify(s.userPresets));
    } catch {
      /* storage may be unavailable (private mode, quota): the app still works */
    }
  };

  const unsubscribe = store.subscribe((s) => {
    const persisted = toPersisted(s);
    const same =
      lastState !== null &&
      lastPresets === s.userPresets &&
      Object.keys(persisted).every(
        (k) =>
          (persisted as unknown as Record<string, unknown>)[k] ===
          (lastState as unknown as Record<string, unknown>)[k],
      );
    if (same) return;
    lastState = persisted;
    lastPresets = s.userPresets;
    if (timer) clearTimeout(timer);
    timer = setTimeout(write, debounceMs);
  });

  return () => {
    unsubscribe();
    if (timer) {
      clearTimeout(timer);
      write();
    }
  };
}
