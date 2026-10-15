import { join } from 'node:path';
import { app, type BrowserWindow } from 'electron';

/** Every file-system / URL location the main process needs, in one place. */
export const paths = {
  /** compiled preload script (electron-vite output) */
  preload: (name: 'studio' | 'quick'): string => join(__dirname, '../preload', `${name}.js`),
  /** the single-file AudioWorklet bundle built by scripts/build-worklet.mjs */
  worklet: (): string => join(__dirname, '../worklet/processor.js'),
  /** built renderer pages (also served to the phone remote) */
  rendererDir: (): string => join(__dirname, '../renderer'),
  /** the app icon used for windows and the tray */
  icon: (): string => join(app.getAppPath(), 'build', 'icon.png'),
};

export type RendererPage = 'studio' | 'quick' | 'icon' | 'splash';

/** Loads one of the renderer pages (dev server in development, packaged file otherwise). */
export function loadRenderer(
  win: BrowserWindow,
  page: RendererPage,
  query: Record<string, string> = {},
): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) {
    const search = new URLSearchParams(query).toString();
    return win.loadURL(`${devUrl}/${page}.html${search ? `?${search}` : ''}`);
  }
  return win.loadFile(join(__dirname, '../renderer', `${page}.html`), { query });
}
