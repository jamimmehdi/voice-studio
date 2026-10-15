import { act, fireEvent, screen } from '@testing-library/react';
import { NoticeBar } from '@renderer/studio/components/Notice/NoticeBar';
import { StageEditor } from '@renderer/studio/components/Stages/StageEditor';
import { VoiceStage } from '@renderer/studio/components/Voice/VoiceStage';
import { LivePill } from '@renderer/studio/components/TopBar/LivePill';
import { stageSummary } from '@renderer/studio/lib/stage-summary';
import { createDefaultParams } from '@shared/params';
import { createDefaultPersisted } from '@shared/persisted-state';
import { renderWithRuntime } from '../../helpers/render';

describe('Naturalness meter', () => {
  it('shows a high score for a natural voice and says so', () => {
    renderWithRuntime(<VoiceStage />);
    const box = screen.getByRole('region', { name: 'Naturalness' });
    expect(box).toHaveTextContent('Natural');
    expect(Number(screen.getByTestId('naturalness-score').textContent)).toBeGreaterThanOrEqual(75);
  });

  it('drops and warns when the formant is pulled away from the pitch', () => {
    const { store } = renderWithRuntime(<VoiceStage />);
    const before = Number(screen.getByTestId('naturalness-score').textContent);
    act(() => store.getState().patchVoice({ pitch: 6, formant: -6 }));
    const after = Number(screen.getByTestId('naturalness-score').textContent);
    expect(after).toBeLessThan(before);
    expect(screen.getByRole('meter', { name: 'Naturalness score' })).toHaveAttribute(
      'aria-valuenow',
      String(after),
    );
    expect(screen.getByRole('region', { name: 'Naturalness' })).toHaveTextContent(/low for this pitch/);
  });

  it('turning robot voice on is called out as robotic', () => {
    const { store } = renderWithRuntime(<VoiceStage />);
    act(() => store.getState().patchVoice({ robot: true }));
    expect(screen.getByRole('region', { name: 'Naturalness' })).toHaveTextContent('Robotic');
  });
});

describe('Breath & clicks stage', () => {
  it('has its own editor with two knobs and an on switch', () => {
    const { store } = renderWithRuntime(<StageEditor />, {
      persisted: { ...createDefaultPersisted(), stage: 'breath' },
    });
    expect(screen.getByRole('region', { name: 'Breath & clicks' })).toBeInTheDocument();
    expect(store.getState().params.breath.on).toBe(false);
    fireEvent.click(screen.getByRole('switch', { name: 'Breath & clicks on/off' }));
    expect(store.getState().params.breath.on).toBe(true);

    const clicks = screen.getByRole('slider', { name: 'CLICKS' });
    fireEvent.keyDown(clicks, { key: 'End' });
    expect(store.getState().params.breath.clicks).toBe(100);
    fireEvent.keyDown(screen.getByRole('slider', { name: 'BREATHS' }), { key: 'Home' });
    expect(store.getState().params.breath.breath).toBe(0);
  });

  it('is described in the chain strip', () => {
    const p = createDefaultParams();
    expect(stageSummary('breath', { params: p, inputLabel: '', outputLabel: '' })).toBe(
      'clicks 60% · breath 50%',
    );
  });

  it('keeps its settings when a preset is applied', () => {
    const { store } = renderWithRuntime(<StageEditor />);
    act(() => store.getState().patchModule('breath', { on: true, clicks: 90, breath: 20 }));
    act(() => {
      store.getState().applyPreset('Robot');
    });
    expect(store.getState().params.breath).toEqual({ on: true, clicks: 90, breath: 20 });
  });
});

describe('Notice bar', () => {
  it('shows a warning until it is dismissed', () => {
    const { store } = renderWithRuntime(<NoticeBar />);
    expect(screen.queryByRole('alert')).toBeNull();
    act(() => store.getState().setNotice('warn', 'Your headphones were disconnected.'));
    expect(screen.getByRole('alert')).toHaveTextContent('Your headphones were disconnected.');
    fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    expect(store.getState().notice).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('an informational notice goes away by itself', () => {
    vi.useFakeTimers();
    const { store } = renderWithRuntime(<NoticeBar />);
    act(() => store.getState().setNotice('info', 'Your device is back.'));
    expect(screen.getByRole('status')).toHaveTextContent('Your device is back.');
    act(() => {
      vi.advanceTimersByTime(6500);
    });
    expect(store.getState().notice).toBeNull();
    vi.useRealTimers();
  });

  it('a newer notice replaces the older one', () => {
    const { store } = renderWithRuntime(<NoticeBar />);
    act(() => store.getState().setNotice('warn', 'first'));
    act(() => store.getState().setNotice('warn', 'second'));
    expect(screen.getByRole('alert')).toHaveTextContent('second');
  });
});

describe('Live pill while waiting for a device', () => {
  it('says what it is doing', () => {
    const { store } = renderWithRuntime(<LivePill />);
    act(() => store.getState().setEngine('waiting'));
    expect(screen.getByRole('button')).toHaveTextContent('Waiting for device…');
  });
});
