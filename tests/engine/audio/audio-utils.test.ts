import { DuckController } from '@engine/audio/ducking';
import {
  findVirtualCable,
  isVirtualCableOutput,
  looksLikeCable,
  shortDeviceLabel,
  splitDevices,
} from '@engine/audio/devices';
import { Emitter } from '@engine/audio/emitter';
import { Playlist } from '@engine/audio/playlist';
import { encodeWav16Mono, recordingFileName } from '@engine/audio/wav';

describe('encodeWav16Mono', () => {
  const read = (buf: ArrayBuffer) => new DataView(buf);
  const text = (v: DataView, off: number, len: number): string =>
    Array.from({ length: len }, (_, i) => String.fromCharCode(v.getUint8(off + i))).join('');

  it('writes a valid RIFF/WAVE header', () => {
    const wav = encodeWav16Mono([new Float32Array(100)], 48000);
    const v = read(wav);
    expect(text(v, 0, 4)).toBe('RIFF');
    expect(text(v, 8, 4)).toBe('WAVE');
    expect(text(v, 12, 4)).toBe('fmt ');
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(28, true)).toBe(96000);
    expect(v.getUint16(34, true)).toBe(16);
    expect(text(v, 36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(200);
    expect(v.getUint32(4, true)).toBe(36 + 200);
    expect(wav.byteLength).toBe(44 + 200);
  });

  it('quantises and clamps samples across chunk boundaries', () => {
    const wav = encodeWav16Mono([Float32Array.from([0, 0.5]), Float32Array.from([-1, 2, -2])], 44100);
    const v = read(wav);
    expect(v.getInt16(44, true)).toBe(0);
    expect(v.getInt16(46, true)).toBe(16384);
    expect(v.getInt16(48, true)).toBe(-32767);
    expect(v.getInt16(50, true)).toBe(32767); // clamped
    expect(v.getInt16(52, true)).toBe(-32767); // clamped
  });

  it('handles an empty recording', () => {
    expect(encodeWav16Mono([], 48000).byteLength).toBe(44);
  });

  it('builds a filesystem-safe file name', () => {
    const name = recordingFileName(new Date('2026-10-14T10:20:30.456Z'));
    expect(name).toBe('voice-studio-2026-10-14T10-20-30.wav');
    expect(name).not.toMatch(/[:]/);
  });
});

describe('Playlist', () => {
  const make = (): Playlist => {
    const p = new Playlist();
    p.add('A', 'blob:a');
    p.add('B', 'blob:b');
    p.add('C', 'blob:c');
    return p;
  };

  it('selects the first track that is added', () => {
    const p = new Playlist();
    expect(p.currentTrack).toBeNull();
    p.add('A', 'blob:a');
    expect(p.index).toBe(0);
    expect(p.currentTrack?.name).toBe('A');
  });

  it('gives each track a unique id', () => {
    const ids = make().items.map((t) => t.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('next / previous wrap around and respect loop for automatic advance', () => {
    const p = make();
    p.select(2);
    expect(p.nextIndex(false, true)).toBeNull(); // end of list, no loop
    expect(p.nextIndex(true, true)).toBe(0);
    expect(p.nextIndex(false, false)).toBe(0); // manual "next" wraps
    p.select(0);
    expect(p.previousIndex()).toBe(2);
  });

  it('removing a track before the current one keeps the same track selected', () => {
    const p = make();
    p.select(2);
    p.remove(0);
    expect(p.currentTrack?.name).toBe('C');
    expect(p.index).toBe(1);
  });

  it('removing the current (last) track selects the new last one; emptying resets', () => {
    const p = make();
    p.select(2);
    const r = p.remove(2);
    expect(r?.wasCurrent).toBe(true);
    expect(p.currentTrack?.name).toBe('B');
    p.remove(0);
    p.remove(0);
    expect(p.index).toBe(-1);
    expect(p.nextIndex(true, false)).toBeNull();
  });

  it('clear returns the old tracks so their URLs can be revoked', () => {
    const p = make();
    expect(p.clear().map((t) => t.url)).toEqual(['blob:a', 'blob:b', 'blob:c']);
    expect(p.size).toBe(0);
  });

  it('ignores out-of-range selection and removal', () => {
    const p = make();
    expect(p.select(9)).toBeNull();
    expect(p.remove(9)).toBeNull();
  });
});

describe('DuckController', () => {
  it('ducks while the microphone is above the threshold and holds afterwards', () => {
    const d = new DuckController();
    expect(d.update(0.5, 1000).gain).toBe(0.3);
    expect(d.update(0.0, 1300).gain).toBe(0.3); // within the 450 ms hold
    expect(d.update(0.0, 1500).gain).toBe(1); // released
  });

  it('recovers slowly, ducks quickly', () => {
    const d = new DuckController();
    const down = d.update(0.5, 0);
    const up = d.update(0, 10000);
    expect(down.timeConstant).toBeLessThan(up.timeConstant);
  });

  it('does nothing when disabled or bypassed', () => {
    const d = new DuckController();
    d.configure({ enabled: false });
    expect(d.update(1, 0).gain).toBe(1);
    d.configure({ enabled: true });
    expect(d.update(1, 0, true).gain).toBe(1);
  });
});

describe('device helpers', () => {
  it('recognises virtual cables', () => {
    expect(isVirtualCableOutput('CABLE Input (VB-Audio Virtual Cable)')).toBe(true);
    expect(isVirtualCableOutput('Speakers (Realtek)')).toBe(false);
    expect(looksLikeCable('CABLE In 16ch (VB-Audio Virtual Cable)')).toBe(true);
  });

  it('prefers the 2-channel CABLE Input over the 16ch variant', () => {
    const found = findVirtualCable([
      { deviceId: '1', label: 'CABLE In 16ch (VB-Audio Virtual Cable)' },
      { deviceId: '2', label: 'CABLE Input (VB-Audio Virtual Cable)' },
    ]);
    expect(found?.deviceId).toBe('2');
  });

  it('returns undefined when no cable exists', () => {
    expect(findVirtualCable([{ deviceId: '1', label: 'Speakers' }])).toBeUndefined();
  });

  it('splits devices, hides synthetic entries and detects missing labels', () => {
    const info = (kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo =>
      ({ kind, deviceId, label, groupId: '', toJSON: () => ({}) }) as MediaDeviceInfo;
    const lists = splitDevices([
      info('audioinput', 'default', 'Default'),
      info('audioinput', 'mic1', 'Mic One'),
      info('audiooutput', 'communications', 'Comms'),
      info('audiooutput', 'out1', 'Speakers'),
      info('videoinput', 'cam', 'Camera'),
    ]);
    expect(lists.inputs).toEqual([{ deviceId: 'mic1', label: 'Mic One' }]);
    expect(lists.outputs).toEqual([{ deviceId: 'out1', label: 'Speakers' }]);
    expect(lists.hasLabels).toBe(true);
    expect(splitDevices([info('audioinput', 'x', '')]).hasLabels).toBe(false);
  });

  it('shortens device labels', () => {
    expect(shortDeviceLabel('Headset Microphone (Razer Audio Controller)')).toBe('Headset Microphone');
    expect(shortDeviceLabel('(only parens)')).toBe('(only parens)');
  });
});

describe('Emitter', () => {
  it('delivers payloads and supports unsubscribe', () => {
    const e = new Emitter<{ hello: string }>();
    const seen: string[] = [];
    const off = e.on('hello', (m) => seen.push(m));
    e.emit('hello', 'a');
    off();
    e.emit('hello', 'b');
    expect(seen).toEqual(['a']);
  });

  it('clear removes every listener', () => {
    const e = new Emitter<{ x: number }>();
    let count = 0;
    e.on('x', () => count++);
    e.clear();
    e.emit('x', 1);
    expect(count).toBe(0);
  });
});
