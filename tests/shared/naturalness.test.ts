import { assessNaturalness, NATURAL_RATIO } from '@shared/naturalness';
import { createDefaultParams, type StudioParams } from '@shared/params';
import { applyBuiltinPreset, BUILTIN_PRESET_NAMES } from '@shared/presets';

const voice = (patch: Partial<StudioParams['voice']>): Pick<StudioParams, 'voice'> => ({
  voice: { ...createDefaultParams().voice, on: true, ...patch },
});

describe('assessNaturalness', () => {
  it('an untouched voice is perfectly natural', () => {
    const n = assessNaturalness(voice({ pitch: 0, formant: 0 }));
    expect(n).toMatchObject({ score: 100, verdict: 'natural', offDiagonal: 0 });
  });

  it('a switched-off voice stage is also natural', () => {
    expect(assessNaturalness(voice({ on: false, pitch: 9, formant: -9 })).score).toBe(100);
  });

  it('the built-in natural voices all score as natural', () => {
    const natural = ['Female – Natural', 'Female – Soft / Warm', 'Male – Deep', 'Male – Strong / Very Manly'];
    for (const name of natural) {
      const p = applyBuiltinPreset(createDefaultParams(), name)!;
      const n = assessNaturalness(p);
      expect(n.verdict, name).toBe('natural');
      expect(n.score, name).toBeGreaterThanOrEqual(80);
    }
  });

  it('every built-in voice gets a score in range with a sentence of advice', () => {
    for (const name of BUILTIN_PRESET_NAMES) {
      const n = assessNaturalness(applyBuiltinPreset(createDefaultParams(), name)!);
      expect(n.score).toBeGreaterThanOrEqual(0);
      expect(n.score).toBeLessThanOrEqual(100);
      expect(n.advice.length).toBeGreaterThan(5);
    }
  });

  it('moving the formant off the diagonal lowers the score and says which way to go', () => {
    const on = assessNaturalness(voice({ pitch: 5, formant: 5 * NATURAL_RATIO }));
    const high = assessNaturalness(voice({ pitch: 5, formant: 8 }));
    const low = assessNaturalness(voice({ pitch: 5, formant: -2 }));
    expect(high.score).toBeLessThan(on.score);
    expect(low.score).toBeLessThan(on.score);
    expect(high.advice).toMatch(/high/i);
    expect(low.advice).toMatch(/low/i);
    expect(high.offDiagonal).toBeGreaterThan(0);
    expect(low.offDiagonal).toBeLessThan(0);
    expect(high.advice).toContain('+3.1');
  });

  it('very large shifts are never rated natural, even on the diagonal', () => {
    const n = assessNaturalness(voice({ pitch: 11, formant: 11 * NATURAL_RATIO }));
    expect(n.score).toBeLessThan(80);
    expect(n.advice).toMatch(/smaller/i);
  });

  it('robot voice is rated robotic and says so', () => {
    const n = assessNaturalness(voice({ pitch: -2, formant: 0, robot: true }));
    expect(n.verdict).toBe('robotic');
    expect(n.advice).toMatch(/robot/i);
  });

  it('the fast voice model and a partial mix cost a little', () => {
    const base = assessNaturalness(voice({ pitch: 4, formant: 2.5 })).score;
    expect(assessNaturalness(voice({ pitch: 4, formant: 2.5, quality: 512 })).score).toBeLessThan(base);
    expect(assessNaturalness(voice({ pitch: 4, formant: 2.5, mix: 50 })).score).toBeLessThan(base);
  });

  it('is always an integer between 0 and 100', () => {
    for (let pitch = -12; pitch <= 12; pitch += 3) {
      for (let formant = -12; formant <= 12; formant += 4) {
        const { score } = assessNaturalness(voice({ pitch, formant }));
        expect(Number.isInteger(score)).toBe(true);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(100);
      }
    }
  });
});
