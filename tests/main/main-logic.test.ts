import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isValidAccelerator } from '@main/accelerator';
import { clampToArea, defaultIconPosition, defaultPanelPosition } from '@main/geometry';
import { OverlayController, type OverlayWindow } from '@main/overlay-controller';
import { psQuote } from '@main/powershell';
import { CommandRelay } from '@main/relay';
import { DEFAULT_SETTINGS, SettingsStore } from '@main/settings-store';
import { ShortcutService, type GlobalShortcutApi } from '@main/shortcut-service';
import {
  plainReleaseNotes,
  UpdateService,
  type AutoUpdaterLike,
  type UpdateSink,
} from '@main/update-service';
import {
  findLatestPackUrl,
  isTrustedSignature,
  VbCableInstaller,
  VBCABLE_FALLBACK,
} from '@main/vbcable/vbcable-installer';
import { friendlyYtdlpError, isAcceptableUrl, parsePrintedResult } from '@main/ytdlp/errors';
import { YtDlpService } from '@main/ytdlp/ytdlp-service';
import type { QuickCommand, QuickState } from '@shared/protocols';

const AREA = { x: 0, y: 0, width: 1920, height: 1080 };

describe('geometry', () => {
  it('clamps a window back inside the work area', () => {
    expect(clampToArea({ x: 5000, y: -50 }, { width: 440, height: 720 }, AREA)).toEqual({ x: 1480, y: 0 });
    expect(clampToArea({ x: 100, y: 100 }, { width: 440, height: 720 }, AREA)).toEqual({ x: 100, y: 100 });
  });
  it('default positions sit on the right edge', () => {
    expect(defaultPanelPosition(AREA, { width: 440, height: 720 })).toEqual({ x: 1456, y: 24 });
    expect(defaultIconPosition(AREA, { width: 64, height: 64 })).toEqual({ x: 1832, y: 540 });
  });
});

describe('isValidAccelerator', () => {
  it.each(['Control+Alt+V', 'Ctrl+Shift+F5', 'Alt+Space', 'Control+Alt+Shift+9', 'CommandOrControl+`'])(
    'accepts %s',
    (a) => {
      expect(isValidAccelerator(a)).toBe(true);
    },
  );
  it.each([
    'V',
    'F5',
    '',
    'Control+',
    'Control+Control',
    'Foo+V',
    'Control+Alt',
    'Control+Control+V',
    'Ctrl+Alt+VV',
  ])('rejects %j', (a) => {
    expect(isValidAccelerator(a)).toBe(false);
  });
});

describe('SettingsStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vs-settings-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('falls back to defaults when the file is missing or corrupt', () => {
    expect(new SettingsStore(join(dir, 'nope.json')).value).toEqual(DEFAULT_SETTINGS);
    const bad = join(dir, 'bad.json');
    writeFileSync(bad, '{not json');
    expect(new SettingsStore(bad).value).toEqual(DEFAULT_SETTINGS);
  });

  it('persists updates and reloads them', () => {
    const file = join(dir, 's.json');
    const store = new SettingsStore(file);
    store.update({ shortcut: 'Alt+F9', panelPosition: { x: 10, y: 20 } });
    const reloaded = new SettingsStore(file);
    expect(reloaded.value.shortcut).toBe('Alt+F9');
    expect(reloaded.value.panelPosition).toEqual({ x: 10, y: 20 });
    expect(existsSync(file)).toBe(true);
  });

  it('sanitises invalid fields', () => {
    const file = join(dir, 's.json');
    writeFileSync(
      file,
      JSON.stringify({ shortcut: 42, panelPosition: { x: 'a', y: 1 }, trayHintShown: 'yes' }),
    );
    expect(new SettingsStore(file).value).toEqual(DEFAULT_SETTINGS);
  });

  it('survives a write failure', () => {
    const store = new SettingsStore('x', {
      read: () => {
        throw new Error('no file');
      },
      write: () => {
        throw new Error('read-only');
      },
    });
    expect(() => store.update({ trayHintShown: true })).not.toThrow();
    expect(store.value.trayHintShown).toBe(true);
  });
});

