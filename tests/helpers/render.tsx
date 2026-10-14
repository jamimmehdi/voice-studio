import type { ReactElement } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import type { StudioApi } from '@shared/ipc';
import { RuntimeProvider } from '@renderer/studio/runtime/react';
import type { Runtime } from '@renderer/studio/runtime/runtime';
import type { StoreSeed } from '@renderer/studio/store/studio-store';
import { createHarness, type Harness } from './fakes';

export interface RuntimeRender extends RenderResult, Harness {
  runtime: Runtime;
}

/** Renders `ui` inside a RuntimeProvider backed by fakes. */
export function renderWithRuntime(
  ui: ReactElement,
  seed: StoreSeed = {},
  apiOver: Partial<StudioApi> = {},
): RuntimeRender {
  const h = createHarness(seed, apiOver);
  const runtime = {
    store: h.store,
    engine: h.engine.asEngine(),
    player: h.player,
    hub: h.hub,
    controller: h.controller,
    api: h.api,
    dispose: () => undefined,
  } as unknown as Runtime;
  const result = render(<RuntimeProvider runtime={runtime}>{ui}</RuntimeProvider>);
  return { ...result, ...h, runtime };
}

/** jsdom has no layout: give an element a fixed on-screen rectangle for pointer maths. */
export function mockRect(
  el: Element,
  rect: { left?: number; top?: number; width: number; height: number },
): void {
  const { left = 0, top = 0, width, height } = rect;
  el.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;
}
