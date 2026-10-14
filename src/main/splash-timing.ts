/** The splash is shown at least this long so its animation can play out. */
export const MIN_SPLASH_MS = 2200;
/** Length of the fade-out (must match the CSS transition in splash.css). */
export const SPLASH_FADE_MS = 380;

/**
 * How much longer the splash must stay up.
 * @param shownAt     timestamp (ms) when the splash became visible
 * @param now         current timestamp (ms)
 * @param minVisible  minimum time on screen
 */
export function remainingSplashTime(shownAt: number, now: number, minVisible = MIN_SPLASH_MS): number {
  return Math.max(0, minVisible - (now - shownAt));
}