function fakeWindow(
  width: number,
  height: number,
): OverlayWindow & {
  shownAt: unknown[];
  states: QuickState[];
  visible: boolean;
  pos: { x: number; y: number };
} {
  const w = {
    size: { width, height },
    visible: false,
    pos: { x: 0, y: 0 },
    shownAt: [] as unknown[],
    states: [] as QuickState[],
    isVisible: () => w.visible,
    showAt: (p: { x: number; y: number }) => {
      w.visible = true;
      w.pos = p;
      w.shownAt.push(p);
    },
    hide: () => {
      w.visible = false;
    },
    sendState: (s: QuickState) => {
      w.states.push(s);
    },
    position: () => (w.visible ? w.pos : null),
    moveBy: (dx: number, dy: number) => {
      w.pos = { x: w.pos.x + dx, y: w.pos.y + dy };
    },
  };
  return w;
}

const state = (over: Partial<QuickState> = {}): QuickState => ({
  running: false,
  preset: null,
  chips: [],
  presets: [],
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
  ...over,
});

describe('OverlayController', () => {
  const setup = () => {
    const panel = fakeWindow(440, 720);
    const icon = fakeWindow(64, 64);
    const dir = mkdtempSync(join(tmpdir(), 'vs-ov-'));
    const settings = new SettingsStore(join(dir, 's.json'));
    const controller = new OverlayController({ panel, icon, settings, workArea: () => AREA });
    return {
      panel,
      icon,
      settings,
      controller,
      cleanup: () => rmSync(dir, { recursive: true, force: true }),
    };
  };

  it('shows the panel at the default spot and hides the icon', () => {
    const { controller, panel, icon, cleanup } = setup();
    icon.visible = true;
    controller.showPanel();
    expect(panel.visible).toBe(true);
    expect(icon.visible).toBe(false);
    expect(panel.pos).toEqual({ x: 1456, y: 24 });
    cleanup();
  });

  it('toggle: panel -> icon -> panel', () => {
    const { controller, panel, icon, cleanup } = setup();
    controller.toggle();
    expect(panel.visible).toBe(true);
    controller.toggle();
    expect(panel.visible).toBe(false);
    expect(icon.visible).toBe(true);
    controller.toggle();
    expect(panel.visible).toBe(true);
    expect(icon.visible).toBe(false);
    cleanup();
  });

  it('remembers where the user dragged the panel and restores it (clamped)', () => {
    const { controller, panel, settings, cleanup } = setup();
    controller.showPanel();
    panel.pos = { x: 300, y: 200 };
    controller.hidePanel();
    expect(settings.value.panelPosition).toEqual({ x: 300, y: 200 });
    controller.showPanel();
    expect(panel.pos).toEqual({ x: 300, y: 200 });
    settings.update({ panelPosition: { x: 9999, y: 9999 } });
    controller.showPanel();
    expect(panel.pos).toEqual({ x: 1480, y: 360 });
    cleanup();
  });

  it('drags the icon and stores its final position', () => {
    const { controller, icon, settings, cleanup } = setup();
    controller.showIcon();
    controller.dragIcon(-10, 5);
    controller.rememberIconPosition();
    expect(settings.value.iconPosition).toEqual({ x: icon.pos.x, y: icon.pos.y });
    cleanup();
  });

  it('forwards state only to visible windows and replays the last state on show', () => {
    const { controller, panel, icon, cleanup } = setup();
    controller.pushState(state({ pitch: 1 }));
    expect(panel.states).toHaveLength(0);
    controller.showPanel();
    expect(panel.states.at(-1)?.pitch).toBe(1);
    controller.pushState(state({ pitch: 2 }));
    expect(panel.states.at(-1)?.pitch).toBe(2);
    expect(icon.states).toHaveLength(0);
    cleanup();
  });
});

