import { isValidAccelerator } from './accelerator';

/** The part of Electron's globalShortcut module we use (so it can be faked in tests). */
export interface GlobalShortcutApi {
  register(accelerator: string, callback: () => void): boolean;
  unregister(accelerator: string): void;
  unregisterAll(): void;
}

export type ShortcutOutcome = { ok: true } | { ok: false; error: string };

/** Owns the single global shortcut and makes changing it atomic (the old one survives a failure). */
export class ShortcutService {
  private active: string | null = null;

  constructor(
    private readonly api: GlobalShortcutApi,
    private readonly onTrigger: () => void,
  ) {}

  get current(): string | null {
    return this.active;
  }

  register(accelerator: string): ShortcutOutcome {
    if (!isValidAccelerator(accelerator)) return { ok: false, error: 'That is not a valid shortcut.' };
    if (accelerator === this.active) return { ok: true };

    const previous = this.active;
    if (previous) this.api.unregister(previous);
    let registered = false;
    try {
      registered = this.api.register(accelerator, this.onTrigger);
    } catch {
      registered = false;
    }
    if (registered) {
      this.active = accelerator;
      return { ok: true };
    }
    // restore the previous shortcut so the user is never left without one
    if (previous) {
      try {
        this.api.register(previous, this.onTrigger);
      } catch {
        /* ignore */
      }
    }
    this.active = previous;
    return { ok: false, error: 'That shortcut is already used by another program.' };
  }

  dispose(): void {
    this.api.unregisterAll();
    this.active = null;
  }
}
