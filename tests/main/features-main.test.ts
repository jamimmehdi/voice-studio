import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { sanitiseBindings } from '@main/bindings';
import {
  FOREGROUND_SCRIPT,
  ForegroundWatcher,
  listRunningApps,
  parseForegroundLine,
} from '@main/foreground-watcher';
import { HotkeyService } from '@main/hotkey-service';
import { RemoteController, pickLanAddress } from '@main/remote/remote-controller';
import {
  RemoteServer,
  deviceNameFromUserAgent,
  isPrivateAddress,
  parseRemoteCommand,
} from '@main/remote/remote-server';
import { SoundStore, MAX_SOUND_BYTES, type SoundFiles } from '@main/sound-store';
import { SettingsStore } from '@main/settings-store';
import type { QuickCommand, QuickState } from '@shared/protocols';

/* ------------------------------------------------------------------ */
/* hotkeys                                                            */
/* ------------------------------------------------------------------ */

class FakeShortcuts {
  handlers = new Map<string, () => void>();
  refuse = new Set<string>();
  register(accelerator: string, cb: () => void): boolean {
    if (this.refuse.has(accelerator)) return false;
    this.handlers.set(accelerator, cb);
    return true;
  }
  unregister(accelerator: string): void {
    this.handlers.delete(accelerator);
  }
  unregisterAll(): void {
    this.handlers.clear();
  }
  press(accelerator: string): void {
    this.handlers.get(accelerator)?.();
  }
}

