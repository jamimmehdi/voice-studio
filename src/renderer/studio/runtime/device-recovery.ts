import { missingDevices, type DeviceLists, type DeviceRole, type MissingDevice } from '@engine/audio/devices';
import type { StudioStoreApi } from '../store/studio-store';

export interface RecoveryDeps {
  store: StudioStoreApi;
  engine: {
    readonly running: boolean;
    events: { on(event: 'inputLost', cb: () => void): () => void };
  };
  controller: { start(): Promise<void>; stop(): Promise<void> };
  listDevices(): Promise<DeviceLists>;
  /** subscribes to "a device was plugged in or removed" */
  onDeviceChange(cb: () => void): () => void;
  /** how often to look for a missing device while waiting (ms) */
  pollMs?: number;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
}

const ROLE_NAME: Record<DeviceRole, string> = {
  microphone: 'microphone',
  output: 'virtual cable output',
  headphones: 'headphones',
};

/** "microphone", "microphone and headphones" */
export function describeMissing(missing: readonly MissingDevice[]): string {
  const names = [...new Set(missing.map((m) => ROLE_NAME[m.role]))];
  if (names.length <= 1) return names[0] ?? 'device';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Keeps the engine alive across unplugging and re-plugging: when a device in use disappears the
 * engine pauses and says why, and it starts again by itself as soon as the device is back.
 */
export class DeviceRecovery {
  private waiting = false;
  private checking = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private disposers: Array<() => void> = [];

  constructor(private readonly deps: RecoveryDeps) {}

  get isWaiting(): boolean {
    return this.waiting;
  }

  wire(): () => void {
    const { engine, onDeviceChange } = this.deps;
    this.disposers.push(
      engine.events.on('inputLost', () => void this.check(true)),
      onDeviceChange(() => void this.check(false)),
    );
    return () => {
      this.stopPolling();
      this.disposers.forEach((d) => d());
      this.disposers = [];
    };
  }

  /**
   * @param inputEnded the microphone stream ended on its own, so the engine must pause even if the
   *   selected id still looks present (for example the "default" microphone was unplugged)
   */
  async check(inputEnded: boolean): Promise<void> {
    if (this.checking) return;
    this.checking = true;
    try {
      const { store, engine, listDevices } = this.deps;
      const lists = await listDevices();
      const missing = missingDevices(store.getState().dev, lists);

      if (engine.running && (missing.length > 0 || inputEnded)) {
        await this.pause(missing);
        // the default device may simply have moved to another one: try again right away
        if (missing.length === 0) await this.resume();
        return;
      }
      if (this.waiting && missing.length === 0) await this.resume();
    } finally {
      this.checking = false;
    }
  }

  private async pause(missing: readonly MissingDevice[]): Promise<void> {
    const { store, controller } = this.deps;
    this.waiting = true;
    await controller.stop();
    store.getState().setEngine('waiting');
    const what = missing.length > 0 ? describeMissing(missing) : 'microphone';
    store.getState().setStatus(`Waiting for your ${what}…`);
    store
      .getState()
      .setNotice(
        'warn',
        `Your ${what} was disconnected. Voice Studio will resume by itself when it is back.`,
      );
    this.startPolling();
  }

  private async resume(): Promise<void> {
    const { store, controller, engine } = this.deps;
    await controller.start();
    if (engine.running) {
      this.waiting = false;
      this.stopPolling();
      store.getState().setNotice('info', 'Your device is back. Voice Studio is running again.');
    } else {
      // still not usable: stay in the waiting state and keep looking
      store.getState().setEngine('waiting');
      this.startPolling();
    }
  }

  private startPolling(): void {
    if (this.timer) return;
    const set = this.deps.setInterval ?? setInterval;
    this.timer = set(() => void this.check(false), this.deps.pollMs ?? 2000);
  }

  private stopPolling(): void {
    if (!this.timer) return;
    (this.deps.clearInterval ?? clearInterval)(this.timer);
    this.timer = null;
  }
}
