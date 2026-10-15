// Captures the README / landing-page screenshots from the BUILT app (run `npm run build` first).
// A fake capture device feeds the engine a test tone so the meters are alive.
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright-core';

const outDir = join(process.cwd(), 'docs', 'assets', 'shots');
mkdirSync(outDir, { recursive: true });
const userData = mkdtempSync(join(tmpdir(), 'voice-studio-shots-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const app = await electron.launch({
  args: [
    '.',
    `--user-data-dir=${userData}`,
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
  ],
  cwd: process.cwd(),
});

const windowMatching = async (part, timeout = 20_000) => {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const found = app.windows().find((w) => w.url().includes(part));
    if (found) return found;
    await sleep(50);
  }
  throw new Error('no window matching ' + part);
};
const shot = async (page, name) => {
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  console.log('saved', name);
};

try {
  const splash = await windowMatching('splash.html', 5_000).catch(() => null);
  if (splash) {
    await sleep(1500);
    await shot(splash, 'splash');
  }
  const studio = await windowMatching('studio.html');
  await studio.waitForSelector('[aria-label="Signal chain"]', { timeout: 20_000 });
  await sleep(3500);

  await studio.getByRole('button', { name: /Start engine/ }).click();
  await sleep(2500);
  await studio.getByRole('button', { name: /Female/ }).first().click().catch(() => undefined);
  await sleep(800);
  await shot(studio, 'studio-voice');

  for (const [stage, name] of [
    ['eq', 'studio-eq'],
    ['comp', 'studio-compressor'],
    ['exp', 'studio-gate'],
  ]) {
    await studio.locator(`[data-stage="${stage}"]`).click();
    await sleep(900);
    await shot(studio, name);
  }

  await studio.locator('[data-stage="voice"]').click();
  await studio.getByRole('switch', { name: 'Show music player' }).click();
  await sleep(800);
  await shot(studio, 'studio-music');
  await studio.getByRole('switch', { name: 'Show music player' }).click();

  for (const [button, dialog, name] of [
    ['About Voice Studio', 'About Voice Studio', 'about'],
  ]) {
    await studio.getByRole('button', { name: button }).click();
    await sleep(500);
    await shot(studio, name);
    await studio.keyboard.press('Escape');
    void dialog;
  }

  await studio.evaluate(() => window.studio.openCompact());
  const quick = await windowMatching('quick.html');
  await sleep(1200);
  await shot(quick, 'compact');
  await quick.getByRole('button', { name: 'Shrink to a floating icon' }).click();
  const icon = await windowMatching('icon.html');
  await sleep(800);
  await shot(icon, 'icon');
} finally {
  await app.close();
}
