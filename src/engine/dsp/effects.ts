import type { FxCharacter, FxParams } from '@shared/params';
import { Biquad, biquadCoeffs, IDENTITY_COEFFS } from './biquad';
import { TWO_PI } from './math';

/** Delay line with fractional read for the chorus and the echo. */
class DelayLine {
  private readonly buf: Float32Array;
  private pos = 0;

  constructor(maxSamples: number) {
    this.buf = new Float32Array(Math.max(2, Math.ceil(maxSamples) + 2));
  }

  write(x: number): void {
    this.buf[this.pos] = x;
    this.pos = (this.pos + 1) % this.buf.length;
  }

  /** Reads `delay` samples behind the most recent write (linear interpolation). */
  read(delay: number): number {
    const len = this.buf.length;
    let p = this.pos - 1 - delay;
    while (p < 0) p += len;
    const i0 = Math.floor(p);
    const frac = p - i0;
    const a = this.buf[i0 % len]!;
    const b = this.buf[(i0 + 1) % len]!;
    return a + (b - a) * frac;
  }
}

// Freeverb tunings (at 44.1 kHz)
const COMB_TUNING = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS_TUNING = [556, 441, 341, 225];

class Comb {
  private readonly buf: Float32Array;
  private pos = 0;
  private store = 0;

  constructor(size: number) {
    this.buf = new Float32Array(size);
  }

  process(x: number, feedback: number, damp: number): number {
    const out = this.buf[this.pos]!;
    this.store = out * (1 - damp) + this.store * damp;
    this.buf[this.pos] = x + this.store * feedback;
    this.pos = (this.pos + 1) % this.buf.length;
    return out;
  }
}

class Allpass {
  private readonly buf: Float32Array;
  private pos = 0;

  constructor(size: number) {
    this.buf = new Float32Array(size);
  }

  process(x: number): number {
    const b = this.buf[this.pos]!;
    this.buf[this.pos] = x + b * 0.5;
    this.pos = (this.pos + 1) % this.buf.length;
    return b - x;
  }
}

class Reverb {
  private readonly combs: Comb[];
  private readonly allpasses: Allpass[];
  private feedback = 0.8;
  private damp = 0.3;

  constructor(sampleRate: number) {
    const scale = sampleRate / 44100;
    this.combs = COMB_TUNING.map((t) => new Comb(Math.round(t * scale)));
    this.allpasses = ALLPASS_TUNING.map((t) => new Allpass(Math.round(t * scale)));
  }

  /** `room` 0..1 sets the tail length. */
  setRoom(room: number): void {
    this.feedback = 0.7 + 0.28 * Math.min(1, Math.max(0, room));
    this.damp = 0.35;
  }

  process(x: number): number {
    const input = x * 0.015;
    let sum = 0;
    for (const c of this.combs) sum += c.process(input, this.feedback, this.damp);
    for (const a of this.allpasses) sum = a.process(sum);
    return sum;
  }
}

class Chorus {
  private readonly line: DelayLine;
  private phase = 0;
  private readonly inc: number;

  constructor(private readonly sampleRate: number) {
    this.line = new DelayLine(sampleRate * 0.05);
    this.inc = (TWO_PI * 0.8) / sampleRate;
  }

  process(x: number): number {
    this.line.write(x);
    const base = this.sampleRate * 0.018;
    const depth = this.sampleRate * 0.004;
    const a = this.line.read(base + Math.sin(this.phase) * depth);
    const b = this.line.read(base + Math.sin(this.phase + 2.1) * depth * 0.8);
    this.phase += this.inc;
    if (this.phase > TWO_PI) this.phase -= TWO_PI;
    return (a + b) * 0.5;
  }
}

class Echo {
  private readonly line: DelayLine;
  private readonly delay: number;
  private store = 0;

  constructor(sampleRate: number) {
    this.delay = Math.round(sampleRate * 0.28);
    this.line = new DelayLine(this.delay + 4);
  }

  process(x: number): number {
    const d = this.line.read(this.delay - 1);
    this.store = d * 0.6 + this.store * 0.4; // darker repeats
    this.line.write(x + this.store * 0.38);
    return d;
  }
}

/** Voicing for the "character" cards: band limits, drive and a little static. */
interface CharacterVoicing {
  highpass: number;
  lowpass: number;
  drive: number;
  noise: number;
}

const VOICINGS: Record<Exclude<FxCharacter, 'none' | 'cave'>, CharacterVoicing> = {
  radio: { highpass: 450, lowpass: 3400, drive: 1.6, noise: 0 },
  megaphone: { highpass: 600, lowpass: 3000, drive: 3.4, noise: 0 },
  walkie: { highpass: 380, lowpass: 2800, drive: 2.2, noise: 0.006 },
};

/**
 * The "Effects" stage: a character filter (radio, megaphone, walkie-talkie, cave) followed by
 * reverb, echo and chorus. Everything is mono and runs at the context sample rate.
 */
export class Effects {
  private params: FxParams = { on: false, character: 'none', reverb: 0, echo: 0, chorus: 0 };
  private readonly reverb: Reverb;
  private readonly echo: Echo;
  private readonly chorus: Chorus;
  private readonly hp = new Biquad();
  private readonly lp = [new Biquad(), new Biquad()] as const;
  private voicing: CharacterVoicing | null = null;
  private rng = 22222;
  private noiseLp = 0;

  constructor(private readonly sampleRate: number) {
    this.reverb = new Reverb(sampleRate);
    this.echo = new Echo(sampleRate);
    this.chorus = new Chorus(sampleRate);
  }

  set(p: FxParams): void {
    this.params = p;
    this.voicing = p.character === 'none' || p.character === 'cave' ? null : VOICINGS[p.character];
    if (this.voicing) {
      this.hp.set(biquadCoeffs('highpass', this.sampleRate, this.voicing.highpass, 0.7));
      this.lp[0].set(biquadCoeffs('lowpass', this.sampleRate, this.voicing.lowpass, 0.7));
      this.lp[1].set(biquadCoeffs('lowpass', this.sampleRate, this.voicing.lowpass, 0.7));
    } else {
      this.hp.set(IDENTITY_COEFFS);
      this.lp[0].set(IDENTITY_COEFFS);
      this.lp[1].set(IDENTITY_COEFFS);
    }
    // the cave is simply a very large room
    this.reverb.setRoom(p.character === 'cave' ? 1 : 0.55);
  }

  process(x: number): number {
    const p = this.params;
    let y = x;

    const v = this.voicing;
    if (v) {
      y = this.lp[1].process(this.lp[0].process(this.hp.process(y)));
      // soft clipping gives the band-limited voice its crunch; compensate the drive
      y = Math.tanh(y * v.drive) / Math.tanh(v.drive);
      if (v.noise > 0) {
        this.rng = (this.rng * 1664525 + 1013904223) >>> 0;
        const white = this.rng / 2147483648 - 1;
        this.noiseLp += 0.25 * (white - this.noiseLp);
        y += this.noiseLp * v.noise * 4;
      }
    }

    const reverbAmount = p.character === 'cave' ? Math.max(p.reverb, 70) : p.reverb;
    const wetReverb = reverbAmount / 100;
    const wetEcho = p.echo / 100;
    const wetChorus = p.chorus / 100;

    let out = y;
    if (wetChorus > 0) out = out * (1 - 0.5 * wetChorus) + this.chorus.process(y) * wetChorus;
    if (wetEcho > 0) out += this.echo.process(out) * wetEcho * 0.8;
    else this.echo.process(0);
    if (wetReverb > 0) out += this.reverb.process(out) * wetReverb * 2.2;
    return out;
  }
}
