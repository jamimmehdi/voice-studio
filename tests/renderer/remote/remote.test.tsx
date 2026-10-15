import { act, fireEvent, render, screen } from '@testing-library/react';
import { RemoteApp } from '@renderer/remote/RemoteApp';
import { socketUrl } from '@renderer/remote/use-remote';
import type { QuickState } from '@shared/protocols';

class FakeSocket {
  static instances: FakeSocket[] = [];
  static OPEN = 1;
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  push(state: QuickState): void {
    this.onmessage?.({ data: JSON.stringify({ type: 'state', state }) });
  }
}

const state = (over: Partial<QuickState> = {}): QuickState => ({
  running: true,
  preset: 'Robot',
  chips: [
    { key: 'Robot', label: 'Robot' },
    { key: 'Giant / Monster', label: 'Giant' },
  ],
  presets: [
    { key: 'Robot', label: 'Robot', user: false },
    { key: 'Giant / Monster', label: 'Giant', user: false },
    { key: 'Clean mic (no voice change)', label: 'Clean mic', user: false },
    { key: 'Anime girl', label: 'Anime girl', user: true },
  ],
  pitch: 2,
  formant: -1,
  monitor: false,
  bypass: false,
  gate: true,
  level: 0,
  stats: '43 ms · 0 dropouts',
  music: { has: false, title: '', playing: false, progress: 0 },
  sounds: [{ id: 'abc', name: 'Horn' }],
  muted: false,
  ...over,
});

beforeEach(() => {
  FakeSocket.instances = [];
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = FakeSocket;
  window.history.pushState({}, '', '/?t=secret');
});

describe('socketUrl', () => {
  it('uses the same host and carries the token', () => {
    expect(socketUrl({ protocol: 'http:', host: '192.168.1.20:7777', search: '?t=a b' })).toBe(
      'ws://192.168.1.20:7777/ws?t=a%20b',
    );
    expect(socketUrl({ protocol: 'https:', host: 'x', search: '' })).toBe('wss://x/ws?t=');
  });
});

describe('RemoteApp (phone page)', () => {
  it('waits for the PC, then shows the controls once a state arrives', () => {
    render(<RemoteApp />);
    expect(screen.getByText(/Waiting for Voice Studio/)).toBeInTheDocument();
    const socket = FakeSocket.instances[0]!;
    expect(socket.url).toContain('/ws?t=secret');
    act(() => {
      socket.open();
      socket.push(state());
    });
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Robot' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('connected')).toBeInTheDocument();
  });

  it('lists every preset: built-in voices, then my voices', () => {
    render(<RemoteApp />);
    const socket = FakeSocket.instances[0]!;
    act(() => {
      socket.open();
      socket.push(state());
    });
    expect(screen.getByRole('button', { name: 'Clean mic' })).toBeInTheDocument();
    const mine = screen.getByRole('region', { name: 'My voices' });
    expect(mine).toHaveTextContent('Anime girl');
    fireEvent.click(screen.getByRole('button', { name: 'Anime girl' }));
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({ type: 'preset', name: 'Anime girl' });
  });

  it('falls back to the short list when the PC sends no presets', () => {
    render(<RemoteApp />);
    const socket = FakeSocket.instances[0]!;
    act(() => {
      socket.open();
      socket.push(state({ presets: [] }));
    });
    expect(screen.getByRole('button', { name: 'Giant' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'My voices' })).toBeNull();
  });

  it('sends commands for voices, switches and sounds', () => {
    render(<RemoteApp />);
    const socket = FakeSocket.instances[0]!;
    act(() => {
      socket.open();
      socket.push(state());
    });
    fireEvent.click(screen.getByRole('button', { name: 'Giant' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mute' }));
    fireEvent.click(screen.getByRole('button', { name: 'Bypass' }));
    fireEvent.click(screen.getByRole('button', { name: 'Horn' }));
    fireEvent.click(screen.getByRole('button', { name: /Engine is live/ }));
    expect(socket.sent.map((s) => JSON.parse(s))).toEqual([
      { type: 'preset', name: 'Giant / Monster' },
      { type: 'mute' },
      { type: 'bypass' },
      { type: 'sound', id: 'abc' },
      { type: 'toggleEngine' },
    ]);
  });

  it('sliders send a throttled voice update', () => {
    vi.useFakeTimers();
    render(<RemoteApp />);
    const socket = FakeSocket.instances[0]!;
    act(() => {
      socket.open();
      socket.push(state());
    });
    const pitch = screen.getByRole('slider', { name: 'Pitch' });
    fireEvent.change(pitch, { target: { value: '5' } });
    fireEvent.change(pitch, { target: { value: '6' } });
    expect(socket.sent).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(80);
    });
    expect(socket.sent.map((s) => JSON.parse(s))).toEqual([{ type: 'voice', pitch: 6 }]);
    vi.useRealTimers();
  });

  it('hides the sound row without sounds and disables controls while disconnected', () => {
    render(<RemoteApp />);
    const socket = FakeSocket.instances[0]!;
    act(() => {
      socket.open();
      socket.push(state({ sounds: [], running: false }));
    });
    expect(screen.queryByRole('region', { name: 'Sounds' })).toBeNull();
    expect(screen.getByText('OFFLINE')).toBeInTheDocument();

    act(() => {
      socket.readyState = 3;
      socket.onclose?.({ code: 1006 });
    });
    expect(screen.getByText('reconnecting…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Robot' })).toBeDisabled();
  });

  it('explains a replaced pairing code', () => {
    render(<RemoteApp />);
    const socket = FakeSocket.instances[0]!;
    act(() => {
      socket.onclose?.({ code: 4001 });
    });
    expect(screen.getByText(/no longer valid/)).toBeInTheDocument();
  });
});
