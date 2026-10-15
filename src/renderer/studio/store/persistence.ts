import {
  BACKUP_SUFFIX,
  migratePersisted,
  STORAGE_KEY,
  USER_PRESETS_KEY,
  type PersistedState,
} from '@shared/persisted-state';
import type { StudioParams } from '@shared/params';
import { sanitiseParams } from '@shared/params';
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

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function readJson(storage: KeyValueStorage, key: string): unknown {
  try {
    const raw = storage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

/** The stored value, or its previous good copy when the value is missing or not a JSON object. */
function readWithBackup(storage: KeyValueStorage, key: string): unknown {
  const value = readJson(storage, key);
  if (isRecord(value)) return value;
  const backup = readJson(storage, key + BACKUP_SUFFIX);
  return isRecord(backup) ? backup : value;
}

export function loadUserPresets(storage: KeyValueStorage): Record<string, StudioParams> {
  const raw = readWithBackup(storage, USER_PRESETS_KEY);
  const out: Record<string, StudioParams> = {};
  if (isRecord(raw)) {
    for (const [name, value] of Object.entries(raw)) {
      if (isRecord(value)) out[name] = sanitiseParams(value);
    }
  }
  return out;
}

/** Reads everything needed to seed a new store. */
export function loadSeed(storage: KeyValueStorage): StoreSeed {
  const { state, migrated } = migratePersisted(readWithBackup(storage, STORAGE_KEY));
  return { persisted: state, migrated, userPresets: loadUserPresets(storage) };
}

/** Receives a JSON copy of the state so it can be kept outside the browser storage. */
export type BackupSink = (json: string) => void;

/** The state copy is not rewritten more often than this. */
const BACKUP_INTERVAL_MS = 2000;

/** Keeps the last good copy of a stored value under `key.bak` before it is overwritten. */
function rotate(storage: KeyValueStorage, key: string): void {
  const previous = storage.getItem(key);
  if (!previous) return;
  try {
    if (isRecord(JSON.parse(previous))) storage.setItem(key + BACKUP_SUFFIX, previous);
  } catch {
    /* the current value is damaged: keep the older backup */
  }
}

/**
 * Writes the persisted subset whenever it changes (debounced). Every write first keeps the previous
 * good value as a `.bak` copy, and `sink` (if given) receives the whole state for an off-site copy.
 * Returns a function that flushes synchronously and stops listening.
 */
export function startPersistence(
  store: StudioStoreApi,
  storage: KeyValueStorage,
  debounceMs = 300,
  sink?: BackupSink,
  now: () => number = () => Date.now(),
): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastState: PersistedState | null = null;
  let lastPresets: Record<string, StudioParams> | null = null;
  let lastBackupAt = -Infinity;

  const write = (force = false): void => {
    timer = null;
    const s = store.getState();
    try {
      const state = JSON.stringify(toPersisted(s));
      const presets = JSON.stringify(s.userPresets);
      rotate(storage, STORAGE_KEY);
      rotate(storage, USER_PRESETS_KEY);
      storage.setItem(STORAGE_KEY, state);
      storage.setItem(USER_PRESETS_KEY, presets);
      if (sink && (force || now() - lastBackupAt >= BACKUP_INTERVAL_MS)) {
        lastBackupAt = now();
        sink(`{"state":${state},"presets":${presets}}`);
      }
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
    timer = setTimeout(() => write(), debounceMs);
  });

  return () => {
    unsubscribe();
    if (timer) {
      clearTimeout(timer);
      write(true);
    }
  };
}

/**
 * If the browser storage came back empty (cleared, corrupted, a new profile) but the off-site copy
 * exists, puts the copy back before the studio reads its settings. Returns whether it did.
 */
export async function restoreFromBackup(
  storage: KeyValueStorage,
  read: () => Promise<string | null>,
): Promise<boolean> {
  if (isRecord(readWithBackup(storage, STORAGE_KEY))) return false;
  let text: string | null;
  try {
    text = await read();
  } catch {
    return false;
  }
  if (!text) return false;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isRecord(parsed) || !isRecord(parsed.state)) return false;
    storage.setItem(STORAGE_KEY, JSON.stringify(parsed.state));
    if (isRecord(parsed.presets)) storage.setItem(USER_PRESETS_KEY, JSON.stringify(parsed.presets));
    return true;
  } catch {
    return false;
  }
}
