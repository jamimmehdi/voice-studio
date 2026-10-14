import { TWO_PI } from './math';

/** In-place radix-2 FFT. `inverse()` is scaled by 1/N so inverse(forward(x)) === x. */
export class FFT {
  readonly size: number;
  private readonly levels: number;
  private readonly cos: Float64Array;
  private readonly sin: Float64Array;
  private readonly rev: Uint32Array;

  constructor(size: number) {
    if (size < 2 || (size & (size - 1)) !== 0)
      throw new RangeError(`FFT size must be a power of two, got ${size}`);
    this.size = size;
    this.levels = Math.round(Math.log2(size));
    this.cos = new Float64Array(size / 2);
    this.sin = new Float64Array(size / 2);
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((TWO_PI * i) / size);
      this.sin[i] = Math.sin((TWO_PI * i) / size);
    }
    this.rev = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let r = 0;
      for (let b = 0; b < this.levels; b++) r |= ((i >>> b) & 1) << (this.levels - 1 - b);
      this.rev[i] = r;
    }
  }

  private transform(re: Float64Array, im: Float64Array, sign: 1 | -1): void {
    const n = this.size;
    const rev = this.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i]!;
      if (j > i) {
        let t = re[i]!;
        re[i] = re[j]!;
        re[j] = t;
        t = im[i]!;
        im[i] = im[j]!;
        im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half;
          const wr = this.cos[k]!;
          const wi = sign * this.sin[k]!;
          const tr = re[l]! * wr - im[l]! * wi;
          const ti = re[l]! * wi + im[l]! * wr;
          re[l] = re[j]! - tr;
          im[l] = im[j]! - ti;
          re[j] = re[j]! + tr;
          im[j] = im[j]! + ti;
        }
      }
    }
  }

  forward(re: Float64Array, im: Float64Array): void {
    this.transform(re, im, -1);
  }

  inverse(re: Float64Array, im: Float64Array): void {
    this.transform(re, im, 1);
    const s = 1 / this.size;
    for (let i = 0; i < this.size; i++) {
      re[i] = re[i]! * s;
      im[i] = im[i]! * s;
    }
  }
}
