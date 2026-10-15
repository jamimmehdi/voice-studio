import { act, fireEvent, render, screen } from '@testing-library/react';
import { drawScope, type ScopeFrame } from '@renderer/studio/components/LiveOutput/scope-draw';
import { LiveOutput } from '@renderer/studio/components/LiveOutput/LiveOutput';
import { GainReadout } from '@renderer/studio/components/Levels/GainReadout';
import { createRuntime } from '@renderer/studio/runtime/runtime';
import { useEngineStats, useMusic, usePlaylist, RuntimeProvider } from '@renderer/studio/runtime/react';
import { MemoryStorage } from '@renderer/studio/store/persistence';
import { AudioEngine } from '@engine/audio/audio-engine';
import { MusicPlayer } from '@engine/audio/music-player';
import { fakeApi } from '../../helpers/fakes';
import { mockRect, renderWithRuntime } from '../../helpers/render';

/** A recording 2D context: lets us assert what was drawn without a real canvas. */
function recordingContext(): CanvasRenderingContext2D & { calls: string[] } {
  const calls: string[] = [];
  const handler: ProxyHandler<object> = {
    get(target, prop: string) {
      if (prop === 'calls') return calls;
      if (prop === 'createLinearGradient') return () => ({ addColorStop: () => undefined });
      if (prop in target) return (target as Record<string, unknown>)[prop];
      return (...args: unknown[]) => {
        calls.push(`${prop}(${args.length})`);
      };
    },
    set(target, prop: string, value: unknown) {
      (target as Record<string, unknown>)[prop] = value;
      return true;
    },
  };
  return new Proxy({}, handler) as unknown as CanvasRenderingContext2D & { calls: string[] };
}

describe('drawScope', () => {
  const frame = (over: Partial<ScopeFrame> = {}): ScopeFrame => ({
    width: 266,
    height: 130,
    bars: [0.1, 0.5, 0.9],
    curveY: [65, 60, 55],
    handles: [
      { x: 50, y: 40, index: 0, active: true },
      { x: 120, y: 70, index: 1, active: false },
    ],
    showHandles: false,
    ...over,
  });

  it('draws the centre line, one bar per level and the curve', () => {
    const ctx = recordingContext();
    drawScope(ctx, frame());
    expect(ctx.calls.filter((c) => c.startsWith('fill(')).length).toBe(3);
    expect(ctx.calls).toContain('clearRect(4)');
    expect(ctx.calls.filter((c) => c.startsWith('stroke(')).length).toBe(2); // centre line + curve
  });

  it('draws the numbered band handles only when asked', () => {
    const hidden = recordingContext();
    drawScope(hidden, frame({ showHandles: false }));
    const shown = recordingContext();
    drawScope(shown, frame({ showHandles: true }));
    expect(hidden.calls.filter((c) => c.startsWith('fillText'))).toHaveLength(0);
    expect(shown.calls.filter((c) => c.startsWith('fillText'))).toHaveLength(2);
    expect(shown.calls.filter((c) => c.startsWith('arc('))).toHaveLength(2);
  });
});

describe('LiveOutput', () => {
  it('drags an EQ band handle: frequency from x, gain from y', () => {
    const { store } = renderWithRuntime(<LiveOutput />);
    const canvas = screen.getByTestId('scope');
    mockRect(canvas, { width: 1000, height: 200 });
    // band 3 (index 2) sits at 1 kHz, 0 dB -> x = log(1000/20)/log(1000) * 1000 = 566, y = 100
    fireEvent.pointerDown(canvas, { clientX: 566, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 700, clientY: 50, pointerId: 1 });
    const band = store.getState().params.eq.bands[2];
    expect(band.freq).toBeGreaterThan(1500);
    expect(band.gain).toBeCloseTo(11, 1); // y = 50 of 200: halfway up = +11 dB (the graph spans ±22 dB)
    fireEvent.pointerUp(canvas, { pointerId: 1 });

    const before = store.getState().params.eq.bands[2].freq;
    fireEvent.pointerMove(canvas, { clientX: 100, clientY: 10, pointerId: 1 });
    expect(store.getState().params.eq.bands[2].freq).toBe(before); // no drag in progress
  });

  it('clamps gain to ±18 dB and frequency to the audible range', () => {
    const { store } = renderWithRuntime(<LiveOutput />);
    const canvas = screen.getByTestId('scope');
    mockRect(canvas, { width: 1000, height: 200 });
    fireEvent.pointerDown(canvas, { clientX: 566, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 5000, clientY: -500, pointerId: 1 });
    const band = store.getState().params.eq.bands[2];
    expect(band.freq).toBeLessThanOrEqual(20000);
    expect(band.gain).toBe(18);
  });

  it('double click on a handle resets its gain; clicking empty space does nothing', () => {
    const { store } = renderWithRuntime(<LiveOutput />);
    act(() => store.getState().setEqBand(2, { gain: 6 }));
    const canvas = screen.getByTestId('scope');
    mockRect(canvas, { width: 1000, height: 200 });
    const y = 100 - (6 / 22) * 100; // gain 6 dB
    fireEvent.doubleClick(canvas, { clientX: 566, clientY: y });
    expect(store.getState().params.eq.bands[2].gain).toBe(0);

    act(() => store.getState().setEqBand(2, { gain: 6 }));
    fireEvent.doubleClick(canvas, { clientX: 10, clientY: 10 });
    expect(store.getState().params.eq.bands[2].gain).toBe(6);
  });

  it('wheel over a handle changes its Q (and over nothing does not)', () => {
    const { store } = renderWithRuntime(<LiveOutput />);
    const canvas = screen.getByTestId('scope');
    mockRect(canvas, { width: 1000, height: 200 });
    fireEvent.wheel(canvas, { clientX: 566, clientY: 100, deltaY: -100 });
    expect(store.getState().params.eq.bands[2].q).toBeCloseTo(1.1, 3);
    fireEvent.wheel(canvas, { clientX: 10, clientY: 10, deltaY: -100 });
    expect(store.getState().params.eq.bands[2].q).toBeCloseTo(1.1, 3);
  });
});

