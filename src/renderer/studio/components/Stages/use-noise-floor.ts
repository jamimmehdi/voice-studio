import { useEffect, useState } from 'react';
import { linToDb } from '@engine/dsp/math';
import { useRuntime } from '../../runtime/react';

export interface NoiseFloor {
  /** quietest level of the microphone over the last seconds, dB */
  before: number;
  /** the same after the chain */
  after: number;
}

const WINDOW = 90; // about 3 s of meter ticks

function lowest(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.1)] ?? -120;
}

/**
 * Tracks the noise floor in front of and behind the chain, from the same meter clock the level
 * meters use. Returns null while the engine is stopped or there is not enough history yet.
 */
export function useNoiseFloor(active: boolean): NoiseFloor | null {
  const { hub } = useRuntime();
  const [floor, setFloor] = useState<NoiseFloor | null>(null);

  useEffect(() => {
    if (!active) {
      setFloor(null);
      return undefined;
    }
    const ins: number[] = [];
    const outs: number[] = [];
    let ticks = 0;
    const off = hub.subscribe((m) => {
      ins.push(linToDb(m.inPeak));
      outs.push(linToDb(m.outPeak));
      if (ins.length > WINDOW) {
        ins.shift();
        outs.shift();
      }
      if (++ticks % 15 === 0 && ins.length >= WINDOW / 2) {
        const before = lowest(ins);
        const after = lowest(outs);
        setFloor((prev) =>
          prev && Math.abs(prev.before - before) < 0.5 && Math.abs(prev.after - after) < 0.5
            ? prev
            : { before, after },
        );
      }
    });
    return off;
  }, [hub, active]);

  return floor;
}