describe('HotkeyService', () => {
  const setup = () => {
    const shortcuts = new FakeShortcuts();
    const sent: QuickCommand[] = [];
    const service = new HotkeyService(shortcuts, (c) => sent.push(c));
    return { shortcuts, sent, service };
  };

  it('turns key presses into commands', () => {
    const { shortcuts, sent, service } = setup();
    const result = service.apply({
      voices: { Robot: 'Control+Alt+1' },
      sounds: { abc: 'Control+Alt+2' },
      quick: null,
    });
    expect(result).toEqual({ ok: true });
    shortcuts.press('Control+Alt+1');
    shortcuts.press('Control+Alt+2');
    expect(sent).toEqual([
      { type: 'preset', name: 'Robot', toast: true },
      { type: 'sound', id: 'abc' },
    ]);
  });

  it('replaces the previous bindings and unregisters what is gone', () => {
    const { shortcuts, service } = setup();
    service.apply({ voices: { A: 'Control+Alt+1' }, sounds: {}, quick: null });
    service.apply({ voices: { B: 'Control+Alt+2' }, sounds: {}, quick: null });
    expect([...shortcuts.handlers.keys()]).toEqual(['Control+Alt+2']);
    service.clear();
    expect(shortcuts.handlers.size).toBe(0);
  });

  it('reports shortcuts that are invalid, reserved or refused by the system', () => {
    const { shortcuts, service } = setup();
    shortcuts.refuse.add('Control+Alt+3');
    const result = service.apply(
      {
        voices: { A: 'Control+Alt+V', B: 'nonsense', C: 'Control+Alt+3', D: 'Control+Alt+4' },
        sounds: {},
        quick: null,
      },
      ['Control+Alt+V'],
    );
    expect(result).toEqual({ ok: false, failed: ['Control+Alt+V', 'nonsense', 'Control+Alt+3'] });
    expect(service.active).toEqual(['Control+Alt+4']);
  });

  it('quick switch alternates between "on" and "off"', () => {
    const { shortcuts, sent, service } = setup();
    service.apply({ voices: {}, sounds: {}, quick: { preset: 'Cartoon', accelerator: 'Control+Alt+9' } });
    shortcuts.press('Control+Alt+9');
    shortcuts.press('Control+Alt+9');
    shortcuts.press('Control+Alt+9');
    expect(sent.map((c) => (c.type === 'quickSwitch' ? c.on : null))).toEqual([true, false, true]);
  });

  it('sanitiseBindings keeps only well-formed pairs', () => {
    expect(
      sanitiseBindings({
        voices: { A: 'Control+Alt+1', B: 5, C: '' },
        sounds: 'nope',
        quick: { preset: 'X', accelerator: 'Control+Alt+9' },
      }),
    ).toEqual({
      voices: { A: 'Control+Alt+1' },
      sounds: {},
      quick: { preset: 'X', accelerator: 'Control+Alt+9' },
    });
    expect(sanitiseBindings(null)).toEqual({ voices: {}, sounds: {}, quick: null });
    expect(sanitiseBindings({ quick: { preset: 1 } }).quick).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* foreground watcher                                                 */
/* ------------------------------------------------------------------ */

describe('ForegroundWatcher', () => {
  it('parses what the script prints', () => {
    expect(parseForegroundLine('VALORANT-Win64-Shipping.exe\r')).toBe('valorant-win64-shipping.exe');
    expect(parseForegroundLine('Voice Studio.exe')).toBe('voice studio.exe');
    expect(parseForegroundLine('')).toBeNull();
    expect(parseForegroundLine('C:\\Windows\\evil.exe')).toBeNull();
    expect(parseForegroundLine('notanexe')).toBeNull();
  });

  it('reports changes only once, across split chunks', () => {
    const watcher = new ForegroundWatcher('win32', () => {
      throw new Error('not started');
    });
    const seen: Array<string | null> = [];
    watcher.onChange((e) => seen.push(e));
    watcher.onData('chrome.e');
    watcher.onData('xe\nchrome.exe\nvalorant.exe\n\n');
    expect(seen).toEqual(['chrome.exe', 'valorant.exe', null]);
    expect(watcher.current).toBeNull();
  });

  it('spawns PowerShell once and stops it', async () => {
    const stdout = new Readable({ read() {} });
    const child = Object.assign(new EventEmitter(), { stdout, kill: vi.fn() });
    const spawnFn = vi.fn(() => child as never);
    const watcher = new ForegroundWatcher('win32', spawnFn);
    watcher.start();
    watcher.start();
    expect(spawnFn).toHaveBeenCalledTimes(1);
    const args = spawnFn.mock.calls[0] as unknown as [string, string[]];
    expect(args[0]).toBe('powershell.exe');
    expect(args[1]).toContain('-EncodedCommand');
    const seen: Array<string | null> = [];
    watcher.onChange((e) => seen.push(e));
    stdout.push('game.exe\n');
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).toEqual(['game.exe']);
    watcher.stop();
    expect(child.kill).toHaveBeenCalled();
  });

  it('never starts on other platforms', () => {
    const spawnFn = vi.fn();
    new ForegroundWatcher('linux', spawnFn as never).start();
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('the script only reads a process name', () => {
    expect(FOREGROUND_SCRIPT).toContain('GetForegroundWindow');
    expect(FOREGROUND_SCRIPT).not.toMatch(/OpenProcess|WriteProcessMemory|CreateRemoteThread|LoadLibrary/);
  });

  it('lists running apps without duplicates or odd names', async () => {
    const apps = await listRunningApps(async () => 'chrome\r\nValorant\r\nchrome\r\n\r\nweird<name>\r\n');
    expect(apps.map((a) => a.exe)).toEqual(['chrome.exe', 'valorant.exe']);
    expect(apps[0]!.name).toBe('chrome');
  });
});

/* ------------------------------------------------------------------ */
/* sound store                                                        */
/* ------------------------------------------------------------------ */

describe('SoundStore', () => {
  const memory = (): SoundFiles & { data: Map<string, Buffer> } => {
    const data = new Map<string, Buffer>();
    return {
      data,
      mkdir: () => undefined,
      write: (p, d) => void data.set(p, d),
      read: (p) => {
        const v = data.get(p);
        if (!v) throw new Error('ENOENT');
        return v;
      },
      remove: (p) => void data.delete(p),
    };
  };

  it('stores, reads and removes a clip under a random id', () => {
    const files = memory();
    const store = new SoundStore('/sounds', files, () => '0123456789abcdef');
    const id = store.add(Buffer.from([1, 2, 3]));
    expect(id).toBe('0123456789abcdef');
    expect(new Uint8Array(store.read(id)!)).toEqual(new Uint8Array([1, 2, 3]));
    store.remove(id);
    expect(store.read(id)).toBeNull();
  });

  it('rejects empty and oversized files and never accepts path-like ids', () => {
    const store = new SoundStore('/sounds', memory());
    expect(() => store.add(Buffer.alloc(0))).toThrow();
    expect(() => store.add(Buffer.alloc(MAX_SOUND_BYTES + 1))).toThrow(/30 MB/);
    expect(store.read('../../secret')).toBeNull();
    expect(() => store.remove('../x')).not.toThrow();
  });

  it('works on a real folder', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vs-sounds-'));
    try {
      const store = new SoundStore(join(dir, 'sounds'));
      const id = store.add(new Uint8Array([9, 8, 7]).buffer);
      expect(new Uint8Array(store.read(id)!)).toEqual(new Uint8Array([9, 8, 7]));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ------------------------------------------------------------------ */
/* phone remote                                                       */
/* ------------------------------------------------------------------ */

describe('remote helpers', () => {
  it('accepts only LAN and loopback addresses', () => {
    for (const ok of [
      '127.0.0.1',
      '::1',
      '::ffff:192.168.1.20',
      '10.0.0.5',
      '172.16.5.1',
      '172.31.0.9',
      '169.254.1.1',
    ]) {
      expect(isPrivateAddress(ok), ok).toBe(true);
    }
    for (const bad of ['8.8.8.8', '172.32.0.1', '203.0.113.9', '', undefined, '2001:db8::1']) {
      expect(isPrivateAddress(bad as string | undefined), String(bad)).toBe(false);
    }
  });

  it('only lets safe, well-formed commands through', () => {
    expect(parseRemoteCommand({ type: 'toggleEngine' })).toEqual({ type: 'toggleEngine' });
    expect(parseRemoteCommand({ type: 'preset', name: 'Robot' })).toEqual({ type: 'preset', name: 'Robot' });
    expect(parseRemoteCommand({ type: 'voice', pitch: 99, formant: -99 })).toEqual({
      type: 'voice',
      pitch: 12,
      formant: -12,
    });
    expect(parseRemoteCommand({ type: 'voice', pitch: 'x' })).toBeNull();
    expect(parseRemoteCommand({ type: 'preset', name: '' })).toBeNull();
    expect(parseRemoteCommand({ type: 'openStudio' })).toBeNull(); // window commands are not for phones
    expect(parseRemoteCommand({ type: 'quickSwitch', preset: 'x', on: true })).toBeNull();
    expect(parseRemoteCommand('toggleEngine')).toBeNull();
    expect(parseRemoteCommand(null)).toBeNull();
  });

  it('names devices from the user agent', () => {
    expect(deviceNameFromUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A) Chrome/120')).toBe(
      'Pixel 8',
    );
    expect(deviceNameFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('iPhone');
    expect(deviceNameFromUserAgent(undefined)).toBe('Phone');
  });

  it('prefers home-network addresses', () => {
    expect(pickLanAddress(['172.20.1.5', '10.0.0.2', '192.168.1.20'])).toBe('192.168.1.20');
    expect(pickLanAddress([])).toBeNull();
  });
});

describe('RemoteServer (real sockets)', () => {
  let dir: string;
  let server: RemoteServer;
  let port: number;
  let commands: QuickCommand[];
  const token = 'secret-token';
  const state: QuickState = {
    running: true,
    preset: 'Robot',
    chips: [{ key: 'Robot', label: 'Robot' }],
    pitch: 0,
    formant: 0,
    monitor: false,
    bypass: false,
    gate: true,
    level: 0,
    stats: '',
    music: { has: false, title: '', playing: false, progress: 0 },
    sounds: [],
    muted: false,
  };

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'vs-remote-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'remote.html'), '<html>remote</html>');
    writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
    writeFileSync(join(dir, 'secret.txt'), 'nope');
    commands = [];
    server = new RemoteServer({
      staticDir: join(dir, ''),
      token: () => token,
      port: 0,
      onCommand: (c) => commands.push(c),
      currentState: () => state,
    });
    port = await server.start();
  });

  afterEach(() => {
    server.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  const get = (path: string): Promise<Response> => fetch(`http://127.0.0.1:${port}${path}`);

  it('serves the page only with the right token', async () => {
    expect((await get('/')).status).toBe(403);
    expect((await get('/?t=wrong')).status).toBe(403);
    const ok = await get(`/?t=${token}`);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('remote');
    expect(ok.headers.get('cache-control')).toBe('no-store');
  });

  it('serves assets but never anything outside the folder', async () => {
    expect((await get('/assets/app.js')).status).toBe(200);
    expect((await get('/assets/../secret.txt')).status).toBe(404);
    expect((await get('/assets/%2e%2e/secret.txt')).status).toBe(404);
    expect((await get('/secret.txt')).status).toBe(404);
  });

  it('relays valid commands, pushes state and tracks devices', async () => {
    const seenDevices: number[] = [];
    server.onDevices((d) => seenDevices.push(d.length));

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?t=${token}`);
    const first = await new Promise<{ type: string; state: QuickState }>((resolve, reject) => {
      ws.once('message', (m) => resolve(JSON.parse(m.toString())));
      ws.once('error', reject);
    });
    expect(first.type).toBe('state');
    expect(first.state.preset).toBe('Robot');
    expect(server.devices).toHaveLength(1);

    ws.send(JSON.stringify({ type: 'preset', name: 'Giant / Monster' }));
    ws.send(JSON.stringify({ type: 'openStudio' }));
    ws.send('not json');
    await new Promise((r) => setTimeout(r, 100));
    expect(commands).toEqual([{ type: 'preset', name: 'Giant / Monster' }]);

    const next = new Promise<QuickState>((resolve) =>
      ws.once('message', (m) => resolve(JSON.parse(m.toString()).state)),
    );
    server.broadcast({ ...state, pitch: 3 });
    expect((await next).pitch).toBe(3);

    ws.close();
    await new Promise((r) => setTimeout(r, 100));
    expect(server.devices).toHaveLength(0);
    expect(seenDevices).toContain(1);
  });

  it('refuses a socket with a wrong token', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?t=nope`);
    const outcome = await new Promise<string>((resolve) => {
      ws.once('open', () => resolve('open'));
      ws.once('error', () => resolve('error'));
      ws.once('unexpected-response', () => resolve('rejected'));
    });
    expect(outcome).not.toBe('open');
  });

  it('can be switched off and on again', async () => {
    server.stop();
    expect(server.running).toBe(false);
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
    port = await server.start();
    expect((await get(`/?t=${token}`)).status).toBe(200);
  });
});

describe('RemoteController', () => {
  const make = (initial: { remoteEnabled?: boolean; remoteToken?: string } = {}) => {
    let value = { remoteEnabled: false, remoteToken: '', ...initial };
    const settings = {
      get value() {
        return value;
      },
      update: (p: Partial<typeof value>) => {
        value = { ...value, ...p };
      },
    };
    const server = {
      running: false,
      port: 7777,
      devices: [] as never[],
      start: vi.fn(async function (this: { running: boolean }) {
        server.running = true;
        return 7777;
      }),
      stop: vi.fn(() => {
        server.running = false;
      }),
      disconnectAll: vi.fn(),
      disconnect: vi.fn(),
    };
    const controller = new RemoteController({
      settings: settings as never,
      server: server as never,
      addresses: () => ['192.168.1.20'],
      qr: async (t) => `data:image/png;base64,${Buffer.from(t).toString('base64')}`,
    });
    return { controller, server, settings };
  };

  it('is off by default and has no address', async () => {
    const { controller } = make();
    expect(await controller.view()).toMatchObject({ enabled: false, url: null, qr: null });
  });

  it('turning it on creates a token, starts the server and returns the pairing address', async () => {
    const { controller, server, settings } = make();
    const view = await controller.setEnabled(true);
    expect(server.start).toHaveBeenCalled();
    expect(settings.value.remoteToken.length).toBeGreaterThan(8);
    expect(view.enabled).toBe(true);
    expect(view.url).toBe(`http://192.168.1.20:7777/?t=${settings.value.remoteToken}`);
    expect(view.qr).toMatch(/^data:image\/png/);
  });

  it('a new code replaces the token and drops every phone', async () => {
    const { controller, server, settings } = make({ remoteEnabled: true, remoteToken: 'old-token-value' });
    await controller.init();
    const before = settings.value.remoteToken;
    await controller.newCode();
    expect(settings.value.remoteToken).not.toBe(before);
    expect(server.disconnectAll).toHaveBeenCalled();
  });

  it('turning it off stops the server', async () => {
    const { controller, server } = make({ remoteEnabled: true, remoteToken: 'abcdefghijkl' });
    await controller.init();
    const view = await controller.setEnabled(false);
    expect(server.stop).toHaveBeenCalled();
    expect(view.enabled).toBe(false);
    expect(view.url).toBeNull();
  });

  it('reports a start failure and switches itself off', async () => {
    const { controller, server, settings } = make();
    server.start.mockRejectedValueOnce(new Error('EADDRINUSE'));
    const view = await controller.setEnabled(true);
    expect(view.error).toContain('EADDRINUSE');
    expect(settings.value.remoteEnabled).toBe(false);
  });
});

describe('SettingsStore: remote fields', () => {
  it('persists the remote switch and token and tolerates garbage', () => {
    const files = new Map<string, string>();
    const io = {
      read: (p: string) => {
        const v = files.get(p);
        if (v === undefined) throw new Error('ENOENT');
        return v;
      },
      write: (p: string, d: string) => void files.set(p, d),
    };
    const a = new SettingsStore('s.json', io);
    expect(a.value.remoteEnabled).toBe(false);
    a.update({ remoteEnabled: true, remoteToken: 'tok' });
    const b = new SettingsStore('s.json', io);
    expect(b.value.remoteEnabled).toBe(true);
    expect(b.value.remoteToken).toBe('tok');
    files.set('s.json', JSON.stringify({ remoteEnabled: 'yes', remoteToken: 12 }));
    const c = new SettingsStore('s.json', io);
    expect(c.value.remoteEnabled).toBe(false);
    expect(c.value.remoteToken).toBe('');
  });
});
