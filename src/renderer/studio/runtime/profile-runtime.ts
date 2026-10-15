import type { StudioApi } from '@shared/ipc';
import { findProfile } from '@shared/features';
import type { StudioStoreApi } from '../store/studio-store';

/** Executable names that mean "Voice Studio itself is in front". */
const OWN_EXES = new Set(['voice studio.exe', 'electron.exe']);

export interface ProfileRuntimeDeps {
  store: StudioStoreApi;
  api: Pick<StudioApi, 'foreground'>;
  startEngine(): void;
  isEngineRunning(): boolean;
}

/**
 * App profiles: when a listed program comes to the front its voice is loaded (and the engine can
 * start); when you leave it, the fallback voice returns.
 */
export class ProfileRuntime {
  private previousListed: string | null = null;

  constructor(private readonly deps: ProfileRuntimeDeps) {}

  wire(): () => void {
    const { store, api } = this.deps;
    const disposers: Array<() => void> = [];

    disposers.push(api.foreground.onChange((exe) => this.onForeground(exe)));

    let enabled = store.getState().profiles.enabled;
    const apply = (on: boolean): void => {
      void api.foreground.setActive(on).then((exe) => {
        if (on && exe) this.onForeground(exe);
      });
    };
    if (enabled) apply(true);
    disposers.push(
      store.subscribe((s) => {
        if (s.profiles.enabled !== enabled) {
          enabled = s.profiles.enabled;
          if (!enabled) this.previousListed = null;
          apply(enabled);
        }
      }),
    );
    return () => {
      disposers.forEach((d) => d());
      void api.foreground.setActive(false);
    };
  }

  onForeground(exe: string | null): void {
    const { store } = this.deps;
    const s = store.getState();
    s.setForeground(exe);
    if (!s.profiles.enabled) return;
    if (exe && OWN_EXES.has(exe)) return; // looking at Voice Studio itself never switches anything

    const profile = findProfile(s.profiles.apps, exe);
    if (profile) {
      this.previousListed = profile.exe;
      if (profile.preset && s.preset !== profile.preset) s.applyPreset(profile.preset);
      if (profile.start && !this.deps.isEngineRunning()) this.deps.startEngine();
      return;
    }
    // left a listed app for something else: go back to the fallback voice
    if (this.previousListed) {
      this.previousListed = null;
      const fallback = s.profiles.fallback;
      if (fallback && s.preset !== fallback) s.applyPreset(fallback);
    }
  }
}
