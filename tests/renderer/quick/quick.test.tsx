import { act, fireEvent, render, screen } from '@testing-library/react';
import type { QuickApi } from '@shared/ipc';
import type { QuickCommand, QuickState } from '@shared/protocols';
import { IconApp } from '@renderer/icon/IconApp';
import { QuickApp, EMPTY_QUICK_STATE } from '@renderer/quick/QuickApp';

const state = (over: Partial<QuickState> = {}): QuickState => ({
  ...EMPTY_QUICK_STATE,
  chips: [
    { key: 'Female – Natural', label: 'Female – Natural' },
    { key: 'Robot', label: 'Robot' },
  ],
  ...over,
});

function fakeQuickApi(): QuickApi & {
  push(s: QuickState): void;
  sent: QuickCommand[];
  drags: Array<[number, number]>;
  dragEnds: number;
} {
  let listener: ((s: QuickState) => void) | null = null;
  const api = {
    sent: [] as QuickCommand[],
    drags: [] as Array<[number, number]>,
    dragEnds: 0,
    send: (c: QuickCommand) => {
      api.sent.push(c);
    },
    onState: (cb: (s: QuickState) => void) => {
      listener = cb;
      return () => {
        listener = null;
      };
    },
    iconDrag: (dx: number, dy: number) => {
      api.drags.push([dx, dy]);
    },
    iconDragEnd: () => {
      api.dragEnds++;
    },
    push: (s: QuickState) => act(() => listener?.(s)),
  };
  return api;
}

describe('QuickApp (compact panel)', () => {
  it('shows OFFLINE until the engine reports in, then LIVE with stats and the preset', () => {
    const api = fakeQuickApi();
    render(<QuickApp api={api} />);
    expect(screen.getByText('OFFLINE')).toBeInTheDocument();

    api.push(state({ running: true, preset: 'Robot', stats: '43 ms · 0 dropouts' }));
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('43 ms · 0 dropouts')).toBeInTheDocument();
    expect(screen.getAllByText('Robot').length).toBeGreaterThan(0);
  });

  it('the big button toggles the engine', () => {
    const api = fakeQuickApi();
    render(<QuickApp api={api} />);
    fireEvent.click(screen.getByRole('button', { name: /Engine is off/ }));
    expect(api.sent).toEqual([{ type: 'toggleEngine' }]);
  });

  it('voice chips pick a preset and highlight the active one', () => {
    const api = fakeQuickApi();
    render(<QuickApp api={api} />);
    api.push(state({ preset: 'Robot' }));
    expect(screen.getByRole('button', { name: 'Robot' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Female – Natural' }));
    expect(api.sent).toContainEqual({ type: 'preset', name: 'Female – Natural' });
  });

  it('sliders send voice commands and reset on double click', () => {
    const api = fakeQuickApi();
    render(<QuickApp api={api} />);
    api.push(state({ pitch: 4.5, formant: 2.8 }));
    const pitch = screen.getByRole('slider', { name: 'Pitch' }) as HTMLInputElement;
    expect(pitch.value).toBe('4.5');
    fireEvent.change(pitch, { target: { value: '7' } });
    expect(api.sent.at(-1)).toEqual({ type: 'voice', pitch: 7 });
    fireEvent.change(screen.getByRole('slider', { name: 'Formant' }), { target: { value: '-3' } });
    expect(api.sent.at(-1)).toEqual({ type: 'voice', formant: -3 });
    fireEvent.doubleClick(pitch);
    expect(api.sent.at(-1)).toEqual({ type: 'voice', pitch: 0 });
  });

  it('toggles send monitor / bypass / gate', () => {
    const api = fakeQuickApi();
    render(<QuickApp api={api} />);
    api.push(state({ gate: true }));
    fireEvent.click(screen.getByRole('button', { name: /Hear myself/ }));
    fireEvent.click(screen.getByRole('button', { name: /Bypass/ }));
    fireEvent.click(screen.getByRole('button', { name: /Noise gate/ }));
    expect(api.sent.map((c) => c.type)).toEqual(['monitor', 'bypass', 'gate']);
    expect(screen.getByRole('button', { name: /Noise gate/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('the mini player needs a track and a running engine', () => {
    const api = fakeQuickApi();
    render(<QuickApp api={api} />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    api.push(
      state({ running: true, music: { has: true, title: 'Night Drive', playing: false, progress: 0.4 } }),
    );
    const play = screen.getByRole('button', { name: 'Play' });
    expect(play).toBeEnabled();
    expect(screen.getByText('Night Drive')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    fireEvent.click(play);
    expect(api.sent.at(-1)).toEqual({ type: 'music' });
  });

  it('header buttons manage the window', () => {
    const api = fakeQuickApi();
    render(<QuickApp api={api} />);
    fireEvent.click(screen.getByRole('button', { name: /Full studio/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Shrink to a floating icon' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hide' }));
    expect(api.sent.map((c) => c.type)).toEqual(['openStudio', 'minimizeToIcon', 'hideCompact']);
  });

  it('level meter reflects the mic', () => {
    const api = fakeQuickApi();
    render(<QuickApp api={api} />);
    api.push(state({ running: true, level: 0.62 }));
    expect(screen.getByRole('meter', { name: 'Microphone level' })).toHaveAttribute('aria-valuenow', '0.62');
  });
});

describe('IconApp (floating icon)', () => {
  it('a click opens the compact panel', () => {
    const api = fakeQuickApi();
    render(<IconApp api={api} />);
    const orb = screen.getByRole('button', { name: 'Open the compact panel' });
    fireEvent.pointerDown(orb, { screenX: 100, screenY: 100, pointerId: 1 });
    fireEvent.pointerUp(orb, { pointerId: 1 });
    expect(api.sent).toEqual([{ type: 'openCompact' }]);
    expect(api.dragEnds).toBe(0);
  });

  it('a drag moves the icon and does not open the panel', () => {
    const api = fakeQuickApi();
    render(<IconApp api={api} />);
    const orb = screen.getByRole('button', { name: 'Open the compact panel' });
    fireEvent.pointerDown(orb, { screenX: 100, screenY: 100, pointerId: 1 });
    fireEvent.pointerMove(orb, { screenX: 130, screenY: 90, pointerId: 1 });
    fireEvent.pointerMove(orb, { screenX: 150, screenY: 90, pointerId: 1 });
    fireEvent.pointerUp(orb, { pointerId: 1 });
    expect(api.drags).toEqual([
      [30, -10],
      [20, 0],
    ]);
    expect(api.dragEnds).toBe(1);
    expect(api.sent).toEqual([]);
  });

  it('a few pixels of jitter still count as a click', () => {
    const api = fakeQuickApi();
    render(<IconApp api={api} />);
    const orb = screen.getByRole('button', { name: 'Open the compact panel' });
    fireEvent.pointerDown(orb, { screenX: 100, screenY: 100, pointerId: 1 });
    fireEvent.pointerMove(orb, { screenX: 101, screenY: 102, pointerId: 1 });
    fireEvent.pointerUp(orb, { pointerId: 1 });
    expect(api.sent).toEqual([{ type: 'openCompact' }]);
  });

  it('is operable from the keyboard', () => {
    const api = fakeQuickApi();
    render(<IconApp api={api} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' });
    expect(api.sent).toEqual([{ type: 'openCompact' }]);
  });
});