describe('GainReadout', () => {
  it('drag changes the gain in 0.25 dB per pixel and the wheel in 0.5 dB steps', () => {
    const { store } = renderWithRuntime(<GainReadout which="outGain" label="Output gain" />);
    const el = screen.getByRole('slider', { name: 'Output gain' });
    fireEvent.pointerDown(el, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(el, { clientY: 60, pointerId: 1 }); // 40 px up
    expect(store.getState().params.outGain).toBe(10);
    fireEvent.pointerUp(el, { pointerId: 1 });
    act(() => el.focus());
    fireEvent.wheel(el, { deltaY: 100 });
    expect(store.getState().params.outGain).toBe(9.5);
    fireEvent.keyDown(el, { key: 'ArrowDown' });
    expect(store.getState().params.outGain).toBe(9);
  });

  it('never leaves ±24 dB', () => {
    const { store } = renderWithRuntime(<GainReadout which="inGain" label="Input gain" />);
    const el = screen.getByRole('slider', { name: 'Input gain' });
    fireEvent.pointerDown(el, { clientY: 500, pointerId: 1 });
    fireEvent.pointerMove(el, { clientY: -500, pointerId: 1 });
    expect(store.getState().params.inGain).toBe(24);
  });
});

describe('createRuntime', () => {
  it('builds the object graph and wires store -> engine', () => {
    const storage = new MemoryStorage();
    const api = fakeApi();
    const engine = new AudioEngine();
    const setParams = vi.spyOn(engine, 'setParams');
    const runtime = createRuntime({ api, storage, engine, player: new MusicPlayer() });

    runtime.store.getState().patchVoice({ pitch: 3 });
    expect(setParams).toHaveBeenCalled();
    expect(runtime.controller).toBeDefined();
    runtime.dispose();
    setParams.mockClear();
    runtime.store.getState().patchVoice({ pitch: 4 });
    expect(setParams).not.toHaveBeenCalled();
  });

  it('seeds the store from storage and persists changes on dispose', () => {
    const storage = new MemoryStorage();
    const first = createRuntime({
      api: fakeApi(),
      storage,
      engine: new AudioEngine(),
      player: new MusicPlayer(),
    });
    first.store.getState().patchVoice({ pitch: 8 });
    first.dispose(); // flushes

    const second = createRuntime({
      api: fakeApi(),
      storage,
      engine: new AudioEngine(),
      player: new MusicPlayer(),
    });
    expect(second.store.getState().params.voice.pitch).toBe(8);
    second.dispose();
  });

  it('mirrors music bus changes onto the player', () => {
    const player = new MusicPlayer();
    const attach = vi.spyOn(player, 'attach');
    const detach = vi.spyOn(player, 'detach');
    const engine = new AudioEngine();
    const runtime = createRuntime({ api: fakeApi(), storage: new MemoryStorage(), engine, player });
    const element = document.createElement('audio');
    engine.events.emit('musicBus', { element } as never);
    engine.events.emit('musicBus', null);
    expect(attach).toHaveBeenCalledWith(element);
    expect(detach).toHaveBeenCalled();
    runtime.dispose();
  });
});

describe('runtime hooks', () => {
  function Probe(): React.ReactElement {
    const music = useMusic();
    const list = usePlaylist();
    const stats = useEngineStats();
    return (
      <div>
        <span data-testid="count">{music.trackCount}</span>
        <span data-testid="names">{list.names.join(',')}</span>
        <span data-testid="latency">{stats.latencyMs}</span>
      </div>
    );
  }

  it('re-render when the player or the engine stats change', () => {
    vi.useFakeTimers();
    const player = new MusicPlayer();
    const engine = new AudioEngine();
    const runtime = createRuntime({ api: fakeApi(), storage: new MemoryStorage(), engine, player });
    render(
      <RuntimeProvider runtime={runtime}>
        <Probe />
      </RuntimeProvider>,
    );
    expect(screen.getByTestId('count')).toHaveTextContent('0');

    act(() => {
      player.playlist.add('Night Drive', 'blob:a');
      player.events.emit('change', undefined);
    });
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(screen.getByTestId('names')).toHaveTextContent('Night Drive');

    vi.spyOn(engine, 'latencyMs', 'get').mockReturnValue(61);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByTestId('latency')).toHaveTextContent('61');

    runtime.dispose();
    vi.useRealTimers();
  });
});
