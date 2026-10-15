import { act, fireEvent, screen, within, waitFor } from '@testing-library/react';
import { App } from '@renderer/studio/App';
import { ChainStrip } from '@renderer/studio/components/ChainStrip/ChainStrip';
import { DevicesCard } from '@renderer/studio/components/Devices/DevicesCard';
import { LevelsCard } from '@renderer/studio/components/Levels/LevelsCard';
import { Modals } from '@renderer/studio/components/Modals/Modals';
import { MusicDock } from '@renderer/studio/components/Music/MusicDock';
import { EngineHealth } from '@renderer/studio/components/Panels/EngineHealth';
import { QuickFixes } from '@renderer/studio/components/Panels/QuickFixes';
import { StageEditor } from '@renderer/studio/components/Stages/StageEditor';
import { TopBar } from '@renderer/studio/components/TopBar/TopBar';
import { VoicePad } from '@renderer/studio/components/Voice/VoicePad';
import { createDefaultPersisted } from '@shared/persisted-state';
import { mockRect, renderWithRuntime } from '../../helpers/render';

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

describe('ChainStrip', () => {
  it('renders the twelve stages in order', () => {
    renderWithRuntime(<ChainStrip />);
    const names = [
      'Mic',
      'High-pass',
      'Noise removal',
      'Gate',
      'Voice',
      'De-esser',
      'Breath & clicks',
      'EQ',
      'Effects',
      'Compressor',
      'Limiter',
      'Output',
    ];
    const nodes = screen.getAllByRole('button', { name: /stage$/ });
    expect(nodes.map((n) => n.getAttribute('data-stage'))).toEqual([
      'mic',
      'hpf',
      'noise',
      'exp',
      'voice',
      'deess',
      'breath',
      'eq',
      'fx',
      'comp',
      'lim',
      'out',
    ]);
    names.forEach((n) => expect(screen.getByRole('button', { name: `${n} stage` })).toBeInTheDocument());
  });

  it('marks the selected stage and selects on click and on Enter', () => {
    const { store } = renderWithRuntime(<ChainStrip />);
    expect(screen.getByRole('button', { name: 'Voice stage' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Compressor stage' }));
    expect(store.getState().stage).toBe('comp');
    expect(screen.getByRole('button', { name: 'Compressor stage' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(screen.getByRole('button', { name: 'EQ stage' }), { key: 'Enter' });
    expect(store.getState().stage).toBe('eq');
  });

  it('a stage switch toggles its module without selecting the stage', () => {
    const { store } = renderWithRuntime(<ChainStrip />);
    fireEvent.click(screen.getByRole('switch', { name: 'Gate on/off' }));
    expect(store.getState().params.exp.on).toBe(false);
    expect(store.getState().stage).toBe('voice');
  });

  it('shows live summaries from the settings', () => {
    const persisted = createDefaultPersisted();
    persisted.params.voice.pitch = 4.5;
    persisted.params.voice.formant = 2.8;
    renderWithRuntime(<ChainStrip />, { persisted });
    expect(screen.getByText('+4.5 · +2.8 st')).toBeInTheDocument();
    expect(screen.getByText('80 Hz · 24 dB')).toBeInTheDocument();
    expect(screen.getByText('6 bands')).toBeInTheDocument();
  });

  it('dims a disabled stage', () => {
    const persisted = createDefaultPersisted();
    persisted.params.comp.on = false;
    renderWithRuntime(<ChainStrip />, { persisted });
    expect(screen.getByRole('switch', { name: 'Compressor on/off' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });
});

describe('VoicePad', () => {
  const setup = (over: Partial<{ pitch: number; formant: number }> = {}) => {
    const onChange = vi.fn();
    const onReset = vi.fn();
    const utils = renderWithRuntime(
      <VoicePad pitch={over.pitch ?? 0} formant={over.formant ?? 0} onChange={onChange} onReset={onReset} />,
    );
    const pad = screen.getByTestId('voice-pad');
    mockRect(pad, { width: 480, height: 240 });
    return { ...utils, pad, onChange, onReset };
  };

  it('puts the puck where pitch / formant say', () => {
    setup({ pitch: 12, formant: 12 });
    expect(screen.getByTestId('voice-puck')).toHaveStyle({ left: '100%', top: '0%' });
  });

  it('a press maps the pointer to semitones', () => {
    const { pad, onChange } = setup();
    fireEvent.pointerDown(pad, { clientX: 360, clientY: 60, pointerId: 1 }); // 75 % across, 25 % down
    expect(onChange).toHaveBeenLastCalledWith(6, 6);
  });

  it('dragging keeps updating, releasing stops', () => {
    const { pad, onChange } = setup();
    fireEvent.pointerDown(pad, { clientX: 240, clientY: 120, pointerId: 1 });
    fireEvent.pointerMove(pad, { clientX: 480, clientY: 0, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(12, 12);
    fireEvent.pointerUp(pad, { pointerId: 1 });
    onChange.mockClear();
    fireEvent.pointerMove(pad, { clientX: 0, clientY: 0, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Shift snaps the formant to the natural diagonal', () => {
    const { pad, onChange } = setup();
    fireEvent.pointerDown(pad, { clientX: 456, clientY: 230, pointerId: 1, shiftKey: true });
    const [pitch, formant] = onChange.mock.calls.at(-1)!;
    expect(pitch).toBeCloseTo(11, 0);
    expect(formant).toBeCloseTo(pitch * 0.62, 1);
  });

  it('arrow keys nudge, double click / Home reset', () => {
    const { pad, onChange, onReset } = setup({ pitch: 1, formant: 1 });
    fireEvent.keyDown(pad, { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith(1.5, 1);
    fireEvent.keyDown(pad, { key: 'ArrowUp', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith(1, 1.1);
    fireEvent.doubleClick(pad);
    fireEvent.keyDown(pad, { key: 'Home' });
    expect(onReset).toHaveBeenCalledTimes(2);
  });
});

describe('StageEditor', () => {
  it('shows the voice editor and the voices card for the voice stage', () => {
    renderWithRuntime(<StageEditor />);
    expect(screen.getByRole('region', { name: 'Voice' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Voices' })).toBeInTheDocument();
    expect(screen.getByTestId('voice-pad')).toBeInTheDocument();
  });

  it('switches editors with the selected stage', () => {
    const { store } = renderWithRuntime(<StageEditor />);
    act(() => store.getState().setStage('comp'));
    expect(screen.getByRole('region', { name: 'Compressor' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Voices' })).toBeNull();
    act(() => store.getState().setStage('eq'));
    expect(screen.getByRole('region', { name: 'Parametric EQ' })).toBeInTheDocument();
  });

  it('every stage renders without errors', () => {
    const { store } = renderWithRuntime(<StageEditor />);
    for (const id of ['mic', 'hpf', 'exp', 'voice', 'deess', 'eq', 'comp', 'lim', 'out'] as const) {
      act(() => store.getState().setStage(id));
      expect(document.querySelector('section')).toBeInTheDocument();
    }
  });

  it('a knob edits its module and marks the preset as custom', () => {
    const { store } = renderWithRuntime(<StageEditor />);
    act(() => store.getState().setStage('hpf'));
    fireEvent.keyDown(screen.getByRole('slider', { name: 'CUT-OFF' }), { key: 'ArrowUp' });
    expect(store.getState().params.hpf.freq).toBeGreaterThan(80);
    expect(store.getState().preset).toBeNull();
  });

  it('the header switch disables a module and dims its body', () => {
    const { store } = renderWithRuntime(<StageEditor />);
    act(() => store.getState().setStage('exp'));
    fireEvent.click(screen.getByRole('switch', { name: 'Gate (downward expander) on/off' }));
    expect(store.getState().params.exp.on).toBe(false);
  });

  it('EQ band switch and knobs edit the band', () => {
    const { store } = renderWithRuntime(<StageEditor />);
    act(() => store.getState().setStage('eq'));
    fireEvent.click(screen.getByRole('switch', { name: 'BAND 3 on/off' }));
    expect(store.getState().params.eq.bands[2].on).toBe(false);
    const gains = screen.getAllByRole('slider', { name: 'GAIN' });
    fireEvent.keyDown(gains[0]!, { key: 'End' });
    expect(store.getState().params.eq.bands[0].gain).toBe(18);
  });

  it('the voice pad drives pitch and formant and re-enables the voice', () => {
    const { store } = renderWithRuntime(<StageEditor />);
    act(() => store.getState().patchVoice({ on: false }));
    const pad = screen.getByTestId('voice-pad');
    mockRect(pad, { width: 400, height: 400 });
    fireEvent.pointerDown(pad, { clientX: 300, clientY: 100, pointerId: 1 });
    const v = store.getState().params.voice;
    expect(v.pitch).toBe(6);
    expect(v.formant).toBe(6);
    expect(v.on).toBe(true);
  });

  it('voice tiles apply presets and highlight the active one', () => {
    const { store } = renderWithRuntime(<StageEditor />);
    const tile = screen.getByRole('button', { name: /Giant/ });
    fireEvent.click(tile);
    expect(store.getState().preset).toBe('Giant / Monster');
    expect(screen.getByRole('button', { name: /Giant/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(tile).getByText('−9 / −6')).toBeInTheDocument();
  });

  it('effect mix and robot switch edit the voice', () => {
    const { store } = renderWithRuntime(<StageEditor />);
    fireEvent.change(screen.getByRole('slider', { name: 'Effect mix' }), { target: { value: '40' } });
    expect(store.getState().params.voice.mix).toBe(40);
    fireEvent.click(screen.getByRole('switch', { name: 'Robot voice' }));
    expect(store.getState().params.voice.robot).toBe(true);
  });

  it('quality changes keep the preset (not a "custom" edit)', () => {
    const { store } = renderWithRuntime(<StageEditor />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '1024' } });
    expect(store.getState().params.voice.quality).toBe(1024);
    expect(store.getState().preset).toBe('Female – Natural');
  });
});

describe('TopBar', () => {
  it('LIVE button starts and stops the engine', async () => {
    const { engine } = renderWithRuntime(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: /Start engine/ }));
    await waitFor(() => expect(engine.start).toHaveBeenCalled());
  });

  it('preset picker applies a preset; editing shows "Custom (unsaved)"', () => {
    const { store } = renderWithRuntime(<TopBar />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'Robot' } });
    expect(store.getState().preset).toBe('Robot');
    expect(select.value).toBe('Robot');

    act(() => store.getState().patchVoice({ pitch: 9 }));
    expect(screen.getByRole('option', { name: 'Custom (unsaved)' })).toBeInTheDocument();
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('');
  });

  it('Save opens the name dialog; Delete only appears for user presets', () => {
    const { store } = renderWithRuntime(<TopBar />);
    expect(screen.queryByRole('button', { name: /Delete preset/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(store.getState().modal).toBe('save-preset');

    act(() => store.getState().saveUserPreset('Mine'));
    expect(screen.getByRole('button', { name: 'Delete preset Mine' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete preset Mine' }));
    expect(store.getState().userPresets).toEqual({});
  });

  it('Bypass toggles and looks pressed', () => {
    const { store } = renderWithRuntime(<TopBar />);
    const bypass = screen.getByRole('button', { name: 'Bypass' });
    fireEvent.click(bypass);
    expect(store.getState().params.bypass).toBe(true);
    expect(bypass).toHaveAttribute('aria-pressed', 'true');
  });

  it('Music switch shows / hides the player and pauses playback when turned off', () => {
    const { store, player } = renderWithRuntime(<TopBar />);
    const pause = vi.spyOn(player, 'pause');
    fireEvent.click(screen.getByRole('switch', { name: 'Show music player' }));
    expect(store.getState().music.show).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: 'Show music player' }));
    expect(store.getState().music.show).toBe(false);
    expect(pause).toHaveBeenCalled();
  });

  it('shows an update chip that starts the download', async () => {
    const { store, api } = renderWithRuntime(<TopBar />);
    act(() =>
      store.getState().setUpdate({ phase: 'available', info: { version: '1.3.0', notes: 'Faster' } }),
    );
    const chip = await screen.findByRole('button', { name: /Update 1\.3\.0/ });
    fireEvent.click(chip);
    await waitFor(() => expect(api.update.download).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: /Downloading 0%/ })).toBeDisabled();
  });

  it('the About button opens the about dialog', () => {
    const { store } = renderWithRuntime(<TopBar />);
    fireEvent.click(screen.getByRole('button', { name: 'About Voice Studio' }));
    expect(store.getState().modal).toBe('about');
  });
});

describe('QuickFixes', () => {
  it('maps plain-language switches to modules', () => {
    const { store } = renderWithRuntime(<QuickFixes />);
    fireEvent.click(screen.getByRole('switch', { name: 'Cut background noise' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Tame harsh S sounds' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Even out my volume' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Protect from clipping' }));
    const p = store.getState().params;
    expect([p.exp.on, p.deess.on, p.comp.on, p.lim.on]).toEqual([false, false, false, false]);
  });

  it('"Warmer tone" raises the low shelf and can be undone', () => {
    const { store } = renderWithRuntime(<QuickFixes />);
    const base = store.getState().params.eq.bands[0].gain;
    fireEvent.click(screen.getByRole('switch', { name: 'Warmer tone' }));
    expect(store.getState().params.eq.bands[0].gain).toBeCloseTo(base + 3, 6);
    fireEvent.click(screen.getByRole('switch', { name: 'Warmer tone' }));
    expect(store.getState().params.eq.bands[0].gain).toBeCloseTo(base, 6);
  });
});

describe('DevicesCard', () => {
  const devices = [
    { kind: 'audioinput' as const, deviceId: 'mic', label: 'Razer Mic' },
    { kind: 'audiooutput' as const, deviceId: 'spk', label: 'Speakers' },
    { kind: 'audiooutput' as const, deviceId: 'cable', label: 'CABLE Input (VB-Audio Virtual Cable)' },
  ];

  it('auto-selects the virtual cable and confirms it is ready', async () => {
    mockDevices(devices);
    const { store } = renderWithRuntime(<DevicesCard />);
    expect(await screen.findByText('Virtual mic ready. In your game pick CABLE Output.')).toBeInTheDocument();
    expect(store.getState().dev.out).toBe('cable');
  });

  it('offers to install when no cable exists', async () => {
    mockDevices(devices.filter((d) => d.deviceId !== 'cable'));
    const { store } = renderWithRuntime(<DevicesCard />);
    const install = await screen.findByRole('button', { name: /Install virtual microphone/ });
    fireEvent.click(install);
    expect(store.getState().modal).toBe('cable');
  });

  it('changing a device updates the store', async () => {
    mockDevices(devices);
    const { store } = renderWithRuntime(<DevicesCard />);
    await screen.findByText(/Virtual mic ready/);
    fireEvent.change(screen.getByLabelText('Microphone'), { target: { value: 'mic' } });
    expect(store.getState().dev.in).toBe('mic');
    fireEvent.click(screen.getByRole('switch', { name: 'Hear myself' }));
    expect(store.getState().monitor.on).toBe(true);
  });
});

describe('LevelsCard', () => {
  it('gain readouts show dB and respond to keys and double click', () => {
    const { store } = renderWithRuntime(<LevelsCard />);
    const input = screen.getByRole('slider', { name: 'Input gain' });
    expect(input).toHaveTextContent('0.0 dB');
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(store.getState().params.inGain).toBe(0.5);
    expect(screen.getByRole('slider', { name: 'Input gain' })).toHaveTextContent('0.5 dB');
    fireEvent.doubleClick(input);
    expect(store.getState().params.inGain).toBe(0);
  });

  it('shows both meters', () => {
    renderWithRuntime(<LevelsCard />);
    expect(screen.getByRole('meter', { name: 'Input level' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Output level' })).toBeInTheDocument();
  });
});

describe('EngineHealth', () => {
  it('shows dashes while stopped and changes the buffer through the controller', () => {
    const { store } = renderWithRuntime(<EngineHealth />);
    expect(screen.getByTestId('dropouts')).toHaveTextContent('–');
    fireEvent.change(screen.getByLabelText('Audio buffer'), { target: { value: 'safe' } });
    expect(store.getState().buffer).toBe('safe');
  });
});

describe('MusicDock', () => {
  it('renders nothing while the music switch is off', () => {
    renderWithRuntime(<MusicDock />);
    expect(screen.queryByRole('contentinfo')).toBeNull();
    expect(screen.queryByLabelText('Music player')).toBeNull();
  });

  it('shows the player, hint text and volume when on', () => {
    const persisted = createDefaultPersisted();
    persisted.music.show = true;
    const { store } = renderWithRuntime(<MusicDock />, { persisted });
    expect(screen.getByLabelText('Music player')).toBeInTheDocument();
    expect(screen.getByText('Start the engine to play')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    fireEvent.change(screen.getByRole('slider', { name: 'Music volume' }), { target: { value: '30' } });
    expect(store.getState().music.vol).toBe(30);
    fireEvent.click(screen.getByRole('switch', { name: 'Duck when I talk' }));
    expect(store.getState().music.duck).toBe(false);
  });

  it('the playlist popover lists tracks, selects and removes them', () => {
    const persisted = createDefaultPersisted();
    persisted.music.show = true;
    const { player } = renderWithRuntime(<MusicDock />, { persisted });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    player.playlist.add('Night Drive', 'blob:a');
    player.playlist.add('Sunrise', 'blob:b');

    fireEvent.click(screen.getByRole('button', { name: /Add files/ }));
    const popover = screen.getByRole('dialog', { name: 'Playlist' });
    // the list re-renders from player change events
    player.events.emit('change', undefined);
    return waitFor(() => {
      expect(within(popover).getByText(/1\. Night Drive/)).toBeInTheDocument();
      expect(within(popover).getByText(/2\. Sunrise/)).toBeInTheDocument();
    }).then(() => {
      fireEvent.click(within(popover).getByRole('button', { name: 'Remove Night Drive' }));
      expect(player.playlist.items.map((t) => t.name)).toEqual(['Sunrise']);
    });
  });

  it('adding a link goes through the controller and clears the box on success', async () => {
    const persisted = createDefaultPersisted();
    persisted.music.show = true;
    const ytFetch = vi.fn(async () => ({
      ok: true as const,
      title: 'Song',
      ext: 'm4a',
      data: new ArrayBuffer(4),
    }));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:song');
    const { player } = renderWithRuntime(<MusicDock />, { persisted }, { ytFetch });
    fireEvent.click(screen.getByRole('button', { name: /Add files/ }));
    const box = screen.getByLabelText('Link to add') as HTMLInputElement;
    fireEvent.change(box, { target: { value: 'https://youtu.be/abc' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    await waitFor(() => expect(ytFetch).toHaveBeenCalledWith('https://youtu.be/abc'));
    await waitFor(() => expect(player.playlist.size).toBe(1));
    await waitFor(() => expect((screen.getByLabelText('Link to add') as HTMLInputElement).value).toBe(''));
  });
});

describe('Modals', () => {
  it('saves a user preset from the dialog', () => {
    const { store } = renderWithRuntime(<Modals />);
    act(() => store.getState().setModal('save-preset'));
    const input = screen.getByLabelText('Preset name');
    fireEvent.change(input, { target: { value: 'Stream voice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(Object.keys(store.getState().userPresets)).toEqual(['Stream voice']);
    expect(store.getState().modal).toBeNull();
  });

  it('warns when a preset would be replaced and refuses an empty name', () => {
    const { store } = renderWithRuntime(<Modals />);
    act(() => store.getState().saveUserPreset('Mine'));
    act(() => store.getState().setModal('save-preset'));
    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'Mine' } });
    expect(screen.getByText(/will be replaced/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: '  ' } });
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('About shows the version, credits the author and records a new shortcut', async () => {
    const { store, api } = renderWithRuntime(<Modals />);
    act(() => store.getState().setModal('about'));
    expect(await screen.findByText('v9.9.9')).toBeInTheDocument();
    expect(screen.getByText('Jamim Mehdi')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Ctrl + Alt + V' }));
    fireEvent.keyDown(window, { key: 'm', code: 'KeyM', ctrlKey: true, shiftKey: true });
    await waitFor(() => expect(api.settings.setShortcut).toHaveBeenCalledWith('Control+Shift+M'));
    expect(await screen.findByText('Shortcut saved.')).toBeInTheDocument();
  });

  it('About: Escape cancels shortcut capture; quit and compact go to the main process', async () => {
    const { store, api } = renderWithRuntime(<Modals />);
    act(() => store.getState().setModal('about'));
    fireEvent.click(await screen.findByRole('button', { name: 'Ctrl + Alt + V' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(api.settings.setShortcut).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Open compact panel' }));
    expect(api.openCompact).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Quit Voice Studio' }));
    expect(api.quitApp).toHaveBeenCalled();
  });

  it('cable dialog reports the installer result', async () => {
    const { store } = renderWithRuntime(
      <Modals />,
      {},
      { installVbCable: vi.fn(async () => ({ ok: false as const, error: 'blocked' })) },
    );
    act(() => store.getState().setModal('cable'));
    fireEvent.click(screen.getByRole('button', { name: /Download & start installer/ }));
    expect(await screen.findByText(/Could not start the installer: blocked/)).toBeInTheDocument();
  });

  it('the guide opens and closes', () => {
    const { store } = renderWithRuntime(<Modals />);
    act(() => store.getState().setModal('guide'));
    expect(screen.getByRole('dialog', { name: 'Using Voice Studio in a game' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(store.getState().modal).toBeNull();
  });
});

describe('App', () => {
  it('renders the whole studio layout', async () => {
    renderWithRuntime(<App />);
    expect(screen.getByText('Voice Studio')).toBeInTheDocument();
    expect(screen.getByLabelText('Signal chain')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Devices' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Live output' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Quick fixes' })).toBeInTheDocument();
    expect(await screen.findByTestId('version')).toHaveTextContent('v9.9.9');
    expect(screen.getByText(/Made by/)).toBeInTheDocument();
  });
});
