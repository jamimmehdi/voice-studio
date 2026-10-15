import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { StageEditor } from '@renderer/studio/components/Stages/StageEditor';
import { EngineHealth, timeAgo } from '@renderer/studio/components/Panels/EngineHealth';
import { Modals } from '@renderer/studio/components/Modals/Modals';
import { TopBar } from '@renderer/studio/components/TopBar/TopBar';
import { AcceleratorButton } from '@renderer/studio/components/Features/AcceleratorButton';
import { stageSummary } from '@renderer/studio/lib/stage-summary';
import { createDefaultParams } from '@shared/params';
import type { RemoteView } from '@shared/ipc';
import { exportVsp } from '@shared/vsp';
import { render } from '@testing-library/react';
import { renderWithRuntime } from '../../helpers/render';

function mockDevices(list: Array<{ kind: MediaDeviceKind; deviceId: string; label: string }>): void {
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    configurable: true,
    value: {
      enumerateDevices: async () => list.map((d) => ({ ...d, groupId: '', toJSON: () => ({}) })),
      getUserMedia: async () => ({ getTracks: () => [] }),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    },
  });
}

beforeEach(() => mockDevices([]));

describe('Noise removal stage', () => {
  it('level buttons set the amount and show which one is selected', () => {
    const { store } = renderWithRuntime(<StageEditor />, {
      persisted: { ...base(), stage: 'noise' },
    });
    expect(screen.getByRole('region', { name: 'Noise removal' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Strong' }));
    expect(store.getState().params.noise.amount).toBe(90);
    expect(screen.getByRole('button', { name: 'Strong' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('the amount slider moves the value and clears the level highlight', () => {
    const { store } = renderWithRuntime(<StageEditor />, { persisted: { ...base(), stage: 'noise' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Noise removal amount' }), {
      target: { value: '55' },
    });
    expect(store.getState().params.noise.amount).toBe(55);
    for (const name of ['Light', 'Medium', 'Strong']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
  });

  it('the header switch turns the stage on', () => {
    const { store } = renderWithRuntime(<StageEditor />, { persisted: { ...base(), stage: 'noise' } });
    expect(store.getState().params.noise.on).toBe(false);
    fireEvent.click(screen.getByRole('switch', { name: 'Noise removal on/off' }));
    expect(store.getState().params.noise.on).toBe(true);
  });
});

describe('Effects stage', () => {
  it('picking a character selects it and switches the stage on; picking it again clears it', () => {
    const { store } = renderWithRuntime(<StageEditor />, { persisted: { ...base(), stage: 'fx' } });
    fireEvent.click(screen.getByRole('button', { name: /Walkie-talkie/ }));
    expect(store.getState().params.fx).toMatchObject({ character: 'walkie', on: true });
    fireEvent.click(screen.getByRole('button', { name: /Walkie-talkie/ }));
    expect(store.getState().params.fx.character).toBe('none');
  });

  it('reverb, echo and chorus sliders write their values', () => {
    const { store } = renderWithRuntime(<StageEditor />, { persisted: { ...base(), stage: 'fx' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Reverb' }), { target: { value: '40' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Echo' }), { target: { value: '25' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Chorus' }), { target: { value: '10' } });
    expect(store.getState().params.fx).toMatchObject({ reverb: 40, echo: 25, chorus: 10 });
  });

  it('summaries describe the stage in the chain strip', () => {
    const p = createDefaultParams();
    const ctx = { params: p, inputLabel: '', outputLabel: '' };
    expect(stageSummary('fx', ctx)).toBe('rev 12%');
    p.fx = { on: true, character: 'radio', reverb: 0, echo: 20, chorus: 0 };
    expect(stageSummary('fx', ctx)).toBe('radio · echo 20%');
    expect(stageSummary('noise', ctx)).toBe('Medium · 70%');
    p.noise.amount = 55;
    expect(stageSummary('noise', ctx)).toBe('Custom · 55%');
  });
});

describe('Engine card', () => {
  it('chooses the voice model', () => {
    const { store } = renderWithRuntime(<EngineHealth />);
    fireEvent.click(screen.getByRole('button', { name: /Studio/ }));
    expect(store.getState().params.voice.quality).toBe(4096);
    expect(screen.getByRole('button', { name: /Studio/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Fast/ }));
    expect(store.getState().params.voice.quality).toBe(512);
  });

  it('keeps the preset name when only the quality changes', () => {
    const { store } = renderWithRuntime(<EngineHealth />);
    const before = store.getState().preset;
    fireEvent.click(screen.getByRole('button', { name: /Studio/ }));
    expect(store.getState().preset).toBe(before);
  });

  it('auto buffer switch and the note about the last change', () => {
    const { store } = renderWithRuntime(<EngineHealth />);
    expect(screen.getByRole('switch', { name: 'Auto buffer' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('switch', { name: 'Auto buffer' }));
    expect(store.getState().autoBuffer).toBe(false);
    expect(screen.getByRole('status')).toHaveTextContent('No changes needed so far');

    act(() =>
      store
        .getState()
        .noteBufferChange({ from: 'low', to: 'balanced', dropouts: 3, at: Date.now() - 120_000 }),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Last change: 2 min ago after 3 dropouts');
  });

  it('formats elapsed time', () => {
    expect(timeAgo(1000, 10_000)).toBe('just now');
    expect(timeAgo(0, 120_000)).toBe('2 min ago');
    expect(timeAgo(0, 3 * 3600_000)).toBe('3 h ago');
  });
});

describe('Tools menu', () => {
  it('opens each feature screen', () => {
    const { store } = renderWithRuntime(<TopBar />);
    const targets: Array<[RegExp, string]> = [
      [/Soundboard/, 'soundboard'],
      [/App profiles/, 'profiles'],
      [/Voice library/, 'library'],
      [/Phone remote/, 'remote'],
      [/hear me/, 'diagnose'],
      [/Setup wizard/, 'setup'],
    ];
    for (const [name, modal] of targets) {
      fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
      fireEvent.click(screen.getByRole('menuitem', { name }));
      expect(store.getState().modal).toBe(modal);
      expect(screen.queryByRole('menu')).toBeNull();
    }
  });

  it('closes on Escape', () => {
    renderWithRuntime(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: /Tools/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('AcceleratorButton', () => {
  it('records a combination, clears with Backspace and cancels with Escape', () => {
    const onChange = vi.fn();
    render(<AcceleratorButton ariaLabel="Key" value={null} onChange={onChange} />);
    const button = screen.getByRole('button', { name: 'Key' });
    expect(button).toHaveTextContent('Set key');

    fireEvent.click(button);
    fireEvent.keyDown(window, { key: 'v', code: 'KeyV', ctrlKey: true, altKey: true });
    expect(onChange).toHaveBeenCalledWith('Control+Alt+V');

    fireEvent.click(button);
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(onChange).toHaveBeenCalledTimes(1);

    fireEvent.click(button);
    fireEvent.keyDown(window, { key: 'Backspace', code: 'Backspace' });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('asks for a modifier when a bare key is pressed', () => {
    const onChange = vi.fn();
    render(<AcceleratorButton ariaLabel="Key" value="Control+Alt+1" onChange={onChange} />);
    const button = screen.getByRole('button', { name: 'Key' });
    expect(button).toHaveTextContent('Ctrl+Alt+1');
    fireEvent.click(button);
    fireEvent.keyDown(window, { key: 'a', code: 'KeyA' });
    expect(onChange).not.toHaveBeenCalled();
    expect(button).toHaveTextContent('Press keys');
  });
});

describe('Soundboard screen', () => {
  const file = (name: string, type = 'audio/mpeg'): File => {
    const f = new File([new Uint8Array([1, 2, 3, 4])], name, { type });
    Object.defineProperty(f, 'arrayBuffer', { value: async () => new Uint8Array([1, 2, 3, 4]).buffer });
    return f;
  };

  it('adds a clip through the file picker and shows its pad', async () => {
    const { store, api } = renderWithRuntime(<Modals />);
    act(() => store.getState().setModal('soundboard'));
    const input = screen.getByLabelText('Add sound files');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file('big_boom.mp3')] } });
    });
    await waitFor(() => expect(store.getState().sounds).toHaveLength(1));
    expect(api.sounds.add).toHaveBeenCalled();
    expect(await screen.findByText('big boom')).toBeInTheDocument();
  });

  it('refuses files that are not audio', async () => {
    const { store } = renderWithRuntime(<Modals />);
    act(() => store.getState().setModal('soundboard'));
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Add sound files'), {
        target: { files: [file('notes.txt', 'text/plain')] },
      });
    });
    expect(store.getState().sounds).toHaveLength(0);
    expect(screen.getByText(/Choose an audio file/)).toBeInTheDocument();
  });

  it('assigns a hotkey to a voice and to the quick switch; the toast option toggles', () => {
    const { store } = renderWithRuntime(<Modals />);
    act(() => store.getState().setModal('soundboard'));
    fireEvent.click(screen.getByRole('button', { name: 'Hotkey for Robot' }));
    fireEvent.keyDown(window, { key: '2', code: 'Digit2', ctrlKey: true, altKey: true });
    expect(store.getState().hotkeys.voices['Robot']).toBe('Control+Alt+2');

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Cartoon / Chipmunk' } });
    expect(store.getState().hotkeys.quick.preset).toBe('Cartoon / Chipmunk');
    fireEvent.click(screen.getByRole('button', { name: 'Quick switch key' }));
    fireEvent.keyDown(window, { key: '9', code: 'Digit9', ctrlKey: true, altKey: true });
    expect(store.getState().hotkeys.quick.accelerator).toBe('Control+Alt+9');

    fireEvent.click(screen.getByRole('switch', { name: 'Show a toast' }));
    expect(store.getState().hotkeys.toast).toBe(false);
  });

  it('pads are disabled until the engine runs and can be removed', async () => {
    const { store, api } = renderWithRuntime(<Modals />, {
      persisted: { ...base(), sounds: [{ id: 'a1b2c3d4e5f60718', name: 'Horn' }] },
    });
    act(() => store.getState().setModal('soundboard'));
    expect(screen.getByRole('button', { name: 'Horn' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Horn' }));
    await waitFor(() => expect(store.getState().sounds).toHaveLength(0));
    expect(api.sounds.remove).toHaveBeenCalledWith('a1b2c3d4e5f60718');
  });
});

describe('App profiles screen', () => {
  it('turns auto-switch on, adds a running app and edits its voice', async () => {
    const { store } = renderWithRuntime(
      <Modals />,
      {},
      {
        foreground: {
          setActive: vi.fn(async () => null),
          onChange: vi.fn(() => () => undefined),
          listRunning: vi.fn(async () => [
            { exe: 'valorant.exe', name: 'valorant' },
            { exe: 'explorer.exe', name: 'explorer' },
          ]),
        },
      },
    );
    act(() => store.getState().setModal('profiles'));
    fireEvent.click(screen.getByRole('switch', { name: 'Auto-switch' }));
    expect(store.getState().profiles.enabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '+ Add running app' }));
    const option = await screen.findByRole('option', { name: /valorant/ });
    expect(screen.queryByRole('option', { name: /explorer/ })).toBeNull();
    fireEvent.click(option);
    expect(store.getState().profiles.apps.map((a) => a.exe)).toEqual(['valorant.exe']);

    fireEvent.change(screen.getByLabelText('Voice for valorant'), { target: { value: 'Robot' } });
    fireEvent.change(screen.getByLabelText('Start engine for valorant'), { target: { value: 'yes' } });
    expect(store.getState().profiles.apps[0]).toMatchObject({ preset: 'Robot', start: true });
    fireEvent.change(screen.getByLabelText('Default voice'), { target: { value: 'Giant / Monster' } });
    expect(store.getState().profiles.fallback).toBe('Giant / Monster');

    fireEvent.click(screen.getByRole('button', { name: 'Remove valorant' }));
    expect(store.getState().profiles.apps).toEqual([]);
  });

  it('marks the program that is in front', () => {
    const { store } = renderWithRuntime(<Modals />, {
      persisted: {
        ...base(),
        profiles: {
          enabled: true,
          fallback: null,
          apps: [{ exe: 'game.exe', name: 'Game', preset: null, start: false }],
        },
      },
    });
    act(() => {
      store.getState().setForeground('game.exe');
      store.getState().setModal('profiles');
    });
    expect(screen.getByText('Active now')).toBeInTheDocument();
  });
});

describe('Voice library screen', () => {
  it('lists my voices, built-in voices and applies one', () => {
    const { store } = renderWithRuntime(<Modals />, {
      userPresets: {
        'Anime girl': { ...createDefaultParams(), voice: { ...createDefaultParams().voice, pitch: 8 } },
      },
    });
    act(() => store.getState().setModal('library'));
    expect(screen.getByText('Anime girl')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Anime girl'));
    expect(store.getState().preset).toBe('Anime girl');

    fireEvent.click(screen.getByRole('tab', { name: 'Built-in' }));
    expect(screen.getByText('Robot')).toBeInTheDocument();
  });

  it('imports a .vsp file and flags the voices as new', async () => {
    const { store } = renderWithRuntime(<Modals />);
    act(() => store.getState().setModal('library'));
    const p = createDefaultParams();
    p.voice.pitch = 5;
    const text = exportVsp({ 'Squeaky hero': p });
    const file = new File([text], 'hero.vsp', { type: 'application/json' });
    Object.defineProperty(file, 'text', { value: async () => text });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Import voice files'), { target: { files: [file] } });
    });
    await waitFor(() => expect(store.getState().userPresets['Squeaky hero']).toBeDefined());
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('reports a file that is not a voice', async () => {
    const { store } = renderWithRuntime(<Modals />);
    act(() => store.getState().setModal('library'));
    const file = new File(['hello'], 'x.vsp');
    Object.defineProperty(file, 'text', { value: async () => 'hello' });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Import voice files'), { target: { files: [file] } });
    });
    expect(await screen.findByText(/not a Voice Studio voice/)).toBeInTheDocument();
  });

  it('exports every saved voice through the save dialog', async () => {
    const { store, api } = renderWithRuntime(<Modals />, { userPresets: { A: createDefaultParams() } });
    act(() => store.getState().setModal('library'));
    fireEvent.click(screen.getByRole('button', { name: 'Export all' }));
    await waitFor(() => expect(api.saveFile).toHaveBeenCalled());
    const [name, data] = (api.saveFile as ReturnType<typeof vi.fn>).mock.calls[0] as [string, ArrayBuffer];
    expect(name).toBe('voice-studio-voices.vsp');
    expect(JSON.parse(new TextDecoder().decode(data)).voices[0].name).toBe('A');
  });

  it('loads community voices and adds one to mine', async () => {
    const text = JSON.stringify({
      voices: [
        { name: 'Radio host', author: 'jamim', description: 'Warm', params: { voice: { pitch: -3 } } },
      ],
    });
    const { store } = renderWithRuntime(<Modals />, {}, { communityVoices: vi.fn(async () => text) });
    act(() => store.getState().setModal('library'));
    fireEvent.click(screen.getByRole('tab', { name: 'Community' }));
    expect(await screen.findByText('Radio host')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(store.getState().userPresets['Radio host']?.voice.pitch).toBe(-3);
  });

  it('says so when the community list cannot be reached', async () => {
    const { store } = renderWithRuntime(<Modals />);
    act(() => store.getState().setModal('library'));
    fireEvent.click(screen.getByRole('tab', { name: 'Community' }));
    expect(await screen.findByText(/could not be loaded/)).toBeInTheDocument();
  });

  it('record buttons need a running engine', () => {
    const { store } = renderWithRuntime(<Modals />);
    act(() => store.getState().setModal('library'));
    expect(screen.getByRole('button', { name: 'Record 10 seconds' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Record my voice' })).toBeDisabled();
  });
});

describe('Phone remote screen', () => {
  const view = (over: Partial<RemoteView> = {}): RemoteView => ({
    enabled: true,
    url: 'http://192.168.1.20:7777/?t=abc',
    qr: 'data:image/png;base64,AAAA',
    devices: [],
    error: null,
    ...over,
  });

  it('is off until switched on', async () => {
    const off = view({ enabled: false, url: null, qr: null });
    const { store, api } = renderWithRuntime(
      <Modals />,
      {},
      {
        remote: {
          get: vi.fn(async () => off),
          setEnabled: vi.fn(async () => view()),
          newCode: vi.fn(async () => view()),
          disconnect: vi.fn(async () => undefined),
          onDevices: vi.fn(() => () => undefined),
        },
      },
    );
    act(() => store.getState().setModal('remote'));
    expect(await screen.findByText(/Turn the remote on/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: 'Phone remote' }));
    expect(await screen.findByText('http://192.168.1.20:7777/?t=abc')).toBeInTheDocument();
    expect(api.remote.setEnabled).toHaveBeenCalledWith(true);
    expect(screen.getByAltText(/QR code/)).toHaveAttribute('src', 'data:image/png;base64,AAAA');
  });

  it('lists connected phones and can disconnect them or renew the code', async () => {
    const connected = view({ devices: [{ id: 'd1', name: 'Pixel 8', since: Date.now() - 240_000 }] });
    const { store, api } = renderWithRuntime(
      <Modals />,
      {},
      {
        remote: {
          get: vi.fn(async () => connected),
          setEnabled: vi.fn(async () => connected),
          newCode: vi.fn(async () => view()),
          disconnect: vi.fn(async () => undefined),
          onDevices: vi.fn(() => () => undefined),
        },
      },
    );
    act(() => store.getState().setModal('remote'));
    expect(await screen.findByText('Pixel 8')).toBeInTheDocument();
    expect(screen.getByText(/Connected 4 min ago/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    expect(api.remote.disconnect).toHaveBeenCalledWith('d1');
    fireEvent.click(screen.getByRole('button', { name: 'New code' }));
    await waitFor(() => expect(api.remote.newCode).toHaveBeenCalled());
  });

  it('shows a start failure', async () => {
    const { store } = renderWithRuntime(
      <Modals />,
      {},
      {
        remote: {
          get: vi.fn(async () => view({ enabled: false, url: null, qr: null, error: 'EADDRINUSE' })),
          setEnabled: vi.fn(),
          newCode: vi.fn(),
          disconnect: vi.fn(),
          onDevices: vi.fn(() => () => undefined),
        },
      },
    );
    act(() => store.getState().setModal('remote'));
    expect(await screen.findByRole('alert')).toHaveTextContent('EADDRINUSE');
  });
});

describe("Why can't they hear me?", () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => vi.useRealTimers());

  it('finds a stopped engine and fixes it with one click', async () => {
    const { store, engine } = renderWithRuntime(<Modals />);
    act(() => store.getState().setModal('diagnose'));
    expect(screen.getByRole('status')).toHaveTextContent('Checking');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    expect(screen.getByText('The engine is not running')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/problem/);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start it' }));
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(engine.start).toHaveBeenCalled();
  });

  it('copies a report for support', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { store } = renderWithRuntime(<Modals />);
    act(() => store.getState().setModal('diagnose'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy report for support' }));
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('The engine is not running'));
  });

  it('the "show me" row opens the guide', async () => {
    const { store } = renderWithRuntime(<Modals />);
    act(() => store.getState().setModal('diagnose'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Show me' }));
    expect(store.getState().modal).toBe('guide');
  });
});

describe('Setup wizard', () => {
  it('walks through the four steps and marks setup as done', async () => {
    const { store } = renderWithRuntime(<Modals />, { persisted: { ...base(), setupDone: false } });
    act(() => store.getState().setModal('setup'));
    const dialog = screen.getByRole('dialog', { name: 'Welcome to Voice Studio' });
    expect(within(dialog).getByText(/Games need a virtual microphone/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Back' })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(within(dialog).getByText(/Say something/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(within(dialog).getByText(/Where do you hear yourself/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(within(dialog).getByText(/Choose how you want to sound/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /Cartoon/ }));
    expect(store.getState().preset).toBe('Cartoon / Chipmunk');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Start engine' }));
    });
    expect(store.getState().setupDone).toBe(true);
    expect(store.getState().modal).toBeNull();
  });

  it('"Skip setup" also counts as done', () => {
    const { store } = renderWithRuntime(<Modals />, { persisted: { ...base(), setupDone: false } });
    act(() => store.getState().setModal('setup'));
    fireEvent.click(screen.getByRole('button', { name: 'Skip setup' }));
    expect(store.getState().setupDone).toBe(true);
    expect(store.getState().modal).toBeNull();
  });
});

function base() {
  return createDefaultPersisted();
}
import { createDefaultPersisted } from '@shared/persisted-state';
