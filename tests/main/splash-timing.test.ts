import { MIN_SPLASH_MS, remainingSplashTime, SPLASH_FADE_MS } from '@main/splash-timing';

describe('splash timing', () => {
  it('keeps the splash up for the full minimum when the app is ready immediately', () => {
    expect(remainingSplashTime(1000, 1000)).toBe(MIN_SPLASH_MS);
  });

  it('only waits for the part of the minimum that is still missing', () => {
    expect(remainingSplashTime(1000, 1000 + MIN_SPLASH_MS - 500)).toBe(500);
  });

  it('does not delay at all when the app took longer than the minimum', () => {
    expect(remainingSplashTime(0, MIN_SPLASH_MS + 5000)).toBe(0);
  });

  it('honours a custom minimum', () => {
    expect(remainingSplashTime(0, 100, 1000)).toBe(900);
  });

  it('has a short, fixed fade that matches the stylesheet', () => {
    expect(SPLASH_FADE_MS).toBe(380);
  });
});
