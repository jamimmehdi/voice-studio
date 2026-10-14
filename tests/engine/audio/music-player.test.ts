import { MusicPlayer, isAudioFile, mimeForExtension, trackNameFromFile } from '@engine/audio/music-player';
import { RingModulator } from '@engine/dsp/ring-modulator';
import { FS, rms, sine } from '../../helpers/signals';

/** Just enough of HTMLAudioElement for the player. */
class FakeElement extends EventTarget {
  src = '';
  paused = true;
  currentTime = 0;
  duration = Number.NaN;
  play = vi.fn(async () => {
    this.paused = false;
    this.dispatchEvent(new Event('play'));
  });
  pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event('pause'));
  });
  removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = '';
  });
}

const make = (): { player: MusicPlayer; el: FakeElement } => {
  const player = new MusicPlayer();
  const el = new FakeElement();
  return { player, el };
};

const file = (name: string, type = ''): File => new File([new Uint8Array(4)], name, { type });

beforeEach(() => {
  let n = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:track-${++n}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('helpers', () => {
  it('recognises audio files by MIME type or extension', () => {
    expect(isAudioFile({ name: 'a.bin', type: 'audio/mpeg' })).toBe(true);
    expect(isAudioFile({ name: 'song.FLAC', type: '' })).toBe(true);
    expect(isAudioFile({ name: 'notes.txt', type: 'text/plain' })).toBe(false);
  });
  it('strips the extension and maps MIME types', () => {
    expect(trackNameFromFile('Artist - Song.v2.mp3')).toBe('Artist - Song.v2');
    expect(mimeForExtension('m4a')).toBe('audio/mp4');
    expect(mimeForExtension('webm')).toBe('audio/webm');
    expect(mimeForExtension('mp3')).toBe('audio/mp3');
  });
});

describe('MusicPlayer', () => {
  it('adds only audio files and reports how many', () => {
    const { player } = make();
    expect(player.addFiles([file('a.mp3', 'audio/mpeg'), file('readme.txt'), file('b.wav')])).toBe(2);
    expect(player.playlist.items.map((t) => t.name)).toEqual(['a', 'b']);
    expect(player.snapshot.trackCount).toBe(2);
    expect(player.snapshot.title).toBe('a');
  });

  it('cannot play until the engine provides the element', () => {
    const { player } = make();
    player.addFiles([file('a.mp3', 'audio/mpeg')]);
    expect(player.toggle()).toBe(false);
    expect(player.snapshot.hasElement).toBe(false);
  });

  it('attach loads the current track and toggle plays / pauses', async () => {
    const { player, el } = make();
    player.addFiles([file('a.mp3', 'audio/mpeg')]);
    player.attach(el as unknown as HTMLAudioElement);
    expect(el.src).toBe('blob:track-1');

    expect(player.toggle()).toBe(true);
    expect(el.play).toHaveBeenCalled();
    expect(player.snapshot.playing).toBe(true);
    player.toggle();
    expect(el.pause).toHaveBeenCalled();
    expect(player.snapshot.playing).toBe(false);
  });

  it('emits change events for element activity and stops after detach', () => {
    const { player, el } = make();
    player.attach(el as unknown as HTMLAudioElement);
    const spy = vi.fn();
    player.events.on('change', spy);
    el.dispatchEvent(new Event('timeupdate'));
    expect(spy).toHaveBeenCalled();
    player.detach();
    spy.mockClear();
    el.dispatchEvent(new Event('timeupdate'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('progress reflects position and duration; seek jumps', () => {
    const { player, el } = make();
    player.attach(el as unknown as HTMLAudioElement);
    el.duration = 200;
    el.currentTime = 50;
    expect(player.snapshot.progress).toBe(0.25);
    player.seek(0.5);
    expect(el.currentTime).toBe(100);
    player.seek(5); // clamped
    expect(el.currentTime).toBe(200);
  });

  it('next / previous / auto-advance respect loop', () => {
    const { player, el } = make();
    player.addFiles([file('a.mp3', 'audio/mpeg'), file('b.mp3', 'audio/mpeg')]);
    player.attach(el as unknown as HTMLAudioElement);

    player.next();
    expect(player.playlist.currentTrack?.name).toBe('b');
    expect(el.src).toBe('blob:track-2');

    // end of the list, loop off: playback just stops
    el.dispatchEvent(new Event('ended'));
    expect(player.playlist.currentTrack?.name).toBe('b');

    player.loop = true;
    el.dispatchEvent(new Event('ended'));
    expect(player.playlist.currentTrack?.name).toBe('a');

    player.previous(); // wraps to the last track
    expect(player.playlist.currentTrack?.name).toBe('b');
  });

  it('previous restarts the track when more than 3 s in', () => {
    const { player, el } = make();
    player.addFiles([file('a.mp3', 'audio/mpeg'), file('b.mp3', 'audio/mpeg')]);
    player.attach(el as unknown as HTMLAudioElement);
    player.select(1, false);
    el.currentTime = 10;
    player.previous();
    expect(el.currentTime).toBe(0);
    expect(player.playlist.currentTrack?.name).toBe('b');
  });

  it('removing the playing track moves on and revokes its URL', () => {
    const { player, el } = make();
    player.addFiles([file('a.mp3', 'audio/mpeg'), file('b.mp3', 'audio/mpeg')]);
    player.attach(el as unknown as HTMLAudioElement);
    player.remove(0);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:track-1');
    expect(player.playlist.currentTrack?.name).toBe('b');
    expect(el.src).toBe('blob:track-2');
    expect(el.pause).toHaveBeenCalled();
  });

  it('clear empties the list, pauses and unloads', () => {
    const { player, el } = make();
    player.addFiles([file('a.mp3', 'audio/mpeg')]);
    player.attach(el as unknown as HTMLAudioElement);
    player.clear();
    expect(player.snapshot.trackCount).toBe(0);
    expect(el.src).toBe('');
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('addBuffer (downloaded link) creates a playable track', () => {
    const { player, el } = make();
    player.attach(el as unknown as HTMLAudioElement);
    player.addBuffer('Song', new ArrayBuffer(8), 'audio/mp4');
    expect(player.snapshot.title).toBe('Song');
    expect(el.src).toBe('blob:track-1');
  });
});

describe('RingModulator', () => {
  it('a 100 % mix modulates the amplitude with a sine carrier', () => {
    const ring = new RingModulator(FS);
    ring.set(100, 100);
    const input = sine(1000, 0.5, 0.5);
    const out = input.map((x) => ring.process(x));
    // x * sin(...) has about 1/sqrt(2) of the RMS of x
    expect(rms(out, 4800) / rms(input, 4800)).toBeCloseTo(Math.SQRT1_2, 1);
  });

  it('a 0 % mix is the dry signal', () => {
    const ring = new RingModulator(FS);
    ring.set(100, 0);
    expect(ring.process(0.3)).toBeCloseTo(0.3, 9);
  });
});
