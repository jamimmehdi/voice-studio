import { networkInterfaces } from 'node:os';
import type { RemoteView } from '@shared/ipc';
import type { SettingsStore } from '../settings-store';
import { makeToken, type RemoteServer } from './remote-server';

export interface RemoteControllerDeps {
  settings: Pick<SettingsStore, 'value' | 'update'>;
  server: Pick<
    RemoteServer,
    'start' | 'stop' | 'disconnectAll' | 'disconnect' | 'devices' | 'port' | 'running'
  >;
  /** this PC's LAN addresses, best first */
  addresses?: () => string[];
  /** renders `text` as a QR code image (data URL) */
  qr: (text: string) => Promise<string>;
}

/** Preference: home networks (192.168), then 10.x, then 172.16-31. */
export function pickLanAddress(addresses: readonly string[]): string | null {
  const rank = (a: string): number => (a.startsWith('192.168.') ? 0 : a.startsWith('10.') ? 1 : 2);
  const sorted = [...addresses].sort((a, b) => rank(a) - rank(b));
  return sorted[0] ?? null;
}

export function lanAddresses(): string[] {
  const out: string[] = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal) out.push(info.address);
    }
  }
  return out;
}

/** Ties the phone-remote server to the saved settings and builds what the UI shows. */
export class RemoteController {
  private error: string | null = null;

  constructor(private readonly deps: RemoteControllerDeps) {}

  /** Called once at start-up: brings the server up again if it was left on. */
  async init(): Promise<void> {
    if (this.deps.settings.value.remoteEnabled) await this.startServer();
  }

  async view(): Promise<RemoteView> {
    const { settings, server } = this.deps;
    const enabled = settings.value.remoteEnabled && server.running;
    let url: string | null = null;
    let qr: string | null = null;
    if (enabled) {
      const address = pickLanAddress((this.deps.addresses ?? lanAddresses)());
      if (address) {
        url = `http://${address}:${server.port}/?t=${settings.value.remoteToken}`;
        qr = await this.deps.qr(url).catch(() => null);
      } else {
        this.error = 'This PC is not on a network.';
      }
    }
    return { enabled: settings.value.remoteEnabled, url, qr, devices: server.devices, error: this.error };
  }

  async setEnabled(on: boolean): Promise<RemoteView> {
    const { settings, server } = this.deps;
    this.error = null;
    if (on) {
      if (!settings.value.remoteToken) settings.update({ remoteToken: makeToken() });
      settings.update({ remoteEnabled: true });
      await this.startServer();
    } else {
      settings.update({ remoteEnabled: false });
      server.stop();
    }
    return this.view();
  }

  /** A new pairing code invalidates every phone that was connected. */
  async newCode(): Promise<RemoteView> {
    this.deps.settings.update({ remoteToken: makeToken() });
    this.deps.server.disconnectAll();
    return this.view();
  }

  disconnect(id: string): void {
    this.deps.server.disconnect(id);
  }

  private async startServer(): Promise<void> {
    const { settings, server } = this.deps;
    if (!settings.value.remoteToken) settings.update({ remoteToken: makeToken() });
    try {
      await server.start();
      this.error = null;
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'The remote could not start.';
      settings.update({ remoteEnabled: false });
    }
  }
}
