import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SettingsStore, nodeFileIo, writeFileSafely, type FileIo } from '@main/settings-store';
import { MAX_BACKUP_BYTES, StateBackup } from '@main/state-backup';

/** An in-memory file system that can also simulate a crash in the middle of a write. */
function memoryIo(): FileIo & { files: Map<string, string>; crashOnWrite: string | null } {
  const files = new Map<string, string>();
  const io = {
    files,
    crashOnWrite: null as string | null,
    read: (p: string) => {
      const v = files.get(p);
      if (v === undefined) throw new Error('ENOENT');
      return v;
    },
    write: (p: string, d: string) => {
      if (io.crashOnWrite === p) {
        files.set(p, d.slice(0, Math.floor(d.length / 2))); // a truncated file
        throw new Error('crash');
      }
      files.set(p, d);
    },
    rename: (a: string, b: string) => {
      const v = files.get(a);
      if (v === undefined) throw new Error('ENOENT');
      files.set(b, v);
      files.delete(a);
    },
  };
  return io;
}

describe('writeFileSafely', () => {
  it('writes through a temporary file and keeps the previous good copy', () => {
    const io = memoryIo();
    writeFileSafely(io, 'a.json', '{"v":1}');
    expect([...io.files.keys()]).toEqual(['a.json']);
    writeFileSafely(io, 'a.json', '{"v":2}');
    expect(io.files.get('a.json')).toBe('{"v":2}');
    expect(io.files.get('a.json.bak')).toBe('{"v":1}');
    expect(io.files.has('a.json.tmp')).toBe(false);
  });

  it('does not keep a damaged file as the backup', () => {
    const io = memoryIo();
    io.files.set('a.json', '{ broken');
    io.files.set('a.json.bak', '{"v":0}');
    writeFileSafely(io, 'a.json', '{"v":1}');
    expect(io.files.get('a.json.bak')).toBe('{"v":0}');
  });

  it('a crash while writing leaves the real file intact', () => {
    const io = memoryIo();
    writeFileSafely(io, 'a.json', '{"v":1}');
    io.crashOnWrite = 'a.json.tmp';
    expect(() => writeFileSafely(io, 'a.json', '{"v":2,"long":"xxxxxxxxxxxx"}')).toThrow('crash');
    expect(JSON.parse(io.files.get('a.json')!)).toEqual({ v: 1 });
  });

  it('falls back to writing in place when the file system cannot rename', () => {
    const files = new Map<string, string>();
    const io: FileIo = {
      read: (p) => files.get(p) ?? '',
      write: (p, d) => void files.set(p, d),
    };
    writeFileSafely(io, 'a.json', '{"v":1}');
    expect(files.get('a.json')).toBe('{"v":1}');
  });
});

describe('SettingsStore recovery', () => {
  it('loads the backup when the settings file is damaged', () => {
    const io = memoryIo();
    const a = new SettingsStore('s.json', io);
    a.update({ shortcut: 'Control+Alt+B', remoteToken: 'tok' });
    a.update({ trayHintShown: true }); // the first save is now the .bak
    io.files.set('s.json', '{"shortcut": "Contr'); // power loss mid-write
    const b = new SettingsStore('s.json', io);
    expect(b.value.shortcut).toBe('Control+Alt+B');
    expect(b.value.remoteToken).toBe('tok');
  });

  it('falls back to the defaults only when both files are unusable', () => {
    const io = memoryIo();
    io.files.set('s.json', 'nope');
    io.files.set('s.json.bak', '[1,2,3]');
    expect(new SettingsStore('s.json', io).value.shortcut).toBe('Control+Alt+V');
  });

  it('works on a real folder, including the atomic rename', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vs-settings-'));
    try {
      const path = join(dir, 'settings.json');
      const a = new SettingsStore(path, nodeFileIo);
      a.update({ shortcut: 'Control+Alt+Q' });
      a.update({ shortcut: 'Control+Alt+W' });
      expect(JSON.parse(readFileSync(path, 'utf8')).shortcut).toBe('Control+Alt+W');
      expect(JSON.parse(readFileSync(`${path}.bak`, 'utf8')).shortcut).toBe('Control+Alt+Q');
      writeFileSync(path, '{ truncated');
      expect(new SettingsStore(path, nodeFileIo).value.shortcut).toBe('Control+Alt+Q');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('StateBackup', () => {
  const state = '{"state":{"v":2},"presets":{}}';

  it('stores and returns the last state', () => {
    const io = memoryIo();
    const b = new StateBackup('/data', io);
    expect(b.read()).toBeNull();
    expect(b.write(state)).toBe(true);
    expect(b.read()).toBe(state);
  });

  it('rejects things that are not a JSON object, or are too large', () => {
    const b = new StateBackup('/data', memoryIo());
    expect(b.write('nope')).toBe(false);
    expect(b.write('[1]')).toBe(false);
    expect(b.write('')).toBe(false);
    expect(b.write(42)).toBe(false);
    expect(b.write(JSON.stringify({ x: 'a'.repeat(MAX_BACKUP_BYTES) }))).toBe(false);
    expect(b.read()).toBeNull();
  });

  it('reads the previous generation when the newest file is damaged', () => {
    const io = memoryIo();
    const b = new StateBackup('/data', io);
    b.write('{"state":{"v":1},"presets":{}}');
    b.write('{"state":{"v":2},"presets":{}}');
    const path = [...io.files.keys()].find((k) => k.endsWith('studio-state.json'))!;
    io.files.set(path, '{"state":'); // damaged
    expect(JSON.parse(b.read()!).state.v).toBe(1);
  });
});
