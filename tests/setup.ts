import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom does not implement these; the app guards for them, but silence the "not implemented" noise.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as unknown as HTMLCanvasElement['getContext'];
}
if (typeof Element !== 'undefined') {
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture ?? (() => undefined);
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture ?? (() => undefined);
}

afterEach(() => {
  cleanup();
});
