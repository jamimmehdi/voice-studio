import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { DisplayMeters } from '@engine/audio/meter-smoother';
import type { MusicSnapshot } from '@engine/audio/music-player';
import type { StudioStore } from '../store/studio-store';
import type { Runtime } from './runtime';

const RuntimeContext = createContext<Runtime | null>(null);

export function RuntimeProvider({ runtime, children }: { runtime: Runtime; children: ReactNode }): ReactNode {
  return <RuntimeContext.Provider value={runtime}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): Runtime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error('useRuntime must be used inside <RuntimeProvider>');
  return runtime;
}

/** Selects a slice of the studio store. Selector results are compared shallowly. */
export function useStudio<T>(selector: (state: StudioStore) => T): T {
  const { store } = useRuntime();
  return useStore(store, useShallow(selector));
}

export function useController(): Runtime['controller'] {
  return useRuntime().controller;
}

/** Re-renders when the music player changes (track, play state, position). */
export function useMusic(): MusicSnapshot {
  const { player } = useRuntime();
  const [snapshot, setSnapshot] = useState<MusicSnapshot>(() => player.snapshot);
  useEffect(() => {
    setSnapshot(player.snapshot);
    return player.events.on('change', () => setSnapshot(player.snapshot));
  }, [player]);
  return snapshot;
}

/** The playlist items; re-read whenever the player reports a change. */
export function usePlaylist(): { names: string[]; index: number } {
  const { player } = useRuntime();
  const [state, setState] = useState(() => ({ names: player.playlist.items.map((t) => t.name), index: player.playlist.index }));
  useEffect(() => {
    const read = (): void => setState({ names: player.playlist.items.map((t) => t.name), index: player.playlist.index });
    read();
    return player.events.on('change', read);
  }, [player]);
  return state;
}

/**
 * Subscribes to the smoothed meter values WITHOUT re-rendering: the callback writes straight to the DOM.
 * It runs once immediately and then on every hub tick.
 */
export function useMeterSubscription(callback: (meters: DisplayMeters) => void): void {
  const { hub } = useRuntime();
  useEffect(() => {
    callback(hub.latest);
    return hub.subscribe(callback);
  }, [hub, callback]);
}

/** Latency / dropout figures, refreshed twice a second. */
export function useEngineStats(): { latencyMs: number; dropouts: number; sampleRate: number } {
  const { engine } = useRuntime();
  const read = (): { latencyMs: number; dropouts: number; sampleRate: number } => ({
    latencyMs: engine.latencyMs,
    dropouts: engine.meters?.dropouts ?? 0,
    sampleRate: engine.context?.sampleRate ?? 0,
  });
  const [stats, setStats] = useState(read);
  useEffect(() => {
    const timer = setInterval(() => {
      const next = read();
      setStats((prev) => (prev.latencyMs === next.latencyMs && prev.dropouts === next.dropouts && prev.sampleRate === next.sampleRate ? prev : next));
    }, 500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);
  return stats;
}