describe('CommandRelay', () => {
  const setup = () => {
    const calls: string[] = [];
    const forwarded: QuickCommand[] = [];
    const relay = new CommandRelay(
      {
        openStudio: () => calls.push('openStudio'),
        showIcon: () => calls.push('showIcon'),
        hidePanel: () => calls.push('hidePanel'),
        showPanel: () => calls.push('showPanel'),
      },
      { send: (c) => forwarded.push(c) },
    );
    return { relay, calls, forwarded };
  };

  it('handles window commands itself', () => {
    const { relay, calls, forwarded } = setup();
    relay.handle({ type: 'openStudio' });
    relay.handle({ type: 'minimizeToIcon' });
    relay.handle({ type: 'hideCompact' });
    relay.handle({ type: 'openCompact' });
    expect(calls).toEqual(['openStudio', 'showIcon', 'hidePanel', 'showPanel']);
    expect(forwarded).toHaveLength(0);
  });

  it('forwards engine commands to the studio window', () => {
    const { relay, calls, forwarded } = setup();
    relay.handle({ type: 'preset', name: 'Robot' });
    relay.handle({ type: 'voice', pitch: 3 });
    expect(forwarded).toEqual([
      { type: 'preset', name: 'Robot' },
      { type: 'voice', pitch: 3 },
    ]);
    expect(calls).toHaveLength(0);
  });

  it('ignores malformed input', () => {
    const { relay, calls, forwarded } = setup();
    relay.handle(null);
    relay.handle('toggleEngine');
    relay.handle({ nope: 1 });
    expect(calls).toHaveLength(0);
    expect(forwarded).toHaveLength(0);
  });
});

describe('ShortcutService', () => {
  const fakeApi = (taken: string[] = []): GlobalShortcutApi & { registered: Set<string> } => {
    const registered = new Set<string>();
    return {
      registered,
      register: (a) => {
        if (taken.includes(a)) return false;
        registered.add(a);
        return true;
      },
      unregister: (a) => {
        registered.delete(a);
      },
      unregisterAll: () => registered.clear(),
    };
  };

  it('registers a valid shortcut', () => {
    const api = fakeApi();
    const s = new ShortcutService(api, () => undefined);
    expect(s.register('Control+Alt+V')).toEqual({ ok: true });
    expect(s.current).toBe('Control+Alt+V');
  });

  it('rejects invalid accelerators without touching the current one', () => {
    const api = fakeApi();
    const s = new ShortcutService(api, () => undefined);
    s.register('Control+Alt+V');
    expect(s.register('V').ok).toBe(false);
    expect(s.current).toBe('Control+Alt+V');
    expect(api.registered.has('Control+Alt+V')).toBe(true);
  });

  it('keeps the previous shortcut when the new one is taken by another program', () => {
    const api = fakeApi(['Control+Alt+B']);
    const s = new ShortcutService(api, () => undefined);
    s.register('Control+Alt+V');
    const r = s.register('Control+Alt+B');
    expect(r.ok).toBe(false);
    expect(s.current).toBe('Control+Alt+V');
    expect(api.registered.has('Control+Alt+V')).toBe(true);
  });

  it('dispose unregisters everything', () => {
    const api = fakeApi();
    const s = new ShortcutService(api, () => undefined);
    s.register('Alt+F9');
    s.dispose();
    expect(api.registered.size).toBe(0);
    expect(s.current).toBeNull();
  });
});

describe('yt-dlp helpers', () => {
  it('maps known failures to friendly sentences', () => {
    expect(friendlyYtdlpError('ERROR: [youtube] x: Sign in to confirm your age.')).toMatch(/age-restricted/);
    expect(friendlyYtdlpError('ERROR: Private video')).toMatch(/private/i);
    expect(friendlyYtdlpError("Sign in to confirm you're not a bot")).toMatch(/bot check/);
    expect(friendlyYtdlpError('Video unavailable')).toMatch(/unavailable/);
  });

  it('falls back to the last ERROR line, truncated', () => {
    const msg = friendlyYtdlpError(`WARNING: something\nERROR: ${'x'.repeat(500)}`);
    expect(msg.startsWith('ERROR: xxx')).toBe(true);
    expect(msg.length).toBe(220);
  });

  it('only accepts absolute https links', () => {
    expect(isAcceptableUrl('https://www.youtube.com/watch?v=abc')).toBe(true);
    expect(isAcceptableUrl('http://example.com')).toBe(false);
    expect(isAcceptableUrl('--exec rm -rf')).toBe(false);
    expect(isAcceptableUrl('C:\\Windows\\win.ini')).toBe(false);
  });

  it('parses the printed result line', () => {
    expect(parsePrintedResult('noise\nMe at the zoo|||C:\\x\\a.m4a\n')).toEqual({
      title: 'Me at the zoo',
      file: 'C:\\x\\a.m4a',
    });
    expect(parsePrintedResult('no marker')).toBeNull();
  });
});

