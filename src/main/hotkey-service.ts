import type { HotkeyBindings, HotkeyResult } from '@shared/features';
import type { QuickCommand } from '@shared/protocols';
import { isValidAccelerator } from './accelerator';
import type { GlobalShortcutApi } from './shortcut-service';

/**
 * Registers the user's voice and sound hotkeys as global shortcuts and turns each press into a
 * command for the studio window. The compact-panel shortcut is owned by ShortcutService and is
 * never touched here (its accelerator is passed as `reserved`).
 */
export class HotkeyService {
  private registered: string[] = [];
  private quickActive = false;

  constructor(
    private readonly api: GlobalShortcutApi,
    private readonly send: (cmd: QuickCommand) => void,
  ) {}

  /** Replaces every binding. Returns the accelerators that could not be registered. */
  apply(bindings: HotkeyBindings, reserved: readonly string[] = []): HotkeyResult {
    this.clear();
    const failed: string[] = [];
    const taken = new Set<string>(reserved);

    const bind = (accelerator: string, action: () => void): void => {
      if (!isValidAccelerator(accelerator) || taken.has(accelerator)) {
        failed.push(accelerator);
        return;
      }
      let ok: boolean;
      try {
        ok = this.api.register(accelerator, action);
      } catch {
        ok = false;
      }
      if (ok) {
        taken.add(accelerator);
        this.registered.push(accelerator);
      } else failed.push(accelerator);
    };

    for (const [preset, accelerator] of Object.entries(bindings.voices)) {
      bind(accelerator, () => this.send({ type: 'preset', name: preset, toast: true }));
    }
    for (const [id, accelerator] of Object.entries(bindings.sounds)) {
      bind(accelerator, () => this.send({ type: 'sound', id }));
    }
    if (bindings.quick) {
      const { preset, accelerator } = bindings.quick;
      bind(accelerator, () => {
        // first press switches to the quick voice, the second returns to what was active
        if (!this.quickActive) {
          this.quickActive = true;
          this.send({ type: 'quickSwitch', preset, on: true });
        } else {
          this.quickActive = false;
          this.send({ type: 'quickSwitch', preset, on: false });
        }
      });
    }
    return failed.length === 0 ? { ok: true } : { ok: false, failed };
  }

  clear(): void {
    for (const a of this.registered) {
      try {
        this.api.unregister(a);
      } catch {
        /* already gone */
      }
    }
    this.registered = [];
    this.quickActive = false;
  }

  get active(): readonly string[] {
    return this.registered;
  }
}
