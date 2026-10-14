import type { LimiterParams } from '@shared/params';
import { dbToLin, linToDb, smoothingCoef } from './math';

/**
 * Look-ahead brick-wall limiter.
 *
 * The required gain per sample is reduced to a running minimum over the look-ahead window and then
 * averaged over the same window: the average can never exceed the true minimum, which guarantees
 * the delayed signal stays under the ceiling while the gain still ramps smoothly.
 */
export class Limiter {
  gainReductionDb = 0;

  /** Look-ahead / latency in samples (2 ms). */
  readonly lookahead: number;

  private readonly window: number;
  private readonly delay: Float32Array;
  private readonly envHist: Float32Array;
  private readonly dqVal: Float64Array;
  private readonly dqIdx: Float64Array;
  private dqHead = 0;
  private dqLen = 0;
  private pos = 0;
  private n = 0;
  private env = 1;
  private sum: number;
  private ceiling = dbToLin(-1);
  private releaseCoef = 0;

  constructor(private readonly sampleRate: number, params?: LimiterParams) {
    this.lookahead = Math.max(8, Math.round(0.002 * sampleRate));
    this.window = this.lookahead + 1;
    this.delay = new Float32Array(this.window);
    this.envHist = new Float32Array(this.window).fill(1);
    this.dqVal = new Float64Array(this.window + 1);
    this.dqIdx = new Float64Array(this.window + 1);
    this.sum = this.window;
    this.set(params ?? { on: true, ceiling: -1, release: 80 });
  }

  /** Actual delay of the output relative to the input, in samples. */
  get latency(): number {
    return this.window;
  }

  set(p: Pick<LimiterParams, 'ceiling' | 'release'>): void {
    this.ceiling = dbToLin(p.ceiling);
    this.releaseCoef = smoothingCoef(p.release, this.sampleRate);
  }

  process(x: number): number {
    const W = this.window;
    const cap = W + 1;
    const a = Math.abs(x);
    const need = a > this.ceiling ? this.ceiling / a : 1;

    // monotonic deque -> running minimum of the last W gain requirements
    let len = this.dqLen;
    while (len > 0) {
      const last = (this.dqHead + len - 1) % cap;
      if (this.dqVal[last]! >= need) len--;
      else break;
    }
    const tail = (this.dqHead + len) % cap;
    this.dqVal[tail] = need;
    this.dqIdx[tail] = this.n;
    len++;
    while (len > 0 && this.dqIdx[this.dqHead]! <= this.n - W) {
      this.dqHead = (this.dqHead + 1) % cap;
      len--;
    }
    this.dqLen = len;
    const target = this.dqVal[this.dqHead]!;
    this.n++;

    // attack is instantaneous on the minimum, release is smoothed
    this.env = target < this.env ? target : target + this.releaseCoef * (this.env - target);

    // moving average over the window
    this.sum += this.env - this.envHist[this.pos]!;
    this.envHist[this.pos] = this.env;
    const g = this.sum / W;

    const delayed = this.delay[this.pos]!;
    this.delay[this.pos] = x;
    this.pos = (this.pos + 1) % W;
    this.gainReductionDb = linToDb(g);
    return delayed * g;
  }
}