describe('YtDlpService', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'vs-yt-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('downloads the binary once, runs it with a JS runtime and returns the audio', async () => {
    const audio = join(dir, 'track.m4a');
    writeFileSync(audio, Buffer.from([1, 2, 3, 4]));
    let downloads = 0;
    const seen: { args: string[]; env: NodeJS.ProcessEnv }[] = [];
    const svc = new YtDlpService({
      dataDir: dir,
      jsRuntimePath: 'C:\\app\\Voice Studio.exe',
      download: async (_url, dest) => {
        downloads++;
        writeFileSync(dest, 'exe');
        return dest;
      },
      run: async (_exe, args, env) => {
        seen.push({ args, env });
        return { stdout: `Song|||${audio}\n` };
      },
    });
    const r1 = await svc.fetchAudio('https://youtu.be/abc');
    const r2 = await svc.fetchAudio('https://youtu.be/def');
    expect(downloads).toBe(1);
    expect(r1.ok && r1.title).toBe('Song');
    expect(r1.ok && r1.ext).toBe('m4a');
    expect(r1.ok && new Uint8Array(r1.data)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(r2.ok).toBe(true);
    expect(seen[0]!.args).toContain('--no-playlist');
    expect(seen[0]!.args).toContain('node:C:\\app\\Voice Studio.exe');
    expect(seen[0]!.env.ELECTRON_RUN_AS_NODE).toBe('1');
  });

  it('refuses non-https input before doing anything', async () => {
    let touched = false;
    const svc = new YtDlpService({
      dataDir: dir,
      jsRuntimePath: 'x',
      download: async () => {
        touched = true;
        return '';
      },
      run: async () => {
        touched = true;
        return { stdout: '' };
      },
    });
    const r = await svc.fetchAudio('file:///etc/passwd');
    expect(r.ok).toBe(false);
    expect(touched).toBe(false);
  });

  it('reports downloader failures as an error result', async () => {
    writeFileSync(join(dir, 'unused'), '');
    const svc = new YtDlpService({
      dataDir: dir,
      jsRuntimePath: 'x',
      download: async (_u, dest) => {
        writeFileSync(dest, 'exe');
        return dest;
      },
      run: async () => {
        throw new Error('boom');
      },
    });
    const r = await svc.fetchAudio('https://youtu.be/x');
    expect(r).toEqual({ ok: false, error: 'boom' });
  });
});

describe('VB-CABLE installer', () => {
  it('picks the newest pack link from the vendor page', () => {
    const html = `<a href="https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack43.zip">old</a>
      <a href="https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip">new</a>`;
    expect(findLatestPackUrl(html)).toMatch(/Pack45\.zip$/);
    expect(findLatestPackUrl('<html></html>')).toBeNull();
  });

  it('trusts only a valid signature by the author', () => {
    expect(isTrustedSignature('Valid|CN=BUREL VINCENT Entrepreneur individuel, O=BUREL VINCENT')).toBe(true);
    expect(isTrustedSignature('NotSigned|')).toBe(false);
    expect(isTrustedSignature('Valid|CN=Some Other Vendor')).toBe(false);
  });

  const deps = (over: Partial<ConstructorParameters<typeof VbCableInstaller>[0]> = {}) => {
    const commands: string[] = [];
    const downloads: string[] = [];
    return {
      commands,
      downloads,
      options: {
        getText: async () =>
          '<a href="https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack46.zip">x</a>',
        download: async (url: string, dest: string) => {
          downloads.push(url);
          return dest;
        },
        powershell: async (c: string) => {
          commands.push(c);
          return c.includes('Get-AuthenticodeSignature') ? 'Valid|CN=BUREL VINCENT' : '';
        },
        makeTempDir: () => 'C:\\tmp\\vb',
        fileExists: () => true,
        ...over,
      },
    };
  };

  it('downloads, verifies, then starts the vendor setup elevated', async () => {
    const d = deps();
    const result = await new VbCableInstaller(d.options).install();
    expect(result).toEqual({ ok: true });
    expect(d.downloads[0]).toMatch(/Pack46\.zip$/);
    expect(d.commands.some((c) => c.includes('Expand-Archive'))).toBe(true);
    expect(d.commands.at(-1)).toMatch(/Start-Process .*-Verb RunAs/);
  });

  it('uses the pinned link when the vendor page cannot be read', async () => {
    const d = deps({
      getText: async () => {
        throw new Error('offline');
      },
    });
    await new VbCableInstaller(d.options).install();
    expect(d.downloads[0]).toBe(VBCABLE_FALLBACK);
  });

  it('refuses to run an installer with an untrusted signature', async () => {
    const d = deps({
      powershell: async (c: string) => (c.includes('Get-AuthenticodeSignature') ? 'HashMismatch|' : ''),
    });
    const result = await new VbCableInstaller(d.options).install();
    expect(result.ok).toBe(false);
  });

  it('fails cleanly when the package has no setup file', async () => {
    const d = deps({ fileExists: () => false });
    const result = await new VbCableInstaller(d.options).install();
    expect(result.ok).toBe(false);
  });
});

