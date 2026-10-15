import { dbFromLinear } from './calibration';

export type CheckStatus = 'pass' | 'fail' | 'info';

export type CheckId = 'mic' | 'engine' | 'cable' | 'output' | 'game';

export type FixAction = 'start-engine' | 'use-cable' | 'install-cable' | 'show-guide' | 'open-devices';

export interface CheckResult {
  id: CheckId;
  status: CheckStatus;
  title: string;
  detail: string;
  fix?: { action: FixAction; label: string };
}

export interface DiagnosticInput {
  engineRunning: boolean;
  /** highest input peak seen recently (linear 0..1) */
  inputPeak: number;
  inputLabel: string;
  latencyMs: number;
  dropouts: number;
  cableFound: boolean;
  outputIsCable: boolean;
  outputLabel: string;
}

/** Below this peak the microphone is considered silent. */
export const SILENCE_PEAK_DB = -60;

/** Walks the path mic -> engine -> cable -> game and says where it is broken. */
export function runDiagnostics(i: DiagnosticInput): CheckResult[] {
  const results: CheckResult[] = [];

  if (!i.engineRunning) {
    results.push({
      id: 'engine',
      status: 'fail',
      title: 'The engine is not running',
      detail: 'Nothing is sent to your game until you start it.',
      fix: { action: 'start-engine', label: 'Start it' },
    });
  } else {
    results.push({
      id: 'engine',
      status: 'pass',
      title: 'Engine is running',
      detail: `${i.latencyMs} ms · ${i.dropouts} dropouts`,
    });
  }

  if (!i.engineRunning) {
    results.push({
      id: 'mic',
      status: 'info',
      title: 'Microphone not checked',
      detail: 'Start the engine to test the microphone.',
    });
  } else if (dbFromLinear(i.inputPeak) < SILENCE_PEAK_DB) {
    results.push({
      id: 'mic',
      status: 'fail',
      title: 'No sound from the microphone',
      detail: `${i.inputLabel} is silent. Check that it is not muted and is the right device.`,
      fix: { action: 'open-devices', label: 'Choose mic' },
    });
  } else {
    results.push({
      id: 'mic',
      status: 'pass',
      title: 'Microphone is receiving sound',
      detail: `${i.inputLabel} · peak ${Math.round(dbFromLinear(i.inputPeak))} dB`,
    });
  }

  if (!i.cableFound) {
    results.push({
      id: 'cable',
      status: 'fail',
      title: 'Virtual cable is not installed',
      detail: 'Games can only use real devices, so a virtual microphone is needed.',
      fix: { action: 'install-cable', label: 'Install' },
    });
  } else {
    results.push({
      id: 'cable',
      status: 'pass',
      title: 'Virtual cable is installed',
      detail: 'CABLE Input / CABLE Output found',
    });
  }

  if (i.cableFound && !i.outputIsCable) {
    results.push({
      id: 'output',
      status: 'fail',
      title: 'Output is not set to CABLE Input',
      detail: `Currently: ${i.outputLabel}. The game gets nothing.`,
      fix: { action: 'use-cable', label: 'Fix it' },
    });
  } else if (i.cableFound) {
    results.push({
      id: 'output',
      status: 'pass',
      title: 'Output goes to CABLE Input',
      detail: 'Your voice is sent into the virtual cable.',
    });
  }

  // the game's own setting cannot be read from outside, so this one is a reminder
  results.push({
    id: 'game',
    status: 'info',
    title: 'Is your game using CABLE Output?',
    detail: "In the game's voice settings, choose CABLE Output as the microphone.",
    fix: { action: 'show-guide', label: 'Show me' },
  });

  return results;
}

export function countProblems(results: readonly CheckResult[]): { problems: number; fixable: number } {
  const failing = results.filter((r) => r.status === 'fail');
  return {
    problems: failing.length,
    fixable: failing.filter((r) => r.fix !== undefined).length,
  };
}
