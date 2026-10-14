import type { QuickApi, StudioApi } from '@shared/ipc';

declare global {
  interface Window {
    /** exposed by src/preload/studio.ts */
    studio: StudioApi;
    /** exposed by src/preload/quick.ts */
    quick: QuickApi;
  }
}

export {};
