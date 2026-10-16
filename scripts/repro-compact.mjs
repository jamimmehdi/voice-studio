// Reproduces: compact <-> studio switching, minimising, reopening from the floating icon.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright-core';

const userData = mkdtempSync(join(tmpdir(), 'voice-studio-repro-'));
const app = await electron.launch({ args: ['.', `--user-data-dir=${userData}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'], cwd: process.cwd() });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const state = () =>
  app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((w) => ({
      url: w.webContents.getURL().split('/').pop(),
      visible: w.isVisible(),
      min: w.isMinimized(),
      bounds: w.getBounds(),
      crashed: w.webContents.isCrashed(),
    })),
  );
const win = async (part) => {
  for (let i = 0; i < 100; i++) {
    const f = app.windows().find((w) => w.url().includes(part));
    if (f) return f;
    await sleep(100);
  }
  throw new Error('no ' + part);
};
try {
  const studio = await win('studio.html');
  await studio.waitForSelector('[aria-label="Signal chain"]', { timeout: 20000 });
  await sleep(3000);
  await studio.evaluate(() => document.querySelector('button[title="Start / stop the audio engine"]').click());
  await sleep(2500);
  const ping = async (label) => {
    const ok = await Promise.race([
      studio.evaluate(() => document.querySelector('button[title="Start / stop the audio engine"]').getAttribute('aria-pressed')).then((v) => v),
      sleep(3000).then(() => false),
    ]);
    const pressed = () => studio.evaluate(() => document.querySelector('button[title="Start / stop the audio engine"]').getAttribute('aria-pressed'));
    const before = await pressed().catch(() => '?');
    const anyCmd = await win('quick.html').catch(() => null);
    if (anyCmd) await anyCmd.evaluate(() => window.quick.send({ type: 'toggleEngine' }));
    await sleep(2500);
    const after = await pressed().catch(() => '?');
    if (anyCmd) await anyCmd.evaluate(() => window.quick.send({ type: 'toggleEngine' }));
    await sleep(2500);
    console.log('   toggle', before, '->', after, '->', await pressed().catch(() => '?'));
    console.log(label, ok ? 'studio responsive running=' + ok : 'STUDIO FROZEN', JSON.stringify(await state()));
  };
  const cmd = async (part, c) => {
    const w = await win(part);
    await w.evaluate((x) => window.quick.send(x), c);
    await sleep(700);
  };
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('studio.html'))?.maximize());
  await sleep(800);
  for (let round = 1; round <= 2; round++) {
    await studio.evaluate(() => window.studio.openCompact());
    await sleep(900);
    await ping(`round ${round} compact open`);
    await cmd('quick.html', { type: 'openStudio' });
    await ping(`round ${round} back to studio`);
  }
  // the studio is minimised (goes to the tray) while the compact panel is open
  await studio.evaluate(() => window.studio.openCompact());
  await sleep(900);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.webContents.getURL().includes('studio.html'))
      ?.minimize(),
  );
  await sleep(900);
  await ping('studio minimised');
  await cmd('quick.html', { type: 'minimizeToIcon' });
  await ping('icon shown');
  await cmd('icon.html', { type: 'openCompact' });
  await ping('panel from icon');
  await cmd('quick.html', { type: 'openStudio' });
  await ping('studio from panel');
} finally {
  await app.close().catch(() => {});
  rmSync(userData, { recursive: true, force: true });
}