describe('psQuote', () => {
  it('escapes single quotes', () => {
    expect(psQuote("C:\\Users\\O'Neil\\a.zip")).toBe("'C:\\Users\\O''Neil\\a.zip'");
  });
});

describe('UpdateService', () => {
  const fakeUpdater = (): AutoUpdaterLike & {
    fire(event: string, payload?: unknown): void;
    calls: string[];
  } => {
    const handlers = new Map<string, (p?: never) => void>();
    const calls: string[] = [];
    return {
      autoDownload: true,
      autoInstallOnAppQuit: true,
      calls,
      on(event, listener) {
        handlers.set(event, listener as (p?: never) => void);
        return this;
      },
      fire(event, payload) {
        handlers.get(event)?.(payload as never);
      },
      checkForUpdates: async () => {
        calls.push('check');
      },
      downloadUpdate: async () => {
        calls.push('download');
      },
      quitAndInstall: () => {
        calls.push('install');
      },
    };
  };
  const sink = () => {
    const events: string[] = [];
    const s: UpdateSink = {
      available: (i) => events.push(`available:${i.version}:${i.notes}`),
      none: () => events.push('none'),
      progress: (p) => events.push(`progress:${p}`),
      downloaded: () => events.push('downloaded'),
      error: (m) => events.push(`error:${m}`),
    };
    return { s, events };
  };

  it('is disabled without an updater (development)', async () => {
    const { s } = sink();
    const svc = new UpdateService(null, s);
    expect(svc.enabled).toBe(false);
    expect((await svc.check()).ok).toBe(false);
    expect((await svc.download()).ok).toBe(false);
  });

  it('configures manual download and translates events', () => {
    const u = fakeUpdater();
    const { s, events } = sink();
    new UpdateService(u, s, 0);
    expect(u.autoDownload).toBe(false);
    expect(u.autoInstallOnAppQuit).toBe(false);
    u.fire('update-available', { version: '1.3.0', releaseNotes: '<p>Faster <b>voices</b></p>' });
    u.fire('download-progress', { percent: 41.6 });
    u.fire('update-not-available');
    u.fire('error', new Error('network down'));
    expect(events).toEqual(['available:1.3.0:Faster voices', 'progress:42', 'none', 'error:network down']);
  });

  it('installs silently shortly after the download completes', async () => {
    vi.useFakeTimers();
    const u = fakeUpdater();
    const { s, events } = sink();
    new UpdateService(u, s, 100);
    u.fire('update-downloaded');
    expect(events).toContain('downloaded');
    expect(u.calls).not.toContain('install');
    vi.advanceTimersByTime(150);
    expect(u.calls).toContain('install');
    vi.useRealTimers();
  });

  it('check and download delegate to the updater', async () => {
    const u = fakeUpdater();
    const svc = new UpdateService(u, sink().s);
    expect((await svc.check()).ok).toBe(true);
    expect((await svc.download()).ok).toBe(true);
    expect(u.calls).toEqual(['check', 'download']);
  });

  it('plainReleaseNotes handles strings, arrays and junk', () => {
    expect(plainReleaseNotes('<h1>Hi</h1>')).toBe('Hi');
    expect(plainReleaseNotes([{ note: 'a' }, { note: '<i>b</i>' }])).toBe('a\nb');
    expect(plainReleaseNotes(null)).toBe('');
  });
});
