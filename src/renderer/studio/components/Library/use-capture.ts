import { useCallback, useEffect, useRef, useState } from 'react';
import { useController } from '../../runtime/react';

export interface CaptureResult {
  raw: Float32Array;
  processed: Float32Array;
  sampleRate: number;
}

export type CapturePhase = 'idle' | 'recording';

export interface CaptureApi {
  phase: CapturePhase;
  /** seconds left while recording */
  remaining: number;
  start(seconds: number): boolean;
  cancel(): void;
}

/**
 * Records the raw microphone and the processed voice side by side for a fixed time,
 * then hands the result to `onDone`. Only one capture can run at a time engine-wide.
 */
export function useCapture(onDone: (result: CaptureResult) => void): CaptureApi {
  const controller = useController();
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [remaining, setRemaining] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = useRef(onDone);
  done.current = onDone;

  const clear = (): void => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const finish = useCallback(
    (deliver: boolean) => {
      clear();
      const result = controller.stopCapture();
      setPhase('idle');
      setRemaining(0);
      if (deliver && result && result.raw.length > 0) done.current(result);
    },
    [controller],
  );

  const start = useCallback(
    (seconds: number): boolean => {
      if (timer.current || !controller.startCapture()) return false;
      setPhase('recording');
      setRemaining(seconds);
      let left = seconds;
      timer.current = setInterval(() => {
        left -= 1;
        setRemaining(left);
        if (left <= 0) finish(true);
      }, 1000);
      return true;
    },
    [controller, finish],
  );

  const cancel = useCallback(() => {
    if (timer.current) finish(false);
  }, [finish]);

  useEffect(
    () => () => {
      if (timer.current) finish(false);
    },
    [finish],
  );

  return { phase, remaining, start, cancel };
}

/** Peak envelope of `samples` as `count` values in 0..1, for drawing a small waveform. */
export function peakEnvelope(samples: Float32Array, count: number): number[] {
  if (samples.length === 0) return new Array<number>(count).fill(0);
  const out: number[] = [];
  const size = Math.max(1, Math.floor(samples.length / count));
  let max = 0;
  for (let i = 0; i < count; i++) {
    let peak = 0;
    const from = i * size;
    for (let j = from; j < Math.min(samples.length, from + size); j++) {
      const a = Math.abs(samples[j]!);
      if (a > peak) peak = a;
    }
    out.push(peak);
    if (peak > max) max = peak;
  }
  return out.map((v) => (max > 0 ? v / max : 0));
}
